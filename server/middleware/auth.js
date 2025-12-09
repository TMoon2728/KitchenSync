const { auth } = require('express-oauth2-jwt-bearer');
const db = require('../db');

// Configured via Envs or defaults
const jwtCheck = auth({
    audience: process.env.AUTH0_AUDIENCE,
    issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
    tokenSigningAlg: 'RS256'
});

// Middleware that attaches user to req.auth
// Note: express-oauth2-jwt-bearer attaches payload to req.auth, not req.user
const authenticateToken = (req, res, next) => {
    // If we want to allow public access but parse token if present:
    // This library throws 401 if token is invalid/missing by default if used as middleware.
    // For "optional" auth, we'd need a wrapper. For now, let's assume global protection or per-route.

    // We'll wrap it to not crash if no token, assuming we want optional global middleware?
    // Actually, usually we mount it on specific routes. 
    // But the app uses it globally. Let's make it pass if no header, but verify if header exists.

    const authHeader = req.headers['authorization'];
    if (!authHeader) return next();

    jwtCheck(req, res, async (err) => {
        if (err) {
            // Token invalid - allow public but log warn? Or fail?
            console.warn("Auth0 Token Invalid:", err.message);
            return next();
        }

        console.log("[AuthMiddleware] Token payload:", req.auth);

        // Success - req.auth is populated with JWT payload (e.g. sub, iss)
        const auth0Id = req.auth.sub;

        if (auth0Id) {
            // 1. Try to find by Auth0 ID (Username)
            let user = db.prepare('SELECT * FROM users WHERE username = ?').get(auth0Id);

            if (!user) {
                // 2. User not found by ID. Need Email for Legacy Linking.
                // Access Token might not have email. Fetch from Auth0 /userinfo to be sure.
                let email = req.auth.email;

                if (!email) {
                    try {
                        // Use the issuer URL to construct userinfo endpoint
                        // AUTH0_ISSUER_BASE_URL usually looks like https://dev-xyz.us.auth0.com
                        const userInfoUrl = `${process.env.AUTH0_ISSUER_BASE_URL}/userinfo`;

                        // We use the same Access Token to fetch the profile
                        const userRes = await fetch(userInfoUrl, {
                            headers: { Authorization: req.headers['authorization'] }
                        });

                        if (userRes.ok) {
                            const profile = await userRes.json();
                            email = profile.email;
                            console.log(`[AuthMiddleware] Fetched email from /userinfo: ${email}`);
                        } else {
                            console.warn(`[AuthMiddleware] /userinfo fetch failed: ${userRes.status}`);
                        }
                    } catch (fetchErr) {
                        console.error("[AuthMiddleware] Failed to fetch /userinfo", fetchErr);
                    }
                }

                if (email) {
                    user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
                    if (user) {
                        // Found legacy user! Link them by updating username to Auth0 ID
                        console.log(`[AuthMiddleware] Linking legacy user ${email} to ${auth0Id}`);
                        try {
                            db.prepare('UPDATE users SET username = ? WHERE id = ?').run(auth0Id, user.id);
                            user.username = auth0Id; // Update local object
                        } catch (e) {
                            console.error("[AuthMiddleware] Linking failed", e);
                        }
                    }
                }

                // 3. Still not found? Create new user (JIT Provisioning)
                if (!user) {
                    try {
                        const newEmail = email || `${auth0Id}@auth0.placeholder`;
                        db.prepare('INSERT INTO users (username, email, password_hash, preferences) VALUES (?, ?, ?, ?)')
                            .run(auth0Id, newEmail, 'auth0-linked', JSON.stringify({}));

                        user = db.prepare('SELECT * FROM users WHERE username = ?').get(auth0Id);
                        console.log(`[AuthMiddleware] JIT Provisioned user: ${auth0Id}`);
                    } catch (e) {
                        // Handle race condition: Unique constraint failed if created by another request in parallel
                        console.warn("[AuthMiddleware] User creation error (likely race condition or unique constraint)", e.message);
                        user = db.prepare('SELECT * FROM users WHERE username = ?').get(auth0Id);
                    }
                }
            }

            if (user) {
                req.user = user;
            } else {
                console.error(`[AuthMiddleware] Failed to resolve user for ${auth0Id}`);
                req.user = req.auth;
            }
        } else {
            req.user = req.auth;
        }

        next();
    });
};

const requireAuth = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    next();
};

module.exports = { authenticateToken, requireAuth, jwtCheck };
