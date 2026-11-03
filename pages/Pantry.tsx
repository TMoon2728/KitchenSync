import React, { useState, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { PantryItem, Recipe, Ingredient } from '../types';
import { useKitchen } from '../context/KitchenContext';
import { useUser } from '../context/UserContext';
import { suggestRecipesFromPantry, generateRecipeFromIngredients } from '../services/geminiService';
import Spinner from '../components/Spinner';
import { formatQuantity, parseQuantity } from '../utils/formatters';
import { inferDefaultExpiryDate, getExpiryStatus } from '../utils/pantryMatcher';
import { resolveCanonicalCategory } from '../utils/ingredientNormalizer';

const INGREDIENT_CATEGORIES = [
    'Produce',
    'Meat',
    'Dairy & Eggs',
    'Bakery',
    'Frozen',
    'Pantry Staples',
    'Beverages',
    'Household',
    'Other'
];

interface StagedPantryItem {
    selected: boolean;
    name: string;
    quantity: number;
    unit: string;
    category: string;
    expiryDate: string;
}

const Pantry: React.FC = () => {
    const { pantry, recipes, addPantryItem, updatePantryItem, removePantryItem, batchAddPantryItems, addRecipe } = useKitchen();
    const { consumeCredits, getAccessToken } = useUser();
    const [view, setView] = useState<'inPantry' | 'all'>('inPantry');
    const [expiryFilter, setExpiryFilter] = useState<'all' | 'expiring'>('all');
    const [isLoading, setIsLoading] = useState(false);
    const [isGeneratingRecipe, setIsGeneratingRecipe] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const [showScanMenu, setShowScanMenu] = useState(false);
    const [scanNotice, setScanNotice] = useState<string | null>(null);
    const pdfInputRef = useRef<HTMLInputElement>(null);
    const receiptCameraInputRef = useRef<HTMLInputElement>(null);
    const fridgeCameraInputRef = useRef<HTMLInputElement>(null);

    // Vision Scan Staging Review Modal State (F-02)
    const [stagedScanItems, setStagedScanItems] = useState<StagedPantryItem[] | null>(null);
    const [stagedScanSource, setStagedScanSource] = useState<'Fridge / Pantry Photo' | 'Receipt Photo' | 'Uploaded Receipt'>('Fridge / Pantry Photo');

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

    // Expiry Radar Summary (F-03)
    const expirySummary = useMemo(() => {
        const expiringItems: Array<{ item: PantryItem; status: ReturnType<typeof getExpiryStatus> }> = [];
        for (const item of pantry) {
            const st = getExpiryStatus(item.expiryDate);
            if (st.status === 'expired' || st.status === 'expiring_soon') {
                expiringItems.push({ item, status: st });
            }
        }
        return expiringItems;
    }, [pantry]);

    const filteredPantry = useMemo(() => {
        if (expiryFilter === 'all') return pantry;
        return pantry.filter(item => {
            const st = getExpiryStatus(item.expiryDate);
            return st.status === 'expired' || st.status === 'expiring_soon';
        });
    }, [pantry, expiryFilter]);

    const openStagingModal = (rawItems: any[], sourceLabel: 'Fridge / Pantry Photo' | 'Receipt Photo' | 'Uploaded Receipt') => {
        const prepared: StagedPantryItem[] = (rawItems || []).map((item: any) => {
            const cat = resolveCanonicalCategory(item.name || '', item.category);
            return {
                selected: true,
                name: item.name || 'Item',
                quantity: Number(item.quantity) || 1,
                unit: item.unit || 'each',
                category: cat,
                expiryDate: item.expiryDate || inferDefaultExpiryDate(cat, item.name || '')
            };
        });
        setStagedScanSource(sourceLabel);
        setStagedScanItems(prepared);
    };

    const handleCommitStagedScan = async () => {
        if (!stagedScanItems) return;
        const toCommit = stagedScanItems
            .filter(i => i.selected && i.name.trim())
            .map(({ selected, ...rest }) => rest);

        if (toCommit.length > 0) {
            await batchAddPantryItems(toCommit);
            setScanNotice(`Added ${toCommit.length} item${toCommit.length === 1 ? '' : 's'} from ${stagedScanSource} to your Pantry!`);
        }
        setStagedScanItems(null);
    };

    const handleReceiptCapture = async (
        e: React.ChangeEvent<HTMLInputElement>,
        mode: 'camera' | 'upload' = 'camera'
    ) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setShowScanMenu(false);
        setIsScanning(true);
        setError(null);
        setScanNotice(null);
        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64 = reader.result as string;
            try {
                const { authFetch } = await import('../utils/api');
                const token = await getAccessToken();
                const res = await authFetch('/api/ai/analyze-receipt', {
                    method: 'POST',
                    body: JSON.stringify({ image: base64, currentShoppingList: [] }),
                    token
                });

                if (res.ok) {
                    const data = await res.json();
                    const newItems = data.result?.extra || [];
                    if (newItems.length > 0) {
                        openStagingModal(
                            newItems,
                            mode === 'upload' || file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf')
                                ? 'Uploaded Receipt'
                                : 'Receipt Photo'
                        );
                    } else {
                        setError("No grocery items identified on that receipt.");
                    }
                } else {
                    const errBody = await res.json().catch(() => ({}));
                    setError(errBody?.error || "Receipt analysis failed. Please make sure the PDF or photo is clear.");
                }
            } catch (err) {
                console.error("Scan failed", err);
                setError("Error analyzing receipt.");
            } finally {
                setIsScanning(false);
                e.target.value = '';
            }
        };
        reader.readAsDataURL(file);
    };

    const handlePantryCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setShowScanMenu(false);
        setIsScanning(true);
        setError(null);
        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64 = reader.result as string;
            try {
                const { scanPantryStorage } = await import('../services/geminiService');
                const token = await getAccessToken();
                const res = await scanPantryStorage(base64, token);

                if (res && res.items && res.items.length > 0) {
                    openStagingModal(res.items, 'Fridge / Pantry Photo');
                } else {
                    setError("Couldn't identify any clear items. Try getting closer!");
                }
            } catch (err) {
                console.error("Pantry Scan failed", err);
                setError("Error scanning pantry.");
            } finally {
                setIsScanning(false);
                e.target.value = '';
            }
        };
        reader.readAsDataURL(file);
    };

    const handleSuggestRecipes = async () => {
        if (!consumeCredits(1, true)) return;

        setIsLoading(true);
        setError(null);
        setSuggestions(null);
        try {
            const token = await getAccessToken();
            const results = await suggestRecipesFromPantry(pantry, recipes, token);
            if (results) {
                const enhancedSuggestions = results.map(suggestion => {
                    const existingRecipe = recipes.find(
                        r => r.name.toLowerCase() === suggestion.recipeName.toLowerCase()
                    );
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

    const handleGenerateFromSuggestion = async (recipeName: string, reason: string) => {
        if (!consumeCredits(1, true)) return;

        setIsGeneratingRecipe(true);
        setError(null);
        try {
            const token = await getAccessToken();
            const prompt = `Recipe Name: ${recipeName}\nContext: ${reason}\n\nPlease generate a full recipe for this dish using primarily ingredients I have on hand.`;
            const result = await generateRecipeFromIngredients(prompt, token);

            if (result && result.name && result.ingredients && result.instructions) {
                const created = await addRecipe(result as Omit<Recipe, 'id' | 'is_favorite' | 'rating'>);
                setSuggestions(prev =>
                    prev
                        ? prev.map(s =>
                              s.recipeName === recipeName ? { ...s, existingRecipeId: created.id } : s
                          )
                        : null
                );
            } else {
                setError("AI failed to generate a full recipe. Please try again.");
            }
        } catch (e) {
            setError("An unexpected error occurred during recipe generation.");
        } finally {
            setIsGeneratingRecipe(false);
        }
    };

    const handleUpdate = (id: number, field: keyof PantryItem, value: string | number) => {
        const existing = pantry.find(item => item.id === id);
        if (existing) {
            updatePantryItem({ ...existing, [field]: value });
        }
    };

    const handleDelete = (id: number) => {
        removePantryItem(id);
    };

    const toggleSelection = (name: string) => {
        setSelectedIngredients(prev => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    };

    const handleBatchAdd = async () => {
        const newItems: Omit<PantryItem, 'id'>[] = [];

        selectedIngredients.forEach(name => {
            const ing = allIngredients.find(i => i.name === name);
            if (ing) {
                const cat = ing.category || 'Other';
                newItems.push({
                    name: ing.name,
                    quantity: 1,
                    unit: ing.unit,
                    category: cat,
                    expiryDate: inferDefaultExpiryDate(cat, ing.name)
                });
            }
        });

        await batchAddPantryItems(newItems);
        setSelectedIngredients(new Set());
        setView('inPantry');
    };

    const handleQuickAdd = (e: React.FormEvent) => {
        e.preventDefault();
        const input = quickAdd.trim();
        if (!input) return;

        const regex = /^(\d+(\.\d+)?)\s*([a-zA-Z]+)?\s+(.*)$/;
        const match = input.match(regex);

        let newItem: Omit<PantryItem, 'id'>;

        if (match) {
            const qty = parseFloat(match[1]);
            const potentialUnit = match[3];
            const potentialName = match[4];

            const commonUnits = [
                'g', 'kg', 'ml', 'l', 'cup', 'cups', 'tbsp', 'tsp', 'oz', 'lb', 'lbs',
                'clove', 'cloves', 'slice', 'slices', 'can', 'cans'
            ];
            let finalUnit = 'each';
            let finalName = potentialName;

            if (potentialUnit && commonUnits.includes(potentialUnit.toLowerCase())) {
                finalUnit = potentialUnit;
            } else if (potentialUnit) {
                finalName = `${potentialUnit} ${potentialName}`;
            }

            const resolvedCat = resolveCanonicalCategory(finalName, 'Other');
            newItem = {
                name: finalName,
                quantity: qty,
                unit: finalUnit,
                category: resolvedCat,
                expiryDate: inferDefaultExpiryDate(resolvedCat, finalName)
            };
        } else {
            const resolvedCat = resolveCanonicalCategory(input, 'Other');
            newItem = {
                name: input,
                quantity: 1,
                unit: 'each',
                category: resolvedCat,
                expiryDate: inferDefaultExpiryDate(resolvedCat, input)
            };
        }

        const existingIng = allIngredients.find(i => i.name.toLowerCase().includes(newItem.name.toLowerCase()));
        if (existingIng && existingIng.category && existingIng.category !== 'Other') {
            newItem.category = existingIng.category;
            newItem.expiryDate = inferDefaultExpiryDate(existingIng.category, newItem.name);
        }

        addPantryItem(newItem);
        setQuickAdd('');
    };

    const ViewButton: React.FC<{ value: 'inPantry' | 'all'; children: React.ReactNode }> = ({ value, children }) => (
        <button
            onClick={() => setView(value)}
            className={`flex-1 md:flex-none px-6 py-2 text-sm font-bold rounded-xl transition-all ${
                view === value
                    ? 'bg-white dark:bg-gray-800 dark:text-gray-100 text-gray-800 dark:text-gray-100 shadow-md'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200/50'
            }`}
        >
            {children}
        </button>
    );

    const QuantityInput: React.FC<{ value: number; onChange: (val: number) => void; className: string }> = ({
        value,
        onChange,
        className
    }) => {
        const [localVal, setLocalVal] = useState(formatQuantity(value));
        const [isFocused, setIsFocused] = useState(false);

        React.useEffect(() => {
            if (!isFocused) setLocalVal(formatQuantity(value));
        }, [value, isFocused]);

        const handleBlur = () => {
            setIsFocused(false);
            onChange(parseQuantity(localVal));
        };

        return (
            <input
                type="text"
                value={isFocused ? localVal : formatQuantity(value)}
                onChange={e => setLocalVal(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={handleBlur}
                className={className}
            />
        );
    };

    return (
        <div className="max-w-5xl mx-auto space-y-6 md:space-y-8 animate-fade-in">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-extrabold text-gray-800 dark:text-gray-100">My Pantry</h1>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        Smart shelf-life tracking & instant vision inventory
                    </p>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
                    {/* Hidden File Inputs for Hamburger Scan/Upload Menu */}
                    <input
                        ref={pdfInputRef}
                        type="file"
                        accept="application/pdf,image/*,.pdf"
                        id="pantry-receipt-pdf-upload"
                        className="hidden"
                        onChange={(e) => handleReceiptCapture(e, 'upload')}
                        disabled={isScanning}
                    />
                    <input
                        ref={receiptCameraInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        id="pantry-receipt-upload"
                        className="hidden"
                        onChange={(e) => handleReceiptCapture(e, 'camera')}
                        disabled={isScanning}
                    />
                    <input
                        ref={fridgeCameraInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        id="pantry-shelf-upload"
                        className="hidden"
                        onChange={handlePantryCapture}
                        disabled={isScanning}
                    />

                    {/* Hamburger Menu for Upload Receipt / Scan Receipt / Scan Fridge */}
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => !isScanning && setShowScanMenu(prev => !prev)}
                            disabled={isScanning}
                            aria-expanded={showScanMenu}
                            aria-label="Scan or Upload Receipt Menu"
                            className={`w-full sm:w-auto justify-center bg-blue-100 dark:bg-gray-800 border border-blue-200 dark:border-gray-700 text-blue-800 dark:text-gray-100 px-4 py-2.5 rounded-xl font-bold hover:bg-blue-200 dark:hover:bg-gray-700 transition-colors flex items-center gap-2.5 shadow-sm ${
                                isScanning ? 'opacity-50 cursor-wait' : ''
                            }`}
                        >
                            {isScanning ? (
                                <i className="fas fa-spinner fa-spin"></i>
                            ) : (
                                <i className="fas fa-bars text-base"></i>
                            )}
                            <span>{isScanning ? 'Scanning...' : 'Scan / Upload'}</span>
                            <i className={`fas fa-chevron-down text-xs transition-transform ${showScanMenu ? 'rotate-180' : ''}`}></i>
                        </button>

                        {showScanMenu && (
                            <>
                                <div
                                    className="fixed inset-0 z-20"
                                    onClick={() => setShowScanMenu(false)}
                                />
                                <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl py-2 z-30 animate-fade-in">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowScanMenu(false);
                                            pdfInputRef.current?.click();
                                        }}
                                        className="w-full text-left cursor-pointer px-4 py-3 hover:bg-blue-50 dark:hover:bg-gray-700/70 flex items-center gap-3 transition-colors"
                                    >
                                        <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 flex items-center justify-center flex-shrink-0">
                                            <i className="fas fa-file-pdf"></i>
                                        </div>
                                        <div>
                                            <span className="font-bold text-sm text-gray-800 dark:text-gray-100 block">
                                                Upload Receipt
                                            </span>
                                            <span className="text-[11px] text-gray-500 dark:text-gray-400 block">
                                                Dillons / digital PDF or image
                                            </span>
                                        </div>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowScanMenu(false);
                                            receiptCameraInputRef.current?.click();
                                        }}
                                        className="w-full text-left cursor-pointer px-4 py-3 hover:bg-blue-50 dark:hover:bg-gray-700/70 flex items-center gap-3 transition-colors"
                                    >
                                        <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 flex items-center justify-center flex-shrink-0">
                                            <i className="fas fa-receipt"></i>
                                        </div>
                                        <div>
                                            <span className="font-bold text-sm text-gray-800 dark:text-gray-100 block">
                                                Scan Receipt
                                            </span>
                                            <span className="text-[11px] text-gray-500 dark:text-gray-400 block">
                                                Take photo of paper receipt
                                            </span>
                                        </div>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowScanMenu(false);
                                            fridgeCameraInputRef.current?.click();
                                        }}
                                        className="w-full text-left cursor-pointer px-4 py-3 hover:bg-blue-50 dark:hover:bg-gray-700/70 flex items-center gap-3 transition-colors"
                                    >
                                        <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 flex items-center justify-center flex-shrink-0">
                                            <i className="fas fa-camera-viewfinder"></i>
                                        </div>
                                        <div>
                                            <span className="font-bold text-sm text-gray-800 dark:text-gray-100 block">
                                                Scan Fridge
                                            </span>
                                            <span className="text-[11px] text-gray-500 dark:text-gray-400 block">
                                                Take photo of fridge or pantry
                                            </span>
                                        </div>
                                    </button>
                                </div>
                            </>
                        )}
                    </div>

                    <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-2xl w-full sm:w-auto mt-2 sm:mt-0">
                        <ViewButton value="inPantry">Inventory</ViewButton>
                        <ViewButton value="all">Add Items</ViewButton>
                    </div>
                </div>
            </div>

            {/* Top-Level Scan Status / Error Banner (Visible immediately on Mobile) */}
            {error && (
                <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-200 text-sm font-bold flex items-center justify-between gap-3 animate-fade-in">
                    <div className="flex items-center gap-2.5">
                        <i className="fas fa-circle-exclamation text-red-500"></i>
                        <span>{error}</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setError(null)}
                        className="text-red-400 hover:text-red-600"
                    >
                        <i className="fas fa-times"></i>
                    </button>
                </div>
            )}

            {scanNotice && (
                <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 text-sm font-bold flex items-center justify-between gap-3 animate-fade-in">
                    <div className="flex items-center gap-2.5">
                        <i className="fas fa-circle-check text-emerald-500"></i>
                        <span>{scanNotice}</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setScanNotice(null)}
                        className="text-emerald-400 hover:text-emerald-600"
                    >
                        <i className="fas fa-times"></i>
                    </button>
                </div>
            )}

            {/* Expiry Radar Alert Banner (F-03) */}
            {expirySummary.length > 0 && (
                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm animate-fade-in">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                            <i className="fas fa-clock"></i>
                        </div>
                        <div>
                            <h3 className="text-sm font-extrabold text-amber-900 dark:text-amber-100">
                                Pantry Expiry Radar: {expirySummary.length} item{expirySummary.length === 1 ? '' : 's'} need attention
                            </h3>
                            <p className="text-xs text-amber-800 dark:text-amber-200 mt-0.5">
                                {expirySummary
                                    .slice(0, 5)
                                    .map(e => `${e.item.name} (${e.status.label})`)
                                    .join(' • ')}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-center">
                        <button
                            type="button"
                            onClick={() => setExpiryFilter(prev => (prev === 'expiring' ? 'all' : 'expiring'))}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                                expiryFilter === 'expiring'
                                    ? 'bg-amber-600 text-white border-amber-600'
                                    : 'bg-white dark:bg-gray-800 text-amber-800 dark:text-amber-200 border-amber-300'
                            }`}
                        >
                            {expiryFilter === 'expiring' ? 'Show All Items' : 'Filter Expiring'}
                        </button>
                        <Link
                            to="/recipes"
                            state={{ filter: 'expiring' }}
                            className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-sm transition-colors flex items-center gap-1.5"
                        >
                            <i className="fas fa-utensils"></i> Cook Expiring Items
                        </Link>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white dark:bg-gray-800 dark:text-gray-100 p-6 rounded-2xl shadow-md border border-gray-100 dark:border-gray-700 min-h-[500px]">
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
                                            placeholder="Quick Add (e.g., '2 cups rice', '5 apples' — auto-sets shelf life)"
                                            className="w-full form-input dark:bg-gray-700 dark:text-white dark:border-gray-600 pl-10 pr-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-gray-50 focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all text-sm"
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        className="bg-green-500 text-white px-6 py-3 rounded-xl font-bold hover:bg-green-600 shadow-md hover:shadow-lg transition-all active:scale-95"
                                    >
                                        Add
                                    </button>
                                </form>
                            </div>
                        )}

                        {view === 'inPantry' &&
                            (filteredPantry.length > 0 ? (
                                <ul className="space-y-3">
                                    {filteredPantry.map((item, index) => {
                                        const exp = getExpiryStatus(item.expiryDate);
                                        return (
                                            <li
                                                key={item.id}
                                                className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center p-4 sm:p-3 bg-white dark:bg-gray-800 dark:text-gray-100 border border-gray-100 dark:border-gray-700 rounded-xl hover:shadow-sm transition-all animate-slide-up"
                                                style={{ animationDelay: `${index * 25}ms` }}
                                            >
                                                <div className="sm:col-span-4 min-w-0">
                                                    <span
                                                        className="font-bold text-gray-800 dark:text-gray-100 block truncate text-base"
                                                        title={item.name}
                                                    >
                                                        {item.name}
                                                    </span>
                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                        <span
                                                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                                                exp.status === 'expired'
                                                                    ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                                                                    : exp.status === 'expiring_soon'
                                                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                                                                    : exp.status === 'fresh'
                                                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                                                    : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                                                            }`}
                                                        >
                                                            {exp.label}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-3 sm:col-span-3 gap-1.5">
                                                    <QuantityInput
                                                        value={item.quantity}
                                                        onChange={val => handleUpdate(item.id, 'quantity', val)}
                                                        className="form-input dark:bg-gray-700 dark:text-white dark:border-gray-600 p-2 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 text-center col-span-1"
                                                    />
                                                    <input
                                                        type="text"
                                                        value={item.unit}
                                                        onChange={e => handleUpdate(item.id, 'unit', e.target.value)}
                                                        className="form-input dark:bg-gray-700 dark:text-white dark:border-gray-600 p-2 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 col-span-2"
                                                    />
                                                </div>

                                                <div className="flex sm:col-span-5 gap-1.5 items-center">
                                                    <input
                                                        type="text"
                                                        list="category-options"
                                                        value={item.category || ''}
                                                        onChange={e => handleUpdate(item.id, 'category', e.target.value)}
                                                        className="form-input dark:bg-gray-700 dark:text-white dark:border-gray-600 p-2 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 w-24"
                                                        placeholder="Category"
                                                    />
                                                    <input
                                                        type="date"
                                                        value={item.expiryDate ? item.expiryDate.slice(0, 10) : ''}
                                                        onChange={e => handleUpdate(item.id, 'expiryDate', e.target.value)}
                                                        className="form-input dark:bg-gray-700 dark:text-white dark:border-gray-600 p-1.5 text-[11px] rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 flex-1 min-w-[110px]"
                                                        title="Expiration Date"
                                                    />
                                                    <button
                                                        onClick={() => handleDelete(item.id)}
                                                        className="text-gray-400 p-2 rounded-lg hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                                                        title="Delete item"
                                                    >
                                                        <i className="fas fa-trash-alt text-xs"></i>
                                                    </button>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            ) : (
                                <div className="text-center py-20 flex flex-col items-center">
                                    <div className="w-32 h-32 bg-gray-50 dark:bg-gray-700/50 rounded-full flex items-center justify-center mb-4">
                                        <i className="fas fa-box-open text-5xl text-gray-300"></i>
                                    </div>
                                    <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">
                                        {expiryFilter === 'expiring' ? 'No expiring items!' : 'Your pantry is empty'}
                                    </h3>
                                    <p className="text-gray-500 dark:text-gray-400">
                                        Use the Quick Add bar or Scan Fridge button to stock up!
                                    </p>
                                </div>
                            ))}

                        {view === 'all' && (
                            <div className="flex flex-col h-full">
                                <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl mb-4 flex justify-between items-center sticky top-0 z-10 shadow-sm">
                                    <span className="text-blue-800 font-bold">{selectedIngredients.size} items selected</span>
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
                                                className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                                                    isInPantry
                                                        ? 'bg-gray-50 dark:bg-gray-700/50 border-gray-100 dark:border-gray-700 opacity-60 cursor-default'
                                                        : isSelected
                                                        ? 'bg-blue-50 border-blue-200 shadow-inner'
                                                        : 'bg-white dark:bg-gray-800 dark:text-gray-100 border-gray-100 dark:border-gray-700 hover:border-blue-300 hover:shadow-sm'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    {!isInPantry && (
                                                        <div
                                                            className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                                                                isSelected
                                                                    ? 'bg-blue-500 border-blue-500'
                                                                    : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100'
                                                            }`}
                                                        >
                                                            {isSelected && <i className="fas fa-check text-white text-xs"></i>}
                                                        </div>
                                                    )}
                                                    {isInPantry && (
                                                        <i className="fas fa-check-circle text-green-500 text-lg"></i>
                                                    )}

                                                    <div className="flex flex-col">
                                                        <span
                                                            className={`font-semibold ${
                                                                isInPantry
                                                                    ? 'text-gray-500 dark:text-gray-400'
                                                                    : 'text-gray-800 dark:text-gray-100'
                                                            }`}
                                                        >
                                                            {ing.name}
                                                        </span>
                                                        <span className="text-xs text-gray-400">
                                                            {ing.category} {ing.unit ? `• ${ing.unit}` : ''}
                                                        </span>
                                                    </div>
                                                </div>

                                                {isInPantry && (
                                                    <span className="text-[10px] font-bold bg-gray-200 text-gray-600 dark:text-gray-300 px-2 py-1 rounded-full uppercase tracking-wide">
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
                            <span className="text-[10px] bg-yellow-400 text-black px-2 py-1 rounded-full font-bold">
                                1 Credit
                            </span>
                        </div>

                        <p className="text-blue-100 text-sm mb-6 relative z-10 leading-relaxed">
                            Staring at random ingredients? Let the AI invent a recipe based on what you have.
                        </p>

                        <button
                            onClick={handleSuggestRecipes}
                            disabled={isLoading || pantry.length === 0}
                            className="w-full bg-white dark:bg-gray-800 dark:text-gray-100 text-blue-600 py-4 rounded-xl font-bold hover:bg-blue-50 transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center group relative z-10"
                        >
                            {isLoading ? (
                                <Spinner size="sm" />
                            ) : (
                                <>
                                    <i className="fas fa-sparkles mr-2 text-yellow-500 group-hover:animate-spin"></i> What Can I Make?
                                </>
                            )}
                        </button>

                        {pantry.length === 0 && (
                            <p className="text-xs text-center text-blue-200 mt-3 relative z-10">
                                Add items to inventory first!
                            </p>
                        )}
                        {error && (
                            <p className="text-red-300 text-xs mt-3 font-semibold relative z-10 bg-red-900/20 p-2 rounded">
                                {error}
                            </p>
                        )}
                    </div>

                    {suggestions && (
                        <div className="space-y-4 animate-slide-up">
                            <h3 className="font-bold text-gray-700 dark:text-gray-200 uppercase text-xs tracking-wider ml-1">
                                Chef's Suggestions
                            </h3>
                            {suggestions.length > 0 ? (
                                suggestions.map((suggestion, index) => (
                                    <div
                                        key={index}
                                        className="bg-white dark:bg-gray-800 dark:text-gray-100 p-5 rounded-2xl shadow-md border-l-4 border-yellow-400 hover:translate-x-1 transition-transform cursor-default"
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            {suggestion.existingRecipeId ? (
                                                <Link
                                                    to={`/recipes/${suggestion.existingRecipeId}`}
                                                    className="font-bold text-blue-600 hover:underline text-lg"
                                                >
                                                    {suggestion.recipeName}
                                                </Link>
                                            ) : (
                                                <span className="font-bold text-gray-800 dark:text-gray-100 text-lg">
                                                    {suggestion.recipeName}
                                                </span>
                                            )}
                                            {suggestion.existingRecipeId && (
                                                <span className="bg-blue-100 text-blue-600 text-[10px] font-bold px-2 py-1 rounded-full uppercase">
                                                    Recipe Book
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed max-h-24 overflow-y-auto custom-scrollbar">
                                            {suggestion.reason}
                                        </p>
                                        {!suggestion.existingRecipeId && (
                                            <button
                                                onClick={() =>
                                                    handleGenerateFromSuggestion(suggestion.recipeName, suggestion.reason)
                                                }
                                                disabled={isGeneratingRecipe}
                                                className="mt-3 w-full bg-blue-50 text-blue-600 text-sm font-bold py-2 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50 flex items-center justify-center border border-blue-200"
                                                title="Costs 1 Credit"
                                            >
                                                {isGeneratingRecipe ? (
                                                    <Spinner size="sm" />
                                                ) : (
                                                    <>
                                                        <i className="fas fa-magic mr-2"></i> Get Custom Recipe
                                                    </>
                                                )}
                                            </button>
                                        )}
                                    </div>
                                ))
                            ) : (
                                <div className="bg-white dark:bg-gray-800 dark:text-gray-100 p-6 rounded-2xl text-center text-gray-500 dark:text-gray-400 shadow-sm">
                                    <p>No specific matches found. Try adding basics like oil, flour, or spices!</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Vision Scan Staging Review Modal (F-02) */}
            {stagedScanItems && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-white dark:bg-gray-800 dark:text-gray-100 rounded-3xl shadow-2xl max-w-2xl w-full p-6 sm:p-8 border border-gray-100 dark:border-gray-700 flex flex-col max-h-[85vh]">
                        <div className="flex justify-between items-start mb-4 pb-3 border-b border-gray-100 dark:border-gray-700">
                            <div>
                                <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                                    {stagedScanSource} • Review Before Adding
                                </span>
                                <h3 className="text-xl font-black text-gray-800 dark:text-gray-100">
                                    Detected {stagedScanItems.length} Pantry Item{stagedScanItems.length === 1 ? '' : 's'}
                                </h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Adjust quantities, units, or shelf-life dates before committing to your inventory.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setStagedScanItems(null)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <i className="fas fa-times text-lg"></i>
                            </button>
                        </div>

                        <div className="overflow-y-auto space-y-2.5 pr-1 flex-grow custom-scrollbar">
                            {stagedScanItems.map((item, idx) => (
                                <div
                                    key={idx}
                                    className={`grid grid-cols-12 gap-2 items-center p-3 rounded-xl border ${
                                        item.selected
                                            ? 'bg-blue-50/40 dark:bg-gray-700/50 border-blue-200 dark:border-gray-600'
                                            : 'bg-gray-50 dark:bg-gray-800 border-gray-200 opacity-50'
                                    }`}
                                >
                                    <div className="col-span-1 flex justify-center">
                                        <input
                                            type="checkbox"
                                            checked={item.selected}
                                            onChange={e =>
                                                setStagedScanItems(prev =>
                                                    prev
                                                        ? prev.map((it, i) =>
                                                              i === idx ? { ...it, selected: e.target.checked } : it
                                                          )
                                                        : null
                                                )
                                            }
                                            className="w-4 h-4 rounded text-blue-600"
                                        />
                                    </div>
                                    <input
                                        type="text"
                                        value={item.name}
                                        onChange={e =>
                                            setStagedScanItems(prev =>
                                                prev
                                                    ? prev.map((it, i) =>
                                                          i === idx ? { ...it, name: e.target.value } : it
                                                      )
                                                    : null
                                            )
                                        }
                                        className="col-span-4 form-input dark:bg-gray-800 dark:text-white p-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-600 font-bold"
                                    />
                                    <input
                                        type="number"
                                        step="any"
                                        value={item.quantity}
                                        onChange={e =>
                                            setStagedScanItems(prev =>
                                                prev
                                                    ? prev.map((it, i) =>
                                                          i === idx
                                                              ? { ...it, quantity: parseFloat(e.target.value) || 1 }
                                                              : it
                                                      )
                                                    : null
                                            )
                                        }
                                        className="col-span-2 form-input dark:bg-gray-800 dark:text-white p-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-600 text-center"
                                    />
                                    <input
                                        type="text"
                                        value={item.unit}
                                        onChange={e =>
                                            setStagedScanItems(prev =>
                                                prev
                                                    ? prev.map((it, i) =>
                                                          i === idx ? { ...it, unit: e.target.value } : it
                                                      )
                                                    : null
                                            )
                                        }
                                        className="col-span-2 form-input dark:bg-gray-800 dark:text-white p-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-600"
                                    />
                                    <input
                                        type="date"
                                        value={item.expiryDate}
                                        onChange={e =>
                                            setStagedScanItems(prev =>
                                                prev
                                                    ? prev.map((it, i) =>
                                                          i === idx ? { ...it, expiryDate: e.target.value } : it
                                                      )
                                                    : null
                                            )
                                        }
                                        className="col-span-3 form-input dark:bg-gray-800 dark:text-white p-1.5 text-[11px] rounded-lg border border-gray-200 dark:border-gray-600"
                                    />
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-gray-100 dark:border-gray-700">
                            <button
                                type="button"
                                onClick={() => setStagedScanItems(null)}
                                className="px-5 py-2.5 rounded-xl text-sm font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleCommitStagedScan}
                                className="px-6 py-2.5 rounded-xl text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-lg"
                            >
                                <i className="fas fa-check mr-2"></i>
                                Add {stagedScanItems.filter(i => i.selected).length} Items to Pantry
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Global Datalist for Categories */}
            <datalist id="category-options">
                {INGREDIENT_CATEGORIES.map(cat => (
                    <option key={cat} value={cat} />
                ))}
            </datalist>
        </div>
    );
};

export default Pantry;
