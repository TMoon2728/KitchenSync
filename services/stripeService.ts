import { authFetch } from './../utils/api';

export const redirectToCheckout = async (tier: 'starter' | 'pro', token: string) => {
    console.log(`Initiating checkout for ${tier}`);

    try {
        const res = await authFetch('/api/stripe/create-checkout-session', {
            method: 'POST',
            body: JSON.stringify({ tier }),
            token
        });

        if (res.ok) {
            const data = await res.json();
            if (data.url) {
                window.location.href = data.url;
                return new Promise(() => {}); // Never resolves, just redirects to Stripe
            }
        }
        
        throw new Error("Invalid response from checkout creation endpoint");
    } catch (e) {
        console.error("Stripe checkout error:", e);
        alert(`Failed to initiate checkout. Please try again later.`);
    }
};

export const manageSubscription = async (token: string) => {
    try {
         const res = await authFetch('/api/stripe/create-portal-session', {
            method: 'POST',
            token
        });

        if (res.ok) {
            const data = await res.json();
            if (data.url) {
                 window.open(data.url, '_self'); // Same window for portal
                 return;
            }
        }
        throw new Error("Invalid response from portal creation endpoint");
    } catch (e) {
        console.error("Stripe portal error:", e);
        alert("Failed to load billing portal. Note: You must have an active subscription history first.");
    }
};
