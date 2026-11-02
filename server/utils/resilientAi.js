/**
 * Resilient Multi-Model AI Gateway (U-03)
 * Provides per-model sliding-window circuit breakers, exponential backoff with full jitter,
 * and automatic model cascade failover on 429/500/503/404 upstream Gemini errors.
 */
const FALLBACK_CASCADE = [
    process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-2.5-pro'
];

const circuitState = new Map();
const CIRCUIT_FAILURE_THRESHOLD = 2;
const CIRCUIT_COOLDOWN_MS = 60 * 1000;

function isModelHealthy(modelName) {
    const state = circuitState.get(modelName);
    if (!state) return true;
    if (state.openUntil && Date.now() < state.openUntil) {
        return false;
    }
    if (state.openUntil && Date.now() >= state.openUntil) {
        circuitState.delete(modelName);
    }
    return true;
}

function recordModelFailure(modelName, err) {
    const prev = circuitState.get(modelName) || { failures: 0, openUntil: null };
    const failures = prev.failures + 1;
    const isHardOutage =
        err?.status === 503 ||
        err?.status === 429 ||
        err?.status === 404 ||
        /429|503|404|overloaded|quota|exhausted|not_found/i.test(String(err?.message || ''));

    const openUntil = (failures >= CIRCUIT_FAILURE_THRESHOLD || isHardOutage)
        ? Date.now() + CIRCUIT_COOLDOWN_MS
        : null;

    circuitState.set(modelName, { failures, openUntil });
}

function recordModelSuccess(modelName) {
    if (circuitState.has(modelName)) {
        circuitState.delete(modelName);
    }
}

function sleepWithJitter(attempt) {
    const baseMs = Math.min(1500, 200 * Math.pow(2, attempt));
    const jittered = Math.floor(Math.random() * baseMs) + 100;
    return new Promise(resolve => setTimeout(resolve, jittered));
}

async function generateContentWithFailover(genAI, preferredModel, requestOptions) {
    const candidates = Array.from(new Set([preferredModel, ...FALLBACK_CASCADE].filter(Boolean)));
    const healthyCandidates = candidates.filter(isModelHealthy);
    const modelOrder = healthyCandidates.length > 0 ? healthyCandidates : candidates;

    let lastError = null;
    for (let i = 0; i < modelOrder.length; i++) {
        const model = modelOrder[i];
        try {
            const response = await genAI.models.generateContent({
                ...requestOptions,
                model
            });
            recordModelSuccess(model);
            return response;
        } catch (err) {
            lastError = err;
            recordModelFailure(model, err);
            console.warn(`[ResilientAI] Model ${model} failed (${err.message}). Failing over...`);
            if (i < modelOrder.length - 1) {
                await sleepWithJitter(i);
            }
        }
    }
    throw lastError || new Error('All Gemini models in failover cascade failed');
}

module.exports = {
    generateContentWithFailover,
    isModelHealthy,
    recordModelFailure,
    recordModelSuccess
};
