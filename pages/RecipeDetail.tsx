
import React, { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type { Recipe } from '../types';
import { useKitchen } from '../context/KitchenContext';
import { useUser } from '../context/UserContext';
import { remixRecipe, generateRecipeImage } from '../services/geminiService';
import Spinner from '../components/Spinner';

const RecipeDetail: React.FC = () => {
    const { recipes, updateRecipe } = useKitchen();
    const { userProfile, updateProfile, consumeCredits, getAccessToken } = useUser();

    // Helper adapter for setUserProfile to match old signature if needed, 
    // but better to just use updateProfile directly in the component logic.
    const setUserProfile = (action: React.SetStateAction<typeof userProfile>) => {
        if (typeof action === 'function') {
            updateProfile(action(userProfile));
        } else {
            updateProfile(action);
        }
    };
    const { id } = useParams();
    const navigate = useNavigate();
    const recipe = useMemo(() => recipes.find(r => r.id === Number(id)), [id, recipes]);

    const [remixType, setRemixType] = useState('Make it Healthier');
    const [remixResult, setRemixResult] = useState<Partial<Recipe> | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isImageLoading, setIsImageLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showShareTooltip, setShowShareTooltip] = useState(false);

    if (!recipe) {
        return <div className="text-center py-12">Recipe not found.</div>;
    }

    const handleRemix = async () => {
        if (!consumeCredits(1, true)) return;

        setIsLoading(true);
        setError(null);
        setRemixResult(null);
        try {
            const token = await getAccessToken();
            const result = await remixRecipe(recipe, remixType, token);
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
            rating: 0,
            imageUrl: undefined // Reset image for new recipe
        };
        updateRecipe(newRecipe);
        navigate(`/recipes/${newRecipe.id}`);
        setRemixResult(null);
    };

    const toggleFavorite = () => {
        updateRecipe({ ...recipe, is_favorite: !recipe.is_favorite });
    };

    const handleSetRating = (rating: number) => {
        updateRecipe({ ...recipe, rating });
    };

    const handleGenerateImage = async () => {
        const isFree = !userProfile.hasUsedFreeImageGeneration;

        if (!isFree) {
            if (!consumeCredits(1, true)) return;
        }

        setIsImageLoading(true);
        try {
            const context = recipe.instructions.slice(0, 100);
            const imageUrl = await generateRecipeImage(recipe.name, context);
            if (imageUrl) {
                updateRecipe({ ...recipe, imageUrl });
                if (isFree) {
                    setUserProfile(prev => ({ ...prev, hasUsedFreeImageGeneration: true }));
                }
            } else {
                setError("Could not generate an image. Please try again.");
            }
        } catch (e) {
            setError("Error generating image.");
        } finally {
            setIsImageLoading(false);
        }
    };

    const handleShare = () => {
        const shareText = `Check out this recipe for ${recipe.name}!\n\n${recipe.servings} Servings | ${recipe.calories} kcal\n\nIngredients:\n${recipe.ingredients.map(i => `- ${i.quantity} ${i.unit} ${i.name}`).join('\n')}\n\nSent from KitchenSync`;
        navigator.clipboard.writeText(shareText);
        setShowShareTooltip(true);
        setTimeout(() => setShowShareTooltip(false), 2000);
    };

    const InfoChip: React.FC<{ icon: string, label: string, value: string | number }> = ({ icon, label, value }) => (
        <div className="flex flex-col items-center bg-blue-50 p-3 rounded-lg">
            <i className={`fas ${icon} text-blue-500 text-xl mb-1`}></i>
            <span className="text-sm text-gray-600">{label}</span>
            <span className="font-bold">{value}</span>
        </div>
    );

    return (
        <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-xl overflow-hidden">
            {/* Hero Section with Image */}
            <div className="relative h-64 md:h-96 bg-gray-200 group">
                {recipe.imageUrl ? (
                    <img src={recipe.imageUrl} alt={recipe.name} className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 bg-gray-100">
                        <i className="fas fa-camera text-5xl mb-4"></i>
                        <p>No photo available</p>
                        <button
                            onClick={handleGenerateImage}
                            disabled={isImageLoading}
                            className="mt-4 bg-purple-600 text-white px-6 py-2 rounded-full font-semibold hover:bg-purple-700 transition-all shadow-md z-10 flex items-center"
                        >
                            {isImageLoading ? <><Spinner size="sm" /> Generating...</> : <><i className="fas fa-magic mr-2"></i>Generate Photo
                                <span className={`text-[10px] ml-2 ${!userProfile.hasUsedFreeImageGeneration ? 'bg-green-400 text-white' : 'bg-yellow-400 text-black'} px-1.5 rounded-full font-bold`}>
                                    {!userProfile.hasUsedFreeImageGeneration ? 'FREE' : '1⚡'}
                                </span>
                            </>}
                        </button>
                    </div>
                )}

                {/* Overlay Controls */}
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-t from-black/60 to-transparent flex flex-col justify-end p-8">
                    <div className="flex justify-between items-end">
                        <div>
                            <h1 className="text-4xl font-bold text-white mb-2 shadow-sm">{recipe.name}</h1>
                            <div className="flex items-center space-x-2 text-white/90 mb-2">
                                <span className="bg-blue-600 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">{recipe.meal_type}</span>
                                <span className="flex items-center"><i className="fas fa-clock mr-1"></i> {recipe.prep_time} prep</span>
                                <span className="flex items-center"><i className="fas fa-fire mr-1"></i> {recipe.calories} cal</span>
                            </div>
                            {recipe.source && (
                                <p className="text-gray-300 text-sm italic">Source: {recipe.source}</p>
                            )}
                        </div>
                        <div className="flex flex-col gap-2">
                            <Link to={`/recipes/${recipe.id}/cook`} className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg font-bold shadow-lg transform transition hover:scale-105 flex items-center">
                                <i className="fas fa-play mr-2"></i> Start Cooking
                            </Link>
                        </div>
                    </div>
                </div>

                <div className="absolute top-6 right-6 flex items-center space-x-4">
                    <div className="flex bg-black/40 backdrop-blur-sm rounded-full px-3 py-1">
                        {[...Array(5)].map((_, i) => (
                            <i
                                key={i}
                                className={`cursor-pointer p-1 text-lg ${i < recipe.rating ? 'fas text-yellow-400' : 'far text-gray-300'}`}
                                onClick={() => handleSetRating(i + 1)}
                            ></i>
                        ))}
                    </div>
                    <button
                        onClick={toggleFavorite}
                        className={`w-10 h-10 rounded-full flex items-center justify-center bg-white shadow-md transition-transform hover:scale-110`}
                        title="Toggle Favorite"
                    >
                        <i className={`text-xl ${recipe.is_favorite ? 'fas text-red-500' : 'far text-gray-400'}`}></i>
                    </button>
                    <div className="relative">
                        <button
                            onClick={handleShare}
                            className="w-10 h-10 rounded-full flex items-center justify-center bg-white shadow-md transition-transform hover:scale-110"
                            title="Share Recipe"
                        >
                            <i className="fas fa-share-alt text-xl text-blue-500"></i>
                        </button>
                        {showShareTooltip && (
                            <div className="absolute top-12 right-0 bg-black text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap">
                                Copied to clipboard!
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="p-8">
                {/* Tags */}
                {recipe.tags && recipe.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-6">
                        {recipe.tags.map(tag => (
                            <span key={tag} className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-sm font-semibold">
                                <i className="fas fa-tag mr-1 text-gray-400"></i>{tag}
                            </span>
                        ))}
                    </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 text-center">
                    <InfoChip icon="fa-user-friends" label="Servings" value={recipe.servings} />
                    <InfoChip icon="fa-clock" label="Prep" value={recipe.prep_time} />
                    <InfoChip icon="fa-clock" label="Cook" value={recipe.cook_time} />
                    <InfoChip icon="fa-chart-pie" label="Carbs" value={`${recipe.carbs}g`} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="md:col-span-1 bg-gray-50 p-6 rounded-xl h-fit">
                        <h2 className="text-xl font-bold mb-4 flex items-center text-gray-800"><i className="fas fa-carrot mr-2 text-orange-500"></i>Ingredients</h2>
                        <ul className="space-y-3">
                            {recipe.ingredients.map((ing, i) => (
                                <li key={i} className="flex justify-between items-center border-b border-gray-200 pb-2 last:border-0">
                                    <span className="font-medium text-gray-700">{ing.name}</span>
                                    <span className="text-gray-500 text-sm bg-white px-2 py-1 rounded-md shadow-sm">{ing.quantity} {ing.unit}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="md:col-span-2">
                        <h2 className="text-xl font-bold mb-4 flex items-center text-gray-800"><i className="fas fa-list-ol mr-2 text-blue-500"></i>Instructions</h2>
                        <div className="prose max-w-none text-gray-700 leading-relaxed bg-white p-6 border border-gray-100 rounded-xl shadow-sm">
                            <p style={{ whiteSpace: 'pre-wrap' }}>{recipe.instructions}</p>
                        </div>
                    </div>
                </div>

                <div className="mt-10 p-6 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border border-blue-100">
                    <h3 className="text-xl font-bold mb-2 flex items-center text-gray-800">
                        <i className="fas fa-robot mr-2 text-purple-600"></i>AI Recipe Remix
                        <span className="ml-3 text-[10px] bg-yellow-400 text-black px-2 py-1 rounded-full font-bold">1 Credit</span>
                    </h3>
                    <p className="text-sm text-gray-600 mb-4">Want to shake things up? Let the AI reimagine this dish.</p>
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                        <select value={remixType} onChange={(e) => setRemixType(e.target.value)} className="form-select w-full sm:w-1/3 p-2.5 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500 bg-white text-gray-900">
                            <option>Make it Healthier</option>
                            <option>Make it Gluten-Free</option>
                            <option>Make it Vegetarian</option>
                            <option>Make it Vegan</option>
                            <option>Spicy Kick</option>
                            <option>Kid Friendly</option>
                        </select>
                        <button onClick={handleRemix} disabled={isLoading} className="w-full sm:w-auto bg-purple-600 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-purple-700 transition-colors disabled:bg-purple-300 shadow-md">
                            {isLoading ? <Spinner size="sm" /> : 'Remix It!'}
                        </button>
                    </div>
                    {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
                    {remixResult && (
                        <div className="mt-6 p-6 bg-white rounded-lg shadow-lg border-l-4 border-purple-500 animate-fade-in">
                            <h4 className="font-bold text-lg text-gray-800 mb-2">{remixResult.name}</h4>
                            <div className="text-sm text-gray-600 mb-4 max-h-60 overflow-y-auto p-2 bg-gray-50 rounded">
                                <p className="whitespace-pre-wrap">{JSON.stringify(remixResult, null, 2)}</p>
                            </div>
                            <button onClick={saveRemixedRecipe} className="bg-green-500 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-600 shadow-sm transition-transform active:scale-95">
                                <i className="fas fa-save mr-2"></i>Save as New Recipe
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default RecipeDetail;