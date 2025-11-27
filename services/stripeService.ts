
import type { UserProfile } from '../types';

// Default mock links
const DEFAULT_STARTER = "https://buy.stripe.com/test_starter";
const DEFAULT_PRO = "https://buy.stripe.com/test_pro";
const DEFAULT_PORTAL = "https://billing.stripe.com/p/login/test_12345";

// Helper to safely access process.env in various environments
const getEnvVar = (key: string, fallback: string): string => {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
        return process.env[key] as string;
    }
    return fallback;
};

export const redirectToCheckout = (tier: 'starter' | 'pro') => {
    const targetUrl = tier === 'starter' 
        ? getEnvVar('STRIPE_LINK_STARTER', DEFAULT_STARTER)
        : getEnvVar('STRIPE_LINK_PRO', DEFAULT_PRO);
    
    console.log(`Redirecting to Stripe for ${tier} at ${targetUrl}...`);

    // If it's a real link (not our internal default mock string), redirect.
    // We check against the specific defaults to determine if "configured".
    // Note: We perform the redirect even if it looks like a test link, provided it's not our fallback default.
    if (targetUrl !== DEFAULT_STARTER && targetUrl !== DEFAULT_PRO) {
         window.location.href = targetUrl;
         return new Promise(() => {}); // Never resolves, just redirects
    }

    // Fallback Mock Behavior
    return new Promise<void>((resolve) => {
        setTimeout(() => {
            console.log("Mock payment complete (not configured).");
            resolve();
        }, 1500);
    });
};

export const manageSubscription = () => {
    const url = getEnvVar('STRIPE_PORTAL_LINK', DEFAULT_PORTAL);
    window.open(url, '_blank');
};
