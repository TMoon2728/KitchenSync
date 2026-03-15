import os

files = [
    'pages/Dashboard.tsx', 'pages/Recipes.tsx', 'pages/MealPlanner.tsx',
    'pages/ShoppingList.tsx', 'pages/Pantry.tsx', 'pages/MealPrep.tsx',
    'pages/AiArchitect.tsx', 'pages/RecipeDetail.tsx', 'pages/RecipeForm.tsx',
    'components/RecipeCard.tsx', 'components/SousChef.tsx'
]

for f in files:
    full_path = os.path.join(os.getcwd(), f)
    if os.path.exists(full_path):
        with open(full_path, 'r', encoding='utf-8') as file:
            c = file.read()
            
        c = c.replace('className=\\"bg-white', 'className="bg-white')
        c = c.replace('className=`\\"bg-white', 'className={`bg-white') # Also fix any template literal issues
        c = c.replace('className=\\"', 'className="')
        
        with open(full_path, 'w', encoding='utf-8') as file:
            file.write(c)
        print(f'Fixed {f}')
