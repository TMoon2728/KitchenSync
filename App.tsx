
import React, { useState } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { MOCK_RECIPES, MOCK_PANTRY, MOCK_MEAL_PLAN } from './mockData';
import type { Recipe, PantryItem, MealPlan } from './types';
import Dashboard from './pages/Dashboard';
import Recipes from './pages/Recipes';
import MealPlanner from './pages/MealPlanner';
import ShoppingList from './pages/ShoppingList';
import Pantry from './pages/Pantry';
import RecipeDetail from './pages/RecipeDetail';
import AiArchitect from './pages/AiArchitect';

const App: React.FC = () => {
    const [recipes, setRecipes] = useState<Recipe[]>(MOCK_RECIPES);
    const [pantry, setPantry] = useState<PantryItem[]>(MOCK_PANTRY);
    const [mealPlan, setMealPlan] = useState<MealPlan>(MOCK_MEAL_PLAN);
    const location = useLocation();

    const addRecipe = (newRecipe: Omit<Recipe, 'id' | 'is_favorite' | 'rating'>) => {
        setRecipes(prev => [...prev, {
            ...newRecipe,
            id: Date.now(),
            is_favorite: false,
            rating: 0
        }]);
    };
    
    const updateRecipe = (updatedRecipe: Recipe) => {
        setRecipes(prev => prev.map(r => r.id === updatedRecipe.id ? updatedRecipe : r));
    };

    const navItems = [
        { path: '/', name: 'Dashboard', icon: 'fa-tachometer-alt' },
        { path: '/recipes', name: 'Recipes', icon: 'fa-book-open' },
        { path: '/planner', name: 'Planner', icon: 'fa-calendar-alt' },
        { path: '/ai-architect', name: 'AI Architect', icon: 'fa-magic' },
        { path: '/pantry', name: 'Pantry', icon: 'fa-box-open' },
        { path: '/shopping-list', name: 'Shopping List', icon: 'fa-cart-shopping' },
    ];

    const NavItem: React.FC<{ path: string; name: string; icon: string }> = ({ path, name, icon }) => (
        <NavLink
            to={path}
            className={({ isActive }) =>
                `flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                isActive ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-blue-800 hover:text-white'
                }`
            }
        >
            <i className={`fas ${icon} w-6 text-center`}></i>
            <span className="ml-3">{name}</span>
        </NavLink>
    );

    return (
        <div className="flex h-screen bg-gray-900 text-white">
            <aside className="w-64 flex-shrink-0 bg-blue-900 overflow-y-auto">
                <div className="p-4">
                    <h1 className="text-2xl font-bold flex items-center">
                        <i className="fas fa-utensils mr-2"></i>
                        AI Meal Engine
                    </h1>
                </div>
                <nav className="p-2 space-y-2">
                    {navItems.map(item => <NavItem key={item.path} {...item} />)}
                </nav>
            </aside>

            <main className="flex-1 overflow-y-auto bg-gray-100 text-gray-800 p-4 sm:p-6 lg:p-8">
                <Routes>
                    <Route path="/" element={<Dashboard recipes={recipes} pantry={pantry} mealPlan={mealPlan} />} />
                    <Route path="/recipes" element={<Recipes recipes={recipes} addRecipe={addRecipe} setRecipes={setRecipes} />} />
                    <Route path="/recipes/:id" element={<RecipeDetail recipes={recipes} updateRecipe={updateRecipe} />} />
                    <Route path="/planner" element={<MealPlanner recipes={recipes} mealPlan={mealPlan} setMealPlan={setMealPlan} />} />
                    <Route path="/ai-architect" element={<AiArchitect recipes={recipes} setMealPlan={setMealPlan} />} />
                    <Route path="/pantry" element={<Pantry pantry={pantry} setPantry={setPantry} />} />
                    <Route path="/shopping-list" element={<ShoppingList mealPlan={mealPlan} pantry={pantry} />} />
                </Routes>
            </main>
        </div>
    );
};

export default App;
