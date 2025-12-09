
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
    const { mealPlan, pantry, recipes, batchAddPantryItems } = useKitchen();
    const { userProfile, isAuthenticated, getAccessToken } = useUser();
    const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

    const [showStoreLinks, setShowStoreLinks] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const [scanResult, setScanResult] = useState<{ matched: string[]; extra: any[] } | null>(null);

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

    const handleFinishShopping = async () => {
        if (checkedItems.size === 0) return;

        const itemsToAdd: Omit<PantryItem, 'id'>[] = [];
        const flatList = Object.values(shoppingList).flat();

        flatList.forEach(item => {
            if (checkedItems.has(item.name)) {
                itemsToAdd.push({
                    name: item.name,
                    quantity: item.quantity,
                    unit: item.unit,
                    category: item.category,
                    expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // Default 7 days
                });
            }
        });

        await batchAddPantryItems(itemsToAdd);
        setCheckedItems(new Set());
        // Trigger confetti again? Or a different success toast?
        alert(`Moved ${itemsToAdd.length} items to your Pantry!`);
    };

    const handleReceiptCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsScanning(true);
        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64 = reader.result as string;

            // Current flat list for context
            const currentList = Object.values(shoppingList).flat().map(i => i.name);

            try {
                // We need to use authFetch or similar that handles the token automatically
                // But authFetch is in utils/api.ts. Let's assume it's available or imported.
                // Wait, useKitchen uses it, but we can import it directly.
                const { authFetch } = await import('../utils/api');
                const token = await getAccessToken();

                const res = await authFetch('/api/ai/analyze-receipt', {
                    method: 'POST',
                    body: JSON.stringify({
                        image: base64,
                        currentShoppingList: currentList
                    }),
                    token
                });

                if (res.ok) {
                    const data = await res.json();
                    setScanResult(data.result);

                    // Auto-check matched items
                    if (data.result.matched) {
                        setCheckedItems(prev => {
                            const newSet = new Set(prev);
                            data.result.matched.forEach((m: string) => newSet.add(m));
                            return newSet;
                        });
                    }
                } else {
                    alert("Receipt analysis failed. Please try again.");
                }
            } catch (error) {
                console.error("Scan failed", error);
                alert("Error scanning receipt.");
            } finally {
                setIsScanning(false);
            }
        };
        reader.readAsDataURL(file);
    };

    const listHasItems = Object.keys(shoppingList).length > 0;

    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Shopping Mission</h1>
                    <p className="text-gray-500 text-sm">Gather supplies for the week ahead.</p>
                </div>

                <div className="flex gap-2 relative items-center">
                    {/* Scan Receipt Button */}
                    <div className="relative">
                        <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            id="receipt-upload"
                            className="hidden"
                            onChange={handleReceiptCapture}
                            disabled={isScanning}
                        />
                        <label
                            htmlFor="receipt-upload"
                            className={`cursor-pointer bg-indigo-100 text-indigo-700 px-4 py-2 rounded-xl font-bold hover:bg-indigo-200 transition-colors flex items-center shadow-sm ${isScanning ? 'opacity-50 cursor-wait' : ''}`}
                        >
                            {isScanning ? <i className="fas fa-spinner fa-spin mr-2"></i> : <i className="fas fa-camera mr-2"></i>}
                            {isScanning ? 'Analyzing...' : 'Scan Receipt'}
                        </label>
                    </div>

                    {/* Finish Shopping Button (Visible when items checked) */}
                    {checkedItems.size > 0 && (
                        <button
                            onClick={handleFinishShopping}
                            className="bg-green-600 text-white px-5 py-2 rounded-xl font-bold hover:bg-green-700 transition-colors shadow-md hover:shadow-lg animate-fade-in"
                        >
                            <i className="fas fa-check-circle mr-2"></i> Finish ({checkedItems.size})
                        </button>
                    )}

                    {/* Store Links Dropdown/Button */}
                    <div className="relative">
                        <button
                            onClick={() => setShowStoreLinks(!showStoreLinks)}
                            className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-xl font-bold hover:bg-gray-50 transition-colors flex items-center shadow-sm"
                        >
                            <i className="fas fa-shopping-cart mr-2 text-green-500"></i> <span className="hidden sm:inline">Stores</span> <i className="fas fa-chevron-down ml-2 text-xs"></i>
                        </button>

                        {showStoreLinks && (
                            <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl py-2 z-20 border border-gray-100 animate-scale-in">
                                <div className="px-4 py-2 text-xs text-gray-400 font-bold uppercase tracking-wider">
                                    Your Stores
                                </div>
                                {userProfile?.groceryStores?.length > 0 ? (
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

                    <button onClick={() => window.print()} className="bg-blue-600 text-white px-5 py-2 rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg hidden sm:flex">
                        <i className="fas fa-print mr-2"></i> Print
                    </button>
                </div>
            </div>

            {/* Receipt Scan Results */}
            {scanResult && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-6 animate-fade-in relative">
                    <button
                        onClick={() => setScanResult(null)}
                        className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                    >
                        <i className="fas fa-times"></i>
                    </button>
                    <h3 className="text-xl font-bold text-indigo-900 mb-4 flex items-center">
                        <i className="fas fa-receipt mr-3"></i> Receipt Analysis
                    </h3>

                    <div className="grid md:grid-cols-2 gap-6">
                        <div>
                            <h4 className="font-bold text-green-700 mb-2">Matched & Checked ({scanResult.matched?.length || 0})</h4>
                            <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                                {scanResult.matched?.map((item, idx) => (
                                    <li key={idx}>{item}</li>
                                ))}
                            </ul>
                        </div>
                        <div>
                            <h4 className="font-bold text-orange-700 mb-2">Extras Found ({scanResult.extra?.length || 0})</h4>
                            {scanResult.extra?.length > 0 ? (
                                <div className="space-y-3">
                                    {scanResult.extra.map((item, idx) => (
                                        <div key={idx} className="flex items-center justify-between bg-white p-2 rounded-lg border border-orange-100">
                                            <div>
                                                <span className="font-bold block text-gray-800">{item.name}</span>
                                                <span className="text-xs text-gray-500">{item.quantity} {item.unit} ({item.category})</span>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    // Quick add extra item
                                                    batchAddPantryItems([item]);
                                                    // Remove from UI
                                                    setScanResult(prev => prev ? ({
                                                        ...prev,
                                                        extra: prev.extra.filter((_, i) => i !== idx)
                                                    }) : null);
                                                }}
                                                className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded hover:bg-orange-200 font-bold"
                                            >
                                                Add
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500 italic">No extra items detected.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

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
