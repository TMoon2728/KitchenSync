
import React, { useState, useMemo } from 'react';
import { useKitchen } from '../context/KitchenContext';
import { useUser } from '../context/UserContext';
import type { Recipe } from '../types';
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

    // State for custom items
    const [customItemInput, setCustomItemInput] = useState('');

    // State for Confirmation Modal
    const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

    const handleDrop = (date: string, slot: string, e: React.DragEvent) => {
        const recipeId = e.dataTransfer.getData("recipeId");
        const customItemName = e.dataTransfer.getData("customItemName");

        setMealPlan(prev => {
            const newPlan = JSON.parse(JSON.stringify(prev)); // Deep copy
            if (!newPlan[date]) {
                newPlan[date] = { Breakfast: [], Lunch: [], Dinner: [], Snack: [] };
            }
            if (!newPlan[date][slot]) {
                newPlan[date][slot] = [];
            }

            if (recipeId) {
                const id = Number(recipeId);
                newPlan[date][slot].push({ recipeId: id, completed: false });
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

        // 2. Sync with Pantry
        const recipe = recipes.find(r => r.id === recipeId);
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
                    }
                });
                return newPantry;
            });
        }

        setPendingAction(null);

        if (!isUndo && userProfile.preferences?.enableConfetti !== false) {
            const intensity = userProfile.preferences?.confettiIntensity || 'medium';
            const count = intensity === 'low' ? 50 : intensity === 'high' ? 300 : 150;
            confetti({
                particleCount: count,
                spread: 80,
                origin: { y: 0.6 }
            });
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
            <aside className="w-full lg:w-1/4 bg-white p-5 rounded-2xl shadow-lg border border-gray-100 flex flex-col gap-4 max-h-[calc(100vh-100px)] sticky top-6 z-10">
                {/* Recipe Tray */}
                <div className="flex flex-col flex-grow min-h-0">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold text-gray-800">Drag & Drop</h2>
                        <button onClick={suggestRandomRecipes} title="Shuffle Recipes" className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-blue-500 hover:bg-blue-100 hover:scale-110 transition-all">
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
                            className="w-full form-input pl-10 pr-4 py-2 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                    </div>

                    <div className="flex flex-wrap gap-2 mb-4">
                        {mealTypes.map(type => (
                            <button
                                key={type}
                                onClick={() => { handleTrayInteraction(); setTrayFilter(type); }}
                                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors ${trayFilter === type && !shuffledTrayRecipes ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                            >
                                {type}
                            </button>
                        ))}
                    </div>

                    <div className="overflow-y-auto space-y-2 flex-grow pr-1 custom-scrollbar">
                        {(shuffledTrayRecipes || filteredRecipes).map(recipe => (
                            <div
                                key={recipe.id}
                                draggable
                                onDragStart={(e) => {
                                    e.dataTransfer.setData("recipeId", recipe.id.toString());
                                }}
                                className="p-3 bg-white rounded-xl shadow-sm border border-gray-100 cursor-grab active:cursor-grabbing hover:shadow-md hover:border-blue-200 transition-all group flex items-center justify-between"
                            >
                                <div>
                                    <p className="font-bold text-sm text-gray-800 line-clamp-1">{recipe.name}</p>
                                    <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">{recipe.meal_type}</p>
                                </div>
                                <i className="fas fa-grip-vertical text-gray-300 group-hover:text-blue-400"></i>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Custom Items Widget */}
                <div className="flex flex-col border-t border-gray-100 pt-4 mt-auto">
                    <h2 className="text-sm font-bold text-gray-600 mb-2 uppercase tracking-wide">Custom Event</h2>
                    <div
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("customItemName", customItemInput || "Custom Item")}
                        className="p-3 bg-yellow-50 rounded-xl cursor-grab active:cursor-grabbing border-2 border-dashed border-yellow-200 text-center hover:bg-yellow-100 transition-colors group"
                    >
                        <i className="fas fa-hand-pointer text-yellow-400 mb-2 block group-hover:scale-110 transition-transform"></i>
                        <input
                            type="text"
                            placeholder="Type (e.g. Leftovers) & Drag"
                            value={customItemInput}
                            onChange={(e) => setCustomItemInput(e.target.value)}
                            className="w-full bg-transparent text-sm font-bold text-yellow-800 placeholder-yellow-400 text-center outline-none"
                        />
                    </div>
                </div>
            </aside>

            {/* Calendar */}
            <div className="flex-1 flex flex-col min-w-0">
                <div className="flex flex-col md:flex-row justify-between items-center mb-6 bg-white p-4 rounded-2xl shadow-sm border border-gray-100 gap-4">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg">
                            <button onClick={() => changeWeek('prev')} className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-white hover:shadow-sm text-gray-600 transition-all"><i className="fas fa-chevron-left"></i></button>
                            <button onClick={() => changeWeek('today')} className="px-3 py-1 text-sm font-bold text-gray-700 hover:bg-white hover:shadow-sm rounded-md transition-all">Today</button>
                            <button onClick={() => changeWeek('next')} className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-white hover:shadow-sm text-gray-600 transition-all"><i className="fas fa-chevron-right"></i></button>
                        </div>
                        <h1 className="text-xl font-bold text-gray-800">
                            {weekStartDate.toLocaleDateString('en-US', { month: 'long' })}
                        </h1>
                    </div>

                    {/* Weekly Progress Bar */}
                    <div className="flex items-center gap-3 w-full md:w-64">
                        <span className="text-xs font-bold text-gray-400 uppercase whitespace-nowrap">Plan Score</span>
                        <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
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
                                <div key={dateStr} className={`flex-shrink-0 w-full md:w-[300px] rounded-2xl flex flex-col p-3 space-y-3 border transition-all md:h-full md:overflow-y-auto custom-scrollbar md:snap-center ${isToday ? 'bg-blue-50/50 border-blue-200 shadow-md ring-2 ring-blue-100' : 'bg-white border-gray-100 shadow-sm'}`}>
                                    <div className="text-center pb-2 border-b border-gray-100/50 sticky top-0 bg-inherit z-10 backdrop-blur-sm">
                                        <h3 className={`font-black uppercase tracking-wider text-xs ${isToday ? 'text-blue-600' : 'text-gray-400'}`}>{day.toLocaleDateString('en-US', { weekday: 'short' })}</h3>
                                        <p className={`text-xl font-bold ${isToday ? 'text-blue-800' : 'text-gray-800'}`}>{day.getDate()}</p>
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
                                                {dayPlan[slot]?.length === 0 && (
                                                    <i className="fas fa-plus text-[10px] text-gray-300 opacity-0 group-hover/slot:opacity-100 transition-opacity"></i>
                                                )}
                                            </div>

                                            <div className={`flex-grow rounded-xl transition-all border-2 border-transparent space-y-2 ${dayPlan[slot]?.length === 0 ? 'bg-gray-50/50 border-dashed border-gray-200 group-hover/slot:bg-blue-50/30 group-hover/slot:border-blue-200' : ''} p-1`}>
                                                {dayPlan[slot]?.map((item, index) => {
                                                    const recipe = item.recipeId ? recipes.find(r => r.id === item.recipeId) : null;
                                                    const isCompleted = item.completed;

                                                    return (
                                                        <div key={index} className={`relative p-2 rounded-lg shadow-sm border text-xs group transition-all hover:scale-105 hover:z-10 ${recipe ? (isCompleted ? 'bg-green-50 text-green-800 border-green-200 opacity-70' : 'bg-white text-gray-800 border-gray-100 hover:border-blue-300') : 'bg-yellow-50 text-yellow-800 border-yellow-100'}`}>
                                                            <span className={`font-bold line-clamp-2 leading-tight ${isCompleted ? 'line-through' : ''}`}>
                                                                {recipe ? recipe.name : item.custom_item_name}
                                                            </span>

                                                            {recipe && (
                                                                <button
                                                                    onClick={() => initiateToggleStatus(dateStr, slot, index, recipe.id)}
                                                                    className={`mt-2 w-full py-1 rounded-md text-[10px] font-bold uppercase tracking-wide transition-colors ${isCompleted ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500 hover:bg-green-500 hover:text-white'}`}
                                                                >
                                                                    {isCompleted ? 'Done' : 'Cook'}
                                                                </button>
                                                            )}

                                                            <button
                                                                onClick={() => removeItemFromPlan(dateStr, slot, index)}
                                                                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md hover:bg-red-600 scale-75 group-hover:scale-100"
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
                    <div className="bg-white p-6 rounded-2xl shadow-2xl max-w-md w-full animate-scale-in border border-gray-100">
                        <div className="flex items-center gap-3 mb-4 text-gray-800">
                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                                <i className="fas fa-fire-burner text-lg"></i>
                            </div>
                            <h3 className="text-xl font-bold">Time to Cook?</h3>
                        </div>

                        <p className="text-sm text-gray-600 mb-6 leading-relaxed">
                            Marking <strong>{pendingAction.recipeName}</strong> as cooked will automatically deduct ingredients from your pantry.
                        </p>

                        <div className="bg-gray-50 p-4 rounded-xl mb-6 border border-gray-100 max-h-48 overflow-y-auto">
                            <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">Pantry Impact</h4>
                            <ul className="text-xs space-y-2">
                                {recipes.find(r => r.id === pendingAction.recipeId)?.ingredients.map((ing, i) => {
                                    const inPantry = pantry.find(p => p.name.toLowerCase() === ing.name.toLowerCase());
                                    const conversion = inPantry ? convertQuantity(ing.quantity, ing.unit, inPantry.unit) : null;

                                    return (
                                        <li key={i} className="flex justify-between items-center text-gray-700">
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
                                className="px-5 py-2.5 rounded-xl text-gray-600 hover:bg-gray-100 font-bold text-sm transition-colors"
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
        </div>
    );
};

export default MealPlanner;
