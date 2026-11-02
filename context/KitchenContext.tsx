import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Recipe, PantryItem, MealPlan, ShoppingItem, Ingredient } from '../types';
import { MOCK_RECIPES, MOCK_PANTRY } from '../mockData';
import { authFetch } from '../utils/api';
import { enqueueOutboxMutation, flushOutboxQueue } from '../utils/outbox';
import { convertQuantity } from '../utils/unitConversion';
import {
    normalizeRecipeIngredient,
    cleanIngredientNameAndUnit,
    isPlainCookingWater
} from '../utils/ingredientNormalizer';
import { useUser } from './UserContext';

const cleanRecipeList = (list: Recipe[]): Recipe[] =>
    (list || []).map(r => ({
        ...r,
        ingredients: (r.ingredients || [])
            .map(ing => normalizeRecipeIngredient(ing))
            .filter((ing): ing is NonNullable<typeof ing> => ing !== null)
    }));

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

    const [recipes, setRecipes] = useState<Recipe[]>(() =>
        cleanRecipeList(loadFromStorage('ks_recipes', MOCK_RECIPES))
    );
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

    // Initial Sync with PostgreSQL + Real-Time Household SSE Bus (U-01) & Offline Outbox Replay (U-03)
    useEffect(() => {
        let eventSource: EventSource | null = null;

        const handleOnline = () => {
            if (isAuthenticated) {
                flushOutboxQueue(getAccessToken).catch(() => {});
            }
        };
        window.addEventListener('online', handleOnline);

        const syncData = async () => {
            if (isAuthenticated) {
                try {
                    await flushOutboxQueue(getAccessToken);
                    const token = await getAccessToken();
                    const [resRecipes, resPantry, resShopping, resMealPlan] = await Promise.all([
                        authFetch('/api/data/recipes', { token }),
                        authFetch('/api/data/pantry', { token }),
                        authFetch('/api/data/shopping', { token }),
                        authFetch('/api/data/meal-plan', { token })
                    ]);

                    if (resRecipes.ok) {
                        const serverRecipes: Recipe[] = await resRecipes.json();
                        const serverNames = new Set(
                            serverRecipes.map(sr => (sr.name || '').toLowerCase().trim())
                        );
                        const mockIds = new Set(MOCK_RECIPES.map(m => m.id));
                        const unsyncedLocal = recipes.filter(r => {
                            const key = (r.name || '').toLowerCase().trim();
                            if (!key || serverNames.has(key)) return false;
                            if (serverRecipes.length > 0 && mockIds.has(r.id)) return false;
                            return true;
                        });

                        const uploadResults = await Promise.allSettled(
                            unsyncedLocal.map(async (localRec) => {
                                const postRes = await authFetch('/api/data/recipes', {
                                    method: 'POST',
                                    body: JSON.stringify(localRec),
                                    token
                                });
                                return postRes.ok ? ((await postRes.json()) as Recipe) : null;
                            })
                        );
                        const uploaded = uploadResults
                            .filter((r): r is PromiseFulfilledResult<Recipe | null> => r.status === 'fulfilled' && r.value !== null)
                            .map(r => r.value!);
                        setRecipes(cleanRecipeList([...serverRecipes, ...uploaded]));
                    }
                    if (resPantry.ok) {
                        const serverPantry: Ingredient[] = await resPantry.json();
                        if (serverPantry.length > 0) {
                            setPantry(serverPantry);
                        } else if (pantry.length > 0) {
                            try {
                                const batchRes = await authFetch('/api/data/pantry/batch', {
                                    method: 'POST',
                                    body: JSON.stringify({ items: pantry }),
                                    token
                                });
                                if (batchRes.ok) {
                                    setPantry(await batchRes.json());
                                }
                            } catch {}
                        }
                    }
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

                    // Subscribe to Real-Time Household SSE Bus (U-01)
                    if (typeof EventSource !== 'undefined' && token) {
                        eventSource = new EventSource(`/api/data/events?token=${encodeURIComponent(token)}`);
                        eventSource.onmessage = async (evt) => {
                            try {
                                const payload = JSON.parse(evt.data);
                                if (!payload || payload.type === 'connected') return;
                                const latestToken = await getAccessToken();

                                if (payload.type === 'meal_plan:delta' && payload.dayKey && payload.slotKey) {
                                    setMealPlanState(prev => ({
                                        ...prev,
                                        [payload.dayKey]: {
                                            ...(prev[payload.dayKey] || {}),
                                            [payload.slotKey]: payload.slotItems
                                        }
                                    }));
                                } else if (payload.type === 'meal_plan:updated' || payload.type === 'household:sync') {
                                    const mpRes = await authFetch('/api/data/meal-plan', { token: latestToken });
                                    if (mpRes.ok) setMealPlanState(await mpRes.json());
                                }

                                if (payload.type === 'pantry:updated' || payload.type === 'household:sync') {
                                    const pRes = await authFetch('/api/data/pantry', { token: latestToken });
                                    if (pRes.ok) setPantry(await pRes.json());
                                }
                            } catch {
                                // Ignore malformed SSE frames
                            }
                        };
                    }
                } catch (e) {
                    console.error("Sync Failed", e);
                }
            }
            setIsLoading(false);
        };
        syncData();

        return () => {
            window.removeEventListener('online', handleOnline);
            if (eventSource) {
                eventSource.close();
            }
        };
    }, [isAuthenticated]);

    // Wrapped setMealPlan that persists to both localStorage and PostgreSQL without racing inside the React state updater
    const mealPlanDirtyRef = useRef(false);

    const setMealPlan: React.Dispatch<React.SetStateAction<MealPlan>> = useCallback((action) => {
        mealPlanDirtyRef.current = true;
        setMealPlanState(prev => (typeof action === 'function' ? action(prev) : action));
    }, []);

    useEffect(() => {
        if (!mealPlanDirtyRef.current || !isAuthenticated) return;
        mealPlanDirtyRef.current = false;

        const controller = new AbortController();
        const serializedPlan = JSON.stringify(mealPlan);
        getAccessToken()
            .then(token =>
                authFetch('/api/data/meal-plan', {
                    method: 'PUT',
                    body: serializedPlan,
                    token,
                    signal: controller.signal
                })
            )
            .catch(e => {
                if (e?.name !== 'AbortError') {
                    console.warn("Meal plan sync offline; queued to outbox:", e);
                    enqueueOutboxMutation({
                        url: '/api/data/meal-plan',
                        method: 'PUT',
                        body: serializedPlan
                    });
                }
            });

        return () => controller.abort();
    }, [mealPlan, isAuthenticated, getAccessToken]);

    // Writes
    const addRecipe = async (newRecipe: Omit<Recipe, 'id' | 'is_favorite' | 'rating'>): Promise<Recipe> => {
        const tempId = Date.now();
        const cleanedIngredients = (newRecipe.ingredients || [])
            .map(ing => normalizeRecipeIngredient(ing))
            .filter((ing): ing is NonNullable<typeof ing> => ing !== null);
        const recipe: Recipe = {
            ...newRecipe,
            ingredients: cleanedIngredients,
            id: tempId,
            is_favorite: false,
            rating: 0
        };
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
        const modifiedById = new Map<number, PantryItem>();

        const nextPantry = pantry.map(item => ({ ...item }));
        const pantryIndex = nextPantry.map((p, idx) => {
            const { canonicalKey, unit } = cleanIngredientNameAndUnit(p.name, p.unit);
            return {
                idx,
                canonicalKey,
                normUnit: unit,
                lowerName: p.name.toLowerCase().trim()
            };
        });

        ingredients.forEach(ing => {
            if (!ing?.name || isPlainCookingWater(ing.name)) return;

            const { canonicalKey: ingKey, unit: ingUnit } = cleanIngredientNameAndUnit(ing.name, ing.unit);
            const lowerIngName = ing.name.toLowerCase().trim();

            const matchedEntry = pantryIndex.find(
                entry => entry.canonicalKey === ingKey || entry.lowerName === lowerIngName
            );

            if (matchedEntry) {
                const pantryItem = nextPantry[matchedEntry.idx];
                const conversionResult = convertQuantity(ing.quantity, ingUnit, matchedEntry.normUnit);

                if (conversionResult !== null) {
                    if (isUndo) {
                        pantryItem.quantity = Number((pantryItem.quantity + conversionResult).toFixed(3));
                    } else {
                        pantryItem.quantity = Number(Math.max(0, pantryItem.quantity - conversionResult).toFixed(3));
                    }
                    modifiedById.set(pantryItem.id, pantryItem);
                } else {
                    console.warn(`Unit mismatch for ${ing.name} during pantry deduction.`);
                }
            } else if (!isUndo) {
                missing.push(ing);
            }
        });

        setPantry(nextPantry);

        if (isAuthenticated && modifiedById.size > 0) {
            const itemsToSync = Array.from(modifiedById.values());
            getAccessToken().then(token => {
                Promise.allSettled(
                    itemsToSync.map(item =>
                        authFetch(`/api/data/pantry/${item.id}`, {
                            method: 'PUT',
                            body: JSON.stringify(item),
                            token
                        })
                    )
                ).catch(err => console.error('Failed to sync deducted pantry items', err));
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
