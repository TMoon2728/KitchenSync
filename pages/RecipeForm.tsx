
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Recipe, Ingredient } from '../types';
import { useKitchen } from '../context/KitchenContext';

const INGREDIENT_CATEGORIES = ['Produce', 'Meat', 'Seafood', 'Dairy & Eggs', 'Pantry Staples', 'Spices & Seasonings', 'Bakery', 'Frozen', 'Other'];

const RecipeForm: React.FC = () => {
    const { addRecipe } = useKitchen();
    const navigate = useNavigate();
    const [recipe, setRecipe] = useState<Omit<Recipe, 'id' | 'is_favorite' | 'rating'>>({
        name: '',
        servings: 1,
        prep_time: '',
        cook_time: '',
        calories: 0,
        protein: 0,
        fat: 0,
        carbs: 0,
        ingredients: [{ name: '', quantity: 1, unit: '', category: 'Pantry Staples' }],
        instructions: '',
        meal_type: 'Main Course',
        tags: [],
        source: ''
    });

    const [tagInput, setTagInput] = useState('');

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setRecipe(prev => ({ ...prev, [name]: name.match(/calories|protein|fat|carbs|servings/) ? parseFloat(value) || 0 : value }));
    };

    const handleIngredientChange = (index: number, field: keyof Ingredient, value: string | number) => {
        const newIngredients = [...recipe.ingredients];
        (newIngredients[index] as any)[field] = value;
        setRecipe(prev => ({ ...prev, ingredients: newIngredients }));
    };

    const addIngredient = () => {
        setRecipe(prev => ({
            ...prev,
            ingredients: [...prev.ingredients, { name: '', quantity: 1, unit: '', category: 'Pantry Staples' }]
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

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        addRecipe(recipe);
        navigate('/recipes');
    };

    return (
        <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-xl p-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Add a New Recipe</h1>
            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Basic Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label htmlFor="name" className="block text-sm font-medium text-gray-700">Recipe Name</label>
                        <input type="text" name="name" id="name" value={recipe.name} onChange={handleChange} className="mt-1 block w-full form-input p-2 border border-gray-300 rounded-md bg-white text-gray-900" required />
                    </div>
                    <div>
                        <label htmlFor="meal_type" className="block text-sm font-medium text-gray-700">Meal Type</label>
                        <select name="meal_type" id="meal_type" value={recipe.meal_type} onChange={handleChange} className="mt-1 block w-full form-select p-2 border border-gray-300 rounded-md bg-white text-gray-900">
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
                        <label htmlFor="source" className="block text-sm font-medium text-gray-700">Source / Credit</label>
                        <input type="text" name="source" id="source" value={recipe.source || ''} onChange={handleChange} placeholder="e.g. Grandma, Cookbook, Website" className="mt-1 block w-full form-input p-2 border border-gray-300 rounded-md bg-white text-gray-900" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Tags</label>
                        <input
                            type="text"
                            value={tagInput}
                            onChange={e => setTagInput(e.target.value)}
                            onKeyDown={handleAddTag}
                            placeholder="Type tag and press Enter"
                            className="mt-1 block w-full form-input p-2 border border-gray-300 rounded-md bg-white text-gray-900"
                        />
                        <div className="flex flex-wrap gap-2 mt-2">
                            {recipe.tags?.map(tag => (
                                <span key={tag} className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full flex items-center">
                                    {tag}
                                    <button type="button" onClick={() => removeTag(tag)} className="ml-1 text-blue-600 hover:text-blue-900">&times;</button>
                                </span>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Times & Servings */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <label htmlFor="servings" className="block text-sm font-medium text-gray-700">Servings</label>
                        <input type="number" name="servings" id="servings" value={recipe.servings} onChange={handleChange} className="mt-1 block w-full form-input p-2 border border-gray-300 rounded-md bg-white text-gray-900" />
                    </div>
                    <div>
                        <label htmlFor="prep_time" className="block text-sm font-medium text-gray-700">Prep Time</label>
                        <input type="text" name="prep_time" id="prep_time" value={recipe.prep_time} onChange={handleChange} className="mt-1 block w-full form-input p-2 border border-gray-300 rounded-md bg-white text-gray-900" placeholder="e.g., 15 mins" />
                    </div>
                    <div>
                        <label htmlFor="cook_time" className="block text-sm font-medium text-gray-700">Cook Time</label>
                        <input type="text" name="cook_time" id="cook_time" value={recipe.cook_time} onChange={handleChange} className="mt-1 block w-full form-input p-2 border border-gray-300 rounded-md bg-white text-gray-900" placeholder="e.g., 30 mins" />
                    </div>
                </div>

                {/* Nutrition */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                        <label htmlFor="calories" className="block text-sm font-medium text-gray-700">Calories</label>
                        <input type="number" name="calories" id="calories" value={recipe.calories} onChange={handleChange} className="mt-1 block w-full form-input p-2 border border-gray-300 rounded-md bg-white text-gray-900" />
                    </div>
                    <div>
                        <label htmlFor="protein" className="block text-sm font-medium text-gray-700">Protein (g)</label>
                        <input type="number" name="protein" id="protein" value={recipe.protein} onChange={handleChange} className="mt-1 block w-full form-input p-2 border border-gray-300 rounded-md bg-white text-gray-900" />
                    </div>
                    <div>
                        <label htmlFor="fat" className="block text-sm font-medium text-gray-700">Fat (g)</label>
                        <input type="number" name="fat" id="fat" value={recipe.fat} onChange={handleChange} className="mt-1 block w-full form-input p-2 border border-gray-300 rounded-md bg-white text-gray-900" />
                    </div>
                    <div>
                        <label htmlFor="carbs" className="block text-sm font-medium text-gray-700">Carbs (g)</label>
                        <input type="number" name="carbs" id="carbs" value={recipe.carbs} onChange={handleChange} className="mt-1 block w-full form-input p-2 border border-gray-300 rounded-md bg-white text-gray-900" />
                    </div>
                </div>

                {/* Ingredients */}
                <div>
                    <h3 className="text-lg font-medium text-gray-800 mb-2">Ingredients</h3>
                    <div className="space-y-3">
                        {recipe.ingredients.map((ing, index) => (
                            <div key={index} className="grid grid-cols-12 gap-2 items-center">
                                <input type="text" placeholder="Name" value={ing.name} onChange={e => handleIngredientChange(index, 'name', e.target.value)} className="col-span-4 form-input p-2 border border-gray-300 rounded-md bg-white text-gray-900" />
                                <input type="number" placeholder="Qty" value={ing.quantity} onChange={e => handleIngredientChange(index, 'quantity', parseFloat(e.target.value))} className="col-span-2 form-input p-2 border border-gray-300 rounded-md bg-white text-gray-900" />
                                <input type="text" placeholder="Unit" value={ing.unit} onChange={e => handleIngredientChange(index, 'unit', e.target.value)} className="col-span-2 form-input p-2 border border-gray-300 rounded-md bg-white text-gray-900" />
                                <select value={ing.category || 'Other'} onChange={e => handleIngredientChange(index, 'category', e.target.value)} className="col-span-3 form-select text-xs p-2 border border-gray-300 rounded-md bg-white text-gray-900">
                                    {INGREDIENT_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                </select>
                                <button type="button" onClick={() => removeIngredient(index)} className="col-span-1 text-red-500 hover:text-red-700 text-lg font-bold">&times;</button>
                            </div>
                        ))}
                    </div>
                    <button type="button" onClick={addIngredient} className="mt-2 text-sm text-blue-600 hover:underline">+ Add Ingredient</button>
                </div>

                {/* Instructions */}
                <div>
                    <label htmlFor="instructions" className="block text-sm font-medium text-gray-700">Instructions</label>
                    <textarea name="instructions" id="instructions" rows={6} value={recipe.instructions} onChange={handleChange} className="mt-1 block w-full form-input p-2 border border-gray-300 rounded-md bg-white text-gray-900"></textarea>
                </div>

                <div className="flex justify-end">
                    <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-md font-semibold hover:bg-blue-700">Save Recipe</button>
                </div>
            </form>
        </div>
    );
};

export default RecipeForm;
