/**
 * Zero-LLM Deterministic Schema.org JSON-LD Recipe Compiler (U-03)
 * Compiles structured Recipe JSON-LD nodes into KitchenSync's normalized Recipe schema
 * in <5ms with 0 LLM tokens whenever complete JSON-LD is present on a recipe webpage.
 */
const { normalizeRecipeIngredientsList } = require('./ingredientNormalizer');

const VULGAR_FRACTIONS = {
    '½': ' 1/2',
    '⅓': ' 1/3',
    '⅔': ' 2/3',
    '¼': ' 1/4',
    '¾': ' 3/4',
    '⅕': ' 1/5',
    '⅖': ' 2/5',
    '⅗': ' 3/5',
    '⅘': ' 4/5',
    '⅙': ' 1/6',
    '⅚': ' 5/6',
    '⅛': ' 1/8',
    '⅜': ' 3/8',
    '⅝': ' 5/8',
    '⅞': ' 7/8'
};

const INGREDIENT_LINE_REGEX = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s*(?:-\s*\d+(?:\.\d+)?\s*)?(pounds?|lbs?|ounces?|oz|fluid\s+ounces?|fl\s*oz|cups?|c\.?|tablespoons?|tbsp\.?|tbs\.?|teaspoons?|tsp\.?|grams?|g\.?|kilograms?|kg\.?|milliliters?|ml\.?|liters?|l\.?|quarts?|qt\.?|pints?|pt\.?|gallons?|gal\.?|cans?|jars?|bottles?|boxes?|pkgs?|packages?|packs?|bags?|sheets?|rolls?|buns?|loaves?|loaf|heads?|cloves?|strips?|slices?|pieces?|fillets?|stalks?|bunches?|bunch|ears?|each|ea|large|medium|small|extra-large|jumbo)?\b\.?\s*(?:of\s+)?(.*)$/i;

function parseNumberOrFraction(str) {
    if (typeof str === 'number' && !Number.isNaN(str)) return str;
    const s = String(str || '').trim();
    const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
    if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
    const frac = s.match(/^(\d+)\/(\d+)$/);
    if (frac) return Number(frac[1]) / Number(frac[2]);
    const num = parseFloat(s);
    return !Number.isNaN(num) && num > 0 ? num : 1;
}

function parseRawIngredientLine(rawLine, scaleFactor = 1) {
    let line = String(rawLine || '');
    for (const [char, replacement] of Object.entries(VULGAR_FRACTIONS)) {
        line = line.split(char).join(replacement);
    }
    line = line
        .replace(/&amp;/g, '&')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ')
        .trim();

    if (!line) return null;

    // Strip leading parenthetical package sizes right after quantity if needed, e.g. "1 (10.75 ounce) can condensed tomato soup"
    const canWithSizeMatch = line.match(/^(\d+(?:\s+\d+\/\d+|\/\d+|\.\d+)?)\s*\([^)]+\)\s*(cans?|jars?|pkgs?|packages?|boxes?|bottles?|bags?|sheets?|rolls?)\s+(.*)$/i);
    if (canWithSizeMatch) {
        const qty = parseNumberOrFraction(canWithSizeMatch[1]) * scaleFactor;
        return {
            name: canWithSizeMatch[3].trim(),
            quantity: qty,
            unit: canWithSizeMatch[2].toLowerCase(),
            category: 'Other'
        };
    }

    const match = line.match(INGREDIENT_LINE_REGEX);
    if (!match) {
        return {
            name: line,
            quantity: 1 * scaleFactor,
            unit: 'each',
            category: 'Other'
        };
    }

    const baseQty = parseNumberOrFraction(match[1]);
    const rawUnit = (match[2] || 'each').trim();
    const rawName = (match[3] || line).trim();

    return {
        name: rawName || line,
        quantity: baseQty * scaleFactor,
        unit: rawUnit,
        category: 'Other'
    };
}

function parseIsoDuration(isoStr, fallback) {
    if (!isoStr || typeof isoStr !== 'string') return fallback;
    const match = isoStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?/i);
    if (!match) return fallback;
    const hours = Number(match[1] || 0);
    const mins = Number(match[2] || 0);
    if (hours > 0 && mins > 0) return `${hours} hr ${mins} mins`;
    if (hours > 0) return `${hours} hr${hours > 1 ? 's' : ''}`;
    if (mins > 0) return `${mins} mins`;
    return fallback;
}

function parseServingsCount(yieldVal) {
    if (typeof yieldVal === 'number' && yieldVal > 0) return Math.round(yieldVal);
    if (Array.isArray(yieldVal) && yieldVal.length > 0) {
        return parseServingsCount(yieldVal[0]);
    }
    if (typeof yieldVal === 'string') {
        const m = yieldVal.match(/(\d+)/);
        if (m) return Math.max(1, parseInt(m[1], 10));
    }
    return 4;
}

function parseNutritionNumber(val, fallback) {
    if (typeof val === 'number' && !Number.isNaN(val)) return Math.round(val);
    if (typeof val === 'string') {
        const m = val.match(/(\d+(?:\.\d+)?)/);
        if (m) return Math.round(parseFloat(m[1]));
    }
    return fallback;
}

function extractImageUrl(imageField, fallbackImage) {
    if (!imageField) return fallbackImage || undefined;
    if (typeof imageField === 'string' && imageField.startsWith('http')) return imageField;
    if (Array.isArray(imageField) && imageField.length > 0) {
        return extractImageUrl(imageField[0], fallbackImage);
    }
    if (typeof imageField === 'object' && typeof imageField.url === 'string') {
        return imageField.url;
    }
    return fallbackImage || undefined;
}

function flattenInstructions(rawInstructions) {
    const steps = [];
    const visit = (node) => {
        if (!node) return;
        if (typeof node === 'string') {
            const clean = node
                .replace(/<[^>]+>/g, ' ')
                .replace(/&nbsp;/g, ' ')
                .replace(/&amp;/g, '&')
                .replace(/&#39;|&apos;/g, "'")
                .replace(/&quot;/g, '"')
                .replace(/\s+/g, ' ')
                .trim();
            if (clean) steps.push(clean);
            return;
        }
        if (Array.isArray(node)) {
            node.forEach(visit);
            return;
        }
        if (typeof node === 'object') {
            if (typeof node.text === 'string') {
                visit(node.text);
            } else if (Array.isArray(node.itemListElement)) {
                visit(node.itemListElement);
            }
        }
    };
    visit(rawInstructions);
    return steps
        .map((step, idx) => (/^\d+\./.test(step) ? step : `${idx + 1}. ${step}`))
        .join('\n\n');
}

function resolveMealType(rawCategory) {
    const cat = Array.isArray(rawCategory) ? rawCategory.join(' ').toLowerCase() : String(rawCategory || '').toLowerCase();
    if (cat.includes('dessert') || cat.includes('cake') || cat.includes('cookie') || cat.includes('pie')) return 'Dessert';
    if (cat.includes('side') || cat.includes('salad') || cat.includes('vegetable')) return 'Side Dish';
    if (cat.includes('snack') || cat.includes('appetizer') || cat.includes('dip')) return 'Snack';
    if (cat.includes('prep')) return 'Meal Prep';
    return 'Main Course';
}

function compileRecipeFromJsonLd(recipeJsonLdStr, sourceUrl, fallbackImage, targetFamilySize) {
    if (!recipeJsonLdStr) return null;
    try {
        const node = typeof recipeJsonLdStr === 'string' ? JSON.parse(recipeJsonLdStr) : recipeJsonLdStr;
        if (!node || !node.name || !Array.isArray(node.recipeIngredient) || node.recipeIngredient.length < 2) {
            return null;
        }

        const instructions = flattenInstructions(node.recipeInstructions);
        if (!instructions || instructions.length < 15) {
            return null;
        }

        const baseServings = parseServingsCount(node.recipeYield);
        const finalServings = Number(targetFamilySize || baseServings || 4);
        const scaleFactor = (targetFamilySize && baseServings > 0) ? (finalServings / baseServings) : 1;

        const parsedRawIngredients = node.recipeIngredient
            .map(line => parseRawIngredientLine(line, scaleFactor))
            .filter(Boolean);

        const normalizedIngredients = normalizeRecipeIngredientsList(parsedRawIngredients);
        if (normalizedIngredients.length < 2) {
            return null;
        }

        const nutrition = node.nutrition || {};
        const rawKeywords = Array.isArray(node.keywords)
            ? node.keywords
            : typeof node.keywords === 'string'
                ? node.keywords.split(',').map(s => s.trim()).filter(Boolean)
                : [];

        return {
            name: String(node.name).replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").trim(),
            servings: finalServings,
            prep_time: parseIsoDuration(node.prepTime, '15 mins'),
            cook_time: parseIsoDuration(node.cookTime || node.totalTime, '30 mins'),
            calories: parseNutritionNumber(nutrition.calories, 400),
            protein: parseNutritionNumber(nutrition.proteinContent, 20),
            fat: parseNutritionNumber(nutrition.fatContent, 15),
            carbs: parseNutritionNumber(nutrition.carbohydrateContent, 40),
            ingredients: normalizedIngredients,
            instructions,
            meal_type: resolveMealType(node.recipeCategory),
            tags: rawKeywords.slice(0, 8),
            imageUrl: extractImageUrl(node.image, fallbackImage),
            source: sourceUrl
        };
    } catch (_) {
        return null;
    }
}

module.exports = {
    compileRecipeFromJsonLd,
    parseRawIngredientLine,
    parseIsoDuration
};
