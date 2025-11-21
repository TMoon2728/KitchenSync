
import React, { useMemo, useState } from 'react';
import type { MealPlan, PantryItem } from '../types';
import { MOCK_RECIPES } from '../mockData'; // In a real app, recipes would be passed as props

interface ShoppingListProps {
    mealPlan: MealPlan;
    pantry: PantryItem[];
}

interface NeededIngredient {
    name: string;
    quantity: number;
    unit: string;
}

const ShoppingList: React.FC<ShoppingListProps> = ({ mealPlan, pantry }) => {
    const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

    const shoppingList = useMemo(() => {
        const needed: { [key: string]: NeededIngredient } = {};

        // Aggregate all ingredients from the meal plan
        Object.values(mealPlan).forEach(dayPlan => {
            Object.values(dayPlan).forEach(slotItems => {
                slotItems.forEach(item => {
                    const recipe = MOCK_RECIPES.find(r => r.id === item.recipeId);
                    if (recipe) {
                        recipe.ingredients.forEach(ing => {
                            const key = `${ing.name.toLowerCase()}-${ing.unit.toLowerCase()}`;
                            if (!needed[key]) {
                                needed[key] = { name: ing.name, quantity: 0, unit: ing.unit };
                            }
                            needed[key].quantity += ing.quantity;
                        });
                    }
                });
            });
        });

        // Subtract pantry items
        pantry.forEach(pantryItem => {
            const key = `${pantryItem.name.toLowerCase()}-${pantryItem.unit.toLowerCase()}`;
            if (needed[key]) {
                needed[key].quantity -= pantryItem.quantity;
            }
        });
        
        // Filter out items we have enough of
        return Object.values(needed).filter(item => item.quantity > 0);
    }, [mealPlan, pantry]);
    
    const handleCheck = (itemName: string) => {
        setCheckedItems(prev => {
            const newSet = new Set(prev);
            if (newSet.has(itemName)) {
                newSet.delete(itemName);
            } else {
                newSet.add(itemName);
            }
            return newSet;
        });
    };

    return (
         <div className="max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800">Shopping List</h1>
                <button onClick={() => window.print()} className="bg-blue-500 text-white px-4 py-2 rounded-md font-semibold hover:bg-blue-600 transition-colors">
                    <i className="fas fa-print mr-2"></i>Print
                </button>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md">
                <h2 className="text-xl font-bold mb-4">What You Need to Buy</h2>
                {shoppingList.length > 0 ? (
                    <ul className="space-y-3">
                        {shoppingList.map(item => (
                            <li key={item.name} className={`flex items-center p-3 rounded-md transition-colors ${checkedItems.has(item.name) ? 'bg-gray-200 text-gray-500 line-through' : 'bg-gray-50'}`}>
                               <input 
                                    type="checkbox" 
                                    id={`item-${item.name}`}
                                    checked={checkedItems.has(item.name)}
                                    onChange={() => handleCheck(item.name)}
                                    className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <label htmlFor={`item-${item.name}`} className="ml-3 flex-grow">
                                    <span className="font-semibold">{item.name}</span>
                                </label>
                                <span className="text-gray-600">{item.quantity.toFixed(2)} {item.unit}</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-center text-gray-500 py-8">Your shopping list is empty. Add recipes to your meal plan!</p>
                )}
            </div>
        </div>
    );
};

export default ShoppingList;
