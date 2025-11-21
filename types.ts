
export interface Ingredient {
  name: string;
  quantity: number;
  unit: string;
}

export interface Recipe {
  id: number;
  name: string;
  servings: number;
  prep_time: string;
  cook_time: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  ingredients: Ingredient[];
  instructions: string;
  is_favorite: boolean;
  rating: number; // 0-5
  meal_type: 'Main Course' | 'Side Dish' | 'Dessert' | 'Snack' | 'Meal Prep';
}

export interface PantryItem {
  id: number;
  name: string;
  quantity: number;
  unit: string;
}

export interface MealPlanSlot {
    recipeId: number;
    custom_item_name?: string;
}

export interface MealPlanDay {
    [slot: string]: MealPlanSlot[]; // e.g. { Breakfast: [{recipeId: 1}], Lunch: [] }
}

export interface MealPlan {
    [date: string]: MealPlanDay; // e.g. { '2023-10-26': { Breakfast: ... } }
}
