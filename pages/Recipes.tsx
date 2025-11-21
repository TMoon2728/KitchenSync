
import React, { useState, useMemo } from 'react';
import type { Recipe } from '../types';
import RecipeCard from '../components/RecipeCard';
import Spinner from '../components/Spinner';
import { generateRecipeFromIngredients } from '../services/geminiService';

interface RecipesProps {
  recipes: Recipe[];
  addRecipe: (newRecipe: Omit<Recipe, 'id' | 'is_favorite' | 'rating'>) => void;
  setRecipes: React.Dispatch<React.SetStateAction<Recipe[]>>;
}

const Recipes: React.FC<RecipesProps> = ({ recipes, addRecipe, setRecipes }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [filter, setFilter] = useState<'all' | 'favorites'>('all');
    const [sort, setSort] = useState<'asc' | 'desc' | 'rating'>('asc');
    const [aiRequest, setAiRequest] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleAiQuickAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!aiRequest.trim()) {
            setError("Please describe the recipe you want to create.");
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const result = await generateRecipeFromIngredients(aiRequest);
            if (result && result.name && result.ingredients && result.instructions) {
                addRecipe(result as Omit<Recipe, 'id' | 'is_favorite' | 'rating'>);
                setAiRequest('');
            } else {
                setError("AI failed to generate a valid recipe. Please try a different prompt.");
            }
        } catch (e) {
            setError("An unexpected error occurred during AI generation.");
        } finally {
            setIsLoading(false);
        }
    };
    
    const toggleFavorite = (id: number) => {
        setRecipes(prev =>
            prev.map(recipe =>
                recipe.id === id ? { ...recipe, is_favorite: !recipe.is_favorite } : recipe
            )
        );
    };

    const filteredAndSortedRecipes = useMemo(() => {
        return recipes
            .filter(recipe => {
                if (filter === 'favorites' && !recipe.is_favorite) return false;
                return recipe.name.toLowerCase().includes(searchTerm.toLowerCase());
            })
            .sort((a, b) => {
                if (sort === 'rating') return b.rating - a.rating;
                if (sort === 'asc') return a.name.localeCompare(b.name);
                if (sort === 'desc') return b.name.localeCompare(a.name);
                return 0;
            });
    }, [recipes, searchTerm, filter, sort]);

    const FilterButton: React.FC<{ value: 'all' | 'favorites'; children: React.ReactNode }> = ({ value, children }) => (
        <button onClick={() => setFilter(value)} className={`px-4 py-2 text-sm font-medium rounded-md ${filter === value ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}>{children}</button>
    );
    const SortButton: React.FC<{ value: 'asc' | 'desc' | 'rating'; children: React.ReactNode }> = ({ value, children }) => (
        <button onClick={() => setSort(value)} className={`px-4 py-2 text-sm font-medium rounded-md ${sort === value ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}>{children}</button>
    );

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-800">Recipes</h1>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md">
                <h2 className="text-xl font-bold mb-2 flex items-center"><i className="fas fa-magic mr-2 text-blue-500"></i>AI Quick Add</h2>
                <p className="text-sm text-gray-500 mb-4">Describe a recipe, and the AI will create it for you! (e.g., "Southern BBQ Tacos")</p>
                <form onSubmit={handleAiQuickAdd} className="flex items-start gap-4">
                    <textarea
                        name="ai_request"
                        className="form-input w-full p-2 border border-gray-300 rounded-md flex-grow focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Describe your recipe..."
                        rows={2}
                        value={aiRequest}
                        onChange={(e) => setAiRequest(e.target.value)}
                    />
                    <button type="submit" disabled={isLoading} className="bg-blue-500 text-white px-6 py-2 h-full rounded-md font-semibold hover:bg-blue-600 transition-colors disabled:bg-blue-300">
                        {isLoading ? <Spinner size="sm" /> : 'Generate'}
                    </button>
                </form>
                {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
            </div>

            <div className="bg-white p-4 rounded-lg shadow-md space-y-4 md:space-y-0 md:flex justify-between items-center">
                <input
                    type="search"
                    placeholder="Search your recipes..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full md:w-1/3 form-input p-2 border border-gray-300 rounded-md"
                />
                <div className="flex items-center gap-4">
                    <div className="flex space-x-2 p-1 bg-gray-200 rounded-lg">
                       <FilterButton value="all">All</FilterButton>
                       <FilterButton value="favorites"><i className="fas fa-heart mr-1"></i> Favorites</FilterButton>
                    </div>
                     <div className="flex space-x-2 p-1 bg-gray-200 rounded-lg">
                       <SortButton value="asc">A-Z</SortButton>
                       <SortButton value="desc">Z-A</SortButton>
                       <SortButton value="rating"><i className="fas fa-star mr-1"></i> Rating</SortButton>
                    </div>
                </div>
            </div>

            {filteredAndSortedRecipes.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredAndSortedRecipes.map(recipe => (
                        <RecipeCard key={recipe.id} recipe={recipe} onToggleFavorite={toggleFavorite} />
                    ))}
                </div>
            ) : (
                <div className="text-center py-12 bg-white rounded-lg shadow-md">
                    <p className="text-gray-500">No recipes found. Try a different search or add a new recipe!</p>
                </div>
            )}
        </div>
    );
};

export default Recipes;
