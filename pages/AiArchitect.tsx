
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Recipe, MealPlan } from '../types';
import { useKitchen } from '../context/KitchenContext';
import { useUser } from '../context/UserContext';
import { generateMealPlan } from '../services/geminiService';
import Spinner from '../components/Spinner';

const AiArchitect: React.FC = () => {
    const { recipes, setMealPlan } = useKitchen();
    const { userProfile, consumeCredits, getAccessToken } = useUser();
    // Core Directives
    const [theme, setTheme] = useState('A Balanced and Varied Plan');
    const [usePantry, setUsePantry] = useState(false);
    const [useFavorites, setUseFavorites] = useState(true);
    const [useHighestRated, setUseHighestRated] = useState(false);
    const [caloriesPerDay, setCaloriesPerDay] = useState(userProfile.dailyCalorieGoal || 2000);
    const [complexity, setComplexity] = useState('Moderate');
    const [customDiet, setCustomDiet] = useState('');

    // Timeframe & Structure
    const [startDate, setStartDate] = useState(() => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow.toISOString().split('T')[0];
    });
    const [duration, setDuration] = useState(7);
    const [includedSlots, setIncludedSlots] = useState<Set<string>>(new Set(['Breakfast', 'Lunch', 'Dinner']));

    const [isLoading, setIsLoading] = useState(false);

    interface GeneratedDay {
        date: string;
        dayOfWeek: string;
        meals: {
            Breakfast?: string;
            Lunch?: string;
            Dinner?: string;
            Snack?: string;
        }
    }
    const [error, setError] = useState<string | null>(null);
    const [generatedPlan, setGeneratedPlan] = useState<GeneratedDay[] | null>(null);
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (includedSlots.size === 0) {
            setError("Please select at least one meal type (e.g. Dinner).");
            return;
        }

        // Cost is 3 credits for a full plan
        // Deduct 2 here (optimistic + sync) + 1 on backend = 3 Total
        if (!consumeCredits(2)) return;

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
                Array.from(includedSlots),
                token,
                complexity,
                customDiet
            );

            if (plan && Array.isArray(plan)) {
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

    const handlePlanChange = (date: string, slot: string, recipeName: string) => {
        setGeneratedPlan(prev => {
            if (!prev) return null;
            return prev.map(day => {
                if (day.date === date) {
                    return {
                        ...day,
                        meals: {
                            ...day.meals,
                            [slot]: recipeName
                        }
                    };
                }
                return day;
            });
        });
    };

    const savePlan = () => {
        if (!generatedPlan) return;

        const newMealPlan: MealPlan = {};

        generatedPlan.forEach((dayPlan: GeneratedDay) => {
            const dateStr = dayPlan.date as string;

            if (!newMealPlan[dateStr]) {
                newMealPlan[dateStr] = { Breakfast: [], Lunch: [], Dinner: [], Snack: [] };
            }

            Object.entries(dayPlan.meals).forEach(([slot, recipeName]) => {
                if (!recipeName) return;

                const nameStr = recipeName as string;

                const recipe = recipes.find(r => r.name === nameStr);
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

        navigate('/planner');
    };

    const toggleSlot = (slot: string) => {
        setIncludedSlots(prev => {
            const next = new Set(prev);
            if (next.has(slot)) next.delete(slot);
            else next.add(slot);
            return next;
        });
    };

    const sortedRecipes = useMemo(() => [...recipes].sort((a, b) => a.name.localeCompare(b.name)), [recipes]);

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-12">
            <div className="text-center py-8">
                <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-3xl mx-auto flex items-center justify-center mb-6 shadow-lg shadow-blue-500/30 rotate-3 hover:rotate-6 transition-transform">
                    <i className="fas fa-robot text-4xl text-white"></i>
                </div>
                <h1 className="text-4xl font-extrabold text-gray-800 tracking-tight mb-2">
                    AI Meal Architect
                </h1>
                <p className="text-gray-500 text-lg max-w-xl mx-auto">Configure your preferences and let our advanced AI construct the perfect menu for you.</p>
                <div className="mt-4 inline-block bg-yellow-100 text-yellow-800 px-4 py-1 rounded-full text-sm font-bold border border-yellow-200">
                    <i className="fas fa-bolt mr-2"></i> Cost: 3 Credits per Plan
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Controls */}
                <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-32 bg-blue-50 rounded-full opacity-50 blur-3xl -mr-16 -mt-16"></div>

                    <form onSubmit={handleSubmit} className="space-y-8 relative z-10">
                        {/* Section 1: Timeframe */}
                        <div className="space-y-4">
                            <label className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center">
                                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mr-2 text-xs">1</span>
                                Mission Parameters
                            </label>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="startDate" className="block text-sm font-bold text-gray-700 mb-2">Start Date</label>
                                    <input
                                        type="date"
                                        id="startDate"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        className="w-full form-input p-3 border border-gray-200 rounded-xl bg-gray-50 focus:ring-2 focus:ring-blue-500 text-gray-800"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="duration" className="block text-sm font-bold text-gray-700 mb-2">Duration</label>
                                    <select
                                        id="duration"
                                        value={duration}
                                        onChange={(e) => setDuration(parseInt(e.target.value))}
                                        className="w-full form-select p-3 border border-gray-200 rounded-xl bg-gray-50 focus:ring-2 focus:ring-blue-500 text-gray-800"
                                    >
                                        <option value={3}>3 Days</option>
                                        <option value={5}>5 Days</option>
                                        <option value={7}>1 Week</option>
                                        <option value={14}>2 Weeks</option>
                                        <option value={30}>1 Month</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Meals to Include</label>
                                <div className="flex gap-3 flex-wrap">
                                    {['Breakfast', 'Lunch', 'Dinner', 'Snack'].map(slot => (
                                        <button
                                            key={slot}
                                            type="button"
                                            onClick={() => toggleSlot(slot)}
                                            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all border ${includedSlots.has(slot) ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                                        >
                                            {slot}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Section 2: Preferences */}
                        <div className="space-y-4 pt-4 border-t border-gray-100">
                            <label className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center">
                                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mr-2 text-xs">2</span>
                                Core Directives
                            </label>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="plan-theme" className="block text-sm font-bold text-gray-700 mb-2">Theme Selection</label>
                                    <select id="plan-theme" value={theme} onChange={e => setTheme(e.target.value)} className="w-full form-select p-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 focus:ring-2 focus:ring-blue-500 cursor-pointer hover:bg-white">
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
                                    <label htmlFor="complexity" className="block text-sm font-bold text-gray-700 mb-2">Meal Complexity</label>
                                    <select
                                        id="complexity"
                                        value={complexity}
                                        onChange={(e) => setComplexity(e.target.value)}
                                        className="w-full form-select p-3 border border-gray-200 rounded-xl bg-gray-50 focus:ring-2 focus:ring-blue-500 text-gray-800"
                                    >
                                        <option value="Simple">Simple (Minimal Prep)</option>
                                        <option value="Moderate">Moderate (Standard)</option>
                                        <option value="Gourmet">Gourmet (Elaborate)</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label htmlFor="calories" className="block text-sm font-bold text-gray-700 mb-2">Daily Calorie Target</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        id="calories"
                                        value={caloriesPerDay}
                                        onChange={e => setCaloriesPerDay(parseInt(e.target.value))}
                                        className="w-full form-input p-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 font-mono font-bold focus:ring-2 focus:ring-blue-500"
                                        min="1000"
                                        max="5000"
                                        step="50"
                                    />
                                    <span className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm font-medium">kcal</span>
                                </div>
                            </div>

                            <div>
                                <label htmlFor="customDiet" className="block text-sm font-bold text-gray-700 mb-2">Dietary Specifics</label>
                                <input
                                    type="text"
                                    id="customDiet"
                                    value={customDiet}
                                    onChange={(e) => setCustomDiet(e.target.value)}
                                    placeholder="e.g. Keto, No Seafood, High Protein..."
                                    className="w-full form-input p-3 border border-gray-200 rounded-xl bg-gray-50 focus:ring-2 focus:ring-blue-500 text-gray-800"
                                />
                                <p className="text-xs text-gray-400 mt-1">Leave empty to use profile defaults.</p>
                            </div>
                        </div>

                        {/* Section 3: Optimization */}
                        <div className="space-y-4 pt-4 border-t border-gray-100">
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
                                        className={`flex items-center p-3 rounded-xl border-2 cursor-pointer transition-all ${opt.state ? 'border-blue-500 bg-blue-50' : 'border-gray-100 bg-white hover:border-blue-200'}`}
                                    >
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center mr-3 transition-colors ${opt.state ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                                            <i className={`fas ${opt.icon} text-sm`}></i>
                                        </div>
                                        <span className={`font-bold text-sm ${opt.state ? 'text-blue-800' : 'text-gray-600'}`}>{opt.label}</span>
                                        <div className={`ml-auto w-5 h-5 rounded-full border-2 flex items-center justify-center ${opt.state ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}>
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
                            {isLoading ? <Spinner /> : <><i className="fas fa-bolt mr-2 text-yellow-300"></i> Generate Plan (3 Credits)</>}
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
                            <p className="text-gray-400 mt-2 text-sm">Analyzing recipes for {duration} days starting {startDate}.</p>
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
                            <div className="space-y-4 flex-grow overflow-y-auto pr-2 custom-scrollbar max-h-[800px]">
                                {generatedPlan.map((dayPlan: GeneratedDay, i) => {
                                    // Format the date to be more readable
                                    const dateObj = new Date(dayPlan.date + 'T00:00:00'); // ensure local time treatment for simple dates
                                    const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

                                    return (
                                        <div key={dayPlan.date} className="bg-gray-800/50 p-4 rounded-xl border border-gray-700 animate-slide-up" style={{ animationDelay: `${i * 50}ms` }}>
                                            <div className="flex justify-between items-baseline mb-3">
                                                <h3 className="font-bold text-blue-300 flex items-center">
                                                    <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center mr-2 text-xs font-mono">{i + 1}</span>
                                                    {dayPlan.dayOfWeek}
                                                </h3>
                                                <span className="text-xs text-gray-500 font-mono">{formattedDate}</span>
                                            </div>

                                            <div className="space-y-3">
                                                {Array.from(includedSlots).map((slot: string) => {
                                                    const mealName = dayPlan.meals[slot as keyof typeof dayPlan.meals] || '';
                                                    const isCustom = mealName && !sortedRecipes.some(r => r.name === mealName);

                                                    return (
                                                        <div key={slot} className="grid grid-cols-12 gap-2 items-center text-sm group">
                                                            <span className="col-span-3 text-gray-500 font-medium text-xs uppercase group-hover:text-gray-300 transition-colors">{slot}</span>
                                                            <select
                                                                value={mealName}
                                                                onChange={e => handlePlanChange(dayPlan.date as string, slot, e.target.value)}
                                                                className="col-span-9 bg-gray-900 border border-gray-700 text-gray-300 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2"
                                                            >
                                                                <option value="">-- Skip --</option>
                                                                {isCustom && <option value={mealName}>{mealName}</option>}
                                                                {sortedRecipes.map(recipe => (
                                                                    <option key={recipe.id} value={recipe.name}>{recipe.name}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <button
                                onClick={savePlan}
                                className="w-full bg-green-500 text-white py-4 rounded-xl font-bold hover:bg-green-400 transition-all shadow-lg hover:shadow-green-500/20 active:scale-95 sticky bottom-0 mt-4"
                            >
                                <i className="fas fa-check-circle mr-2"></i> Confirm & Save Plan
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AiArchitect;
