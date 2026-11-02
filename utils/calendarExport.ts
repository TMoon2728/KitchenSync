import type { MealPlan, Recipe } from '../types';
import {
    generateMealPlanIcs as generateMealPlanIcsCore,
    buildStoreSearchUrl as buildStoreSearchUrlCore,
    formatCookbookMarkdown as formatCookbookMarkdownCore
} from '../shared/culinaryEngines.mjs';

export function generateMealPlanIcs(
    mealPlan: MealPlan,
    recipes: Recipe[],
    weekStartDateStr?: string
): string {
    return generateMealPlanIcsCore(mealPlan, recipes, weekStartDateStr);
}

export function buildStoreSearchUrl(storeName: string, baseUrl: string, query: string): string {
    return buildStoreSearchUrlCore(storeName, baseUrl, query);
}

export function formatCookbookMarkdown(recipes: Recipe[]): string {
    return formatCookbookMarkdownCore(recipes);
}

export function downloadTextFile(filename: string, content: string, mimeType = 'text/plain;charset=utf-8'): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
