import React, { useEffect, useState, Suspense } from 'react';
import { Routes, Route, NavLink, useLocation, Navigate } from 'react-router-dom';
import confetti from 'canvas-confetti';

import { UserProvider, useUser } from './context/UserContext';
import { KitchenProvider } from './context/KitchenContext';
import { UIProvider, useUI } from './context/UIContext';
import Spinner from './components/Spinner';

// Lazy Load Pages
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Recipes = React.lazy(() => import('./pages/Recipes'));
const RecipeForm = React.lazy(() => import('./pages/RecipeForm'));
const RecipeDetail = React.lazy(() => import('./pages/RecipeDetail'));
const CookingMode = React.lazy(() => import('./pages/CookingMode'));
const MealPlanner = React.lazy(() => import('./pages/MealPlanner'));
const MealPrep = React.lazy(() => import('./pages/MealPrep'));
const AiArchitect = React.lazy(() => import('./pages/AiArchitect'));
const Pantry = React.lazy(() => import('./pages/Pantry'));
const ShoppingList = React.lazy(() => import('./pages/ShoppingList'));
const Profile = React.lazy(() => import('./pages/Profile'));
const Subscription = React.lazy(() => import('./pages/Subscription'));

// Eager Load Auth Pages & Landing (Critical Path)
import Login from './pages/Login';
import Register from './pages/Register';
import LandingPage from './pages/LandingPage';
import UpgradeModal from './components/UpgradeModal';
import SousChef from './components/SousChef';

const KONAMI_CODE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
const SPACE_NAMES = ['iss', 'nasa', 'the enterprise', 'enterprise', 'voyager', 'deep space 9', 'zero g', 'orbit'];

const AppContent: React.FC = () => {
    // --- PUBLIC ROUTING ---
    const { userProfile, updatePreferences, retroMode, setRetroMode, isAuthenticated, isLoading, logout } = useUser();
    const { isSidebarCollapsed, toggleSidebar, navItems, setNavItems } = useUI();

    if (isLoading) {
        return <div className="flex h-screen items-center justify-center bg-gray-900 text-white"><Spinner size="lg" /></div>;
    }

    if (!isAuthenticated) {
        return (
            <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        );
    }

    // --- PROTECTED ROUTING ---
    const [konamiIndex, setKonamiIndex] = useState(0);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === KONAMI_CODE[konamiIndex]) {
                const nextIndex = konamiIndex + 1;
                if (nextIndex === KONAMI_CODE.length) {
                    setRetroMode(prev => !prev);
                    setKonamiIndex(0);
                    confetti({
                        particleCount: 500,
                        spread: 200,
                        shapes: ['square'],
                        colors: ['#33ff00', '#000000', '#ffffff']
                    });
                } else {
                    setKonamiIndex(nextIndex);
                }
            } else {
                setKonamiIndex(0);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [konamiIndex, setRetroMode]);

    const location = useLocation();

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

    // DnD Handlers (omitted helper funcs for brevity if reused, but keeping inline for logic preservation)
    const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);

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

    const isCookingMode = location.pathname.includes('/cook');
    const isSpaceMode = userProfile.kitchenName && SPACE_NAMES.some(name => userProfile.kitchenName!.toLowerCase().includes(name));
    const hiddenItems = userProfile.preferences?.hiddenNavItems || [];

    return (
        <div className={`flex h-screen bg-gray-900 text-white ${retroMode ? 'retro-mode' : ''} ${isSpaceMode ? 'zero-g-mode' : ''}`}>
            {!isCookingMode && (
                <aside
                    className={`flex-shrink-0 ${themeClasses.sidebar} overflow-y-auto transition-all duration-300 ease-in-out flex flex-col border-r border-white/10 ${isSidebarCollapsed ? 'w-20' : 'w-64'}`}
                >
                    <div className={`p-4 flex items-center h-16 ${isSidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
                        {!isSidebarCollapsed && (
                            <h1 className="text-2xl font-bold flex items-center truncate">
                                <i className="fas fa-utensils mr-2"></i>
                                {retroMode ? '8-BIT KITCHEN' : 'KitchenSync'}
                            </h1>
                        )}
                        {isSidebarCollapsed && (
                            <i className="fas fa-utensils text-2xl"></i>
                        )}
                    </div>

                    <div className={`mx-4 mt-2 mb-4 bg-black/20 rounded-xl p-3 flex flex-col items-center border border-white/10 ${isSidebarCollapsed ? 'px-1' : ''}`}>
                        <div className="flex items-center gap-2 mb-1">
                            <i className="fas fa-bolt text-yellow-400"></i>
                            {!isSidebarCollapsed && <span className="text-xs font-bold uppercase tracking-wider text-gray-300">AI Credits</span>}
                        </div>
                        <span className={`font-mono font-bold text-white ${isSidebarCollapsed ? 'text-xs' : 'text-xl'}`}>
                            {retroMode ? '∞' : (userProfile.subscriptionTier === 'pro' ? '∞' : userProfile.credits)}
                        </span>
                        {!isSidebarCollapsed && userProfile.subscriptionTier !== 'pro' && !retroMode && (
                            <NavLink to="/subscription" className="text-[10px] text-blue-300 hover:text-blue-100 mt-1">Get More</NavLink>
                        )}
                        {retroMode && !isSidebarCollapsed && (
                            <span className="text-[10px] text-green-400 mt-1 uppercase">God Mode</span>
                        )}
                    </div>

                    <nav className="p-2 space-y-2 flex-grow">
                        {navItems.map((item, index) => {
                            if (hiddenItems.includes(item.path)) return null;
                            return (
                                <div
                                    key={item.path}
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
                                            `flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-all whitespace-nowrap overflow-hidden ${isActive ? `${themeClasses.active} text-white shadow-lg` : `text-gray-300 ${themeClasses.hover} hover:text-white`
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
                        })}
                    </nav>

                    <div className="px-2 mb-2">
                        <button
                            onClick={() => logout()}
                            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-all whitespace-nowrap overflow-hidden text-gray-300 hover:text-white hover:bg-red-900/30 group`}
                            title="Logout"
                        >
                            <div className={`w-6 flex justify-center flex-shrink-0 transition-all ${isSidebarCollapsed ? 'mx-auto' : 'mr-3'}`}>
                                <i className="fas fa-sign-out-alt text-lg text-red-400 group-hover:text-red-300"></i>
                            </div>
                            <span className={`transition-all duration-300 ${isSidebarCollapsed ? 'opacity-0 w-0' : 'opacity-100'}`}>
                                Logout
                            </span>
                        </button>
                    </div>

                    <div className="p-4 border-t border-white/10 flex justify-center">
                        <button
                            onClick={toggleSidebar}
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
                <Suspense fallback={<div className="flex h-full items-center justify-center"><Spinner size="lg" /></div>}>
                    <Routes>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/recipes" element={<Recipes />} />
                        <Route path="/recipes/new" element={<RecipeForm />} />
                        <Route path="/recipes/:id" element={<RecipeDetail />} />
                        <Route path="/recipes/:id/cook" element={<CookingMode />} />
                        <Route path="/planner" element={<MealPlanner />} />
                        <Route path="/meal-prep" element={<MealPrep />} />
                        <Route path="/ai-architect" element={<AiArchitect />} />
                        <Route path="/pantry" element={<Pantry />} />
                        <Route path="/shopping-list" element={<ShoppingList />} />
                        <Route path="/profile" element={<Profile />} />
                        <Route path="/subscription" element={<Subscription />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </Suspense>
            </main>

            {!isCookingMode && userProfile.preferences?.showSousChef !== false && (
                <SousChef onDisable={() => updatePreferences({ showSousChef: false })} />
            )}

            <UpgradeModal />
        </div>
    );
};

const App: React.FC = () => {
    return (
        <UserProvider>
            <KitchenProvider>
                <UIProvider>
                    <AppContent />
                </UIProvider>
            </KitchenProvider>
        </UserProvider>
    );
};

export default App;
