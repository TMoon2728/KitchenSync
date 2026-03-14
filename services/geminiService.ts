
import { Type } from "@google/genai";
import type { Recipe, PantryItem } from "../types";

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
                    name: { type: Type.STRING },
                    quantity: { type: Type.NUMBER },
                    unit: { type: Type.STRING },
                    category: { type: Type.STRING, description: "Grocery aisle category e.g. Produce, Meat, Pantry Staples" }
                },
                required: ["name", "quantity", "unit"],
            },
            description: "An array of ingredients for the recipe.",
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
            // Optionally trigger a global event or throw a specific error
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
    dietaryRestrictions: string = ''
): Promise<any | null> => {

    const recipeList = recipes.map(r => `${r.name} (${r.meal_type}) ${r.is_favorite ? "[FAVORITE]" : ""} [RATING: ${r.rating}/5] [CALORIES: ${r.calories}]`).join('\n');

    const prompt = `You are an expert meal plan architect. Create a ${durationDays}-day meal plan starting on ${startDate}.
    
    **Directives:**
    - Theme: ${theme}
    - Complexity: ${complexity}
    - Dietary Constraints: ${dietaryRestrictions || 'None specified (use standard healthy mix)'}
    - Prioritize pantry items: ${usePantry}
    - Prioritize favorite recipes: ${useFavorites}
    - Prioritize highest-rated recipes: ${useHighestRated}
    - **Daily Calorie Goal: Approx ${caloriesPerDay} calories total per day across the requested meals.**
    - **Meals to include:** ${includedSlots.join(', ')}. Do not generate slots for meals not listed.
    
    **Available Recipes:**
    ${recipeList}
    
    **Instructions:**
    - Generate a plan for exactly ${durationDays} days.
    - For each day, provide the date (YYYY-MM-DD) and the selected meals.
    - Use the provided recipe names exactly as they appear in the list.
    - If a suitable recipe isn't available for a slot to meet the calorie goal or theme, you can suggest a simple, common meal (e.g. "Oatmeal", "Greek Yogurt", "Grilled Cheese").
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
        // Reuse generate-recipe endpoint for generic generation or create a new one?
        // generate-recipe accepts schema, so it works for anything.
        const response = await authFetch(`${API_BASE}/generate-recipe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, schema: mealPlanSchema }),
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
        const response = await authFetch(`${API_BASE}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                history,
                message: history[history.length - 1].text, // Redundant but explicit for backend
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
