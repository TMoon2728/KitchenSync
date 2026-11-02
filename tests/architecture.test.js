const test = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeRecipeIngredientsList,
    resolveCanonicalCategory,
    isPlainCookingWater
} = require('../server/utils/ingredientNormalizer');
const {
    compileRecipeFromJsonLd,
    parseIsoDuration
} = require('../server/utils/jsonLdRecipeCompiler');
const { resolveServerSchema } = require('../server/schemas/aiSchemas');
const { HouseholdEventBus } = require('../server/utils/householdEventBus');
const {
    generateContentWithFailover,
    isModelHealthy,
    recordModelSuccess
} = require('../server/utils/resilientAi');
const apiRouter = require('../server/routes/api');

test('U-02: Isomorphic Normalizer merges duplicates, strips leading quantities, and filters tap water', () => {
    const raw = [
        { name: '2.08 pound ground beef', quantity: 2.08, unit: 'pound', category: 'Other' },
        { name: 'ground beef, cooked and drained', quantity: 0.5, unit: 'lb', category: 'Meat' },
        { name: 'warm water', quantity: 1, unit: 'cup', category: 'Beverages' },
        { name: 'large egg, beaten', quantity: 0.83, unit: 'large', category: 'Other' }
    ];

    const normalized = normalizeRecipeIngredientsList(raw);
    assert.equal(normalized.length, 2);

    assert.equal(normalized[0].name, 'Ground Beef');
    assert.equal(normalized[0].unit, 'lb');
    assert.equal(normalized[0].category, 'Meat');
    assert.equal(normalized[0].quantity, 2.667);

    assert.equal(normalized[1].name, 'Large Egg');
    assert.equal(normalized[1].unit, 'each');
    assert.equal(normalized[1].quantity, 1);
    assert.equal(normalized[1].category, 'Dairy & Eggs');

    assert.equal(isPlainCookingWater('Tap Water (for boiling)'), true);
    assert.equal(isPlainCookingWater('Sparkling Water'), false);
});

test('U-02: Canonical Category Resolver deterministically assigns grocery aisles', () => {
    assert.equal(resolveCanonicalCategory('Ground Beef', 'Other'), 'Meat');
    assert.equal(resolveCanonicalCategory('Frozen Puff Pastry', 'Bakery'), 'Frozen');
    assert.equal(resolveCanonicalCategory('Condensed Tomato Soup', 'Produce'), 'Pantry Staples');
    assert.equal(resolveCanonicalCategory('Shredded Swiss Cheese', 'Other'), 'Dairy & Eggs');
    assert.equal(resolveCanonicalCategory('Dinner Rolls', 'Other'), 'Bakery');
});

test('U-02: Server-Enforced AI Schema Registry resolves canonical schema keys', () => {
    const recipeSchema = resolveServerSchema('recipe');
    assert.equal(recipeSchema.type, 'OBJECT');
    assert.ok(recipeSchema.properties.ingredients);

    const listSchema = resolveServerSchema('mealPlanList');
    assert.equal(listSchema.type, 'ARRAY');
});

test('U-03: Zero-LLM Deterministic JSON-LD Recipe Compiler parses and scales Schema.org Recipe nodes', () => {
    const sampleJsonLd = JSON.stringify({
        '@type': 'Recipe',
        name: 'Classic Skillet Meatballs &amp; Marinara',
        recipeYield: '4 servings',
        prepTime: 'PT15M',
        cookTime: 'PT1H10M',
        recipeCategory: 'Main Course',
        keywords: 'beef, italian, dinner',
        image: { url: 'https://example.com/meatballs.jpg' },
        nutrition: {
            calories: '480 kcal',
            proteinContent: '32 g',
            fatContent: '22 g',
            carbohydrateContent: '38 g'
        },
        recipeIngredient: [
            '1 ½ pounds ground beef',
            '1 large egg, beaten',
            '1 (10.75 ounce) can condensed tomato soup, undiluted',
            '1 cup warm water'
        ],
        recipeInstructions: [
            { '@type': 'HowToStep', text: 'Mix beef and egg in a bowl.' },
            { '@type': 'HowToStep', text: 'Simmer in tomato soup for 30 minutes.' }
        ]
    });

    // Compile scaled from 4 servings -> 8 servings (2x scale factor)
    const compiled = compileRecipeFromJsonLd(sampleJsonLd, 'https://example.com/recipe', null, 8);
    assert.ok(compiled);
    assert.equal(compiled.name, 'Classic Skillet Meatballs & Marinara');
    assert.equal(compiled.servings, 8);
    assert.equal(compiled.prep_time, '15 mins');
    assert.equal(compiled.cook_time, '1 hr 10 mins');
    assert.equal(compiled.calories, 480);
    assert.equal(compiled.protein, 32);
    assert.equal(compiled.imageUrl, 'https://example.com/meatballs.jpg');
    assert.equal(compiled.ingredients.length, 3); // warm water filtered out!
    assert.equal(compiled.ingredients[0].name, 'Ground Beef');
    assert.equal(compiled.ingredients[0].quantity, 3); // 1.5 lb * 2 = 3 lb
    assert.equal(compiled.ingredients[1].name, 'Large Egg');
    assert.equal(compiled.ingredients[1].quantity, 2); // 1 * 2 = 2
    assert.equal(compiled.ingredients[2].unit, 'can');
    assert.equal(compiled.ingredients[2].quantity, 2);

    assert.equal(parseIsoDuration('PT45M', '20 mins'), '45 mins');
});

test('U-03: Multi-Model Circuit Breaker fails over automatically on 503/429 upstream fault', async () => {
    const attemptedModels = [];
    const mockGenAI = {
        models: {
            generateContent: async ({ model }) => {
                attemptedModels.push(model);
                if (model === 'gemini-2.5-flash') {
                    const err = new Error('503 Service Unavailable: Model overloaded');
                    err.status = 503;
                    throw err;
                }
                return { text: () => '{"ok":true}' };
            }
        }
    };

    const res = await generateContentWithFailover(mockGenAI, 'gemini-2.5-flash', {
        contents: 'test prompt'
    });
    assert.equal(res.text(), '{"ok":true}');
    assert.deepEqual(attemptedModels, ['gemini-2.5-flash', 'gemini-2.0-flash']);
    assert.equal(isModelHealthy('gemini-2.5-flash'), false);

    // Reset circuit state after test
    recordModelSuccess('gemini-2.5-flash');
    assert.equal(isModelHealthy('gemini-2.5-flash'), true);
});

test('U-01: Household Event Bus isolates real-time SSE broadcasts by householdId', () => {
    const bus = new HouseholdEventBus();
    const receivedA = [];
    const receivedB = [];

    const unsubA = bus.subscribeHousehold('101', evt => receivedA.push(evt));
    const unsubB = bus.subscribeHousehold('202', evt => receivedB.push(evt));

    bus.emitHouseholdEvent('101', 'meal_plan:delta', { dayKey: '2026-11-01', slotKey: 'Dinner' });

    assert.equal(receivedA.length, 1);
    assert.equal(receivedA[0].type, 'meal_plan:delta');
    assert.equal(receivedB.length, 0);

    unsubA();
    unsubB();
});

test('SSRF Guard blocks private/loopback IPv4, IPv6, and metadata endpoints', () => {
    assert.equal(apiRouter.isPrivateOrReservedIp('127.0.0.1'), true);
    assert.equal(apiRouter.isPrivateOrReservedIp('169.254.169.254'), true);
    assert.equal(apiRouter.isPrivateOrReservedIp('192.168.1.50'), true);
    assert.equal(apiRouter.isPrivateOrReservedIp('10.0.0.1'), true);
    assert.equal(apiRouter.isPrivateOrReservedIp('172.16.0.1'), true);
    assert.equal(apiRouter.isPrivateOrReservedIp('::1'), true);
    assert.equal(apiRouter.isPrivateOrReservedIp('93.184.216.34'), false);

    assert.equal(apiRouter.isSafePublicUrl('http://localhost:3001/health').ok, false);
    assert.equal(apiRouter.isSafePublicUrl('file:///etc/passwd').ok, false);
    assert.equal(apiRouter.isSafePublicUrl('https://www.allrecipes.com/recipe/12345').ok, true);
});
