
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Recipe, MealPlan } from '../types';
import { generateMealPlan } from '../services/geminiService';
import Spinner from '../components/Spinner';

interface AiArchitectProps {
    recipes: Recipe[];
    setMealPlan: React.Dispatch<React.SetStateAction<MealPlan>>;
}

const AiArchitect: React.FC<AiArchitectProps> = ({ recipes, setMealPlan }) => {
    const [theme, setTheme] = useState('A Balanced and Varied Plan');
    const [usePantry, setUsePantry] = useState(false);
    const [useFavorites, setUseFavorites] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [generatedPlan, setGeneratedPlan] = useState<any | null>(null);
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        setGeneratedPlan(null);
        try {
            const plan = await generateMealPlan(recipes, theme, usePantry, useFavorites);
            if (plan) {
                setGeneratedPlan(plan);
            } else {
                setError("The AI failed to generate a meal plan. Please try again.");
            }
        } catch (e) {
            setError("An unexpected error occurred.");
        } finally {
            setIsLoading(false);
        }
    };
    
    const applyPlan = () => {
        if (!generatedPlan) return;
        
        const getStartOfWeek = (date: Date) => {
            const d = new Date(date);
            const day = d.getDay();
            const diff = d.getDate() - day + (day === 0 ? -6 : 1);
            return new Date(d.setDate(diff));
        };
        const weekStartDate = getStartOfWeek(new Date());

        const newMealPlan: MealPlan = {};
        const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

        daysOfWeek.forEach((dayName, index) => {
            const date = new Date(weekStartDate);
            date.setDate(date.getDate() + index);
            const dateStr = date.toISOString().split('T')[0];
            
            const dayData = generatedPlan[dayName];
            if (dayData) {
                newMealPlan[dateStr] = {
                    Breakfast: [],
                    Lunch: [],
                    Dinner: [],
                    Snack: []
                };

                Object.keys(dayData).forEach(slot => {
                    const recipeName = dayData[slot];
                    const recipe = recipes.find(r => r.name === recipeName);
                    if (recipe) {
                        newMealPlan[dateStr][slot].push({ recipeId: recipe.id });
                    }
                });
            }
        });
        
        setMealPlan(newMealPlan);
        navigate('/planner');
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="text-center">
                <h1 className="text-3xl font-bold text-gray-800 flex items-center justify-center">
                    <i className="fas fa-magic mr-3 text-blue-500"></i>AI Meal Plan Architect
                </h1>
                <p className="text-gray-600 mt-2">Choose your directives and let the AI build a plan for you!</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Controls */}
                <div className="bg-white p-6 rounded-lg shadow-md">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label htmlFor="plan-theme" className="block text-sm font-medium text-gray-700 mb-1">1. Choose a Theme:</label>
                            <select id="plan-theme" value={theme} onChange={e => setTheme(e.target.value)} className="w-full form-select p-2 border border-gray-300 rounded-md">
                                <option>A Balanced and Varied Plan</option>
                                <option>Quick & Easy Dinners (under 30 mins)</option>
                                <option>Hearty Comfort Food Classics</option>
                                <option>Healthy & Light Options</option>
                                <option>Vegetarian Delight</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">2. Other Directives:</label>
                            <div className="space-y-2">
                                <div className="flex items-center">
                                    <input id="use-pantry" type="checkbox" checked={usePantry} onChange={e => setUsePantry(e.target.checked)} className="h-4 w-4 text-blue-600 border-gray-300 rounded" />
                                    <label htmlFor="use-pantry" className="ml-2 block text-sm text-gray-900">Use pantry items first</label>
                                </div>
                                <div className="flex items-center">
                                    <input id="focus-favorites" type="checkbox" checked={useFavorites} onChange={e => setUseFavorites(e.target.checked)} className="h-4 w-4 text-blue-600 border-gray-300 rounded" />
                                    <label htmlFor="focus-favorites" className="ml-2 block text-sm text-gray-900">Focus on favorite recipes</label>
                                </div>
                            </div>
                        </div>
                        <button type="submit" disabled={isLoading} className="w-full bg-blue-500 text-white py-3 rounded-md font-semibold hover:bg-blue-600 transition-colors disabled:bg-blue-300 flex justify-center items-center">
                            {isLoading ? <Spinner /> : 'Build My Plan'}
                        </button>
                        {error && <p className="text-red-500 text-sm">{error}</p>}
                    </form>
                </div>
                {/* Results */}
                <div className="bg-white p-6 rounded-lg shadow-md">
                    <h2 className="text-xl font-bold mb-4">Generated Plan</h2>
                    {isLoading && <div className="flex justify-center items-center h-full"><Spinner size="lg" /></div>}
                    {!isLoading && !generatedPlan && <div className="text-center text-gray-500 h-full flex items-center justify-center"><p>Your AI-generated plan will appear here.</p></div>}
                    {generatedPlan && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-3 gap-2 text-center font-bold text-sm text-gray-500">
                                <div>Breakfast</div>
                                <div>Lunch</div>
                                <div>Dinner</div>
                            </div>
                            {Object.entries(generatedPlan).map(([day, meals]) => (
                                <div key={day}>
                                    <h3 className="font-bold text-md mb-1">{day as string}</h3>
                                    <div className="grid grid-cols-3 gap-2 text-sm">
                                        {(Object.values(meals as object)).map((meal: string, i) => (
                                           <div key={i} className="bg-gray-100 p-2 rounded-md">{meal}</div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            <button onClick={applyPlan} className="w-full mt-4 bg-green-500 text-white py-3 rounded-md font-semibold hover:bg-green-600 transition-colors">
                                Apply This Plan
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AiArchitect;
