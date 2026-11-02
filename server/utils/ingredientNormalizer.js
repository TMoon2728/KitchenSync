const {
    SIZE_DESCRIPTORS,
    PREP_SUFFIX_PATTERNS,
    LEADING_QTY_UNIT_PREFIX_REGEX,
    getSizePrefixRegex,
    getDupUnitRegex,
    isPlainCookingWater,
    normalizeCanonicalUnit: normalizeUnit,
    toSmartTitleCase,
    resolveCanonicalCategoryCore: resolveCanonicalCategory,
    snapToCleanFractionCore
} = require('../../shared/ingredientNormalizerCore.mjs');

function snapToCleanFraction(value) {
    return snapToCleanFractionCore(value || 1, 1);
}

function parseQuantityNumber(val) {
    if (typeof val === 'number' && !Number.isNaN(val) && val > 0) return val;
    if (typeof val === 'string') {
        const trimmed = val.trim();
        const fracMatch = trimmed.match(/^(\d+)\s+(\d+)\/(\d+)$/);
        if (fracMatch) return Number(fracMatch[1]) + Number(fracMatch[2]) / Number(fracMatch[3]);
        const simpleFrac = trimmed.match(/^(\d+)\/(\d+)$/);
        if (simpleFrac) return Number(simpleFrac[1]) / Number(simpleFrac[2]);
        const num = parseFloat(trimmed.replace(/[^0-9.]/g, ''));
        if (!Number.isNaN(num) && num > 0) return num;
    }
    return 1;
}

function normalizeServerIngredient(rawIng) {
    if (!rawIng) return null;
    if (typeof rawIng === 'string') {
        rawIng = { name: rawIng, quantity: 1, unit: 'each', category: 'Other' };
    }

    const rawName = String(rawIng.name || '').trim();
    if (!rawName || isPlainCookingWater(rawName)) {
        return null;
    }

    let unit = String(rawIng.unit || 'each').trim();
    let cleanedBase = rawName.replace(/\s*\([^)]+\)/g, '');

    for (const pattern of PREP_SUFFIX_PATTERNS) {
        cleanedBase = cleanedBase.replace(pattern, '');
    }

    cleanedBase = cleanedBase
        .replace(LEADING_QTY_UNIT_PREFIX_REGEX, '')
        .replace(/^skinned\s+/i, '');

    const lowerUnit = unit.toLowerCase().trim();
    if (SIZE_DESCRIPTORS.has(lowerUnit)) {
        if (!getSizePrefixRegex(lowerUnit).test(cleanedBase)) {
            cleanedBase = `${lowerUnit} ${cleanedBase}`;
        }
        unit = 'each';
    }

    let normUnit = normalizeUnit(unit);

    // Strip duplicate unit words inside name (e.g. unit="strip", name="bacon strips")
    if (normUnit && normUnit !== 'each') {
        const dupUnitRegex = getDupUnitRegex(normUnit);
        const strippedTry = cleanedBase.replace(dupUnitRegex, '').replace(/\s{2,}/g, ' ').trim();
        if (strippedTry.length >= 3) {
            cleanedBase = strippedTry;
        }
    }

    cleanedBase = cleanedBase.replace(/\s{2,}/g, ' ').replace(/^[,\s-]+|[,\s-]+$/g, '');
    const displayName = toSmartTitleCase(cleanedBase || rawName);
    const category = resolveCanonicalCategory(displayName, rawIng.category);

    let qty = parseQuantityNumber(rawIng.quantity);

    // Mass auto-scaling: >= 16 oz -> lb
    if (normUnit === 'oz' && qty >= 16) {
        qty = qty / 16;
        normUnit = 'lb';
    }

    // Whole-item rounding for discrete items like eggs, cans, sheets, rolls, onions, chickens
    const isWholeItem =
        ['each', 'can', 'sheet', 'roll', 'head', 'clove', 'strip', 'slice', 'pkg', 'box', 'bag', 'jar', 'bottle'].includes(normUnit) ||
        /\b(?:egg|can|sheet|roll|bun|chicken)\b/i.test(displayName);

    if (
        isWholeItem &&
        (['can', 'sheet', 'roll', 'pkg', 'box', 'jar', 'bottle'].includes(normUnit) ||
            /\b(?:egg|can|sheet|roll|bun|chicken)\b/i.test(displayName))
    ) {
        qty = Math.max(1, Math.round(qty));
    } else {
        qty = snapToCleanFraction(qty);
    }

    return {
        name: displayName,
        quantity: qty,
        unit: normUnit,
        category
    };
}

function normalizeRecipeIngredientsList(rawIngredients) {
    if (!Array.isArray(rawIngredients)) return [];
    const mergedMap = new Map();

    for (const raw of rawIngredients) {
        const norm = normalizeServerIngredient(raw);
        if (!norm) continue;

        const key = `${norm.name.toLowerCase()}::${norm.unit}`;
        if (mergedMap.has(key)) {
            const existing = mergedMap.get(key);
            existing.quantity = snapToCleanFraction(existing.quantity + norm.quantity);
        } else {
            mergedMap.set(key, norm);
        }
    }

    return Array.from(mergedMap.values());
}

module.exports = {
    isPlainCookingWater,
    normalizeUnit,
    resolveCanonicalCategory,
    normalizeServerIngredient,
    normalizeRecipeIngredientsList
};
