import React, { useState, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { Recipe } from '../types';
import { useKitchen } from '../context/KitchenContext';
import { useUser } from '../context/UserContext';
import RecipeCard from '../components/RecipeCard';
import Spinner from '../components/Spinner';
import { generateRecipeFromIngredients, generateRecipeFromUrl, scanRecipeFromImage } from '../services/geminiService';
import { scoreRecipeAgainstPantry, type PantryMatchResult } from '../utils/pantryMatcher';
import { formatCookbookMarkdown, downloadTextFile } from '../utils/calendarExport';

const Recipes: React.FC = () => {
    const { recipes, pantry, addRecipe, updateRecipe, deleteRecipe } = useKitchen();
    const { userProfile, consumeCredits, getAccessToken } = useUser();
    const location = useLocation();
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');

    // Initialize filter from location state if available (e.g. coming from Dashboard tiles)
    const [filter, setFilter] = useState<'all' | 'favorites' | 'canMake' | 'expiring'>(() => {
        const state = location.state as { filter?: 'all' | 'favorites' | 'canMake' | 'expiring' } | null;
        return state?.filter || 'all';
    });

    const [sort, setSort] = useState<'asc' | 'desc' | 'rating' | 'match'>('match');
    const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

    // State for AI Quick Add
    const [aiRequest, setAiRequest] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);

    // State for Import from Web
    const [importUrl, setImportUrl] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);

    // State for Cookbook / Recipe Card Photo OCR (F-05)
    const [isScanningPhoto, setIsScanningPhoto] = useState(false);
    const [scanPhotoError, setScanPhotoError] = useState<string | null>(null);

    // State for Cookbook JSON Import (F-06)
    const [cookbookStatus, setCookbookStatus] = useState<string | null>(null);

    // EASTER EGG: Quantum Physics
    const isQuantumMode = searchTerm.toLowerCase() === 'schrodinger';

    const allTags = useMemo(() => {
        const tags = new Set<string>();
        recipes.forEach(r => r.tags?.forEach(t => tags.add(t)));
        return Array.from(tags).sort();
    }, [recipes]);

    // Pre-compute canonical Pantry Match scores for all recipes (F-01 & F-03)
    const pantryMatchesById = useMemo(() => {
        const map = new Map<number, PantryMatchResult>();
        for (const r of recipes) {
            map.set(r.id, scoreRecipeAgainstPantry(r, pantry));
        }
        return map;
    }, [recipes, pantry]);

    const handleAiQuickAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!aiRequest.trim()) {
            setAddError("Please describe the recipe you want to create.");
            return;
        }

        if (!consumeCredits(1, true)) return;

        setIsAdding(true);
        setAddError(null);
        try {
            const token = await getAccessToken();
            const familySize = 1 + userProfile.householdMembers.length;
            const result = await generateRecipeFromIngredients(aiRequest, token, familySize);
            if (result && result.name && result.ingredients && result.instructions) {
                await addRecipe(result as Omit<Recipe, 'id' | 'is_favorite' | 'rating'>);
                setAiRequest('');
            } else {
                setAddError("AI failed to generate a valid recipe. Please try a different prompt.");
            }
        } catch (e) {
            setAddError("An unexpected error occurred during AI generation.");
        } finally {
            setIsAdding(false);
        }
    };

    const handleImportFromUrl = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!importUrl.trim()) {
            setImportError("Please enter a URL.");
            return;
        }
        const urlMatch = importUrl.trim().match(/(https?:\/\/[^\s]+)/);
        const extractedUrl = urlMatch ? urlMatch[1] : importUrl.trim();
        try {
            new URL(extractedUrl);
        } catch (_) {
            setImportError("Please enter a valid URL.");
            return;
        }

        if (!consumeCredits(1, true)) return;

        setIsImporting(true);
        setImportError(null);
        try {
            const token = await getAccessToken();
            const familySize = 1 + userProfile.householdMembers.length;
            const result = await generateRecipeFromUrl(extractedUrl, token, familySize);
            if (result && result.name && result.ingredients && result.instructions) {
                await addRecipe({
                    ...result,
                    source: result.source || extractedUrl
                } as Omit<Recipe, 'id' | 'is_favorite' | 'rating'>);
                setImportUrl('');
            } else {
                setImportError("AI failed to import the recipe from the URL. Please check the link or try again.");
            }
        } catch (e) {
            setImportError("An unexpected error occurred during URL import.");
        } finally {
            setIsImporting(false);
        }
    };

    const handleRecipePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!consumeCredits(1, true)) {
            e.target.value = '';
            return;
        }

        setIsScanningPhoto(true);
        setScanPhotoError(null);
        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64 = reader.result as string;
            try {
                const token = await getAccessToken();
                const familySize = 1 + userProfile.householdMembers.length;
                const result = await scanRecipeFromImage(base64, token, familySize);
                if (result && result.name && result.ingredients && result.instructions) {
                    const created = await addRecipe(result as Omit<Recipe, 'id' | 'is_favorite' | 'rating'>);
                    navigate(`/recipes/${created.id}`);
                } else {
                    setScanPhotoError("Could not extract a clear recipe from that photo. Try a well-lit shot of the page.");
                }
            } catch (err) {
                setScanPhotoError("Failed to scan recipe photo.");
            } finally {
                setIsScanningPhoto(false);
                e.target.value = '';
            }
        };
        reader.readAsDataURL(file);
    };

    const handleImportCookbookJson = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const raw = ev.target?.result as string;
                const parsed = JSON.parse(raw);
                const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.recipes) ? parsed.recipes : []);
                let importedCount = 0;

                for (const item of list) {
                    if (item && item.name && Array.isArray(item.ingredients) && item.instructions) {
                        const { id, ...rest } = item;
                        await addRecipe(rest);
                        importedCount++;
                    }
                }

                setCookbookStatus(`Imported ${importedCount} recipe${importedCount === 1 ? '' : 's'}!`);
                setTimeout(() => setCookbookStatus(null), 3500);
            } catch (_) {
                setCookbookStatus('Invalid Cookbook JSON file.');
                setTimeout(() => setCookbookStatus(null), 3500);
            } finally {
                e.target.value = '';
            }
        };
        reader.readAsText(file);
    };

    // Auto-trigger Import if initialized via Share Target Navigation
    React.useEffect(() => {
        const routerParams = new URLSearchParams(location.search);
        const windowParams = new URLSearchParams(window.location.search);

        let sharedUrl = routerParams.get('importUrl') || windowParams.get('importUrl');

        if (sharedUrl && !isImporting) {
            const urlMatch = sharedUrl.match(/(https?:\/\/[^\s]+)/);
            if (urlMatch) {
                sharedUrl = urlMatch[1];
            }

            setImportUrl(sharedUrl);
            window.history.replaceState({}, '', '/#/recipes');
            navigate('/recipes', { replace: true });

            const autoImport = async () => {
                if (!consumeCredits(1, true)) return;
                setIsImporting(true);
                setImportError(null);
                try {
                    const token = await getAccessToken();
                    const familySize = 1 + userProfile.householdMembers.length;
                    const result = await generateRecipeFromUrl(sharedUrl!, token, familySize);
                    if (result && result.name && result.ingredients && result.instructions) {
                        addRecipe(result as Omit<Recipe, 'id' | 'is_favorite' | 'rating'>);
                        setImportUrl('');
                    } else {
                        setImportError("AI failed to import the recipe from the shared URL.");
                    }
                } catch (e) {
                    setImportError("An unexpected error occurred during automatic URL import.");
                } finally {
                    setIsImporting(false);
                }
            };

            autoImport();
        }
    }, [location.search, navigate, consumeCredits, getAccessToken, addRecipe]);

    const toggleFavorite = (id: number) => {
        const target = recipes.find(r => r.id === id);
        if (target) {
            updateRecipe({ ...target, is_favorite: !target.is_favorite });
        }
    };

    const toggleTag = (tag: string) => {
        setSelectedTags(prev => {
            const next = new Set(prev);
            if (next.has(tag)) next.delete(tag);
            else next.add(tag);
            return next;
        });
    };

    const filteredAndSortedRecipes = useMemo(() => {
        return recipes
            .filter(recipe => {
                const matchInfo = pantryMatchesById.get(recipe.id);
                if (filter === 'favorites' && !recipe.is_favorite) return false;
                if (filter === 'canMake') {
                    if (!matchInfo || matchInfo.matchPercentage < 80) return false;
                }
                if (filter === 'expiring') {
                    if (!matchInfo || !matchInfo.usesExpiringItem) return false;
                }
                if (selectedTags.size > 0) {
                    if (!recipe.tags || !recipe.tags.some(tag => selectedTags.has(tag))) {
                        return false;
                    }
                }
                if (searchTerm.toLowerCase() === 'schrodinger') return true;

                const q = searchTerm.toLowerCase();
                return (
                    recipe.name.toLowerCase().includes(q) ||
                    recipe.ingredients.some(i => i.name.toLowerCase().includes(q))
                );
            })
            .sort((a, b) => {
                if (sort === 'match') {
                    const mA = pantryMatchesById.get(a.id)?.matchPercentage ?? 0;
                    const mB = pantryMatchesById.get(b.id)?.matchPercentage ?? 0;
                    if (mB !== mA) return mB - mA;
                    return b.rating - a.rating;
                }
                if (sort === 'rating') return b.rating - a.rating;
                if (sort === 'asc') return a.name.localeCompare(b.name);
                if (sort === 'desc') return b.name.localeCompare(a.name);
                return 0;
            });
    }, [recipes, searchTerm, filter, sort, pantryMatchesById, selectedTags]);

    const FilterButton: React.FC<{ value: 'all' | 'favorites' | 'canMake' | 'expiring'; children: React.ReactNode }> = ({ value, children }) => (
        <button
            onClick={() => setFilter(value)}
            className={`px-3.5 py-2 text-xs sm:text-sm font-medium rounded-full transition-all duration-200 ${
                filter === value
                    ? 'bg-blue-600 text-white shadow-md transform scale-105'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200'
            }`}
        >
            {children}
        </button>
    );

    const SortButton: React.FC<{ value: 'asc' | 'desc' | 'rating' | 'match'; children: React.ReactNode }> = ({ value, children }) => (
        <button
            onClick={() => setSort(value)}
            className={`px-3.5 py-2 text-xs sm:text-sm font-medium rounded-full transition-all duration-200 ${
                sort === value
                    ? 'bg-blue-600 text-white shadow-md transform scale-105'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200'
            }`}
        >
            {children}
        </button>
    );

    return (
        <div className="flex flex-col lg:flex-row gap-8 animate-fade-in relative block">
            {/* Full-screen Loading Overlay for URL Import or Photo OCR */}
            {(isImporting || isScanningPhoto) && (
                <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-900/80 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-gray-800 dark:text-gray-100 p-8 rounded-3xl shadow-2xl flex flex-col items-center max-w-sm text-center border-t-4 border-green-500 transform transition-all scale-100">
                        <div className="relative mb-6">
                            <div className="absolute inset-0 bg-green-500 rounded-full blur animate-pulse opacity-20"></div>
                            <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center relative border-2 border-green-100">
                                <i className={`fas ${isScanningPhoto ? 'fa-camera' : 'fa-magic'} text-3xl text-green-500 animate-bounce`}></i>
                            </div>
                        </div>
                        <h2 className="text-2xl font-black text-gray-800 dark:text-gray-100 tracking-tight mb-2">
                            {isScanningPhoto ? 'Digitizing Recipe Card...' : 'Scanning Link...'}
                        </h2>
                        <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">
                            {isScanningPhoto
                                ? 'Our AI Sous Chef is reading the photo, normalizing measurements, and scaling ingredients for your household.'
                                : 'Our AI Sous Chef is reading the website, extracting the ingredients, and writing down the steps.'}
                        </p>
                    </div>
                </div>
            )}

            {/* Filter & Portability Sidebar */}
            <aside className="w-full lg:w-64 flex-shrink-0 space-y-6">
                <div className="bg-white dark:bg-gray-800 dark:text-gray-100 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Filter By Tag</h2>
                        {selectedTags.size > 0 && (
                            <button onClick={() => setSelectedTags(new Set())} className="text-xs text-blue-500 hover:text-blue-700 font-semibold">
                                Clear
                            </button>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-2">
                        {allTags.length > 0 ? (
                            allTags.map(tag => (
                                <button
                                    key={tag}
                                    onClick={() => toggleTag(tag)}
                                    className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all duration-200 ${
                                        selectedTags.has(tag)
                                            ? 'bg-blue-500 border-blue-500 text-white shadow-sm'
                                            : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:bg-gray-700'
                                    }`}
                                >
                                    {tag}
                                </button>
                            ))
                        ) : (
                            <p className="text-sm text-gray-400 italic">No tags available.</p>
                        )}
                    </div>
                </div>

                <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-5 rounded-2xl shadow-lg text-white">
                    <h2 className="text-lg font-bold mb-2">Create or Paste</h2>
                    <p className="text-blue-100 text-xs mb-4">Add your own recipes manually or bulk-paste raw text for 0 credits.</p>
                    <Link
                        to="/recipes/new"
                        className="block w-full bg-white dark:bg-gray-800 dark:text-gray-100 text-blue-600 px-4 py-2.5 rounded-xl font-bold hover:bg-blue-50 transition-colors text-center shadow-md"
                    >
                        <i className="fas fa-plus mr-2"></i> Add / Bulk Paste
                    </Link>
                </div>

                {/* Cookbook Backup & Portability (F-06) */}
                <div className="bg-white dark:bg-gray-800 dark:text-gray-100 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-3">
                    <h2 className="text-sm font-extrabold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-2">
                        <i className="fas fa-book text-indigo-500"></i> Cookbook Backup
                    </h2>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={() =>
                                downloadTextFile(
                                    `kitchensync-cookbook-${new Date().toISOString().split('T')[0]}.json`,
                                    JSON.stringify({ exportedAt: new Date().toISOString(), recipes }, null, 2),
                                    'application/json'
                                )
                            }
                            className="px-3 py-2 text-xs font-bold rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors flex items-center justify-center gap-1.5"
                            title="Export full cookbook as JSON backup"
                        >
                            <i className="fas fa-file-code"></i> JSON
                        </button>
                        <button
                            type="button"
                            onClick={() =>
                                downloadTextFile(
                                    `kitchensync-cookbook-${new Date().toISOString().split('T')[0]}.md`,
                                    formatCookbookMarkdown(recipes),
                                    'text/markdown'
                                )
                            }
                            className="px-3 py-2 text-xs font-bold rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors flex items-center justify-center gap-1.5"
                            title="Export printable Markdown cookbook"
                        >
                            <i className="fas fa-file-lines"></i> Markdown
                        </button>
                    </div>
                    <div>
                        <input
                            type="file"
                            id="cookbook-json-import"
                            accept=".json,application/json"
                            className="hidden"
                            onChange={handleImportCookbookJson}
                        />
                        <label
                            htmlFor="cookbook-json-import"
                            className="cursor-pointer w-full px-3 py-2 text-xs font-bold rounded-xl border border-dashed border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-indigo-400 hover:text-indigo-600 transition-colors flex items-center justify-center gap-1.5"
                        >
                            <i className="fas fa-file-import"></i> Import Cookbook JSON
                        </label>
                    </div>
                    {cookbookStatus && (
                        <p className="text-xs font-bold text-emerald-600 text-center animate-fade-in">{cookbookStatus}</p>
                    )}
                </div>
            </aside>

            {/* Main Content */}
            <div className="flex-1 space-y-6">
                {/* Multi-Modal AI Ingestion Bar (AI Quick Add + URL Import + Cookbook/Card Vision OCR) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* 1. AI Quick Add */}
                    <div className="bg-white dark:bg-gray-800 dark:text-gray-100 p-5 rounded-2xl shadow-sm border border-purple-100 dark:border-gray-700 relative overflow-hidden group hover:shadow-md transition-shadow">
                        <h2 className="text-base font-bold mb-1 flex items-center text-gray-800 dark:text-gray-100">
                            <i className="fas fa-magic mr-2 text-purple-500"></i>AI Quick Add
                            <span className="text-[10px] bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded ml-auto">1⚡</span>
                        </h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Describe any dish for your family size.</p>
                        <form onSubmit={handleAiQuickAdd} className="flex items-start gap-2">
                            <input
                                type="text"
                                name="ai_request"
                                className="form-input dark:bg-gray-700 dark:text-white dark:border-gray-600 w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl flex-grow focus:ring-2 focus:ring-purple-500 bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-gray-50 text-xs"
                                placeholder="e.g. Crispy Honey Garlic Salmon"
                                value={aiRequest}
                                onChange={(e) => setAiRequest(e.target.value)}
                            />
                            <button
                                type="submit"
                                disabled={isAdding}
                                className="bg-purple-600 text-white w-10 h-10 rounded-xl flex items-center justify-center hover:bg-purple-700 transition-all shadow-sm flex-shrink-0"
                            >
                                {isAdding ? <Spinner size="sm" /> : <i className="fas fa-paper-plane text-xs"></i>}
                            </button>
                        </form>
                        {addError && <p className="text-red-500 text-xs mt-2 font-medium">{addError}</p>}
                    </div>

                    {/* 2. Import URL */}
                    <div className="bg-white dark:bg-gray-800 dark:text-gray-100 p-5 rounded-2xl shadow-sm border border-green-100 dark:border-gray-700 relative overflow-hidden group hover:shadow-md transition-shadow">
                        <h2 className="text-base font-bold mb-1 flex items-center text-gray-800 dark:text-gray-100">
                            <i className="fas fa-cloud-download-alt mr-2 text-green-500"></i>Import URL
                            <span className="text-[10px] bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded ml-auto">1⚡</span>
                        </h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Paste a blog or Pinterest link.</p>
                        <form onSubmit={handleImportFromUrl} className="flex items-start gap-2">
                            <input
                                type="text"
                                name="import_url"
                                className="form-input dark:bg-gray-700 dark:text-white dark:border-gray-600 w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl flex-grow focus:ring-2 focus:ring-green-500 bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-gray-50 text-xs"
                                placeholder="https://... or Pinterest link"
                                value={importUrl}
                                onChange={(e) => setImportUrl(e.target.value)}
                            />
                            <button
                                type="submit"
                                disabled={isImporting}
                                className="bg-green-600 text-white w-10 h-10 rounded-xl flex items-center justify-center hover:bg-green-700 transition-all shadow-sm flex-shrink-0"
                            >
                                {isImporting ? <Spinner size="sm" /> : <i className="fas fa-download text-xs"></i>}
                            </button>
                        </form>
                        {importError && <p className="text-red-500 text-xs mt-2 font-medium">{importError}</p>}
                    </div>

                    {/* 3. Scan Cookbook / Recipe Card Photo (F-05) */}
                    <div className="bg-white dark:bg-gray-800 dark:text-gray-100 p-5 rounded-2xl shadow-sm border border-amber-100 dark:border-gray-700 relative overflow-hidden group hover:shadow-md transition-shadow flex flex-col justify-between">
                        <div>
                            <h2 className="text-base font-bold mb-1 flex items-center text-gray-800 dark:text-gray-100">
                                <i className="fas fa-camera-retro mr-2 text-amber-500"></i>Scan Recipe Photo
                                <span className="text-[10px] bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded ml-auto">1⚡</span>
                            </h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                                Snap a cookbook page, handwritten index card, or screenshot.
                            </p>
                        </div>
                        <div>
                            <input
                                type="file"
                                id="recipe-photo-ocr"
                                accept="image/*"
                                capture="environment"
                                className="hidden"
                                onChange={handleRecipePhotoUpload}
                                disabled={isScanningPhoto}
                            />
                            <label
                                htmlFor="recipe-photo-ocr"
                                className="cursor-pointer w-full bg-amber-500 hover:bg-amber-600 text-white py-2.5 px-4 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2"
                            >
                                <i className="fas fa-camera"></i>
                                {isScanningPhoto ? 'Scanning Photo...' : 'Upload / Snap Cookbook Page'}
                            </label>
                            {scanPhotoError && <p className="text-red-500 text-xs mt-2 font-medium">{scanPhotoError}</p>}
                        </div>
                    </div>
                </div>

                {/* Search, Filter & Sort Bar */}
                <div className="bg-white dark:bg-gray-800 dark:text-gray-100 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-4 md:space-y-0 md:flex justify-between items-center sticky top-0 z-20 backdrop-blur-md bg-white dark:bg-gray-800 dark:text-gray-100/90">
                    <div className="relative w-full md:w-1/3">
                        <i
                            className={`fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 ${
                                isQuantumMode ? 'text-blue-500 animate-spin' : 'text-gray-400'
                            }`}
                        ></i>
                        <input
                            type="search"
                            placeholder="Search by recipe or ingredient..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full form-input dark:bg-gray-700 dark:text-white dark:border-gray-600 pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow text-sm"
                        />
                    </div>
                    <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                        <div className="flex flex-wrap justify-center sm:justify-start gap-1 p-1 bg-gray-100 dark:bg-gray-700 rounded-2xl w-full sm:w-auto">
                            <FilterButton value="all">All</FilterButton>
                            <FilterButton value="favorites">
                                <i className="fas fa-heart mr-1 text-red-400"></i> Favs
                            </FilterButton>
                            <FilterButton value="canMake">
                                <i className="fas fa-utensils mr-1 text-emerald-400"></i> ≥80% Match
                            </FilterButton>
                            <FilterButton value="expiring">
                                <i className="fas fa-clock mr-1 text-amber-400"></i> Rescue Expiring
                            </FilterButton>
                        </div>
                        <div className="flex flex-wrap justify-center sm:justify-start gap-1 p-1 bg-gray-100 dark:bg-gray-700 rounded-2xl w-full sm:w-auto">
                            <SortButton value="match">
                                <i className="fas fa-box-open mr-1 text-emerald-400"></i> Match %
                            </SortButton>
                            <SortButton value="rating">
                                <i className="fas fa-star mr-1 text-yellow-400"></i> Top
                            </SortButton>
                            <SortButton value="asc">A-Z</SortButton>
                        </div>
                    </div>
                </div>

                {filteredAndSortedRecipes.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
                        {filteredAndSortedRecipes.map((recipe, index) => (
                            <div
                                key={recipe.id}
                                className={`animate-slide-up ${isQuantumMode ? 'quantum-flux' : ''}`}
                                style={{ animationDelay: `${index * 40}ms` }}
                            >
                                <RecipeCard
                                    recipe={recipe}
                                    onToggleFavorite={toggleFavorite}
                                    onDelete={deleteRecipe}
                                    pantryMatch={pantryMatchesById.get(recipe.id)}
                                />
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-20 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-3xl shadow-sm border border-dashed border-gray-200 dark:border-gray-700">
                        <div className="inline-block p-6 bg-gray-50 dark:bg-gray-700/50 rounded-full mb-4">
                            <i className="fas fa-search text-4xl text-gray-300"></i>
                        </div>
                        <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">No recipes found</h3>
                        <p className="text-gray-500 dark:text-gray-400 max-w-xs mx-auto mb-6">
                            We couldn't find any recipes matching your current filters.
                        </p>
                        <button
                            onClick={() => {
                                setFilter('all');
                                setSelectedTags(new Set());
                                setSearchTerm('');
                            }}
                            className="px-6 py-2 bg-blue-100 text-blue-700 rounded-full font-semibold hover:bg-blue-200 transition-colors"
                        >
                            Clear all filters
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Recipes;
