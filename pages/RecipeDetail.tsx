import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type { Recipe, Ingredient } from '../types';
import { useKitchen } from '../context/KitchenContext';
import { useUser } from '../context/UserContext';
import { remixRecipe, generateRecipeImage } from '../services/geminiService';
import Spinner from '../components/Spinner';
import { formatQuantity } from '../utils/formatters';
import { standardizeMeasurement, cleanIngredientNameAndUnit } from '../utils/ingredientNormalizer';
import { scoreRecipeAgainstPantry, computeRecipeDiff, checkDietaryConflicts } from '../utils/pantryMatcher';

const RecipeDetail: React.FC = () => {
    const { recipes, pantry, addRecipe, updateRecipe, addManualShoppingItem } = useKitchen();
    const { userProfile, updateProfile, consumeCredits, getAccessToken } = useUser();

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

    const [desiredServings, setDesiredServings] = useState<number>(recipe?.servings || 4);
    const [remixType, setRemixType] = useState('Make it Healthier');
    const [remixResult, setRemixResult] = useState<Partial<Recipe> | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isImageLoading, setIsImageLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showShareTooltip, setShowShareTooltip] = useState(false);
    const [shoppingPushStatus, setShoppingPushStatus] = useState<string | null>(null);

    useEffect(() => {
        if (recipe?.servings) {
            setDesiredServings(recipe.servings);
        }
    }, [recipe?.id, recipe?.servings]);

    const pantryMatch = useMemo(
        () => (recipe ? scoreRecipeAgainstPantry(recipe, pantry) : null),
        [recipe, pantry]
    );

    const dietaryConflicts = useMemo(
        () => (recipe ? checkDietaryConflicts(recipe, userProfile.householdMembers) : []),
        [recipe, userProfile.householdMembers]
    );

    const missingCanonicalKeys = useMemo(() => {
        const set = new Set<string>();
        pantryMatch?.missingIngredients.forEach(ing => {
            set.add(cleanIngredientNameAndUnit(ing.name, ing.unit).canonicalKey);
        });
        return set;
    }, [pantryMatch]);

    const scaleRatio = useMemo(() => {
        if (!recipe || !recipe.servings || recipe.servings <= 0) return 1;
        return Math.max(0.25, desiredServings / recipe.servings);
    }, [recipe, desiredServings]);

    const scaledIngredients = useMemo<Ingredient[]>(() => {
        if (!recipe) return [];
        if (Math.abs(scaleRatio - 1) < 0.01) return recipe.ingredients;
        return recipe.ingredients.map(ing => {
            const rawScaled = (Number(ing.quantity) || 1) * scaleRatio;
            const std = standardizeMeasurement(rawScaled, ing.unit, ing.name, false);
            return {
                ...ing,
                quantity: std.quantity,
                unit: std.unit
            };
        });
    }, [recipe, scaleRatio]);

    const remixDiff = useMemo(() => {
        if (!recipe || !remixResult) return null;
        return computeRecipeDiff(recipe, remixResult);
    }, [recipe, remixResult]);

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
            const familySize = desiredServings || 1 + userProfile.householdMembers.length;
            const result = await remixRecipe(recipe, remixType, token, familySize);
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

    const saveRemixedRecipe = async () => {
        if (!remixResult) return;
        const created = await addRecipe({
            ...recipe,
            ...remixResult,
            name: remixResult.name || `${recipe.name} (Remixed)`,
            imageUrl: undefined
        });
        setRemixResult(null);
        navigate(`/recipes/${created.id}`);
    };

    const overwriteWithRemix = async () => {
        if (!remixResult) return;
        await updateRecipe({
            ...recipe,
            ...remixResult,
            id: recipe.id,
            name: remixResult.name || recipe.name
        } as Recipe);
        setRemixResult(null);
    };

    const handlePushToShoppingList = async (onlyMissing: boolean) => {
        const targetList = onlyMissing
            ? scaledIngredients.filter(ing =>
                  missingCanonicalKeys.has(cleanIngredientNameAndUnit(ing.name, ing.unit).canonicalKey)
              )
            : scaledIngredients;

        if (targetList.length === 0) {
            setShoppingPushStatus('All ingredients are already in your Pantry!');
            setTimeout(() => setShoppingPushStatus(null), 3000);
            return;
        }

        for (const ing of targetList) {
            await addManualShoppingItem({
                name: ing.name,
                quantity: ing.quantity,
                unit: ing.unit || 'each',
                category: ing.category || 'Other'
            });
        }

        setShoppingPushStatus(`Added ${targetList.length} scaled item${targetList.length === 1 ? '' : 's'} to Shopping List!`);
        setTimeout(() => setShoppingPushStatus(null), 3500);
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
            const token = await getAccessToken();
            const context = recipe.instructions.slice(0, 100);
            const imageUrl = await generateRecipeImage(recipe.name, context, token);
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
        const shareText = `Check out this recipe for ${recipe.name}!\n\n${desiredServings} Servings | ${recipe.calories} kcal\n\nIngredients:\n${scaledIngredients.map(i => `- ${formatQuantity(i.quantity)} ${i.unit} ${i.name}`).join('\n')}\n\nSent from KitchenSync`;
        navigator.clipboard.writeText(shareText);
        setShowShareTooltip(true);
        setTimeout(() => setShowShareTooltip(false), 2000);
    };

    const InfoChip: React.FC<{ icon: string; label: string; value: string | number }> = ({ icon, label, value }) => (
        <div className="flex flex-col items-center bg-blue-50 dark:bg-gray-700/50 p-3 rounded-lg border border-blue-100 dark:border-gray-600">
            <i className={`fas ${icon} text-blue-500 dark:text-blue-400 text-xl mb-1`}></i>
            <span className="text-sm text-gray-600 dark:text-gray-300">{label}</span>
            <span className="font-bold text-gray-900 dark:text-gray-100">{value}</span>
        </div>
    );

    const formatDelta = (val: number, suffix = '') => {
        if (!val) return `0${suffix}`;
        return `${val > 0 ? '+' : ''}${Math.round(val)}${suffix}`;
    };

    return (
        <div className="max-w-4xl mx-auto bg-white dark:bg-gray-800 dark:text-gray-100 rounded-2xl shadow-xl overflow-hidden animate-fade-in">
            {/* Hero Section with Image */}
            <div className="relative h-64 md:h-96 bg-gray-200 group">
                {recipe.imageUrl ? (
                    <img src={recipe.imageUrl} alt={recipe.name} className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 bg-gray-100 dark:bg-gray-700">
                        <i className="fas fa-camera text-5xl mb-4"></i>
                        <p>No photo available</p>
                        <button
                            onClick={handleGenerateImage}
                            disabled={isImageLoading}
                            className="mt-4 bg-purple-600 text-white px-6 py-2 rounded-full font-semibold hover:bg-purple-700 transition-all shadow-md z-10 flex items-center"
                        >
                            {isImageLoading ? (
                                <>
                                    <Spinner size="sm" /> Generating...
                                </>
                            ) : (
                                <>
                                    <i className="fas fa-magic mr-2"></i>Generate Photo
                                    <span
                                        className={`text-[10px] ml-2 ${
                                            !userProfile.hasUsedFreeImageGeneration
                                                ? 'bg-green-400 text-white'
                                                : 'bg-yellow-400 text-black'
                                        } px-1.5 rounded-full font-bold`}
                                    >
                                        {!userProfile.hasUsedFreeImageGeneration ? 'FREE' : '1⚡'}
                                    </span>
                                </>
                            )}
                        </button>
                    </div>
                )}

                {/* Overlay Controls */}
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-t from-black/70 to-transparent flex flex-col justify-end p-6 sm:p-8">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
                        <div>
                            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 shadow-sm">{recipe.name}</h1>
                            <div className="flex flex-wrap items-center gap-2 text-white/90 mb-2 text-xs sm:text-sm">
                                <span className="bg-blue-600 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                                    {recipe.meal_type}
                                </span>
                                {pantryMatch && (
                                    <span
                                        className={`px-3 py-1 rounded-full text-xs font-bold ${
                                            pantryMatch.matchPercentage === 100
                                                ? 'bg-emerald-500 text-white'
                                                : 'bg-white/20 backdrop-blur-sm text-white'
                                        }`}
                                    >
                                        <i className="fas fa-box-open mr-1"></i>
                                        {pantryMatch.matchPercentage}% In Pantry
                                    </span>
                                )}
                                <span className="flex items-center">
                                    <i className="fas fa-clock mr-1"></i> {recipe.prep_time} prep
                                </span>
                                <span className="flex items-center">
                                    <i className="fas fa-fire mr-1"></i> {recipe.calories} cal
                                </span>
                            </div>
                            {recipe.source && <p className="text-gray-300 text-xs italic">Source: {recipe.source}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                            <Link
                                to={`/recipes/${recipe.id}/cook`}
                                className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg transform transition hover:scale-105 flex items-center"
                            >
                                <i className="fas fa-play mr-2"></i> Start Cooking
                            </Link>
                        </div>
                    </div>
                </div>

                <div className="absolute top-6 right-6 flex items-center space-x-3">
                    <div className="flex bg-black/40 backdrop-blur-sm rounded-full px-3 py-1" title="Rate this Recipe">
                        {[...Array(5)].map((_, i) => (
                            <i
                                key={i}
                                className={`cursor-pointer p-1 text-lg ${
                                    i < recipe.rating ? 'fas text-yellow-400' : 'far text-gray-300'
                                }`}
                                onClick={() => handleSetRating(i + 1)}
                            ></i>
                        ))}
                    </div>
                    <Link
                        to={`/recipes/${recipe.id}/edit`}
                        className="w-10 h-10 rounded-full flex items-center justify-center bg-white dark:bg-gray-800 dark:text-gray-100 shadow-md transition-transform hover:scale-110"
                        title="Edit Recipe"
                    >
                        <i className="fas fa-pen text-sm text-gray-600 dark:text-gray-200"></i>
                    </Link>
                    <button
                        onClick={toggleFavorite}
                        className="w-10 h-10 rounded-full flex items-center justify-center bg-white dark:bg-gray-800 dark:text-gray-100 shadow-md transition-transform hover:scale-110"
                        title={recipe.is_favorite ? "Remove from Favorites" : "Add to Favorites"}
                    >
                        <i
                            className={`fa-heart text-xl ${
                                recipe.is_favorite ? 'fas text-red-500 animate-pulse-glow' : 'far text-gray-400 hover:text-red-400'
                            }`}
                        ></i>
                    </button>
                    <div className="relative">
                        <button
                            onClick={handleShare}
                            className="w-10 h-10 rounded-full flex items-center justify-center bg-white dark:bg-gray-800 dark:text-gray-100 shadow-md transition-transform hover:scale-110"
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

            <div className="p-6 sm:p-8 space-y-8">
                {/* Household Dietary Conflict Alert (F-03) */}
                {dietaryConflicts.length > 0 && (
                    <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 flex items-start gap-3">
                        <i className="fas fa-triangle-exclamation text-amber-500 mt-0.5 text-lg"></i>
                        <div className="text-xs sm:text-sm text-amber-900 dark:text-amber-100">
                            <strong>Household Dietary Alert:</strong>{' '}
                            {dietaryConflicts.map((c, idx) => (
                                <span key={idx}>
                                    {idx > 0 ? ' • ' : ''}
                                    <strong>{c.memberName}</strong> ({c.restriction}: contains <em>{c.offendingIngredient}</em>)
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* Tags */}
                {recipe.tags && recipe.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {recipe.tags.map(tag => (
                            <span
                                key={tag}
                                className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-3 py-1 rounded-full text-xs sm:text-sm font-semibold"
                            >
                                <i className="fas fa-tag mr-1 text-gray-400"></i>
                                {tag}
                            </span>
                        ))}
                    </div>
                )}

                {/* Nutrition & Timing Summary */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
                    <InfoChip icon="fa-fire" label="Calories" value={`${recipe.calories} kcal`} />
                    <InfoChip icon="fa-dumbbell" label="Protein" value={`${recipe.protein}g`} />
                    <InfoChip icon="fa-chart-pie" label="Carbs" value={`${recipe.carbs}g`} />
                    <InfoChip icon="fa-droplet" label="Fat" value={`${recipe.fat}g`} />
                    <InfoChip icon="fa-clock" label="Cook Time" value={recipe.cook_time} />
                </div>

                {/* Main Recipe Grid: Ingredients (with Live Serving Scaler) + Instructions */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="md:col-span-1 bg-gray-50 dark:bg-gray-700/50 p-6 rounded-2xl h-fit space-y-5 border border-gray-100 dark:border-gray-700">
                        <div className="flex justify-between items-center">
                            <h2 className="text-xl font-bold flex items-center text-gray-800 dark:text-gray-100">
                                <i className="fas fa-carrot mr-2 text-orange-500"></i>Ingredients
                            </h2>
                            {Math.abs(scaleRatio - 1) > 0.01 && (
                                <button
                                    type="button"
                                    onClick={() => setDesiredServings(recipe.servings)}
                                    className="text-[11px] font-bold text-blue-600 hover:underline"
                                >
                                    Reset ({recipe.servings})
                                </button>
                            )}
                        </div>

                        {/* Live Serving Scaler Control (F-02) */}
                        <div className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-600 space-y-2.5">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                    Scale Servings
                                </span>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setDesiredServings(prev => Math.max(1, prev - 1))}
                                        className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-blue-100 text-gray-700 dark:text-gray-200 font-bold flex items-center justify-center"
                                    >
                                        -
                                    </button>
                                    <span className="font-extrabold text-base min-w-[28px] text-center text-blue-600 dark:text-blue-400">
                                        {desiredServings}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setDesiredServings(prev => Math.min(48, prev + 1))}
                                        className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-blue-100 text-gray-700 dark:text-gray-200 font-bold flex items-center justify-center"
                                    >
                                        +
                                    </button>
                                </div>
                            </div>
                            <div className="grid grid-cols-4 gap-1.5">
                                {[0.5, 1, 2, 3].map(mult => {
                                    const target = Math.max(1, Math.round(recipe.servings * mult));
                                    const isActive = desiredServings === target;
                                    return (
                                        <button
                                            key={mult}
                                            type="button"
                                            onClick={() => setDesiredServings(target)}
                                            className={`py-1 rounded-lg text-xs font-bold transition-colors ${
                                                isActive
                                                    ? 'bg-blue-600 text-white shadow-sm'
                                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                                            }`}
                                        >
                                            {mult}x
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <ul className="space-y-2.5">
                            {scaledIngredients.map((ing, i) => {
                                const canonicalKey = cleanIngredientNameAndUnit(ing.name, ing.unit).canonicalKey;
                                const isMissing = missingCanonicalKeys.has(canonicalKey);
                                return (
                                    <li
                                        key={i}
                                        className="flex justify-between items-center border-b border-gray-200 dark:border-gray-700 pb-2 last:border-0 gap-2"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <i
                                                className={`fas ${
                                                    isMissing
                                                        ? 'fa-circle-plus text-amber-500'
                                                        : 'fa-check-circle text-emerald-500'
                                                } text-xs flex-shrink-0`}
                                                title={isMissing ? 'Missing from Pantry' : 'In Pantry'}
                                            ></i>
                                            <span className="font-medium text-sm text-gray-700 dark:text-gray-200 truncate">
                                                {ing.name}
                                            </span>
                                        </div>
                                        <span className="text-gray-600 dark:text-gray-300 text-xs font-bold bg-white dark:bg-gray-800 px-2.5 py-1 rounded-lg shadow-sm whitespace-nowrap">
                                            {formatQuantity(ing.quantity)} {ing.unit}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>

                        {/* 1-Click Send Scaled Ingredients to Shopping List (F-02) */}
                        <div className="pt-2 space-y-2">
                            <button
                                type="button"
                                onClick={() => handlePushToShoppingList(true)}
                                className="w-full py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors shadow-sm flex items-center justify-center gap-1.5"
                            >
                                <i className="fas fa-cart-plus"></i>
                                Add Missing ({pantryMatch?.missingIngredients.length || 0}) to Shopping List
                            </button>
                            <button
                                type="button"
                                onClick={() => handlePushToShoppingList(false)}
                                className="w-full py-2 px-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 hover:border-blue-400 text-gray-700 dark:text-gray-200 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                            >
                                <i className="fas fa-list-check"></i>
                                Add All Scaled Ingredients
                            </button>
                            {shoppingPushStatus && (
                                <p className="text-xs font-bold text-emerald-600 text-center animate-fade-in">
                                    {shoppingPushStatus}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="md:col-span-2">
                        <h2 className="text-xl font-bold mb-4 flex items-center text-gray-800 dark:text-gray-100">
                            <i className="fas fa-list-ol mr-2 text-blue-500"></i>Instructions
                        </h2>
                        <div className="prose max-w-none text-gray-700 dark:text-gray-200 leading-relaxed bg-white dark:bg-gray-800 dark:text-gray-100 p-6 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-sm">
                            <p style={{ whiteSpace: 'pre-wrap' }}>{recipe.instructions}</p>
                        </div>
                    </div>
                </div>

                {/* AI Recipe Remix & Visual Diff Inspector (F-02) */}
                <div className="p-6 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-gray-800 dark:to-gray-800 rounded-2xl border border-blue-100 dark:border-gray-700 shadow-sm space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-xl font-bold flex items-center text-gray-800 dark:text-gray-100">
                            <i className="fas fa-robot mr-2 text-purple-600 dark:text-purple-400"></i>AI Recipe Remix
                            <span className="ml-3 text-[10px] bg-yellow-400 text-black px-2 py-1 rounded-full font-bold">
                                1 Credit
                            </span>
                        </h3>
                        <span className="text-xs text-purple-700 dark:text-purple-300 font-semibold">
                            Target Servings: {desiredServings}
                        </span>
                    </div>

                    <p className="text-sm text-gray-600 dark:text-gray-300">
                        Reimagine this dish with an interactive side-by-side ingredient and nutrition diff before saving.
                    </p>
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                        <select
                            value={remixType}
                            onChange={(e) => setRemixType(e.target.value)}
                            className="form-select w-full sm:w-1/2 p-2.5 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-purple-500 focus:border-purple-500 bg-white dark:bg-gray-800 dark:text-gray-100 text-gray-900 dark:text-gray-50"
                        >
                            <option>Make it Healthier</option>
                            <option>Make it High-Protein</option>
                            <option>Make it Gluten-Free</option>
                            <option>Make it Vegetarian</option>
                            <option>Make it Vegan</option>
                            <option>Make it Dairy-Free</option>
                            <option>Spicy Kick</option>
                            <option>Kid Friendly</option>
                            <option>30-Minute Quick Version</option>
                        </select>
                        <button
                            onClick={handleRemix}
                            disabled={isLoading}
                            className="w-full sm:w-auto bg-purple-600 text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-purple-700 transition-colors disabled:bg-purple-300 shadow-md"
                        >
                            {isLoading ? <Spinner size="sm" /> : 'Remix & Compare Diff'}
                        </button>
                    </div>
                    {error && <p className="text-red-500 text-sm mt-2">{error}</p>}

                    {/* Interactive Remix Diff Inspector Card (replaces raw JSON.stringify) */}
                    {remixResult && remixDiff && (
                        <div className="mt-6 p-6 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-2xl shadow-lg border-l-4 border-purple-500 animate-fade-in space-y-5">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 dark:border-gray-700 pb-4">
                                <div>
                                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                                        Interactive Remix Diff Preview
                                    </span>
                                    <h4 className="font-extrabold text-xl text-gray-800 dark:text-gray-100">
                                        {remixResult.name}
                                    </h4>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setRemixResult(null)}
                                    className="text-xs text-gray-400 hover:text-gray-600 self-end sm:self-center"
                                >
                                    Discard Remix
                                </button>
                            </div>

                            {/* Nutrition Delta Bar */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {[
                                    { label: 'Calories', val: remixResult.calories ?? recipe.calories, delta: remixDiff.calorieDelta, unit: ' kcal' },
                                    { label: 'Protein', val: remixResult.protein ?? recipe.protein, delta: remixDiff.proteinDelta, unit: 'g' },
                                    { label: 'Carbs', val: remixResult.carbs ?? recipe.carbs, delta: remixDiff.carbDelta, unit: 'g' },
                                    { label: 'Fat', val: remixResult.fat ?? recipe.fat, delta: remixDiff.fatDelta, unit: 'g' }
                                ].map(stat => (
                                    <div
                                        key={stat.label}
                                        className="p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700 text-center"
                                    >
                                        <span className="text-xs text-gray-500 dark:text-gray-400 block">{stat.label}</span>
                                        <span className="font-extrabold text-base text-gray-800 dark:text-gray-100">
                                            {stat.val}
                                            {stat.unit}
                                        </span>
                                        <span
                                            className={`block text-[11px] font-bold mt-0.5 ${
                                                stat.delta === 0
                                                    ? 'text-gray-400'
                                                    : stat.delta > 0
                                                    ? 'text-blue-600 dark:text-blue-400'
                                                    : 'text-emerald-600 dark:text-emerald-400'
                                            }`}
                                        >
                                            ({formatDelta(stat.delta, stat.unit)})
                                        </span>
                                    </div>
                                ))}
                            </div>

                            {/* Ingredient Diff Breakdown */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-700/40 border border-gray-100 dark:border-gray-700 space-y-2">
                                    <h5 className="text-xs font-extrabold uppercase tracking-wider text-gray-500 dark:text-gray-300">
                                        Ingredient Changes
                                    </h5>
                                    {remixDiff.addedIngredients.map((ing, idx) => (
                                        <div key={`add-${idx}`} className="text-xs flex items-center justify-between text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 px-2.5 py-1.5 rounded-lg">
                                            <span><strong>+ Added:</strong> {ing.name}</span>
                                            <span className="font-mono">{formatQuantity(ing.quantity)} {ing.unit}</span>
                                        </div>
                                    ))}
                                    {remixDiff.modifiedIngredients.map((mod, idx) => (
                                        <div key={`mod-${idx}`} className="text-xs flex items-center justify-between text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1.5 rounded-lg">
                                            <span><strong>~ Adjusted:</strong> {mod.current.name}</span>
                                            <span className="font-mono">
                                                {formatQuantity(mod.previous.quantity)} {mod.previous.unit} → {formatQuantity(mod.current.quantity)} {mod.current.unit}
                                            </span>
                                        </div>
                                    ))}
                                    {remixDiff.removedIngredients.map((ing, idx) => (
                                        <div key={`rem-${idx}`} className="text-xs flex items-center justify-between text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 px-2.5 py-1.5 rounded-lg line-through">
                                            <span><strong>- Removed:</strong> {ing.name}</span>
                                            <span className="font-mono">{formatQuantity(ing.quantity)} {ing.unit}</span>
                                        </div>
                                    ))}
                                    {remixDiff.addedIngredients.length === 0 &&
                                        remixDiff.modifiedIngredients.length === 0 &&
                                        remixDiff.removedIngredients.length === 0 && (
                                            <p className="text-xs text-gray-500 italic">Same core ingredient list.</p>
                                        )}
                                </div>

                                <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-700/40 border border-gray-100 dark:border-gray-700 max-h-56 overflow-y-auto">
                                    <h5 className="text-xs font-extrabold uppercase tracking-wider text-gray-500 dark:text-gray-300 mb-2">
                                        Remixed Instructions
                                    </h5>
                                    <p className="text-xs text-gray-700 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
                                        {remixResult.instructions}
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-3 pt-2">
                                <button
                                    onClick={saveRemixedRecipe}
                                    className="bg-green-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-green-700 shadow-sm transition-transform active:scale-95 flex items-center gap-2"
                                >
                                    <i className="fas fa-plus-circle"></i> Save as New Recipe
                                </button>
                                <button
                                    onClick={overwriteWithRemix}
                                    className="bg-purple-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-purple-700 shadow-sm transition-transform active:scale-95 flex items-center gap-2"
                                >
                                    <i className="fas fa-rotate"></i> Update Current Recipe
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default RecipeDetail;
