const { auth } = require('express-oauth2-jwt-bearer');
const crypto = require('crypto');
const db = require('../db');

const generateInviteCode = () => 'KS-' + crypto.randomBytes(4).toString('hex').toUpperCase();

// Cache /userinfo lookups (including negative lookups) for 15 minutes per Auth0 sub
// to prevent blocking every request or hitting Auth0 rate limits (429).
const userInfoCache = new Map();
const USERINFO_CACHE_TTL_MS = 15 * 60 * 1000;

const isDevTokenAllowed = () =>
    process.env.NODE_ENV !== 'production' &&
    !process.env.RENDER &&
    (process.env.NODE_ENV === 'development' || process.env.ALLOW_DEV_TOKENS === 'true' || !process.env.AUTH0_ISSUER_BASE_URL);

// Configured via Envs or defaults (graceful fallback if local dev lacks Auth0 env vars)
const jwtCheck = (process.env.AUTH0_ISSUER_BASE_URL && process.env.AUTH0_AUDIENCE)
    ? auth({
        audience: process.env.AUTH0_AUDIENCE,
        issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
        tokenSigningAlg: 'RS256'
    })
    : (req, res, next) => next(new Error('Auth0 RS256 is not configured in environment'));

// Quick global log for diagnostics
global.recentAuthLogs = global.recentAuthLogs || [];

const findUserWithHouseholdTier = async (whereClause, params) => {
    const res = await db.query(
        `SELECT u.*,
                EXISTS (
                    SELECT 1 FROM users h
                    WHERE (h.household_id = COALESCE(u.household_id, u.id::text) OR h.id::text = u.household_id)
                      AND h.subscription_tier = 'pro'
                ) AS household_has_pro
         FROM users u
         WHERE ${whereClause}`,
        params
    );
    return res.rows[0] || null;
};

const populateUser = async (req, res, next) => {
    req.authLog = req.authLog || [];
    const payload = req.auth.payload || req.auth;
    const auth0Id = payload.sub;

    req.authLog.push(`Sub resolved: ${auth0Id}`);

    if (auth0Id) {
        // 1. Try to find by Auth0 ID (including single-query household pro tier resolution)
        let user = await findUserWithHouseholdTier('u.username = $1', [auth0Id]);

        if (user) {
            req.authLog.push("User found by ID.");
        }
        
        // We ALWAYS want to fetch the email if it's missing from the payload, 
        // even if the user is found, so we can repair placeholder emails.
        if (!user || (user && user.email.includes('placeholder'))) {
            req.authLog.push(user ? "User has placeholder email. Fetching real email..." : "User NOT found by ID. Attempting linking.");

            // 2. Fetch Email
            let email = payload.email;
            
            // Self-healing Part A: The token HAS the correct email, but the DB is stuck with a placeholder
            if (email && user && user.email.includes('placeholder')) {
                req.authLog.push(`Repairing placeholder email directly from payload ${user.email} -> ${email}`);
                await db.query('UPDATE users SET email = $1 WHERE id = $2', [email, user.id]);
                user.email = email;
            }

            // Self-healing Part B: The token DOES NOT have the email, we must fetch it (with TTL cache & timeout)
            if (!email && req.headers['authorization'] && !req.headers['authorization'].includes('eyJhbGciOiJub25lIi')) {
                const cachedEntry = userInfoCache.get(auth0Id);
                if (cachedEntry && (Date.now() - cachedEntry.timestamp < USERINFO_CACHE_TTL_MS)) {
                    email = cachedEntry.email;
                    req.authLog.push(`Used cached /userinfo result. Email: ${email || 'none'}`);
                } else {
                    req.authLog.push("Email missing in token. Fetching /userinfo...");
                    try {
                        const baseUrl = process.env.AUTH0_ISSUER_BASE_URL.replace(/\/$/, '');
                        const userInfoUrl = `${baseUrl}/userinfo`;
                        const userRes = await fetch(userInfoUrl, {
                            headers: { Authorization: req.headers['authorization'] },
                            signal: AbortSignal.timeout(4000)
                        });

                        if (userRes.ok) {
                            const profile = await userRes.json();
                            email = profile.email || null;
                            userInfoCache.set(auth0Id, { email, timestamp: Date.now() });
                            req.authLog.push(`Fetched /userinfo. Email: ${email}`);

                            // Self-healing Part C: Update the DB with the fetched email
                            if (user && email && user.email.includes('placeholder')) {
                                req.authLog.push(`Repairing placeholder email from fetch ${user.email} -> ${email}`);
                                await db.query('UPDATE users SET email = $1 WHERE id = $2', [email, user.id]);
                                user.email = email;
                            }
                        } else {
                            userInfoCache.set(auth0Id, { email: null, timestamp: Date.now() });
                            req.authLog.push(`Fetch failed status: ${userRes.status}`);
                        }
                    } catch (fetchErr) {
                        userInfoCache.set(auth0Id, { email: null, timestamp: Date.now() });
                        req.authLog.push(`Fetch error: ${fetchErr.message}`);
                    }
                }
            }

            // 2b. Link if email found
            if (email) {
                user = await findUserWithHouseholdTier('LOWER(u.email) = LOWER($1)', [email.toLowerCase()]);

                if (user) {
                    req.authLog.push(`Found legacy user by email. Linking to ${auth0Id}.`);
                    try {
                        await db.query('UPDATE users SET username = $1 WHERE id = $2', [auth0Id, user.id]);
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

                    const tier = 'free';
                    const credits = 10;
                    const inviteCode = generateInviteCode();

                    await db.query(
                        'INSERT INTO users (username, email, password_hash, subscription_tier, credits, preferences, invite_code) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                        [auth0Id, resolvedEmail, 'auth0-linked', tier, credits, JSON.stringify({}), inviteCode]
                    );

                    user = await findUserWithHouseholdTier('u.username = $1', [auth0Id]);
                    req.authLog.push(user ? "JIT Success." : "JIT Inserted but Select failed?");
                } catch (e) {
                    req.authLog.push(`JIT Failed: ${e.message}`);
                    user = await findUserWithHouseholdTier('u.username = $1', [auth0Id]);
                }
            }
        }

        if (user) {
            if (!user.invite_code) {
                const newInviteCode = generateInviteCode();
                try {
                    await db.query('UPDATE users SET invite_code = $1 WHERE id = $2', [newInviteCode, user.id]);
                    user.invite_code = newInviteCode;
                } catch (e) {
                    req.authLog.push(`Invite code backfill skipped: ${e.message}`);
                }
            }
            // Auto-grant admin to the owner specifically (fallback to Auth0 ID if email missing)
            if ((user.email === 'tmoon2728@gmail.com' || user.email === 'moonimages@hotmail.com' || user.username === 'google-oauth2|114194546667526169200') && user.subscription_tier !== 'pro') {
                try {
                    await db.query('UPDATE users SET subscription_tier = $1, credits = $2 WHERE id = $3', ['pro', 999999, user.id]);
                    user.subscription_tier = 'pro';
                    user.credits = 999999;
                    req.authLog.push(`Auto-upgraded ${user.email} to PRO admin.`);
                } catch (e) {
                    req.authLog.push(`Failed auto-upgrade: ${e.message}`);
                }
            }
            user.effective_household = user.household_id || String(user.id);
            user.effective_subscription_tier = (user.subscription_tier === 'pro' || user.household_has_pro)
                ? 'pro'
                : user.subscription_tier;
            req.user = user;
        } else {
            req.authLog.push("Final resolution: User is null.");
            req.user = null;
        }
    } else {
        req.authLog.push("No sub in token.");
        req.user = null;
    }

    // Store last 50 logs globally
    global.recentAuthLogs.unshift({ time: new Date().toISOString(), log: req.authLog });
    if (global.recentAuthLogs.length > 50) global.recentAuthLogs.pop();

    next();
};

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];

    if (!authHeader) {
        return next();
    }

    if (isDevTokenAllowed() && authHeader && authHeader.startsWith('Bearer eyJhbGciOiJub25lIi')) {
        const token = authHeader.split(' ')[1];
        try {
            const parts = token.split('.');
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
            req.auth = payload;
            req.authLog = [];
            return populateUser(req, res, next);
        } catch (e) {
            console.error("Dev Token Parse Error", e);
            return next();
        }
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
    if (!req.user || !req.user.id) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    next();
};

module.exports = { authenticateToken, requireAuth, jwtCheck, isDevTokenAllowed };
