
import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { Recipe, PantryItem, MealPlan, UserProfile } from '../types';
import { useKitchen } from '../context/KitchenContext';
import { useUser } from '../context/UserContext';
import { generateRecipeFromIngredients } from '../services/geminiService';
import Spinner from '../components/Spinner';
import confetti from 'canvas-confetti';
import { convertQuantity } from '../utils/unitConversion';

const StatCard: React.FC<{ icon: string; title: string; value: string | number; color: string; delay: string; to: string; state?: any }> = ({ icon, title, value, color, delay, to, state }) => (
    <Link to={to} state={state} className={`bg-white p-4 rounded-xl shadow-lg border-b-4 border-gray-100 flex items-center transform transition-all duration-300 hover:-translate-y-1 hover:shadow-xl animate-slide-up ${delay} block`}>
        <div className={`w-14 h-14 rounded-full flex items-center justify-center ${color} shadow-inner`}>
            <i className={`fas ${icon} text-white text-2xl`}></i>
        </div>
        <div className="ml-4">
            <p className="text-gray-500 text-sm font-medium uppercase tracking-wide">{title}</p>
            <p className="text-3xl font-extrabold text-gray-800">{value}</p>
        </div>
    </Link>
);

const FOOD_FACTS = [
    "Honey never spoils. Archaeologists have found pots of honey in ancient Egyptian tombs that are over 3,000 years old and still perfectly edible.",
    "Peanuts aren't nuts, they're legumes.",
    "White chocolate isn't actually chocolate; it's just cocoa butter, sugar, and milk.",
    "Strawberries aren't berries, but bananas, pumpkins, and watermelons are.",
    "Apples float in water because they are 25% air.",
    "A chef's hat has 100 pleats to represent 100 ways to cook an egg.",
    "Ripe cranberries will bounce like rubber balls.",
];


const Dashboard: React.FC = () => {
    const { recipes, pantry, mealPlan, setPantry, setMealPlan } = useKitchen();
    const { userProfile, consumeCredits, getAccessToken } = useUser();

    const [aiIngredients, setAiIngredients] = useState('');
    const [generatedRecipe, setGeneratedRecipe] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [funFact, setFunFact] = useState('');

    useEffect(() => {
        setFunFact(FOOD_FACTS[Math.floor(Math.random() * FOOD_FACTS.length)]);
    }, []);

    const kitchenStats = useMemo(() => {
        const pantryItemNames = new Set(pantry.map(item => item.name.toLowerCase()));
        const recipesCanMake = recipes.filter(recipe =>
            recipe.ingredients.every(ing => pantryItemNames.has(ing.name.toLowerCase()))
        ).length;

        return {
            totalRecipes: recipes.length,
            pantryItems: pantry.length,
            favoriteRecipes: recipes.filter(r => r.is_favorite).length,
            recipesCanMake: recipesCanMake
        };
    }, [recipes, pantry]);

    // Enhanced Gamification Logic
    const xpStats = useMemo(() => {
        // Simple XP Formula
        const xp = (kitchenStats.totalRecipes * 20) + (kitchenStats.pantryItems * 5) + (kitchenStats.favoriteRecipes * 15);

        const levels = [
            { name: 'Kitchen Novice', min: 0, icon: 'fa-seedling', color: 'text-green-500' },
            { name: 'Line Cook', min: 250, icon: 'fa-fire', color: 'text-orange-500' },
            { name: 'Sous Chef', min: 600, icon: 'fa-medal', color: 'text-blue-500' },
            { name: 'Head Chef', min: 1200, icon: 'fa-star', color: 'text-purple-500' },
            { name: 'Culinary Master', min: 2000, icon: 'fa-trophy', color: 'text-yellow-500' }
        ];

        let currentLevel = levels[0];
        let nextLevel = levels[1];

        for (let i = 0; i < levels.length; i++) {
            if (xp >= levels[i].min) {
                currentLevel = levels[i];
                nextLevel = levels[i + 1] || { ...levels[i], min: levels[i].min * 2 }; // Cap fallback
            }
        }

        const progress = Math.min(100, Math.max(0, ((xp - currentLevel.min) / (nextLevel.min - currentLevel.min)) * 100));

        return { xp, currentLevel, nextLevel, progress };
    }, [kitchenStats]);

    const handleGenerateRecipe = async () => {
        if (!aiIngredients.trim()) {
            setError("Please enter some ingredients.");
            return;
        }

        if (!consumeCredits(1)) return;

        setIsLoading(true);
        setError(null);
        setGeneratedRecipe(null);
        try {
            const token = await getAccessToken();
            const result = await generateRecipeFromIngredients(aiIngredients, token);
            if (result) {
                const displayText = `**${result.name}**\n\n**Ingredients:**\n${result.ingredients?.map(ing => `- ${ing.quantity} ${ing.unit} ${ing.name}`).join('\n')}\n\n**Instructions:**\n${result.instructions}`;
                setGeneratedRecipe(displayText);
            } else {
                setError("Failed to generate a recipe. The AI might be busy. Please try again.");
            }
        } catch (e) {
            setError("An unexpected error occurred.");
        } finally {
            setIsLoading(false);
        }
    };

    // Get tonight's dinner
    const today = new Date().toISOString().split('T')[0];
    const todaysDinnerSlot = mealPlan[today]?.['Dinner']?.[0];
    const todaysDinnerRecipe = todaysDinnerSlot?.recipeId ? recipes.find(r => r.id === todaysDinnerSlot.recipeId) : null;
    const isDinnerCooked = todaysDinnerSlot?.completed || false;

    const handleMarkAsCooked = () => {
        if (!todaysDinnerRecipe) return;

        // Trigger Confetti based on preferences
        if (userProfile.preferences?.enableConfetti !== false) {
            const intensity = userProfile.preferences?.confettiIntensity || 'medium';
            const count = intensity === 'low' ? 50 : intensity === 'high' ? 300 : 150;

            confetti({
                particleCount: count,
                spread: 70,
                origin: { y: 0.6 },
                colors: ['#22c55e', '#3b82f6', '#eab308'] // Green, Blue, Yellow
            });
        }

        // 1. Update Meal Plan
        setMealPlan(prev => {
            const newPlan = JSON.parse(JSON.stringify(prev));
            if (newPlan[today] && newPlan[today]['Dinner'] && newPlan[today]['Dinner'].length > 0) {
                newPlan[today]['Dinner'][0].completed = true;
            }
            return newPlan;
        });

        // 2. Update Pantry (Deduct Ingredients)
        setPantry(prevPantry => {
            const newPantry = prevPantry.map(item => ({ ...item }));

            todaysDinnerRecipe.ingredients.forEach(ing => {
                const pantryItemIndex = newPantry.findIndex(
                    p => p.name.toLowerCase() === ing.name.toLowerCase()
                );

                if (pantryItemIndex > -1) {
                    const pantryItem = newPantry[pantryItemIndex];
                    const conversionResult = convertQuantity(ing.quantity, ing.unit, pantryItem.unit);

                    if (conversionResult !== null) {
                        const currentQty = pantryItem.quantity;
                        pantryItem.quantity = Math.max(0, currentQty - conversionResult);
                    } else {
                        console.warn(`Unit mismatch for ${ing.name} in Dashboard deduction.`);
                    }
                }
            });
            return newPantry;
        });
    };

    // Calculate Kitchen Health (Recipes capable of making / Total Recipes)
    const kitchenHealth = kitchenStats.totalRecipes > 0
        ? Math.round((kitchenStats.recipesCanMake / kitchenStats.totalRecipes) * 100)
        : 0;

    const healthColor = kitchenHealth > 50 ? 'text-green-500' : kitchenHealth > 20 ? 'text-yellow-500' : 'text-red-500';
    const healthStroke = kitchenHealth > 50 ? '#22c55e' : kitchenHealth > 20 ? '#eab308' : '#ef4444';

    return (
        <div className="space-y-8 max-w-7xl mx-auto">
            {/* Header & User Level */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 animate-fade-in">
                <div className="flex items-center gap-6">
                    {userProfile.avatar && (
                        <div className="relative group">
                            <div className="text-6xl animate-float cursor-default select-none filter drop-shadow-lg transition-transform hover:scale-110">
                                {userProfile.avatar}
                            </div>
                            <div className="absolute -bottom-2 -right-2 bg-white rounded-full p-1 shadow-md">
                                <i className={`fas ${xpStats.currentLevel.icon} ${xpStats.currentLevel.color} text-sm`}></i>
                            </div>
                        </div>
                    )}
                    <div>
                        <h1 className="text-4xl font-extrabold text-gray-800 tracking-tight">
                            {userProfile.kitchenName || `Welcome, ${userProfile.name}!`}
                        </h1>
                        <div className="flex items-center mt-2 gap-2">
                            <div className="bg-white px-3 py-1 rounded-full shadow-sm border border-gray-100 flex items-center gap-2">
                                <i className={`fas ${xpStats.currentLevel.icon} ${xpStats.currentLevel.color}`}></i>
                                <span className="font-bold text-gray-700 text-sm">{xpStats.currentLevel.name}</span>
                            </div>
                            <span className="text-xs text-gray-400 font-mono">{xpStats.xp} XP</span>
                            <Link to="/subscription" className="ml-2 text-xs bg-yellow-400 text-black px-2 py-0.5 rounded font-bold hover:bg-yellow-300 shadow-sm">
                                {userProfile.subscriptionTier === 'pro' ? 'PRO' : userProfile.subscriptionTier === 'starter' ? 'STARTER' : 'FREE'}
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Level Progress Bar */}
                <div className="w-full md:w-1/3 bg-white p-4 rounded-xl shadow-md border border-gray-100 relative overflow-hidden group">
                    <div className="flex justify-between text-xs font-semibold text-gray-500 mb-1">
                        <span>Current Level</span>
                        <span>Next: {xpStats.nextLevel.name}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                        <div
                            className="bg-gradient-to-r from-blue-500 to-purple-500 h-3 rounded-full transition-all duration-1000 ease-out relative"
                            style={{ width: `${xpStats.progress}%` }}
                        >
                            <div className="absolute inset-0 bg-white opacity-20 animate-pulse"></div>
                        </div>
                    </div>
                    <p className="text-xs text-center mt-1 text-gray-400">
                        {Math.floor(xpStats.nextLevel.min - xpStats.xp)} XP to level up
                    </p>
                </div>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard icon="fa-book-open" title="Total Recipes" value={kitchenStats.totalRecipes} color="bg-blue-500" delay="delay-100" to="/recipes" />
                <StatCard icon="fa-box-open" title="Pantry Items" value={kitchenStats.pantryItems} color="bg-green-500" delay="delay-200" to="/pantry" />
                <StatCard icon="fa-heart" title="Favorites" value={kitchenStats.favoriteRecipes} color="bg-red-500" delay="delay-300" to="/recipes" state={{ filter: 'favorites' }} />
                <Link to="/recipes" state={{ filter: 'canMake' }} className="bg-white p-4 rounded-xl shadow-lg border-b-4 border-gray-100 flex items-center justify-between transform transition-all duration-300 hover:-translate-y-1 hover:shadow-xl animate-slide-up delay-400 block">
                    <div>
                        <p className="text-gray-500 text-sm font-medium uppercase tracking-wide">Kitchen Health</p>
                        <p className={`text-3xl font-extrabold ${healthColor}`}>{kitchenHealth}%</p>
                        <p className="text-xs text-gray-400">Cookable Now</p>
                    </div>
                    <div className="relative w-16 h-16">
                        <svg className="w-full h-full transform -rotate-90">
                            <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-gray-200" />
                            <circle
                                cx="32" cy="32" r="28"
                                stroke={healthStroke}
                                strokeWidth="4"
                                fill="transparent"
                                strokeDasharray={175.9}
                                strokeDashoffset={175.9 - (175.9 * kitchenHealth) / 100}
                                className="transition-all duration-1000 ease-out"
                            />
                        </svg>
                        <i className={`fas fa-utensils absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 ${healthColor} text-sm`}></i>
                    </div>
                </Link>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Content Area */}
                <div className="lg:col-span-2 space-y-8">
                    {/* Dinner Card */}
                    <div className="bg-white p-6 rounded-2xl shadow-lg animate-slide-up delay-200 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10">
                            <i className="fas fa-utensils text-9xl"></i>
                        </div>
                        <h2 className="text-2xl font-bold mb-6 flex items-center relative z-10">
                            <span className="bg-blue-100 text-blue-600 w-10 h-10 rounded-full flex items-center justify-center mr-3">
                                <i className="fas fa-calendar-check text-lg"></i>
                            </span>
                            Dinner Tonight
                        </h2>

                        {todaysDinnerRecipe ? (
                            <div className="relative z-10 bg-gray-50 rounded-xl p-6 border border-gray-100 transition-transform hover:scale-[1.01]">
                                <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                                    <div className="flex-1">
                                        <h3 className={`text-3xl font-bold mb-2 ${isDinnerCooked ? 'text-green-600 line-through decoration-4 decoration-green-500/30' : 'text-gray-800'}`}>
                                            {todaysDinnerRecipe.name}
                                        </h3>
                                        <div className="flex flex-wrap gap-2 mb-4">
                                            {todaysDinnerRecipe.tags?.map(tag => (
                                                <span key={tag} className="text-xs bg-white border border-gray-200 px-3 py-1 rounded-full text-gray-600 font-medium shadow-sm">
                                                    {tag}
                                                </span>
                                            ))}
                                            <span className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded-full font-medium flex items-center">
                                                <i className="fas fa-clock mr-1"></i> {todaysDinnerRecipe.cook_time}
                                            </span>
                                        </div>
                                        <p className="text-gray-600 leading-relaxed line-clamp-3 bg-white p-3 rounded-lg border border-gray-100 italic">
                                            "{todaysDinnerRecipe.instructions}"
                                        </p>
                                    </div>
                                    <div className="flex flex-col gap-3 min-w-[140px]">
                                        {!isDinnerCooked ? (
                                            <>
                                                <Link
                                                    to={`/recipes/${todaysDinnerRecipe.id}/cook`}
                                                    className="bg-blue-600 text-white px-5 py-3 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-md hover:shadow-lg flex items-center justify-center group"
                                                >
                                                    <i className="fas fa-play mr-2 group-hover:scale-110 transition-transform"></i> Start Cooking
                                                </Link>
                                                <button
                                                    onClick={handleMarkAsCooked}
                                                    className="bg-green-100 text-green-700 border border-green-200 px-5 py-3 rounded-xl font-bold hover:bg-green-200 transition-colors flex items-center justify-center"
                                                >
                                                    <i className="fas fa-check mr-2"></i> Mark Done
                                                </button>
                                            </>
                                        ) : (
                                            <div className="text-center p-4 bg-green-50 rounded-xl border border-green-100">
                                                <div className="inline-block p-3 bg-green-100 rounded-full mb-2">
                                                    <i className="fas fa-check text-2xl text-green-600"></i>
                                                </div>
                                                <p className="font-bold text-green-700">Bon Appétit!</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                                <div className="text-gray-400 text-6xl mb-4"><i className="fas fa-plate-wheat"></i></div>
                                <p className="text-gray-500 font-medium mb-4">Your plate is empty for tonight!</p>
                                <Link to="/planner" className="inline-block bg-blue-500 text-white px-8 py-3 rounded-full font-bold hover:bg-blue-600 transition-transform hover:scale-105 shadow-md">
                                    <i className="fas fa-calendar-plus mr-2"></i> Plan a Meal
                                </Link>
                            </div>
                        )}
                    </div>

                    {/* Fun Fact Card */}
                    <div className="bg-gradient-to-r from-orange-100 to-amber-100 p-6 rounded-2xl shadow-md border border-orange-200 animate-slide-up delay-300 flex items-start gap-4">
                        <div className="bg-white p-3 rounded-full shadow-sm text-orange-500 text-xl flex-shrink-0">
                            <i className="fas fa-lightbulb"></i>
                        </div>
                        <div>
                            <h3 className="font-bold text-orange-800 mb-1">Did You Know?</h3>
                            <p className="text-orange-900 text-sm leading-relaxed">{funFact}</p>
                        </div>
                    </div>
                </div>

                {/* Sidebar Column */}
                <div className="space-y-8 animate-slide-up delay-300">
                    {/* AI Generator */}
                    <div className="bg-white p-6 rounded-2xl shadow-lg border-t-4 border-purple-500 flex flex-col h-full relative overflow-hidden">
                        <div className="absolute -right-6 -top-6 text-purple-100 opacity-50 transform rotate-12">
                            <i className="fas fa-magic text-9xl"></i>
                        </div>

                        <div className="flex justify-between items-center mb-4 relative z-10">
                            <h2 className="text-xl font-bold flex items-center">
                                <i className="fas fa-wand-magic-sparkles mr-2 text-purple-500"></i>Culinary Alchemist
                            </h2>
                            <span className="text-[10px] bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full font-bold border border-yellow-200">
                                <i className="fas fa-bolt mr-1"></i>1 Credit
                            </span>
                        </div>

                        <p className="text-sm text-gray-500 mb-4 relative z-10">Have random ingredients? Let the AI invent a unique recipe just for you.</p>

                        <textarea
                            className="form-input w-full p-4 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-shadow resize-none mb-4 flex-grow relative z-10"
                            placeholder="e.g., chicken breast, 1 onion, soy sauce, half a lemon..."
                            rows={4}
                            value={aiIngredients}
                            onChange={(e) => setAiIngredients(e.target.value)}
                        ></textarea>

                        <button
                            onClick={handleGenerateRecipe}
                            disabled={isLoading}
                            className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:shadow-lg hover:from-purple-700 hover:to-indigo-700 transition-all disabled:opacity-70 relative z-10 flex items-center justify-center group"
                        >
                            {isLoading ? <Spinner size="sm" /> : <>
                                <i className="fas fa-bolt mr-2 group-hover:animate-pulse"></i> Generate Recipe
                            </>}
                        </button>

                        {error && <p className="text-red-500 text-sm mt-3 animate-fade-in relative z-10"><i className="fas fa-exclamation-circle mr-1"></i> {error}</p>}
                    </div>

                    {generatedRecipe && (
                        <div className="bg-purple-50 p-6 rounded-2xl border border-purple-100 shadow-md animate-scale-in max-h-96 overflow-y-auto">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-xs font-bold text-purple-500 uppercase">AI Generated Result</span>
                                <button onClick={() => setGeneratedRecipe(null)} className="text-purple-400 hover:text-purple-600"><i className="fas fa-times"></i></button>
                            </div>
                            <div className="prose prose-sm prose-purple text-gray-700">
                                <pre className="whitespace-pre-wrap font-sans text-sm bg-transparent border-0 p-0">{generatedRecipe}</pre>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
