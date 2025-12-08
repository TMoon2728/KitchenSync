
import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { PantryItem, Recipe, Ingredient } from '../types';
import { useKitchen } from '../context/KitchenContext';
import { useUser } from '../context/UserContext';
import { suggestRecipesFromPantry } from '../services/geminiService';
import Spinner from '../components/Spinner';

const INGREDIENT_CATEGORIES = ['Produce', 'Meat', 'Seafood', 'Dairy & Eggs', 'Pantry Staples', 'Spices & Seasonings', 'Bakery', 'Frozen', 'Other'];

const Pantry: React.FC = () => {
    const { pantry, setPantry, recipes } = useKitchen();
    const { consumeCredits } = useUser();
    const [view, setView] = useState<'inPantry' | 'all'>('inPantry');
    const [isLoading, setIsLoading] = useState(false);

    interface Suggestion {
        recipeName: string;
        reason: string;
        existingRecipeId?: number;
    }
    const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [quickAdd, setQuickAdd] = useState('');

    // Multi-select state for 'All Known Items' view
    const [selectedIngredients, setSelectedIngredients] = useState<Set<string>>(new Set());

    const allIngredients = useMemo(() => {
        const ingredientsMap = new Map<string, Omit<Ingredient, 'quantity'>>();
        recipes.forEach(recipe => {
            recipe.ingredients.forEach(ing => {
                const key = ing.name.toLowerCase();
                if (!ingredientsMap.has(key)) {
                    ingredientsMap.set(key, { name: ing.name, unit: ing.unit, category: ing.category || 'Other' });
                }
            });
        });
        return Array.from(ingredientsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [recipes]);

    const pantryMap = useMemo(() => new Set(pantry.map(item => item.name.toLowerCase())), [pantry]);

    const handleSuggestRecipes = async () => {
        if (!consumeCredits(1)) return;

        setIsLoading(true);
        setError(null);
        setSuggestions(null);
        try {
            const results = await suggestRecipesFromPantry(pantry, recipes);
            if (results) {
                const enhancedSuggestions = results.map(suggestion => {
                    const existingRecipe = recipes.find(r => r.name.toLowerCase() === suggestion.recipeName.toLowerCase());
                    return { ...suggestion, existingRecipeId: existingRecipe?.id };
                });
                setSuggestions(enhancedSuggestions);
            } else {
                setError("The AI couldn't find any suggestions. Try adding more items to your pantry.");
            }
        } catch (e) {
            setError("An unexpected error occurred while getting suggestions.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdate = (id: number, field: keyof PantryItem, value: string | number) => {
        setPantry(pantry.map(item => item.id === id ? { ...item, [field]: value } : item));
    };

    const handleDelete = (id: number) => {
        setPantry(pantry.filter(item => item.id !== id));
    };

    // Toggle selection for batch add
    const toggleSelection = (name: string) => {
        setSelectedIngredients(prev => {
            const next = new Set(prev);
            if (next.has(name)) {
                next.delete(name);
            } else {
                next.add(name);
            }
            return next;
        });
    };

    // Add all selected items to pantry
    const handleBatchAdd = () => {
        const newItems: PantryItem[] = [];
        let timestampOffset = 0;

        selectedIngredients.forEach(name => {
            const ing = allIngredients.find(i => i.name === name);
            if (ing) {
                newItems.push({
                    id: Date.now() + timestampOffset++,
                    name: ing.name,
                    quantity: 1, // Default quantity
                    unit: ing.unit,
                    category: ing.category,
                });
            }
        });

        setPantry(prev => [...prev, ...newItems]);
        setSelectedIngredients(new Set());
        setView('inPantry');
    };

    // Parse strings like "2 cups milk" or "5 bananas"
    const handleQuickAdd = (e: React.FormEvent) => {
        e.preventDefault();
        const input = quickAdd.trim();
        if (!input) return;

        // Simple regex to parse quantity, unit, name
        // Matches: "2.5 kg chicken", "2 apples", "milk"
        const regex = /^(\d+(\.\d+)?)\s*([a-zA-Z]+)?\s+(.*)$/;
        const match = input.match(regex);

        let newItem: PantryItem;

        if (match) {
            const qty = parseFloat(match[1]);
            const potentialUnit = match[3]; // e.g., 'cups' or might be part of name if no unit
            const potentialName = match[4];

            // Heuristic: check if potentialUnit is a common unit. If not, treat as part of name.
            const commonUnits = ['g', 'kg', 'ml', 'l', 'cup', 'cups', 'tbsp', 'tsp', 'oz', 'lb', 'lbs', 'clove', 'cloves', 'slice', 'slices'];
            let finalUnit = 'units';
            let finalName = potentialName;

            if (potentialUnit && commonUnits.includes(potentialUnit.toLowerCase())) {
                finalUnit = potentialUnit;
            } else if (potentialUnit) {
                // If it's not a known unit, assume user typed "2 big apples" -> qty=2 unit=unknown name=big apples
                // Or just default to unit='units' and combine
                finalName = `${potentialUnit} ${potentialName}`;
            }

            newItem = {
                id: Date.now(),
                name: finalName,
                quantity: qty,
                unit: finalUnit,
                category: 'Other' // Default
            };
        } else {
            // No number found, assume 1 unit of item
            newItem = {
                id: Date.now(),
                name: input,
                quantity: 1,
                unit: 'units',
                category: 'Other'
            };
        }

        // Try to guess category from existing ingredients
        const existingIng = allIngredients.find(i => i.name.toLowerCase().includes(newItem.name.toLowerCase()));
        if (existingIng) newItem.category = existingIng.category;

        setPantry(prev => [...prev, newItem]);
        setQuickAdd('');
    };

    const ViewButton: React.FC<{ value: 'inPantry' | 'all'; children: React.ReactNode }> = ({ value, children }) => (
        <button onClick={() => setView(value)} className={`flex-1 md:flex-none px-6 py-2 text-sm font-bold rounded-xl transition-all ${view === value ? 'bg-white text-gray-800 shadow-md' : 'text-gray-500 hover:bg-gray-200/50'}`}>{children}</button>
    );

    return (
        <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <h1 className="text-3xl font-extrabold text-gray-800">My Pantry</h1>
                <div className="flex bg-gray-100 p-1 rounded-2xl w-full md:w-auto">
                    <ViewButton value="inPantry">Inventory</ViewButton>
                    <ViewButton value="all">Add Items</ViewButton>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white p-6 rounded-2xl shadow-md border border-gray-100 min-h-[500px]">
                        {/* Quick Add Bar */}
                        {view === 'inPantry' && (
                            <div className="mb-6 relative">
                                <form onSubmit={handleQuickAdd} className="flex gap-2">
                                    <div className="relative flex-grow">
                                        <i className="fas fa-plus absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                                        <input
                                            type="text"
                                            value={quickAdd}
                                            onChange={(e) => setQuickAdd(e.target.value)}
                                            placeholder="Quick Add (e.g., '2 cups rice', '5 apples')"
                                            className="w-full form-input pl-10 pr-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                                        />
                                    </div>
                                    <button type="submit" className="bg-green-500 text-white px-6 py-3 rounded-xl font-bold hover:bg-green-600 shadow-md hover:shadow-lg transition-all active:scale-95">
                                        Add
                                    </button>
                                </form>
                            </div>
                        )}

                        {view === 'inPantry' && (
                            pantry.length > 0 ? (
                                <ul className="space-y-3">
                                    {pantry.map((item, index) => (
                                        <li key={item.id} className="grid grid-cols-12 gap-3 items-center p-3 bg-white border border-gray-100 rounded-xl hover:shadow-sm transition-all animate-slide-up" style={{ animationDelay: `${index * 30}ms` }}>
                                            <span className="font-bold text-gray-700 col-span-4 truncate" title={item.name}>{item.name}</span>
                                            <input type="number" value={item.quantity} onChange={e => handleUpdate(item.id, 'quantity', parseFloat(e.target.value))} className="form-input p-2 text-sm rounded-lg border border-gray-200 col-span-2 bg-gray-50 text-gray-900 text-center" />
                                            <input type="text" value={item.unit} onChange={e => handleUpdate(item.id, 'unit', e.target.value)} className="form-input p-2 text-sm rounded-lg border border-gray-200 col-span-2 bg-gray-50 text-gray-900" />

                                            <input
                                                type="text"
                                                list="category-options"
                                                value={item.category || ''}
                                                onChange={e => handleUpdate(item.id, 'category', e.target.value)}
                                                className="form-input p-2 text-xs rounded-lg border border-gray-200 col-span-3 bg-gray-50 text-gray-900"
                                                placeholder="Category"
                                            />

                                            <button onClick={() => handleDelete(item.id)} className="text-gray-300 hover:text-red-500 col-span-1 text-center transition-colors"><i className="fas fa-trash-alt"></i></button>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="text-center py-20 flex flex-col items-center">
                                    <div className="w-32 h-32 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                                        <i className="fas fa-box-open text-5xl text-gray-300"></i>
                                    </div>
                                    <h3 className="text-xl font-bold text-gray-800">Your pantry is empty</h3>
                                    <p className="text-gray-500">Use the Quick Add bar to stock up!</p>
                                </div>
                            )
                        )}

                        {view === 'all' && (
                            <div className="flex flex-col h-full">
                                {/* Batch Action Bar */}
                                <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl mb-4 flex justify-between items-center sticky top-0 z-10 shadow-sm">
                                    <span className="text-blue-800 font-bold">
                                        {selectedIngredients.size} items selected
                                    </span>
                                    <button
                                        onClick={handleBatchAdd}
                                        disabled={selectedIngredients.size === 0}
                                        className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg active:scale-95"
                                    >
                                        <i className="fas fa-plus mr-2"></i>Add to Pantry
                                    </button>
                                </div>

                                <ul className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
                                    {allIngredients.map(ing => {
                                        const isSelected = selectedIngredients.has(ing.name);
                                        const isInPantry = pantryMap.has(ing.name.toLowerCase());

                                        return (
                                            <li
                                                key={ing.name}
                                                onClick={() => !isInPantry && toggleSelection(ing.name)}
                                                className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${isInPantry
                                                        ? 'bg-gray-50 border-gray-100 opacity-60 cursor-default'
                                                        : isSelected
                                                            ? 'bg-blue-50 border-blue-200 shadow-inner'
                                                            : 'bg-white border-gray-100 hover:border-blue-300 hover:shadow-sm'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    {!isInPantry && (
                                                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300 bg-white'}`}>
                                                            {isSelected && <i className="fas fa-check text-white text-xs"></i>}
                                                        </div>
                                                    )}
                                                    {isInPantry && <i className="fas fa-check-circle text-green-500 text-lg"></i>}

                                                    <div className="flex flex-col">
                                                        <span className={`font-semibold ${isInPantry ? 'text-gray-500' : 'text-gray-800'}`}>
                                                            {ing.name}
                                                        </span>
                                                        <span className="text-xs text-gray-400">
                                                            {ing.category} {ing.unit ? `• ${ing.unit}` : ''}
                                                        </span>
                                                    </div>
                                                </div>

                                                {isInPantry && (
                                                    <span className="text-[10px] font-bold bg-gray-200 text-gray-600 px-2 py-1 rounded-full uppercase tracking-wide">
                                                        Owned
                                                    </span>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>

                {/* Magic Side Panel */}
                <div className="space-y-6">
                    <div className="bg-gradient-to-b from-blue-600 to-indigo-700 p-6 rounded-2xl shadow-xl text-white relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10 transform rotate-12">
                            <i className="fas fa-hat-wizard text-9xl"></i>
                        </div>

                        <div className="flex justify-between items-center mb-2 relative z-10">
                            <h2 className="text-2xl font-extrabold">Magic Chef</h2>
                            <span className="text-[10px] bg-yellow-400 text-black px-2 py-1 rounded-full font-bold">1 Credit</span>
                        </div>

                        <p className="text-blue-100 text-sm mb-6 relative z-10 leading-relaxed">Staring at random ingredients? Let the AI invent a recipe based on what you have.</p>

                        <button
                            onClick={handleSuggestRecipes}
                            disabled={isLoading || pantry.length === 0}
                            className="w-full bg-white text-blue-600 py-4 rounded-xl font-bold hover:bg-blue-50 transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center group relative z-10"
                        >
                            {isLoading ? <Spinner size="sm" /> : <><i className="fas fa-sparkles mr-2 text-yellow-500 group-hover:animate-spin"></i> What Can I Make?</>}
                        </button>

                        {pantry.length === 0 && <p className="text-xs text-center text-blue-200 mt-3 relative z-10">Add items to inventory first!</p>}
                        {error && <p className="text-red-300 text-xs mt-3 font-semibold relative z-10 bg-red-900/20 p-2 rounded">{error}</p>}
                    </div>

                    {suggestions && (
                        <div className="space-y-4 animate-slide-up">
                            <h3 className="font-bold text-gray-700 uppercase text-xs tracking-wider ml-1">Chef's Suggestions</h3>
                            {suggestions.length > 0 ? (
                                suggestions.map((suggestion, index) => (
                                    <div key={index} className="bg-white p-5 rounded-2xl shadow-md border-l-4 border-yellow-400 hover:translate-x-1 transition-transform cursor-default">
                                        <div className="flex justify-between items-start mb-2">
                                            {suggestion.existingRecipeId ? (
                                                <Link to={`/recipes/${suggestion.existingRecipeId}`} className="font-bold text-blue-600 hover:underline text-lg">{suggestion.recipeName}</Link>
                                            ) : (
                                                <span className="font-bold text-gray-800 text-lg">{suggestion.recipeName}</span>
                                            )}
                                            {suggestion.existingRecipeId && <span className="bg-blue-100 text-blue-600 text-[10px] font-bold px-2 py-1 rounded-full uppercase">Recipe Book</span>}
                                        </div>
                                        <p className="text-sm text-gray-600 leading-relaxed">{suggestion.reason}</p>
                                    </div>
                                ))
                            ) : (
                                <div className="bg-white p-6 rounded-2xl text-center text-gray-500 shadow-sm">
                                    <p>No specific matches found. Try adding basics like oil, flour, or spices!</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Global Datalist for Categories */}
            <datalist id="category-options">
                {INGREDIENT_CATEGORIES.map(cat => <option key={cat} value={cat} />)}
            </datalist>
        </div>
    );
};

export default Pantry;
