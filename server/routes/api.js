
const express = require('express');
const router = express.Router();
const { GoogleGenAI } = require("@google/genai");

const db = require('../db');

// Initialize Gemini
const genAI = new GoogleGenAI(process.env.GEMINI_API_KEY);

// --- Helpers ---
const getUser = (req) => {
    if (!req.user) return null;
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!row) return null;

    // Parse JSON fields
    return {
        ...row,
        preferences: JSON.parse(row.preferences || '{}'),
        subscriptionTier: row.subscription_tier // map snake_case to camelCase
    };
};

// --- Routes ---

// 1. Get User Profile
router.get('/user/profile', (req, res) => {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    res.json(user);
});

// 2. Consume Credits
router.post('/credits/consume', (req, res) => {
    const { amount } = req.body;
    const user = getUser(req);

    if (!user) return res.status(401).json({ error: "Unauthorized" });

    if (user.subscriptionTier === 'pro') {
        return res.json({ success: true, remaining: '∞', tier: 'pro' });
    }

    if (user.credits >= amount) {
        // Transaction
        const info = db.prepare('UPDATE users SET credits = credits - ? WHERE id = ?').run(amount, user.id);
        const updatedCredits = user.credits - amount;
        return res.json({ success: true, remaining: updatedCredits, tier: user.subscriptionTier });
    } else {
        return res.status(402).json({ error: "Insufficient credits", current: user.credits });
    }
});

// 3. Gemini Proxy: Generate Recipe
router.post('/generate-recipe', async (req, res) => {
    if (!genAI) {
        return res.status(503).json({ error: "AI Service Unavailable (Missing Key)" });
    }

    const { prompt, schema } = req.body;
    const user = getUser(req);

    // Auth Check
    if (!user) return res.status(401).json({ error: "Unauthorized. Please Login." });

    // Validate Credits
    if (user.subscriptionTier !== 'pro' && user.credits < 1) {
        return res.status(402).json({ error: "Insufficient credits" });
    }

    try {
        const result = await genAI.models.generateContent({
            model: "gemini-1.5-pro",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema
            }
        });

        const responseText = typeof result.text === 'function' ? result.text() : result.text;

        // Deduct Credit only on success
        if (user.subscriptionTier !== 'pro') {
            db.prepare('UPDATE users SET credits = credits - 1 WHERE id = ?').run(user.id);
        }

        // Refetch credit count
        const finalCredit = user.subscriptionTier === 'pro' ? '∞' : (user.credits - 1);

        res.json({
            result: JSON.parse(responseText),
            creditsRemaining: finalCredit
        });

    } catch (error) {
        console.error("Gemini API Error:", error);
        res.status(500).json({ error: "AI Generation Failed", details: error.message });
    }
});

// 4. Upgrade Subscription
router.post('/subscription/upgrade', (req, res) => {
    const { tier } = req.body; // 'starter' or 'pro'
    const user = getUser(req);

    if (!user) return res.status(401).json({ error: "Unauthorized" });

    if (!['starter', 'pro'].includes(tier)) {
        return res.status(400).json({ error: "Invalid tier" });
    }

    try {
        const newCredits = tier === 'starter' ? 50 : 999999;

        // Update DB
        const stmt = db.prepare('UPDATE users SET subscription_tier = ?, credits = ? WHERE id = ?');
        stmt.run(tier, newCredits, user.id);

        res.json({ success: true, tier, credits: newCredits });
    } catch (e) {
        console.error("Upgrade failed:", e);
        res.status(500).json({ error: "Upgrade failed" });
    }
});

// 4. Gemini Proxy: Chat (Sous Chef)
router.post('/chat', async (req, res) => {
    if (!genAI) return res.status(503).json({ error: "AI Service Unavailable" });

    const { history, message, systemInstruction } = req.body;

    try {
        // Chat not directly supported in genAI.models? 
        // In new SDK: client.chats.create({ model: ..., ... })
        const chat = genAI.chats.create({
            model: "gemini-1.5-pro",
            config: { systemInstruction },
            history: history || []
        });

        const result = await chat.sendMessage(message);
        const responseText = typeof result.text === 'function' ? result.text() : result.text;

        res.json({ result: responseText });
    } catch (error) {
        console.error("Chat Error:", error);
        res.status(500).json({ error: "Chat Failed" });
    }
});

// 5. Gemini Proxy: Analyze Receipt
router.post('/ai/analyze-receipt', async (req, res) => {
    if (!genAI) {
        return res.status(503).json({ error: "AI Service Unavailable (Missing Key)" });
    }

    const { image, currentShoppingList } = req.body; // image as base64
    const user = getUser(req);

    // Auth Check
    if (!user) return res.status(401).json({ error: "Unauthorized. Please Login." });

    // Validate Credits
    if (user.subscriptionTier !== 'pro' && user.credits < 1) {
        return res.status(402).json({ error: "Insufficient credits" });
    }

    try {
        const prompt = `
        You are a smart shopping assistant. Compare this receipt image with the user's current shopping list.
        
        Current Shopping List:
        ${JSON.stringify(currentShoppingList)}
        
        Task:
        1. Identify clear matches between the receipt and the shopping list (ignore minor name variations like "Eggs" vs "Dozen Eggs").
        2. Identify extra items on the receipt that are NOT on the list.
        3. Ignore non-food items like tax, total, or generic store IDs.
        4. For 'extra' items, guess the category and unit.
        
        Output JSON:
        {
          "matched": ["Item Name From List"],
          "extra": [
             { "name": "Item Name", "quantity": 1, "unit": "unit", "category": "Produce" }
          ]
        }
        `;

        // Prepare image part
        const imagePart = {
            inlineData: {
                data: image.split(',')[1], // Remove "data:image/jpeg;base64," prefix if present
                mimeType: "image/jpeg"
            }
        };

        const result = await genAI.models.generateContent({
            model: "gemini-1.5-pro",
            contents: [prompt, imagePart],
            config: {
                responseMimeType: "application/json"
                // schema could be added here for strictness
            }
        });

        const responseText = typeof result.text === 'function' ? result.text() : result.text;

        // Parse JSON safely
        const cleanedText = responseText.replace(/```json|```/g, '').trim();
        const data = JSON.parse(cleanedText);

        // Deduct Credit only on success
        if (user.subscriptionTier !== 'pro') {
            db.prepare('UPDATE users SET credits = credits - 1 WHERE id = ?').run(user.id);
        }

        const finalCredit = user.subscriptionTier === 'pro' ? '∞' : (user.credits - 1);

        res.json({
            result: data,
            creditsRemaining: finalCredit
        });

    } catch (error) {
        console.error("Receipt Analysis Failed:", error);
        res.status(500).json({ error: "Analysis Failed", details: error.message });
    }
});

module.exports = router;
