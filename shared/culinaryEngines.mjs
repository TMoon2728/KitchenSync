/**
 * Isomorphic Culinary Capability Engines (M-FEATURE-UPGRADE: F-01 through F-06)
 * Shared natively between Vite/TypeScript (frontend) and Node.js (backend & node:test).
 */

import {
    SIZE_DESCRIPTORS,
    DISCRETE_UNITS,
    PREP_SUFFIX_PATTERNS,
    LEADING_PREP_PATTERNS,
    LEADING_QTY_UNIT_PREFIX_REGEX,
    getSizePrefixRegex,
    getDupUnitRegex,
    isPlainCookingWater,
    normalizeCanonicalUnit,
    toSmartTitleCase,
    singularizeIngredientKey,
    resolveCanonicalCategoryCore,
    snapToCleanFractionCore
} from './ingredientNormalizerCore.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Lightweight isomorphic canonical cleaner for ingredient matching and bulk parsing.
 */
export function cleanCanonicalIngredient(rawName = '', rawUnit = '') {
    const name = String(rawName || '').trim();
    let unit = String(rawUnit || '').trim();

    const nameWithoutParens = name.replace(/\s*\([^)]+\)/g, '');
    let cleanedBase = nameWithoutParens;
    for (const pattern of PREP_SUFFIX_PATTERNS) {
        cleanedBase = cleanedBase.replace(pattern, '');
    }
    cleanedBase = cleanedBase.replace(
        /,\s*(?:lean|extra[- ]lean|boneless|skinless|halved|quartered|trimmed|rinsed|drained|softened|melted|room temperature|divided|to taste|optional|cubed|shredded|grated|crumbled|beaten|peeled|seeded|cored|deveined|uncooked|cooked).*$/i,
        ''
    );

    cleanedBase = cleanedBase
        .replace(LEADING_QTY_UNIT_PREFIX_REGEX, '')
        .replace(/^\s*(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞])\s+/i, '')
        .replace(/^skinned\s+/i, '');

    const lowerUnit = unit.toLowerCase().trim();
    if (SIZE_DESCRIPTORS.has(lowerUnit)) {
        if (!getSizePrefixRegex(lowerUnit).test(cleanedBase)) {
            cleanedBase = `${lowerUnit} ${cleanedBase}`;
        }
        unit = 'each';
    }

    const normUnit = normalizeCanonicalUnit(unit);

    if (normUnit && normUnit !== 'each') {
        const dupUnitRegex = getDupUnitRegex(normUnit);
        const strippedTry = cleanedBase.replace(dupUnitRegex, '').replace(/\s{2,}/g, ' ').trim();
        if (strippedTry.length >= 3) {
            cleanedBase = strippedTry;
        }
    }

    cleanedBase = cleanedBase.replace(/\s{2,}/g, ' ').replace(/^[,\s-]+|[,\s-]+$/g, '');
    const displayName = toSmartTitleCase(cleanedBase || name);

    let keyBase = cleanedBase.toLowerCase().replace(/\([^)]*\)/g, '').trim();
    for (const lp of LEADING_PREP_PATTERNS) {
        keyBase = keyBase.replace(lp, '');
    }

    const withoutSize = keyBase.replace(/^(?:extra-large|extra large|large|medium|small|jumbo)\s+/i, '').trim();
    if (withoutSize.length >= 3) {
        keyBase = withoutSize;
    }

    const canonicalKey = singularizeIngredientKey(keyBase);
    return {
        displayName,
        canonicalKey,
        unit: normUnit || 'each'
    };
}

// ============================================================================
// F-03: Predictive Pantry Expiry Radar, Shelf-Life Heuristics & Dietary Checks
// ============================================================================

const CATEGORY_SHELF_LIFE_DAYS = {
    'Meat': 4,
    'Seafood': 3,
    'Bakery': 5,
    'Produce': 7,
    'Dairy & Eggs': 10,
    'Beverages': 30,
    'Frozen': 90,
    'Pantry Staples': 180,
    'Spices & Seasonings': 365,
    'Household': 365,
    'Other': 14
};

export function inferDefaultExpiryDate(category = 'Other', itemName = '', nowMs = Date.now()) {
    const resolvedCategory =
        category && category !== 'Other'
            ? category
            : resolveCanonicalCategoryCore(itemName, category);

    const lowerName = String(itemName || '').toLowerCase();
    let days = CATEGORY_SHELF_LIFE_DAYS[resolvedCategory] || 14;

    if (/\b(?:fish|salmon|shrimp|scallop|cod|tilapia|crab|ground\s+\w+)\b/.test(lowerName)) {
        days = 3;
    } else if (/\b(?:berr(?:y|ies)|spinach|lettuce|arugula|avocado|cilantro|parsley|banana)\b/.test(lowerName)) {
        days = 5;
    } else if (/\b(?:potato|onion|garlic|carrot|apple|orange|lemon|lime|cabbage)\b/.test(lowerName)) {
        days = 14;
    } else if (/\b(?:egg|eggs|butter|cheddar|parmesan|swiss)\b/.test(lowerName)) {
        days = 21;
    }

    return new Date(nowMs + days * DAY_MS).toISOString().split('T')[0];
}

export function getExpiryStatus(expiryDate, nowMs = Date.now()) {
    if (!expiryDate || typeof expiryDate !== 'string') {
        return { status: 'none', daysRemaining: null, label: 'No Expiry' };
    }

    const todayStr = new Date(nowMs).toISOString().split('T')[0];
    const targetMs = new Date(`${expiryDate.slice(0, 10)}T00:00:00Z`).getTime();
    const todayMs = new Date(`${todayStr}T00:00:00Z`).getTime();

    if (Number.isNaN(targetMs)) {
        return { status: 'none', daysRemaining: null, label: 'No Expiry' };
    }

    const daysRemaining = Math.round((targetMs - todayMs) / DAY_MS);

    if (daysRemaining < 0) {
        return {
            status: 'expired',
            daysRemaining,
            label: `Expired ${Math.abs(daysRemaining)}d ago`
        };
    }
    if (daysRemaining === 0) {
        return {
            status: 'expiring_soon',
            daysRemaining: 0,
            label: 'Expires Today'
        };
    }
    if (daysRemaining <= 3) {
        return {
            status: 'expiring_soon',
            daysRemaining,
            label: `Expires in ${daysRemaining}d`
        };
    }
    return {
        status: 'fresh',
        daysRemaining,
        label: `${daysRemaining}d left`
    };
}

const DIETARY_RULES = [
    {
        matchRestriction: /\b(?:vegan)\b/i,
        label: 'Vegan',
        forbiddenRegex: /\b(?:beef|pork|bacon|sausage|ham|chicken|turkey|duck|lamb|salmon|tuna|shrimp|fish|crab|lobster|anchov|meat|steak|milk|cream|butter|ghee|cheese|cheddar|mozzarella|parmesan|swiss|feta|yogurt|sour cream|egg|eggs|honey|mayonnaise|mayo|gelatin)\b/i
    },
    {
        matchRestriction: /\b(?:vegetarian|veggie)\b/i,
        label: 'Vegetarian',
        forbiddenRegex: /\b(?:beef|pork|bacon|sausage|ham|prosciutto|pepperoni|salami|chorizo|chicken|turkey|duck|lamb|salmon|tuna|shrimp|fish|crab|lobster|anchov|meat|steak|chicken broth|beef broth|fish sauce|gelatin)\b/i
    },
    {
        matchRestriction: /\b(?:gluten[- ]?free|celiac|no gluten)\b/i,
        label: 'Gluten-Free',
        forbiddenRegex: /\b(?:wheat|all-purpose flour|bread flour|flour|pasta|spaghetti|fettuccine|penne|macaroni|lasagna|orzo|ramen|couscous|barley|farro|bread|roll|bun|bagel|croissant|pita|naan|panko|breadcrumb|soy sauce|puff pastry|pie crust)\b/i,
        exceptionRegex: /\b(?:gluten[- ]?free|almond flour|coconut flour|cornstarch|rice flour|tamari)\b/i
    },
    {
        matchRestriction: /\b(?:dairy[- ]?free|lactose|no dairy)\b/i,
        label: 'Dairy-Free',
        forbiddenRegex: /\b(?:milk|buttermilk|cream|half and half|butter|ghee|cheese|cheddar|mozzarella|parmesan|swiss|feta|ricotta|yogurt|sour cream|whey|casein)\b/i,
        exceptionRegex: /\b(?:coconut milk|almond milk|oat milk|soy milk|peanut butter|almond butter|dairy[- ]?free|vegan)\b/i
    },
    {
        matchRestriction: /\b(?:nut|peanut|tree nut)\b/i,
        label: 'Nut-Free',
        forbiddenRegex: /\b(?:peanut|almond|walnut|pecan|cashew|pistachio|macadamia|hazelnut|pine nut|praline|marzipan)\b/i
    },
    {
        matchRestriction: /\b(?:pork[- ]?free|no pork|halal|kosher)\b/i,
        label: 'Pork-Free',
        forbiddenRegex: /\b(?:pork|bacon|ham|prosciutto|pancetta|pepperoni|salami|chorizo)\b/i
    },
    {
        matchRestriction: /\b(?:seafood|shellfish|no fish)\b/i,
        label: 'No Seafood',
        forbiddenRegex: /\b(?:salmon|tuna|shrimp|prawn|cod|tilapia|halibut|crab|lobster|scallop|anchov|sardine|fish|clam|mussel|oyster)\b/i
    }
];

export function checkDietaryConflicts(recipe, householdMembers = []) {
    if (!recipe || !Array.isArray(recipe.ingredients) || !Array.isArray(householdMembers)) {
        return [];
    }

    const conflicts = [];
    for (const member of householdMembers) {
        const restrictionText = String(member?.dietaryRestrictions || '').trim();
        if (!restrictionText || restrictionText === 'Linked Account') continue;

        for (const rule of DIETARY_RULES) {
            if (!rule.matchRestriction.test(restrictionText)) continue;

            for (const ing of recipe.ingredients) {
                const ingName = String(ing?.name || '');
                if (rule.exceptionRegex && rule.exceptionRegex.test(ingName)) continue;
                if (rule.forbiddenRegex.test(ingName)) {
                    conflicts.push({
                        memberName: member.name || 'Household Member',
                        restriction: rule.label,
                        offendingIngredient: ing.name
                    });
                    break;
                }
            }
        }
    }

    return conflicts;
}

// ============================================================================
// F-01: Canonical Pantry Match Scorer & 1-Click "Smart Auto-Fill Week"
// ============================================================================

export function scoreRecipeAgainstPantry(recipe, pantry = [], nowMs = Date.now()) {
    const rawIngs = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
    const ings = rawIngs.filter(i => i?.name && !isPlainCookingWater(i.name));

    if (ings.length === 0) {
        return {
            matchPercentage: 100,
            matchedCount: 0,
            totalCount: 0,
            missingIngredients: [],
            usesExpiringItem: false,
            expiringMatchedNames: []
        };
    }

    // Build canonical lookup of pantry items + track expiring items
    const pantryCanonicalMap = new Map();
    const pantryRawLowerSet = new Set();

    for (const pItem of pantry) {
        if (!pItem?.name || (typeof pItem.quantity === 'number' && pItem.quantity <= 0)) continue;
        const { canonicalKey } = cleanCanonicalIngredient(pItem.name, pItem.unit);
        const expiryInfo = getExpiryStatus(pItem.expiryDate, nowMs);
        const isExpiring = expiryInfo.status === 'expiring_soon' || expiryInfo.status === 'expired';

        pantryRawLowerSet.add(pItem.name.toLowerCase().trim());
        const existing = pantryCanonicalMap.get(canonicalKey);
        if (!existing || isExpiring) {
            pantryCanonicalMap.set(canonicalKey, {
                name: pItem.name,
                isExpiring
            });
        }
    }

    let matchedCount = 0;
    const missingIngredients = [];
    const expiringMatchedNames = [];

    for (const ing of ings) {
        const { canonicalKey } = cleanCanonicalIngredient(ing.name, ing.unit);
        const rawLower = String(ing.name || '').toLowerCase().trim();

        const matchedPantry = pantryCanonicalMap.get(canonicalKey);
        if (matchedPantry || pantryRawLowerSet.has(rawLower)) {
            matchedCount++;
            if (matchedPantry?.isExpiring && !expiringMatchedNames.includes(matchedPantry.name)) {
                expiringMatchedNames.push(matchedPantry.name);
            }
        } else {
            missingIngredients.push(ing);
        }
    }

    const matchPercentage = Math.round((matchedCount / ings.length) * 100);
    return {
        matchPercentage,
        matchedCount,
        totalCount: ings.length,
        missingIngredients,
        usesExpiringItem: expiringMatchedNames.length > 0,
        expiringMatchedNames
    };
}

const SLOT_COMPATIBILITY = {
    Breakfast: ['Breakfast', 'Snack', 'Meal Prep', 'Side Dish'],
    Lunch: ['Main Course', 'Meal Prep', 'Side Dish', 'Snack'],
    Dinner: ['Main Course', 'Meal Prep'],
    Snack: ['Snack', 'Dessert', 'Side Dish']
};

export function generateSmartWeeklyPlan({
    recipes = [],
    pantry = [],
    currentPlan = {},
    weekDates = [],
    getActiveSlotsForDateFn = () => ['Dinner'],
    mode = 'calendar',
    targetListCount = 7,
    householdMembers = [],
    nowMs = Date.now()
}) {
    const nextPlan = JSON.parse(JSON.stringify(currentPlan || {}));
    if (!Array.isArray(recipes) || recipes.length === 0) {
        return { mealPlan: nextPlan, addedCount: 0 };
    }

    // Pre-score all recipes once
    const scoredCatalog = recipes.map(recipe => {
        const match = scoreRecipeAgainstPantry(recipe, pantry, nowMs);
        const conflicts = checkDietaryConflicts(recipe, householdMembers);
        const baseScore =
            (match.usesExpiringItem ? 40 : 0) +
            (match.matchPercentage * 0.35) +
            (recipe.is_favorite ? 15 : 0) +
            ((Number(recipe.rating) || 0) * 2) -
            (conflicts.length * 30);

        return {
            recipe,
            match,
            baseScore
        };
    });

    // Track already-used recipe IDs across the week to maximize variety
    const usedCounts = new Map();
    const recordUsed = (id) => {
        if (!id) return;
        usedCounts.set(id, (usedCounts.get(id) || 0) + 1);
    };

    for (const dayObj of Object.values(nextPlan)) {
        if (!dayObj || typeof dayObj !== 'object') continue;
        for (const slotArr of Object.values(dayObj)) {
            if (!Array.isArray(slotArr)) continue;
            for (const item of slotArr) {
                if (item?.recipeId) recordUsed(item.recipeId);
            }
        }
    }

    const pickBestForSlot = (slotType) => {
        const preferredTypes = SLOT_COMPATIBILITY[slotType] || ['Main Course'];
        let bestEntry = null;
        let bestTotalScore = -Infinity;

        for (const entry of scoredCatalog) {
            const r = entry.recipe;
            const timesUsed = usedCounts.get(r.id) || 0;
            const typeBonus = preferredTypes.includes(r.meal_type) ? 15 : 0;
            const repeatPenalty = timesUsed * 60;
            const totalScore = entry.baseScore + typeBonus - repeatPenalty;

            if (totalScore > bestTotalScore) {
                bestTotalScore = totalScore;
                bestEntry = entry;
            }
        }

        if (bestEntry) {
            recordUsed(bestEntry.recipe.id);
            return bestEntry.recipe;
        }
        return null;
    };

    let addedCount = 0;

    if (mode === 'list') {
        if (!nextPlan.unscheduled) nextPlan.unscheduled = { Flexible: [] };
        if (!Array.isArray(nextPlan.unscheduled.Flexible)) nextPlan.unscheduled.Flexible = [];

        const activeUncompleted = nextPlan.unscheduled.Flexible.filter(m => !m.completed).length;
        const needed = Math.max(0, targetListCount - activeUncompleted);
        const countToAdd = needed > 0 ? needed : Math.min(5, recipes.length);

        for (let i = 0; i < countToAdd; i++) {
            const chosen = pickBestForSlot('Dinner');
            if (chosen) {
                nextPlan.unscheduled.Flexible.push({
                    recipeId: chosen.id,
                    meal_type: 'Dinner',
                    completed: false
                });
                addedCount++;
            }
        }

        return { mealPlan: nextPlan, addedCount };
    }

    for (const dateInput of weekDates) {
        const dateObj = dateInput instanceof Date ? dateInput : new Date(`${dateInput}T00:00:00`);
        const dateStr = dateInput instanceof Date
            ? dateInput.toISOString().split('T')[0]
            : String(dateInput).split('T')[0];

        const activeSlots = getActiveSlotsForDateFn(dateObj);
        if (!nextPlan[dateStr]) {
            nextPlan[dateStr] = { Breakfast: [], Lunch: [], Dinner: [], Snack: [] };
        }

        for (const slot of activeSlots) {
            if (!Array.isArray(nextPlan[dateStr][slot])) {
                nextPlan[dateStr][slot] = [];
            }
            if (nextPlan[dateStr][slot].length === 0) {
                const chosen = pickBestForSlot(slot);
                if (chosen) {
                    nextPlan[dateStr][slot].push({
                        recipeId: chosen.id,
                        completed: false
                    });
                    addedCount++;
                }
            }
        }
    }

    return { mealPlan: nextPlan, addedCount };
}

// ============================================================================
// F-02: Interactive AI Remix Diff Inspector
// ============================================================================

export function computeRecipeDiff(originalRecipe, remixedRecipe) {
    const origIngs = Array.isArray(originalRecipe?.ingredients) ? originalRecipe.ingredients : [];
    const remixIngs = Array.isArray(remixedRecipe?.ingredients) ? remixedRecipe.ingredients : [];

    const origByKey = new Map();
    for (const ing of origIngs) {
        if (!ing?.name) continue;
        const { canonicalKey } = cleanCanonicalIngredient(ing.name, ing.unit);
        origByKey.set(canonicalKey, ing);
    }

    const remixByKey = new Map();
    const addedIngredients = [];
    const modifiedIngredients = [];

    for (const ing of remixIngs) {
        if (!ing?.name) continue;
        const { canonicalKey } = cleanCanonicalIngredient(ing.name, ing.unit);
        remixByKey.set(canonicalKey, ing);

        const prev = origByKey.get(canonicalKey);
        if (!prev) {
            addedIngredients.push(ing);
        } else if (
            Math.abs((Number(prev.quantity) || 0) - (Number(ing.quantity) || 0)) > 0.05 ||
            normalizeCanonicalUnit(prev.unit) !== normalizeCanonicalUnit(ing.unit) ||
            prev.name.toLowerCase().trim() !== ing.name.toLowerCase().trim()
        ) {
            modifiedIngredients.push({ previous: prev, current: ing });
        }
    }

    const removedIngredients = [];
    for (const [key, origIng] of origByKey.entries()) {
        if (!remixByKey.has(key)) {
            removedIngredients.push(origIng);
        }
    }

    return {
        calorieDelta: (Number(remixedRecipe?.calories) || 0) - (Number(originalRecipe?.calories) || 0),
        proteinDelta: (Number(remixedRecipe?.protein) || 0) - (Number(originalRecipe?.protein) || 0),
        carbDelta: (Number(remixedRecipe?.carbs) || 0) - (Number(originalRecipe?.carbs) || 0),
        fatDelta: (Number(remixedRecipe?.fat) || 0) - (Number(originalRecipe?.fat) || 0),
        addedIngredients,
        modifiedIngredients,
        removedIngredients
    };
}

// ============================================================================
// F-04: Auto-Extracted Multi-Step Countdown Timers
// ============================================================================

export function extractStepTimers(stepText = '') {
    const text = String(stepText || '');
    if (!text) return [];

    const timerRegex = /\b(\d+(?:\.\d+)?)(?:\s*(?:-|to|–)\s*(\d+(?:\.\d+)?))?\s*(hours?|hrs?|hr|minutes?|mins?|min|seconds?|secs?|sec)\b/gi;
    const timers = [];
    const seenSeconds = new Set();

    let match;
    while ((match = timerRegex.exec(text)) !== null) {
        const lowerBound = parseFloat(match[1]);
        const upperBound = match[2] ? parseFloat(match[2]) : lowerBound;
        const unitRaw = match[3].toLowerCase();
        const valueToUse = upperBound || lowerBound;

        if (Number.isNaN(valueToUse) || valueToUse <= 0) continue;

        let durationSeconds = 0;
        let unitLabel = 'min';
        if (unitRaw.startsWith('h')) {
            durationSeconds = Math.round(valueToUse * 3600);
            unitLabel = valueToUse === 1 ? 'hr' : 'hrs';
        } else if (unitRaw.startsWith('m')) {
            durationSeconds = Math.round(valueToUse * 60);
            unitLabel = valueToUse === 1 ? 'min' : 'mins';
        } else {
            durationSeconds = Math.round(valueToUse);
            unitLabel = 'sec';
        }

        if (durationSeconds <= 0 || durationSeconds > 24 * 3600) continue;
        if (seenSeconds.has(durationSeconds)) continue;
        seenSeconds.add(durationSeconds);

        timers.push({
            id: `timer-${durationSeconds}-${timers.length}`,
            label: `${valueToUse} ${unitLabel}`,
            durationSeconds,
            sourceMatch: match[0]
        });
    }

    return timers;
}

// ============================================================================
// F-05: Zero-Credit Deterministic Bulk Recipe / Ingredient Text Parser
// ============================================================================

const VULGAR_FRACTIONS = {
    '¼': 0.25,
    '½': 0.5,
    '¾': 0.75,
    '⅓': 0.333,
    '⅔': 0.667,
    '⅛': 0.125,
    '⅜': 0.375,
    '⅝': 0.625,
    '⅞': 0.875
};

function parseLeadingIngredientLine(rawLine) {
    let line = String(rawLine || '')
        .replace(/^[\s•*\-–—]+/, '')
        .trim();
    if (!line) return null;

    for (const [glyph, dec] of Object.entries(VULGAR_FRACTIONS)) {
        line = line.replace(new RegExp(`(\\d)\\s*${glyph}`, 'g'), (_, d) => String(Number(d) + dec));
        line = line.replace(new RegExp(glyph, 'g'), String(dec));
    }

    let quantity = 1;
    let remainder = line;

    const mixedMatch = line.match(/^(\d+)\s+(\d+)\/(\d+)\s+(.*)$/);
    const fracMatch = !mixedMatch && line.match(/^(\d+)\/(\d+)\s+(.*)$/);
    const rangeMatch = !mixedMatch && !fracMatch && line.match(/^(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s+(.*)$/i);
    const numMatch = !mixedMatch && !fracMatch && !rangeMatch && line.match(/^(\d+(?:\.\d+)?)\s+(.*)$/);

    if (mixedMatch) {
        quantity = Number(mixedMatch[1]) + Number(mixedMatch[2]) / Number(mixedMatch[3]);
        remainder = mixedMatch[4];
    } else if (fracMatch) {
        quantity = Number(fracMatch[1]) / Number(fracMatch[2]);
        remainder = fracMatch[3];
    } else if (rangeMatch) {
        quantity = (Number(rangeMatch[1]) + Number(rangeMatch[2])) / 2;
        remainder = rangeMatch[3];
    } else if (numMatch) {
        quantity = Number(numMatch[1]);
        remainder = numMatch[2];
    }

    const words = remainder.trim().split(/\s+/);
    let rawUnit = 'each';
    let rawName = remainder.trim();

    if (words.length >= 2) {
        const candidateUnit = words[0].toLowerCase().replace(/[.,]/g, '');
        const normCandidate = normalizeCanonicalUnit(candidateUnit);
        const isKnownUnit =
            DISCRETE_UNITS.has(normCandidate) ||
            SIZE_DESCRIPTORS.has(candidateUnit) ||
            ['g', 'kg', 'oz', 'lb', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'pt', 'qt', 'gal', 'floz'].includes(normCandidate);

        if (isKnownUnit) {
            rawUnit = candidateUnit;
            rawName = words.slice(1).join(' ').replace(/^of\s+/i, '');
        }
    }

    if (isPlainCookingWater(rawName)) return null;

    const { displayName, unit } = cleanCanonicalIngredient(rawName, rawUnit);
    const category = resolveCanonicalCategoryCore(displayName, 'Other');
    const cleanQty = snapToCleanFractionCore(quantity, 1);

    return {
        name: displayName,
        quantity: cleanQty,
        unit,
        category
    };
}

export function parseRawRecipeText(rawText = '', defaultServings = 4) {
    const lines = String(rawText || '')
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(Boolean);

    if (lines.length === 0) {
        return {
            name: '',
            servings: defaultServings,
            prep_time: '15 mins',
            cook_time: '30 mins',
            ingredients: [],
            instructions: ''
        };
    }

    let name = '';
    let servings = defaultServings;
    let prep_time = '15 mins';
    let cook_time = '30 mins';
    const ingredients = [];
    const instructionLines = [];

    let section = 'auto'; // 'auto' | 'ingredients' | 'instructions'

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (/^(?:ingredients?|what you(?:'ll)? need)\s*:?\s*$/i.test(line)) {
            section = 'ingredients';
            continue;
        }
        if (/^(?:instructions?|directions?|steps?|method|preparation)\s*:?\s*$/i.test(line)) {
            section = 'instructions';
            continue;
        }

        const servingsMatch = line.match(/^(?:servings?|serves|yield)\s*:\s*(\d+)/i);
        if (servingsMatch) {
            servings = Number(servingsMatch[1]) || defaultServings;
            continue;
        }

        const prepMatch = line.match(/^prep(?:\s*time)?\s*:\s*(.+)$/i);
        if (prepMatch) {
            prep_time = prepMatch[1].trim();
            continue;
        }

        const cookMatch = line.match(/^cook(?:\s*time)?\s*:\s*(.+)$/i);
        if (cookMatch) {
            cook_time = cookMatch[1].trim();
            continue;
        }

        const looksLikeIngredient =
            /^[\s•*\-–—]*(\d+|\d+\/\d+|[¼½¾⅓⅔⅛⅜⅝⅞])\b/.test(line);
        const looksLikeNumberedStep = /^\d+[.)]\s+[A-Z]/.test(line) && line.length > 35;

        if (!name && i === 0 && !looksLikeIngredient && line.length <= 80) {
            name = line.replace(/^#+\s*/, '').trim();
            continue;
        }

        if (section === 'ingredients' || (section === 'auto' && looksLikeIngredient && !looksLikeNumberedStep)) {
            const parsedIng = parseLeadingIngredientLine(line);
            if (parsedIng) ingredients.push(parsedIng);
        } else if (section === 'instructions' || looksLikeNumberedStep || line.length > 50) {
            section = 'instructions';
            const cleanedStep = line.replace(/^\d+[.)]\s*/, '').trim();
            if (cleanedStep) instructionLines.push(cleanedStep);
        } else {
            const parsedIng = parseLeadingIngredientLine(line);
            if (parsedIng) ingredients.push(parsedIng);
        }
    }

    const numberedInstructions = instructionLines
        .map((step, idx) => `${idx + 1}. ${step}`)
        .join('\n\n');

    return {
        name: name || 'Imported Recipe',
        servings,
        prep_time,
        cook_time,
        ingredients,
        instructions: numberedInstructions
    };
}

// ============================================================================
// F-06: Ecosystem Interoperability (RFC-5545 .ics Export & Store Deep-Links)
// ============================================================================

const SLOT_START_HOURS = {
    Breakfast: '080000',
    Lunch: '123000',
    Snack: '153000',
    Dinner: '183000'
};

const SLOT_END_HOURS = {
    Breakfast: '084500',
    Lunch: '131500',
    Snack: '160000',
    Dinner: '193000'
};

function escapeIcsText(str = '') {
    return String(str || '')
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r?\n/g, '\\n');
}

export function generateMealPlanIcs(mealPlan = {}, recipes = [], weekStartDateStr = '') {
    const recipeMap = new Map((recipes || []).map(r => [Number(r.id), r]));
    const nowStamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//KitchenSync//Culinary OS//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'X-WR-CALNAME:KitchenSync Meal Plan'
    ];

    const sortedDates = Object.keys(mealPlan || {})
        .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
        .sort();

    for (const dateStr of sortedDates) {
        if (weekStartDateStr) {
            const startMs = new Date(`${weekStartDateStr}T00:00:00Z`).getTime();
            const curMs = new Date(`${dateStr}T00:00:00Z`).getTime();
            if (!Number.isNaN(startMs) && !Number.isNaN(curMs)) {
                const diffDays = (curMs - startMs) / DAY_MS;
                if (diffDays < 0 || diffDays >= 7) continue;
            }
        }

        const dayPlan = mealPlan[dateStr];
        if (!dayPlan || typeof dayPlan !== 'object') continue;
        const compactDate = dateStr.replace(/-/g, '');

        for (const [slot, items] of Object.entries(dayPlan)) {
            if (!Array.isArray(items) || items.length === 0) continue;
            const startClock = SLOT_START_HOURS[slot] || '183000';
            const endClock = SLOT_END_HOURS[slot] || '193000';

            items.forEach((item, idx) => {
                const recipe = item?.recipeId ? recipeMap.get(Number(item.recipeId)) : null;
                const title = recipe ? `${slot}: ${recipe.name}` : `${slot}: ${item?.custom_item_name || 'Planned Meal'}`;

                const descParts = [];
                if (recipe) {
                    descParts.push(`Servings: ${recipe.servings} | Prep: ${recipe.prep_time} | Cook: ${recipe.cook_time}`);
                    descParts.push(`Nutrition: ${recipe.calories} kcal (${recipe.protein}g P / ${recipe.carbs}g C / ${recipe.fat}g F)`);
                    if (Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0) {
                        descParts.push('');
                        descParts.push('Ingredients:');
                        for (const ing of recipe.ingredients) {
                            descParts.push(`- ${ing.quantity} ${ing.unit} ${ing.name}`);
                        }
                    }
                } else {
                    descParts.push('Scheduled via KitchenSync Meal Planner');
                }

                lines.push('BEGIN:VEVENT');
                lines.push(`UID:ks-${compactDate}-${slot.toLowerCase()}-${idx}@kitchensync.app`);
                lines.push(`DTSTAMP:${nowStamp}`);
                lines.push(`DTSTART:${compactDate}T${startClock}`);
                lines.push(`DTEND:${compactDate}T${endClock}`);
                lines.push(`SUMMARY:${escapeIcsText(title)}`);
                lines.push(`DESCRIPTION:${escapeIcsText(descParts.join('\n'))}`);
                lines.push('END:VEVENT');
            });
        }
    }

    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
}

export function buildStoreSearchUrl(storeName = '', baseUrl = '', query = '') {
    const encoded = encodeURIComponent(String(query || '').trim());
    const lowerName = String(storeName || '').toLowerCase();
    const lowerUrl = String(baseUrl || '').toLowerCase();

    if (lowerName.includes('instacart') || lowerUrl.includes('instacart.com')) {
        return `https://www.instacart.com/store/s?k=${encoded}`;
    }
    if (lowerName.includes('walmart') || lowerUrl.includes('walmart.com')) {
        return `https://www.walmart.com/search?q=${encoded}`;
    }
    if (lowerName.includes('amazon') || lowerUrl.includes('amazon.com')) {
        return `https://www.amazon.com/s?k=${encoded}&i=amazonfresh`;
    }
    if (lowerName.includes('target') || lowerUrl.includes('target.com')) {
        return `https://www.target.com/s?searchTerm=${encoded}`;
    }
    if (lowerName.includes('kroger') || lowerUrl.includes('kroger.com')) {
        return `https://www.kroger.com/search?query=${encoded}`;
    }
    if (baseUrl && baseUrl.startsWith('http')) {
        const cleanBase = baseUrl.replace(/\/+$/, '');
        return `${cleanBase}/search?q=${encoded}`;
    }
    return `https://www.instacart.com/store/s?k=${encoded}`;
}

export function formatCookbookMarkdown(recipes = []) {
    if (!Array.isArray(recipes) || recipes.length === 0) {
        return '# KitchenSync Cookbook\n\nNo recipes saved yet.\n';
    }

    const sections = recipes.map(r => {
        const ingLines = (r.ingredients || [])
            .map(i => `- ${i.quantity} ${i.unit} **${i.name}** _(${i.category || 'Other'})_`)
            .join('\n');

        return [
            `## ${r.name}`,
            `**Category:** ${r.meal_type} | **Servings:** ${r.servings} | **Prep:** ${r.prep_time} | **Cook:** ${r.cook_time}`,
            `**Macros:** ${r.calories} kcal • ${r.protein}g Protein • ${r.carbs}g Carbs • ${r.fat}g Fat`,
            '',
            '### Ingredients',
            ingLines || '- None listed',
            '',
            '### Instructions',
            r.instructions || 'No instructions provided.',
            ''
        ].join('\n');
    });

    return `# KitchenSync Digital Cookbook (${recipes.length} Recipes)\n\n` + sections.join('\n---\n\n');
}
