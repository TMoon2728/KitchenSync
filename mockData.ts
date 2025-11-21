
import type { Recipe, PantryItem, MealPlan } from './types';

export const MOCK_RECIPES: Recipe[] = [
  {
    id: 1,
    name: 'Classic Spaghetti Bolognese',
    servings: 4,
    prep_time: '15 mins',
    cook_time: '30 mins',
    calories: 550, protein: 30, fat: 20, carbs: 60,
    ingredients: [
      { name: 'Spaghetti', quantity: 400, unit: 'g' },
      { name: 'Ground Beef', quantity: 500, unit: 'g' },
      { name: 'Onion', quantity: 1, unit: 'each' },
      { name: 'Garlic', quantity: 2, unit: 'cloves' },
      { name: 'Canned Tomatoes', quantity: 800, unit: 'g' },
      { name: 'Olive Oil', quantity: 2, unit: 'tbsp' },
    ],
    instructions: '1. Sauté onion and garlic in olive oil. 2. Brown the ground beef. 3. Add canned tomatoes and simmer for 20 minutes. 4. Cook spaghetti according to package directions. 5. Serve sauce over spaghetti.',
    is_favorite: true,
    rating: 5,
    meal_type: 'Main Course',
  },
  {
    id: 2,
    name: 'Chicken Caesar Salad',
    servings: 2,
    prep_time: '20 mins',
    cook_time: '15 mins',
    calories: 400, protein: 35, fat: 25, carbs: 10,
    ingredients: [
      { name: 'Chicken Breast', quantity: 2, unit: 'fillets' },
      { name: 'Romaine Lettuce', quantity: 1, unit: 'head' },
      { name: 'Croutons', quantity: 1, unit: 'cup' },
      { name: 'Parmesan Cheese', quantity: 0.5, unit: 'cup' },
      { name: 'Caesar Dressing', quantity: 4, unit: 'tbsp' },
    ],
    instructions: '1. Grill or pan-sear chicken breast, then slice. 2. Chop romaine lettuce. 3. Toss lettuce with dressing, croutons, and parmesan. 4. Top with sliced chicken.',
    is_favorite: false,
    rating: 4,
    meal_type: 'Main Course',
  },
    {
    id: 3,
    name: 'Simple Garden Salad',
    servings: 2,
    prep_time: '10 mins',
    cook_time: '0 mins',
    calories: 150, protein: 5, fat: 10, carbs: 10,
    ingredients: [
      { name: 'Mixed Greens', quantity: 4, unit: 'cups' },
      { name: 'Cherry Tomatoes', quantity: 1, unit: 'cup' },
      { name: 'Cucumber', quantity: 0.5, unit: 'each' },
      { name: 'Vinaigrette Dressing', quantity: 3, unit: 'tbsp' },
    ],
    instructions: '1. Wash and chop vegetables. 2. Combine all ingredients in a large bowl. 3. Toss with vinaigrette dressing just before serving.',
    is_favorite: false,
    rating: 3,
    meal_type: 'Side Dish',
  },
  {
    id: 4,
    name: 'Oatmeal with Berries',
    servings: 1,
    prep_time: '2 mins',
    cook_time: '5 mins',
    calories: 300, protein: 10, fat: 8, carbs: 50,
    ingredients: [
      { name: 'Rolled Oats', quantity: 0.5, unit: 'cup' },
      { name: 'Water', quantity: 1, unit: 'cup' },
      { name: 'Mixed Berries', quantity: 0.75, unit: 'cup' },
      { name: 'Honey', quantity: 1, unit: 'tbsp' },
    ],
    instructions: '1. Bring water to a boil. 2. Stir in oats and reduce heat. 3. Cook for 5 minutes, stirring occasionally. 4. Top with berries and a drizzle of honey.',
    is_favorite: true,
    rating: 5,
    meal_type: 'Snack',
  }
];

export const MOCK_PANTRY: PantryItem[] = [
  { id: 1, name: 'Spaghetti', quantity: 200, unit: 'g' },
  { id: 2, name: 'Olive Oil', quantity: 500, unit: 'ml' },
  { id: 3, name: 'Garlic', quantity: 5, unit: 'cloves' },
  { id: 4, name: 'Onion', quantity: 3, unit: 'each' },
];

export const MOCK_MEAL_PLAN: MealPlan = {
  '2024-01-01': {
    'Breakfast': [],
    'Lunch': [{ recipeId: 2 }],
    'Dinner': [{ recipeId: 1 }],
    'Snack': [],
  }
};
