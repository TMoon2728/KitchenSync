
import type { Recipe, PantryItem, MealPlan, UserProfile } from './types';

export const MOCK_RECIPES: Recipe[] = [
  {
    id: 1,
    name: 'Classic Spaghetti Bolognese',
    servings: 4,
    prep_time: '15 mins',
    cook_time: '30 mins',
    calories: 550, protein: 30, fat: 20, carbs: 60,
    ingredients: [
      { name: 'Spaghetti', quantity: 400, unit: 'g', category: 'Pantry Staples' },
      { name: 'Ground Beef', quantity: 500, unit: 'g', category: 'Meat' },
      { name: 'Onion', quantity: 1, unit: 'each', category: 'Produce' },
      { name: 'Garlic', quantity: 2, unit: 'cloves', category: 'Produce' },
      { name: 'Canned Tomatoes', quantity: 800, unit: 'g', category: 'Pantry Staples' },
      { name: 'Olive Oil', quantity: 2, unit: 'tbsp', category: 'Pantry Staples' },
    ],
    instructions: '1. Sauté onion and garlic in olive oil. 2. Brown the ground beef. 3. Add canned tomatoes and simmer for 20 minutes. 4. Cook spaghetti according to package directions. 5. Serve sauce over spaghetti.',
    is_favorite: true,
    rating: 5,
    meal_type: 'Main Course',
    tags: ['Italian', 'Comfort Food', 'Dinner'],
    source: 'Grandma'
  },
  {
    id: 2,
    name: 'Chicken Caesar Salad',
    servings: 2,
    prep_time: '20 mins',
    cook_time: '15 mins',
    calories: 400, protein: 35, fat: 25, carbs: 10,
    ingredients: [
      { name: 'Chicken Breast', quantity: 2, unit: 'fillets', category: 'Meat' },
      { name: 'Romaine Lettuce', quantity: 1, unit: 'head', category: 'Produce' },
      { name: 'Croutons', quantity: 1, unit: 'cup', category: 'Pantry Staples' },
      { name: 'Parmesan Cheese', quantity: 0.5, unit: 'cup', category: 'Dairy & Eggs' },
      { name: 'Caesar Dressing', quantity: 4, unit: 'tbsp', category: 'Pantry Staples' },
    ],
    instructions: '1. Grill or pan-sear chicken breast, then slice. 2. Chop romaine lettuce. 3. Toss lettuce with dressing, croutons, and parmesan. 4. Top with sliced chicken.',
    is_favorite: false,
    rating: 4,
    meal_type: 'Main Course',
    tags: ['Healthy', 'Quick', 'Lunch'],
    source: 'KitchenSync'
  },
    {
    id: 3,
    name: 'Simple Garden Salad',
    servings: 2,
    prep_time: '10 mins',
    cook_time: '0 mins',
    calories: 150, protein: 5, fat: 10, carbs: 10,
    ingredients: [
      { name: 'Mixed Greens', quantity: 4, unit: 'cups', category: 'Produce' },
      { name: 'Cherry Tomatoes', quantity: 1, unit: 'cup', category: 'Produce' },
      { name: 'Cucumber', quantity: 0.5, unit: 'each', category: 'Produce' },
      { name: 'Vinaigrette Dressing', quantity: 3, unit: 'tbsp', category: 'Pantry Staples' },
    ],
    instructions: '1. Wash and chop vegetables. 2. Combine all ingredients in a large bowl. 3. Toss with vinaigrette dressing just before serving.',
    is_favorite: false,
    rating: 3,
    meal_type: 'Side Dish',
    tags: ['Vegan', 'Gluten-Free', 'Low Carb'],
    source: 'Unknown'
  },
  {
    id: 4,
    name: 'Oatmeal with Berries',
    servings: 1,
    prep_time: '2 mins',
    cook_time: '5 mins',
    calories: 300, protein: 10, fat: 8, carbs: 50,
    ingredients: [
      { name: 'Rolled Oats', quantity: 0.5, unit: 'cup', category: 'Pantry Staples' },
      { name: 'Water', quantity: 1, unit: 'cup', category: 'Pantry Staples' },
      { name: 'Mixed Berries', quantity: 0.75, unit: 'cup', category: 'Produce' },
      { name: 'Honey', quantity: 1, unit: 'tbsp', category: 'Pantry Staples' },
    ],
    instructions: '1. Bring water to a boil. 2. Stir in oats and reduce heat. 3. Cook for 5 minutes, stirring occasionally. 4. Top with berries and a drizzle of honey.',
    is_favorite: true,
    rating: 5,
    meal_type: 'Snack',
    tags: ['Breakfast', 'Healthy', 'Vegetarian'],
    source: 'HealthyEats.com'
  },
  {
    id: 5,
    name: 'Big Batch Chili',
    servings: 8,
    prep_time: '20 mins',
    cook_time: '90 mins',
    calories: 450, protein: 35, fat: 18, carbs: 35,
    ingredients: [
      { name: 'Ground Beef', quantity: 1000, unit: 'g', category: 'Meat' },
      { name: 'Kidney Beans', quantity: 800, unit: 'g', category: 'Pantry Staples' },
      { name: 'Canned Tomatoes', quantity: 800, unit: 'g', category: 'Pantry Staples' },
      { name: 'Onion', quantity: 2, unit: 'each', category: 'Produce' },
      { name: 'Chili Powder', quantity: 4, unit: 'tbsp', category: 'Spices & Seasonings' },
      { name: 'Cumin', quantity: 2, unit: 'tbsp', category: 'Spices & Seasonings' },
    ],
    instructions: '1. Brown ground beef with onions. 2. Drain fat. 3. Add all other ingredients to a large pot. 4. Simmer on low for at least 1.5 hours. 5. Serve or portion into containers for later.',
    is_favorite: true,
    rating: 5,
    meal_type: 'Meal Prep',
    tags: ['Freezer-Friendly', 'Spicy', 'Crowd Pleaser'],
    source: 'Chef John'
  }
];

export const MOCK_PANTRY: PantryItem[] = [
  { id: 1, name: 'Spaghetti', quantity: 200, unit: 'g', category: 'Pantry Staples' },
  { id: 2, name: 'Olive Oil', quantity: 500, unit: 'ml', category: 'Pantry Staples' },
  { id: 3, name: 'Garlic', quantity: 5, unit: 'cloves', category: 'Produce' },
  { id: 4, name: 'Onion', quantity: 3, unit: 'each', category: 'Produce' },
];

export const MOCK_MEAL_PLAN: MealPlan = {
  '2024-01-01': {
    'Breakfast': [],
    'Lunch': [{ recipeId: 2 }],
    'Dinner': [{ recipeId: 1 }],
    'Snack': [],
  }
};

export const MOCK_PROFILE: UserProfile = {
    name: 'Chef',
    avatar: '👨‍🍳',
    kitchenName: "Chef's Kitchen",
    dailyCalorieGoal: 2000,
    subscriptionTier: 'free',
    credits: 5,
    householdMembers: [
        { id: 1, name: 'Chef', dietaryRestrictions: 'None' },
        { id: 2, name: 'Partner', dietaryRestrictions: 'Vegetarian' }
    ],
    groceryStores: [
        { id: 1, name: 'Walmart', url: 'https://www.walmart.com/cp/groceries/1735450' },
        { id: 2, name: 'Instacart', url: 'https://www.instacart.com' }
    ],
    preferences: {
        enableConfetti: true,
        confettiIntensity: 'medium',
        themeColor: 'blue',
        showSousChef: true
    }
};