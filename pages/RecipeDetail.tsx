
import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Recipe } from '../types';
import { remixRecipe } from '../services/geminiService';
import Spinner from '../components/Spinner';

interface RecipeDetailProps {
    recipes: Recipe[];
    updateRecipe: (updatedRecipe: Recipe) => void;
}

const RecipeDetail: React.FC<RecipeDetailProps> = ({ recipes, updateRecipe }) => {
    const { id } = useParams();
    const navigate = useNavigate();
    const recipe = useMemo(() => recipes.find(r => r.id === Number(id)), [id, recipes]);

    const [remixType, setRemixType] = useState('Make it Healthier');
    const [remixResult, setRemixResult] = useState<Partial<Recipe> | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!recipe) {
        return <div className="text-center py-12">Recipe not found.</div>;
    }

    const handleRemix = async () => {
        setIsLoading(true);
        setError(null);
        setRemixResult(null);
        try {
            const result = await remixRecipe(recipe, remixType);
            if (result) {
                setRemixResult(result);
            } else {
                setError("Failed to remix recipe. The AI might be busy.");
            }
        } catch (e) {
            setError("An unexpected error occurred.");
        } finally {
            setIsLoading(false);
        }
    };
    
    const saveRemixedRecipe = () => {
        if (!remixResult) return;
        const newRecipe = {
            ...recipe,
            ...remixResult,
            id: Date.now(), // new ID
            name: remixResult.name || `${recipe.name} (Remixed)`,
            is_favorite: false,
            rating: 0
        };
        // This is a simplified add. A real app would use a shared function.
        updateRecipe(newRecipe);
        navigate(`/recipes/${newRecipe.id}`);
        setRemixResult(null);
    };

    const InfoChip: React.FC<{ icon: string, label: string, value: string | number }> = ({ icon, label, value }) => (
        <div className="flex flex-col items-center bg-blue-50 p-3 rounded-lg">
            <i className={`fas ${icon} text-blue-500 text-xl mb-1`}></i>
            <span className="text-sm text-gray-600">{label}</span>
            <span className="font-bold">{value}</span>
        </div>
    );
    
    return (
        <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-xl p-8">
            <div className="flex justify-between items-start">
                <h1 className="text-4xl font-bold text-gray-800">{recipe.name}</h1>
                <div className="flex items-center text-yellow-500 text-2xl">
                    {[...Array(5)].map((_, i) => (
                        <i key={i} className={`fa-star ${i < recipe.rating ? 'fas' : 'far'}`}></i>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 my-6 text-center">
                <InfoChip icon="fa-user-friends" label="Servings" value={recipe.servings} />
                <InfoChip icon="fa-clock" label="Prep Time" value={recipe.prep_time} />
                <InfoChip icon="fa-clock" label="Cook Time" value={recipe.cook_time} />
                <InfoChip icon="fa-fire" label="Calories" value={recipe.calories} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="md:col-span-1">
                    <h2 className="text-2xl font-semibold mb-4 border-b-2 border-blue-500 pb-2">Ingredients</h2>
                    <ul className="space-y-2">
                        {recipe.ingredients.map((ing, i) => (
                            <li key={i} className="flex justify-between">
                                <span>{ing.name}</span>
                                <span className="text-gray-600">{ing.quantity} {ing.unit}</span>
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="md:col-span-2">
                     <h2 className="text-2xl font-semibold mb-4 border-b-2 border-blue-500 pb-2">Instructions</h2>
                     <div className="prose max-w-none text-gray-700">
                        <p style={{whiteSpace: 'pre-wrap'}}>{recipe.instructions}</p>
                     </div>
                </div>
            </div>

            <div className="mt-10 p-6 bg-gray-50 rounded-lg">
                <h3 className="text-xl font-bold mb-2 flex items-center"><i className="fas fa-magic mr-2 text-blue-500"></i>AI Remix</h3>
                <p className="text-sm text-gray-500 mb-4">Let the AI modify this recipe for you!</p>
                <div className="flex items-center gap-4">
                    <select value={remixType} onChange={(e) => setRemixType(e.target.value)} className="form-select w-full md:w-1/3 p-2 border border-gray-300 rounded-md">
                        <option>Make it Healthier</option>
                        <option>Make it Gluten-Free</option>
                        <option>Make it Vegetarian</option>
                        <option>Make it Vegan</option>
                        <option>Double the recipe</option>
                        <option>Halve the recipe</option>
                    </select>
                    <button onClick={handleRemix} disabled={isLoading} className="bg-blue-500 text-white px-6 py-2 rounded-md font-semibold hover:bg-blue-600 transition-colors disabled:bg-blue-300">
                        {isLoading ? <Spinner size="sm"/> : 'Remix!'}
                    </button>
                </div>
                {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
                {remixResult && (
                    <div className="mt-4 p-4 bg-blue-100 border border-blue-300 rounded-md">
                        <h4 className="font-bold text-lg">Remix Result: {remixResult.name}</h4>
                        <div className="text-sm mt-2 max-h-60 overflow-y-auto">
                           <pre className="whitespace-pre-wrap font-sans">{JSON.stringify(remixResult, null, 2)}</pre>
                        </div>
                         <button onClick={saveRemixedRecipe} className="mt-4 bg-green-500 text-white px-4 py-2 rounded-md font-semibold hover:bg-green-600">Save as New Recipe</button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RecipeDetail;
