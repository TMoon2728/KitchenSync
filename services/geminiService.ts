
import { GoogleGenAI, Type } from "@google/genai";
import type { Recipe } from "../types";

let ai: GoogleGenAI | null = null;
let isInitialized = false;

// Lazily initialize the AI client to prevent startup crashes in environments
// where process.env is not available.
function getAiClient(): GoogleGenAI | null {
    if (isInitialized) {
        return ai;
    }

    isInitialized = true; // Attempt initialization only once

    try {
        // Robustly check for the API key without causing a ReferenceError.
        // This is safe to run in any browser environment.
        if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
            ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        } else {
            console.warn("Gemini API key not found or 'process.env' is not available. AI features will be disabled.");
        }
    } catch (error) {
        console.error("An unexpected error occurred during AI client initialization:", error);
        ai = null; // Ensure ai is null on error
    }
    
    return ai;
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
    const client = getAiClient();
    if (!client) return null;

    const prompt = `You are a creative chef. Invent a recipe using the following ingredients: ${ingredients}. Be creative and fill in any gaps with common pantry staples. Provide a complete recipe.`;

    try {
        const response = await client.models.generateContent({
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
    const client = getAiClient();
    if (!client) return null;
    
    const prompt = `You are a recipe modification expert. Take the following recipe and modify it to "${remixType}". Adjust ingredients and instructions accordingly.
    
    Original Recipe:
    ${JSON.stringify(recipe, null, 2)}
    
    Generate the new, modified recipe. The name of the recipe should reflect the change, e.g., "Healthier ${recipe.name}" or "${recipe.name} (Vegan)".`;

    try {
        const response = await client.models.generateContent({
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
    const client = getAiClient();
    if (!client) return null;
    
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
        const response = await client.models.generateContent({
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
