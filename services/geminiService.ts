
import type { Recipe, PantryItem, WeeklyScheduleMatrix } from "../types";
import { getActiveSlotsForDate, DAY_FULL_NAMES, getDayKeyFromDate } from "../utils/schedule";

const Type = {
    OBJECT: 'OBJECT',
    STRING: 'STRING',
    NUMBER: 'NUMBER',
    ARRAY: 'ARRAY',
    BOOLEAN: 'BOOLEAN',
    INTEGER: 'INTEGER'
} as const;

// Schema definitions (kept for sending to backend)
const recipeSchema = {
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
                required: ["name", "quantity", "unit", "category"],
            },
            description: "An array of grocery ingredients for the recipe (do NOT include plain tap water).",
        },
        instructions: { type: Type.STRING, description: "Step-by-step cooking instructions. You MUST separate each step with a double newline (\\n\\n) and number each step (1., 2., 3., etc.) so they can be rendered as distinct paragraphs." },
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
        imageUrl: { type: Type.STRING, description: "The URL of the main image for the recipe. Extract this from the webpage if available.", nullable: true }
    },
    required: ["name", "servings", "ingredients", "instructions", "meal_type"],
};

import { authFetch, API_BASE } from "../utils/api";

// Helper to handle API response
const handleApiResponse = async <T>(response: Response): Promise<T | null> => {
    if (!response.ok) {
        if (response.status === 402) {
            console.warn("Insufficient credits");
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('ks:insufficient-credits'));
            }
            throw new Error("INSUFFICIENT_CREDITS");
        }
        console.error("API Error:", await response.text());
        return null;
    }
    const data = await response.json();
    return data.result as T;
};

export const generateRecipeFromIngredients = async (request: string, token: string, familySize?: number): Promise<Partial<Recipe> | null> => {
    const prompt = `You are a creative chef. Based on the following user request: "${request}".  
    
    CRITICAL INSTRUCTION: If the request is completely unrelated to food, cooking, meals, treats, or recipes (for example, asking for coding help, math, general chatting, or inappropriate content), you MUST invent a funny, sarcastic fake recipe that politely explains you are a Sous Chef, not a general assistant. For example, if asked to help with math homework, you could output a recipe named "Baked Math Homework with Extra Zeros". Make the instructions funny but clear that you only do food. IMPORTANT SAFETY RULE: While being sarcastic and funny, NEVER suggest eating or doing anything actually harmful, painful, or dangerous (e.g., do not suggest eating whole hot peppers, raw meat, dangerous chemicals, or engaging in unsafe activities). Keep it lighthearted and safe!
    
    If the request IS related to food or an event (e.g. "birthday treats", "dinner", "spicy food"), provide a complete, creative, and delicious recipe that fits the request perfectly. Fill in any gaps with common pantry staples. Include useful tags (e.g., 'Vegetarian', 'Quick', 'Party') in the response. Ensure the output strictly follows the schema.`;

    try {
        const response = await authFetch(`${API_BASE}/generate-recipe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, schema: recipeSchema, familySize }),
            token
        });
        return handleApiResponse<Partial<Recipe>>(response);
    } catch (error) {
        console.error("Error generating recipe:", error);
        return null;
    }
};

export const generateRecipeFromUrl = async (url: string, token: string, familySize?: number): Promise<Partial<Recipe> | null> => {
    try {
        const response = await authFetch(`${API_BASE}/ai/parse-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, schema: recipeSchema, familySize }),
            token
        });
        return handleApiResponse<Partial<Recipe>>(response);
    } catch (error) {
        console.error("Error generating recipe from URL:", error);
        return null;
    }
};

export const remixRecipe = async (recipe: Recipe, remixType: string, token: string, familySize?: number): Promise<Partial<Recipe> | null> => {
    const prompt = `You are a recipe modification expert. Take the following recipe and modify it to "${remixType}". Adjust ingredients, instructions, and tags accordingly.
    
    Original Recipe:
    ${JSON.stringify(recipe, null, 2)}
    
    Generate the new, modified recipe. The name of the recipe should reflect the change, e.g., "Healthier ${recipe.name}" or "${recipe.name} (Vegan)".`;

    try {
        const response = await authFetch(`${API_BASE}/generate-recipe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, schema: recipeSchema, familySize }),
            token
        });
        return handleApiResponse<Partial<Recipe>>(response);
    } catch (error) {
        console.error("Error remixing recipe:", error);
        return null;
    }
};

export const generateMealPlan = async (
    recipes: Recipe[],
    theme: string,
    usePantry: boolean,
    useFavorites: boolean,
    useHighestRated: boolean,
    caloriesPerDay: number,
    startDate: string,
    durationDays: number,
    includedSlots: string[],
    token: string,
    complexity: string = 'Moderate',
    dietaryRestrictions: string = '',
    pantryItems: PantryItem[] = [],
    cost: number = 1,
    scheduleConfig?: {
        mode: 'scheduled' | 'list';
        scheduleMatrix?: WeeklyScheduleMatrix;
        listCount?: number;
    }
): Promise<any | null> => {

    const recipeList = recipes.map(r => `${r.name} (${r.meal_type}) ${r.is_favorite ? "[FAVORITE]" : ""} [RATING: ${r.rating}/5] [CALORIES: ${r.calories}]`).join('\n');
    const pantryList = usePantry && pantryItems.length > 0
        ? `\n    **Current Pantry Inventory (Prioritize recipes using these items):**\n    ${pantryItems.map(p => `${p.name} (${p.quantity} ${p.unit})`).join(', ')}\n`
        : '';

    const mode = scheduleConfig?.mode || 'scheduled';

    if (mode === 'list') {
        const count = scheduleConfig?.listCount || 7;
        const prompt = `You are an expert meal plan architect. Create a flexible list of ${count} meals for the user to pick from throughout the week.

    **Directives:**
    - Theme: ${theme}
    - Complexity: ${complexity}
    - Dietary Constraints: ${dietaryRestrictions || 'None specified (use standard healthy mix)'}
    - Prioritize pantry items: ${usePantry}
    - Prioritize favorite recipes: ${useFavorites}
    - Prioritize highest-rated recipes: ${useHighestRated}
    - Target Meal Types: ${includedSlots.length > 0 ? includedSlots.join(', ') : 'Dinner'}
    - Daily Calorie Context: Approx ${caloriesPerDay} kcal/day
    ${pantryList}
    **Available Recipes:**
    ${recipeList}

    **Instructions:**
    - Select or suggest exactly ${count} meals total.
    - Prefer using exact recipe names from the Available Recipes list whenever possible.
    - Respond with a JSON array of ${count} meal items.`;

        const listPlanSchema = {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    mealName: { type: Type.STRING, description: "Exact recipe name from Available Recipes, or a suggested meal name." },
                    mealType: { type: Type.STRING, description: "e.g. Dinner, Lunch, Breakfast, Snack" },
                    reason: { type: Type.STRING, description: "Short 1-sentence note on why this meal fits the week's plan.", nullable: true }
                },
                required: ["mealName", "mealType"]
            }
        };

        try {
            const response = await authFetch(`${API_BASE}/generate-recipe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, schema: listPlanSchema, cost }),
                token
            });
            return handleApiResponse<any>(response);
        } catch (error) {
            console.error("Error generating flexible meal list:", error);
            return null;
        }
    }

    // Build day-by-day schedule breakdown using scheduleMatrix if provided
    const dayBreakdownLines: string[] = [];
    const baseDate = new Date(`${startDate}T00:00:00`);
    for (let i = 0; i < durationDays; i++) {
        const d = new Date(baseDate);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        const dayKey = getDayKeyFromDate(d);
        const dayName = DAY_FULL_NAMES[dayKey];
        const slotsForDay = scheduleConfig?.scheduleMatrix
            ? getActiveSlotsForDate(d, scheduleConfig.scheduleMatrix)
            : includedSlots;
        if (slotsForDay.length > 0) {
            dayBreakdownLines.push(`    - ${dateStr} (${dayName}): Generate ONLY [${slotsForDay.join(', ')}] (set all other meal slots to null)`);
        } else {
            dayBreakdownLines.push(`    - ${dateStr} (${dayName}): No meals needed (set all meal slots to null)`);
        }
    }

    const prompt = `You are an expert meal plan architect. Create a ${durationDays}-day meal plan starting on ${startDate}.
    
    **Directives:**
    - Theme: ${theme}
    - Complexity: ${complexity}
    - Dietary Constraints: ${dietaryRestrictions || 'None specified (use standard healthy mix)'}
    - Prioritize pantry items: ${usePantry}
    - Prioritize favorite recipes: ${useFavorites}
    - Prioritize highest-rated recipes: ${useHighestRated}
    - **Daily Calorie Goal: Approx ${caloriesPerDay} calories total per day (scaled to the requested meals).**
    
    **Exact Day-by-Day Schedule Requirements:**
${dayBreakdownLines.join('\n')}
    ${pantryList}
    **Available Recipes:**
    ${recipeList}
    
    **Instructions:**
    - Generate a plan entry for each of the ${durationDays} days.
    - Strictly follow the Exact Day-by-Day Schedule Requirements above: ONLY populate the requested slots for each specific date, and set any unrequested slot on that date to null.
    - Use the provided recipe names exactly as they appear in the list.
    - If a suitable recipe isn't available for a requested slot, suggest a simple, common meal (e.g. "Oatmeal", "Greek Yogurt", "Grilled Cheese").
    - Respond with a JSON array where each item represents a day.
    `;

    const mealPlanSchema = {
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
                        Snack: { type: Type.STRING, nullable: true },
                    },
                    description: "Object containing the meal slots requested."
                }
            },
            required: ["date", "dayOfWeek", "meals"]
        }
    };

    try {
        const response = await authFetch(`${API_BASE}/generate-recipe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, schema: mealPlanSchema, cost }),
            token
        });
        return handleApiResponse<any>(response);
    } catch (error) {
        console.error("Error generating meal plan:", error);
        return null;
    }
};

export const suggestRecipesFromPantry = async (
    pantryItems: PantryItem[],
    existingRecipes: Recipe[],
    token: string
): Promise<Array<{ recipeName: string; reason: string }> | null> => {

    const pantryList = pantryItems.map(item => `${item.name} (${item.quantity} ${item.unit})`).join(', ');
    if (!pantryList) return [];

    const recipeNames = existingRecipes.map(r => r.name).join('", "');

    const prompt = `You are a helpful kitchen assistant. Based on the ingredients in my pantry, suggest some recipes I could make.
    
    My Pantry Contains: ${pantryList}
    
    My existing recipe book contains: "${recipeNames}"
    
    **Instructions:**
    1.  Prioritize suggesting recipes from my existing recipe book if I have the key ingredients.
    2.  If I don't have enough for an existing recipe, you can suggest simple, common recipes that use my pantry items (e.g., 'Simple Omelette', 'Pasta with Olive Oil and Garlic').
    3.  For each suggestion, provide the recipe name and a short reason.
    4.  Return a JSON array of suggestions.
    `;

    const suggestionSchema = {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                recipeName: { type: Type.STRING, description: "The name of the suggested recipe." },
                reason: { type: Type.STRING, description: "A brief explanation of why this recipe is a good suggestion based on the pantry items." }
            },
            required: ["recipeName", "reason"],
        }
    };

    try {
        const response = await authFetch(`${API_BASE}/generate-recipe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, schema: suggestionSchema }),
            token
        });
        return handleApiResponse<Array<{ recipeName: string; reason: string }>>(response);
    } catch (error) {
        console.error("Error suggesting recipes from pantry:", error);
        return null;
    }
};

export const generateRecipeImage = async (recipeName: string, description: string | undefined, token: string): Promise<string | null> => {
    const prompt = `A professional, high-quality, realistic food photography shot of the dish "${recipeName}". The image MUST precisely and accurately depict "${recipeName}" and its actual ingredients. Context: ${description || 'standard recipe ingredients'}. WARNING: Do NOT include seafood or crabs unless explicitly mentioned in the recipe name or context. The image should be cleanly plated, brightly lit, appetizing, and suitable for a high-end culinary blog.`;

    try {
        const response = await authFetch(`${API_BASE}/generate-image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt }),
            token
        });
        return handleApiResponse<string>(response);
    } catch (error) {
        console.error("Error generating recipe image:", error);
        return null;
    }
};

export const scanPantryStorage = async (base64Image: string, token: string): Promise<any | null> => {
    try {
        const response = await authFetch(`${API_BASE}/ai/scan-pantry`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64Image }),
            token
        });
        return handleApiResponse<any>(response);
    } catch (error) {
        console.error("Error scanning pantry photo:", error);
        return null;
    }
};

// Chat with Sous Chef
export interface ChatMessage {
    role: 'user' | 'model';
    text: string;
}

export const chatWithSousChef = async (history: ChatMessage[], context: string, token: string): Promise<string | null> => {
    const systemInstruction = `You are a professional, witty, and helpful Sous Chef AI assistant called "KitchenSync AI".
    
    CURRENT CONTEXT:
    ${context}
    
    INSTRUCTIONS:
    - Answer questions specifically about the Current Context if provided (e.g., specific recipe details, pantry items).
    - If the user asks for substitutions, use the provided Pantry inventory if available in context.
    - Be concise, encouraging, and culinary-focused.
    - If asked about wine pairings, offer a sophisticated but accessible suggestion.
    - If asked about cooking techniques, explain them simply.
    - IMPORTANT SAFETY RULE: Keep any humor or sarcasm safe. Never suggest consuming harmful, painful, or dangerous items (e.g., dangerous chemicals, raw meat, or eating whole hot peppers).
    `;

    try {
        const latestMessage = history[history.length - 1]?.text || '';
        const priorTurns = history.slice(0, -1);
        const firstUserIdx = priorTurns.findIndex(m => m.role === 'user');
        const validPriorTurns = firstUserIdx >= 0 ? priorTurns.slice(firstUserIdx) : [];
        const formattedHistory = validPriorTurns.map(m => ({
            role: m.role,
            parts: [{ text: m.text }]
        }));

        const response = await authFetch(`${API_BASE}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                history: formattedHistory,
                message: latestMessage,
                systemInstruction
            }),
            token
        });
        if (!response.ok) return "Chef is currently offline.";
        const data = await response.json();
        return data.result;
    } catch (error) {
        console.error("Error chatting with Sous Chef:", error);
        return "I'm having a bit of trouble hearing you over the kitchen noise. Could you try again?";
    }
};
