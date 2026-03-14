const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// --- RECIPES ---

// GET /api/data/recipes
router.get('/recipes', async (req, res) => {
    try {
        const queryStr = 'SELECT * FROM recipes WHERE user_id IN (SELECT id FROM users WHERE household_id = $1 OR (household_id IS NULL AND id::text = $1))';
        const { rows } = await db.query(queryStr, [req.user.effective_household]);
        
        // Parse JSONB data column. In pg, jsonb columns might already be returned as objects.
        // We'll safely parse if it's a string, otherwise use it directly.
        const parsed = rows.map(r => {
            const recipeData = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
            return { 
                ...recipeData, 
                id: r.id, 
                is_favorite: !!r.is_favorite 
            };
        });
        
        res.json(parsed);
    } catch (e) {
        console.error("Fetch Recipes Error:", e);
        res.status(500).json({ error: "Failed to fetch recipes" });
    }
});

// POST /api/data/recipes (Add new)
router.post('/recipes', async (req, res) => {
    const recipe = req.body;
    // Strip ID if present to let DB auto-increment
    const { id, ...data } = recipe;

    try {
        // Postgres uses JSONB and RETURNING id
        const result = await db.query(
            'INSERT INTO recipes (user_id, data, is_favorite) VALUES ($1, $2, $3) RETURNING id',
            [req.user.id, data, recipe.is_favorite ? true : false]
        );
        res.json({ ...recipe, id: result.rows[0].id });
    } catch (e) {
        console.error("Add Recipe Error:", e);
        res.status(500).json({ error: "Failed to add recipe" });
    }
});

// PUT /api/data/recipes/:id (Update)
// DELETE /api/data/recipes/:id
router.delete('/recipes/:id', async (req, res) => {
    try {
        const queryStr = 'DELETE FROM recipes WHERE id = $1 AND user_id IN (SELECT id FROM users WHERE household_id = $2 OR (household_id IS NULL AND id::text = $2))';
        const result = await db.query(queryStr, [req.params.id, req.user.effective_household]);
        if (result.rowCount > 0) res.json({ success: true });
        else res.status(404).json({ error: "Recipe not found" });
    } catch (e) {
        console.error("Delete Recipe Error:", e);
        res.status(500).json({ error: "Failed to delete recipe" });
    }
});


// --- PANTRY ---

// GET /api/data/pantry
router.get('/pantry', async (req, res) => {
    try {
        const queryStr = 'SELECT * FROM pantry WHERE user_id IN (SELECT id FROM users WHERE household_id = $1 OR (household_id IS NULL AND id::text = $1))';
        const { rows } = await db.query(queryStr, [req.user.effective_household]);
        res.json(rows);
    } catch (e) {
        console.error("Fetch Pantry Error:", e);
        res.status(500).json({ error: "Failed to fetch pantry" });
    }
});

// POST /api/data/pantry (Sync/Add)
router.post('/pantry', async (req, res) => {
    const item = req.body;

    try {
        const result = await db.query(
            'INSERT INTO pantry (user_id, name, quantity, unit, category) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [req.user.id, item.name, item.quantity, item.unit, item.category]
        );
        res.json({ ...item, id: result.rows[0].id });
    } catch (e) {
        console.error("Add Pantry Error:", e);
        res.status(500).json({ error: "Failed to add pantry item" });
    }
});

// DELETE /api/data/pantry/:id
router.delete('/pantry/:id', async (req, res) => {
    try {
        const queryStr = 'DELETE FROM pantry WHERE id = $1 AND user_id IN (SELECT id FROM users WHERE household_id = $2 OR (household_id IS NULL AND id::text = $2))';
        await db.query(queryStr, [req.params.id, req.user.effective_household]);
        res.json({ success: true });
    } catch (e) {
        console.error("Delete Pantry Error:", e);
        res.status(500).json({ error: "Failed to delete pantry" });
    }
});

module.exports = router;
