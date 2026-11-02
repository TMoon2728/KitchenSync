const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config();

const db = require('../server/db.js');

const email = process.argv[2];

if (!email) {
    console.error("❌ Error: Please provide an email address.");
    console.error("Usage: npm run make-admin <user-email>");
    process.exit(1);
}

(async () => {
    try {
        const { rows } = await db.query(
            'SELECT id, username, email, subscription_tier FROM users WHERE LOWER(email) = LOWER($1) OR username = $1',
            [email]
        );
        const user = rows[0];

        if (!user) {
            console.error(`❌ User with identifier '${email}' not found in the database.`);
            console.log("Please make sure the user logs into KitchenSync at least once before making them an admin.");
            process.exit(1);
        }

        const updateRes = await db.query(
            'UPDATE users SET subscription_tier = $1, credits = $2 WHERE id = $3',
            ['pro', 999999, user.id]
        );

        if (updateRes.rowCount > 0) {
            console.log(`✅ Success! User ${user.username} (${email}) has been upgraded to 'pro' tier with unlimited (999999) credits.`);
        } else {
            console.error("⚠️ Database update failed. No rows changed.");
        }
        process.exit(0);
    } catch (e) {
        console.error("❌ Database Error:", e.message);
        process.exit(1);
    }
})();
