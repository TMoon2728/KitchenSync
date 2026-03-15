import os
import re

files = [
    'pages/Dashboard.tsx', 'pages/Recipes.tsx', 'pages/MealPlanner.tsx',
    'pages/ShoppingList.tsx', 'pages/Pantry.tsx', 'pages/MealPrep.tsx',
    'pages/AiArchitect.tsx', 'pages/RecipeDetail.tsx', 'pages/RecipeForm.tsx',
    'components/RecipeCard.tsx', 'components/SousChef.tsx'
]

replacements = [
    (r'className=\"bg-white\b(?! dark:bg-gray-800)', r'className=\"bg-white dark:bg-gray-800 dark:text-gray-100'),
    (r'bg-white\b(?! dark:bg-gray-800)', r'bg-white dark:bg-gray-800 dark:text-gray-100'),
    (r'text-gray-800\b(?! dark:text-gray-100)', r'text-gray-800 dark:text-gray-100'),
    (r'text-gray-900\b(?! dark:text-gray-50)', r'text-gray-900 dark:text-gray-50'),
    (r'text-gray-700\b(?! dark:text-gray-200)', r'text-gray-700 dark:text-gray-200'),
    (r'text-gray-600\b(?! dark:text-gray-300)', r'text-gray-600 dark:text-gray-300'),
    (r'text-gray-500\b(?! dark:text-gray-400)', r'text-gray-500 dark:text-gray-400'),
    (r'bg-gray-50\b(?! dark:bg-gray-700\/50)', r'bg-gray-50 dark:bg-gray-700/50'),
    (r'bg-gray-100\b(?! dark:bg-gray-700)', r'bg-gray-100 dark:bg-gray-700'),
    (r'border-gray-300\b(?! dark:border-gray-600)', r'border-gray-300 dark:border-gray-600'),
    (r'border-gray-200\b(?! dark:border-gray-700)', r'border-gray-200 dark:border-gray-700'),
    (r'border-gray-100\b(?! dark:border-gray-700)', r'border-gray-100 dark:border-gray-700'),
    (r'form-input\b(?! dark:bg-gray-700)', r'form-input dark:bg-gray-700 dark:text-white dark:border-gray-600')
]

for filepath in files:
    full_path = os.path.join(os.getcwd(), filepath)
    if os.path.exists(full_path):
        with open(full_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        for old, new in replacements:
            content = re.sub(old, new, content)
            
        with open(full_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f'Updated {filepath}')
    else:
        print(f'File not found: {filepath}')
