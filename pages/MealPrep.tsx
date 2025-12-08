
import React, { useState, useMemo } from 'react';
import type { Ingredient } from '../types';
import { useKitchen } from '../context/KitchenContext';

const MealPrep: React.FC = () => {
    const { recipes } = useKitchen();
    const [selectedRecipes, setSelectedRecipes] = useState<{ [recipeId: number]: number }>({});
    const [prepPlan, setPrepPlan] = useState<PrepPlan | null>(null);

    const handleSelectRecipe = (recipeId: number, isChecked: boolean) => {
        setSelectedRecipes(prev => {
            const newSelection = { ...prev };
            if (isChecked) {
                const recipe = recipes.find(r => r.id === recipeId);
                newSelection[recipeId] = recipe ? recipe.servings : 1;
            } else {
                delete newSelection[recipeId];
            }
            return newSelection;
        });
        setPrepPlan(null);
    };

    const handleServingsChange = (recipeId: number, servings: number) => {
        setSelectedRecipes(prev => ({
            ...prev,
            [recipeId]: servings > 0 ? servings : 1,
        }));
        setPrepPlan(null);
    };



    interface NeededIngredient extends Ingredient { }

    interface PrepPlan {
        shoppingList: NeededIngredient[];
        nutrition: {
            calories: number;
            protein: number;
            fat: number;
            carbs: number;
        };
    }

    const generatePrepPlan = () => {
        const shoppingList: { [key: string]: NeededIngredient } = {};
        const totalNutrition = { calories: 0, protein: 0, fat: 0, carbs: 0 };

        Object.entries(selectedRecipes).forEach(([recipeId, val]) => {
            const desiredServings = val as number;
            const recipe = recipes.find(r => r.id === Number(recipeId));
            if (!recipe) return;

            const scaleFactor = desiredServings / recipe.servings;

            totalNutrition.calories += (recipe.calories || 0) * desiredServings;
            totalNutrition.protein += (recipe.protein || 0) * desiredServings;
            totalNutrition.fat += (recipe.fat || 0) * desiredServings;
            totalNutrition.carbs += (recipe.carbs || 0) * desiredServings;

            recipe.ingredients.forEach(ing => {
                const scaledQuantity = ing.quantity * scaleFactor;
                const key = `${ing.name.toLowerCase()}-${ing.unit.toLowerCase()}`;

                if (shoppingList[key]) {
                    shoppingList[key].quantity += scaledQuantity;
                } else {
                    shoppingList[key] = { ...ing, quantity: scaledQuantity };
                }
            });
        });

        setPrepPlan({
            shoppingList: Object.values(shoppingList).sort((a, b) => a.name.localeCompare(b.name)),
            nutrition: totalNutrition,
        });
    };

    const mealPrepRecipes = useMemo(() => recipes.filter(r => r.meal_type === 'Meal Prep' || r.meal_type === 'Main Course'), [recipes]);

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="text-center">
                <h1 className="text-3xl font-bold text-gray-800 flex items-center justify-center">
                    <i className="fas fa-layer-group mr-3 text-green-500"></i>Meal Prep Planner
                </h1>
                <p className="text-gray-600 mt-2">Plan your batch cooking session. Select recipes, set total servings, and generate your plan.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-lg shadow-md flex flex-col">
                    <h2 className="text-xl font-bold mb-4">1. Select Prep Recipes</h2>
                    <div className="space-y-4 flex-grow overflow-y-auto pr-2">
                        {mealPrepRecipes.length > 0 ? mealPrepRecipes.map(recipe => (
                            <div key={recipe.id} className="flex items-center gap-4 p-3 bg-gray-50 rounded-md">
                                <input
                                    type="checkbox"
                                    id={`recipe-${recipe.id}`}
                                    checked={!!selectedRecipes[recipe.id]}
                                    onChange={(e) => handleSelectRecipe(recipe.id, e.target.checked)}
                                    className="h-5 w-5 rounded border-gray-300 text-green-600 focus:ring-green-500 bg-white"
                                />
                                <label htmlFor={`recipe-${recipe.id}`} className="font-semibold flex-grow">{recipe.name}</label>
                                {selectedRecipes[recipe.id] && (
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            min="1"
                                            value={selectedRecipes[recipe.id]}
                                            onChange={(e) => handleServingsChange(recipe.id, parseInt(e.target.value, 10))}
                                            className="form-input w-20 p-1 border border-gray-300 rounded-md text-center bg-white text-gray-900"
                                        />
                                        <span className="text-sm text-gray-600">servings</span>
                                    </div>
                                )}
                            </div>
                        )) : <p className="text-gray-500 text-center">No meal prep recipes found.</p>}
                    </div>
                    <button
                        onClick={generatePrepPlan}
                        disabled={Object.keys(selectedRecipes).length === 0}
                        className="w-full mt-6 bg-green-500 text-white py-3 rounded-md font-semibold hover:bg-green-600 transition-colors disabled:bg-green-300 flex justify-center items-center"
                    >
                        2. Generate Prep Plan
                    </button>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-md">
                    <h2 className="text-xl font-bold mb-4">3. Your Prep Plan</h2>
                    {!prepPlan && (
                        <div className="text-center text-gray-500 h-full flex items-center justify-center">
                            <p>Your shopping list and nutrition info will appear here.</p>
                        </div>
                    )}
                    {prepPlan && (
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-lg font-semibold mb-2 flex items-center"><i className="fas fa-cart-shopping mr-2 text-green-500"></i>Combined Shopping List</h3>
                                {prepPlan.shoppingList.length > 0 ? (
                                    <ul className="space-y-2 max-h-60 overflow-y-auto bg-gray-50 p-3 rounded-md">
                                        {prepPlan.shoppingList.map(item => (
                                            <li key={`${item.name}-${item.unit}`} className="flex justify-between text-sm">
                                                <span>{item.name}</span>
                                                <span className="font-mono text-gray-700">{item.quantity.toFixed(2)} {item.unit}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-sm text-gray-500">Nothing to shop for!</p>
                                )}
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold mb-2 flex items-center"><i className="fas fa-chart-pie mr-2 text-green-500"></i>Nutritional Totals</h3>
                                <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-md">
                                    <div className="text-center">
                                        <p className="text-sm text-gray-600">Calories</p>
                                        <p className="font-bold text-lg">{prepPlan.nutrition.calories.toLocaleString()}</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-sm text-gray-600">Protein</p>
                                        <p className="font-bold text-lg">{prepPlan.nutrition.protein.toFixed(0)}g</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-sm text-gray-600">Fat</p>
                                        <p className="font-bold text-lg">{prepPlan.nutrition.fat.toFixed(0)}g</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-sm text-gray-600">Carbs</p>
                                        <p className="font-bold text-lg">{prepPlan.nutrition.carbs.toFixed(0)}g</p>
                                    </div>
                                </div>
                            </div>
                            <div className="text-xs text-gray-500 italic text-center">
                                <p>Now, go shopping and start cooking! Once done, head to the <a href="#/planner" className="text-blue-600 underline">Meal Planner</a> to schedule your prepped meals for the week.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MealPrep;
