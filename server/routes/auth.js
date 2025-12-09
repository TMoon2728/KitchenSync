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
        // Should catch cases where JIT failed
        console.error("User resolution failed in middleware for /me", req.authLog);
        return res.status(500).json({ error: "Failed to sync user", trace: req.authLog });
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
