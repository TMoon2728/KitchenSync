const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { normalizeRecipeIngredientsList } = require('../utils/ingredientNormalizer');

const hubSyncLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many Hub Sync requests from this IP, please try again later." }
});

async function resolveHubHousehold(rawCode, allowInitialEmailLookup = false) {
    const code = String(rawCode || '').trim();
    if (!code || code.length < 4) return null;

    const queryText = allowInitialEmailLookup
        ? `SELECT u.*,
                  (SELECT COUNT(*) FROM recipes r WHERE r.user_id = u.id) AS recipe_count
           FROM users u
           WHERE UPPER(u.invite_code) = UPPER($1)
              OR LOWER(u.email) = LOWER($1)
           ORDER BY recipe_count DESC, u.created_at ASC
           LIMIT 1`
        : `SELECT u.*,
                  (SELECT COUNT(*) FROM recipes r WHERE r.user_id = u.id) AS recipe_count
           FROM users u
           WHERE UPPER(u.invite_code) = UPPER($1)
           ORDER BY recipe_count DESC, u.created_at ASC
           LIMIT 1`;

    const { rows } = await db.query(queryText, [code]);

    if (rows.length === 0) return null;
    const user = rows[0];

    if (!user.invite_code) {
        const generated = 'KS-' + crypto.randomBytes(4).toString('hex').toUpperCase();
        try {
            await db.query('UPDATE users SET invite_code = $1 WHERE id = $2', [generated, user.id]);
            user.invite_code = generated;
        } catch {}
    }

    const effectiveHousehold = user.household_id || String(user.id);
    return { user, effectiveHousehold };
}

async function buildHubSyncPayload(user, effectiveHousehold) {
    const recipesRes = await db.query(
        'SELECT * FROM recipes WHERE user_id IN (SELECT id FROM users WHERE household_id = $1 OR (household_id IS NULL AND id::text = $1) OR LOWER(email) = LOWER($2)) ORDER BY id ASC',
        [effectiveHousehold, user.email || '']
    );
    const recipes = recipesRes.rows.map(r => {
        const recipeData = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
        return {
            ...recipeData,
            ingredients: normalizeRecipeIngredientsList(recipeData.ingredients),
            id: r.id,
            is_favorite: !!r.is_favorite
        };
    });

    const pantryRes = await db.query(
        'SELECT * FROM pantry WHERE user_id IN (SELECT id FROM users WHERE household_id = $1 OR (household_id IS NULL AND id::text = $1) OR LOWER(email) = LOWER($2)) ORDER BY id ASC',
        [effectiveHousehold, user.email || '']
    );
    const pantry = pantryRes.rows.map(r => ({
        id: r.id,
        user_id: r.user_id,
        name: r.name,
        quantity: r.quantity,
        unit: r.unit,
        category: r.category,
        ...(r.expiry_date ? { expiryDate: r.expiry_date } : {})
    }));

    const mealPlanRes = await db.query(
        `SELECT data FROM meal_plans
         WHERE household_id = $1
            OR household_id = $2
            OR household_id IN (SELECT id::text FROM users WHERE LOWER(email) = LOWER($3))
         ORDER BY updated_at DESC
         LIMIT 1`,
        [effectiveHousehold, String(user.id), user.email || '']
    );
    const mealPlan = mealPlanRes.rows.length > 0
        ? (typeof mealPlanRes.rows[0].data === 'string'
            ? JSON.parse(mealPlanRes.rows[0].data)
            : (mealPlanRes.rows[0].data || {}))
        : {};

    const rawPrefs = typeof user.preferences === 'string'
        ? JSON.parse(user.preferences || '{}')
        : (user.preferences || {});
    const appPrefs = rawPrefs.appPreferences || {};
    const scheduleSettings = {
        scheduleMatrix: appPrefs.scheduleMatrix || null,
        plannerViewMode: appPrefs.plannerViewMode || 'list'
    };

    return {
        connected: true,
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            inviteCode: user.invite_code,
            householdId: effectiveHousehold
        },
        recipes,
        pantry,
        mealPlan,
        scheduleSettings
    };
}

// --- FAMILY HUB CLOUD SYNC (Authenticated via Invite Code or Email) ---

// GET /api/data/hub-sync?code=KS-XXXXXX
router.get('/hub-sync', hubSyncLimiter, async (req, res) => {
    try {
        const code = req.query.code || req.headers['x-hub-sync-code'];
        const resolved = await resolveHubHousehold(code, false);
        if (!resolved) {
            return res.status(404).json({
                error: "No KitchenSync account found for that Invite Code."
            });
        }
        const payload = await buildHubSyncPayload(resolved.user, resolved.effectiveHousehold);
        res.json(payload);
    } catch (e) {
        console.error("Hub Sync GET Error:", e);
        res.status(500).json({ error: "Failed to fetch KitchenSync cloud state" });
    }
});

// POST /api/data/hub-sync (Push updates from Family Hub to KitchenSync Cloud)
router.post('/hub-sync', hubSyncLimiter, async (req, res) => {
    try {
        const code = req.body?.code || req.query.code || req.headers['x-hub-sync-code'];
        const resolved = await resolveHubHousehold(code, false);
        if (!resolved) {
            return res.status(404).json({
                error: "No KitchenSync account found for that Invite Code."
            });
        }

        const { user, effectiveHousehold } = resolved;
        const { mealPlan, pantry, newRecipes, scheduleSettings } = req.body || {};

        if (Array.isArray(newRecipes) && newRecipes.length > 0) {
            for (const r of newRecipes) {
                const { id, ...data } = r;
                if (Array.isArray(data.ingredients)) {
                    data.ingredients = normalizeRecipeIngredientsList(data.ingredients);
                }
                await db.query(
                    'INSERT INTO recipes (user_id, data, is_favorite) VALUES ($1, $2, $3)',
                    [user.id, data, !!r.is_favorite]
                );
            }
        }

        if (mealPlan && typeof mealPlan === 'object') {
            await db.query(
                `INSERT INTO meal_plans (household_id, data, updated_at)
                 VALUES ($1, $2, CURRENT_TIMESTAMP)
                 ON CONFLICT (household_id)
                 DO UPDATE SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP`,
                [effectiveHousehold, JSON.stringify(mealPlan)]
            );
        }

        if (Array.isArray(pantry)) {
            const client = await db.connect();
            try {
                await client.query('BEGIN');
                const existingRes = await client.query(
                    'SELECT id, user_id, name, unit FROM pantry WHERE user_id IN (SELECT id FROM users WHERE household_id = $1 OR (household_id IS NULL AND id::text = $1)) ORDER BY id ASC FOR UPDATE',
                    [effectiveHousehold]
                );
                const existingById = new Map();
                const existingByNameUnit = new Map();
                for (const row of existingRes.rows) {
                    existingById.set(Number(row.id), row);
                    const key = `${String(row.name || '').toLowerCase().trim()}__${String(row.unit || 'each').toLowerCase().trim()}`;
                    if (!existingByNameUnit.has(key)) {
                        existingByNameUnit.set(key, row);
                    }
                }

                const retainedIds = new Set();
                for (const item of pantry) {
                    if (!item || !item.name || Number(item.quantity) <= 0) continue;
                    const name = String(item.name).trim();
                    const qty = Number(item.quantity) || 1;
                    const unit = String(item.unit || 'each').trim();
                    const category = String(item.category || 'Pantry');
                    const expiry = item.expiryDate || item.expiry_date || null;
                    const nameUnitKey = `${name.toLowerCase()}__${unit.toLowerCase()}`;

                    let matchedRow = null;
                    if (item.id && existingById.has(Number(item.id)) && !retainedIds.has(Number(item.id))) {
                        matchedRow = existingById.get(Number(item.id));
                    } else if (existingByNameUnit.has(nameUnitKey)) {
                        const candidate = existingByNameUnit.get(nameUnitKey);
                        if (!retainedIds.has(Number(candidate.id))) {
                            matchedRow = candidate;
                        }
                    }

                    if (matchedRow) {
                        retainedIds.add(Number(matchedRow.id));
                        await client.query(
                            'UPDATE pantry SET name = $1, quantity = $2, unit = $3, category = $4, expiry_date = $5 WHERE id = $6',
                            [name, qty, unit, category, expiry, matchedRow.id]
                        );
                    } else {
                        const insRes = await client.query(
                            'INSERT INTO pantry (user_id, name, quantity, unit, category, expiry_date) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
                            [user.id, name, qty, unit, category, expiry]
                        );
                        retainedIds.add(Number(insRes.rows[0].id));
                    }
                }

                for (const row of existingRes.rows) {
                    if (!retainedIds.has(Number(row.id))) {
                        await client.query('DELETE FROM pantry WHERE id = $1', [row.id]);
                    }
                }

                await client.query('COMMIT');
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
        }

        if (scheduleSettings && typeof scheduleSettings === 'object') {
            const rawPrefs = typeof user.preferences === 'string'
                ? JSON.parse(user.preferences || '{}')
                : (user.preferences || {});
            const mergedPrefs = {
                ...rawPrefs,
                appPreferences: {
                    ...(rawPrefs.appPreferences || {}),
                    ...(scheduleSettings.scheduleMatrix ? { scheduleMatrix: scheduleSettings.scheduleMatrix } : {}),
                    ...(scheduleSettings.plannerViewMode ? { plannerViewMode: scheduleSettings.plannerViewMode } : {})
                }
            };
            await db.query(
                'UPDATE users SET preferences = $1 WHERE id = $2',
                [JSON.stringify(mergedPrefs), user.id]
            );
            user.preferences = mergedPrefs;
        }

        const payload = await buildHubSyncPayload(user, effectiveHousehold);
        res.json(payload);
    } catch (e) {
        console.error("Hub Sync POST Error:", e);
        res.status(500).json({ error: "Failed to push updates to KitchenSync cloud" });
    }
});

router.use(requireAuth);

// --- RECIPES ---

// GET /api/data/recipes
router.get('/recipes', async (req, res) => {
    try {
        const queryStr = 'SELECT * FROM recipes WHERE user_id IN (SELECT id FROM users WHERE household_id = $1 OR (household_id IS NULL AND id::text = $1))';
        const { rows } = await db.query(queryStr, [req.user.effective_household]);
        
        // Parse JSONB data column and normalize ingredients
        const parsed = rows.map(r => {
            const recipeData = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
            return { 
                ...recipeData, 
                ingredients: normalizeRecipeIngredientsList(recipeData.ingredients),
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
    if (Array.isArray(data.ingredients)) {
        data.ingredients = normalizeRecipeIngredientsList(data.ingredients);
    }

    try {
        // Postgres uses JSONB and RETURNING id
        const result = await db.query(
            'INSERT INTO recipes (user_id, data, is_favorite) VALUES ($1, $2, $3) RETURNING id',
            [req.user.id, data, recipe.is_favorite ? true : false]
        );
        res.json({ ...recipe, ...data, id: result.rows[0].id });
    } catch (e) {
        console.error("Add Recipe Error:", e);
        res.status(500).json({ error: "Failed to add recipe" });
    }
});

// PUT /api/data/recipes/:id (Update)
router.put('/recipes/:id', async (req, res) => {
    const recipe = req.body;
    const { id, ...data } = recipe;
    if (Array.isArray(data.ingredients)) {
        data.ingredients = normalizeRecipeIngredientsList(data.ingredients);
    }

    try {
        const queryStr = `
            UPDATE recipes
            SET data = $1, is_favorite = $2
            WHERE id = $3 AND user_id IN (
                SELECT id FROM users WHERE household_id = $4 OR (household_id IS NULL AND id::text = $4)
            )
            RETURNING id, data, is_favorite
        `;
        const result = await db.query(queryStr, [
            data,
            !!recipe.is_favorite,
            req.params.id,
            req.user.effective_household
        ]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Recipe not found" });
        }

        const row = result.rows[0];
        const recipeData = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
        res.json({ ...recipeData, id: row.id, is_favorite: !!row.is_favorite });
    } catch (e) {
        console.error("Update Recipe Error:", e);
        res.status(500).json({ error: "Failed to update recipe" });
    }
});

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
        const queryStr = 'SELECT * FROM pantry WHERE user_id IN (SELECT id FROM users WHERE household_id = $1 OR (household_id IS NULL AND id::text = $1)) ORDER BY id ASC';
        const { rows } = await db.query(queryStr, [req.user.effective_household]);
        const mapped = rows.map(r => ({
            id: r.id,
            user_id: r.user_id,
            name: r.name,
            quantity: r.quantity,
            unit: r.unit,
            category: r.category,
            ...(r.expiry_date ? { expiryDate: r.expiry_date } : {})
        }));
        res.json(mapped);
    } catch (e) {
        console.error("Fetch Pantry Error:", e);
        res.status(500).json({ error: "Failed to fetch pantry" });
    }
});

// POST /api/data/pantry (Sync/Add)
router.post('/pantry', async (req, res) => {
    const item = req.body;
    const expiry = item.expiryDate || item.expiry_date || null;

    try {
        const result = await db.query(
            'INSERT INTO pantry (user_id, name, quantity, unit, category, expiry_date) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
            [req.user.id, item.name, item.quantity ?? 1, item.unit || 'unit', item.category || 'Other', expiry]
        );
        res.json({
            ...item,
            id: result.rows[0].id,
            ...(expiry ? { expiryDate: expiry } : {})
        });
    } catch (e) {
        console.error("Add Pantry Error:", e);
        res.status(500).json({ error: "Failed to add pantry item" });
    }
});

// POST /api/data/pantry/batch (Batch Add)
router.post('/pantry/batch', async (req, res) => {
    const items = Array.isArray(req.body) ? req.body : (req.body.items || []);
    if (!Array.isArray(items) || items.length === 0) {
        return res.json([]);
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const created = [];
        for (const item of items) {
            const expiry = item.expiryDate || item.expiry_date || null;
            const result = await client.query(
                'INSERT INTO pantry (user_id, name, quantity, unit, category, expiry_date) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
                [req.user.id, item.name, item.quantity ?? 1, item.unit || 'unit', item.category || 'Other', expiry]
            );
            created.push({
                name: item.name,
                quantity: item.quantity ?? 1,
                unit: item.unit || 'unit',
                category: item.category || 'Other',
                ...(expiry ? { expiryDate: expiry } : {}),
                id: result.rows[0].id
            });
        }
        await client.query('COMMIT');
        res.json(created);
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Batch Add Pantry Error:", e);
        res.status(500).json({ error: "Failed to batch add pantry items" });
    } finally {
        client.release();
    }
});

// PUT /api/data/pantry/:id (Update item)
router.put('/pantry/:id', async (req, res) => {
    const item = req.body;
    const expiry = item.expiryDate !== undefined ? item.expiryDate : (item.expiry_date !== undefined ? item.expiry_date : null);

    try {
        const queryStr = `
            UPDATE pantry
            SET name = COALESCE($1, name),
                quantity = COALESCE($2, quantity),
                unit = COALESCE($3, unit),
                category = COALESCE($4, category),
                expiry_date = COALESCE($5, expiry_date)
            WHERE id = $6 AND user_id IN (
                SELECT id FROM users WHERE household_id = $7 OR (household_id IS NULL AND id::text = $7)
            )
            RETURNING *
        `;
        const result = await db.query(queryStr, [
            item.name,
            item.quantity,
            item.unit,
            item.category,
            expiry,
            req.params.id,
            req.user.effective_household
        ]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Pantry item not found" });
        }

        const r = result.rows[0];
        res.json({
            id: r.id,
            name: r.name,
            quantity: r.quantity,
            unit: r.unit,
            category: r.category,
            ...(r.expiry_date ? { expiryDate: r.expiry_date } : {})
        });
    } catch (e) {
        console.error("Update Pantry Error:", e);
        res.status(500).json({ error: "Failed to update pantry item" });
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

// --- MEAL PLAN ---

// GET /api/data/meal-plan
router.get('/meal-plan', async (req, res) => {
    try {
        const { rows } = await db.query(
            'SELECT data FROM meal_plans WHERE household_id = $1',
            [req.user.effective_household]
        );
        if (rows.length === 0) {
            return res.json({});
        }
        const planData = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : (rows[0].data || {});
        res.json(planData);
    } catch (e) {
        console.error("Fetch Meal Plan Error:", e);
        res.status(500).json({ error: "Failed to fetch meal plan" });
    }
});

// PUT /api/data/meal-plan
router.put('/meal-plan', async (req, res) => {
    const plan = req.body || {};
    try {
        await db.query(
            `INSERT INTO meal_plans (household_id, data, updated_at)
             VALUES ($1, $2, CURRENT_TIMESTAMP)
             ON CONFLICT (household_id)
             DO UPDATE SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP`,
            [req.user.effective_household, JSON.stringify(plan)]
        );
        res.json({ success: true });
    } catch (e) {
        console.error("Save Meal Plan Error:", e);
        res.status(500).json({ error: "Failed to save meal plan" });
    }
});

// --- SHOPPING LIST ---

// GET /api/data/shopping
router.get('/shopping', async (req, res) => {
    try {
        const queryStr = 'SELECT * FROM shopping_list WHERE user_id IN (SELECT id FROM users WHERE household_id = $1 OR (household_id IS NULL AND id::text = $1))';
        const { rows } = await db.query(queryStr, [req.user.effective_household]);
        res.json(rows);
    } catch (e) {
        console.error("Fetch Shopping List Error:", e);
        res.status(500).json({ error: "Failed to fetch shopping list" });
    }
});

// POST /api/data/shopping (Add manual item)
router.post('/shopping', async (req, res) => {
    const item = req.body;

    try {
        const result = await db.query(
            'INSERT INTO shopping_list (user_id, name, quantity, unit, category) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [req.user.id, item.name, item.quantity, item.unit, item.category]
        );
        res.json({ ...item, id: result.rows[0].id });
    } catch (e) {
        console.error("Add Shopping Item Error:", e);
        res.status(500).json({ error: "Failed to add shopping item" });
    }
});

// DELETE /api/data/shopping/:id
router.delete('/shopping/:id', async (req, res) => {
    try {
        const queryStr = 'DELETE FROM shopping_list WHERE id = $1 AND user_id IN (SELECT id FROM users WHERE household_id = $2 OR (household_id IS NULL AND id::text = $2))';
        await db.query(queryStr, [req.params.id, req.user.effective_household]);
        res.json({ success: true });
    } catch (e) {
        console.error("Delete Shopping Item Error:", e);
        res.status(500).json({ error: "Failed to delete shopping item" });
    }
});

module.exports = router;
