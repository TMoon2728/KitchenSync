const db = require('../server/db.js');

const email = process.argv[2];

if (!email) {
    console.error("❌ Error: Please provide an email address.");
    console.error("Usage: npm run make-admin <user-email>");
    process.exit(1);
}

try {
    const user = db.prepare('SELECT id, username, email, subscription_tier FROM users WHERE email = ? OR username = ?').get(email, email);

    if (!user) {
        console.error(`❌ User with identifier '${email}' not found in the database.`);
        console.log("Please make sure the user logs into KitchenSync at least once before making them an admin.");
        process.exit(1);
    }

    const info = db.prepare('UPDATE users SET subscription_tier = ?, credits = ? WHERE id = ?').run('pro', 999999, user.id);

    if (info.changes > 0) {
        console.log(`✅ Success! User ${user.username} (${email}) has been upgraded to 'pro' tier with unlimited (999999) credits.`);
    } else {
        console.error("⚠️ Database update failed. No rows changed.");
    }
} catch (e) {
    console.error("❌ Database Error:", e.message);
    process.exit(1);
}
