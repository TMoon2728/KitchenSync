
import React, { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

import type { MealPlan, PantryItem, Recipe, UserProfile } from '../types'; // Keep types for internal logic if needed
import { useKitchen } from '../context/KitchenContext';
import { useUser } from '../context/UserContext';
import confetti from 'canvas-confetti';

interface NeededIngredient {
    name: string;
    quantity: number;
    unit: string;
    category: string;
}

const ShoppingList: React.FC = () => {
    const { mealPlan, pantry, recipes } = useKitchen();
    const { userProfile } = useUser();
    const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

    const [showStoreLinks, setShowStoreLinks] = useState(false);

    const shoppingList: { [category: string]: NeededIngredient[] } = useMemo(() => {
        const needed: { [key: string]: NeededIngredient } = {};

        // Aggregate all ingredients from the meal plan
        Object.values(mealPlan).forEach(dayPlan => {
            Object.values(dayPlan).forEach(slotItems => {
                slotItems.forEach(item => {
                    const recipe = recipes.find(r => r.id === item.recipeId);
                    if (recipe) {
                        recipe.ingredients.forEach(ing => {
                            const key = `${ing.name.toLowerCase()}-${ing.unit.toLowerCase()}`;
                            if (!needed[key]) {
                                needed[key] = { name: ing.name, quantity: 0, unit: ing.unit, category: ing.category || 'Other' };
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

        // Filter out items we have enough of and group by category
        const filteredList = Object.values(needed).filter(item => item.quantity > 0);

        const groupedList = filteredList.reduce((acc, item) => {
            const category = item.category || 'Other';
            if (!acc[category]) {
                acc[category] = [];
            }
            acc[category].push(item);
            return acc;
        }, {} as { [category: string]: NeededIngredient[] });

        // Sort categories for consistent order
        return Object.keys(groupedList).sort().reduce((acc, key) => {
            acc[key] = groupedList[key];
            return acc;
        }, {} as { [category: string]: NeededIngredient[] });

    }, [mealPlan, pantry, recipes]);

    // Stats for Gamification
    const totalItems = (Object.values(shoppingList) as NeededIngredient[][]).reduce((acc: number, items: NeededIngredient[]) => acc + items.length, 0);
    const completedItems = Array.from(checkedItems).filter(item => {
        // Only count if item is actually in current list (avoid stale state issues)
        return (Object.values(shoppingList) as NeededIngredient[][]).some(list => list.some(i => i.name === item));
    }).length;

    const progress = (totalItems as number) > 0 ? (completedItems / (totalItems as number)) * 100 : 0;

    // Celebration Effect
    useEffect(() => {
        if (totalItems > 0 && completedItems === totalItems && userProfile.preferences?.enableConfetti !== false) {
            const intensity = userProfile.preferences?.confettiIntensity || 'medium';
            const count = intensity === 'low' ? 50 : intensity === 'high' ? 300 : 150;
            confetti({
                particleCount: count,
                spread: 100,
                origin: { y: 0.3 },
                colors: ['#22c55e', '#ffffff'] // Green and White
            });
        }
    }, [completedItems, totalItems, userProfile.preferences]);

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

    const listHasItems = Object.keys(shoppingList).length > 0;

    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Shopping Mission</h1>
                    <p className="text-gray-500 text-sm">Gather supplies for the week ahead.</p>
                </div>

                <div className="flex gap-2 relative">
                    {/* Store Links Dropdown/Button */}
                    <div className="relative">
                        <button
                            onClick={() => setShowStoreLinks(!showStoreLinks)}
                            className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-xl font-bold hover:bg-gray-50 transition-colors flex items-center shadow-sm"
                        >
                            <i className="fas fa-shopping-cart mr-2 text-green-500"></i> Stores <i className="fas fa-chevron-down ml-2 text-xs"></i>
                        </button>

                        {showStoreLinks && (
                            <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl py-2 z-20 border border-gray-100 animate-scale-in">
                                <div className="px-4 py-2 text-xs text-gray-400 font-bold uppercase tracking-wider">
                                    Your Stores
                                </div>
                                {userProfile.groceryStores.length > 0 ? (
                                    userProfile.groceryStores.map(store => (
                                        <a
                                            key={store.id}
                                            href={store.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block px-4 py-3 text-sm text-gray-700 hover:bg-green-50 hover:text-green-700 transition-colors flex justify-between items-center group"
                                        >
                                            <span className="font-semibold">{store.name}</span>
                                            <i className="fas fa-external-link-alt text-xs text-gray-300 group-hover:text-green-500"></i>
                                        </a>
                                    ))
                                ) : (
                                    <div className="px-4 py-3 text-sm text-gray-500 italic">
                                        No stores configured. <br />
                                        <Link to="/profile" className="text-blue-500 hover:underline">Add in Profile</Link>
                                    </div>

                                )}
                            </div>
                        )}
                    </div>

                    <button onClick={() => window.print()} className="bg-blue-600 text-white px-5 py-2 rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg">
                        <i className="fas fa-print mr-2"></i> Print
                    </button>
                </div>
            </div>

            {/* Gamified Progress Bar */}
            {listHasItems && (
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-end mb-2">
                        <div>
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Mission Progress</span>
                            <div className="flex items-baseline gap-1">
                                <span className="text-2xl font-black text-gray-800">{completedItems}</span>
                                <span className="text-gray-400 font-medium">/ {totalItems} items</span>
                            </div>
                        </div>
                        {progress === 100 && (
                            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold animate-pulse">
                                Mission Complete!
                            </span>
                        )}
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-4 overflow-hidden">
                        <div
                            className={`h-4 rounded-full transition-all duration-700 ease-out relative ${progress === 100 ? 'bg-green-500' : 'bg-gradient-to-r from-blue-500 to-indigo-600'}`}
                            style={{ width: `${progress}%` }}
                        >
                            <div className="absolute inset-0 bg-white opacity-20 animate-pulse"></div>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-white p-6 rounded-2xl shadow-md border border-gray-100 min-h-[400px]">
                {listHasItems ? (
                    <div className="space-y-8">
                        {Object.entries(shoppingList).map(([category, items]) => (
                            <div key={category} className="animate-slide-up">
                                <h3 className="font-bold text-lg text-gray-800 mb-3 flex items-center">
                                    <span className="w-2 h-8 bg-blue-500 rounded-r-full mr-3"></span>
                                    {category}
                                </h3>
                                <div className="space-y-2 pl-4">
                                    {items.map(item => {
                                        const isChecked = checkedItems.has(item.name);
                                        return (
                                            <div
                                                key={item.name}
                                                onClick={() => handleCheck(item.name)}
                                                className={`flex items-center p-3 rounded-xl border-2 transition-all cursor-pointer group select-none ${isChecked
                                                    ? 'bg-gray-50 border-gray-100 opacity-60 grayscale'
                                                    : 'bg-white border-gray-100 hover:border-blue-200 hover:shadow-sm'
                                                    }`}
                                            >
                                                <div className={`w-6 h-6 rounded-md border-2 mr-4 flex items-center justify-center transition-colors ${isChecked ? 'bg-green-500 border-green-500' : 'border-gray-300 group-hover:border-blue-400'}`}>
                                                    {isChecked && <i className="fas fa-check text-white text-xs"></i>}
                                                </div>
                                                <div className="flex-grow">
                                                    <span className={`font-semibold text-base block ${isChecked ? 'text-gray-500 line-through decoration-2' : 'text-gray-800'}`}>
                                                        {item.name}
                                                    </span>
                                                </div>
                                                <span className={`text-sm font-bold px-3 py-1 rounded-full ${isChecked ? 'bg-gray-200 text-gray-500' : 'bg-blue-50 text-blue-600'}`}>
                                                    {item.quantity.toFixed(2)} {item.unit}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-96 text-center">
                        <div className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center mb-6">
                            <i className="fas fa-check-double text-4xl text-green-300"></i>
                        </div>
                        <h2 className="text-2xl font-bold text-gray-800 mb-2">All Clear!</h2>
                        <p className="text-gray-500 max-w-sm">Your shopping list is empty. Plan some meals to generate your mission objectives.</p>
                        <a href="#/planner" className="mt-6 text-blue-600 font-bold hover:underline">Go to Meal Planner</a>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ShoppingList;
