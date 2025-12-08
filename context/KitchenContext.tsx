import React, { createContext, useContext, useState, useEffect } from 'react';
import { Recipe, PantryItem, MealPlan } from '../types';
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
    isLoading: boolean;
}

const KitchenContext = createContext<KitchenContextType | undefined>(undefined);

export const KitchenProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { isAuthenticated } = useUser();
    const [isLoading, setIsLoading] = useState(true);

    const [recipes, setRecipes] = useState<Recipe[]>(MOCK_RECIPES);
    const [pantry, setPantry] = useState<PantryItem[]>(MOCK_PANTRY);
    const [mealPlan, setMealPlan] = useState<MealPlan>(MOCK_MEAL_PLAN);

    // Initial Sync
    useEffect(() => {
        const syncData = async () => {
            // Fallback to local if not auth
            if (isAuthenticated) {
                try {
                    const [resRecipes, resPantry] = await Promise.all([
                        authFetch('/api/data/recipes'),
                        authFetch('/api/data/pantry')
                    ]);

                    if (resRecipes.ok) setRecipes(await resRecipes.json());
                    if (resPantry.ok) setPantry(await resPantry.json());
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
                const res = await authFetch('/api/data/recipes', {
                    method: 'POST',
                    body: JSON.stringify(recipe)
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
            authFetch(`/api/data/recipes/${id}`, { method: 'DELETE' });
        }
    };

    const addPantryItem = async (item: Omit<PantryItem, 'id'>) => {
        const tempId = Date.now();
        const fullItem = { ...item, id: tempId };
        setPantry(prev => [...prev, fullItem]);

        if (isAuthenticated) {
            const res = await authFetch('/api/data/pantry', {
                method: 'POST',
                body: JSON.stringify(item)
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
            // We'll just loop for now since we don't have a batch API endpoint yet
            for (const item of items) {
                authFetch('/api/data/pantry', {
                    method: 'POST',
                    body: JSON.stringify(item)
                }).catch(e => console.error("Batch add failed for item", item.name));
            }
        }
    };

    const removePantryItem = async (id: number) => {
        setPantry(prev => prev.filter(p => p.id !== id));
        if (isAuthenticated) {
            authFetch(`/api/data/pantry/${id}`, { method: 'DELETE' });
        }
    };

    return (
        <KitchenContext.Provider value={{
            recipes, pantry, mealPlan,
            addRecipe, updateRecipe, deleteRecipe,
            addPantryItem, batchAddPantryItems, removePantryItem,
            setRecipes, setPantry, setMealPlan,
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
