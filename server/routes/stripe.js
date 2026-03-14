const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Webhook handling must use raw body before express.json() parses it.
// This route is directly mounted in index.js for this reason.
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const signature = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
        console.error("STRIPE_WEBHOOK_SECRET is not set.");
        return res.status(400).send('Webhook secret missing');
    }

    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
    } catch (err) {
        console.error(`Webhook signature verification failed: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                const userId = session.client_reference_id;
                const customerId = session.customer;
                
                if (userId && session.payment_status === 'paid') {
                    // Update user to PRO and set stripe_customer_id
                    await db.query(`
                        UPDATE users 
                        SET subscription_tier = $1, credits = $2, stripe_customer_id = $3
                        WHERE id = $4
                    `, ['pro', 999999, customerId, userId]);
                    console.log(`[Stripe Webhook] Upgraded user ${userId} to Pro.`);
                }
                break;
            }
            case 'customer.subscription.deleted':
            case 'customer.subscription.updated': {
                const subscription = event.data.object;
                const customerId = subscription.customer;
                
                // If the subscription is no longer active, downgrade them to starter
                if (subscription.status !== 'active' && subscription.status !== 'trialing') {
                    await db.query(`
                        UPDATE users 
                        SET subscription_tier = $1, credits = $2
                        WHERE stripe_customer_id = $3
                    `, ['starter', 50, customerId]);
                    console.log(`[Stripe Webhook] Downgraded customer ${customerId} to starter.`);
                }
                break;
            }
            default:
                console.log(`[Stripe Webhook] Unhandled event type ${event.type}`);
        }
        res.json({ received: true });
    } catch (dbError) {
        console.error("[Stripe Webhook] Database error processing event:", dbError);
        res.status(500).send("Internal Server Error processing webhook");
    }
});

// Middleware for parsing JSON for the regular authenticated endpoints
const jsonParser = express.json();

router.post('/create-checkout-session', jsonParser, requireAuth, async (req, res) => {
    try {
        const { tier } = req.body;
        
        if (!stripe) {
            return res.status(503).json({ error: "Stripe is not configured on this server." });
        }
        
        const priceId = tier === 'pro' ? process.env.STRIPE_PRICE_ID_PRO : process.env.STRIPE_PRICE_ID_STARTER;
        
        if (!priceId) {
             return res.status(400).json({ error: "Stripe Price ID not configured for this tier." });
        }

        const origin = req.headers.origin || 'http://localhost:5173'; // fallback for local dev

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            success_url: `${origin}/?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${origin}/#/profile`,
            client_reference_id: req.user.id.toString(), // critical: link checkout to our user
        });

        res.json({ url: session.url });
    } catch (e) {
        console.error("Error creating checkout session:", e);
        res.status(500).json({ error: "Failed to create checkout session" });
    }
});

router.post('/create-portal-session', jsonParser, requireAuth, async (req, res) => {
    try {
        if (!stripe) {
             return res.status(503).json({ error: "Stripe is not configured on this server." });
        }

        const userResult = await db.query('SELECT stripe_customer_id FROM users WHERE id = $1', [req.user.id]);
        const stripeCustomerId = userResult.rows[0]?.stripe_customer_id;

        if (!stripeCustomerId) {
            return res.status(400).json({ error: "No Stripe billing history found for this user." });
        }
        
        const origin = req.headers.origin || 'http://localhost:5173';

        const portalSession = await stripe.billingPortal.sessions.create({
            customer: stripeCustomerId,
            return_url: `${origin}/#/profile`,
        });

        res.json({ url: portalSession.url });
    } catch (e) {
        console.error("Error creating portal session:", e);
        res.status(500).json({ error: "Failed to create customer portal session" });
    }
});

module.exports = router;
