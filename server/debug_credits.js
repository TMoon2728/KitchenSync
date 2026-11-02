const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config();

const db = require('./db');

(async () => {
    console.log("--- Debugging Credit Persistence ---");
    const testSub = 'auth0|debug_user_' + Date.now();
    try {
        await db.query(
            'INSERT INTO users (username, email, password_hash, credits) VALUES ($1, $2, $3, $4)',
            [testSub, `${testSub}@test.com`, 'hash', 10]
        );
        console.log(`Created test user ${testSub} with 10 credits.`);

        const initialRes = await db.query('SELECT * FROM users WHERE username = $1', [testSub]);
        const user = initialRes.rows[0];
        console.log("Initial Fetch:", user.credits);

        await db.query(
            'UPDATE users SET credits = credits - 1 WHERE id = $1 AND credits >= 1',
            [user.id]
        );
        console.log("Deducted 1 credit.");

        const updatedRes = await db.query('SELECT * FROM users WHERE username = $1', [testSub]);
        const updatedUser = updatedRes.rows[0];
        console.log("Post-Deduction Fetch:", updatedUser.credits);

        if (updatedUser.credits === 9) {
            console.log("✅ DB Persistence Check Passed");
        } else {
            console.error("❌ DB Persistence Failed");
        }

        await db.query('DELETE FROM users WHERE id = $1', [user.id]);
        process.exit(0);
    } catch (e) {
        console.error("Debug credit script failed:", e);
        process.exit(1);
    }
})();
