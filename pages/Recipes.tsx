
import React, { useState, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { Recipe, PantryItem } from '../types';
import { useKitchen } from '../context/KitchenContext';
import { useUser } from '../context/UserContext';
import RecipeCard from '../components/RecipeCard';
import Spinner from '../components/Spinner';
import { generateRecipeFromIngredients, generateRecipeFromUrl } from '../services/geminiService';

const Recipes: React.FC = () => {
    const { recipes, pantry, addRecipe, setRecipes } = useKitchen();
    const { consumeCredits, getAccessToken } = useUser();
    const location = useLocation();
    const [searchTerm, setSearchTerm] = useState('');

    // Initialize filter from location state if available (e.g. coming from Dashboard tiles)
    const [filter, setFilter] = useState<'all' | 'favorites' | 'canMake'>(() => {
        const state = location.state as { filter?: 'all' | 'favorites' | 'canMake' } | null;
        return state?.filter || 'all';
    });

    const [sort, setSort] = useState<'asc' | 'desc' | 'rating'>('asc');
    const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

    // State for AI Quick Add
    const [aiRequest, setAiRequest] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);

    // State for Import from Web
    const [importUrl, setImportUrl] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);

    // EASTER EGG: Quantum Physics
    const isQuantumMode = searchTerm.toLowerCase() === 'schrodinger';

    const allTags = useMemo(() => {
        const tags = new Set<string>();
        recipes.forEach(r => r.tags?.forEach(t => tags.add(t)));
        return Array.from(tags).sort();
    }, [recipes]);

    const handleAiQuickAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!aiRequest.trim()) {
            setAddError("Please describe the recipe you want to create.");
            return;
        }

        if (!consumeCredits(1)) return;

        setIsAdding(true);
        setAddError(null);
        setAddError(null);
        try {
            const token = await getAccessToken();
            const result = await generateRecipeFromIngredients(aiRequest, token);
            if (result && result.name && result.ingredients && result.instructions) {
                addRecipe(result as Omit<Recipe, 'id' | 'is_favorite' | 'rating'>);
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
        try {
            new URL(importUrl);
        } catch (_) {
            setImportError("Please enter a valid URL.");
            return;
        }

        if (!consumeCredits(1)) return;

        setIsImporting(true);
        setImportError(null);
        setImportError(null);
        try {
            const token = await getAccessToken();
            const result = await generateRecipeFromUrl(importUrl, token);
            if (result && result.name && result.ingredients && result.instructions) {
                addRecipe(result as Omit<Recipe, 'id' | 'is_favorite' | 'rating'>);
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

    const toggleFavorite = (id: number) => {
        setRecipes(prev =>
            prev.map(recipe =>
                recipe.id === id ? { ...recipe, is_favorite: !recipe.is_favorite } : recipe
            )
        );
    };

    const toggleTag = (tag: string) => {
        setSelectedTags(prev => {
            const next = new Set(prev);
            if (next.has(tag)) next.delete(tag);
            else next.add(tag);
            return next;
        });
    };

    const pantryItemNames = useMemo(() => new Set(pantry.map(item => item.name.toLowerCase())), [pantry]);

    const filteredAndSortedRecipes = useMemo(() => {
        return recipes
            .filter(recipe => {
                if (filter === 'favorites' && !recipe.is_favorite) return false;
                if (filter === 'canMake') {
                    if (!recipe.ingredients.every(ing => pantryItemNames.has(ing.name.toLowerCase()))) {
                        return false;
                    }
                }
                if (selectedTags.size > 0) {
                    if (!recipe.tags || !recipe.tags.some(tag => selectedTags.has(tag))) {
                        return false;
                    }
                }
                // Allow "Schrodinger" to match everything to show effect
                if (searchTerm.toLowerCase() === 'schrodinger') return true;

                return recipe.name.toLowerCase().includes(searchTerm.toLowerCase());
            })
            .sort((a, b) => {
                if (sort === 'rating') return b.rating - a.rating;
                if (sort === 'asc') return a.name.localeCompare(b.name);
                if (sort === 'desc') return b.name.localeCompare(a.name);
                return 0;
            });
    }, [recipes, searchTerm, filter, sort, pantryItemNames, selectedTags]);

    const FilterButton: React.FC<{ value: 'all' | 'favorites' | 'canMake'; children: React.ReactNode }> = ({ value, children }) => (
        <button onClick={() => setFilter(value)} className={`px-4 py-2 text-sm font-medium rounded-full transition-all duration-200 ${filter === value ? 'bg-blue-600 text-white shadow-md transform scale-105' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>{children}</button>
    );
    const SortButton: React.FC<{ value: 'asc' | 'desc' | 'rating'; children: React.ReactNode }> = ({ value, children }) => (
        <button onClick={() => setSort(value)} className={`px-4 py-2 text-sm font-medium rounded-full transition-all duration-200 ${sort === value ? 'bg-blue-600 text-white shadow-md transform scale-105' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>{children}</button>
    );

    return (
        <div className="flex flex-col lg:flex-row gap-8 animate-fade-in">
            {/* Filter Sidebar */}
            <aside className="w-full lg:w-64 flex-shrink-0 space-y-6">
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-bold text-gray-800">Filter By Tag</h2>
                        {selectedTags.size > 0 && <button onClick={() => setSelectedTags(new Set())} className="text-xs text-blue-500 hover:text-blue-700 font-semibold">Clear</button>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {allTags.length > 0 ? allTags.map(tag => (
                            <button
                                key={tag}
                                onClick={() => toggleTag(tag)}
                                className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all duration-200 ${selectedTags.has(tag) ? 'bg-blue-500 border-blue-500 text-white shadow-sm' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}
                            >
                                {tag}
                            </button>
                        )) : <p className="text-sm text-gray-400 italic">No tags available.</p>}
                    </div>
                </div>

                <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-5 rounded-2xl shadow-lg text-white">
                    <h2 className="text-lg font-bold mb-2">Create New</h2>
                    <p className="text-blue-100 text-xs mb-4">Add your own family secret recipes manually.</p>
                    <Link to="/recipes/new" className="block w-full bg-white text-blue-600 px-4 py-2.5 rounded-xl font-bold hover:bg-blue-50 transition-colors text-center shadow-md">
                        <i className="fas fa-plus mr-2"></i> Add Manually
                    </Link>
                </div>
            </aside>

            {/* Main Content */}
            <div className="flex-1 space-y-6">
                {/* AI Tools */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-purple-100 relative overflow-hidden group hover:shadow-md transition-shadow">
                        <div className="absolute top-0 right-0 p-4 opacity-5 transform rotate-12 transition-transform group-hover:scale-110">
                            <i className="fas fa-magic text-8xl text-purple-600"></i>
                        </div>
                        <h2 className="text-xl font-bold mb-2 flex items-center text-gray-800"><i className="fas fa-magic mr-2 text-purple-500"></i>AI Quick Add <span className="text-[10px] bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded ml-2">1 Credit</span></h2>
                        <p className="text-sm text-gray-500 mb-4 relative z-10">Describe a dish and let AI write the recipe.</p>
                        <form onSubmit={handleAiQuickAdd} className="flex items-start gap-3 relative z-10">
                            <textarea
                                name="ai_request"
                                className="form-input w-full p-3 border border-gray-200 rounded-xl flex-grow focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-gray-50 text-gray-900 text-sm resize-none"
                                placeholder="e.g. Spicy Tofu Stir-fry..."
                                rows={1}
                                value={aiRequest}
                                onChange={(e) => setAiRequest(e.target.value)}
                            />
                            <button type="submit" disabled={isAdding} className="bg-purple-600 text-white w-12 h-12 rounded-xl flex items-center justify-center hover:bg-purple-700 transition-all shadow-md hover:scale-105 disabled:bg-purple-300 disabled:transform-none">
                                {isAdding ? <Spinner size="sm" /> : <i className="fas fa-paper-plane"></i>}
                            </button>
                        </form>
                        {addError && <p className="text-red-500 text-xs mt-2 font-medium">{addError}</p>}
                    </div>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-green-100 relative overflow-hidden group hover:shadow-md transition-shadow">
                        <div className="absolute top-0 right-0 p-4 opacity-5 transform -rotate-12 transition-transform group-hover:scale-110">
                            <i className="fas fa-link text-8xl text-green-600"></i>
                        </div>
                        <h2 className="text-xl font-bold mb-2 flex items-center text-gray-800"><i className="fas fa-cloud-download-alt mr-2 text-green-500"></i>Import URL <span className="text-[10px] bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded ml-2">1 Credit</span></h2>
                        <p className="text-sm text-gray-500 mb-4 relative z-10">Paste a URL to extract recipe details.</p>
                        <form onSubmit={handleImportFromUrl} className="flex items-start gap-3 relative z-10">
                            <input
                                type="url"
                                name="import_url"
                                className="form-input w-full p-3 border border-gray-200 rounded-xl flex-grow focus:ring-2 focus:ring-green-500 focus:border-transparent bg-gray-50 text-gray-900 text-sm"
                                placeholder="https://..."
                                value={importUrl}
                                onChange={(e) => setImportUrl(e.target.value)}
                            />
                            <button type="submit" disabled={isImporting} className="bg-green-600 text-white w-12 h-12 rounded-xl flex items-center justify-center hover:bg-green-700 transition-all shadow-md hover:scale-105 disabled:bg-green-300 disabled:transform-none">
                                {isImporting ? <Spinner size="sm" /> : <i className="fas fa-download"></i>}
                            </button>
                        </form>
                        {importError && <p className="text-red-500 text-xs mt-2 font-medium">{importError}</p>}
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 space-y-4 md:space-y-0 md:flex justify-between items-center sticky top-0 z-20 backdrop-blur-md bg-white/90">
                    <div className="relative w-full md:w-1/3">
                        <i className={`fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 ${isQuantumMode ? 'text-blue-500 animate-spin' : 'text-gray-400'}`}></i>
                        <input
                            type="search"
                            placeholder="Search recipes..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full form-input pl-10 pr-4 py-2 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                        />
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex space-x-1 p-1 bg-gray-100 rounded-full">
                            <FilterButton value="all">All</FilterButton>
                            <FilterButton value="favorites"><i className="fas fa-heart mr-1 text-red-400"></i> Favs</FilterButton>
                            <FilterButton value="canMake"><i className="fas fa-utensils mr-1 text-orange-400"></i> Cook Now</FilterButton>
                        </div>
                        <div className="flex space-x-1 p-1 bg-gray-100 rounded-full">
                            <SortButton value="asc">A-Z</SortButton>
                            <SortButton value="rating"><i className="fas fa-star mr-1 text-yellow-400"></i> Top</SortButton>
                        </div>
                    </div>
                </div>

                {filteredAndSortedRecipes.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
                        {filteredAndSortedRecipes.map((recipe, index) => (
                            <div
                                key={recipe.id}
                                className={`animate-slide-up ${isQuantumMode ? 'quantum-flux' : ''}`}
                                style={{ animationDelay: `${index * 50}ms` }}
                            >
                                <RecipeCard recipe={recipe} onToggleFavorite={toggleFavorite} />
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-20 bg-white rounded-3xl shadow-sm border border-dashed border-gray-200">
                        <div className="inline-block p-6 bg-gray-50 rounded-full mb-4">
                            <i className="fas fa-search text-4xl text-gray-300"></i>
                        </div>
                        <h3 className="text-xl font-bold text-gray-800 mb-2">No recipes found</h3>
                        <p className="text-gray-500 max-w-xs mx-auto mb-6">We couldn't find any recipes matching your current filters.</p>
                        <button onClick={() => { setFilter('all'); setSelectedTags(new Set()); setSearchTerm(''); }} className="px-6 py-2 bg-blue-100 text-blue-700 rounded-full font-semibold hover:bg-blue-200 transition-colors">
                            Clear all filters
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Recipes;
