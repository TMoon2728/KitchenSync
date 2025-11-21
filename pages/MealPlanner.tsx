
import React, { useState } from 'react';
import type { Recipe, MealPlan } from '../types';

interface MealPlannerProps {
    recipes: Recipe[];
    mealPlan: MealPlan;
    setMealPlan: React.Dispatch<React.SetStateAction<MealPlan>>;
}

// Helper to get the start of the current week (Monday)
const getStartOfWeek = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    return new Date(d.setDate(diff));
};

const MealPlanner: React.FC<MealPlannerProps> = ({ recipes, mealPlan, setMealPlan }) => {
    const [weekStartDate, setWeekStartDate] = useState(getStartOfWeek(new Date()));

    const handleRecipeDrop = (date: string, slot: string, recipeId: number) => {
        setMealPlan(prev => {
            const newPlan = { ...prev };
            if (!newPlan[date]) {
                newPlan[date] = { Breakfast: [], Lunch: [], Dinner: [], Snack: [] };
            }
            if (!newPlan[date][slot]) {
                newPlan[date][slot] = [];
            }
            
            // Avoid duplicates
            if (newPlan[date][slot].some(item => item.recipeId === recipeId)) {
                return prev;
            }

            newPlan[date][slot].push({ recipeId });
            return newPlan;
        });
    };
    
    const removeRecipeFromPlan = (date: string, slot: string, recipeId: number) => {
        setMealPlan(prev => {
            const newPlan = { ...prev };
            if (newPlan[date] && newPlan[date][slot]) {
                newPlan[date][slot] = newPlan[date][slot].filter(item => item.recipeId !== recipeId);
            }
            return newPlan;
        });
    };

    const days = Array.from({ length: 7 }).map((_, i) => {
        const date = new Date(weekStartDate);
        date.setDate(date.getDate() + i);
        return date;
    });

    const changeWeek = (direction: 'prev' | 'next' | 'today') => {
        if (direction === 'today') {
            setWeekStartDate(getStartOfWeek(new Date()));
            return;
        }
        const newDate = new Date(weekStartDate);
        newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
        setWeekStartDate(newDate);
    };

    const formatDate = (date: Date) => date.toISOString().split('T')[0];

    return (
        <div className="flex h-full gap-6">
            {/* Recipe Tray */}
            <div className="w-1/4 bg-white p-4 rounded-lg shadow-md flex flex-col">
                <h2 className="text-xl font-bold mb-4">Recipe Tray</h2>
                <div className="overflow-y-auto space-y-2">
                    {recipes.map(recipe => (
                        <div
                            key={recipe.id}
                            draggable
                            onDragStart={(e) => {
                                e.dataTransfer.setData("recipeId", recipe.id.toString());
                            }}
                            className="p-2 bg-gray-100 rounded-md cursor-grab active:cursor-grabbing border border-gray-200"
                        >
                            <p className="font-semibold text-sm">{recipe.name}</p>
                            <p className="text-xs text-gray-500">{recipe.meal_type}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Calendar */}
            <div className="w-3/4 flex-grow flex flex-col">
                <div className="flex justify-between items-center mb-4 bg-white p-3 rounded-lg shadow-md">
                    <h1 className="text-2xl font-bold">Meal Plan</h1>
                    <div className="flex items-center gap-2">
                        <button onClick={() => changeWeek('prev')} className="px-3 py-1 bg-gray-200 rounded-md hover:bg-gray-300">&laquo;</button>
                        <button onClick={() => changeWeek('today')} className="px-3 py-1 bg-gray-200 rounded-md hover:bg-gray-300">Today</button>
                        <button onClick={() => changeWeek('next')} className="px-3 py-1 bg-gray-200 rounded-md hover:bg-gray-300">&raquo;</button>
                    </div>
                </div>
                <div className="grid grid-cols-7 gap-2 flex-grow">
                    {days.map(day => {
                        const dateStr = formatDate(day);
                        const dayPlan = mealPlan[dateStr] || { Breakfast: [], Lunch: [], Dinner: [], Snack: [] };
                        return (
                            <div key={dateStr} className="bg-white rounded-lg shadow-md flex flex-col p-2 space-y-2">
                                <h3 className="font-bold text-center">{day.toLocaleDateString('en-US', { weekday: 'short' })}</h3>
                                <p className="text-xs text-gray-500 text-center -mt-2 mb-1">{day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                                {['Breakfast', 'Lunch', 'Dinner', 'Snack'].map(slot => (
                                    <div
                                        key={slot}
                                        onDragOver={(e) => e.preventDefault()}
                                        onDrop={(e) => {
                                            const recipeId = Number(e.dataTransfer.getData("recipeId"));
                                            handleRecipeDrop(dateStr, slot, recipeId);
                                        }}
                                        className="bg-gray-50 p-2 rounded-md flex-grow min-h-[80px]"
                                    >
                                        <h4 className="font-semibold text-xs text-gray-600 mb-1">{slot}</h4>
                                        <div className="space-y-1">
                                            {dayPlan[slot]?.map(item => {
                                                const recipe = recipes.find(r => r.id === item.recipeId);
                                                return recipe ? (
                                                    <div key={item.recipeId} className="relative text-xs bg-blue-100 text-blue-800 p-1 rounded-md">
                                                        {recipe.name}
                                                         <button onClick={() => removeRecipeFromPlan(dateStr, slot, item.recipeId)} className="absolute top-0 right-0.5 text-blue-800 hover:text-red-500 text-xs">&times;</button>
                                                    </div>
                                                ) : null;
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
    );
};

export default MealPlanner;
