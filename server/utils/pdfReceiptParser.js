const zlib = require('zlib');
const { resolveCanonicalCategory } = require('./ingredientNormalizer');

/**
 * Detects whether a base64 data URL or raw base64 string is a PDF document,
 * even when mobile browsers/WebViews label it as application/octet-stream.
 */
function detectReceiptMimeType(dataUrlOrBase64) {
    if (!dataUrlOrBase64 || typeof dataUrlOrBase64 !== 'string') {
        return { mimeType: 'image/jpeg', base64Data: '' };
    }
    const commaIdx = dataUrlOrBase64.indexOf(',');
    const header = commaIdx >= 0 ? dataUrlOrBase64.slice(0, commaIdx) : '';
    const base64Data = commaIdx >= 0 ? dataUrlOrBase64.slice(commaIdx + 1).trim() : dataUrlOrBase64.trim();

    const mimeMatch = header.match(/^data:([a-zA-Z0-9.+/-]*);base64$/i);
    let mimeType = mimeMatch && mimeMatch[1] ? mimeMatch[1].toLowerCase() : 'image/jpeg';

    // %PDF- in base64 always starts with "JVBERi0"
    if (base64Data.startsWith('JVBERi0') || mimeType.includes('pdf')) {
        mimeType = 'application/pdf';
    } else if (mimeType === 'application/octet-stream' || !mimeType) {
        mimeType = 'image/jpeg';
    }

    return { mimeType, base64Data };
}

/**
 * Pure Node.js PDF text extractor that inflates FlateDecode streams and decodes
 * embedded /ToUnicode CMap tables (used by Dillons / Kroger / Instacart PDF invoices).
 */
function extractTextFromPdfBuffer(pdfBuffer) {
    if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length < 16) return '';
    const rawLatin1 = pdfBuffer.toString('latin1');

    // 1. Decompress all FlateDecode streams
    const streams = [];
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match;
    while ((match = streamRegex.exec(rawLatin1)) !== null) {
        try {
            const inflated = zlib.inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1');
            streams.push(inflated);
        } catch {
            // Ignore non-FlateDecode or image streams
        }
    }

    if (streams.length === 0) return '';

    // 2. Parse all /ToUnicode CMap streams in order
    // Keep primary ASCII mappings intact while allowing ligatures (e.g. \uFB02 -> 'fl')
    const cmaps = [];
    for (const s of streams) {
        if (!s.includes('begincmap')) continue;
        const map = new Map();
        const bfcharRegex = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
        const bfrangeRegex = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;

        for (const section of s.split('endbfchar')) {
            if (!section.includes('beginbfchar')) continue;
            const body = section.split('beginbfchar')[1];
            let cm;
            while ((cm = bfcharRegex.exec(body)) !== null) {
                const cid = parseInt(cm[1], 16);
                const cp = parseInt(cm[2], 16);
                let ch = String.fromCodePoint(cp);
                if (cp === 0xfb01) ch = 'fi';
                else if (cp === 0xfb02) ch = 'fl';
                else if (cp === 0x00a0) ch = ' ';
                map.set(cid, ch);
            }
        }

        for (const section of s.split('endbfrange')) {
            if (!section.includes('beginbfrange')) continue;
            const body = section.split('beginbfrange')[1];
            let cm;
            while ((cm = bfrangeRegex.exec(body)) !== null) {
                const start = parseInt(cm[1], 16);
                const end = parseInt(cm[2], 16);
                const baseCp = parseInt(cm[3], 16);
                for (let k = start; k <= end; k++) {
                    map.set(k, String.fromCodePoint(baseCp + (k - start)));
                }
            }
        }

        if (map.size > 0) cmaps.push(map);
    }

    // Build merged lookup map (preferring standard ASCII printable chars over single-glyph ligature overrides)
    const mergedMap = new Map();
    for (const cmap of cmaps) {
        for (const [cid, ch] of cmap.entries()) {
            const existing = mergedMap.get(cid);
            if (!existing) {
                mergedMap.set(cid, ch);
            } else {
                // Only override if existing is not a standard printable ASCII char
                const code = existing.charCodeAt(0);
                if (code < 0x20 || code > 0x7e) {
                    mergedMap.set(cid, ch);
                }
            }
        }
    }

    // 3. Extract text blocks (BT ... ET) across all page content streams
    const lines = [];
    for (const s of streams) {
        if (!s.includes('BT') || (!s.includes('Tj') && !s.includes('TJ'))) continue;

        const blocks = s.split('BT').slice(1);
        for (const blk of blocks) {
            const body = blk.split('ET')[0];
            let currentFont = '';
            let lineText = '';

            // Match font switches (/F9 12 Tf), hex <XX> Tj, or literal (text) Tj in order
            const tokenRegex = /\/(F\d+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f]+)>\s*Tj|\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*Tj/g;
            let tm;
            while ((tm = tokenRegex.exec(body)) !== null) {
                if (tm[1] !== undefined) {
                    currentFont = tm[1];
                } else if (tm[2] !== undefined) {
                    const hex = tm[2];
                    for (let i = 0; i < hex.length; i += 2) {
                        const cid = parseInt(hex.slice(i, i + 2), 16);
                        // In Dillons/Kroger PDFs, secondary font (/F7, /F8, /F9) maps 0x32 to 'fl' ligature
                        if (cid === 0x32 && currentFont && currentFont !== 'F4' && currentFont !== 'F5') {
                            lineText += 'fl';
                        } else {
                            lineText += mergedMap.get(cid) ?? '';
                        }
                    }
                } else if (tm[3] !== undefined) {
                    lineText += tm[3];
                }
            }

            const cleaned = lineText.replace(/\s+/g, ' ').trim();
            if (cleaned) {
                lines.push(cleaned);
            }
        }
    }

    return lines.join('\n');
}

/**
 * Cleans a raw store brand/invoice product line into a clean grocery item name
 * and extracts package/weight size when present.
 */
function cleanInvoiceProductTitle(rawTitle, qtyMultiplier = 1) {
    let title = String(rawTitle || '')
        .replace(/[®™©]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    // Extract trailing size after last comma, e.g.:
    // "Broccoli Crown, 1 ct"
    // "Tyson All Natural Fresh Boneless Skinless Chicken Thighs, 1.9 lb"
    // "Kroger 80/20 Ground Beef Roll 3 LB (Limit 2 at sale price), 3 lb"
    // "Kroger Grade AA Large White Eggs, 18 ct"
    // "Kroger 1% Lowfat Milk Half Gallon, 1/2 gal"
    let extractedSize = '';
    const lastCommaIdx = title.lastIndexOf(',');
    if (lastCommaIdx > 0) {
        const afterComma = title.slice(lastCommaIdx + 1).trim();
        if (/^(?:\d+(?:\.\d+|\/\d+)?\s*(?:ct|count|lb|lbs|oz|fl\s*oz|gal|gallon|pkg|pk|bunch|bag|box)\b|\d+\s*(?:pk|ct)\s*\/)/i.test(afterComma)) {
            extractedSize = afterComma;
            title = title.slice(0, lastCommaIdx).trim();
        }
    }

    // Remove secondary trailing descriptors like ", Bag" or ", Soft Taco Size, 10 Count"
    title = title
        .replace(/\s*\(Limit[^)]*\)/gi, '')
        .replace(/\s*-\s*Available\s+\d+\s*[ap]m\s*-\s*\d+\s*[ap]m/gi, '')
        .replace(/\s*[–-]\s*\d+-\d+\s+Bananas/gi, '')
        .replace(/,\s*(?:Bag|Box|Can|Jar|Bottle|Soft Taco Size|Ready to Bake Cookie Dough)$/i, '')
        .trim();

    // Strip common store/manufacturer brand prefixes while preserving key product identity
    const brandPrefixes = [
        /^Kroger\s+/i,
        /^Private Selection\s+(?:Classic Seasoned\s+)?/i,
        /^Birds Eye\s+(?:Steamfresh\s+)?/i,
        /^Campbell's\s+/i,
        /^General Mills\s+/i,
        /^Hillshire Farm\s+/i,
        /^International Delight\s+/i,
        /^Jet-Puffed\s+/i,
        /^Kikkoman\s+/i,
        /^KING'S HAWAIIAN\s+(?:Original\s+)?/i,
        /^Kraft\s+/i,
        /^Mezzetta\s+(?:Family Recipes\s+)?/i,
        /^Mission\s+(?:Super Soft\s+)?/i,
        /^Nestle Toll House\s+/i,
        /^Pepperidge Farm\s+/i,
        /^Tyson\s+(?:All Natural\s+)?(?:Fresh\s+)?/i,
        /^Drizzilicious\s+/i
    ];

    for (const rx of brandPrefixes) {
        if (rx.test(title)) {
            const stripped = title.replace(rx, '').trim();
            if (stripped.length >= 3) {
                title = stripped;
                break;
            }
        }
    }

    // Clean up redundant suffixes in product titles
    title = title
        .replace(/\bReady to Bake Cookie Dough$/i, '')
        .replace(/\bFrozen Pastry Dough Sheets$/i, 'Sheets')
        .replace(/\bGluten Free Breakfast Cereal$/i, 'Cereal')
        .replace(/\bSports Drink Multipack Bottles$/i, 'Sports Drink')
        .replace(/\bTropical Fruit Flavored Snacks$/i, 'Fruit Snacks')
        .replace(/\bJapanese Style Bread Crumbs$/i, 'Bread Crumbs')
        .replace(/\bOriginal Red Pepper Sauce,\s*Hot Sauce$/i, 'Red Pepper Hot Sauce')
        .replace(/\b80\/20 Ground Beef Roll\s+3\s*LB$/i, '80/20 Ground Beef')
        .replace(/\bGrade AA Large White Eggs$/i, 'Large White Eggs')
        .replace(/\bFresh Bunch of Bananas$/i, 'Bananas')
        .replace(/\bFresh Large Green Bell Pepper$/i, 'Green Bell Pepper')
        .replace(/\bRusset Potatoes Bag$/i, 'Russet Potatoes')
        .replace(/\bWhole Roasted Chicken Hot$/i, 'Whole Roasted Chicken')
        .replace(/\bHawaiian Sweet Rolls\s+\d+\s*Count$/i, 'Hawaiian Sweet Rolls')
        .replace(/,\s*\d+\s*Count$/i, '')
        .replace(/\s+/g, ' ')
        .trim();

    // Determine quantity and unit
    let quantity = Number(qtyMultiplier) || 1;
    let unit = 'each';

    if (extractedSize) {
        const sizeLower = extractedSize.toLowerCase().trim();
        const lbMatch = sizeLower.match(/^(\d+(?:\.\d+)?)\s*lbs?\b/);
        const ctMatch = sizeLower.match(/^(\d+)\s*(?:ct|count)\b/);
        const bunchMatch = sizeLower.match(/^(\d+)\s*bunch\b/);
        const halfGalMatch = sizeLower.match(/^1\/2\s*gal\b/);
        const galMatch = sizeLower.match(/^(\d+(?:\.\d+)?)\s*gal\b/);

        if (lbMatch) {
            quantity = Number((quantity * parseFloat(lbMatch[1])).toFixed(2));
            unit = 'lb';
        } else if (bunchMatch) {
            quantity = quantity * parseInt(bunchMatch[1], 10);
            unit = 'bunch';
        } else if (ctMatch) {
            const perPkgCount = parseInt(ctMatch[1], 10);
            // If it's eggs or single produce items ("1 ct", "18 ct"), multiply count
            if (perPkgCount === 1 || /\b(?:eggs?|rolls?|tortillas?)\b/i.test(title)) {
                quantity = quantity * perPkgCount;
                unit = 'each';
            }
        } else if (halfGalMatch) {
            quantity = Number((quantity * 0.5).toFixed(2));
            unit = 'gal';
        } else if (galMatch) {
            quantity = Number((quantity * parseFloat(galMatch[1])).toFixed(2));
            unit = 'gal';
        }
    }

    const category = resolveCanonicalCategory(title, 'Other');

    return {
        name: title,
        quantity,
        unit,
        category
    };
}

/**
 * Deterministically parses a Dillons / Kroger pickup/delivery invoice text block
 * into structured grocery items, including weighted items where Dillons prints "%.3f lbs".
 */
function parseDillonsInvoiceText(extractedText) {
    if (!extractedText || typeof extractedText !== 'string') return [];

    const rawLines = extractedText
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(Boolean);

    // Locate ITEMS PURCHASED section if present
    let startIdx = rawLines.findIndex(l => /^ITEMS\s+PURCHASED/i.test(l));
    if (startIdx < 0) {
        // Fallback: check if this looks like a Dillons/Kroger invoice at all
        const hasQtyPrice = rawLines.some(l => /^\d+\s*[×x]\s*\$\d+\.\d{2}$/i.test(l) || /^%\.3f\s*lbs?$/i.test(l));
        if (!hasQtyPrice) return [];
        startIdx = 0;
    } else {
        startIdx += 1;
    }

    const endIdx = rawLines.findIndex((l, idx) => idx >= startIdx && /^PAYMENT\s+DETAILS/i.test(l));
    const itemLines = rawLines.slice(startIdx, endIdx >= 0 ? endIdx : rawLines.length);

    const parsedItems = [];
    let pendingTitle = null;

    const isIgnoreLine = (line) =>
        /^Item\s+Coupon\/Sale:/i.test(line) ||
        /^Order\s+(?:Type|Date|#):/i.test(line) ||
        /^Store:/i.test(line) ||
        /^Card:/i.test(line) ||
        /^SAVINGS$/i.test(line) ||
        /^ORDER\s+SUMMARY$/i.test(line) ||
        /^(?:Subtotal|Item Coupons & Sales|Fee|Tax|Total|Savings)$/i.test(line) ||
        /^[+-]?\$\d+\.\d{2}$/.test(line) ||
        /^dillons\.com/i.test(line) ||
        /^1-800-/i.test(line);

    for (let i = 0; i < itemLines.length; i++) {
        const line = itemLines[i];
        if (isIgnoreLine(line)) continue;

        const qtyPriceMatch = line.match(/^(\d+)\s*[×x]\s*\$\d+\.\d{2}$/i);
        const weightedBugMatch = /^%\.3f\s*lbs?$/i.test(line) || /^\d+\.\d+\s*lbs?\s*[×x]\s*\$\d+\.\d{2}$/i.test(line);

        if (qtyPriceMatch && pendingTitle) {
            const qty = parseInt(qtyPriceMatch[1], 10) || 1;
            parsedItems.push(cleanInvoiceProductTitle(pendingTitle, qty));
            pendingTitle = null;
        } else if (weightedBugMatch && pendingTitle) {
            parsedItems.push(cleanInvoiceProductTitle(pendingTitle, 1));
            pendingTitle = null;
        } else if (!/^\$/.test(line)) {
            // If there was an unclosed pendingTitle that already had a comma-size suffix, flush it
            if (pendingTitle && /,\s*\d+/.test(pendingTitle)) {
                parsedItems.push(cleanInvoiceProductTitle(pendingTitle, 1));
            }
            pendingTitle = line;
        }
    }

    if (pendingTitle && /,\s*\d+/.test(pendingTitle)) {
        parsedItems.push(cleanInvoiceProductTitle(pendingTitle, 1));
    }

    return parsedItems;
}

module.exports = {
    detectReceiptMimeType,
    extractTextFromPdfBuffer,
    cleanInvoiceProductTitle,
    parseDillonsInvoiceText
};
