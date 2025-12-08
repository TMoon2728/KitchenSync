const { auth } = require('express-oauth2-jwt-bearer');

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

    jwtCheck(req, res, (err) => {
        if (err) {
            // Token invalid - allow public but log warn? Or fail?
            console.warn("Auth0 Token Invalid:", err.message);
            return next();
        }
        // Success - req.auth is populated
        req.user = req.auth; // Map for compatibility
        next();
    });
};

const requireAuth = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    next();
};

module.exports = { authenticateToken, requireAuth, jwtCheck };
