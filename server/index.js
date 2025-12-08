
const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env.local (since that's what was present)
// fallback to .env if needed
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config(); // Standard .env fallback

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Auth Middleware (Global check for token)
const { authenticateToken } = require('./middleware/auth');
app.use(authenticateToken);

// Routes
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

const dataRoutes = require('./routes/data');
app.use('/api/data', dataRoutes);

const apiRoutes = require('./routes/api');
app.use('/api', apiRoutes);

// Serve Static Assets in Production
if (process.env.NODE_ENV === 'production') {
    // Serve static files from the Vite build output
    app.use(express.static(path.join(__dirname, '../dist')));

    // Handle React Routing (SPA catch-all)
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../dist', 'index.html'));
    });
}

// Health Check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
