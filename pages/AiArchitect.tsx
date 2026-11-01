
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Recipe, MealPlan, MealSlotType, MealPlanSlot } from '../types';
import { useKitchen } from '../context/KitchenContext';
import { useUser } from '../context/UserContext';
import { generateMealPlan } from '../services/geminiService';
import Spinner from '../components/Spinner';
import ScheduleSelector from '../components/ScheduleSelector';
import {
    normalizeScheduleMatrix,
    countWeeklyTargetSlots,
    getActiveSlotsForDate,
    ALL_MEAL_SLOTS,
    UNSCHEDULED_PLAN_KEY,
    FLEXIBLE_SLOT_KEY
} from '../utils/schedule';

interface GeneratedDay {
    date: string;
    dayOfWeek: string;
    meals: {
        Breakfast?: string;
        Lunch?: string;
        Dinner?: string;
        Snack?: string;
    };
}

interface GeneratedListMeal {
    mealName: string;
    mealType?: MealSlotType;
    reason?: string;
}

const AiArchitect: React.FC = () => {
    const { recipes, pantry, setMealPlan } = useKitchen();
    const { userProfile, consumeCredits, getAccessToken, updatePreferences } = useUser();

    const scheduleMatrix = useMemo(
        () => normalizeScheduleMatrix(userProfile.preferences?.scheduleMatrix),
        [userProfile.preferences?.scheduleMatrix]
    );
    const weeklyTargetCount = useMemo(
        () => countWeeklyTargetSlots(scheduleMatrix),
        [scheduleMatrix]
    );

    // Core Directives
    const [theme, setTheme] = useState('A Balanced and Varied Plan');
    const [usePantry, setUsePantry] = useState(false);
    const [useFavorites, setUseFavorites] = useState(true);
    const [useHighestRated, setUseHighestRated] = useState(false);
    const [caloriesPerDay, setCaloriesPerDay] = useState(userProfile.dailyCalorieGoal || 2000);
    const [complexity, setComplexity] = useState('Moderate');
    const [customDiet, setCustomDiet] = useState('');

    // Timeframe & Structure
    const [planMode, setPlanMode] = useState<'scheduled' | 'list'>(
        userProfile.preferences?.plannerViewMode === 'list' ? 'list' : 'scheduled'
    );
    const [startDate, setStartDate] = useState(() => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow.toISOString().split('T')[0];
    });
    const [duration, setDuration] = useState(7);
    const [listMealCount, setListMealCount] = useState<number>(() => Math.max(1, weeklyTargetCount || 7));

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [generatedPlan, setGeneratedPlan] = useState<any[] | null>(null);
    const [generatedMode, setGeneratedMode] = useState<'scheduled' | 'list'>('scheduled');
    const navigate = useNavigate();

    const creditCost = useMemo(() => {
        if (planMode === 'list') {
            if (listMealCount <= 7) return 1;
            if (listMealCount <= 14) return 3;
            return 5;
        }
        if (duration <= 5) return 1;
        if (duration <= 14) return 3;
        return 5;
    }, [planMode, duration, listMealCount]);

    const activeSlotTypes = useMemo(() => {
        const set = new Set<string>();
        (Object.values(scheduleMatrix) as MealSlotType[][]).forEach(daySlots => {
            daySlots.forEach(s => set.add(s));
        });
        return set.size > 0 ? Array.from(set) : ['Dinner'];
    }, [scheduleMatrix]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (planMode === 'scheduled' && weeklyTargetCount === 0) {
            setError("Please select at least one meal slot in your schedule (e.g. Only Dinners).");
            return;
        }

        if (planMode === 'list' && (!listMealCount || listMealCount < 1)) {
            setError("Please specify at least 1 meal to generate for your list.");
            return;
        }

        if (!consumeCredits(creditCost, true)) return;

        setIsLoading(true);
        setError(null);
        setGeneratedPlan(null);
        try {
            const token = await getAccessToken();
            const plan = await generateMealPlan(
                recipes,
                theme,
                usePantry,
                useFavorites,
                useHighestRated,
                caloriesPerDay,
                startDate,
                duration,
                activeSlotTypes,
                token,
                complexity,
                customDiet,
                pantry,
                creditCost,
                {
                    mode: planMode,
                    scheduleMatrix,
                    listCount: listMealCount
                }
            );

            if (plan && Array.isArray(plan)) {
                setGeneratedMode(planMode);
                setGeneratedPlan(plan);
            } else {
                setError("The AI failed to generate a valid meal plan. Please try again.");
            }
        } catch (e) {
            setError("An unexpected error occurred.");
        } finally {
            setIsLoading(false);
        }
    };

    const savePlan = () => {
        if (!generatedPlan) return;

        if (generatedMode === 'list') {
            const newFlexibleItems: MealPlanSlot[] = (generatedPlan as GeneratedListMeal[])
                .filter(item => item && item.mealName)
                .map(item => {
                    const nameStr = String(item.mealName).trim();
                    const mealType: MealSlotType = ALL_MEAL_SLOTS.includes(item.mealType as MealSlotType)
                        ? (item.mealType as MealSlotType)
                        : 'Dinner';
                    const recipe = recipes.find(r => r.name.toLowerCase() === nameStr.toLowerCase());
                    if (recipe) {
                        return { recipeId: recipe.id, meal_type: mealType, completed: false };
                    }
                    return { custom_item_name: nameStr, meal_type: mealType, completed: false };
                });

            setMealPlan(prev => {
                const existingList = prev[UNSCHEDULED_PLAN_KEY]?.[FLEXIBLE_SLOT_KEY] || [];
                return {
                    ...prev,
                    [UNSCHEDULED_PLAN_KEY]: {
                        ...(prev[UNSCHEDULED_PLAN_KEY] || {}),
                        [FLEXIBLE_SLOT_KEY]: [...existingList, ...newFlexibleItems]
                    }
                };
            });

            updatePreferences({ plannerViewMode: 'list' });
            navigate('/planner');
            return;
        }

        const newMealPlan: MealPlan = {};

        (generatedPlan as GeneratedDay[]).forEach((dayPlan: GeneratedDay) => {
            const dateStr = dayPlan.date as string;
            if (!dateStr) return;

            if (!newMealPlan[dateStr]) {
                newMealPlan[dateStr] = { Breakfast: [], Lunch: [], Dinner: [], Snack: [] };
            }

            Object.entries(dayPlan.meals || {}).forEach(([slot, recipeName]) => {
                if (!recipeName) return;

                const nameStr = (recipeName as string).trim();
                if (!nameStr || nameStr.toLowerCase() === 'skip') return;

                const recipe = recipes.find(r => r.name.toLowerCase() === nameStr.toLowerCase());
                if (recipe) {
                    newMealPlan[dateStr][slot] = [{ recipeId: recipe.id }];
                } else {
                    newMealPlan[dateStr][slot] = [{ custom_item_name: nameStr }];
                }
            });
        });

        setMealPlan(prev => ({
            ...prev,
            ...newMealPlan
        }));

        updatePreferences({ plannerViewMode: 'calendar' });
        navigate('/planner');
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-12">
            <div className="text-center py-8">
                <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-3xl mx-auto flex items-center justify-center mb-6 shadow-lg shadow-blue-500/30 rotate-3 hover:rotate-6 transition-transform">
                    <i className="fas fa-robot text-4xl text-white"></i>
                </div>
                <h1 className="text-4xl font-extrabold text-gray-800 dark:text-gray-100 tracking-tight mb-2">
                    AI Meal Architect
                </h1>
                <p className="text-gray-500 dark:text-gray-400 text-lg max-w-xl mx-auto">Configure your preferences and let our advanced AI construct the perfect menu for you.</p>
                <div className="mt-4 inline-block bg-yellow-100 text-yellow-800 px-4 py-1 rounded-full text-sm font-bold border border-yellow-200">
                    <i className="fas fa-bolt mr-2"></i> Cost: {creditCost} Credit{creditCost > 1 ? 's' : ''} per Plan
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Controls */}
                <div className="bg-white dark:bg-gray-800 dark:text-gray-100 p-8 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-700 relative overflow-hidden">
                    {/* Household Tip */}
                    <div className="mb-6 p-4 bg-purple-50 text-purple-800 rounded-xl border border-purple-100 text-sm flex items-start">
                        <i className="fas fa-lightbulb text-yellow-500 mt-1 mr-3 text-lg"></i>
                        <div>
                            <strong>Tip:</strong> Add your family members to your Household in your <a href="#/profile" className="underline font-bold hover:text-purple-600">Profile</a> to automatically adjust AI recipes for your family size!
                        </div>
                    </div>

                    <div className="absolute top-0 right-0 p-32 bg-blue-50 rounded-full opacity-50 blur-3xl -mr-16 -mt-16 z-0 pointer-events-none"></div>

                    <form onSubmit={handleSubmit} className="space-y-8 relative z-10">
                        {/* Section 1: Timeframe & Schedule */}
                        <div className="space-y-5">
                            <label className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center">
                                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mr-2 text-xs">1</span>
                                Mission Parameters
                            </label>

                            {/* Plan Output Format Toggle */}
                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Output Format</label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setPlanMode('scheduled')}
                                        className={`p-3.5 rounded-xl border-2 text-left transition-all flex items-start gap-3 ${planMode === 'scheduled' ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-900/20 shadow-sm' : 'border-gray-200 dark:border-gray-700 hover:border-blue-300'}`}
                                    >
                                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${planMode === 'scheduled' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}`}>
                                            <i className="fas fa-calendar-days"></i>
                                        </div>
                                        <div>
                                            <div className={`text-sm font-bold ${planMode === 'scheduled' ? 'text-blue-900 dark:text-blue-200' : 'text-gray-700 dark:text-gray-200'}`}>Scheduled Calendar</div>
                                            <div className="text-[11px] text-gray-500 dark:text-gray-400">Assigns meals to specific days & slots</div>
                                        </div>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPlanMode('list')}
                                        className={`p-3.5 rounded-xl border-2 text-left transition-all flex items-start gap-3 ${planMode === 'list' ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-900/20 shadow-sm' : 'border-gray-200 dark:border-gray-700 hover:border-blue-300'}`}
                                    >
                                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${planMode === 'list' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}`}>
                                            <i className="fas fa-list-check"></i>
                                        </div>
                                        <div>
                                            <div className={`text-sm font-bold ${planMode === 'list' ? 'text-blue-900 dark:text-blue-200' : 'text-gray-700 dark:text-gray-200'}`}>Flexible Meal List</div>
                                            <div className="text-[11px] text-gray-500 dark:text-gray-400">Build a list & pick throughout the week</div>
                                        </div>
                                    </button>
                                </div>
                            </div>

                            {planMode === 'scheduled' ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label htmlFor="startDate" className="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Start Date</label>
                                        <input
                                            type="date"
                                            id="startDate"
                                            value={startDate}
                                            onChange={(e) => setStartDate(e.target.value)}
                                            className="w-full form-input dark:bg-gray-700 dark:text-white dark:border-gray-600 p-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-700/50 focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-100"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="duration" className="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Duration</label>
                                        <select
                                            id="duration"
                                            value={duration}
                                            onChange={(e) => setDuration(parseInt(e.target.value))}
                                            className="w-full form-select p-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-700/50 focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-100"
                                        >
                                            <option value={3}>3 Days</option>
                                            <option value={5}>5 Days</option>
                                            <option value={7}>1 Week</option>
                                            <option value={14}>2 Weeks</option>
                                            <option value={30}>1 Month</option>
                                        </select>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-blue-50/50 dark:bg-gray-700/30 p-4 rounded-xl border border-blue-100 dark:border-gray-700 space-y-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                            <label htmlFor="listMealCount" className="block text-sm font-bold text-gray-700 dark:text-gray-200">Meals to Generate for List</label>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">Saved directly to your "Pick Throughout the Week" list</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                id="listMealCount"
                                                min={1}
                                                max={28}
                                                value={listMealCount}
                                                onChange={(e) => setListMealCount(Math.max(1, Math.min(28, parseInt(e.target.value) || 1)))}
                                                className="w-20 form-input dark:bg-gray-700 dark:text-white dark:border-gray-600 p-2 text-center font-bold border border-gray-200 rounded-lg"
                                            />
                                            <span className="text-xs font-bold text-gray-500">meals</span>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {[5, 7, 10, 14].map(num => (
                                            <button
                                                key={num}
                                                type="button"
                                                onClick={() => setListMealCount(num)}
                                                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${listMealCount === num ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-blue-300'}`}
                                            >
                                                {num} Meals
                                            </button>
                                        ))}
                                        {weeklyTargetCount > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => setListMealCount(weeklyTargetCount)}
                                                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${listMealCount === weeklyTargetCount ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-700'}`}
                                            >
                                                Match My Schedule ({weeklyTargetCount})
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div className="bg-gray-50/70 dark:bg-gray-900/30 p-4 rounded-2xl border border-gray-200/80 dark:border-gray-700">
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-200">
                                            {planMode === 'scheduled' ? 'What Needs to Be Scheduled?' : 'Schedule Template (Meal Mix)'}
                                        </label>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            {planMode === 'scheduled'
                                                ? 'Select presets like Only Dinners, Dinners + Wed Lunch, or toggle individual days.'
                                                : 'Guides the AI on what mix of Dinners, Lunches, or Breakfasts to put in your list.'}
                                        </p>
                                    </div>
                                </div>
                                <ScheduleSelector
                                    matrix={scheduleMatrix}
                                    onChange={(next) => {
                                        updatePreferences({ scheduleMatrix: next });
                                        if (planMode === 'list') {
                                            const nextCount = countWeeklyTargetSlots(next);
                                            if (nextCount > 0) setListMealCount(nextCount);
                                        }
                                    }}
                                    compact
                                />
                            </div>
                        </div>

                        {/* Section 2: Preferences */}
                        <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                            <label className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center">
                                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mr-2 text-xs">2</span>
                                Core Directives
                            </label>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="plan-theme" className="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Theme Selection</label>
                                    <select id="plan-theme" value={theme} onChange={e => setTheme(e.target.value)} className="w-full form-select p-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-gray-50 focus:ring-2 focus:ring-blue-500 cursor-pointer hover:bg-white dark:bg-gray-800 dark:text-gray-100">
                                        <option>A Balanced and Varied Plan</option>
                                        <option>Quick & Easy Dinners (under 30 mins)</option>
                                        <option>Hearty Comfort Food Classics</option>
                                        <option>Healthy & Light Options</option>
                                        <option>Vegetarian Delight</option>
                                        <option>Budget Friendly</option>
                                        <option>High Protein</option>
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="complexity" className="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Meal Complexity</label>
                                    <select
                                        id="complexity"
                                        value={complexity}
                                        onChange={(e) => setComplexity(e.target.value)}
                                        className="w-full form-select p-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-700/50 focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-100"
                                    >
                                        <option value="Simple">Simple (Minimal Prep)</option>
                                        <option value="Moderate">Moderate (Standard)</option>
                                        <option value="Gourmet">Gourmet (Elaborate)</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label htmlFor="calories" className="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Daily Calorie Target</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        id="calories"
                                        value={caloriesPerDay}
                                        onChange={e => setCaloriesPerDay(parseInt(e.target.value))}
                                        className="w-full form-input dark:bg-gray-700 dark:text-white dark:border-gray-600 p-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-gray-50 font-mono font-bold focus:ring-2 focus:ring-blue-500"
                                        min="1000"
                                        max="5000"
                                        step="50"
                                    />
                                    <span className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm font-medium">kcal</span>
                                </div>
                            </div>

                            <div>
                                <label htmlFor="customDiet" className="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Dietary Specifics</label>
                                <input
                                    type="text"
                                    id="customDiet"
                                    value={customDiet}
                                    onChange={(e) => setCustomDiet(e.target.value)}
                                    placeholder="e.g. Keto, No Seafood, High Protein..."
                                    className="w-full form-input dark:bg-gray-700 dark:text-white dark:border-gray-600 p-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-700/50 focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-100"
                                />
                                <p className="text-xs text-gray-400 mt-1">Leave empty to use profile defaults.</p>
                            </div>
                        </div>

                        {/* Section 3: Optimization */}
                        <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                            <label className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center">
                                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mr-2 text-xs">3</span>
                                Optimization
                            </label>
                            <div className="grid grid-cols-1 gap-3">
                                {[
                                    { id: 'use-pantry', label: 'Use Pantry Inventory', state: usePantry, setter: setUsePantry, icon: 'fa-box-open' },
                                    { id: 'focus-favorites', label: 'Include Favorites', state: useFavorites, setter: setUseFavorites, icon: 'fa-heart' },
                                    { id: 'use-highest-rated', label: 'Top Rated Only', state: useHighestRated, setter: setUseHighestRated, icon: 'fa-star' }
                                ].map((opt) => (
                                    <div
                                        key={opt.id}
                                        onClick={() => opt.setter(!opt.state)}
                                        className={`flex items-center p-3 rounded-xl border-2 cursor-pointer transition-all ${opt.state ? 'border-blue-500 bg-blue-50' : 'border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 dark:text-gray-100 hover:border-blue-200'}`}
                                    >
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center mr-3 transition-colors ${opt.state ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-400'}`}>
                                            <i className={`fas ${opt.icon} text-sm`}></i>
                                        </div>
                                        <span className={`font-bold text-sm ${opt.state ? 'text-blue-800' : 'text-gray-600 dark:text-gray-300'}`}>{opt.label}</span>
                                        <div className={`ml-auto w-5 h-5 rounded-full border-2 flex items-center justify-center ${opt.state ? 'border-blue-500 bg-blue-500' : 'border-gray-300 dark:border-gray-600'}`}>
                                            {opt.state && <i className="fas fa-check text-white text-[10px]"></i>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {error && <div className="p-3 bg-red-100 text-red-700 rounded-lg text-sm">{error}</div>}

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-4 rounded-xl font-extrabold text-lg hover:shadow-xl hover:scale-[1.02] transition-all disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none flex justify-center items-center shadow-lg shadow-blue-500/20"
                        >
                            {isLoading ? <Spinner /> : <><i className="fas fa-bolt mr-2 text-yellow-300"></i> Generate Plan ({creditCost} Credit{creditCost > 1 ? 's' : ''})</>}
                        </button>
                    </form>
                </div>

                {/* Results */}
                <div className="bg-gray-900 text-white p-8 rounded-3xl shadow-2xl relative min-h-[600px] flex flex-col">
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>

                    <div className="flex justify-between items-center mb-8 relative z-10 border-b border-gray-700 pb-4">
                        <h2 className="text-2xl font-bold flex items-center">
                            <i className="fas fa-file-invoice mr-3 text-green-400"></i> Blueprint
                        </h2>
                        {generatedPlan && <span className="bg-green-500/20 text-green-400 text-xs font-bold px-3 py-1 rounded-full border border-green-500/30">READY</span>}
                    </div>

                    {isLoading && (
                        <div className="flex-grow flex flex-col justify-center items-center text-center relative z-10">
                            <div className="w-20 h-20 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-6"></div>
                            <h3 className="text-xl font-bold animate-pulse">Constructing Plan...</h3>
                            <p className="text-gray-400 mt-2 text-sm">
                                {planMode === 'list'
                                    ? `Curating ${listMealCount} flexible meals for your weekly list...`
                                    : `Analyzing recipes for ${duration} days starting ${startDate}.`}
                            </p>
                        </div>
                    )}

                    {!isLoading && !generatedPlan && (
                        <div className="flex-grow flex flex-col justify-center items-center text-center relative z-10 opacity-30">
                            <i className="fas fa-clipboard-list text-8xl mb-6"></i>
                            <p className="font-mono">Waiting for input...</p>
                        </div>
                    )}

                    {generatedPlan && (
                        <div className="space-y-6 relative z-10 animate-scale-in flex-grow flex flex-col">
                            <div className="space-y-3 flex-grow overflow-y-auto pr-2 custom-scrollbar max-h-[800px]">
                                {generatedMode === 'list' ? (
                                    <>
                                        <div className="bg-blue-900/30 border border-blue-700/50 rounded-xl p-3 text-xs text-blue-200 flex items-center gap-2">
                                            <i className="fas fa-list-check text-blue-400"></i>
                                            <span>Saving this blueprint adds {generatedPlan.length} meals to your <strong>Pick Throughout the Week</strong> list in the Meal Planner.</span>
                                        </div>
                                        {(generatedPlan as GeneratedListMeal[]).map((item: GeneratedListMeal, i: number) => {
                                            const matchedRecipe = recipes.find(r => r.name.toLowerCase() === String(item.mealName || '').toLowerCase());
                                            return (
                                                <div
                                                    key={i}
                                                    className="bg-gray-800/70 p-4 rounded-xl border border-gray-700 animate-slide-up flex items-start gap-3"
                                                    style={{ animationDelay: `${i * 40}ms` }}
                                                >
                                                    <span className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-mono font-bold flex-shrink-0 mt-0.5">
                                                        {i + 1}
                                                    </span>
                                                    <div className="flex-grow min-w-0">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <h3 className="font-bold text-white text-sm">{item.mealName}</h3>
                                                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                                                {item.mealType || 'Dinner'}
                                                            </span>
                                                            {matchedRecipe ? (
                                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/20 text-green-300 border border-green-500/30">
                                                                    <i className="fas fa-book-open mr-1"></i>Recipe Book
                                                                </span>
                                                            ) : (
                                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-700 text-gray-300">
                                                                    Custom Idea
                                                                </span>
                                                            )}
                                                        </div>
                                                        {item.reason && (
                                                            <p className="text-xs text-gray-400 mt-1">{item.reason}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </>
                                ) : (
                                    (generatedPlan as GeneratedDay[]).map((dayPlan: GeneratedDay, i: number) => {
                                        const dateObj = new Date(dayPlan.date + 'T00:00:00');
                                        const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                                        const daySlots = getActiveSlotsForDate(dayPlan.date, scheduleMatrix);
                                        const slotsToRender = daySlots.length > 0
                                            ? daySlots
                                            : ALL_MEAL_SLOTS.filter(s => Boolean(dayPlan.meals?.[s]));

                                        return (
                                            <div key={dayPlan.date} className="bg-gray-800/50 p-4 rounded-xl border border-gray-700 animate-slide-up" style={{ animationDelay: `${i * 50}ms` }}>
                                                <div className="flex justify-between items-baseline mb-3">
                                                    <h3 className="font-bold text-blue-300 flex items-center">
                                                        <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center mr-2 text-xs font-mono">{i + 1}</span>
                                                        {dayPlan.dayOfWeek}
                                                    </h3>
                                                    <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">{formattedDate}</span>
                                                </div>

                                                {slotsToRender.length === 0 ? (
                                                    <p className="text-xs text-gray-500 italic">No meals scheduled for this day</p>
                                                ) : (
                                                    <div className="space-y-3">
                                                        {slotsToRender.map((slot: string) => {
                                                            const mealName = dayPlan.meals?.[slot as keyof typeof dayPlan.meals] || '';

                                                            return (
                                                                <div key={slot} className="grid grid-cols-12 gap-2 items-center text-sm group">
                                                                    <span className="col-span-3 text-gray-500 dark:text-gray-400 font-medium text-xs uppercase group-hover:text-gray-300 transition-colors">{slot}</span>
                                                                    <div className="col-span-9 bg-gray-900 border border-gray-700 text-gray-300 text-sm rounded-lg block w-full p-2">
                                                                        {mealName || <span className="text-gray-600 dark:text-gray-300 italic">-- Skip --</span>}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                            <button
                                onClick={savePlan}
                                className="w-full bg-green-500 text-white py-4 rounded-xl font-bold hover:bg-green-400 transition-all shadow-lg hover:shadow-green-500/20 active:scale-95 sticky bottom-0 mt-4"
                            >
                                <i className="fas fa-check-circle mr-2"></i>
                                {generatedMode === 'list' ? 'Save to Weekly Meal List' : 'Confirm & Save Plan'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AiArchitect;
