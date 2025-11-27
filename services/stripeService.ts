
import type { UserProfile } from '../types';

// Explicitly access environment variables so bundlers can replace them at build time.
// Dynamic access (e.g. process.env[key]) often fails in frontend builds because 
// bundlers rely on static analysis to replace specific variable strings.
const STRIPE_LINK_STARTER = process.env.STRIPE_LINK_STARTER;
const STRIPE_LINK_PRO = process.env.STRIPE_LINK_PRO;
const STRIPE_PORTAL_LINK = process.env.STRIPE_PORTAL_LINK;

export const redirectToCheckout = (tier: 'starter' | 'pro') => {
    const targetUrl = tier === 'starter' 
        ? STRIPE_LINK_STARTER
        : STRIPE_LINK_PRO;
    
    console.log(`Initiating checkout for ${tier}`);

    if (targetUrl) {
         window.location.href = targetUrl;
         return new Promise(() => {}); // Never resolves, just redirects
    }

    // Fallback Mock Behavior for development or when links aren't set
    console.warn(`Stripe link for ${tier} not configured in environment variables.`);
    alert(`Stripe configuration missing for ${tier}. Please check environment variables.`);
    
    return new Promise<void>((resolve) => {
        setTimeout(() => {
            resolve();
        }, 1000);
    });
};

export const manageSubscription = () => {
    const url = STRIPE_PORTAL_LINK;

    if (url) {
        window.open(url, '_blank');
    } else {
        console.error("STRIPE_PORTAL_LINK environment variable is missing.");
        alert("Billing portal link is not configured. Please check your STRIPE_PORTAL_LINK environment variable.");
    }
};
