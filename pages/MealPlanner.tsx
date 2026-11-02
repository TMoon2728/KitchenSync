import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useKitchen } from '../context/KitchenContext';
import { useUser } from '../context/UserContext';
import type { Recipe, PantryItem, Ingredient, MealSlotType, WeeklyScheduleMatrix, MealPlan } from '../types';
import confetti from 'canvas-confetti';
import { convertQuantity } from '../utils/unitConversion';
import ScheduleSelector from '../components/ScheduleSelector';
import {
    ALL_MEAL_SLOTS,
    UNSCHEDULED_PLAN_KEY,
    FLEXIBLE_SLOT_KEY,
    normalizeScheduleMatrix,
    getActiveSlotsForDate,
    countWeeklyTargetSlots
} from '../utils/schedule';
import {
    scoreRecipeAgainstPantry,
    generateSmartWeeklyPlan,
    checkDietaryConflicts,
    inferDefaultExpiryDate
} from '../utils/pantryMatcher';
import { generateMealPlanIcs, downloadTextFile } from '../utils/calendarExport';

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
    const { recipes, mealPlan, setMealPlan, pantry, deductPantryIngredients, batchAddPantryItems } = useKitchen();
    const { userProfile, updatePreferences } = useUser();
    const [weekStartDate, setWeekStartDate] = useState(getStartOfWeek(new Date()));

    // Schedule Matrix & View Mode persisted in UserPreferences
    const scheduleMatrix = useMemo(
        () => normalizeScheduleMatrix(userProfile.preferences?.scheduleMatrix),
        [userProfile.preferences?.scheduleMatrix]
    );
    const viewMode = userProfile.preferences?.plannerViewMode || 'calendar';
    const setViewMode = (mode: 'calendar' | 'list') => {
        updatePreferences({ plannerViewMode: mode });
    };

    const [showScheduleSetup, setShowScheduleSetup] = useState(false);
    const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});
    const [assigningListIndex, setAssigningListIndex] = useState<number | null>(null);

    // State for the recipe tray
    const [traySearch, setTraySearch] = useState('');
    const [trayFilter, setTrayFilter] = useState('All');
    const [shuffledTrayRecipes, setShuffledTrayRecipes] = useState<Recipe[] | null>(null);

    // State for Custom Items
    const [customItemInput, setCustomItemInput] = useState('');

    // State for Confirmation Modals
    const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
    const [missingIngredientsPrompt, setMissingIngredientsPrompt] = useState<{ recipeName: string, missing: Ingredient[] } | null>(null);

    // Undo History Stack & Action Toast (F-01 / F-02)
    const [planHistory, setPlanHistory] = useState<MealPlan[]>([]);
    const [plannerBanner, setPlannerBanner] = useState<string | null>(null);

    const recordSnapshotForUndo = () => {
        setPlanHistory(prev => [...prev.slice(-9), JSON.parse(JSON.stringify(mealPlan))]);
    };

    const handleUndoLastChange = () => {
        if (planHistory.length === 0) return;
        const previousSnapshot = planHistory[planHistory.length - 1];
        setPlanHistory(prev => prev.slice(0, -1));
        setMealPlan(previousSnapshot);
        setPlannerBanner('Reverted meal plan to previous state.');
    };

    // State for Mobile Tap-to-Add workflow
    const [selectedMobileRecipe, setSelectedMobileRecipe] = useState<{ id: number, name: string } | { customName: string } | null>(null);

    const handleScheduleMatrixChange = (newMatrix: WeeklyScheduleMatrix) => {
        updatePreferences({ scheduleMatrix: newMatrix });
    };

    const flexibleMeals = useMemo(
        () => mealPlan[UNSCHEDULED_PLAN_KEY]?.[FLEXIBLE_SLOT_KEY] || [],
        [mealPlan]
    );

    const pantryScoresMap = useMemo(() => {
        const map = new Map<number, ReturnType<typeof scoreRecipeAgainstPantry>>();
        for (const recipe of recipes) {
            map.set(recipe.id, scoreRecipeAgainstPantry(recipe, pantry));
        }
        return map;
    }, [recipes, pantry]);

    const handleDrop = (date: string, slot: string, e: React.DragEvent) => {
        e.preventDefault();
        const sourceDate = e.dataTransfer.getData("sourceDate");
        const sourceSlot = e.dataTransfer.getData("sourceSlot");
        const sourceIndex = e.dataTransfer.getData("sourceIndex");
        const recipeId = e.dataTransfer.getData("recipeId");
        const customItemName = e.dataTransfer.getData("customItemName");
        
        if (sourceDate && sourceSlot && sourceIndex !== '') {
            moveMeal(sourceDate, sourceSlot, parseInt(sourceIndex, 10), date, slot);
        } else {
            addMealToSlot(date, slot, recipeId ? Number(recipeId) : null, customItemName || null);
        }
    };

    const moveMeal = (sourceDate: string, sourceSlot: string, sourceIndex: number, targetDate: string, targetSlot: string) => {
        if (sourceDate === targetDate && sourceSlot === targetSlot) return;
        setMealPlan(prev => {
            const newPlan = JSON.parse(JSON.stringify(prev));
            if (!newPlan[sourceDate]?.[sourceSlot]?.[sourceIndex]) return prev;

            if (!newPlan[targetDate]) {
                newPlan[targetDate] = targetDate === UNSCHEDULED_PLAN_KEY
                    ? { [FLEXIBLE_SLOT_KEY]: [] }
                    : { Breakfast: [], Lunch: [], Dinner: [], Snack: [] };
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

        setSelectedMobileRecipe(null);
    };

    const addMealToSlot = (date: string, slot: string, recipeId: number | null, customItemName: string | null) => {
        if (!recipeId && !customItemName) return;
        setMealPlan(prev => {
            const newPlan = JSON.parse(JSON.stringify(prev));
            if (!newPlan[date]) {
                newPlan[date] = date === UNSCHEDULED_PLAN_KEY
                    ? { [FLEXIBLE_SLOT_KEY]: [] }
                    : { Breakfast: [], Lunch: [], Dinner: [], Snack: [] };
            }
            if (!newPlan[date][slot]) {
                newPlan[date][slot] = [];
            }

            if (recipeId) {
                newPlan[date][slot].push({ recipeId, completed: false });
            } else if (customItemName) {
                newPlan[date][slot].push({ custom_item_name: customItemName, completed: false });
            }

            return newPlan;
        });
    };

    const removeItemFromPlan = (date: string, slot: string, index: number) => {
        setMealPlan(prev => {
            const newPlan = JSON.parse(JSON.stringify(prev));
            if (newPlan[date] && newPlan[date][slot]) {
                newPlan[date][slot].splice(index, 1);
            }
            return newPlan;
        });
    };

    const toggleCustomItemCompleted = (date: string, slot: string, index: number) => {
        setMealPlan(prev => {
            const newPlan = JSON.parse(JSON.stringify(prev));
            if (newPlan[date]?.[slot]?.[index]) {
                newPlan[date][slot][index].completed = !newPlan[date][slot][index].completed;
            }
            return newPlan;
        });
    };

    const clearCompletedFlexibleMeals = () => {
        setMealPlan(prev => {
            const newPlan = JSON.parse(JSON.stringify(prev));
            if (newPlan[UNSCHEDULED_PLAN_KEY]?.[FLEXIBLE_SLOT_KEY]) {
                newPlan[UNSCHEDULED_PLAN_KEY][FLEXIBLE_SLOT_KEY] =
                    newPlan[UNSCHEDULED_PLAN_KEY][FLEXIBLE_SLOT_KEY].filter((m: any) => !m.completed);
            }
            return newPlan;
        });
    };

    const initiateToggleStatus = (date: string, slot: string, index: number, recipeId: number) => {
        const isCurrentlyCompleted = mealPlan[date]?.[slot]?.[index]?.completed;
        const recipe = recipes.find(r => r.id === recipeId);

        if (!recipe) return;

        if (!isCurrentlyCompleted) {
            setPendingAction({
                date,
                slot,
                index,
                recipeId,
                recipeName: recipe.name
            });
        } else {
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
        let missingIngs: Ingredient[] = [];

        if (recipe) {
            const res = deductPantryIngredients(recipe.ingredients, isUndo);
            missingIngs = res.missing;
        }

        setPendingAction(null);

        if (!isUndo) {
            if (missingIngs.length > 0) {
                setMissingIngredientsPrompt({ recipeName: recipe?.name || 'Recipe', missing: missingIngs });
            } else if (userProfile.preferences?.enableConfetti !== false) {
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
        const itemsToAdd: Omit<PantryItem, 'id'>[] = ingredientsToAdd.map((ing) => ({
            name: ing.name,
            quantity: 1,
            unit: ing.unit || 'unit',
            category: ing.category || 'Other',
            expiryDate: inferDefaultExpiryDate(ing.category || 'Other', ing.name)
        }));

        await batchAddPantryItems(itemsToAdd);
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

    const handleSmartAutoFill = () => {
        if (recipes.length === 0) {
            setPlannerBanner('Add at least one recipe to your cookbook before auto-filling.');
            return;
        }
        recordSnapshotForUndo();
        const result = generateSmartWeeklyPlan({
            recipes,
            pantry,
            currentPlan: mealPlan,
            weekDates: days,
            scheduleMatrix,
            mode: viewMode,
            targetListCount: targetWeeklySlots,
            householdMembers: userProfile.householdMembers || []
        });
        setMealPlan(result.mealPlan);
        setPlannerBanner(
            result.addedCount > 0
                ? `Smart Auto-Filled ${result.addedCount} meal(s) using your pantry & expiry radar (0 credits)!`
                : 'All active meal slots for this week are already filled!'
        );
    };

    const handleExportIcsCalendar = () => {
        const weekLabel = formatDate(weekStartDate);
        const icsContent = generateMealPlanIcs(mealPlan, recipes, weekLabel);
        downloadTextFile(`kitchensync-meals-${weekLabel}.ics`, icsContent, 'text/calendar;charset=utf-8');
        setPlannerBanner('Downloaded .ics Meal Calendar! Open it to import into Apple, Google, or Outlook Calendar.');
    };

    const getDayNutritionSummary = (dateStr: string) => {
        const dayPlan = mealPlan[dateStr];
        if (!dayPlan) return { calories: 0, protein: 0, carbs: 0, fat: 0, conflicts: [] as string[] };
        let calories = 0;
        let protein = 0;
        let carbs = 0;
        let fat = 0;
        const conflictsSet = new Set<string>();

        ALL_MEAL_SLOTS.forEach(slot => {
            (dayPlan[slot] || []).forEach(entry => {
                if (entry.recipeId) {
                    const r = recipes.find(rec => rec.id === entry.recipeId);
                    if (r) {
                        calories += Number(r.calories) || 0;
                        protein += Number(r.protein) || 0;
                        carbs += Number(r.carbs) || 0;
                        fat += Number(r.fat) || 0;
                        const c = checkDietaryConflicts(r, userProfile.householdMembers || []);
                        c.forEach(item =>
                            conflictsSet.add(`${item.memberName}: ${item.restriction} (${item.offendingIngredient})`)
                        );
                    }
                }
            });
        });

        return { calories, protein, carbs, fat, conflicts: Array.from(conflictsSet) };
    };

    const changeWeek = (direction: 'prev' | 'next' | 'today') => {
        if (direction === 'today') {
            setWeekStartDate(getStartOfWeek(new Date()));
            return;
        }
        const newDate = new Date(weekStartDate);
        newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
        setWeekStartDate(newDate);
    };

    // Dynamic Planning Progress Logic based on active scheduleMatrix + flexible list
    const { planningProgress, plannedCount, targetWeeklySlots } = useMemo(() => {
        const target = Math.max(1, countWeeklyTargetSlots(scheduleMatrix));
        let filled = 0;

        days.forEach(day => {
            const d = formatDate(day);
            const activeSlots = getActiveSlotsForDate(day, scheduleMatrix);
            const dayData = mealPlan[d];
            if (dayData) {
                activeSlots.forEach(slot => {
                    if (dayData[slot]?.length > 0) filled++;
                });
            }
        });

        // Also count unscheduled flexible list meals toward the weekly goal
        filled += flexibleMeals.length;

        return {
            plannedCount: filled,
            targetWeeklySlots: target,
            planningProgress: Math.min(100, Math.round((filled / target) * 100))
        };
    }, [mealPlan, days, scheduleMatrix, flexibleMeals.length]);

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
                            <p className="text-xs text-gray-500 dark:text-gray-400 md:hidden mt-1">
                                {selectedMobileRecipe ? 'Tap a slot or list below to add' : 'Tap a recipe to select, then add to your list or day.'}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 hidden md:block mt-1">
                                {viewMode === 'list' ? 'Drag or click + to add to List' : 'Drag & Drop onto Calendar'}
                            </p>
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
                            const score = pantryScoresMap.get(recipe.id);
                            
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
                                    <div className="min-w-0 pr-2">
                                        <p className={`font-bold text-sm line-clamp-1 ${isSelected ? 'text-blue-900' : 'text-gray-800 dark:text-gray-100'}`}>{recipe.name}</p>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            <p className={`text-[10px] uppercase tracking-wide font-semibold ${isSelected ? 'text-blue-500' : 'text-gray-500 dark:text-gray-400'}`}>{recipe.meal_type}</p>
                                            {score && score.totalCount > 0 && (
                                                <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                                                    score.matchPercentage >= 80
                                                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                                                }`}>
                                                    {score.matchPercentage}% pantry
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                addMealToSlot(UNSCHEDULED_PLAN_KEY, FLEXIBLE_SLOT_KEY, recipe.id, null);
                                            }}
                                            title="Add to Pick-Throughout-the-Week List"
                                            className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-600 hover:text-white transition-colors flex items-center justify-center text-xs"
                                        >
                                            <i className="fas fa-list-check"></i>
                                        </button>
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
                        Custom Event / Meal
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
                            placeholder="Type & Drag or Add to List"
                            value={customItemInput}
                            onChange={(e) => {
                                setCustomItemInput(e.target.value);
                                if (selectedMobileRecipe && 'customName' in selectedMobileRecipe) setSelectedMobileRecipe(null);
                            }}
                            className="w-full bg-transparent text-sm font-bold text-yellow-900 dark:text-yellow-100 placeholder-yellow-600/60 dark:placeholder-yellow-300/60 text-center outline-none"
                        />
                        <div className="flex gap-2 mt-2">
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (customItemInput.trim()) {
                                        addMealToSlot(UNSCHEDULED_PLAN_KEY, FLEXIBLE_SLOT_KEY, null, customItemInput.trim());
                                        setCustomItemInput('');
                                    }
                                }}
                                className="w-full text-xs font-bold py-1.5 px-2 rounded-lg bg-yellow-500 hover:bg-yellow-600 text-white transition-colors"
                            >
                                + Add to Meal List
                            </button>
                            <button 
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (customItemInput) {
                                        const isSelected = selectedMobileRecipe && 'customName' in selectedMobileRecipe && selectedMobileRecipe.customName === customItemInput;
                                        setSelectedMobileRecipe(isSelected ? null : { customName: customItemInput });
                                    }
                                }}
                                className={`w-full text-xs font-bold py-1.5 rounded-lg md:hidden transition-colors ${selectedMobileRecipe && 'customName' in selectedMobileRecipe ? 'bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-100' : 'bg-yellow-400 dark:bg-yellow-600 text-white'}`}
                            >
                                {selectedMobileRecipe && 'customName' in selectedMobileRecipe ? 'Deselect' : 'Select'}
                            </button>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Planner Area */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Top Control Bar */}
                <div className="flex flex-col gap-4 mb-6 bg-white dark:bg-gray-800 dark:text-gray-100 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="flex flex-col xl:flex-row justify-between items-center gap-4">
                        <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto justify-between xl:justify-start">
                            <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 p-1 rounded-xl">
                                <button onClick={() => changeWeek('prev')} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white dark:hover:bg-gray-800 hover:shadow-sm text-gray-600 dark:text-gray-300 transition-all"><i className="fas fa-chevron-left"></i></button>
                                <button onClick={() => changeWeek('today')} className="px-3 py-1 text-sm font-bold text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-800 hover:shadow-sm rounded-lg transition-all">Today</button>
                                <button onClick={() => changeWeek('next')} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white dark:hover:bg-gray-800 hover:shadow-sm text-gray-600 dark:text-gray-300 transition-all"><i className="fas fa-chevron-right"></i></button>
                            </div>
                            <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">
                                {weekStartDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} Week
                            </h1>
                        </div>

                        {/* View Switcher & Schedule Setup Button */}
                        <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto justify-between xl:justify-end">
                            <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-xl">
                                <button
                                    type="button"
                                    onClick={() => setViewMode('calendar')}
                                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                                        viewMode === 'calendar'
                                            ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                                            : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
                                    }`}
                                >
                                    <i className="fas fa-calendar-alt"></i>
                                    Calendar
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setViewMode('list')}
                                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                                        viewMode === 'list'
                                            ? 'bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                                            : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
                                    }`}
                                >
                                    <i className="fas fa-list-check"></i>
                                    Meal List
                                    {flexibleMeals.length > 0 && (
                                        <span className="bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-200 px-1.5 py-0.2 rounded-full text-[10px]">
                                            {flexibleMeals.length}
                                        </span>
                                    )}
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={handleSmartAutoFill}
                                title="Fill open slots for this week using your Pantry & Expiry Radar (0 Credits)"
                                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-700 hover:to-teal-700 shadow-sm transition-all flex items-center gap-1.5"
                            >
                                <i className="fas fa-wand-magic-sparkles"></i>
                                <span>Smart Auto-Fill</span>
                            </button>

                            {planHistory.length > 0 && (
                                <button
                                    type="button"
                                    onClick={handleUndoLastChange}
                                    title="Undo last auto-fill or change"
                                    className="px-3 py-2 rounded-xl text-xs font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 hover:bg-amber-200 transition-all flex items-center gap-1.5"
                                >
                                    <i className="fas fa-rotate-left"></i>
                                    <span>Undo</span>
                                </button>
                            )}

                            <button
                                type="button"
                                onClick={handleExportIcsCalendar}
                                title="Download .ics Calendar file for Apple, Google, or Outlook Calendar"
                                className="px-3 py-2 rounded-xl text-xs font-bold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-blue-900/40 hover:text-blue-600 transition-all flex items-center gap-1.5"
                            >
                                <i className="fas fa-calendar-check"></i>
                                <span>.ics Export</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setShowScheduleSetup(prev => !prev)}
                                className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 ${
                                    showScheduleSetup
                                        ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                                        : 'bg-gray-50 dark:bg-gray-700/60 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600 hover:border-blue-400'
                                }`}
                            >
                                <i className="fas fa-sliders-h"></i>
                                <span>Schedule Setup ({targetWeeklySlots}/wk)</span>
                            </button>

                            {/* Weekly Progress Bar */}
                            <div className="flex items-center gap-2 w-full sm:w-48">
                                <span className="text-[11px] font-bold text-gray-400 uppercase whitespace-nowrap">
                                    {plannedCount}/{targetWeeklySlots} Planned
                                </span>
                                <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                                    <div
                                        className="bg-gradient-to-r from-blue-400 to-purple-500 h-2.5 rounded-full transition-all duration-700 ease-out"
                                        style={{ width: `${planningProgress}%` }}
                                    ></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {plannerBanner && (
                        <div className="flex items-center justify-between gap-2 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700/60 text-emerald-800 dark:text-emerald-200 px-3.5 py-2 rounded-xl text-xs font-semibold animate-fade-in">
                            <span><i className="fas fa-check-circle mr-1.5"></i>{plannerBanner}</span>
                            <button type="button" onClick={() => setPlannerBanner(null)} className="text-emerald-600 hover:text-emerald-900 font-bold">&times;</button>
                        </div>
                    )}

                    {/* Collapsible Schedule Setup Drawer */}
                    {showScheduleSetup && (
                        <div className="pt-4 border-t border-gray-100 dark:border-gray-700 animate-fade-in">
                            <div className="flex justify-between items-center mb-3">
                                <div>
                                    <h3 className="text-sm font-extrabold text-gray-800 dark:text-gray-100">
                                        Customize What Needs to Be Scheduled
                                    </h3>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        Select only the meals you actually plan (e.g. Only Dinners, or Dinners + Wednesday Lunches). Syncs with AI Architect!
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowScheduleSetup(false)}
                                    className="text-xs font-bold text-blue-600 hover:underline"
                                >
                                    Done
                                </button>
                            </div>
                            <ScheduleSelector matrix={scheduleMatrix} onChange={handleScheduleMatrixChange} compact />
                        </div>
                    )}
                </div>

                {/* VIEW 1: FLEXIBLE LIST VIEW ("Pick Throughout the Week" + Weekly Agenda) */}
                {viewMode === 'list' ? (
                    <div className="flex-grow overflow-y-auto space-y-6 pb-8 custom-scrollbar">
                        {/* Flexible Weekly Pick-List Card */}
                        <div
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => handleDrop(UNSCHEDULED_PLAN_KEY, FLEXIBLE_SLOT_KEY, e)}
                            className="bg-white dark:bg-gray-800 dark:text-gray-100 p-6 rounded-2xl shadow-md border-2 border-indigo-100 dark:border-indigo-900/50"
                        >
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 pb-3 border-b border-gray-100 dark:border-gray-700">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 flex items-center justify-center font-bold">
                                            <i className="fas fa-list-check"></i>
                                        </span>
                                        <h2 className="text-xl font-extrabold text-gray-800 dark:text-gray-100">
                                            Pick Throughout the Week
                                        </h2>
                                        <span className="text-xs font-bold bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 px-2.5 py-0.5 rounded-full">
                                            {flexibleMeals.filter(m => !m.completed).length} ready • {flexibleMeals.filter(m => m.completed).length} done
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        Build your list of meals for the week and pick what to cook whenever you're ready. All uncompleted meals automatically sync to your Shopping List!
                                    </p>
                                </div>

                                <div className="flex items-center gap-2">
                                    {selectedMobileRecipe && (
                                        <button
                                            type="button"
                                            onClick={() => handleMobileSlotTap(UNSCHEDULED_PLAN_KEY, FLEXIBLE_SLOT_KEY)}
                                            className="px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold animate-pulse shadow-sm"
                                        >
                                            <i className="fas fa-plus mr-1"></i> Add Selected Here
                                        </button>
                                    )}
                                    {flexibleMeals.some(m => m.completed) && (
                                        <button
                                            type="button"
                                            onClick={clearCompletedFlexibleMeals}
                                            className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-red-50 hover:text-red-600 rounded-xl text-xs font-bold transition-colors"
                                        >
                                            <i className="fas fa-broom mr-1"></i> Clear Completed
                                        </button>
                                    )}
                                </div>
                            </div>

                            {flexibleMeals.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {flexibleMeals.map((item, idx) => {
                                        const recipe = item.recipeId ? recipes.find(r => r.id === item.recipeId) : null;
                                        const isCompleted = !!item.completed;
                                        const score = recipe ? pantryScoresMap.get(recipe.id) : null;
                                        const canMakeNow = score ? score.matchPercentage >= 80 : false;

                                        return (
                                            <div
                                                key={idx}
                                                draggable
                                                onDragStart={(e) => {
                                                    e.dataTransfer.setData("sourceDate", UNSCHEDULED_PLAN_KEY);
                                                    e.dataTransfer.setData("sourceSlot", FLEXIBLE_SLOT_KEY);
                                                    e.dataTransfer.setData("sourceIndex", idx.toString());
                                                }}
                                                className={`p-4 rounded-xl border transition-all flex flex-col justify-between gap-3 ${
                                                    isCompleted
                                                        ? 'bg-green-50/60 dark:bg-green-900/20 border-green-200 dark:border-green-800/50 opacity-75'
                                                        : 'bg-gray-50/70 dark:bg-gray-700/40 border-gray-200 dark:border-gray-700 hover:border-indigo-300 hover:shadow-md'
                                                }`}
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                                                            {recipe ? (
                                                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-200">
                                                                    {recipe.meal_type}
                                                                </span>
                                                            ) : (
                                                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800">
                                                                    Custom Meal
                                                                </span>
                                                            )}
                                                            {recipe && canMakeNow && !isCompleted && (
                                                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                                                                    <i className="fas fa-check-circle mr-1"></i>In Pantry
                                                                </span>
                                                            )}
                                                        </div>

                                                        {recipe ? (
                                                            <Link
                                                                to={`/recipes/${recipe.id}`}
                                                                className={`font-extrabold text-base hover:text-indigo-600 transition-colors block truncate ${
                                                                    isCompleted ? 'line-through text-green-800 dark:text-green-300' : 'text-gray-800 dark:text-gray-100'
                                                                }`}
                                                            >
                                                                {recipe.name}
                                                            </Link>
                                                        ) : (
                                                            <p className={`font-extrabold text-base ${isCompleted ? 'line-through text-green-800' : 'text-gray-800 dark:text-gray-100'}`}>
                                                                {item.custom_item_name}
                                                            </p>
                                                        )}

                                                        {recipe && (
                                                            <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                                <span><i className="fas fa-clock mr-1"></i>{recipe.cook_time || recipe.prep_time}</span>
                                                                <span><i className="fas fa-fire mr-1"></i>{recipe.calories} kcal</span>
                                                                <span><i className="fas fa-users mr-1"></i>{recipe.servings} serv</span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={() => removeItemFromPlan(UNSCHEDULED_PLAN_KEY, FLEXIBLE_SLOT_KEY, idx)}
                                                        className="text-gray-400 hover:text-red-500 p-1 transition-colors"
                                                        title="Remove from list"
                                                    >
                                                        <i className="fas fa-trash-alt text-xs"></i>
                                                    </button>
                                                </div>

                                                {/* Action Row */}
                                                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-200/60 dark:border-gray-600/50">
                                                    {recipe && !isCompleted && (
                                                        <Link
                                                            to={`/recipes/${recipe.id}/cook`}
                                                            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2 px-3 rounded-lg text-center transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                                                        >
                                                            <i className="fas fa-play text-[10px]"></i> Cook Now
                                                        </Link>
                                                    )}

                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            recipe
                                                                ? initiateToggleStatus(UNSCHEDULED_PLAN_KEY, FLEXIBLE_SLOT_KEY, idx, recipe.id)
                                                                : toggleCustomItemCompleted(UNSCHEDULED_PLAN_KEY, FLEXIBLE_SLOT_KEY, idx)
                                                        }
                                                        className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${
                                                            isCompleted
                                                                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                                                : 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700 hover:bg-emerald-500 hover:text-white'
                                                        }`}
                                                    >
                                                        <i className={`fas ${isCompleted ? 'fa-rotate-left' : 'fa-check'}`}></i>
                                                        {isCompleted ? 'Completed (Undo)' : 'Mark Cooked'}
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() => setAssigningListIndex(assigningListIndex === idx ? null : idx)}
                                                        className="py-2 px-2.5 rounded-lg text-xs font-bold bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-400 transition-colors"
                                                        title="Assign to a specific day"
                                                    >
                                                        <i className="fas fa-calendar-plus"></i>
                                                    </button>
                                                </div>

                                                {/* Quick Assign to Day Picker */}
                                                {assigningListIndex === idx && (
                                                    <div className="p-2.5 bg-white dark:bg-gray-800 rounded-lg border border-blue-200 dark:border-gray-600 animate-fade-in">
                                                        <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-2">
                                                            Move to Day:
                                                        </p>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {days.map(d => {
                                                                const dStr = formatDate(d);
                                                                const activeSlots = getActiveSlotsForDate(d, scheduleMatrix);
                                                                const targetSlot = activeSlots[0] || 'Dinner';
                                                                return (
                                                                    <button
                                                                        key={dStr}
                                                                        type="button"
                                                                        onClick={() => {
                                                                            moveMeal(UNSCHEDULED_PLAN_KEY, FLEXIBLE_SLOT_KEY, idx, dStr, targetSlot);
                                                                            setAssigningListIndex(null);
                                                                        }}
                                                                        className="px-2 py-1 text-[11px] font-bold rounded bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-200 hover:bg-blue-600 hover:text-white transition-colors"
                                                                    >
                                                                        {d.toLocaleDateString('en-US', { weekday: 'short' })} ({targetSlot})
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-center py-10 border-2 border-dashed border-indigo-100 dark:border-gray-700 rounded-xl bg-indigo-50/20 dark:bg-gray-800/40">
                                    <i className="fas fa-clipboard-list text-4xl text-indigo-300 mb-2"></i>
                                    <p className="font-bold text-gray-700 dark:text-gray-200">Your Flexible Weekly Meal List is empty</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-md mx-auto">
                                        Click the <i className="fas fa-list-check text-indigo-500 mx-1"></i> button on any recipe in the left tray (or drag it here) to build a list of meals to pick from throughout the week!
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Weekly Scheduled Agenda in List View */}
                        <div className="bg-white dark:bg-gray-800 dark:text-gray-100 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                            <div className="flex justify-between items-center mb-4">
                                <div>
                                    <h3 className="text-lg font-extrabold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                                        <i className="fas fa-calendar-day text-blue-500"></i>
                                        Scheduled Days This Week
                                    </h3>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        Showing only your active scheduled slots ({targetWeeklySlots} slots/week).
                                    </p>
                                </div>
                            </div>

                            <div className="divide-y divide-gray-100 dark:divide-gray-700">
                                {days.map(day => {
                                    const dateStr = formatDate(day);
                                    const dayPlan = mealPlan[dateStr] || { Breakfast: [], Lunch: [], Dinner: [], Snack: [] };
                                    const activeSlots = getActiveSlotsForDate(day, scheduleMatrix);
                                    const visibleSlots = ALL_MEAL_SLOTS.filter(
                                        s => activeSlots.includes(s) || (dayPlan[s] && dayPlan[s].length > 0)
                                    );
                                    if (visibleSlots.length === 0) return null;
                                    const daySummary = getDayNutritionSummary(dateStr);

                                    return (
                                        <div key={dateStr} className="py-3 flex flex-col md:flex-row md:items-center gap-3">
                                            <div className="w-36 flex-shrink-0">
                                                <span className="text-xs font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 block">
                                                    {day.toLocaleDateString('en-US', { weekday: 'short' })}
                                                </span>
                                                <span className="text-sm font-bold text-gray-700 dark:text-gray-200">
                                                    {day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                </span>
                                                {daySummary.calories > 0 && (
                                                    <div className="mt-1 flex flex-wrap gap-1">
                                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                                            userProfile.dailyCalorieGoal && daySummary.calories > userProfile.dailyCalorieGoal * 1.15
                                                                ? 'bg-red-100 text-red-700'
                                                                : 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                                                        }`}>
                                                            {daySummary.calories} kcal
                                                        </span>
                                                        {daySummary.protein > 0 && (
                                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                                                {daySummary.protein}g P
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                                {daySummary.conflicts.length > 0 && (
                                                    <span
                                                        title={`Dietary conflict: ${daySummary.conflicts.join(', ')}`}
                                                        className="mt-1 inline-block text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700"
                                                    >
                                                        <i className="fas fa-triangle-exclamation mr-1"></i>Diet Alert
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                                {visibleSlots.map(slot => {
                                                    const items = dayPlan[slot] || [];
                                                    return (
                                                        <div
                                                            key={slot}
                                                            onDragOver={(e) => e.preventDefault()}
                                                            onDrop={(e) => handleDrop(dateStr, slot, e)}
                                                            onClick={() => selectedMobileRecipe && handleMobileSlotTap(dateStr, slot)}
                                                            className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-700/40 border border-gray-100 dark:border-gray-700 flex flex-col gap-1.5"
                                                        >
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{slot}</span>
                                                                {selectedMobileRecipe && (
                                                                    <span className="text-[10px] text-blue-500 font-bold">+ Tap to Add</span>
                                                                )}
                                                            </div>
                                                            {items.length > 0 ? (
                                                                items.map((item, index) => {
                                                                    const recipe = item.recipeId ? recipes.find(r => r.id === item.recipeId) : null;
                                                                    return (
                                                                        <div key={index} className="flex items-center justify-between gap-2 bg-white dark:bg-gray-800 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-xs">
                                                                            <span className={`font-bold truncate ${item.completed ? 'line-through text-green-600' : 'text-gray-800 dark:text-gray-100'}`}>
                                                                                {recipe ? recipe.name : item.custom_item_name}
                                                                            </span>
                                                                            <div className="flex items-center gap-1.5 flex-shrink-0">
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        moveMeal(dateStr, slot, index, UNSCHEDULED_PLAN_KEY, FLEXIBLE_SLOT_KEY);
                                                                                    }}
                                                                                    title="Move to Flexible Weekly List"
                                                                                    className="text-gray-400 hover:text-indigo-500"
                                                                                >
                                                                                    <i className="fas fa-list-check"></i>
                                                                                </button>
                                                                                {recipe && (
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            initiateToggleStatus(dateStr, slot, index, recipe.id);
                                                                                        }}
                                                                                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${item.completed ? 'bg-green-100 text-green-700' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-green-500 hover:text-white'}`}
                                                                                    >
                                                                                        {item.completed ? 'Done' : 'Cook'}
                                                                                    </button>
                                                                                )}
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        removeItemFromPlan(dateStr, slot, index);
                                                                                    }}
                                                                                    className="text-gray-400 hover:text-red-500"
                                                                                >
                                                                                    &times;
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })
                                                            ) : (
                                                                <span className="text-xs text-gray-400 italic">Open slot</span>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                ) : (
                    /* VIEW 2: CALENDAR VIEW (Filtered by Active Schedule Matrix) */
                    <div className="flex-grow overflow-y-auto md:overflow-y-hidden md:overflow-x-auto custom-scrollbar">
                        <div className="flex flex-col md:flex-row gap-4 h-full pb-4">
                            {days.map(day => {
                                const dateStr = formatDate(day);
                                const dayPlan = mealPlan[dateStr] || { Breakfast: [], Lunch: [], Dinner: [], Snack: [] };
                                const isToday = formatDate(new Date()) === dateStr;
                                const activeSlots = getActiveSlotsForDate(day, scheduleMatrix);
                                const isDayExpanded = !!expandedDays[dateStr];

                                // Show slots that are enabled in scheduleMatrix, OR that already have items, OR all slots if expanded
                                const slotsToRender: MealSlotType[] = isDayExpanded
                                    ? ALL_MEAL_SLOTS
                                    : ALL_MEAL_SLOTS.filter(
                                          slot => activeSlots.includes(slot) || (dayPlan[slot] && dayPlan[slot].length > 0)
                                      );
                                const daySummary = getDayNutritionSummary(dateStr);

                                return (
                                    <div key={dateStr} className={`flex-shrink-0 w-full md:w-[300px] rounded-2xl flex flex-col p-3 space-y-3 border transition-all md:h-full md:overflow-y-auto custom-scrollbar md:snap-center ${isToday ? 'bg-blue-50/50 border-blue-200 shadow-md ring-2 ring-blue-100' : 'bg-white dark:bg-gray-800 dark:text-gray-100 border-gray-100 dark:border-gray-700 shadow-sm'}`}>
                                        <div className="text-center pb-2 border-b border-gray-100 dark:border-gray-700/50 sticky top-0 bg-inherit z-10 backdrop-blur-sm">
                                            <div className="flex items-center justify-between px-2">
                                                <div className="w-6"></div>
                                                <div>
                                                    <h3 className={`font-black uppercase tracking-wider text-xs ${isToday ? 'text-blue-600' : 'text-gray-400'}`}>{day.toLocaleDateString('en-US', { weekday: 'short' })}</h3>
                                                    <p className={`text-xl font-bold ${isToday ? 'text-blue-800' : 'text-gray-800 dark:text-gray-100'}`}>{day.getDate()}</p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setExpandedDays(prev => ({ ...prev, [dateStr]: !prev[dateStr] }))}
                                                    title={isDayExpanded ? "Show only scheduled slots" : "Show all meal slots for this day"}
                                                    className="w-6 h-6 rounded-full text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center text-xs"
                                                >
                                                    <i className={`fas ${isDayExpanded ? 'fa-compress-alt' : 'fa-ellipsis-h'}`}></i>
                                                </button>
                                            </div>
                                            {(daySummary.calories > 0 || daySummary.conflicts.length > 0) && (
                                                <div className="flex flex-wrap items-center justify-center gap-1 mt-1.5 px-1">
                                                    {daySummary.calories > 0 && (
                                                        <span
                                                            title={userProfile.dailyCalorieGoal ? `Daily Goal: ${userProfile.dailyCalorieGoal} kcal` : 'Scheduled daily calories'}
                                                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                                                userProfile.dailyCalorieGoal && daySummary.calories > userProfile.dailyCalorieGoal * 1.15
                                                                    ? 'bg-red-100 text-red-700'
                                                                    : 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                                                            }`}
                                                        >
                                                            {daySummary.calories} kcal
                                                        </span>
                                                    )}
                                                    {daySummary.protein > 0 && (
                                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                                            {daySummary.protein}g P
                                                        </span>
                                                    )}
                                                    {daySummary.conflicts.length > 0 && (
                                                        <span
                                                            title={`Household dietary conflict: ${daySummary.conflicts.join(', ')}`}
                                                            className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700"
                                                        >
                                                            <i className="fas fa-triangle-exclamation mr-1"></i>Diet Alert
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {slotsToRender.length > 0 ? (
                                            slotsToRender.map(slot => (
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

                                                    <div className={`flex-grow rounded-xl transition-all border-2 border-transparent space-y-2 ${dayPlan[slot]?.length === 0 ? 'bg-gray-50 dark:bg-gray-700/50 border-dashed border-gray-200 dark:border-gray-700 group-hover/slot:bg-blue-50/30 group-hover/slot:border-blue-200' : ''} p-1`}>
                                                        {dayPlan[slot]?.map((item, index) => {
                                                            const recipe = item.recipeId ? recipes.find(r => r.id === item.recipeId) : null;
                                                            const isCompleted = item.completed;

                                                            return (
                                                                <div 
                                                                    key={index}
                                                                    draggable
                                                                    onDragStart={(e) => {
                                                                        e.stopPropagation();
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
                                            ))
                                        ) : (
                                            <div className="flex-grow flex flex-col items-center justify-center text-center p-6 text-gray-400">
                                                <i className="fas fa-mug-saucer text-2xl mb-2 opacity-50"></i>
                                                <p className="text-xs font-semibold">No meals scheduled</p>
                                                <button
                                                    type="button"
                                                    onClick={() => setExpandedDays(prev => ({ ...prev, [dateStr]: true }))}
                                                    className="mt-2 text-[11px] font-bold text-blue-500 hover:underline"
                                                >
                                                    + Add meal anyway
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
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
