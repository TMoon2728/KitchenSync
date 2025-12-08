const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

// Helper to get or create user based on Auth0 Token
const syncUser = (auth0User) => {
    // auth0User comes from the JWT payload.
    // It usually has 'sub' (auth0|123456).
    // We might not have email in the access token unless we added a rule/action in Auth0.
    // But we need to link them. For now, let's assume we use 'sub' as username or a new column 'auth0_id'.
    // OR, we blindly trust the email if the token has it (requires scope 'email').

    // For simplicity in this migration without changing DB schema too much:
    // We will try to match by 'sub' (stored in password_hash temporarily?) OR just create a new one.
    // Actually, let's use the 'username' column for the Auth0 ID ('sub').

    const auth0Id = auth0User.sub;

    // Check if user exists by Auth0 ID (which we'll store in username or a new column check)
    // Legacy users: we can't easily auto-link unless we match email.
    // Let's matching by username = auth0Id for new users.

    let user = db.prepare('SELECT * FROM users WHERE username = ?').get(auth0Id);

    if (!user) {
        // Create new
        const stmt = db.prepare('INSERT INTO users (username, email, password_hash, preferences) VALUES (?, ?, ?, ?)');
        // email might be missing if not invalid scope, fallback to sub
        const email = auth0User.email || `${auth0Id}@auth0.placeholder`;
        try {
            // We store Auth0 ID in password_hash as a marker (hacky but works for no-schema-change)
            // And username = Auth0 ID
            stmt.run(auth0Id, email, 'auth0-linked', JSON.stringify({}));
            user = db.prepare('SELECT * FROM users WHERE username = ?').get(auth0Id);
        } catch (e) {
            // Unlikely collision unless email taken by legacy user
            console.error("Sync Create Error", e);
            return null;
        }
    }

    return user;
};

// GET /api/auth/me (Sync & Return Profile)
router.get('/me', requireAuth, (req, res) => {
    // req.user is the Auth0 payload (sub, aud, iat, etc.)
    // If we configured Auth0 to include email, it's here.

    // If middleware already resolved the user, skip sync
    let user = null;
    if (req.user && req.user.id) {
        user = req.user;
    } else {
        // Fallback if middleware passed raw auth payload
        user = syncUser(req.user);
    }

    if (!user) {
        return res.status(500).json({ error: "Failed to sync user" });
    }

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
            preferences: JSON.parse(user.preferences || '{}'),
            payment_status: user.subscription_tier
        }
    });
});

module.exports = router;
