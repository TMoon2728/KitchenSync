import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Recipe, PantryItem, MealPlan, ShoppingItem, Ingredient } from '../types';
import { MOCK_RECIPES, MOCK_PANTRY } from '../mockData';
import { authFetch } from '../utils/api';
import { convertQuantity } from '../utils/unitConversion';
import { useUser } from './UserContext';

interface KitchenContextType {
    recipes: Recipe[];
    pantry: PantryItem[];
    mealPlan: MealPlan;
    addRecipe: (newRecipe: Omit<Recipe, 'id' | 'is_favorite' | 'rating'>) => Promise<Recipe>;
    updateRecipe: (updatedRecipe: Recipe) => Promise<void>;
    deleteRecipe: (id: number) => Promise<void>;
    addPantryItem: (item: Omit<PantryItem, 'id'>) => Promise<PantryItem>;
    updatePantryItem: (item: PantryItem) => Promise<void>;
    batchAddPantryItems: (items: Omit<PantryItem, 'id'>[]) => Promise<void>;
    removePantryItem: (id: number) => Promise<void>;
    deductPantryIngredients: (ingredients: Ingredient[], isUndo?: boolean) => { missing: Ingredient[] };
    setRecipes: React.Dispatch<React.SetStateAction<Recipe[]>>;
    setPantry: React.Dispatch<React.SetStateAction<PantryItem[]>>;
    setMealPlan: React.Dispatch<React.SetStateAction<MealPlan>>;
    manualShoppingList: ShoppingItem[];
    addManualShoppingItem: (item: Omit<ShoppingItem, 'id'>) => Promise<void>;
    removeManualShoppingItem: (id: number) => Promise<void>;
    isLoading: boolean;
}

const KitchenContext = createContext<KitchenContextType | undefined>(undefined);

const loadFromStorage = <T,>(key: string, fallback: T): T => {
    try {
        const raw = localStorage.getItem(key);
        if (raw) return JSON.parse(raw);
    } catch (e) {
        console.error(`Failed to parse localStorage key "${key}"`, e);
    }
    return fallback;
};

export const KitchenProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { isAuthenticated, getAccessToken } = useUser();
    const [isLoading, setIsLoading] = useState(true);

    const [recipes, setRecipes] = useState<Recipe[]>(() => loadFromStorage('ks_recipes', MOCK_RECIPES));
    const [pantry, setPantry] = useState<PantryItem[]>(() => loadFromStorage('ks_pantry', MOCK_PANTRY));
    const [mealPlan, setMealPlanState] = useState<MealPlan>(() => loadFromStorage('ks_meal_plan', {}));
    const [manualShoppingList, setManualShoppingList] = useState<ShoppingItem[]>(() => loadFromStorage('ks_shopping', []));

    // Dual-Sync: Mirror all changes to localStorage cache
    useEffect(() => {
        try { localStorage.setItem('ks_recipes', JSON.stringify(recipes)); } catch (e) { console.error(e); }
    }, [recipes]);

    useEffect(() => {
        try { localStorage.setItem('ks_pantry', JSON.stringify(pantry)); } catch (e) { console.error(e); }
    }, [pantry]);

    useEffect(() => {
        try { localStorage.setItem('ks_meal_plan', JSON.stringify(mealPlan)); } catch (e) { console.error(e); }
    }, [mealPlan]);

    useEffect(() => {
        try { localStorage.setItem('ks_shopping', JSON.stringify(manualShoppingList)); } catch (e) { console.error(e); }
    }, [manualShoppingList]);

    // Initial Sync with PostgreSQL when authenticated
    useEffect(() => {
        const syncData = async () => {
            if (isAuthenticated) {
                try {
                    const token = await getAccessToken();
                    const [resRecipes, resPantry, resShopping, resMealPlan] = await Promise.all([
                        authFetch('/api/data/recipes', { token }),
                        authFetch('/api/data/pantry', { token }),
                        authFetch('/api/data/shopping', { token }),
                        authFetch('/api/data/meal-plan', { token })
                    ]);

                    if (resRecipes.ok) setRecipes(await resRecipes.json());
                    if (resPantry.ok) setPantry(await resPantry.json());
                    if (resShopping.ok) setManualShoppingList(await resShopping.json());
                    if (resMealPlan.ok) {
                        const serverPlan = await resMealPlan.json();
                        if (serverPlan && Object.keys(serverPlan).length > 0) {
                            setMealPlanState(serverPlan);
                        } else if (Object.keys(mealPlan).length > 0) {
                            // Push existing local meal plan up to the server
                            authFetch('/api/data/meal-plan', {
                                method: 'PUT',
                                body: JSON.stringify(mealPlan),
                                token
                            }).catch(err => console.error("Failed to seed server meal plan", err));
                        }
                    }
                } catch (e) {
                    console.error("Sync Failed", e);
                }
            }
            setIsLoading(false);
        };
        syncData();
    }, [isAuthenticated]);

    // Wrapped setMealPlan that persists to both localStorage and PostgreSQL
    const setMealPlan: React.Dispatch<React.SetStateAction<MealPlan>> = useCallback((action) => {
        setMealPlanState(prev => {
            const nextPlan = typeof action === 'function' ? action(prev) : action;
            if (isAuthenticated) {
                getAccessToken().then(token => {
                    authFetch('/api/data/meal-plan', {
                        method: 'PUT',
                        body: JSON.stringify(nextPlan),
                        token
                    }).catch(e => console.error("Meal plan sync failed", e));
                });
            }
            return nextPlan;
        });
    }, [isAuthenticated, getAccessToken]);

    // Writes
    const addRecipe = async (newRecipe: Omit<Recipe, 'id' | 'is_favorite' | 'rating'>): Promise<Recipe> => {
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
                    setRecipes(prev => prev.map(r => r.id === tempId ? saved : r));
                    return saved;
                }
            } catch (e) {
                console.error("Add Recipe Failed", e);
            }
        }
        return recipe;
    };

    const updateRecipe = async (updatedRecipe: Recipe): Promise<void> => {
        setRecipes(prev => prev.map(r => r.id === updatedRecipe.id ? updatedRecipe : r));
        if (isAuthenticated) {
            try {
                const token = await getAccessToken();
                await authFetch(`/api/data/recipes/${updatedRecipe.id}`, {
                    method: 'PUT',
                    body: JSON.stringify(updatedRecipe),
                    token
                });
            } catch (e) {
                console.error("Update Recipe Failed", e);
            }
        }
    };

    const deleteRecipe = async (id: number) => {
        setRecipes(prev => prev.filter(r => r.id !== id));
        if (isAuthenticated) {
            const token = await getAccessToken();
            authFetch(`/api/data/recipes/${id}`, { method: 'DELETE', token });
        }
    };

    const addPantryItem = async (item: Omit<PantryItem, 'id'>): Promise<PantryItem> => {
        const tempId = Date.now();
        const fullItem: PantryItem = { ...item, id: tempId };
        setPantry(prev => [...prev, fullItem]);

        if (isAuthenticated) {
            try {
                const token = await getAccessToken();
                const res = await authFetch('/api/data/pantry', {
                    method: 'POST',
                    body: JSON.stringify(item),
                    token
                });
                if (res.ok) {
                    const saved = await res.json();
                    setPantry(prev => prev.map(p => p.id === tempId ? saved : p));
                    return saved;
                }
            } catch (e) {
                console.error("Add Pantry Item Failed", e);
            }
        }
        return fullItem;
    };

    const updatePantryItem = async (updatedItem: PantryItem): Promise<void> => {
        setPantry(prev => prev.map(p => p.id === updatedItem.id ? updatedItem : p));
        if (isAuthenticated) {
            try {
                const token = await getAccessToken();
                await authFetch(`/api/data/pantry/${updatedItem.id}`, {
                    method: 'PUT',
                    body: JSON.stringify(updatedItem),
                    token
                });
            } catch (e) {
                console.error("Update Pantry Item Failed", e);
            }
        }
    };

    const batchAddPantryItems = async (items: Omit<PantryItem, 'id'>[]) => {
        if (!items || items.length === 0) return;
        const baseTs = Date.now();
        const tempIds = items.map((_, idx) => baseTs + idx);
        const fullItems: PantryItem[] = items.map((item, index) => ({
            ...item,
            id: tempIds[index]
        }));

        setPantry(prev => [...prev, ...fullItems]);

        if (isAuthenticated) {
            try {
                const token = await getAccessToken();
                const res = await authFetch('/api/data/pantry/batch', {
                    method: 'POST',
                    body: JSON.stringify({ items }),
                    token
                });
                if (res.ok) {
                    const savedItems: PantryItem[] = await res.json();
                    setPantry(prev => {
                        const tempSet = new Set(tempIds);
                        const withoutTemps = prev.filter(p => !tempSet.has(p.id));
                        return [...withoutTemps, ...savedItems];
                    });
                }
            } catch (e) {
                console.error("Batch add pantry items failed", e);
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

    const deductPantryIngredients = (ingredients: Ingredient[], isUndo = false): { missing: Ingredient[] } => {
        const missing: Ingredient[] = [];
        const modifiedItems: PantryItem[] = [];

        const nextPantry = pantry.map(item => ({ ...item }));

        ingredients.forEach(ing => {
            const pantryItemIndex = nextPantry.findIndex(
                p => p.name.toLowerCase() === ing.name.toLowerCase()
            );

            if (pantryItemIndex > -1) {
                const pantryItem = nextPantry[pantryItemIndex];
                const conversionResult = convertQuantity(ing.quantity, ing.unit, pantryItem.unit);

                if (conversionResult !== null) {
                    if (isUndo) {
                        pantryItem.quantity = Number((pantryItem.quantity + conversionResult).toFixed(3));
                    } else {
                        pantryItem.quantity = Number(Math.max(0, pantryItem.quantity - conversionResult).toFixed(3));
                    }
                    modifiedItems.push(pantryItem);
                } else {
                    console.warn(`Unit mismatch for ${ing.name} during pantry deduction.`);
                }
            } else if (!isUndo) {
                missing.push(ing);
            }
        });

        setPantry(nextPantry);

        if (isAuthenticated && modifiedItems.length > 0) {
            getAccessToken().then(token => {
                modifiedItems.forEach(item => {
                    authFetch(`/api/data/pantry/${item.id}`, {
                        method: 'PUT',
                        body: JSON.stringify(item),
                        token
                    }).catch(err => console.error(`Failed to sync deducted pantry item ${item.name}`, err));
                });
            });
        }

        return { missing };
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
        }
    };

    const removeManualShoppingItem = async (id: number) => {
        setManualShoppingList(prev => prev.filter(s => s.id !== id));

        if (isAuthenticated) {
            const token = await getAccessToken();
            authFetch(`/api/data/shopping/${id}`, { method: 'DELETE', token });
        }
    };

    return (
        <KitchenContext.Provider value={{
            recipes, pantry, mealPlan,
            addRecipe, updateRecipe, deleteRecipe,
            addPantryItem, updatePantryItem, batchAddPantryItems, removePantryItem,
            deductPantryIngredients,
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
