import React, { createContext, useContext, useState, useEffect } from 'react';

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

interface UIContextType {
    isSidebarCollapsed: boolean;
    toggleSidebar: () => void;
    navItems: NavItemDef[];
    setNavItems: React.Dispatch<React.SetStateAction<NavItemDef[]>>;
    showUpgradeModal: boolean;
    setShowUpgradeModal: React.Dispatch<React.SetStateAction<boolean>>;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export const UIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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

    const [showUpgradeModal, setShowUpgradeModal] = useState(false);

    useEffect(() => {
        localStorage.setItem('ks_sidebar_collapsed', String(isSidebarCollapsed));
    }, [isSidebarCollapsed]);

    useEffect(() => {
        localStorage.setItem('ks_nav_order', JSON.stringify(navItems));
    }, [navItems]);

    const toggleSidebar = () => setIsSidebarCollapsed(prev => !prev);

    return (
        <UIContext.Provider value={{
            isSidebarCollapsed, toggleSidebar,
            navItems, setNavItems,
            showUpgradeModal, setShowUpgradeModal
        }}>
            {children}
        </UIContext.Provider>
    );
};

export const useUI = () => {
    const context = useContext(UIContext);
    if (!context) throw new Error('useUI must be used within a UIProvider');
    return context;
};
