const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/auth/me (Sync & Return Profile)
router.get('/me', requireAuth, (req, res) => {
    // Middleware handles JIT provisioning and linking now.
    // req.user should be the full user object.

    const user = req.user;

    if (!user || !user.id) {
        // Should catch cases where JIT failed
        console.error("User resolution failed in middleware for /me", req.authLog);
        return res.status(500).json({ error: "Failed to sync user", trace: req.authLog });
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
            subscription_tier: user.subscription_tier,
            credits: user.credits,
            kitchenName: user.kitchen_name, // if exists
            preferences: preferences,
            payment_status: user.subscription_tier
        }
    });
});

// POST /api/auth/login (Dev Mode)
router.post('/login', (req, res) => {
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

// POST /api/auth/link (Link Accounts into a Household)
router.post('/link', requireAuth, async (req, res) => {
    const { targetEmail } = req.body;
    const currentUser = req.user;

    if (!targetEmail) {
        return res.status(400).json({ error: "Target email is required" });
    }

    if (targetEmail.toLowerCase() === currentUser.email.toLowerCase()) {
        return res.status(400).json({ error: "Cannot link to yourself" });
    }

    try {
        const result = await db.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [targetEmail.toLowerCase()]);
        const targetUser = result.rows[0];

        if (!targetUser) {
            return res.status(404).json({ error: "User with that email not found" });
        }

        const targetHousehold = targetUser.household_id || String(targetUser.id);
        const myHousehold = currentUser.household_id || String(currentUser.id);

        if (targetHousehold === myHousehold) {
            return res.status(400).json({ error: "Accounts are already linked" });
        }

        // Update current user
        await db.query('UPDATE users SET household_id = $1 WHERE id = $2', [targetHousehold, currentUser.id]);
        
        // Ensure target user also has the matching formal identifier
        await db.query('UPDATE users SET household_id = $1 WHERE id = $2', [targetHousehold, targetUser.id]);

        res.json({ success: true, message: `Successfully linked your account to ${targetEmail}` });
    } catch (e) {
        console.error("Link Account Error:", e);
        res.status(500).json({ error: "Failed to link accounts" });
    }
});

// GET /api/auth/diagnostics
router.get('/diagnostics', (req, res) => {
    res.json(global.recentAuthLogs || []);
});

module.exports = router;
