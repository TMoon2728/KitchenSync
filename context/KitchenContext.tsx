import React, { createContext, useContext, useState, useEffect } from 'react';
import { Recipe, PantryItem, MealPlan, ShoppingItem } from '../types';
import { MOCK_RECIPES, MOCK_PANTRY, MOCK_MEAL_PLAN } from '../mockData';
import { authFetch } from '../utils/api';
import { useUser } from './UserContext';

interface KitchenContextType {
    recipes: Recipe[];
    pantry: PantryItem[];
    mealPlan: MealPlan;
    addRecipe: (newRecipe: Omit<Recipe, 'id' | 'is_favorite' | 'rating'>) => Promise<void>;
    updateRecipe: (updatedRecipe: Recipe) => void;
    deleteRecipe: (id: number) => Promise<void>;
    addPantryItem: (item: Omit<PantryItem, 'id'>) => Promise<void>;
    batchAddPantryItems: (items: Omit<PantryItem, 'id'>[]) => Promise<void>;
    removePantryItem: (id: number) => Promise<void>;
    setRecipes: React.Dispatch<React.SetStateAction<Recipe[]>>;
    setPantry: React.Dispatch<React.SetStateAction<PantryItem[]>>;
    setMealPlan: React.Dispatch<React.SetStateAction<MealPlan>>;
    manualShoppingList: ShoppingItem[];
    addManualShoppingItem: (item: Omit<ShoppingItem, 'id'>) => Promise<void>;
    removeManualShoppingItem: (id: number) => Promise<void>;
    isLoading: boolean;
}

const KitchenContext = createContext<KitchenContextType | undefined>(undefined);

export const KitchenProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { isAuthenticated, getAccessToken } = useUser();
    const [isLoading, setIsLoading] = useState(true);

    const [recipes, setRecipes] = useState<Recipe[]>(MOCK_RECIPES);
    const [pantry, setPantry] = useState<PantryItem[]>(MOCK_PANTRY);
    const [mealPlan, setMealPlan] = useState<MealPlan>({}); // Starts empty to fix ghost items bug
    const [manualShoppingList, setManualShoppingList] = useState<ShoppingItem[]>([]);

    // Initial Sync
    useEffect(() => {
        const syncData = async () => {
            // Fallback to local if not auth
            if (isAuthenticated) {
                try {
                    const token = await getAccessToken();
                    const [resRecipes, resPantry, resShopping] = await Promise.all([
                        authFetch('/api/data/recipes', { token }),
                        authFetch('/api/data/pantry', { token }),
                        authFetch('/api/data/shopping', { token })
                    ]);

                    if (resRecipes.ok) setRecipes(await resRecipes.json());
                    if (resPantry.ok) setPantry(await resPantry.json());
                    if (resShopping.ok) setManualShoppingList(await resShopping.json());
                    // MealPlan sync later
                } catch (e) {
                    console.error("Sync Failed", e);
                }
            } else {
                // Load from LocalStorage for guest
                const savedR = localStorage.getItem('ks_recipes');
                if (savedR) setRecipes(JSON.parse(savedR));

                const savedP = localStorage.getItem('ks_pantry');
                if (savedP) setPantry(JSON.parse(savedP));

                const savedS = localStorage.getItem('ks_shopping');
                if (savedS) setManualShoppingList(JSON.parse(savedS));
            }
            setIsLoading(false);
        };
        syncData();
    }, [isAuthenticated]);

    // Writes
    const addRecipe = async (newRecipe: Omit<Recipe, 'id' | 'is_favorite' | 'rating'>) => {
        // Optimistic
        const tempId = Date.now();
        const recipe: Recipe = { ...newRecipe, id: tempId, is_favorite: false, rating: 0 };
        setRecipes(prev => [...prev, recipe]);

        if (isAuthenticated) {
            try {
                const token = await getAccessToken();
                const res = await authFetch('/api/data/recipes', {
                    method: 'POST',
                    body: JSON.stringify(recipe),
                    token
                });
                if (res.ok) {
                    const saved = await res.json();
                    // Replace temp ID with real ID
                    setRecipes(prev => prev.map(r => r.id === tempId ? saved : r));
                }
            } catch (e) {
                console.error("Add Recipe Failed", e);
            }
        }
    };

    const updateRecipe = (updatedRecipe: Recipe) => {
        setRecipes(prev => prev.map(r => r.id === updatedRecipe.id ? updatedRecipe : r));
        // TODO: PUT /api/data/recipes/:id
    };

    const deleteRecipe = async (id: number) => {
        setRecipes(prev => prev.filter(r => r.id !== id));
        if (isAuthenticated) {
            const token = await getAccessToken();
            authFetch(`/api/data/recipes/${id}`, { method: 'DELETE', token });
        }
    };

    const addPantryItem = async (item: Omit<PantryItem, 'id'>) => {
        const tempId = Date.now();
        const fullItem = { ...item, id: tempId };
        setPantry(prev => [...prev, fullItem]);

        if (isAuthenticated) {
            const token = await getAccessToken();
            const res = await authFetch('/api/data/pantry', {
                method: 'POST',
                body: JSON.stringify(item),
                token
            });
            if (res.ok) {
                const saved = await res.json();
                setPantry(prev => prev.map(p => p.id === tempId ? saved : p));
            }
        }
    }


    const batchAddPantryItems = async (items: Omit<PantryItem, 'id'>[]) => {
        const timestampOffset = 0;
        const fullItems = items.map((item, index) => ({
            ...item,
            id: Date.now() + index
        }));

        setPantry(prev => [...prev, ...fullItems]);

        if (isAuthenticated) {
            const token = await getAccessToken();
            // We'll just loop for now since we don't have a batch API endpoint yet
            for (const item of items) {
                authFetch('/api/data/pantry', {
                    method: 'POST',
                    body: JSON.stringify(item),
                    token
                }).catch(e => console.error("Batch add failed for item", item.name));
            }
        }
    };

    const removePantryItem = async (id: number) => {
        setPantry(prev => prev.filter(p => p.id !== id));
        if (isAuthenticated) {
            const token = await getAccessToken();
            authFetch(`/api/data/pantry/${id}`, { method: 'DELETE', token });
        }
    };

    const addManualShoppingItem = async (item: Omit<ShoppingItem, 'id'>) => {
        const tempId = Date.now();
        const fullItem = { ...item, id: tempId };
        setManualShoppingList(prev => [...prev, fullItem]);

        if (isAuthenticated) {
            const token = await getAccessToken();
            const res = await authFetch('/api/data/shopping', {
                method: 'POST',
                body: JSON.stringify(item),
                token
            });
            if (res.ok) {
                const saved = await res.json();
                setManualShoppingList(prev => prev.map(s => s.id === tempId ? saved : s));
            }
        } else {
            localStorage.setItem('ks_shopping', JSON.stringify([...manualShoppingList, fullItem]));
        }
    };

    const removeManualShoppingItem = async (id: number) => {
        const newList = manualShoppingList.filter(s => s.id !== id);
        setManualShoppingList(newList);
        
        if (isAuthenticated) {
            const token = await getAccessToken();
            authFetch(`/api/data/shopping/${id}`, { method: 'DELETE', token });
        } else {
            localStorage.setItem('ks_shopping', JSON.stringify(newList));
        }
    };

    return (
        <KitchenContext.Provider value={{
            recipes, pantry, mealPlan,
            addRecipe, updateRecipe, deleteRecipe,
            addPantryItem, batchAddPantryItems, removePantryItem,
            setRecipes, setPantry, setMealPlan,
            manualShoppingList, addManualShoppingItem, removeManualShoppingItem,
            isLoading
        }}>
            {children}
        </KitchenContext.Provider>
    );
};

export const useKitchen = () => {
    const context = useContext(KitchenContext);
    if (!context) throw new Error('useKitchen must be used within a KitchenProvider');
    return context;
};
