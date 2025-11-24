
import { GoogleGenAI, Type } from "@google/genai";
import type { Recipe, PantryItem } from "../types";

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
                    category: { type: Type.STRING, description: "Grocery aisle category e.g. Produce, Meat, Pantry Staples" }
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
        tags: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Relevant tags for filtering, e.g., 'Vegetarian', 'Quick', 'Spicy', 'Chicken'."
        }
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

    const prompt = `You are a creative chef. Invent a recipe using the following ingredients: ${ingredients}. Be creative and fill in any gaps with common pantry staples. Provide a complete recipe. Include useful tags (e.g., 'Vegetarian', 'Gluten-Free') in the response.`;

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

export const generateRecipeFromUrl = async (url: string): Promise<Partial<Recipe> | null> => {
    const client = getAiClient();
    if (!client) return null;

    const prompt = `You are an expert recipe parser. Based on the likely content of a recipe page at this URL, generate a full recipe.
    URL: ${url}
    
    Infer the ingredients, instructions, nutritional info, and tags (like 'Easy', 'Chicken', 'Dinner') and format it as a complete recipe JSON object. If the URL is generic, create a plausible recipe that would match the URL's title.`;

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
        console.error("Error generating recipe from URL:", error);
        return null;
    }
};

export const remixRecipe = async (recipe: Recipe, remixType: string): Promise<Partial<Recipe> | null> => {
    const client = getAiClient();
    if (!client) return null;
    
    const prompt = `You are a recipe modification expert. Take the following recipe and modify it to "${remixType}". Adjust ingredients, instructions, and tags accordingly.
    
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
    useFavorites: boolean,
    useHighestRated: boolean,
    caloriesPerDay: number,
    startDate: string,
    durationDays: number,
    includedSlots: string[],
    complexity: string = 'Moderate',
    dietaryRestrictions: string = ''
): Promise<any | null> => {
    const client = getAiClient();
    if (!client) return null;
    
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

export const suggestRecipesFromPantry = async (
    pantryItems: PantryItem[],
    existingRecipes: Recipe[]
): Promise<Array<{ recipeName: string; reason: string }> | null> => {
    const client = getAiClient();
    if (!client) return null;

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
        const response = await client.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: suggestionSchema,
            },
        });
        return parseJsonResponse<Array<{ recipeName: string; reason: string }>>(response.text);
    } catch (error) {
        console.error("Error suggesting recipes from pantry:", error);
        return null;
    }
};

export const generateRecipeImage = async (recipeName: string, description?: string): Promise<string | null> => {
    const client = getAiClient();
    if (!client) return null;

    const prompt = `Professional food photography of ${recipeName}. ${description || ''}. High resolution, appetizing, well-lit, restaurant quality, top-down view.`;

    try {
        const response = await client.models.generateContent({
            model: "gemini-2.5-flash-image",
            contents: {
                parts: [{ text: prompt }]
            }
        });
        if (response.candidates && response.candidates[0].content && response.candidates[0].content.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                }
            }
        }
        return null;
    } catch (error) {
        console.error("Error generating recipe image:", error);
        return null;
    }
};

// Chat with Sous Chef
export interface ChatMessage {
    role: 'user' | 'model';
    text: string;
}

export const chatWithSousChef = async (history: ChatMessage[], context: string): Promise<string | null> => {
    const client = getAiClient();
    if (!client) return "AI unavailable.";

    const systemInstruction = `You are a professional, witty, and helpful Sous Chef AI assistant called "KitchenSync AI".
    
    CURRENT CONTEXT:
    ${context}
    
    INSTRUCTIONS:
    - Answer questions specifically about the Current Context if provided (e.g., specific recipe details, pantry items).
    - If the user asks for substitutions, use the provided Pantry inventory if available in context.
    - Be concise, encouraging, and culinary-focused.
    - If asked about wine pairings, offer a sophisticated but accessible suggestion.
    - If asked about cooking techniques, explain them simply.
    `;

    try {
        // We construct the chat manually to include the specialized context in the system instruction
        // or as the first turn, but using the chat API is cleaner for history.
        const chat = client.chats.create({
            model: "gemini-2.5-flash",
            config: { systemInstruction },
            history: history.map(h => ({
                role: h.role,
                parts: [{ text: h.text }]
            }))
        });

        // The history is already loaded, we just need to send the *last* user message.
        // However, the caller passes the full history including the latest user message.
        // We need to separate them.
        const lastMessage = history[history.length - 1];
        if (lastMessage.role !== 'user') return null; // Should not happen based on UI logic

        // Important: create a new chat session effectively by not duplicating history.
        // To simplify: We will use generateContent with the full history as specific prompts.
        // Why? Because 'context' changes dynamically (different recipe pages), so a persistent chat session object
        // might hold onto stale system instructions. Stateless requests with full history are safer here.
        
        const contents = [
            ...history.map(msg => ({
                role: msg.role,
                parts: [{ text: msg.text }]
            }))
        ];

        const response = await client.models.generateContent({
            model: "gemini-2.5-flash",
            contents: contents,
            config: {
                systemInstruction: systemInstruction
            }
        });

        return response.text;
    } catch (error) {
        console.error("Error chatting with Sous Chef:", error);
        return "I'm having a bit of trouble hearing you over the kitchen noise. Could you try again?";
    }
};
