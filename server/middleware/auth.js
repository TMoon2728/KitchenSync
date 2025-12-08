const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-do-not-use-in-prod';

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        // Allow public access for some routes? Or strict?
        // For now, if no token, req.user remains undefined. 
        // Routes needing protection should check !req.user
        return next();
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            console.warn("Invalid Token:", err.message);
            // Don't block here, let route decide if it needs auth. 
            // Or typically 403.
        }
        if (user) {
            req.user = user;
        }
        next();
    });
};

const requireAuth = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    next();
};

module.exports = { authenticateToken, requireAuth };
