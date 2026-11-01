import { convertQuantity, normalizeUnit, getUnitType } from './unitConversion';
import { formatQuantity } from './formatters';

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

const TAP_WATER_NAMES = new Set([
    'water',
    'tap water',
    'warm water',
    'hot water',
    'cold water',
    'ice water',
    'boiling water',
    'filtered water',
    'water for boiling',
    'water as needed'
]);

const SIZE_DESCRIPTORS = new Set(['small', 'medium', 'large', 'extra-large', 'extra large', 'jumbo']);

const DISCRETE_UNITS = new Set([
    'each',
    'can',
    'jar',
    'bottle',
    'box',
    'pkg',
    'bag',
    'sheet',
    'roll',
    'bun',
    'loaf',
    'head',
    'clove',
    'strip',
    'slice',
    'piece',
    'fillet',
    'stalk',
    'bunch',
    'ear',
    'tortilla',
    'shell'
]);

// Trailing prep/cooking instructions that belong in recipe steps, not on a grocery list
const PREP_SUFFIX_PATTERNS: RegExp[] = [
    /,\s*(?:finely\s+|coarsely\s+|roughly\s+|thinly\s+|freshly\s+|lightly\s+)?(?:chopped|diced|minced|sliced|peeled(?:\s+and\s+\w+)?|grated|shredded|crushed|beaten|whisked|melted|softened|thawed|divided|drained(?:\s+and\s+rinsed)?|rinsed|halved|quartered|cubed|julienned|trimmed|seeded|cored|deveined|pitted|mashed|crumbled|toasted|sifted|undiluted|split|cooked|uncooked|at room temperature|room temperature|to taste|optional|for garnish|for serving|or to taste|if desired).*$/i,
    /\s+\b(?:peeled and chopped|peeled and diced|peeled and sliced|seeded and chopped|washed and dried|at room temperature|to taste|for garnish|for serving)\b.*$/i
];

// Leading adjectives that shouldn't split identical grocery items (e.g. "skinned rotisserie chicken" -> "Rotisserie Chicken")
const LEADING_PREP_PATTERNS: RegExp[] = [
    /^(?:skinned|boneless\s+skinless|freshly\s+ground|freshly\s+grated|freshly\s+chopped|freshly\s+squeezed|packed|loosely\s+packed|firmly\s+packed|heaping|level)\s+/i
];

/**
 * Checks whether an ingredient is plain tap/cooking water that shouldn't be on a grocery list.
 */
export function isPlainCookingWater(rawName: string): boolean {
    const clean = (rawName || '')
        .toLowerCase()
        .replace(/\(.*?\)/g, '')
        .replace(/,.*$/, '')
        .trim();
    return TAP_WATER_NAMES.has(clean);
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

    // Strip parenthetical notes (e.g. "(10-3/4 ounces)", "(divided)", "(optional)")
    const nameWithoutParens = name.replace(/\s*\([^)]+\)/g, '');

    // Strip comma-separated prep suffixes (", chopped", ", beaten", ", undiluted", etc.)
    let cleanedBase = nameWithoutParens;
    for (const pattern of PREP_SUFFIX_PATTERNS) {
        cleanedBase = cleanedBase.replace(pattern, '');
    }

    // Strip leading prep words like "skinned "
    cleanedBase = cleanedBase.replace(/^skinned\s+/i, '');

    // If unit is a size descriptor like "large", "medium", "small", move it to the name and set unit to 'each'
    const lowerUnit = unit.toLowerCase().trim();
    if (SIZE_DESCRIPTORS.has(lowerUnit)) {
        if (!new RegExp(`^${lowerUnit}\\b`, 'i').test(cleanedBase)) {
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
        const unitPlural = normUnit.endsWith('s') ? normUnit : `${normUnit}s`;
        const dupUnitRegex = new RegExp(`\\b(?:${normUnit}|${unitPlural})\\b`, 'gi');
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

    // Strip size descriptors ("large", "medium", "small") ONLY for canonical key matching on common items like eggs/onions/potatoes
    // so "1.25 large egg" and "0.83 large egg, beaten" or "egg" always merge
    const withoutSize = keyBase.replace(/^(?:extra-large|extra large|large|medium|small|jumbo)\s+/i, '').trim();
    if (withoutSize.length >= 3) {
        keyBase = withoutSize;
    }

    // Singularize simple plurals for the canonical key ("eggs" -> "egg", "potatoes" -> "potato", "onions" -> "onion")
    keyBase = singularizeIngredientKey(keyBase);

    return {
        displayName,
        canonicalKey: keyBase,
        unit: normUnit
    };
}

function singularizeIngredientKey(str: string): string {
    const words = str.split(/\s+/);
    if (words.length === 0) return str;
    const last = words[words.length - 1];
    let singularLast = last;
    if (last.endsWith('ies') && last.length > 4) {
        singularLast = last.slice(0, -3) + 'y';
    } else if (last.endsWith('oes') && last.length > 4) {
        singularLast = last.slice(0, -2); // potatoes -> potato, tomatoes -> tomato
    } else if (last.endsWith('ves') && last.length > 4) {
        singularLast = last.slice(0, -3) + 'f';
    } else if (last.endsWith('s') && !last.endsWith('ss') && !last.endsWith('us') && last.length > 3) {
        singularLast = last.slice(0, -1);
    }
    words[words.length - 1] = singularLast;
    return words.join(' ');
}

function toSmartTitleCase(str: string): string {
    const minorWords = new Set(['of', 'and', 'or', 'in', 'with', 'for', 'to', 'a', 'an']);
    return str
        .split(' ')
        .map((word, idx) => {
            if (!word) return word;
            if (word.startsWith('(') || /^\d/.test(word)) return word;
            const lower = word.toLowerCase();
            if (idx > 0 && minorWords.has(lower)) return lower;
            return lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .join(' ');
}

/**
 * Deterministically assigns an ingredient to a consistent grocery aisle category
 * so the same item never splits across "Meat" and "Other" or "Beverages" and "Other".
 */
export function resolveCanonicalCategory(cleanName: string, rawCategory?: string): CanonicalCategory {
    const n = (cleanName || '').toLowerCase();

    // 1. Frozen items check first (e.g. "frozen puff pastry", "frozen corn", "ice cream")
    if (/\b(?:frozen|puff pastry|ice cream|popsicle|tater tot|french fries|waffle)\b/.test(n)) {
        return 'Frozen';
    }

    // 2. Meat & Seafood
    if (
        /\b(?:beef|ground beef|steak|sirloin|ribeye|chuck|brisket|roast|veal|pork|bacon|sausage|ham|prosciutto|pancetta|pepperoni|salami|chorizo|hot dog|chicken|rotisserie chicken|turkey|duck|lamb|bison|venison|meatball|meatloaf|salmon|tuna|shrimp|prawn|cod|tilapia|halibut|mahimahi|crab|lobster|scallop|anchov|sardine|fish|fillet)\b/.test(
            n
        )
    ) {
        return 'Meat';
    }

    // 3. Dairy & Eggs
    if (
        /\b(?:milk|buttermilk|cream|half and half|half-and-half|butter|ghee|cheese|cheddar|mozzarella|swiss|parmesan|provolone|feta|ricotta|gouda|brie|gruyere|cream cheese|mascarpone|cottage cheese|yogurt|kefir|egg|eggs|egg white|egg yolk|sour cream|whipped cream|mashed potatoes)\b/.test(
            n
        ) &&
        !/\b(?:coconut milk|almond flour|peanut butter|apple butter|butternut|cream of|condensed)\b/.test(n)
    ) {
        return 'Dairy & Eggs';
    }

    // 4. Bakery
    if (
        /\b(?:bread|roll|dinner roll|bun|hamburger bun|hot dog bun|bagel|croissant|muffin|english muffin|pita|naan|flatbread|tortilla|baguette|ciabatta|sourdough|brioche|taco shell|pie crust)\b/.test(
            n
        ) &&
        !/\b(?:bread\s*crumb|panko)\b/.test(n)
    ) {
        return 'Bakery';
    }

    // 5. Pantry Staples (Canned goods, sauces, oils, spices, baking, grains, pasta, soups)
    if (
        /\b(?:oil|olive oil|vegetable oil|canola oil|sesame oil|coconut oil|cooking spray|vinegar|soy sauce|tamari|worcestershire|fish sauce|oyster sauce|hoisin|teriyaki|hot sauce|hot pepper sauce|sriracha|tabasco|ketchup|mustard|mayonnaise|mayo|bbq sauce|barbecue sauce|marinara|pasta sauce|tomato sauce|tomato paste|tomato soup|condensed|soup|broth|stock|bouillon|panko|breadcrumb|bread crumb|flour|sugar|brown sugar|powdered sugar|confectioners|honey|maple syrup|molasses|agave|cornstarch|baking powder|baking soda|yeast|vanilla|cocoa|chocolate chip|pasta|spaghetti|fettuccine|penne|rigatoni|macaroni|lasagna|orzo|noodle|ramen|rice|quinoa|couscous|barley|farro|oat|oatmeal|cereal|granola|bean|black bean|kidney bean|pinto bean|cannellini|chickpea|garbanzo|lentil|peanut butter|almond butter|jam|jelly|preserves|salsa|taco seasoning|seasoning|spice|salt|black pepper|white pepper|cayenne|paprika|cumin|coriander|turmeric|curry|chili powder|oregano|thyme|rosemary|basil|bay leaf|cinnamon|nutmeg|clove|allspice|ginger powder|garlic powder|onion powder|red pepper flake|crushed red pepper|almond|walnut|pecan|cashew|peanut|pine nut|pistachio|seed|sesame|chia|flax|sunflower|raisin|cranberry|canned)\b/.test(
            n
        )
    ) {
        return 'Pantry Staples';
    }

    // 6. Produce (Fruits, vegetables, fresh herbs)
    if (
        /\b(?:onion|yellow onion|white onion|red onion|sweet onion|shallot|scallion|green onion|leek|chive|garlic|potato|russet|yukon|sweet potato|yam|tomato|cherry tomato|roma|bell pepper|green pepper|red pepper|yellow pepper|jalapeno|serrano|habanero|poblano|chili|chile|carrot|celery|cucumber|zucchini|squash|butternut|acorn|pumpkin|eggplant|mushroom|avocado|corn|pea|snap pea|snow pea|green bean|asparagus|broccoli|cauliflower|cabbage|brussels sprout|lettuce|romaine|iceberg|spinach|kale|arugula|chard|collard|bok choy|radish|beet|turnip|parsnip|artichoke|fennel|ginger|apple|banana|orange|lemon|lime|grapefruit|berry|strawberry|blueberry|raspberry|blackberry|grape|melon|watermelon|cantaloupe|honeydew|pineapple|mango|peach|pear|plum|nectarine|cherry|pomegranate|kiwi|fig|date|cilantro|parsley|fresh basil|fresh mint|mint|dill|jalapeño)\b/.test(
            n
        )
    ) {
        return 'Produce';
    }

    // 7. Beverages
    if (
        /\b(?:juice|orange juice|apple juice|coffee|espresso|tea|soda|cola|pop|sparkling water|seltzer|club soda|tonic|coconut water|lemonade|wine|beer|cider|kombucha|energy drink|sports drink)\b/.test(
            n
        )
    ) {
        return 'Beverages';
    }

    // 8. Household
    if (
        /\b(?:paper towel|toilet paper|napkin|tissue|foil|aluminum foil|plastic wrap|parchment|wax paper|ziploc|storage bag|trash bag|garbage bag|dish soap|detergent|sponge|bleach|cleaner|wipe)\b/.test(
            n
        )
    ) {
        return 'Household';
    }

    // 9. Respect valid normalized rawCategory if provided
    const raw = (rawCategory || '').trim().toLowerCase();
    if (raw.includes('produce') || raw.includes('fruit') || raw.includes('veg')) return 'Produce';
    if (raw.includes('meat') || raw.includes('seafood') || raw.includes('poultry') || raw.includes('fish')) return 'Meat';
    if (raw.includes('dairy') || raw.includes('egg') || raw.includes('cheese')) return 'Dairy & Eggs';
    if (raw.includes('baker') || raw.includes('bread')) return 'Bakery';
    if (raw.includes('froz')) return 'Frozen';
    if (raw.includes('pantry') || raw.includes('canned') || raw.includes('spice') || raw.includes('baking') || raw.includes('condiment')) return 'Pantry Staples';
    if (raw.includes('bev') || raw.includes('drink')) return 'Beverages';
    if (raw.includes('house') || raw.includes('paper') || raw.includes('clean')) return 'Household';

    return 'Other';
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
 * Standardizes a quantity + unit pair into practical grocery/kitchen numbers:
 * - Discrete items (eggs, cans, onions, rolls, sheets, whole chickens) round UP to whole numbers
 *   when used on a shopping list (or nearest 0.5 in recipes).
 * - Mass items >= 16 oz convert to lbs; < 0.25 lb convert to oz.
 * - Volume items snap to clean culinary fractions (1/8, 1/4, 1/3, 1/2, 2/3, 3/4, 1).
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

    // 1. Mass auto-scaling: convert >= 16 oz to lb, or tiny lb (< 0.25 lb) to oz
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

    // 2. Volume auto-scaling: convert >= 48 tsp to cup, >= 3 tsp to tbsp, or < 0.25 cup to tbsp/quarter-cup
    if (unitType === 'volume') {
        if (unit === 'tsp' && qty >= 6) {
            qty = qty / 3;
            unit = 'tbsp';
        }
        if (unit === 'tbsp' && qty >= 8) {
            qty = qty / 16;
            unit = 'cup';
        }
        // On a shopping list, if someone needs 0.21 cup Panko, round up to 1/4 cup (0.25)
        if (forShoppingList && unit === 'cup' && qty > 0 && qty < 0.25) {
            qty = 0.25;
        }
        return {
            quantity: snapToCleanFraction(qty),
            unit
        };
    }

    // 3. Discrete / Countable items (eggs, cans, onions, peppers, potatoes, rolls, sheets, etc.)
    const isDiscrete =
        DISCRETE_UNITS.has(unit) ||
        unitType === 'count' ||
        /\b(?:egg|onion|pepper|potato|chicken|roll|bun|can|sheet|pastry|clove|lemon|lime|apple|banana|avocado|carrot|cucumber|zucchini|tomato)\b/i.test(
            itemName
        );

    if (isDiscrete) {
        if (forShoppingList) {
            // At the grocery store, you buy whole cans, whole eggs, whole onions, whole sheets
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

const CLEAN_FRACTIONS = [0, 0.125, 0.25, 0.333, 0.5, 0.667, 0.75, 1];

export function snapToCleanFraction(value: number): number {
    if (value <= 0) return 0;
    const whole = Math.floor(value);
    const rem = value - whole;

    let closest = CLEAN_FRACTIONS[0];
    let minDiff = Math.abs(rem - closest);
    for (const f of CLEAN_FRACTIONS) {
        const diff = Math.abs(rem - f);
        if (diff < minDiff) {
            minDiff = diff;
            closest = f;
        }
    }

    const snapped = whole + closest;
    return Number((snapped > 0 ? snapped : 0.125).toFixed(3));
}

/**
 * Formats a shopping list item into a single clean, human-readable line for display or clipboard export.
 * Example:
 *   { name: 'Ground Beef', quantity: 2.5, unit: 'lb' } -> "2 1/2 lbs Ground Beef"
 *   { name: 'Large Onion', quantity: 1, unit: 'each' } -> "1 Large Onion"
 *   { name: 'Bacon', quantity: 5, unit: 'strip' } -> "5 strips Bacon"
 */
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

    // If the item name already starts with or contains the unit word, don't repeat it
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
