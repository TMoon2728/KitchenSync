
import React from 'react';
import { Link } from 'react-router-dom';
import type { Recipe } from '../types';

interface RecipeCardProps {
  recipe: Recipe;
  onToggleFavorite: (id: number) => void;
}

const RecipeCard: React.FC<RecipeCardProps> = ({ recipe, onToggleFavorite }) => {
  return (
    <div className="bg-white rounded-xl shadow-md overflow-hidden flex flex-col transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl group border border-gray-100 relative">
      <div className="relative h-56 overflow-hidden bg-gray-200">
          {recipe.imageUrl ? (
              <img src={recipe.imageUrl} alt={recipe.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
          ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-300">
                  <i className="fas fa-utensils text-5xl opacity-50"></i>
              </div>
          )}
           
           {/* Overlay Gradient on Hover */}
           <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                <Link to={`/recipes/${recipe.id}/cook`} className="bg-white text-gray-900 px-6 py-2 rounded-full font-bold transform translate-y-4 group-hover:translate-y-0 transition-all duration-300 hover:bg-green-500 hover:text-white shadow-lg">
                    <i className="fas fa-play mr-2"></i> Cook Now
                </Link>
           </div>

           <button
            onClick={(e) => { e.preventDefault(); onToggleFavorite(recipe.id); }}
            className="absolute top-3 right-3 z-10 bg-white/90 backdrop-blur-sm rounded-full w-10 h-10 flex items-center justify-center transition-all hover:bg-white shadow-sm hover:scale-110 active:scale-90"
            title="Toggle Favorite"
            >
            <i className={`text-xl ${recipe.is_favorite ? 'fas text-red-500 animate-pulse-glow' : 'far text-gray-400 hover:text-red-400'}`}></i>
            </button>
      </div>
      
      <div className="p-5 flex-grow flex flex-col">
        <div className="flex justify-between items-start mb-2">
            <h3 className="text-lg font-bold text-gray-800 line-clamp-1 group-hover:text-blue-600 transition-colors" title={recipe.name}>{recipe.name}</h3>
            <div className="flex items-center text-yellow-400 text-xs bg-yellow-50 px-2 py-1 rounded-md border border-yellow-100">
                <i className="fas fa-star mr-1"></i> <span className="text-yellow-700 font-bold">{recipe.rating}</span>
            </div>
        </div>
        
        <div className="flex flex-wrap gap-1 mb-3">
            {recipe.tags?.slice(0, 3).map(tag => (
                <span key={tag} className="text-[10px] uppercase font-bold tracking-wider bg-gray-100 text-gray-600 px-2 py-1 rounded-md">{tag}</span>
            ))}
        </div>

        <p className="text-gray-500 text-sm mb-4 line-clamp-2 flex-grow font-light leading-relaxed">{recipe.instructions}</p>
        
        <div className="flex justify-between items-center pt-4 border-t border-gray-100 mt-auto">
             <div className="text-xs text-gray-400 flex flex-col">
                <span className="font-bold text-gray-600 text-sm">{recipe.calories} kcal</span>
                <span>{recipe.meal_type}</span>
            </div>
            <Link
                to={`/recipes/${recipe.id}`}
                className="text-blue-600 text-sm font-semibold hover:text-blue-800 transition-colors flex items-center"
            >
                Details <i className="fas fa-arrow-right ml-1 transform group-hover:translate-x-1 transition-transform"></i>
            </Link>
        </div>
      </div>
    </div>
  );
};

export default RecipeCard;
