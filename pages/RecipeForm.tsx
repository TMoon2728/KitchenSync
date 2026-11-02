import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import type { Recipe, Ingredient } from '../types';
import { useKitchen } from '../context/KitchenContext';
import { useUser } from '../context/UserContext';
import { parseRawRecipeText } from '../utils/bulkRecipeParser';
import { scanRecipeFromImage } from '../services/geminiService';
import Spinner from '../components/Spinner';

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

const RecipeForm: React.FC = () => {
    const { recipes, addRecipe, updateRecipe } = useKitchen();
    const { userProfile, consumeCredits, getAccessToken } = useUser();
    const navigate = useNavigate();
    const { id } = useParams<{ id?: string }>();
    const editingRecipe = id ? recipes.find(r => r.id === Number(id)) : undefined;
    const isEditMode = Boolean(editingRecipe);

    const [recipe, setRecipe] = useState<Omit<Recipe, 'id' | 'is_favorite' | 'rating'>>({
        name: '',
        servings: 1 + (userProfile.householdMembers?.length || 0),
        prep_time: '15 mins',
        cook_time: '30 mins',
        calories: 400,
        protein: 20,
        fat: 15,
        carbs: 40,
        ingredients: [{ name: '', quantity: 1, unit: 'each', category: 'Pantry Staples' }],
        instructions: '',
        meal_type: 'Main Course',
        tags: [],
        source: '',
        imageUrl: undefined
    });

    const [tagInput, setTagInput] = useState('');
    const [showBulkPaste, setShowBulkPaste] = useState(false);
    const [rawPasteText, setRawPasteText] = useState('');
    const [isScanningPhoto, setIsScanningPhoto] = useState(false);
    const [scanError, setScanError] = useState<string | null>(null);

    useEffect(() => {
        if (editingRecipe) {
            setRecipe({
                name: editingRecipe.name,
                servings: editingRecipe.servings,
                prep_time: editingRecipe.prep_time,
                cook_time: editingRecipe.cook_time,
                calories: editingRecipe.calories,
                protein: editingRecipe.protein,
                fat: editingRecipe.fat,
                carbs: editingRecipe.carbs,
                ingredients:
                    editingRecipe.ingredients.length > 0
                        ? editingRecipe.ingredients.map(i => ({ ...i }))
                        : [{ name: '', quantity: 1, unit: 'each', category: 'Pantry Staples' }],
                instructions: editingRecipe.instructions,
                meal_type: editingRecipe.meal_type,
                tags: editingRecipe.tags || [],
                source: editingRecipe.source || '',
                imageUrl: editingRecipe.imageUrl
            });
        }
    }, [editingRecipe]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setRecipe(prev => ({
            ...prev,
            [name]: name.match(/calories|protein|fat|carbs|servings/) ? parseFloat(value) || 0 : value
        }));
    };

    const handleIngredientChange = (index: number, field: keyof Ingredient, value: string | number) => {
        const newIngredients = [...recipe.ingredients];
        (newIngredients[index] as any)[field] = value;
        setRecipe(prev => ({ ...prev, ingredients: newIngredients }));
    };

    const addIngredient = () => {
        setRecipe(prev => ({
            ...prev,
            ingredients: [...prev.ingredients, { name: '', quantity: 1, unit: 'each', category: 'Pantry Staples' }]
        }));
    };

    const removeIngredient = (index: number) => {
        const newIngredients = recipe.ingredients.filter((_, i) => i !== index);
        setRecipe(prev => ({ ...prev, ingredients: newIngredients }));
    };

    const handleAddTag = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const tag = tagInput.trim();
            if (tag && !recipe.tags?.includes(tag)) {
                setRecipe(prev => ({ ...prev, tags: [...(prev.tags || []), tag] }));
                setTagInput('');
            }
        }
    };

    const removeTag = (tagToRemove: string) => {
        setRecipe(prev => ({ ...prev, tags: prev.tags?.filter(t => t !== tagToRemove) }));
    };

    const handleApplyBulkPaste = () => {
        if (!rawPasteText.trim()) return;
        const parsed = parseRawRecipeText(rawPasteText, recipe.servings || 4);
        setRecipe(prev => ({
            ...prev,
            name: prev.name || parsed.name,
            servings: parsed.servings || prev.servings,
            prep_time: parsed.prep_time || prev.prep_time,
            cook_time: parsed.cook_time || prev.cook_time,
            ingredients: parsed.ingredients.length > 0 ? parsed.ingredients : prev.ingredients,
            instructions: parsed.instructions || prev.instructions
        }));
        setRawPasteText('');
        setShowBulkPaste(false);
    };

    const handlePhotoScanInForm = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!consumeCredits(1, true)) {
            e.target.value = '';
            return;
        }

        setIsScanningPhoto(true);
        setScanError(null);
        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64 = reader.result as string;
            try {
                const token = await getAccessToken();
                const familySize = 1 + (userProfile.householdMembers?.length || 0);
                const result = await scanRecipeFromImage(base64, token, familySize);
                if (result && result.name) {
                    setRecipe(prev => ({
                        ...prev,
                        name: result.name || prev.name,
                        servings: result.servings || prev.servings,
                        prep_time: result.prep_time || prev.prep_time,
                        cook_time: result.cook_time || prev.cook_time,
                        calories: result.calories ?? prev.calories,
                        protein: result.protein ?? prev.protein,
                        fat: result.fat ?? prev.fat,
                        carbs: result.carbs ?? prev.carbs,
                        ingredients:
                            result.ingredients && result.ingredients.length > 0
                                ? result.ingredients
                                : prev.ingredients,
                        instructions: result.instructions || prev.instructions,
                        meal_type: (result.meal_type as Recipe['meal_type']) || prev.meal_type,
                        tags: result.tags || prev.tags,
                        source: result.source || 'Cookbook Photo Scan'
                    }));
                } else {
                    setScanError('Could not read a full recipe from the photo.');
                }
            } catch (_) {
                setScanError('Error scanning recipe image.');
            } finally {
                setIsScanningPhoto(false);
                e.target.value = '';
            }
        };
        reader.readAsDataURL(file);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const cleanedIngredients = recipe.ingredients.filter(i => i.name.trim().length > 0);
        const payload = {
            ...recipe,
            ingredients:
                cleanedIngredients.length > 0
                    ? cleanedIngredients
                    : [{ name: 'Salt & Pepper', quantity: 1, unit: 'tsp', category: 'Pantry Staples' }]
        };

        if (isEditMode && editingRecipe) {
            await updateRecipe({
                ...editingRecipe,
                ...payload
            });
            navigate(`/recipes/${editingRecipe.id}`);
        } else {
            const created = await addRecipe(payload);
            navigate(`/recipes/${created.id}`);
        }
    };

    return (
        <div className="max-w-4xl mx-auto bg-white dark:bg-gray-800 dark:text-gray-100 rounded-2xl shadow-xl p-6 sm:p-8 space-y-6 animate-fade-in">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-100 dark:border-gray-700 pb-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-800 dark:text-gray-100">
                        {isEditMode ? `Edit: ${editingRecipe?.name}` : 'Add a New Recipe'}
                    </h1>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Enter fields manually, bulk-paste raw text (0 credits), or scan a cookbook page.
                    </p>
                </div>

                {/* Fast Ingestion Bar (F-05) */}
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setShowBulkPaste(prev => !prev)}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-700 hover:bg-indigo-100 transition-colors flex items-center gap-1.5"
                    >
                        <i className="fas fa-paste"></i>
                        Bulk Paste Text (0⚡)
                    </button>

                    <input
                        type="file"
                        id="form-photo-scan"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={handlePhotoScanInForm}
                        disabled={isScanningPhoto}
                    />
                    <label
                        htmlFor="form-photo-scan"
                        className="cursor-pointer px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-50 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-700 hover:bg-amber-100 transition-colors flex items-center gap-1.5"
                    >
                        {isScanningPhoto ? <Spinner size="sm" /> : <i className="fas fa-camera"></i>}
                        <span>{isScanningPhoto ? 'Scanning...' : 'Scan Photo (1⚡)'}</span>
                    </label>
                </div>
            </div>

            {scanError && (
                <div className="p-3 rounded-xl bg-red-50 text-red-700 text-xs font-semibold border border-red-200">
                    {scanError}
                </div>
            )}

            {/* Collapsible Zero-Credit Bulk Text Parser Drawer (F-05) */}
            {showBulkPaste && (
                <div className="p-5 rounded-2xl bg-indigo-50/70 dark:bg-gray-700/50 border border-indigo-200 dark:border-indigo-800 space-y-3 animate-fade-in">
                    <div className="flex justify-between items-center">
                        <div>
                            <h3 className="text-sm font-extrabold text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
                                <i className="fas fa-wand-sparkles text-indigo-600"></i>
                                Instant Deterministic Bulk Recipe Parser (0 Credits)
                            </h3>
                            <p className="text-xs text-gray-600 dark:text-gray-300">
                                Paste raw ingredient lines (e.g., <code>1 1/2 lbs ground beef, browned</code>) and/or cooking steps. Measurements and aisle categories are normalized automatically!
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowBulkPaste(false)}
                            className="text-gray-400 hover:text-gray-600 text-sm"
                        >
                            <i className="fas fa-times"></i>
                        </button>
                    </div>
                    <textarea
                        rows={7}
                        value={rawPasteText}
                        onChange={e => setRawPasteText(e.target.value)}
                        placeholder={`Grandma's Skillet Meatballs\nServings: 4\nIngredients:\n1 1/2 lbs ground beef\n2 large eggs, beaten\n1/2 cup panko breadcrumbs\n2 cups marinara sauce\n\nInstructions:\n1. Mix beef, eggs, and panko in a bowl.\n2. Form into meatballs and simmer in marinara for 20 minutes.`}
                        className="w-full form-input dark:bg-gray-800 dark:text-white p-3 rounded-xl border border-indigo-200 dark:border-gray-600 text-xs font-mono"
                    />
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={handleApplyBulkPaste}
                            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm transition-colors"
                        >
                            <i className="fas fa-bolt mr-1.5"></i> Parse & Populate Form
                        </button>
                    </div>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Basic Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                            Recipe Name
                        </label>
                        <input
                            type="text"
                            name="name"
                            id="name"
                            value={recipe.name}
                            onChange={handleChange}
                            className="mt-1 block w-full form-input dark:bg-gray-700 dark:text-white dark:border-gray-600 p-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-50"
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="meal_type" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                            Meal Type
                        </label>
                        <select
                            name="meal_type"
                            id="meal_type"
                            value={recipe.meal_type}
                            onChange={handleChange}
                            className="mt-1 block w-full form-select p-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-50"
                        >
                            <option>Main Course</option>
                            <option>Side Dish</option>
                            <option>Dessert</option>
                            <option>Snack</option>
                            <option>Meal Prep</option>
                        </select>
                    </div>
                </div>

                {/* Source & Tags */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label htmlFor="source" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                            Source / Credit
                        </label>
                        <input
                            type="text"
                            name="source"
                            id="source"
                            value={recipe.source || ''}
                            onChange={handleChange}
                            placeholder="e.g. Grandma, Cookbook, Website"
                            className="mt-1 block w-full form-input dark:bg-gray-700 dark:text-white dark:border-gray-600 p-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-50"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">Tags</label>
                        <input
                            type="text"
                            value={tagInput}
                            onChange={e => setTagInput(e.target.value)}
                            onKeyDown={handleAddTag}
                            placeholder="Type tag and press Enter"
                            className="mt-1 block w-full form-input dark:bg-gray-700 dark:text-white dark:border-gray-600 p-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-50"
                        />
                        <div className="flex flex-wrap gap-2 mt-2">
                            {recipe.tags?.map(tag => (
                                <span
                                    key={tag}
                                    className="bg-blue-100 text-blue-800 text-xs px-2.5 py-1 rounded-full flex items-center font-semibold"
                                >
                                    {tag}
                                    <button
                                        type="button"
                                        onClick={() => removeTag(tag)}
                                        className="ml-1.5 text-blue-600 hover:text-blue-900"
                                    >
                                        &times;
                                    </button>
                                </span>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Times & Servings */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <label htmlFor="servings" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                            Servings
                        </label>
                        <input
                            type="number"
                            name="servings"
                            id="servings"
                            min={1}
                            value={recipe.servings}
                            onChange={handleChange}
                            className="mt-1 block w-full form-input dark:bg-gray-700 dark:text-white dark:border-gray-600 p-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-50"
                        />
                    </div>
                    <div>
                        <label htmlFor="prep_time" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                            Prep Time
                        </label>
                        <input
                            type="text"
                            name="prep_time"
                            id="prep_time"
                            value={recipe.prep_time}
                            onChange={handleChange}
                            className="mt-1 block w-full form-input dark:bg-gray-700 dark:text-white dark:border-gray-600 p-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-50"
                            placeholder="e.g., 15 mins"
                        />
                    </div>
                    <div>
                        <label htmlFor="cook_time" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                            Cook Time
                        </label>
                        <input
                            type="text"
                            name="cook_time"
                            id="cook_time"
                            value={recipe.cook_time}
                            onChange={handleChange}
                            className="mt-1 block w-full form-input dark:bg-gray-700 dark:text-white dark:border-gray-600 p-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-50"
                            placeholder="e.g., 30 mins"
                        />
                    </div>
                </div>

                {/* Nutrition */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                        <label htmlFor="calories" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                            Calories
                        </label>
                        <input
                            type="number"
                            name="calories"
                            id="calories"
                            value={recipe.calories}
                            onChange={handleChange}
                            className="mt-1 block w-full form-input dark:bg-gray-700 dark:text-white dark:border-gray-600 p-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-50"
                        />
                    </div>
                    <div>
                        <label htmlFor="protein" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                            Protein (g)
                        </label>
                        <input
                            type="number"
                            name="protein"
                            id="protein"
                            value={recipe.protein}
                            onChange={handleChange}
                            className="mt-1 block w-full form-input dark:bg-gray-700 dark:text-white dark:border-gray-600 p-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-50"
                        />
                    </div>
                    <div>
                        <label htmlFor="fat" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                            Fat (g)
                        </label>
                        <input
                            type="number"
                            name="fat"
                            id="fat"
                            value={recipe.fat}
                            onChange={handleChange}
                            className="mt-1 block w-full form-input dark:bg-gray-700 dark:text-white dark:border-gray-600 p-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-50"
                        />
                    </div>
                    <div>
                        <label htmlFor="carbs" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                            Carbs (g)
                        </label>
                        <input
                            type="number"
                            name="carbs"
                            id="carbs"
                            value={recipe.carbs}
                            onChange={handleChange}
                            className="mt-1 block w-full form-input dark:bg-gray-700 dark:text-white dark:border-gray-600 p-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-50"
                        />
                    </div>
                </div>

                {/* Ingredients */}
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">Ingredients</h3>
                        <button
                            type="button"
                            onClick={addIngredient}
                            className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
                        >
                            <i className="fas fa-plus"></i> Add Ingredient Row
                        </button>
                    </div>
                    <div className="space-y-3">
                        {recipe.ingredients.map((ing, index) => (
                            <div key={index} className="grid grid-cols-12 gap-2 items-center">
                                <input
                                    type="text"
                                    placeholder="Ingredient Name"
                                    value={ing.name}
                                    onChange={e => handleIngredientChange(index, 'name', e.target.value)}
                                    className="col-span-5 form-input dark:bg-gray-700 dark:text-white dark:border-gray-600 p-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-50 text-sm"
                                />
                                <input
                                    type="number"
                                    step="any"
                                    placeholder="Qty"
                                    value={ing.quantity}
                                    onChange={e => handleIngredientChange(index, 'quantity', parseFloat(e.target.value) || 0)}
                                    className="col-span-2 form-input dark:bg-gray-700 dark:text-white dark:border-gray-600 p-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-50 text-sm"
                                />
                                <input
                                    type="text"
                                    placeholder="Unit"
                                    value={ing.unit}
                                    onChange={e => handleIngredientChange(index, 'unit', e.target.value)}
                                    className="col-span-2 form-input dark:bg-gray-700 dark:text-white dark:border-gray-600 p-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-50 text-sm"
                                />
                                <select
                                    value={ing.category || 'Other'}
                                    onChange={e => handleIngredientChange(index, 'category', e.target.value)}
                                    className="col-span-2 form-select text-xs p-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-50"
                                >
                                    {INGREDIENT_CATEGORIES.map(cat => (
                                        <option key={cat} value={cat}>
                                            {cat}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    onClick={() => removeIngredient(index)}
                                    className="col-span-1 text-red-500 hover:text-red-700 text-lg font-bold text-center"
                                    title="Remove row"
                                >
                                    &times;
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Instructions */}
                <div>
                    <label htmlFor="instructions" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                        Instructions
                    </label>
                    <textarea
                        name="instructions"
                        id="instructions"
                        rows={7}
                        value={recipe.instructions}
                        onChange={handleChange}
                        className="mt-1 block w-full form-input dark:bg-gray-700 dark:text-white dark:border-gray-600 p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-50 text-sm leading-relaxed"
                    ></textarea>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <Link
                        to={isEditMode && editingRecipe ? `/recipes/${editingRecipe.id}` : '/recipes'}
                        className="px-5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 font-bold text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                        Cancel
                    </Link>
                    <button
                        type="submit"
                        className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-blue-700 shadow-md transition-colors"
                    >
                        {isEditMode ? 'Save Changes' : 'Create Recipe'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default RecipeForm;
