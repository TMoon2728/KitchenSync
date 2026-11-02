/**
 * Server-Enforced AI Schema Contracts (U-02)
 * Eliminates the need for clients to serialize 50+ line responseSchema objects on every request.
 */
const Type = {
    OBJECT: 'OBJECT',
    STRING: 'STRING',
    NUMBER: 'NUMBER',
    ARRAY: 'ARRAY',
    BOOLEAN: 'BOOLEAN',
    INTEGER: 'INTEGER'
};

const RECIPE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        name: { type: Type.STRING, description: "The name of the recipe." },
        servings: { type: Type.NUMBER, description: "The number of servings this recipe makes." },
        prep_time: { type: Type.STRING, description: "Preparation time, e.g., '15 mins'." },
        cook_time: { type: Type.STRING, description: "Cooking time, e.g., '30 mins'." },
        calories: { type: Type.NUMBER, description: "Estimated calories per serving." },
        protein: { type: Type.NUMBER, description: "Grams of protein per serving." },
        fat: { type: Type.NUMBER, description: "Grams of fat per serving." },
        carbs: { type: Type.NUMBER, description: "Grams of carbohydrates per serving." },
        ingredients: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    name: {
                        type: Type.STRING,
                        description: "Clean grocery item name WITHOUT preparation instructions (e.g., 'Ground Beef', 'Large Egg', 'Yellow Onion', 'Bacon' — put 'chopped', 'diced', 'beaten', 'thawed' in instructions, NOT in ingredient name)."
                    },
                    quantity: {
                        type: Type.NUMBER,
                        description: "Practical culinary quantity: use whole numbers for countable items (eggs, cans, onions, rolls, sheets) and clean fractions (0.25, 0.33, 0.5, 0.67, 0.75) for volume/weight."
                    },
                    unit: {
                        type: Type.STRING,
                        description: "Standardized unit: 'each', 'lb', 'oz', 'cup', 'tbsp', 'tsp', 'can', 'sheet', 'strip', 'slice', 'clove', 'pkg', 'g', 'ml'."
                    },
                    category: {
                        type: Type.STRING,
                        enum: ['Produce', 'Meat', 'Dairy & Eggs', 'Bakery', 'Frozen', 'Pantry Staples', 'Beverages', 'Household', 'Other'],
                        description: "Grocery aisle category."
                    }
                },
                required: ['name', 'quantity', 'unit', 'category']
            },
            description: "An array of grocery ingredients for the recipe (do NOT include plain tap water)."
        },
        instructions: {
            type: Type.STRING,
            description: "Step-by-step cooking instructions. You MUST separate each step with a double newline (\\n\\n) and number each step (1., 2., 3., etc.) so they can be rendered as distinct paragraphs."
        },
        meal_type: {
            type: Type.STRING,
            enum: ['Main Course', 'Side Dish', 'Dessert', 'Snack', 'Meal Prep'],
            description: "The category of the meal."
        },
        tags: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Relevant tags for filtering, e.g., 'Vegetarian', 'Quick', 'Spicy', 'Chicken'."
        },
        imageUrl: {
            type: Type.STRING,
            description: "The URL of the main image for the recipe. Extract this from the webpage if available.",
            nullable: true
        }
    },
    required: ['name', 'servings', 'ingredients', 'instructions', 'meal_type']
};

const MEAL_PLAN_LIST_SCHEMA = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            mealName: { type: Type.STRING, description: "Exact recipe name from Available Recipes, or a suggested meal name." },
            mealType: { type: Type.STRING, description: "e.g. Dinner, Lunch, Breakfast, Snack" },
            reason: { type: Type.STRING, description: "Short 1-sentence note on why this meal fits the week's plan.", nullable: true }
        },
        required: ['mealName', 'mealType']
    }
};

const MEAL_PLAN_SCHEDULED_SCHEMA = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            date: { type: Type.STRING, description: "The date for this plan entry in YYYY-MM-DD format." },
            dayOfWeek: { type: Type.STRING, description: "The name of the day (e.g. Monday)." },
            meals: {
                type: Type.OBJECT,
                properties: {
                    Breakfast: { type: Type.STRING, nullable: true },
                    Lunch: { type: Type.STRING, nullable: true },
                    Dinner: { type: Type.STRING, nullable: true },
                    Snack: { type: Type.STRING, nullable: true }
                },
                description: "Object containing the meal slots requested."
            }
        },
        required: ['date', 'dayOfWeek', 'meals']
    }
};

const PANTRY_SUGGESTION_SCHEMA = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            recipeName: { type: Type.STRING, description: "The name of the suggested recipe." },
            reason: { type: Type.STRING, description: "A brief explanation of why this recipe is a good suggestion based on the pantry items." }
        },
        required: ['recipeName', 'reason']
    }
};

const AI_SCHEMAS = Object.freeze({
    recipe: RECIPE_SCHEMA,
    mealPlanList: MEAL_PLAN_LIST_SCHEMA,
    mealPlanScheduled: MEAL_PLAN_SCHEDULED_SCHEMA,
    pantrySuggestions: PANTRY_SUGGESTION_SCHEMA
});

function resolveServerSchema(schemaKey, legacyClientSchema) {
    if (schemaKey && Object.prototype.hasOwnProperty.call(AI_SCHEMAS, schemaKey)) {
        return AI_SCHEMAS[schemaKey];
    }
    if (legacyClientSchema && typeof legacyClientSchema === 'object') {
        return legacyClientSchema;
    }
    return RECIPE_SCHEMA;
}

module.exports = {
    Type,
    AI_SCHEMAS,
    RECIPE_SCHEMA,
    MEAL_PLAN_LIST_SCHEMA,
    MEAL_PLAN_SCHEDULED_SCHEMA,
    PANTRY_SUGGESTION_SCHEMA,
    resolveServerSchema
};
