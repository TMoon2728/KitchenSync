const db = require('./db');

console.log("--- Debugging Credit Persistence ---");

// 1. Create/Get Test User
const testSub = 'auth0|debug_user_' + Date.now();
try {
    db.prepare('INSERT INTO users (username, email, password_hash, credits) VALUES (?, ?, ?, ?)').run(testSub, testSub + '@test.com', 'hash', 10);
    console.log(`Created test user ${testSub} with 10 credits.`);
} catch (e) {
    console.error("Setup failed:", e);
}

const user = db.prepare('SELECT * FROM users WHERE username = ?').get(testSub);
console.log("Initial Fetch:", user.credits); // Should be 10

// 2. Perform Deduction (Simulate API logic)
db.prepare('UPDATE users SET credits = credits - 1 WHERE id = ?').run(user.id);
console.log("Deducted 1 credit.");

// 3. Read Back
const updatedUser = db.prepare('SELECT * FROM users WHERE username = ?').get(testSub);
console.log("Post-Deduction Fetch:", updatedUser.credits); // Should be 9

if (updatedUser.credits === 9) {
    console.log("✅ DB Persistence Check Passed");
} else {
    console.error("❌ DB Persistence Failed");
}
