
export interface Ingredient {
    name: string;
    quantity: number;
    unit: string;
    category?: string;
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
    imageUrl?: string;
    tags?: string[];
    source?: string;
}

export interface PantryItem {
    id: number;
    name: string;
    quantity: number;
    unit: string;
    category?: string;
}

export interface MealPlanSlot {
    recipeId?: number;
    custom_item_name?: string;
    completed?: boolean;
}

export interface MealPlanDay {
    [slot: string]: MealPlanSlot[]; // e.g. { Breakfast: [{recipeId: 1}], Lunch: [] }
}

export interface MealPlan {
    [date: string]: MealPlanDay; // e.g. { '2023-10-26': { Breakfast: ... } }
}

export interface HouseholdMember {
    id: number;
    name: string;
    dietaryRestrictions?: string; // e.g. "Vegan", "Nut Allergy"
}

export interface GroceryStore {
    id: number;
    name: string;
    url: string;
}

export interface UserPreferences {
    enableConfetti: boolean;
    confettiIntensity: 'low' | 'medium' | 'high';
    themeColor: 'blue' | 'green' | 'purple' | 'slate' | 'orange' | 'rose';
    showSousChef?: boolean;
    hiddenNavItems?: string[]; // List of paths to hide from sidebar
    stripeConfig?: {
        starterLink?: string;
        proLink?: string;
        portalLink?: string;
    };
}

export interface UserProfile {
    name: string;
    email: string;
    avatar?: string;
    kitchenName?: string;
    dailyCalorieGoal: number;
    householdMembers: HouseholdMember[];
    groceryStores: GroceryStore[];
    preferences?: UserPreferences;
    subscriptionTier: 'free' | 'starter' | 'pro';
    credits: number;
    hasUsedFreeImageGeneration?: boolean;
}