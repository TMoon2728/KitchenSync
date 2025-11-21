
import { GoogleGenAI, Type } from "@google/genai";
import type { Recipe } from "../types";

// Safely access the API key to prevent crashes in browser environments
const API_KEY = (typeof process !== 'undefined' && process.env) ? process.env.API_KEY : undefined;

// Initialize the AI client only if the key is available
const ai = API_KEY ? new GoogleGenAI({ apiKey: API_KEY }) : null;

if (!ai) {
    console.warn("Gemini API key not found. AI features will be disabled.");
}

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
                },
                required: ["name", "quantity", "unit"],
            },
            description: "An array of ingredients for the recipe.",
        },
        instructions: { type: Type.STRING, description: "Step-by-step cooking instructions, separated by newlines." },
        meal_type: { 
            type: Type.STRING,
            enum: ['Main Course', 'Side Dish', 'Dessert', 'Snack', 'Meal Prep'],
            description: "The category of the meal."
        },
    },
    required: ["name", "servings", "ingredients", "instructions", "meal_type"],
};

const parseJsonResponse = <T,>(text: string | undefined): T | null => {
    if (!text) return null;
    try {
        const cleanedText = text.replace(/```json/g, "").replace(/```/g, "").trim();
        return JSON.parse(cleanedText) as T;
    } catch (error) {
        console.error("Failed to parse JSON response:", error);
        console.error("Original text:", text);
        return null;
    }
};

export const generateRecipeFromIngredients = async (ingredients: string): Promise<Partial<Recipe> | null> => {
    if (!ai) return null;
    const prompt = `You are a creative chef. Invent a recipe using the following ingredients: ${ingredients}. Be creative and fill in any gaps with common pantry staples. Provide a complete recipe.`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: recipeSchema,
            },
        });
        return parseJsonResponse<Partial<Recipe>>(response.text);
    } catch (error) {
        console.error("Error generating recipe:", error);
        return null;
    }
};

export const remixRecipe = async (recipe: Recipe, remixType: string): Promise<Partial<Recipe> | null> => {
    if (!ai) return null;
    const prompt = `You are a recipe modification expert. Take the following recipe and modify it to "${remixType}". Adjust ingredients and instructions accordingly.
    
    Original Recipe:
    ${JSON.stringify(recipe, null, 2)}
    
    Generate the new, modified recipe. The name of the recipe should reflect the change, e.g., "Healthier ${recipe.name}" or "${recipe.name} (Vegan)".`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: recipeSchema,
            },
        });
        return parseJsonResponse<Partial<Recipe>>(response.text);
    } catch (error) {
        console.error("Error remixing recipe:", error);
        return null;
    }
};


export const generateMealPlan = async (
    recipes: Recipe[],
    theme: string,
    usePantry: boolean,
    useFavorites: boolean
): Promise<any | null> => {
    if (!ai) return null;
    const recipeList = recipes.map(r => `${r.name} (${r.meal_type}) ${r.is_favorite ? "[FAVORITE]" : ""}`).join('\n');
    
    const prompt = `You are an expert meal plan architect. Create a 7-day meal plan for Breakfast, Lunch, and Dinner.
    
    **Directives:**
    - Theme: ${theme}
    - Prioritize pantry items for ingredient usage: ${usePantry}
    - Prioritize favorite recipes: ${useFavorites}
    
    **Available Recipes:**
    ${recipeList}
    
    **Instructions:**
    - Fill every slot (Breakfast, Lunch, Dinner) for every day from Monday to Sunday.
    - Use the provided recipe names exactly as they appear in the list.
    - If a suitable recipe isn't available for a slot, you can suggest a simple, common meal like "Yogurt and Granola" or "Sandwich and Chips".
    - Respond with ONLY a JSON object.
    `;
    
    const mealPlanSchema = {
        type: Type.OBJECT,
        properties: {
             Monday: { type: Type.OBJECT, properties: { Breakfast: { type: Type.STRING }, Lunch: { type: Type.STRING }, Dinner: { type: Type.STRING } } },
             Tuesday: { type: Type.OBJECT, properties: { Breakfast: { type: Type.STRING }, Lunch: { type: Type.STRING }, Dinner: { type: Type.STRING } } },
             Wednesday: { type: Type.OBJECT, properties: { Breakfast: { type: Type.STRING }, Lunch: { type: Type.STRING }, Dinner: { type: Type.STRING } } },
             Thursday: { type: Type.OBJECT, properties: { Breakfast: { type: Type.STRING }, Lunch: { type: Type.STRING }, Dinner: { type: Type.STRING } } },
             Friday: { type: Type.OBJECT, properties: { Breakfast: { type: Type.STRING }, Lunch: { type: Type.STRING }, Dinner: { type: Type.STRING } } },
             Saturday: { type: Type.OBJECT, properties: { Breakfast: { type: Type.STRING }, Lunch: { type: Type.STRING }, Dinner: { type: Type.STRING } } },
             Sunday: { type: Type.OBJECT, properties: { Breakfast: { type: Type.STRING }, Lunch: { type: Type.STRING }, Dinner: { type: Type.STRING } } },
        },
    };

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: mealPlanSchema,
            },
        });
        return parseJsonResponse<any>(response.text);
    } catch (error) {
        console.error("Error generating meal plan:", error);
        return null;
    }
};