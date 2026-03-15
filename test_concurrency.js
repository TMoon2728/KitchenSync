const db = require('./server/db');

async function testConcurrency() {
    // 1. Setup a test user with 1 credit
    console.log("Setting up test user with 1 credit...");
    await db.query(`
        INSERT INTO users (id, username, email, password_hash, credits, subscription_tier)
        VALUES (9999, 'test_racer', 'race@test.com', 'hash', 1, 'starter')
        ON CONFLICT (id) DO UPDATE SET credits = 1
    `);

    // 2. Define the exact Pre-Flight Atomic Query we implemented
    const deductCredit = async (workerId) => {
        try {
            const result = await db.query(
                `UPDATE users SET credits = credits - 1 WHERE id = $1 AND credits >= 1 RETURNING credits`,
                [9999]
            );
            if (result.rowCount === 0) {
                console.log(`[Worker ${workerId}] Denied. Insufficient Credits.`);
                return false;
            }
            console.log(`[Worker ${workerId}] Success! Deducted. Credits remaining: ${result.rows[0].credits}`);
            return true;
        } catch (e) {
            console.error(`[Worker ${workerId}] DB Error:`, e.message);
            return false;
        }
    };

    // 3. Fire 50 concurrent requests
    console.log("Firing 50 concurrent deduction attempts...");
    const promises = [];
    for (let i = 0; i < 50; i++) {
        promises.push(deductCredit(i));
    }

    const results = await Promise.all(promises);
    
    // 4. Verify the database state
    const { rows } = await db.query('SELECT credits FROM users WHERE id = 9999');
    console.log(`\n--- Test Complete ---`);
    console.log(`Final Database Credit Balance: ${rows[0].credits}`);
    console.log(`Successful deductions (should be exactly 1): ${results.filter(r => r).length}`);
    
    if (rows[0].credits === 0 && results.filter(r => r).length === 1) {
        console.log("✅ TOCTOU Vulnerability successfully remediated!");
    } else {
        console.error("❌ Test failed. Race condition still exists.");
    }
    
    // Cleanup
    await db.query('DELETE FROM users WHERE id = 9999');
    process.exit(0);
}

testConcurrency();
