import type { Ingredient } from '../types';
import { parseRawRecipeText as parseRawRecipeTextCore } from '../shared/culinaryEngines.mjs';

export interface ParsedBulkRecipe {
    name: string;
    servings: number;
    prep_time: string;
    cook_time: string;
    ingredients: Ingredient[];
    instructions: string;
}

export function parseRawRecipeText(rawText: string, defaultServings = 4): ParsedBulkRecipe {
    return parseRawRecipeTextCore(rawText, defaultServings) as ParsedBulkRecipe;
}
