const { auth } = require('express-oauth2-jwt-bearer');
const db = require('../db');

// Configured via Envs or defaults
const jwtCheck = auth({
    audience: process.env.AUTH0_AUDIENCE,
    issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
    tokenSigningAlg: 'RS256'
});

const populateUser = async (req, res, next) => {
    req.authLog = req.authLog || [];
    const payload = req.auth.payload || req.auth;
    const auth0Id = payload.sub;

    req.authLog.push(`Sub resolved: ${auth0Id}`);

    if (auth0Id) {
        // 1. Try to find by Auth0 ID
        let user = db.prepare('SELECT * FROM users WHERE username = ?').get(auth0Id);

        if (user) {
            req.authLog.push("User found by ID.");
        } else {
            req.authLog.push("User NOT found by ID. Attempting linking.");

            // 2. Fetch Email
            let email = payload.email;
            if (!email && req.headers['authorization'] && !req.headers['authorization'].includes('eyJhbGciOiJub25lIi')) {
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
                    // Sometimes email is in a custom namespace in Auth0, or directly on payload
                    const resolvedEmail = email || payload['https://kitchensync.com/email'] || payload.email || `${auth0Id}@auth0.placeholder`;

                    // Auto-Provision Admin
                    const isAdmin = auth0Id === 'admin';
                    const tier = isAdmin ? 'pro' : 'free';
                    const credits = isAdmin ? 9999 : 5;

                    db.prepare('INSERT INTO users (username, email, password_hash, subscription_tier, credits, preferences) VALUES (?, ?, ?, ?, ?, ?)')
                        .run(auth0Id, resolvedEmail, 'auth0-linked', tier, credits, JSON.stringify({}));

                    user = db.prepare('SELECT * FROM users WHERE username = ?').get(auth0Id);
                    req.authLog.push(user ? "JIT Success." : "JIT Inserted but Select failed?");
                } catch (e) {
                    req.authLog.push(`JIT Failed: ${e.message}`);
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
};

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    console.log(`[Token Check] URL: ${req.url}, Header: ${authHeader?.substring(0, 50)}...`);

    if (!authHeader) {
        console.log("[Token Check] No auth header, continuing.");
        return next();
    }

    if (process.env.NODE_ENV !== 'production' && authHeader && authHeader.startsWith('Bearer eyJhbGciOiJub25lIi')) {
        console.log("[Token Check] Dev Token match successful.");
        const token = authHeader.split(' ')[1];
        try {
            const parts = token.split('.');
            console.log("[Token Check] Base64 decoding payload...");
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
            req.auth = payload;
            req.authLog = [];
            return populateUser(req, res, next);
        } catch (e) {
            console.error("Dev Token Parse Error", e);
        }
    } else {
        console.log(`[Token Check] Dev logic false. NODE_ENV=${process.env.NODE_ENV}, startsWith=${authHeader.startsWith('Bearer eyJhbGciOiJub25lIi')}`);
    }

    jwtCheck(req, res, async (err) => {
        if (err) {
            console.warn("Auth0 Token Invalid:", err.message);
            return next();
        }

        req.authLog = [];
        const keys = Object.keys(req.auth || {});
        req.authLog.push(`Token verified. Keys: ${keys.join(',')}`);

        return populateUser(req, res, next);
    });
};

const requireAuth = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    next();
};

module.exports = { authenticateToken, requireAuth, jwtCheck };
