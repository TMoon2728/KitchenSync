const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dbPath = path.join(__dirname, '../data');
if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath);
}

const db = new Database(path.join(dbPath, 'kitchensync.db'), { verbose: console.log });

// Initialize Schema
const init = () => {
    // Users Table
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            subscription_tier TEXT DEFAULT 'free',
            credits INTEGER DEFAULT 5,
            preferences TEXT DEFAULT '{}'
        )
    `);

    // We can add tables for recipes/pantry later or now.
    // Let's at least stub them to fix the "Sync" promise later.
    db.exec(`
        CREATE TABLE IF NOT EXISTS recipes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            data JSON NOT NULL,
            is_favorite BOOLEAN DEFAULT 0,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS pantry (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            quantity REAL,
            unit TEXT,
            category TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    `);

    console.log('Database initialized');
};

init();

module.exports = db;
