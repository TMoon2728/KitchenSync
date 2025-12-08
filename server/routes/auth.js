const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-do-not-use-in-prod';

// Helper
const getUser = (email) => {
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
};

const createUser = (username, email, hash) => {
    const stmt = db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)');
    return stmt.run(username, email, hash);
};

// POST /api/auth/register
router.post('/register', async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ error: "Missing fields" });
    }

    const existing = getUser(email);
    if (existing) {
        return res.status(409).json({ error: "Email already exists" });
    }

    try {
        const hash = await bcrypt.hash(password, 10);
        const info = createUser(username, email, hash);

        // Auto-login
        const token = jwt.sign({ id: info.lastInsertRowid, email }, JWT_SECRET, { expiresIn: '7d' });

        // Return profile
        const user = db.prepare('SELECT id, username, email, subscription_tier, credits, preferences FROM users WHERE id = ?').get(info.lastInsertRowid);

        res.json({ token, user: { ...user, preferences: JSON.parse(user.preferences) } });
    } catch (e) {
        console.error("Register Error:", e);
        res.status(500).json({ error: "Registration failed", details: e.message });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    const user = getUser(email);
    if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
        return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
        token,
        user: {
            id: user.id,
            username: user.username,
            email: user.email,
            subscription_tier: user.subscription_tier,
            credits: user.credits,
            preferences: JSON.parse(user.preferences)
        }
    });
});

// GET /api/auth/me (Verify Token)
router.get('/me', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "No token" });

    const token = authHeader.split(' ')[1];
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        const user = db.prepare('SELECT id, username, email, subscription_tier, credits, preferences FROM users WHERE id = ?').get(payload.id);

        if (!user) return res.status(404).json({ error: "User not found" });

        res.json({ user: { ...user, preferences: JSON.parse(user.preferences) } });
    } catch (e) {
        res.status(401).json({ error: "Invalid token" });
    }
});

module.exports = router;
