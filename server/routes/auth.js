const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/auth/me (Sync & Return Profile)
router.get('/me', requireAuth, async (req, res) => {
    // Middleware handles JIT provisioning and linking now.
    // req.user should be the full user object.

    const user = req.user;

    if (!user || !user.id) {
        // Should catch cases where JIT failed
        console.error("User resolution failed in middleware for /me", req.authLog);
        return res.status(500).json({ error: "Failed to sync user", trace: req.authLog });
    }

    // Check shared household subscription
    const householdId = user.household_id || String(user.id);
    const householdResult = await db.query('SELECT subscription_tier FROM users WHERE household_id = $1 OR id = $2', [householdId, user.id]);
    let effectiveTier = user.subscription_tier;
    let effectiveCredits = user.credits;
    
    for (const hUser of householdResult.rows) {
        if (hUser.subscription_tier === 'pro') {
            effectiveTier = 'pro';
            effectiveCredits = '∞';
        }
    }

    // JSONB in Postgres might already be an object, handle both cases
    const preferences = typeof user.preferences === 'string' 
        ? JSON.parse(user.preferences || '{}') 
        : (user.preferences || {});

    // Return the local DB profile (permissions, credits, tier)
    // We merge this with Auth0 profile on frontend
    res.json({
        user: {
            id: user.id,
            username: user.username,
            email: user.email,
            subscription_tier: effectiveTier,
            credits: effectiveCredits,
            kitchenName: user.kitchen_name, // if exists
            inviteCode: user.invite_code,
            preferences: preferences,
            payment_status: effectiveTier
        }
    });
});

// POST /api/auth/login (Dev Mode)
router.post('/login', (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ error: "Dev login is disabled in production" });
    }
    const { username } = req.body;

    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString('base64');
    const payload = Buffer.from(JSON.stringify({
        sub: username || 'dev_user',
        name: username || 'Dev Chef',
        email: (username || 'dev') + '@kitchensync.local',
        iss: 'https://dev.kitchensync.local/',
        aud: 'kitchensync-api',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24h
    })).toString('base64');

    const token = `${header}.${payload}.signature_skipped_for_local_dev`;

    res.json({
        access_token: token,
        token_type: 'Bearer',
        expires_in: 86400
    });
});

// POST /api/auth/link (Link Accounts into a Household via Invite Code)
router.post('/link', requireAuth, async (req, res) => {
    const { inviteCode } = req.body;
    const currentUser = req.user;

    if (!inviteCode || typeof inviteCode !== 'string' || !inviteCode.trim()) {
        return res.status(400).json({ error: "A valid Household Invite Code is required" });
    }

    const normalizedCode = inviteCode.trim().toUpperCase();

    try {
        const result = await db.query('SELECT * FROM users WHERE UPPER(invite_code) = $1', [normalizedCode]);
        const targetUser = result.rows[0];

        if (!targetUser) {
            return res.status(404).json({ error: "No household found with that Invite Code" });
        }

        if (targetUser.id === currentUser.id) {
            return res.status(400).json({ error: "Cannot link to your own invite code" });
        }

        const targetHousehold = targetUser.household_id || String(targetUser.id);
        const myHousehold = currentUser.household_id || String(currentUser.id);

        if (targetHousehold === myHousehold) {
            return res.status(400).json({ error: "Accounts are already linked in the same household" });
        }

        // Merge Meal Plans from both households so neither partner loses planned meals
        try {
            const plansRes = await db.query(
                'SELECT household_id, data FROM meal_plans WHERE household_id IN ($1, $2)',
                [myHousehold, targetHousehold]
            );
            if (plansRes.rows.length > 0) {
                const mergedPlan = {};
                for (const row of plansRes.rows) {
                    const pData = typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {});
                    for (const [dateStr, daySlots] of Object.entries(pData)) {
                        if (!mergedPlan[dateStr]) {
                            mergedPlan[dateStr] = { Breakfast: [], Lunch: [], Dinner: [], Snack: [] };
                        }
                        for (const [slot, items] of Object.entries(daySlots || {})) {
                            if (Array.isArray(items)) {
                                mergedPlan[dateStr][slot] = [...(mergedPlan[dateStr][slot] || []), ...items];
                            }
                        }
                    }
                }
                await db.query(
                    `INSERT INTO meal_plans (household_id, data, updated_at)
                     VALUES ($1, $2, CURRENT_TIMESTAMP)
                     ON CONFLICT (household_id)
                     DO UPDATE SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP`,
                    [targetHousehold, JSON.stringify(mergedPlan)]
                );
            }
        } catch (mergeErr) {
            console.warn("Non-fatal error merging meal plans during household link:", mergeErr);
        }

        // Update current user (and any members already in myHousehold) to join targetHousehold
        await db.query(
            'UPDATE users SET household_id = $1 WHERE id = $2 OR household_id = $3',
            [targetHousehold, currentUser.id, myHousehold]
        );

        // Ensure target user also has the matching formal identifier
        await db.query('UPDATE users SET household_id = $1 WHERE id = $2', [targetHousehold, targetUser.id]);

        res.json({ success: true, message: `Successfully linked your household with ${targetUser.username || targetUser.email}!` });
    } catch (e) {
        console.error("Link Account Error:", e);
        res.status(500).json({ error: "Failed to link accounts" });
    }
});

// GET /api/auth/diagnostics
router.get('/diagnostics', (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ error: "Diagnostics disabled in production" });
    }
    res.json(global.recentAuthLogs || []);
});

module.exports = router;
