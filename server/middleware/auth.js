const { auth } = require('express-oauth2-jwt-bearer');
const db = require('../db');

// Configured via Envs or defaults
const jwtCheck = auth({
    audience: process.env.AUTH0_AUDIENCE,
    issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
    tokenSigningAlg: 'RS256'
});

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return next();

    jwtCheck(req, res, async (err) => {
        if (err) {
            console.warn("Auth0 Token Invalid:", err.message);
            return next();
        }

        // Initialize Debug Log
        req.authLog = [];
        req.authLog.push(`Token verified. Sub: ${req.auth.sub}`);

        const auth0Id = req.auth.sub;

        if (auth0Id) {
            // 1. Try to find by Auth0 ID
            let user = db.prepare('SELECT * FROM users WHERE username = ?').get(auth0Id);

            if (user) {
                req.authLog.push("User found by ID.");
            } else {
                req.authLog.push("User NOT found by ID. Attempting linking.");

                // 2. Fetch Email
                let email = req.auth.email;
                if (!email) {
                    req.authLog.push("Email missing in token. Fetching /userinfo...");
                    try {
                        const userInfoUrl = `${process.env.AUTH0_ISSUER_BASE_URL}/userinfo`;
                        const userRes = await fetch(userInfoUrl, {
                            headers: { Authorization: req.headers['authorization'] }
                        });

                        if (userRes.ok) {
                            const profile = await userRes.json();
                            email = profile.email;
                            req.authLog.push(`Fetched /userinfo. Email: ${email}`);
                        } else {
                            req.authLog.push(`Fetch failed status: ${userRes.status}`);
                        }
                    } catch (fetchErr) {
                        req.authLog.push(`Fetch error: ${fetchErr.message}`);
                    }
                }

                // 2b. Link if email found
                if (email) {
                    user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
                    if (user) {
                        req.authLog.push(`Found legacy user by email. Linking to ${auth0Id}.`);
                        try {
                            db.prepare('UPDATE users SET username = ? WHERE id = ?').run(auth0Id, user.id);
                            user.username = auth0Id;
                        } catch (e) {
                            req.authLog.push(`Linking failed: ${e.message}`);
                        }
                    } else {
                        req.authLog.push("No legacy user found by email.");
                    }
                }

                // 3. Create New
                if (!user) {
                    req.authLog.push("Attempting JIT Insert.");
                    try {
                        const newEmail = email || `${auth0Id}@auth0.placeholder`;
                        db.prepare('INSERT INTO users (username, email, password_hash, preferences) VALUES (?, ?, ?, ?)')
                            .run(auth0Id, newEmail, 'auth0-linked', JSON.stringify({}));

                        user = db.prepare('SELECT * FROM users WHERE username = ?').get(auth0Id);
                        req.authLog.push(user ? "JIT Success." : "JIT Inserted but Select failed?");
                    } catch (e) {
                        req.authLog.push(`JIT Failed: ${e.message}`);
                        // Try select again in case of race env
                        user = db.prepare('SELECT * FROM users WHERE username = ?').get(auth0Id);
                    }
                }
            }

            if (user) {
                req.user = user;
            } else {
                req.authLog.push("Final resolution: User is null.");
                req.user = req.auth;
            }
        } else {
            req.authLog.push("No sub in token.");
            req.user = req.auth;
        }

        console.log("[AuthDebug]", req.authLog);
        next();
    });
};

const requireAuth = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    next();
};

module.exports = { authenticateToken, requireAuth, jwtCheck };
