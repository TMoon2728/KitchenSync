import type { Recipe, PantryItem, Ingredient, MealPlan, HouseholdMember, WeeklyScheduleMatrix } from '../types';
import { getActiveSlotsForDate } from './schedule';
import {
    scoreRecipeAgainstPantry as scoreRecipeAgainstPantryCore,
    generateSmartWeeklyPlan as generateSmartWeeklyPlanCore,
    inferDefaultExpiryDate as inferDefaultExpiryDateCore,
    getExpiryStatus as getExpiryStatusCore,
    checkDietaryConflicts as checkDietaryConflictsCore,
    computeRecipeDiff as computeRecipeDiffCore
} from '../shared/culinaryEngines.mjs';

export interface PantryMatchResult {
    matchPercentage: number;
    matchedCount: number;
    totalCount: number;
    missingIngredients: Ingredient[];
    usesExpiringItem: boolean;
    expiringMatchedNames: string[];
}

export interface ExpiryStatusInfo {
    status: 'expired' | 'expiring_soon' | 'fresh' | 'none';
    daysRemaining: number | null;
    label: string;
}

export interface DietaryConflict {
    memberName: string;
    restriction: string;
    offendingIngredient: string;
}

export interface RecipeDiffSummary {
    calorieDelta: number;
    proteinDelta: number;
    carbDelta: number;
    fatDelta: number;
    addedIngredients: Ingredient[];
    modifiedIngredients: Array<{ previous: Ingredient; current: Ingredient }>;
    removedIngredients: Ingredient[];
}

export function scoreRecipeAgainstPantry(
    recipe: Pick<Recipe, 'ingredients'>,
    pantry: PantryItem[],
    nowMs = Date.now()
): PantryMatchResult {
    return scoreRecipeAgainstPantryCore(recipe, pantry, nowMs) as PantryMatchResult;
}

export function inferDefaultExpiryDate(
    category = 'Other',
    itemName = '',
    nowMs = Date.now()
): string {
    return inferDefaultExpiryDateCore(category, itemName, nowMs);
}

export function getExpiryStatus(expiryDate?: string, nowMs = Date.now()): ExpiryStatusInfo {
    return getExpiryStatusCore(expiryDate, nowMs) as ExpiryStatusInfo;
}

export function checkDietaryConflicts(
    recipe: Pick<Recipe, 'ingredients'> | null | undefined,
    householdMembers: HouseholdMember[] = []
): DietaryConflict[] {
    return checkDietaryConflictsCore(recipe, householdMembers) as DietaryConflict[];
}

export function computeRecipeDiff(
    originalRecipe: Partial<Recipe>,
    remixedRecipe: Partial<Recipe>
): RecipeDiffSummary {
    return computeRecipeDiffCore(originalRecipe, remixedRecipe) as RecipeDiffSummary;
}

export function generateSmartWeeklyPlan(params: {
    recipes: Recipe[];
    pantry: PantryItem[];
    currentPlan: MealPlan;
    weekDates: Date[];
    scheduleMatrix: WeeklyScheduleMatrix;
    mode: 'calendar' | 'list';
    targetListCount?: number;
    householdMembers?: HouseholdMember[];
}): { mealPlan: MealPlan; addedCount: number } {
    return generateSmartWeeklyPlanCore({
        recipes: params.recipes,
        pantry: params.pantry,
        currentPlan: params.currentPlan,
        weekDates: params.weekDates,
        getActiveSlotsForDateFn: (dateObj: Date) => getActiveSlotsForDate(dateObj, params.scheduleMatrix),
        mode: params.mode,
        targetListCount: params.targetListCount ?? 7,
        householdMembers: params.householdMembers ?? []
    }) as { mealPlan: MealPlan; addedCount: number };
}
