import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { Recipe } from '../types';
import type { PantryMatchResult } from '../utils/pantryMatcher';

interface RecipeCardProps {
    recipe: Recipe;
    onToggleFavorite: (id: number) => void;
    onDelete?: (id: number) => void;
    pantryMatch?: PantryMatchResult;
}

const RecipeCard: React.FC<RecipeCardProps> = ({ recipe, onToggleFavorite, onDelete, pantryMatch }) => {
    const navigate = useNavigate();

    const handleCardClick = () => {
        navigate(`/recipes/${recipe.id}`);
    };

    const matchPct = pantryMatch?.matchPercentage ?? null;
    const missingCount = pantryMatch?.missingIngredients.length ?? 0;

    return (
        <div
            onClick={handleCardClick}
            className="bg-white dark:bg-gray-800 dark:text-gray-100 rounded-xl shadow-md overflow-hidden flex flex-col transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl group border border-gray-100 dark:border-gray-700 relative cursor-pointer"
        >
            <div className="relative h-56 overflow-hidden bg-gray-200">
                {recipe.imageUrl ? (
                    <img
                        src={recipe.imageUrl}
                        alt={recipe.name}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-700 text-gray-300">
                        <i className="fas fa-utensils text-5xl opacity-50"></i>
                    </div>
                )}

                {/* Top-Left Pantry Match & Expiring Badges (F-01 & F-03) */}
                {pantryMatch && pantryMatch.totalCount > 0 && (
                    <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5 items-start">
                        <span
                            className={`text-[11px] font-extrabold px-2.5 py-1 rounded-full shadow-md backdrop-blur-sm flex items-center gap-1 ${
                                matchPct === 100
                                    ? 'bg-emerald-600/95 text-white'
                                    : (matchPct ?? 0) >= 65
                                    ? 'bg-blue-600/90 text-white'
                                    : 'bg-gray-900/75 text-gray-200'
                            }`}
                            title={
                                missingCount === 0
                                    ? 'All ingredients in Pantry!'
                                    : `Missing: ${pantryMatch.missingIngredients.map(i => i.name).join(', ')}`
                            }
                        >
                            <i className={`fas ${matchPct === 100 ? 'fa-check-circle' : 'fa-box-open'}`}></i>
                            {matchPct === 100
                                ? '100% In Pantry'
                                : `${matchPct}% Match (${missingCount} missing)`}
                        </span>
                        {pantryMatch.usesExpiringItem && (
                            <span
                                className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/95 text-white shadow-md flex items-center gap-1"
                                title={`Uses expiring: ${pantryMatch.expiringMatchedNames.join(', ')}`}
                            >
                                <i className="fas fa-clock"></i> Uses Expiring Item
                            </span>
                        )}
                    </div>
                )}

                {/* Overlay Gradient on Hover */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/recipes/${recipe.id}/cook`);
                        }}
                        className="bg-white dark:bg-gray-800 dark:text-gray-100 text-gray-900 dark:text-gray-50 px-6 py-2 rounded-full font-bold transform translate-y-4 group-hover:translate-y-0 transition-all duration-300 hover:bg-green-500 hover:text-white shadow-lg"
                    >
                        <i className="fas fa-play mr-2"></i> Cook Now
                    </button>
                </div>

                <div className="absolute top-3 right-3 z-10 flex gap-2">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/recipes/${recipe.id}/edit`);
                        }}
                        className="bg-white dark:bg-gray-800 dark:text-gray-100/90 backdrop-blur-sm rounded-full w-9 h-9 flex items-center justify-center transition-all hover:bg-blue-50 hover:text-blue-600 shadow-sm hover:scale-110 active:scale-90 text-gray-500"
                        title="Edit Recipe"
                    >
                        <i className="fas fa-pen text-xs"></i>
                    </button>
                    {onDelete && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete(recipe.id);
                            }}
                            className="bg-white dark:bg-gray-800 dark:text-gray-100/90 backdrop-blur-sm rounded-full w-9 h-9 flex items-center justify-center transition-all hover:bg-red-50 hover:text-red-500 shadow-sm hover:scale-110 active:scale-90 text-gray-400"
                            title="Delete Recipe"
                        >
                            <i className="fas fa-trash text-xs"></i>
                        </button>
                    )}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavorite(recipe.id);
                        }}
                        className="bg-white dark:bg-gray-800 dark:text-gray-100/90 backdrop-blur-sm rounded-full w-9 h-9 flex items-center justify-center transition-all hover:bg-white dark:bg-gray-800 dark:text-gray-100 shadow-sm hover:scale-110 active:scale-90"
                        title="Toggle Favorite"
                    >
                        <i
                            className={`fa-heart text-lg ${
                                recipe.is_favorite ? 'fas text-red-500 animate-pulse-glow' : 'far text-gray-400 hover:text-red-400'
                            }`}
                        ></i>
                    </button>
                </div>
            </div>

            <div className="p-5 flex-grow flex flex-col">
                <div className="flex justify-between items-start mb-2">
                    <h3
                        className="text-lg font-bold text-gray-800 dark:text-gray-100 line-clamp-1 group-hover:text-blue-600 transition-colors"
                        title={recipe.name}
                    >
                        {recipe.name}
                    </h3>
                    <div className="flex items-center text-yellow-400 text-xs bg-yellow-50 px-2 py-1 rounded-md border border-yellow-100">
                        <i className="fas fa-star mr-1"></i> <span className="text-yellow-700 font-bold">{recipe.rating}</span>
                    </div>
                </div>

                <div className="flex flex-wrap gap-1 mb-3">
                    {recipe.tags?.slice(0, 3).map(tag => (
                        <span
                            key={tag}
                            className="text-[10px] uppercase font-bold tracking-wider bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-1 rounded-md"
                        >
                            {tag}
                        </span>
                    ))}
                </div>

                <p className="text-gray-500 dark:text-gray-400 text-sm mb-4 line-clamp-2 flex-grow font-light leading-relaxed">
                    {recipe.instructions}
                </p>

                <div className="flex justify-between items-center pt-4 border-t border-gray-100 dark:border-gray-700 mt-auto">
                    <div className="text-xs text-gray-400 flex flex-col">
                        <span className="font-bold text-gray-600 dark:text-gray-300 text-sm">{recipe.calories} kcal</span>
                        <span>{recipe.meal_type}</span>
                    </div>
                    <span className="text-blue-600 text-sm font-semibold hover:text-blue-800 transition-colors flex items-center">
                        Details <i className="fas fa-arrow-right ml-1 transform group-hover:translate-x-1 transition-transform"></i>
                    </span>
                </div>
            </div>
        </div>
    );
};

export default RecipeCard;
