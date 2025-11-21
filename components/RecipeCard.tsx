
import React from 'react';
import { Link } from 'react-router-dom';
import type { Recipe } from '../types';

interface RecipeCardProps {
  recipe: Recipe;
  onToggleFavorite: (id: number) => void;
}

const RecipeCard: React.FC<RecipeCardProps> = ({ recipe, onToggleFavorite }) => {
  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden flex flex-col transition-transform duration-300 hover:scale-105 hover:shadow-xl">
      <div className="p-6 flex-grow relative">
        <button
          onClick={() => onToggleFavorite(recipe.id)}
          className="absolute top-4 right-4 text-2xl z-10"
          title="Toggle Favorite"
        >
          <i className={`fa-heart ${recipe.is_favorite ? 'fas text-red-500' : 'far text-gray-400 hover:text-red-500'}`}></i>
        </button>
        <div className="flex items-center text-yellow-500 mb-2">
          {[...Array(5)].map((_, i) => (
            <i key={i} className={`fa-star ${i < recipe.rating ? 'fas' : 'far'}`}></i>
          ))}
        </div>
        <h3 className="text-xl font-bold mb-2 text-gray-800">{recipe.name}</h3>
        <p className="text-gray-600 text-sm mb-4 line-clamp-3">{recipe.instructions}</p>
      </div>
      <div className="p-6 bg-gray-50 flex justify-between items-center">
         <div className="text-xs text-gray-500">
            <span className="font-semibold">{recipe.calories}</span> cal | <span className="font-semibold">{recipe.meal_type}</span>
        </div>
        <Link
          to={`/recipes/${recipe.id}`}
          className="bg-blue-500 text-white px-4 py-2 rounded-full text-sm font-semibold hover:bg-blue-600 transition-colors"
        >
          View Recipe
        </Link>
      </div>
    </div>
  );
};

export default RecipeCard;
