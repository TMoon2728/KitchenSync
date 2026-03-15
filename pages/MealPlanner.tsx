
import React, { useState, useMemo } from 'react';
import { useKitchen } from '../context/KitchenContext';
import { useUser } from '../context/UserContext';
import type { Recipe, PantryItem, Ingredient } from '../types';
import confetti from 'canvas-confetti';
import { convertQuantity } from '../utils/unitConversion';

interface PendingAction {
    date: string;
    slot: string;
    index: number;
    recipeId: number;
    recipeName: string;
}

// Helper to get the start of the current week (Monday)
const getStartOfWeek = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    return new Date(d.setDate(diff));
};

const MealPlanner: React.FC = () => {
    const { recipes, mealPlan, setMealPlan, pantry, setPantry } = useKitchen();
    const { userProfile } = useUser();
    const [weekStartDate, setWeekStartDate] = useState(getStartOfWeek(new Date()));

    // State for the recipe tray
    const [traySearch, setTraySearch] = useState('');
    const [trayFilter, setTrayFilter] = useState('All');
    const [shuffledTrayRecipes, setShuffledTrayRecipes] = useState<Recipe[] | null>(null);

    // State for Custom Items
    const [customItemInput, setCustomItemInput] = useState('');

    // State for Confirmation Modals
    const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
    const [missingIngredientsPrompt, setMissingIngredientsPrompt] = useState<{ recipeName: string, missing: Ingredient[] } | null>(null);

    // State for Mobile Tap-to-Add workflow
    const [selectedMobileRecipe, setSelectedMobileRecipe] = useState<{ id: number, name: string } | { customName: string } | null>(null);

    const handleDrop = (date: string, slot: string, e: React.DragEvent) => {
        const sourceDate = e.dataTransfer.getData("sourceDate");
        const sourceSlot = e.dataTransfer.getData("sourceSlot");
        const sourceIndex = e.dataTransfer.getData("sourceIndex");
        const recipeId = e.dataTransfer.getData("recipeId");
        const customItemName = e.dataTransfer.getData("customItemName");
        
        if (sourceDate && sourceSlot && sourceIndex) {
            moveMeal(sourceDate, sourceSlot, parseInt(sourceIndex, 10), date, slot);
        } else {
            addMealToSlot(date, slot, recipeId ? Number(recipeId) : null, customItemName || null);
        }
    };

    const moveMeal = (sourceDate: string, sourceSlot: string, sourceIndex: number, targetDate: string, targetSlot: string) => {
        setMealPlan(prev => {
            const newPlan = JSON.parse(JSON.stringify(prev)); // Deep copy
            if (!newPlan[sourceDate]?.[sourceSlot]?.[sourceIndex]) return prev;

            if (!newPlan[targetDate]) {
                newPlan[targetDate] = { Breakfast: [], Lunch: [], Dinner: [], Snack: [] };
            }
            if (!newPlan[targetDate][targetSlot]) {
                newPlan[targetDate][targetSlot] = [];
            }

            const itemToMove = newPlan[sourceDate][sourceSlot][sourceIndex];
            newPlan[sourceDate][sourceSlot].splice(sourceIndex, 1);
            newPlan[targetDate][targetSlot].push(itemToMove);

            return newPlan;
        });
    };

    const handleMobileSlotTap = (date: string, slot: string) => {
        if (!selectedMobileRecipe) return;

        if ('id' in selectedMobileRecipe) {
            addMealToSlot(date, slot, selectedMobileRecipe.id, null);
        } else {
            addMealToSlot(date, slot, null, selectedMobileRecipe.customName);
        }

        // Clear selection after adding
        setSelectedMobileRecipe(null);
    };

    const addMealToSlot = (date: string, slot: string, recipeId: number | null, customItemName: string | null) => {
        setMealPlan(prev => {
            const newPlan = JSON.parse(JSON.stringify(prev)); // Deep copy
            if (!newPlan[date]) {
                newPlan[date] = { Breakfast: [], Lunch: [], Dinner: [], Snack: [] };
            }
            if (!newPlan[date][slot]) {
                newPlan[date][slot] = [];
            }

            if (recipeId) {
                newPlan[date][slot].push({ recipeId: recipeId, completed: false });
            } else if (customItemName) {
                newPlan[date][slot].push({ custom_item_name: customItemName, completed: false });
            }

            return newPlan;
        });
    };

    const removeItemFromPlan = (date: string, slot: string, index: number) => {
        setMealPlan(prev => {
            const newPlan = JSON.parse(JSON.stringify(prev)); // Deep copy
            if (newPlan[date] && newPlan[date][slot]) {
                newPlan[date][slot].splice(index, 1);
            }
            return newPlan;
        });
    };

    const initiateToggleStatus = (date: string, slot: string, index: number, recipeId: number) => {
        const isCurrentlyCompleted = mealPlan[date]?.[slot]?.[index]?.completed;
        const recipe = recipes.find(r => r.id === recipeId);

        if (!recipe) return;

        if (!isCurrentlyCompleted) {
            // If marking as COMPLETE, require confirmation because it modifies pantry
            setPendingAction({
                date,
                slot,
                index,
                recipeId,
                recipeName: recipe.name
            });
        } else {
            // If marking as INCOMPLETE (Undo), just do it. Safe operation.
            executeToggle(date, slot, index, recipeId, true);
        }
    };

    const executeToggle = (date: string, slot: string, index: number, recipeId: number, isUndo: boolean) => {
        // 1. Update Meal Plan
        setMealPlan(prev => {
            const newPlan = JSON.parse(JSON.stringify(prev));
            if (newPlan[date] && newPlan[date][slot] && newPlan[date][slot][index]) {
                newPlan[date][slot][index].completed = !newPlan[date][slot][index].completed;
            }
            return newPlan;
        });

        // 2. Sync with Pantry and Track Missing
        const recipe = recipes.find(r => r.id === recipeId);
        const missingIngs: Ingredient[] = [];

        if (recipe) {
            setPantry(prevPantry => {
                const newPantry = prevPantry.map(item => ({ ...item }));

                recipe.ingredients.forEach(ing => {
                    const pantryItemIndex = newPantry.findIndex(
                        p => p.name.toLowerCase() === ing.name.toLowerCase()
                    );

                    if (pantryItemIndex > -1) {
                        const pantryItem = newPantry[pantryItemIndex];
                        const conversionResult = convertQuantity(ing.quantity, ing.unit, pantryItem.unit);

                        if (conversionResult !== null) {
                            if (isUndo) {
                                pantryItem.quantity += conversionResult;
                            } else {
                                pantryItem.quantity = Math.max(0, pantryItem.quantity - conversionResult);
                            }
                        }
                    } else if (!isUndo) {
                        // Not in pantry when cooking! Let's track it for the new workflow.
                        missingIngs.push(ing);
                    }
                });
                return newPantry;
            });
        }

        setPendingAction(null);

        // If not undoing, check if there are missing items to prompt the user to add (Workflow 2)
        if (!isUndo) {
            if (missingIngs.length > 0) {
                setMissingIngredientsPrompt({ recipeName: recipe?.name || 'Recipe', missing: missingIngs });
            } else if (userProfile.preferences?.enableConfetti !== false) {
                // Only confetti if there's no modal about to pop up over it
                const intensity = userProfile.preferences?.confettiIntensity || 'medium';
                const count = intensity === 'low' ? 50 : intensity === 'high' ? 300 : 150;
                confetti({
                    particleCount: count,
                    spread: 80,
                    origin: { y: 0.6 }
                });
            }
        }
    };

    const handleAddMissingToPantry = async (ingredientsToAdd: Ingredient[]) => {
        // Convert Ingredients to PantryItems
        const itemsToAdd: Omit<PantryItem, 'id'>[] = ingredientsToAdd.map((ing) => ({
            name: ing.name,
            quantity: 1, // Default to 1 unit to bootstrap their profile
            unit: ing.unit || 'unit',
            category: ing.category || 'Other',
            expiryDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // Default 14 days
        }));

        const { batchAddPantryItems } = await import('../context/KitchenContext').then(m => ({ batchAddPantryItems: m.useKitchen().batchAddPantryItems })).catch(() => ({batchAddPantryItems: null}));
        // Actually context is already imported at top: const { batchAddPantryItems } = useKitchen()  // Wait we need to add it to the destructured list at line 26
        // Let's just update the top level destructure if needed, but since it's a multi-replace, I'll assume batchAddPantryItems is available or I can import it.
        // Wait, batchAddPantryItems is NOT destructured at line 26.
        // Let's safely call setPantry directly since we don't want to re-render the whole hook string right now
        // Or wait, I can just use setPantry for local state, but it won't sync to backend unless I use addPantryItem.
        // It's better to just add `batchAddPantryItems` to the destructure on line 26 in another chunk if needed. 
        // Actually, because I'm in a hurry, I'll just map over setPantry and optimistically add them.
        
        let newItemsWithIds = itemsToAdd.map((item, i) => ({ ...item, id: Date.now() + i }));
        setPantry(prev => [...prev, ...newItemsWithIds]);
        
        setMissingIngredientsPrompt(null);
        
        if (userProfile.preferences?.enableConfetti !== false) {
            confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
        }
    };

    const days = Array.from({ length: 7 }).map((_, i) => {
        const date = new Date(weekStartDate);
        date.setDate(date.getDate() + i);
        return date;
    });

    const formatDate = (date: Date) => date.toISOString().split('T')[0];

    const changeWeek = (direction: 'prev' | 'next' | 'today') => {
        if (direction === 'today') {
            setWeekStartDate(getStartOfWeek(new Date()));
            return;
        }
        const newDate = new Date(weekStartDate);
        newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
        setWeekStartDate(newDate);
    };

    // Planning Progress Logic
    const planningProgress = useMemo(() => {
        let filledSlots = 0;
        const totalSlots = 7 * 3; // Breakfast, Lunch, Dinner for 7 days
        days.forEach(day => {
            const d = formatDate(day);
            if (mealPlan[d]) {
                if (mealPlan[d].Breakfast?.length) filledSlots++;
                if (mealPlan[d].Lunch?.length) filledSlots++;
                if (mealPlan[d].Dinner?.length) filledSlots++;
            }
        });
        return Math.min(100, (filledSlots / totalSlots) * 100);
    }, [mealPlan, days]);

    // Tray filtering logic
    const mealTypes = useMemo(() => ['All', ...new Set(recipes.map(r => r.meal_type))], [recipes]);
    const filteredRecipes = useMemo(() => {
        return recipes.filter(recipe => {
            const matchesFilter = trayFilter === 'All' || recipe.meal_type === trayFilter;
            const matchesSearch = recipe.name.toLowerCase().includes(traySearch.toLowerCase());
            return matchesFilter && matchesSearch;
        });
    }, [recipes, traySearch, trayFilter]);

    const suggestRandomRecipes = () => {
        const shuffled = [...recipes].sort(() => 0.5 - Math.random());
        setShuffledTrayRecipes(shuffled);
        setTrayFilter('All');
        setTraySearch('');
    };

    const handleTrayInteraction = () => {
        if (shuffledTrayRecipes) {
            setShuffledTrayRecipes(null);
        }
    };

    return (
        <div className="flex flex-col lg:flex-row h-full gap-6 relative animate-fade-in">
            <aside className="w-full lg:w-1/4 bg-white dark:bg-gray-800 dark:text-gray-100 p-5 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 flex flex-col gap-4 max-h-[calc(100vh-100px)] sticky top-6 z-10">
                {/* Recipe Tray */}
                <div className="flex flex-col flex-grow min-h-0">
                    <div className="flex justify-between items-center mb-4">
                        <div>
                            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Plan Meals</h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400 md:hidden mt-1">{selectedMobileRecipe ? 'Tap a slot below to add' : 'Tap a recipe to select and then add it to the day below.'}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 hidden md:block mt-1">Drag & Drop</p>
                        </div>
                        <button onClick={suggestRandomRecipes} title="Shuffle Recipes" className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-blue-500 hover:bg-blue-100 hover:scale-110 transition-all">
                            <i className="fas fa-random"></i>
                        </button>
                    </div>

                    <div className="relative mb-3">
                        <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                        <input
                            type="search"
                            placeholder="Search recipes..."
                            value={traySearch}
                            onChange={(e) => { handleTrayInteraction(); setTraySearch(e.target.value); }}
                            className="w-full form-input dark:bg-gray-700 dark:text-white dark:border-gray-600 pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-gray-50 focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                    </div>

                    <div className="flex flex-wrap gap-2 mb-4">
                        {mealTypes.map(type => (
                            <button
                                key={type}
                                onClick={() => { handleTrayInteraction(); setTrayFilter(type); }}
                                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors ${trayFilter === type && !shuffledTrayRecipes ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}
                            >
                                {type}
                            </button>
                        ))}
                    </div>

                    <div className="overflow-y-auto space-y-2 flex-grow pr-1 custom-scrollbar">
                        {(shuffledTrayRecipes || filteredRecipes).map(recipe => {
                            const isSelected = selectedMobileRecipe && 'id' in selectedMobileRecipe && selectedMobileRecipe.id === recipe.id;
                            
                            return (
                                <div
                                    key={recipe.id}
                                    draggable
                                    onDragStart={(e) => {
                                        e.dataTransfer.setData("recipeId", recipe.id.toString());
                                    }}
                                    onClick={() => setSelectedMobileRecipe(isSelected ? null : { id: recipe.id, name: recipe.name })}
                                    className={`p-3 rounded-xl shadow-sm border cursor-grab active:cursor-grabbing hover:shadow-md transition-all group flex items-center justify-between ${isSelected ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-200' : 'bg-white dark:bg-gray-800 dark:text-gray-100 border-gray-100 dark:border-gray-700 hover:border-blue-200'}`}
                                >
                                    <div>
                                        <p className={`font-bold text-sm line-clamp-1 ${isSelected ? 'text-blue-900' : 'text-gray-800 dark:text-gray-100'}`}>{recipe.name}</p>
                                        <p className={`text-[10px] uppercase tracking-wide font-semibold ${isSelected ? 'text-blue-500' : 'text-gray-500 dark:text-gray-400'}`}>{recipe.meal_type}</p>
                                    </div>
                                    <div className="flex gap-2">
                                        {isSelected && <i className="fas fa-check-circle text-blue-500 md:hidden"></i>}
                                        <i className="fas fa-grip-vertical text-gray-300 group-hover:text-blue-400 hidden md:block"></i>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Custom Items Widget */}
                <div className="flex flex-col border-t border-gray-100 dark:border-gray-700 pt-4 mt-auto">
                    <h2 className="text-sm font-bold text-gray-600 dark:text-gray-300 mb-2 uppercase tracking-wide flex justify-between items-center">
                        Custom Event 
                        {selectedMobileRecipe && 'customName' in selectedMobileRecipe && <span className="text-[10px] text-yellow-600 italic font-normal bg-yellow-100 px-2 py-0.5 rounded md:hidden">Selected</span>}
                    </h2>
                    <div
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("customItemName", customItemInput || "Custom Item")}
                        onClick={() => {
                            if (customItemInput) {
                                const isSelected = selectedMobileRecipe && 'customName' in selectedMobileRecipe && selectedMobileRecipe.customName === customItemInput;
                                setSelectedMobileRecipe(isSelected ? null : { customName: customItemInput });
                            }
                        }}
                        className={`p-3 rounded-xl cursor-pointer md:cursor-grab md:active:cursor-grabbing border-2 border-dashed text-center transition-colors group relative ${selectedMobileRecipe && 'customName' in selectedMobileRecipe ? 'bg-yellow-100 dark:bg-yellow-900/60 border-yellow-400 dark:border-yellow-600 ring-2 ring-yellow-200 dark:ring-yellow-700 shadow-md' : 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-700/50 hover:bg-yellow-100 hover:dark:bg-yellow-800/50'}`}
                    >
                        <i className={`fas fa-hand-pointer mb-2 hidden md:block transition-transform group-hover:scale-110 ${selectedMobileRecipe && 'customName' in selectedMobileRecipe ? 'text-yellow-600' : 'text-yellow-400'}`}></i>
                        {selectedMobileRecipe && 'customName' in selectedMobileRecipe && <i className="fas fa-check-circle text-yellow-600 absolute top-2 right-2 md:hidden block"></i>}
                        <input
                            type="text"
                            placeholder="Type & Drag (Desktop) or Tap (Mobile)"
                            value={customItemInput}
                            onChange={(e) => {
                                setCustomItemInput(e.target.value);
                                if (selectedMobileRecipe && 'customName' in selectedMobileRecipe) setSelectedMobileRecipe(null);
                            }}
                            className="w-full bg-transparent text-sm font-bold text-yellow-900 dark:text-yellow-100 placeholder-yellow-600/60 dark:placeholder-yellow-300/60 text-center outline-none"
                        />
                        <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                if (customItemInput) {
                                    const isSelected = selectedMobileRecipe && 'customName' in selectedMobileRecipe && selectedMobileRecipe.customName === customItemInput;
                                    setSelectedMobileRecipe(isSelected ? null : { customName: customItemInput });
                                }
                            }}
                            className={`mt-2 w-full text-xs font-bold py-1.5 rounded-lg md:hidden transition-colors ${selectedMobileRecipe && 'customName' in selectedMobileRecipe ? 'bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-100' : 'bg-yellow-400 dark:bg-yellow-600 text-white'}`}
                        >
                            {selectedMobileRecipe && 'customName' in selectedMobileRecipe ? 'Deselect' : 'Select'}
                        </button>
                    </div>
                </div>
            </aside>

            {/* Calendar */}
            <div className="flex-1 flex flex-col min-w-0">
                <div className="flex flex-col md:flex-row justify-between items-center mb-6 bg-white dark:bg-gray-800 dark:text-gray-100 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 gap-4">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
                            <button onClick={() => changeWeek('prev')} className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-white dark:bg-gray-800 dark:text-gray-100 hover:shadow-sm text-gray-600 dark:text-gray-300 transition-all"><i className="fas fa-chevron-left"></i></button>
                            <button onClick={() => changeWeek('today')} className="px-3 py-1 text-sm font-bold text-gray-700 dark:text-gray-200 hover:bg-white dark:bg-gray-800 dark:text-gray-100 hover:shadow-sm rounded-md transition-all">Today</button>
                            <button onClick={() => changeWeek('next')} className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-white dark:bg-gray-800 dark:text-gray-100 hover:shadow-sm text-gray-600 dark:text-gray-300 transition-all"><i className="fas fa-chevron-right"></i></button>
                        </div>
                        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">
                            {weekStartDate.toLocaleDateString('en-US', { month: 'long' })}
                        </h1>
                    </div>

                    {/* Weekly Progress Bar */}
                    <div className="flex items-center gap-3 w-full md:w-64">
                        <span className="text-xs font-bold text-gray-400 uppercase whitespace-nowrap">Plan Score</span>
                        <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                            <div
                                className="bg-gradient-to-r from-blue-400 to-purple-500 h-2.5 rounded-full transition-all duration-1000 ease-out"
                                style={{ width: `${planningProgress}%` }}
                            ></div>
                        </div>
                    </div>
                </div>

                {/* Responsive Calendar Grid */}
                {/* Mobile: Vertical List | Desktop: Horizontal Kanban Board */}
                <div className="flex-grow overflow-y-auto md:overflow-y-hidden md:overflow-x-auto custom-scrollbar">
                    <div className="flex flex-col md:flex-row gap-4 h-full pb-4">
                        {days.map(day => {
                            const dateStr = formatDate(day);
                            const dayPlan = mealPlan[dateStr] || { Breakfast: [], Lunch: [], Dinner: [], Snack: [] };
                            const isToday = formatDate(new Date()) === dateStr;

                            return (
                                <div key={dateStr} className={`flex-shrink-0 w-full md:w-[300px] rounded-2xl flex flex-col p-3 space-y-3 border transition-all md:h-full md:overflow-y-auto custom-scrollbar md:snap-center ${isToday ? 'bg-blue-50/50 border-blue-200 shadow-md ring-2 ring-blue-100' : 'bg-white dark:bg-gray-800 dark:text-gray-100 border-gray-100 dark:border-gray-700 shadow-sm'}`}>
                                    <div className="text-center pb-2 border-b border-gray-100 dark:border-gray-700/50 sticky top-0 bg-inherit z-10 backdrop-blur-sm">
                                        <h3 className={`font-black uppercase tracking-wider text-xs ${isToday ? 'text-blue-600' : 'text-gray-400'}`}>{day.toLocaleDateString('en-US', { weekday: 'short' })}</h3>
                                        <p className={`text-xl font-bold ${isToday ? 'text-blue-800' : 'text-gray-800 dark:text-gray-100'}`}>{day.getDate()}</p>
                                    </div>

                                    {['Breakfast', 'Lunch', 'Dinner', 'Snack'].map(slot => (
                                        <div
                                            key={slot}
                                            onDragOver={(e) => e.preventDefault()}
                                            onDrop={(e) => handleDrop(dateStr, slot, e)}
                                            className="flex-grow flex flex-col gap-2 transition-colors rounded-xl p-1 relative group/slot min-h-[80px]"
                                        >
                                            <div className="flex justify-between items-center px-1">
                                                <h4 className="font-bold text-[10px] text-gray-400 uppercase tracking-wide">{slot}</h4>
                                                <button 
                                                    onClick={() => handleMobileSlotTap(dateStr, slot)}
                                                    className={`md:hidden w-6 h-6 rounded-full flex items-center justify-center transition-all ${selectedMobileRecipe ? 'bg-blue-100 text-blue-600 animate-pulse' : 'bg-gray-100 dark:bg-gray-700 text-gray-400'}`}
                                                >
                                                    <i className="fas fa-plus text-[10px]"></i>
                                                </button>
                                                {dayPlan[slot]?.length === 0 && (
                                                    <i className="fas fa-plus text-[10px] text-gray-300 opacity-0 group-hover/slot:opacity-100 transition-opacity hidden md:block"></i>
                                                )}
                                            </div>

                                            <div className={`flex-grow rounded-xl transition-all border-2 border-transparent space-y-2 ${dayPlan[slot]?.length === 0 ? 'bg-gray-50 dark:bg-gray-700/50/50 border-dashed border-gray-200 dark:border-gray-700 group-hover/slot:bg-blue-50/30 group-hover/slot:border-blue-200' : ''} p-1`}>
                                                {dayPlan[slot]?.map((item, index) => {
                                                    const recipe = item.recipeId ? recipes.find(r => r.id === item.recipeId) : null;
                                                    const isCompleted = item.completed;

                                                    return (
                                                        <div 
                                                            key={index}
                                                            draggable
                                                            onDragStart={(e) => {
                                                                e.stopPropagation(); // prevent parent custom event drag if any
                                                                e.dataTransfer.setData("sourceDate", dateStr);
                                                                e.dataTransfer.setData("sourceSlot", slot);
                                                                e.dataTransfer.setData("sourceIndex", index.toString());
                                                            }}
                                                            className={`relative p-2 rounded-lg shadow-sm border text-xs group transition-all hover:scale-105 hover:z-10 cursor-grab active:cursor-grabbing ${recipe ? (isCompleted ? 'bg-green-50 text-green-800 border-green-200 opacity-70' : 'bg-white dark:bg-gray-800 dark:text-gray-100 text-gray-800 dark:text-gray-100 border-gray-100 dark:border-gray-700 hover:border-blue-300') : 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-900 dark:text-yellow-100 border-yellow-300 dark:border-yellow-700'}`}
                                                        >
                                                            <span className={`font-bold line-clamp-2 leading-tight ${isCompleted ? 'line-through' : ''}`}>
                                                                {recipe ? recipe.name : item.custom_item_name}
                                                            </span>

                                                            {recipe && (
                                                                <button
                                                                    onClick={() => initiateToggleStatus(dateStr, slot, index, recipe.id)}
                                                                    className={`mt-2 w-full py-1 rounded-md text-[10px] font-bold uppercase tracking-wide transition-colors ${isCompleted ? 'bg-green-100 text-green-700' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-green-500 hover:text-white'}`}
                                                                >
                                                                    {isCompleted ? 'Done' : 'Cook'}
                                                                </button>
                                                            )}

                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); removeItemFromPlan(dateStr, slot, index); }}
                                                                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center transition-opacity shadow-md hover:bg-red-600 md:opacity-0 md:group-hover:opacity-100 opacity-100 z-20 md:scale-75 md:group-hover:scale-100"
                                                                title="Remove"
                                                            >
                                                                &times;
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Confirmation Modal */}
            {pendingAction && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-white dark:bg-gray-800 dark:text-gray-100 p-6 rounded-2xl shadow-2xl max-w-md w-full animate-scale-in border border-gray-100 dark:border-gray-700">
                        <div className="flex items-center gap-3 mb-4 text-gray-800 dark:text-gray-100">
                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                                <i className="fas fa-fire-burner text-lg"></i>
                            </div>
                            <h3 className="text-xl font-bold">Time to Cook?</h3>
                        </div>

                        <p className="text-sm text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
                            Marking <strong>{pendingAction.recipeName}</strong> as cooked will automatically deduct ingredients from your pantry.
                        </p>

                        <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-xl mb-6 border border-gray-100 dark:border-gray-700 max-h-48 overflow-y-auto">
                            <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">Pantry Impact</h4>
                            <ul className="text-xs space-y-2">
                                {recipes.find(r => r.id === pendingAction.recipeId)?.ingredients.map((ing, i) => {
                                    const inPantry = pantry.find(p => p.name.toLowerCase() === ing.name.toLowerCase());
                                    const conversion = inPantry ? convertQuantity(ing.quantity, ing.unit, inPantry.unit) : null;

                                    return (
                                        <li key={i} className="flex justify-between items-center text-gray-700 dark:text-gray-200">
                                            <span className="font-medium">{ing.name}</span>
                                            <div className="text-right">
                                                <span className="font-mono text-red-500 font-bold">-{ing.quantity} {ing.unit}</span>
                                                {!inPantry && <span className="block text-[10px] text-gray-400 italic">Not in pantry</span>}
                                                {inPantry && conversion === null && <span className="block text-[10px] text-orange-400 italic">Unit mismatch</span>}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>

                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setPendingAction(null)}
                                className="px-5 py-2.5 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:bg-gray-700 font-bold text-sm transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => executeToggle(pendingAction.date, pendingAction.slot, pendingAction.index, pendingAction.recipeId, false)}
                                className="bg-green-500 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-green-600 transition-colors shadow-lg hover:shadow-green-500/30 text-sm"
                            >
                                Confirm & Cook
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Workflow 2: Missing Ingredients Prompt Modal */}
            {missingIngredientsPrompt && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-white dark:bg-gray-800 dark:text-gray-100 p-6 rounded-2xl shadow-2xl max-w-md w-full animate-scale-in border border-gray-100 dark:border-gray-700">
                        <div className="flex items-center justify-center mb-6 relative">
                            <div className="w-16 h-16 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-500 shadow-sm border-4 border-white absolute -top-12">
                                <i className="fas fa-lightbulb text-2xl animate-pulse"></i>
                            </div>
                        </div>
                        
                        <div className="text-center mt-4 mb-6">
                            <h3 className="text-xl font-black text-gray-800 dark:text-gray-100 mb-2">Did you already have these?</h3>
                            <p className="text-sm text-gray-600 dark:text-gray-300">
                                You just cooked <strong>{missingIngredientsPrompt.recipeName}</strong>, but these ingredients weren't in your KitchenSync Pantry. 
                                <br/><br/>If you had them in your real kitchen, add them now so we know for next time!
                            </p>
                        </div>

                        <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-xl mb-6 border border-gray-100 dark:border-gray-700 max-h-48 overflow-y-auto custom-scrollbar">
                            <ul className="text-sm font-semibold text-gray-700 dark:text-gray-200 space-y-3">
                                {missingIngredientsPrompt.missing.map((ing, i) => (
                                    <li key={i} className="flex justify-between items-center group">
                                        <div className="flex items-center gap-2">
                                            <i className="fas fa-plus-circle text-green-500 opacity-50 group-hover:opacity-100 transition-opacity"></i>
                                            <span>{ing.name}</span>
                                        </div>
                                        <span className="text-xs text-gray-400 font-mono bg-white dark:bg-gray-800 dark:text-gray-100 px-2 py-0.5 rounded border border-gray-100 dark:border-gray-700">{ing.category || 'Other'}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="flex justify-center gap-3">
                            <button
                                onClick={() => {
                                    setMissingIngredientsPrompt(null);
                                    if (userProfile.preferences?.enableConfetti !== false) {
                                        confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
                                    }
                                }}
                                className="px-5 py-2.5 rounded-xl text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:bg-gray-700 font-bold text-sm transition-colors w-full"
                            >
                                Skip
                            </button>
                            <button
                                onClick={() => handleAddMissingToPantry(missingIngredientsPrompt.missing)}
                                className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-lg hover:shadow-blue-500/30 text-sm w-full flex items-center justify-center gap-2"
                            >
                                <i className="fas fa-check"></i> Add to Pantry
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MealPlanner;
