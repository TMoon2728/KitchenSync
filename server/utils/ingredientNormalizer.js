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

const UNIT_ALIASES = {
    g: ['g', 'gram', 'grams'],
    kg: ['kg', 'kilogram', 'kilograms', 'kilo', 'kilos'],
    oz: ['oz', 'ounce', 'ounces'],
    lb: ['lb', 'lbs', 'pound', 'pounds'],
    ml: ['ml', 'milliliter', 'milliliters', 'cc'],
    l: ['l', 'liter', 'liters'],
    tsp: ['tsp', 'teaspoon', 'teaspoons', 't'],
    tbsp: ['tbsp', 'tablespoon', 'tablespoons', 'tbs'],
    cup: ['cup', 'cups', 'c'],
    pt: ['pt', 'pint', 'pints'],
    qt: ['qt', 'quart', 'quarts'],
    gal: ['gal', 'gallon', 'gallons'],
    floz: ['floz', 'fl oz', 'fluid ounce', 'fluid ounces'],
    each: ['each', 'ea', 'unit', 'units', 'pc', 'pcs', 'piece', 'pieces'],
    clove: ['clove', 'cloves'],
    slice: ['slice', 'slices'],
    strip: ['strip', 'strips'],
    sheet: ['sheet', 'sheets'],
    can: ['can', 'cans'],
    head: ['head', 'heads'],
    pkg: ['pkg', 'pkgs', 'package', 'packages', 'pack', 'packs'],
    bag: ['bag', 'bags'],
    box: ['box', 'boxes'],
    jar: ['jar', 'jars'],
    bottle: ['bottle', 'bottles'],
    bunch: ['bunch', 'bunches'],
    roll: ['roll', 'rolls']
};

const PREP_SUFFIX_PATTERNS = [
    /,\s*(?:finely\s+|coarsely\s+|roughly\s+|thinly\s+|freshly\s+|lightly\s+)?(?:chopped|diced|minced|sliced|peeled(?:\s+and\s+\w+)?|grated|shredded|crushed|beaten|whisked|melted|softened|thawed|divided|drained(?:\s+and\s+rinsed)?|rinsed|halved|quartered|cubed|julienned|trimmed|seeded|cored|deveined|pitted|mashed|crumbled|toasted|sifted|undiluted|split|cooked|uncooked|at room temperature|room temperature|to taste|optional|for garnish|for serving|or to taste|if desired).*$/i,
    /\s+\b(?:peeled and chopped|peeled and diced|peeled and sliced|seeded and chopped|washed and dried|at room temperature|to taste|for garnish|for serving)\b.*$/i
];

// O(1) unit lookup map and compiled regex caches
const UNIT_LOOKUP_MAP = new Map();
for (const [canonical, aliases] of Object.entries(UNIT_ALIASES)) {
    UNIT_LOOKUP_MAP.set(canonical, canonical);
    for (const alias of aliases) {
        UNIT_LOOKUP_MAP.set(alias, canonical);
    }
}

const sizePrefixRegexCache = new Map();
const dupUnitRegexCache = new Map();
const categoryCache = new Map();
const MAX_CACHE_SIZE = 2000;

function getSizePrefixRegex(sizeWord) {
    let rx = sizePrefixRegexCache.get(sizeWord);
    if (!rx) {
        rx = new RegExp(`^${sizeWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        sizePrefixRegexCache.set(sizeWord, rx);
    }
    return rx;
}

function getDupUnitRegex(normUnit) {
    let rx = dupUnitRegexCache.get(normUnit);
    if (!rx) {
        const escaped = normUnit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const unitPlural = normUnit.endsWith('s') ? escaped : `${escaped}s`;
        rx = new RegExp(`\\b(?:${escaped}|${unitPlural})\\b`, 'gi');
        dupUnitRegexCache.set(normUnit, rx);
    }
    return rx;
}

function isPlainCookingWater(rawName) {
    const clean = String(rawName || '')
        .toLowerCase()
        .replace(/\(.*?\)/g, '')
        .replace(/,.*$/, '')
        .trim();
    return TAP_WATER_NAMES.has(clean);
}

function normalizeUnit(rawUnit) {
    if (!rawUnit) return 'each';
    const clean = String(rawUnit).toLowerCase().trim().replace(/\.$/, '');
    if (!clean) return 'each';
    const direct = UNIT_LOOKUP_MAP.get(clean);
    if (direct) return direct;
    if (clean.endsWith('s') && clean.length > 2) {
        const singular = clean.slice(0, -1);
        return UNIT_LOOKUP_MAP.get(singular) || singular;
    }
    return clean;
}

function toSmartTitleCase(str) {
    const minorWords = new Set(['of', 'and', 'or', 'in', 'with', 'for', 'to', 'a', 'an']);
    return String(str || '')
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

function resolveCanonicalCategory(cleanName, rawCategory) {
    const n = String(cleanName || '').toLowerCase();

    if (/\b(?:frozen|puff pastry|ice cream|popsicle|tater tot|french fries|waffle)\b/.test(n)) {
        return 'Frozen';
    }
    if (
        /\b(?:beef|ground beef|steak|sirloin|ribeye|chuck|brisket|roast|veal|pork|bacon|sausage|ham|prosciutto|pancetta|pepperoni|salami|chorizo|hot dog|chicken|rotisserie chicken|turkey|duck|lamb|bison|venison|meatball|meatloaf|salmon|tuna|shrimp|prawn|cod|tilapia|halibut|mahimahi|crab|lobster|scallop|anchov|sardine|fish|fillet)\b/.test(
            n
        )
    ) {
        return 'Meat';
    }
    if (
        /\b(?:milk|buttermilk|cream|half and half|half-and-half|butter|ghee|cheese|cheddar|mozzarella|swiss|parmesan|provolone|feta|ricotta|gouda|brie|gruyere|cream cheese|mascarpone|cottage cheese|yogurt|kefir|egg|eggs|egg white|egg yolk|sour cream|whipped cream|mashed potatoes)\b/.test(
            n
        ) &&
        !/\b(?:coconut milk|almond flour|peanut butter|apple butter|butternut|cream of|condensed)\b/.test(n)
    ) {
        return 'Dairy & Eggs';
    }
    if (
        /\b(?:bread|roll|dinner roll|bun|hamburger bun|hot dog bun|bagel|croissant|muffin|english muffin|pita|naan|flatbread|tortilla|baguette|ciabatta|sourdough|brioche|taco shell|pie crust)\b/.test(
            n
        ) &&
        !/\b(?:bread\s*crumb|panko)\b/.test(n)
    ) {
        return 'Bakery';
    }
    if (
        /\b(?:oil|olive oil|vegetable oil|canola oil|sesame oil|coconut oil|cooking spray|vinegar|soy sauce|tamari|worcestershire|fish sauce|oyster sauce|hoisin|teriyaki|hot sauce|hot pepper sauce|sriracha|tabasco|ketchup|mustard|mayonnaise|mayo|bbq sauce|barbecue sauce|marinara|pasta sauce|tomato sauce|tomato paste|tomato soup|condensed|soup|broth|stock|bouillon|panko|breadcrumb|bread crumb|flour|sugar|brown sugar|powdered sugar|confectioners|honey|maple syrup|molasses|agave|cornstarch|baking powder|baking soda|yeast|vanilla|cocoa|chocolate chip|pasta|spaghetti|fettuccine|penne|rigatoni|macaroni|lasagna|orzo|noodle|ramen|rice|quinoa|couscous|barley|farro|oat|oatmeal|cereal|granola|bean|black bean|kidney bean|pinto bean|cannellini|chickpea|garbanzo|lentil|peanut butter|almond butter|jam|jelly|preserves|salsa|taco seasoning|seasoning|spice|salt|black pepper|white pepper|cayenne|paprika|cumin|coriander|turmeric|curry|chili powder|oregano|thyme|rosemary|basil|bay leaf|cinnamon|nutmeg|clove|allspice|ginger powder|garlic powder|onion powder|red pepper flake|crushed red pepper|almond|walnut|pecan|cashew|peanut|pine nut|pistachio|seed|sesame|chia|flax|sunflower|raisin|cranberry|canned)\b/.test(
            n
        )
    ) {
        return 'Pantry Staples';
    }
    if (
        /\b(?:onion|yellow onion|white onion|red onion|sweet onion|shallot|scallion|green onion|leek|chive|garlic|potato|russet|yukon|sweet potato|yam|tomato|cherry tomato|roma|bell pepper|green pepper|red pepper|yellow pepper|jalapeno|serrano|habanero|poblano|chili|chile|carrot|celery|cucumber|zucchini|squash|butternut|acorn|pumpkin|eggplant|mushroom|avocado|corn|pea|snap pea|snow pea|green bean|asparagus|broccoli|cauliflower|cabbage|brussels sprout|lettuce|romaine|iceberg|spinach|kale|arugula|chard|collard|bok choy|radish|beet|turnip|parsnip|artichoke|fennel|ginger|apple|banana|orange|lemon|lime|grapefruit|berry|strawberry|blueberry|raspberry|blackberry|grape|melon|watermelon|cantaloupe|honeydew|pineapple|mango|peach|pear|plum|nectarine|cherry|pomegranate|kiwi|fig|date|cilantro|parsley|fresh basil|fresh mint|mint|dill|jalapeño)\b/.test(
            n
        )
    ) {
        return 'Produce';
    }
    if (
        /\b(?:juice|orange juice|apple juice|coffee|espresso|tea|soda|cola|pop|sparkling water|seltzer|club soda|tonic|coconut water|lemonade|wine|beer|cider|kombucha|energy drink|sports drink)\b/.test(
            n
        )
    ) {
        return 'Beverages';
    }
    if (
        /\b(?:paper towel|toilet paper|napkin|tissue|foil|aluminum foil|plastic wrap|parchment|wax paper|ziploc|storage bag|trash bag|garbage bag|dish soap|detergent|sponge|bleach|cleaner|wipe)\b/.test(
            n
        )
    ) {
        return 'Household';
    }

    const raw = String(rawCategory || '').trim().toLowerCase();
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

const CLEAN_FRACTIONS = [0, 0.125, 0.25, 0.333, 0.5, 0.667, 0.75, 1];

function snapToCleanFraction(value) {
    const num = Number(value) || 1;
    if (num <= 0) return 1;
    const whole = Math.floor(num);
    const rem = num - whole;

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
        .replace(/^\d+(?:\.\d+|\s+\d+\/\d+|\/\d+)?\s*(?:pounds?|lbs?|ounces?|oz|cups?|tbsp|tablespoons?|tsp|teaspoons?|grams?|g|kg|ml|liters?|cans?|pkgs?|packages?|strips?|sheets?|slices?|cloves?)\b\s*/i, '')
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
