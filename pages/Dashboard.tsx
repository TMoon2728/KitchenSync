
import React, { useState, useMemo } from 'react';
import type { Recipe, PantryItem, MealPlan } from '../types';
import { generateRecipeFromIngredients } from '../services/geminiService';
import Spinner from '../components/Spinner';

interface DashboardProps {
  recipes: Recipe[];
  pantry: PantryItem[];
  mealPlan: MealPlan;
}

const StatCard: React.FC<{ icon: string; title: string; value: string | number; color: string }> = ({ icon, title, value, color }) => (
    <div className="bg-white p-4 rounded-lg shadow-md flex items-center">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${color}`}>
            <i className={`fas ${icon} text-white text-xl`}></i>
        </div>
        <div className="ml-4">
            <p className="text-gray-500 text-sm">{title}</p>
            <p className="text-xl font-bold">{value}</p>
        </div>
    </div>
);


const Dashboard: React.FC<DashboardProps> = ({ recipes, pantry, mealPlan }) => {
    const [aiIngredients, setAiIngredients] = useState('');
    const [generatedRecipe, setGeneratedRecipe] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const kitchenStats = useMemo(() => {
        const pantryItemNames = new Set(pantry.map(item => item.name.toLowerCase()));
        const recipesCanMake = recipes.filter(recipe => 
            recipe.ingredients.every(ing => pantryItemNames.has(ing.name.toLowerCase()))
        ).length;
        
        return {
            totalRecipes: recipes.length,
            pantryItems: pantry.length,
            favoriteRecipes: recipes.filter(r => r.is_favorite).length,
            recipesCanMake: recipesCanMake
        };
    }, [recipes, pantry]);

    const handleGenerateRecipe = async () => {
        if (!aiIngredients.trim()) {
            setError("Please enter some ingredients.");
            return;
        }
        setIsLoading(true);
        setError(null);
        setGeneratedRecipe(null);
        try {
            const result = await generateRecipeFromIngredients(aiIngredients);
            if (result) {
                const displayText = `**${result.name}**\n\n**Ingredients:**\n${result.ingredients?.map(ing => `- ${ing.quantity} ${ing.unit} ${ing.name}`).join('\n')}\n\n**Instructions:**\n${result.instructions}`;
                setGeneratedRecipe(displayText);
            } else {
                setError("Failed to generate a recipe. The AI might be busy. Please try again.");
            }
        } catch (e) {
            setError("An unexpected error occurred.");
        } finally {
            setIsLoading(false);
        }
    };
    
    // A simplified version of getting tonight's dinner
    const getTodaysDinner = () => {
        const today = new Date().toISOString().split('T')[0];
        const todayPlan = mealPlan[today];
        if (todayPlan && todayPlan['Dinner'] && todayPlan['Dinner'].length > 0) {
            const dinnerRecipe = recipes.find(r => r.id === todayPlan['Dinner'][0].recipeId);
            return dinnerRecipe;
        }
        return null;
    }

    const todaysDinner = getTodaysDinner();

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">Welcome, Chef!</h1>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard icon="fa-book-open" title="Total Recipes" value={kitchenStats.totalRecipes} color="bg-blue-500" />
                <StatCard icon="fa-box-open" title="Pantry Items" value={kitchenStats.pantryItems} color="bg-green-500" />
                <StatCard icon="fa-heart" title="Favorite Recipes" value={kitchenStats.favoriteRecipes} color="bg-red-500" />
                <StatCard icon="fa-utensils" title="Recipes You Can Make" value={kitchenStats.recipesCanMake} color="bg-yellow-500" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-md">
                     <h2 className="text-xl font-bold mb-4 flex items-center"><i className="fas fa-calendar-check mr-2 text-blue-500"></i>Dinner Tonight</h2>
                     {todaysDinner ? (
                         <div>
                             <h3 className="text-2xl font-semibold text-blue-700">{todaysDinner.name}</h3>
                             <p className="text-gray-600 mt-2 line-clamp-3">{todaysDinner.instructions}</p>
                         </div>
                     ) : (
                         <div className="text-center py-8">
                             <p className="text-gray-500">Nothing planned for dinner yet!</p>
                             <button className="mt-4 bg-blue-500 text-white px-6 py-2 rounded-full font-semibold hover:bg-blue-600 transition-colors">Plan Dinner</button>
                         </div>
                     )}
                </div>

                <div className="bg-white p-6 rounded-lg shadow-md flex flex-col">
                    <h2 className="text-xl font-bold mb-2 flex items-center"><i className="fas fa-magic mr-2 text-purple-500"></i>Culinary Alchemist</h2>
                    <p className="text-sm text-gray-500 mb-4">Have ingredients? The AI will invent a recipe for you!</p>
                    <textarea
                        id="fridge-ingredients"
                        className="form-input w-full p-2 border border-gray-300 rounded-md flex-grow focus:ring-purple-500 focus:border-purple-500"
                        placeholder="e.g., chicken breast, 1 onion, soy sauce..."
                        value={aiIngredients}
                        onChange={(e) => setAiIngredients(e.target.value)}
                    ></textarea>
                    <button
                        onClick={handleGenerateRecipe}
                        disabled={isLoading}
                        className="mt-4 w-full bg-purple-500 text-white px-4 py-2 rounded-full font-semibold hover:bg-purple-600 transition-colors disabled:bg-purple-300"
                    >
                        {isLoading ? <Spinner size="sm" /> : "Generate Recipe"}
                    </button>
                    {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
                    {generatedRecipe && (
                        <div className="mt-4 p-4 bg-purple-50 rounded-md text-sm text-gray-700 max-h-48 overflow-y-auto">
                            <pre className="whitespace-pre-wrap font-sans">{generatedRecipe}</pre>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
