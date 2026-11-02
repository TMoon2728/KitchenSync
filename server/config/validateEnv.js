/**
 * Startup Environment & Subsystem Capability Validator (U-06)
 * Validates core and optional runtime secrets on server startup without leaking values.
 */
function validateEnv() {
    const isProd = process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER);

    const capabilities = {
        database: Boolean(process.env.DATABASE_URL),
        auth0Jwt: Boolean(process.env.AUTH0_ISSUER_BASE_URL && process.env.AUTH0_AUDIENCE),
        geminiAi: Boolean(process.env.GEMINI_API_KEY),
        stripeBilling: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
        externalHubSync: Boolean(process.env.EXTERNAL_API_KEY)
    };

    const warnings = [];
    if (isProd && !capabilities.database) {
        warnings.push('DATABASE_URL is not set in production; falling back to localhost.');
    }
    if (isProd && !capabilities.auth0Jwt) {
        warnings.push('AUTH0_ISSUER_BASE_URL or AUTH0_AUDIENCE is missing; RS256 JWT verification is degraded.');
    }
    if (!capabilities.geminiAi) {
        warnings.push('GEMINI_API_KEY is not set; AI generation falls back to deterministic JSON-LD parsing only.');
    }

    console.log(
        `[BootMatrix] Env=${isProd ? 'production' : 'development'} | ` +
        `DB=${capabilities.database ? 'OK' : 'LOCAL'} | ` +
        `Auth0=${capabilities.auth0Jwt ? 'OK' : 'DEV'} | ` +
        `Gemini=${capabilities.geminiAi ? 'OK' : 'OFF'} | ` +
        `Stripe=${capabilities.stripeBilling ? 'OK' : 'OFF'} | ` +
        `HubSync=${capabilities.externalHubSync ? 'OK' : 'INVITE_ONLY'}`
    );

    for (const w of warnings) {
        console.warn(`[BootWarning] ${w}`);
    }

    return { isProd, capabilities, warnings };
}

module.exports = { validateEnv };
