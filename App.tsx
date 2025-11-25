
import React, { useState, useEffect } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { MOCK_RECIPES, MOCK_PANTRY, MOCK_MEAL_PLAN, MOCK_PROFILE } from './mockData';
import type { Recipe, PantryItem, MealPlan, UserProfile } from './types';
import Dashboard from './pages/Dashboard';
import Recipes from './pages/Recipes';
import MealPlanner from './pages/MealPlanner';
import ShoppingList from './pages/ShoppingList';
import Pantry from './pages/Pantry';
import RecipeDetail from './pages/RecipeDetail';
import AiArchitect from './pages/AiArchitect';
import MealPrep from './pages/MealPrep';
import RecipeForm from './pages/RecipeForm';
import CookingMode from './pages/CookingMode';
import Profile from './pages/Profile';
import Subscription from './pages/Subscription';
import SousChef from './components/SousChef';
import UpgradeModal from './components/UpgradeModal';

interface NavItemDef {
    path: string;
    name: string;
    icon: string;
}

const DEFAULT_NAV_ITEMS: NavItemDef[] = [
    { path: '/', name: 'Dashboard', icon: 'fa-tachometer-alt' },
    { path: '/recipes', name: 'Recipes', icon: 'fa-book-open' },
    { path: '/planner', name: 'Planner', icon: 'fa-calendar-alt' },
    { path: '/meal-prep', name: 'Meal Prep', icon: 'fa-layer-group' },
    { path: '/ai-architect', name: 'AI Architect', icon: 'fa-magic' },
    { path: '/pantry', name: 'Pantry', icon: 'fa-box-open' },
    { path: '/shopping-list', name: 'Shopping List', icon: 'fa-cart-shopping' },
    { path: '/profile', name: 'Profile', icon: 'fa-user-cog' },
];

const App: React.FC = () => {
    const [recipes, setRecipes] = useState<Recipe[]>(() => {
        const saved = localStorage.getItem('ks_recipes');
        return saved ? JSON.parse(saved) : MOCK_RECIPES;
    });
    
    const [pantry, setPantry] = useState<PantryItem[]>(() => {
        const saved = localStorage.getItem('ks_pantry');
        return saved ? JSON.parse(saved) : MOCK_PANTRY;
    });

    const [mealPlan, setMealPlan] = useState<MealPlan>(() => {
        const saved = localStorage.getItem('ks_meal_plan');
        return saved ? JSON.parse(saved) : MOCK_MEAL_PLAN;
    });

    const [userProfile, setUserProfile] = useState<UserProfile>(() => {
        const saved = localStorage.getItem('ks_user_profile');
        return saved ? JSON.parse(saved) : MOCK_PROFILE;
    });

    // Sidebar & Navigation State
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
        return localStorage.getItem('ks_sidebar_collapsed') === 'true';
    });

    const [navItems, setNavItems] = useState<NavItemDef[]>(() => {
        const savedOrder = localStorage.getItem('ks_nav_order');
        if (savedOrder) {
            try {
                const parsed = JSON.parse(savedOrder);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            } catch (e) { console.error(e); }
        }
        return DEFAULT_NAV_ITEMS;
    });

    const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);

    // Persistence Effects
    useEffect(() => {
        localStorage.setItem('ks_recipes', JSON.stringify(recipes));
    }, [recipes]);

    useEffect(() => {
        localStorage.setItem('ks_pantry', JSON.stringify(pantry));
    }, [pantry]);

    useEffect(() => {
        localStorage.setItem('ks_meal_plan', JSON.stringify(mealPlan));
    }, [mealPlan]);

    useEffect(() => {
        localStorage.setItem('ks_user_profile', JSON.stringify(userProfile));
    }, [userProfile]);

    useEffect(() => {
        localStorage.setItem('ks_sidebar_collapsed', String(isSidebarCollapsed));
    }, [isSidebarCollapsed]);

    useEffect(() => {
        localStorage.setItem('ks_nav_order', JSON.stringify(navItems));
    }, [navItems]);


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

    // Credit Logic
    const consumeCredits = (cost: number): boolean => {
        if (userProfile.subscriptionTier === 'pro') return true;
        
        if (userProfile.credits >= cost) {
            setUserProfile(prev => ({ ...prev, credits: prev.credits - cost }));
            return true;
        } else {
            setShowUpgradeModal(true);
            return false;
        }
    };

    const toggleSousChef = (show: boolean) => {
        setUserProfile(prev => ({
            ...prev,
            preferences: {
                enableConfetti: true,
                confettiIntensity: 'medium',
                themeColor: 'blue',
                ...prev.preferences,
                showSousChef: show
            }
        }));
    };

    // Theme Logic
    const themeColor = userProfile.preferences?.themeColor || 'blue';
    const themeClasses = {
        blue: { sidebar: 'bg-blue-900', active: 'bg-blue-600', hover: 'hover:bg-blue-800' },
        green: { sidebar: 'bg-green-900', active: 'bg-green-600', hover: 'hover:bg-green-800' },
        purple: { sidebar: 'bg-purple-900', active: 'bg-purple-600', hover: 'hover:bg-purple-800' },
        slate: { sidebar: 'bg-slate-900', active: 'bg-slate-600', hover: 'hover:bg-slate-800' },
        orange: { sidebar: 'bg-orange-900', active: 'bg-orange-600', hover: 'hover:bg-orange-800' },
        rose: { sidebar: 'bg-rose-900', active: 'bg-rose-600', hover: 'hover:bg-rose-800' },
    }[themeColor] || { sidebar: 'bg-blue-900', active: 'bg-blue-600', hover: 'hover:bg-blue-800' };

    // DnD Handlers
    const handleDragStart = (e: React.DragEvent, index: number) => {
        setDraggedItemIndex(index);
        e.dataTransfer.effectAllowed = "move";
        e.currentTarget.classList.add('opacity-50');
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (draggedItemIndex === null || draggedItemIndex === index) return;
        
        const newItems = [...navItems];
        const draggedItem = newItems[draggedItemIndex];
        newItems.splice(draggedItemIndex, 1);
        newItems.splice(index, 0, draggedItem);
        
        setNavItems(newItems);
        setDraggedItemIndex(index);
    };

    const handleDragEnd = (e: React.DragEvent) => {
        setDraggedItemIndex(null);
        e.currentTarget.classList.remove('opacity-50');
    };

    const NavItem: React.FC<{ item: NavItemDef; index: number }> = ({ item, index }) => (
        <div
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
            className="cursor-move group relative"
            title={isSidebarCollapsed ? item.name : 'Drag to reorder'}
        >
            <NavLink
                to={item.path}
                className={({ isActive }) =>
                    `flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-all whitespace-nowrap overflow-hidden ${
                    isActive ? `${themeClasses.active} text-white shadow-lg` : `text-gray-300 ${themeClasses.hover} hover:text-white`
                    }`
                }
            >
                <div className={`w-6 flex justify-center flex-shrink-0 transition-all ${isSidebarCollapsed ? 'mx-auto' : 'mr-3'}`}>
                    <i className={`fas ${item.icon} text-lg ${item.path === '/ai-architect' ? 'text-purple-400' : ''}`}></i>
                </div>
                <span className={`transition-all duration-300 ${isSidebarCollapsed ? 'opacity-0 w-0' : 'opacity-100'}`}>
                    {item.name}
                </span>
            </NavLink>
        </div>
    );

    const isCookingMode = location.pathname.includes('/cook');

    return (
        <div className="flex h-screen bg-gray-900 text-white">
            {!isCookingMode && (
                <aside 
                    className={`flex-shrink-0 ${themeClasses.sidebar} overflow-y-auto transition-all duration-300 ease-in-out flex flex-col border-r border-white/10 ${isSidebarCollapsed ? 'w-20' : 'w-64'}`}
                >
                    <div className={`p-4 flex items-center h-16 ${isSidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
                        {!isSidebarCollapsed && (
                            <h1 className="text-2xl font-bold flex items-center truncate">
                                <i className="fas fa-utensils mr-2"></i>
                                KitchenSync
                            </h1>
                        )}
                        {isSidebarCollapsed && (
                            <i className="fas fa-utensils text-2xl"></i>
                        )}
                    </div>
                    
                    {/* Credit Display in Sidebar */}
                    <div className={`mx-4 mt-2 mb-4 bg-black/20 rounded-xl p-3 flex flex-col items-center border border-white/10 ${isSidebarCollapsed ? 'px-1' : ''}`}>
                        <div className="flex items-center gap-2 mb-1">
                            <i className="fas fa-bolt text-yellow-400"></i>
                            {!isSidebarCollapsed && <span className="text-xs font-bold uppercase tracking-wider text-gray-300">AI Credits</span>}
                        </div>
                        <span className={`font-mono font-bold text-white ${isSidebarCollapsed ? 'text-xs' : 'text-xl'}`}>
                            {userProfile.subscriptionTier === 'pro' ? '∞' : userProfile.credits}
                        </span>
                        {!isSidebarCollapsed && userProfile.subscriptionTier !== 'pro' && (
                             <NavLink to="/subscription" className="text-[10px] text-blue-300 hover:text-blue-100 mt-1">Get More</NavLink>
                        )}
                    </div>
                    
                    <nav className="p-2 space-y-2 flex-grow">
                        {navItems.map((item, index) => <NavItem key={item.path} item={item} index={index} />)}
                    </nav>
                    
                    <div className="p-4 border-t border-white/10 flex justify-center">
                        <button 
                            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} 
                            className="w-full py-2 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                            title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                        >
                            <i className={`fas ${isSidebarCollapsed ? 'fa-angle-double-right' : 'fa-angle-double-left'}`}></i>
                            {!isSidebarCollapsed && <span className="ml-2 text-sm font-medium">Collapse</span>}
                        </button>
                    </div>
                </aside>
            )}

            <main className={`flex-1 overflow-y-auto bg-gray-100 text-gray-800 ${isCookingMode ? 'p-0' : 'p-4 sm:p-6 lg:p-8'}`}>
                <Routes>
                    <Route path="/" element={<Dashboard recipes={recipes} pantry={pantry} mealPlan={mealPlan} setPantry={setPantry} setMealPlan={setMealPlan} userProfile={userProfile} consumeCredits={consumeCredits} />} />
                    <Route path="/recipes" element={<Recipes recipes={recipes} pantry={pantry} addRecipe={addRecipe} setRecipes={setRecipes} consumeCredits={consumeCredits} />} />
                    <Route path="/recipes/new" element={<RecipeForm addRecipe={addRecipe} />} />
                    <Route path="/recipes/:id" element={<RecipeDetail recipes={recipes} updateRecipe={updateRecipe} consumeCredits={consumeCredits} />} />
                    <Route path="/recipes/:id/cook" element={<CookingMode recipes={recipes} />} />
                    <Route path="/planner" element={<MealPlanner recipes={recipes} mealPlan={mealPlan} setMealPlan={setMealPlan} pantry={pantry} setPantry={setPantry} userProfile={userProfile} />} />
                    <Route path="/meal-prep" element={<MealPrep recipes={recipes} />} />
                    <Route path="/ai-architect" element={<AiArchitect recipes={recipes} setMealPlan={setMealPlan} userProfile={userProfile} consumeCredits={consumeCredits} />} />
                    <Route path="/pantry" element={<Pantry pantry={pantry} setPantry={setPantry} recipes={recipes} consumeCredits={consumeCredits} />} />
                    <Route path="/shopping-list" element={<ShoppingList mealPlan={mealPlan} pantry={pantry} recipes={recipes} userProfile={userProfile} />} />
                    <Route path="/profile" element={<Profile userProfile={userProfile} setUserProfile={setUserProfile} />} />
                    <Route path="/subscription" element={<Subscription userProfile={userProfile} setUserProfile={setUserProfile} />} />
                </Routes>
            </main>

            {/* Global Assistants - Conditional Render */}
            {!isCookingMode && userProfile.preferences?.showSousChef !== false && (
                <SousChef 
                    recipes={recipes} 
                    pantry={pantry} 
                    consumeCredits={consumeCredits} 
                    onDisable={() => toggleSousChef(false)}
                />
            )}
            
            <UpgradeModal isOpen={showUpgradeModal} onClose={() => setShowUpgradeModal(false)} />
        </div>
    );
};

export default App;