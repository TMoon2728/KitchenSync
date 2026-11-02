import { normalizeUnit, getUnitType } from './unitConversion';
import { formatQuantity } from './formatters';
import {
    SIZE_DESCRIPTORS,
    DISCRETE_UNITS,
    PREP_SUFFIX_PATTERNS,
    LEADING_PREP_PATTERNS,
    LEADING_QTY_UNIT_PREFIX_REGEX,
    getSizePrefixRegex,
    getDupUnitRegex,
    isPlainCookingWater as isPlainCookingWaterCore,
    toSmartTitleCase,
    singularizeIngredientKey,
    resolveCanonicalCategoryCore,
    snapToCleanFractionCore
} from '../shared/ingredientNormalizerCore.mjs';

export type CanonicalCategory =
    | 'Produce'
    | 'Meat'
    | 'Dairy & Eggs'
    | 'Bakery'
    | 'Frozen'
    | 'Pantry Staples'
    | 'Beverages'
    | 'Household'
    | 'Other';

export interface NormalizedShoppingItem {
    canonicalKey: string;
    name: string;
    quantity: number;
    unit: string;
    category: CanonicalCategory;
    isManual?: boolean;
    id?: number;
}

const MAX_CACHE_SIZE = 2000;
const cleanIngredientCache = new Map<string, { displayName: string; canonicalKey: string; unit: string }>();

/**
 * Checks whether an ingredient is plain tap/cooking water that shouldn't be on a grocery list.
 */
export function isPlainCookingWater(rawName: string): boolean {
    return isPlainCookingWaterCore(rawName);
}

/**
 * Cleans an ingredient name and unit into grocery-store-friendly form.
 */
export function cleanIngredientNameAndUnit(rawName: string, rawUnit: string): {
    displayName: string;
    canonicalKey: string;
    unit: string;
} {
    let name = (rawName || '').trim();
    let unit = (rawUnit || '').trim();

    const cacheKey = `${name}::${unit}`;
    const cached = cleanIngredientCache.get(cacheKey);
    if (cached) return cached;

    // Strip parenthetical notes (e.g. "(10-3/4 ounces)", "(divided)", "(optional)")
    const nameWithoutParens = name.replace(/\s*\([^)]+\)/g, '');

    // Strip comma-separated prep suffixes (", chopped", ", beaten", ", undiluted", etc.)
    let cleanedBase = nameWithoutParens;
    for (const pattern of PREP_SUFFIX_PATTERNS) {
        cleanedBase = cleanedBase.replace(pattern, '');
    }

    // Strip leading prep words like "skinned " or accidental leading quantity+unit prefixes
    cleanedBase = cleanedBase
        .replace(LEADING_QTY_UNIT_PREFIX_REGEX, '')
        .replace(/^skinned\s+/i, '');

    // If unit is a size descriptor like "large", "medium", "small", move it to the name and set unit to 'each'
    const lowerUnit = unit.toLowerCase().trim();
    if (SIZE_DESCRIPTORS.has(lowerUnit)) {
        if (!getSizePrefixRegex(lowerUnit).test(cleanedBase)) {
            cleanedBase = `${lowerUnit} ${cleanedBase}`;
        }
        unit = 'each';
    }

    // Normalize unit
    let normUnit = normalizeUnit(unit);
    if (!unit || normUnit === 'unknown' || normUnit === 'unit') {
        if (!unit || lowerUnit === 'unit' || lowerUnit === 'units' || lowerUnit === 'each' || lowerUnit === 'ea') {
            normUnit = 'each';
        }
    }

    // Remove duplicate unit words from inside the name (e.g., unit="strips", name="bacon strips" -> name="bacon")
    if (normUnit && normUnit !== 'each') {
        const dupUnitRegex = getDupUnitRegex(normUnit);
        const strippedTry = cleanedBase.replace(dupUnitRegex, '').replace(/\s{2,}/g, ' ').trim();
        if (strippedTry.length >= 3) {
            cleanedBase = strippedTry;
        }
    }

    // Normalize spacing & Title Case for display
    cleanedBase = cleanedBase.replace(/\s{2,}/g, ' ').replace(/^[,\s-]+|[,\s-]+$/g, '');
    const displayName = toSmartTitleCase(cleanedBase || rawName.trim());

    // Build canonical key for combining identical items across recipes
    let keyBase = cleanedBase
        .toLowerCase()
        .replace(/\([^)]*\)/g, '') // ignore parenthetical notes when matching
        .trim();

    for (const lp of LEADING_PREP_PATTERNS) {
        keyBase = keyBase.replace(lp, '');
    }

    // Strip size descriptors ("large", "medium", "small") ONLY for canonical key matching
    const withoutSize = keyBase.replace(/^(?:extra-large|extra large|large|medium|small|jumbo)\s+/i, '').trim();
    if (withoutSize.length >= 3) {
        keyBase = withoutSize;
    }

    // Singularize simple plurals for the canonical key ("eggs" -> "egg", "potatoes" -> "potato", "onions" -> "onion")
    keyBase = singularizeIngredientKey(keyBase);

    const result = {
        displayName,
        canonicalKey: keyBase,
        unit: normUnit
    };
    if (cleanIngredientCache.size >= MAX_CACHE_SIZE) {
        const firstKey = cleanIngredientCache.keys().next().value;
        if (firstKey !== undefined) cleanIngredientCache.delete(firstKey);
    }
    cleanIngredientCache.set(cacheKey, result);
    return result;
}

/**
 * Deterministically assigns an ingredient to a consistent grocery aisle category
 * so the same item never splits across "Meat" and "Other" or "Beverages" and "Other".
 */
export function resolveCanonicalCategory(cleanName: string, rawCategory?: string): CanonicalCategory {
    return resolveCanonicalCategoryCore(cleanName, rawCategory) as CanonicalCategory;
}

/**
 * Normalizes a single recipe ingredient during URL import or AI generation.
 */
export function normalizeRecipeIngredient(ing: {
    name: string;
    quantity: number;
    unit: string;
    category?: string;
}): {
    name: string;
    quantity: number;
    unit: string;
    category: CanonicalCategory;
} | null {
    if (!ing || !ing.name || isPlainCookingWater(ing.name)) {
        return null;
    }

    const { displayName, unit } = cleanIngredientNameAndUnit(ing.name, ing.unit);
    const category = resolveCanonicalCategory(displayName, ing.category);
    const { quantity: cleanQty, unit: cleanUnit } = standardizeMeasurement(
        Number(ing.quantity) || 1,
        unit,
        displayName
    );

    return {
        name: displayName,
        quantity: cleanQty,
        unit: cleanUnit,
        category
    };
}

/**
 * Standardizes a quantity + unit pair into practical grocery/kitchen numbers.
 */
export function standardizeMeasurement(
    rawQty: number,
    rawUnit: string,
    itemName: string,
    forShoppingList = false
): { quantity: number; unit: string } {
    let qty = Number(rawQty) || 1;
    let unit = normalizeUnit(rawUnit);
    if (!rawUnit || unit === 'unknown' || unit === 'unit') {
        unit = 'each';
    }

    const unitType = getUnitType(unit);

    // 1. Mass auto-scaling: convert >= 16 oz to lb, or tiny lb (< 0.2 lb) to oz
    if (unitType === 'mass') {
        if (unit === 'oz' && qty >= 16) {
            qty = qty / 16;
            unit = 'lb';
        } else if (unit === 'lb' && qty < 0.2) {
            qty = qty * 16;
            unit = 'oz';
        }
        return {
            quantity: snapToCleanFraction(qty),
            unit
        };
    }

    // 2. Volume auto-scaling
    if (unitType === 'volume') {
        if (unit === 'tsp' && qty >= 6) {
            qty = qty / 3;
            unit = 'tbsp';
        }
        if (unit === 'tbsp' && qty >= 8) {
            qty = qty / 16;
            unit = 'cup';
        }
        if (forShoppingList && unit === 'cup' && qty > 0 && qty < 0.25) {
            qty = 0.25;
        }
        return {
            quantity: snapToCleanFraction(qty),
            unit
        };
    }

    // 3. Discrete / Countable items
    const isDiscrete =
        DISCRETE_UNITS.has(unit) ||
        unitType === 'count' ||
        /\b(?:egg|onion|pepper|potato|chicken|roll|bun|can|sheet|pastry|clove|lemon|lime|apple|banana|avocado|carrot|cucumber|zucchini|tomato)\b/i.test(
            itemName
        );

    if (isDiscrete) {
        if (forShoppingList) {
            return {
                quantity: Math.max(1, Math.ceil(qty - 0.04)),
                unit
            };
        }
        return {
            quantity: snapToCleanFraction(qty),
            unit
        };
    }

    return {
        quantity: snapToCleanFraction(qty),
        unit
    };
}

export function snapToCleanFraction(value: number): number {
    return snapToCleanFractionCore(value, 0);
}

export function formatShoppingItemLine(item: {
    name: string;
    quantity: number;
    unit: string;
}): string {
    const qtyStr = formatQuantity(item.quantity);
    const unitLabel = formatDisplayUnit(item.unit, item.quantity, item.name);
    if (!unitLabel) {
        return `${qtyStr} ${item.name}`.replace(/\s{2,}/g, ' ').trim();
    }
    return `${qtyStr} ${unitLabel} ${item.name}`.replace(/\s{2,}/g, ' ').trim();
}

export function formatDisplayUnit(unit: string, quantity: number, itemName = ''): string {
    const u = (unit || '').toLowerCase().trim();
    if (!u || u === 'each' || u === 'ea' || u === 'unit' || u === 'units' || u === 'piece' || u === 'pieces') {
        return '';
    }

    const nameLower = itemName.toLowerCase();
    if (nameLower.startsWith(`${u} `) || nameLower.startsWith(`${u}s `)) {
        return '';
    }

    const isPlural = quantity > 1.05;
    switch (u) {
        case 'lb':
        case 'pound':
            return isPlural ? 'lbs' : 'lb';
        case 'oz':
        case 'ounce':
            return 'oz';
        case 'cup':
            return isPlural ? 'cups' : 'cup';
        case 'tbsp':
        case 'tablespoon':
            return 'tbsp';
        case 'tsp':
        case 'teaspoon':
            return 'tsp';
        case 'can':
            return isPlural ? 'cans' : 'can';
        case 'sheet':
            return isPlural ? 'sheets' : 'sheet';
        case 'strip':
            return isPlural ? 'strips' : 'strip';
        case 'slice':
            return isPlural ? 'slices' : 'slice';
        case 'clove':
            return isPlural ? 'cloves' : 'clove';
        case 'head':
            return isPlural ? 'heads' : 'head';
        case 'pkg':
        case 'package':
            return isPlural ? 'packages' : 'package';
        case 'box':
            return isPlural ? 'boxes' : 'box';
        case 'bag':
            return isPlural ? 'bags' : 'bag';
        case 'jar':
            return isPlural ? 'jars' : 'jar';
        case 'bottle':
            return isPlural ? 'bottles' : 'bottle';
        case 'bunch':
            return isPlural ? 'bunches' : 'bunch';
        default:
            return isPlural && !u.endsWith('s') && u.length > 2 ? `${u}s` : u;
    }
}
