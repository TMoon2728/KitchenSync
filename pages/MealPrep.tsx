
import React, { useState, useMemo } from 'react';
import type { Ingredient } from '../types';
import { useKitchen } from '../context/KitchenContext';

const MealPrep: React.FC = () => {
    const { recipes, addManualShoppingItem } = useKitchen();
    const [selectedRecipes, setSelectedRecipes] = useState<{ [recipeId: number]: number }>({});
    const [prepPlan, setPrepPlan] = useState<PrepPlan | null>(null);
    const [isAdded, setIsAdded] = useState(false);
    const [isAdding, setIsAdding] = useState(false);

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
        setIsAdded(false);
    };

    const handleServingsChange = (recipeId: number, servings: number) => {
        setSelectedRecipes(prev => ({
            ...prev,
            [recipeId]: servings > 0 ? servings : 1,
        }));
        setPrepPlan(null);
        setIsAdded(false);
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
        setIsAdded(false);
    };

    const handleAddToShoppingList = async () => {
        if (!prepPlan) return;
        setIsAdding(true);

        try {
            // Push all mapped ingredients to the manualShoppingList context
            for (const item of prepPlan.shoppingList) {
                await addManualShoppingItem({
                    name: item.name,
                    quantity: Number(item.quantity.toFixed(2)),
                    unit: item.unit || '',
                    is_checked: false,
                    is_ai_generated: false,
                    added_at: new Date().toISOString()
                });
            }
            setIsAdded(true);
        } catch (error) {
            console.error("Failed to add to shopping list", error);
        } finally {
            setIsAdding(false);
        }
    };

    const mealPrepRecipes = useMemo(() => recipes.filter(r => r.meal_type === 'Meal Prep' || r.meal_type === 'Main Course'), [recipes]);

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="text-center">
                <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100 flex items-center justify-center">
                    <i className="fas fa-layer-group mr-3 text-green-500"></i>Meal Prep Planner
                </h1>
                <p className="text-gray-600 dark:text-gray-300 mt-2">Plan your batch cooking session. Select recipes, set total servings, and generate your plan.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-gray-800 dark:text-gray-100 p-6 rounded-lg shadow-md flex flex-col">
                    <h2 className="text-xl font-bold mb-4">1. Select Prep Recipes</h2>
                    <div className="space-y-4 flex-grow overflow-y-auto pr-2">
                        {mealPrepRecipes.length > 0 ? mealPrepRecipes.map(recipe => (
                            <div key={recipe.id} className="flex items-center gap-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-md">
                                <input
                                    type="checkbox"
                                    id={`recipe-${recipe.id}`}
                                    checked={!!selectedRecipes[recipe.id]}
                                    onChange={(e) => handleSelectRecipe(recipe.id, e.target.checked)}
                                    className="h-5 w-5 rounded border-gray-300 dark:border-gray-600 text-green-600 focus:ring-green-500 bg-white dark:bg-gray-800 dark:text-gray-100"
                                />
                                <label htmlFor={`recipe-${recipe.id}`} className="font-semibold flex-grow">{recipe.name}</label>
                                {selectedRecipes[recipe.id] && (
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            min="1"
                                            value={selectedRecipes[recipe.id]}
                                            onChange={(e) => handleServingsChange(recipe.id, parseInt(e.target.value, 10))}
                                            className="form-input dark:bg-gray-700 dark:text-white dark:border-gray-600 w-20 p-1 border border-gray-300 dark:border-gray-600 rounded-md text-center bg-white dark:bg-gray-800 dark:text-gray-100 text-gray-900 dark:text-gray-50"
                                        />
                                        <span className="text-sm text-gray-600 dark:text-gray-300">servings</span>
                                    </div>
                                )}
                            </div>
                        )) : <p className="text-gray-500 dark:text-gray-400 text-center">No meal prep recipes found.</p>}
                    </div>
                    <button
                        onClick={generatePrepPlan}
                        disabled={Object.keys(selectedRecipes).length === 0}
                        className="w-full mt-6 bg-green-500 text-white py-3 rounded-md font-semibold hover:bg-green-600 transition-colors disabled:bg-green-300 flex justify-center items-center"
                    >
                        2. Generate Prep Plan
                    </button>
                </div>

                <div className="bg-white dark:bg-gray-800 dark:text-gray-100 p-6 rounded-lg shadow-md">
                    <h2 className="text-xl font-bold mb-4">3. Your Prep Plan</h2>
                    {!prepPlan && (
                        <div className="text-center text-gray-500 dark:text-gray-400 h-full flex items-center justify-center">
                            <p>Your shopping list and nutrition info will appear here.</p>
                        </div>
                    )}
                    {prepPlan && (
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-lg font-semibold mb-2 flex items-center"><i className="fas fa-cart-shopping mr-2 text-green-500"></i>Combined Shopping List</h3>
                                {prepPlan.shoppingList.length > 0 ? (
                                    <ul className="space-y-2 max-h-60 overflow-y-auto bg-gray-50 dark:bg-gray-700/50 p-3 rounded-md">
                                        {prepPlan.shoppingList.map(item => (
                                            <li key={`${item.name}-${item.unit}`} className="flex justify-between text-sm">
                                                <span>{item.name}</span>
                                                <span className="font-mono text-gray-700 dark:text-gray-200">{item.quantity.toFixed(2)} {item.unit}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Nothing to shop for!</p>
                                )}
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold mb-2 flex items-center"><i className="fas fa-chart-pie mr-2 text-green-500"></i>Nutritional Totals</h3>
                                <div className="grid grid-cols-2 gap-4 bg-gray-50 dark:bg-gray-700/50 p-3 rounded-md">
                                    <div className="text-center">
                                        <p className="text-sm text-gray-600 dark:text-gray-300">Calories</p>
                                        <p className="font-bold text-lg">{prepPlan.nutrition.calories.toLocaleString()}</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-sm text-gray-600 dark:text-gray-300">Protein</p>
                                        <p className="font-bold text-lg">{prepPlan.nutrition.protein.toFixed(0)}g</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-sm text-gray-600 dark:text-gray-300">Fat</p>
                                        <p className="font-bold text-lg">{prepPlan.nutrition.fat.toFixed(0)}g</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-sm text-gray-600 dark:text-gray-300">Carbs</p>
                                        <p className="font-bold text-lg">{prepPlan.nutrition.carbs.toFixed(0)}g</p>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                                <button
                                    onClick={handleAddToShoppingList}
                                    disabled={isAdded || isAdding}
                                    className={`w-full py-3 rounded-md font-bold text-white transition-colors shadow-sm flex justify-center items-center ${isAdded ? 'bg-indigo-500' : 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300'}`}
                                >
                                    {isAdding ? (
                                        <><i className="fas fa-spinner fa-spin mr-2"></i>Sending to List...</>
                                    ) : isAdded ? (
                                        <><i className="fas fa-check-circle mr-2"></i>Added to Shopping List!</>
                                    ) : (
                                        <><i className="fas fa-paper-plane mr-2"></i>Send to Shopping List</>
                                    )}
                                </button>
                                {isAdded && (
                                    <div className="mt-3 text-center text-sm font-medium text-blue-600">
                                        <a href="#/shopping-list" className="hover:underline">View Shopping List <i className="fas fa-arrow-right text-xs ml-1"></i></a>
                                    </div>
                                )}
                            </div>

                            <div className="text-xs text-gray-500 dark:text-gray-400 italic text-center mt-4">
                                <p>Once done, head to the <a href="#/planner" className="text-blue-600 underline">Meal Planner</a> to schedule your prepped meals for the week.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MealPrep;
