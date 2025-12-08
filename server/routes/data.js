const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// --- RECIPES ---

// GET /api/data/recipes
router.get('/recipes', (req, res) => {
    const recipes = db.prepare('SELECT * FROM recipes WHERE user_id = ?').all(req.user.id);
    // Parse JSON data column
    const parsed = recipes.map(r => ({ ...JSON.parse(r.data), id: r.id, is_favorite: !!r.is_favorite }));
    res.json(parsed);
});

// POST /api/data/recipes (Add new)
router.post('/recipes', (req, res) => {
    const recipe = req.body;
    // Strip ID if present to let DB auto-increment
    const { id, ...data } = recipe;

    try {
        const info = db.prepare('INSERT INTO recipes (user_id, data, is_favorite) VALUES (?, ?, ?)')
            .run(req.user.id, JSON.stringify(data), recipe.is_favorite ? 1 : 0);
        res.json({ ...recipe, id: info.lastInsertRowid });
    } catch (e) {
        console.error("Add Recipe Error:", e);
        res.status(500).json({ error: "Failed to add recipe" });
    }
});

// PUT /api/data/recipes/:id (Update)
// DELETE /api/data/recipes/:id
router.delete('/recipes/:id', (req, res) => {
    const info = db.prepare('DELETE FROM recipes WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    if (info.changes > 0) res.json({ success: true });
    else res.status(404).json({ error: "Recipe not found" });
});


// --- PANTRY ---

// GET /api/data/pantry
router.get('/pantry', (req, res) => {
    const pantry = db.prepare('SELECT * FROM pantry WHERE user_id = ?').all(req.user.id);
    res.json(pantry);
});

// POST /api/data/pantry (Sync/Add)
router.post('/pantry', (req, res) => {
    // For simplicity, let's accept a single item or bulk sync?
    // Let's implement single Add for now
    const item = req.body;

    try {
        const info = db.prepare('INSERT INTO pantry (user_id, name, quantity, unit, category) VALUES (?, ?, ?, ?, ?)')
            .run(req.user.id, item.name, item.quantity, item.unit, item.category);
        res.json({ ...item, id: info.lastInsertRowid });
    } catch (e) {
        res.status(500).json({ error: "Failed to add pantry item" });
    }
});

// DELETE /api/data/pantry/:id
router.delete('/pantry/:id', (req, res) => {
    db.prepare('DELETE FROM pantry WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ success: true });
});

module.exports = router;
