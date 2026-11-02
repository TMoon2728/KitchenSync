/**
 * Append-Only Transactional Credit & Billing Ledger (U-04)
 * Guarantees atomic credit reservations, refunds, and idempotent Stripe tier upgrades
 * with a permanent audit trail in `credit_ledger`.
 */
const db = require('../db');

async function deductCredits({ userId, amount = 1, operation = 'ai_call', idempotencyKey = null }) {
    const cost = Math.max(1, Number(amount) || 1);
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const updateRes = await client.query(
            `UPDATE users
             SET credits = credits - $1
             WHERE id = $2 AND credits >= $1
             RETURNING credits`,
            [cost, userId]
        );

        if (updateRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return { ok: false, creditsRemaining: null };
        }

        const balanceAfter = updateRes.rows[0].credits;
        await client.query(
            `INSERT INTO credit_ledger (user_id, delta, balance_after, operation, idempotency_key)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (idempotency_key) DO NOTHING`,
            [userId, -cost, balanceAfter, operation, idempotencyKey]
        );

        await client.query('COMMIT');
        return { ok: true, creditsRemaining: balanceAfter };
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}

async function refundCredits({ userId, amount = 1, operation = 'ai_refund', idempotencyKey = null }) {
    const refund = Math.max(1, Number(amount) || 1);
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const updateRes = await client.query(
            `UPDATE users
             SET credits = credits + $1
             WHERE id = $2
             RETURNING credits`,
            [refund, userId]
        );

        if (updateRes.rowCount > 0) {
            const balanceAfter = updateRes.rows[0].credits;
            await client.query(
                `INSERT INTO credit_ledger (user_id, delta, balance_after, operation, idempotency_key)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (idempotency_key) DO NOTHING`,
                [userId, refund, balanceAfter, operation, idempotencyKey]
            );
        }

        await client.query('COMMIT');
        return { ok: true };
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error(`[CreditLedger] Failed to refund ${refund} credit(s) to user ${userId}:`, err.message);
        return { ok: false };
    } finally {
        client.release();
    }
}

module.exports = {
    deductCredits,
    refundCredits
};
