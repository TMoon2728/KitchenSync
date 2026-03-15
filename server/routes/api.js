const express = require('express');
const router = express.Router();
const { GoogleGenAI } = require("@google/genai");

const db = require('../db');

// Initialize Gemini
const genAI = new GoogleGenAI(process.env.GEMINI_API_KEY);

// --- Helpers ---
const getUser = async (req) => {
    if (!req.user) return null;
    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const row = rows[0];
    if (!row) return null;

    // Parse JSON fields for primary user
    const preferences = typeof row.preferences === 'string' ? JSON.parse(row.preferences || '{}') : (row.preferences || {});
    // The newer preferences payload structure nests actual preferences under `appPreferences`
    // to make room in the JSONB for other profile fields (household, grocery stores, etc.)
    const kitchenName = preferences.kitchenName || row.kitchen_name;
    const dailyCalorieGoal = preferences.dailyCalorieGoal || 2000;
    const proteinGoal = preferences.proteinGoal;
    const carbGoal = preferences.carbGoal;
    const fatGoal = preferences.fatGoal;
    
    // Fetch all users in the household (including self) to merge members
    const householdId = row.household_id || String(row.id);
    const householdResult = await db.query('SELECT * FROM users WHERE household_id = $1 OR id = $2', [householdId, row.id]);
    
    let allHouseholdMembers = [...(preferences.householdMembers || [])];
    let allGroceryStores = [...(preferences.groceryStores || [])];
    let effectiveSubscriptionTier = row.subscription_tier;

    // Merge members and partner accounts
    for (const hUser of householdResult.rows) {
        if (hUser.subscription_tier === 'pro') {
            effectiveSubscriptionTier = 'pro';
        }

        if (hUser.id !== row.id) {
            // Add the linked user themselves as a household member automatically
            if (!allHouseholdMembers.find(m => m.name === hUser.username || m.name === hUser.email)) {
                allHouseholdMembers.push({
                    id: `linked-${hUser.id}`,
                    name: hUser.username || hUser.email,
                    dietaryRestrictions: "Linked Account"
                });
            }

            const hPrefs = typeof hUser.preferences === 'string' ? JSON.parse(hUser.preferences || '{}') : (hUser.preferences || {});
            if (hPrefs.householdMembers) {
                hPrefs.householdMembers.forEach(m => {
                    // Prevent exact duplicates by name
                    if (!allHouseholdMembers.find(existing => existing.name === m.name)) {
                        allHouseholdMembers.push({
                            ...m,
                            _sourceUserId: hUser.id // Flag this so the frontend/backend knows it's borrowed
                        });
                    }
                });
            }
            if (hPrefs.groceryStores) {
                hPrefs.groceryStores.forEach(s => {
                    if (!allGroceryStores.find(existing => existing.url === s.url)) {
                        allGroceryStores.push(s);
                    }
                });
            }
        }
    }

    const appPreferences = preferences.appPreferences || preferences;
    const avatar = preferences.avatar || '👨‍🍳';
    const name = preferences.name || row.username;

    return {
        ...row,
        name,
        avatar,
        kitchenName,
        dailyCalorieGoal,
        proteinGoal,
        carbGoal,
        fatGoal,
        householdMembers: allHouseholdMembers,
        groceryStores: allGroceryStores,
        preferences: appPreferences,
        subscriptionTier: effectiveSubscriptionTier, // shared pro tier
        credits: effectiveSubscriptionTier === 'pro' ? '∞' : row.credits // show infinite if pro
    };
};

// --- Routes ---

// 1. Get User Profile
router.get('/user/profile', async (req, res) => {
    try {
        const user = await getUser(req);
        if (!user) return res.status(401).json({ error: "Unauthorized" });
        res.json(user);
    } catch (e) {
        console.error("Profile Error:", e);
        res.status(500).json({ error: "Failed to fetch profile" });
    }
});

// 2. Update User Profile
router.put('/user/profile', async (req, res) => {
    try {
        const user = await getUser(req);
        if (!user) return res.status(401).json({ error: "Unauthorized" });

        const {
            kitchenName,
            dailyCalorieGoal,
            proteinGoal,
            carbGoal,
            fatGoal,
            householdMembers,
            groceryStores,
            preferences,
            avatar,
            name
        } = req.body;

        // We can store all these extras inside the `preferences` JSONB column to avoid immediate schema migrations.
        const currentPreferences = user.preferences || {};
        
        // Filter out linked accounts and borrowed members from being saved back as manual members
        const filteredMembers = (householdMembers || []).filter(m => {
            if (m.id && m.id.toString().startsWith('linked-')) return false;
            if (m._sourceUserId) return false; // Belongs to a linked partner's preferences
            return true;
        });

        // Strip our temporary _sourceUserId flag if it somehow snuck through
        const cleanMembers = filteredMembers.map(m => {
            const copy = { ...m };
            delete copy._sourceUserId;
            return copy;
        });

        const updatedPreferences = {
            ...currentPreferences,
            kitchenName,
            dailyCalorieGoal,
            proteinGoal,
            carbGoal,
            fatGoal,
            householdMembers: cleanMembers,
            groceryStores,
            appPreferences: preferences, // the actual preferences object (confetti, etc)
            avatar,
            name
        };

        await db.query(
            'UPDATE users SET preferences = $1 WHERE id = $2',
            [JSON.stringify(updatedPreferences), user.id]
        );

        res.json({ success: true });
    } catch (e) {
        console.error("Update Profile Error:", e);
        res.status(500).json({ error: "Failed to update profile" });
    }
});

// 3. Consume Credits
router.post('/credits/consume', async (req, res) => {
    try {
        const { amount } = req.body;
        const user = await getUser(req);

        if (!user) return res.status(401).json({ error: "Unauthorized" });

        if (typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json({ error: "Invalid amount. Must be a positive number." });
        }

        if (user.subscriptionTier === 'pro') {
            return res.json({ success: true, remaining: '∞', tier: 'pro' });
        }

        if (user.credits >= amount) {
            // Transaction
            await db.query('UPDATE users SET credits = credits - $1 WHERE id = $2', [amount, user.id]);
            const updatedCredits = user.credits - amount;
            return res.json({ success: true, remaining: updatedCredits, tier: user.subscriptionTier });
        } else {
            return res.status(402).json({ error: "Insufficient credits", current: user.credits });
        }
    } catch (e) {
        console.error("Consume Credits Error:", e);
        res.status(500).json({ error: "Failed to consume credits" });
    }
});

// --- Model Resolution Helper ---
let activeModel = null;

const resolveModel = async () => {
    if (activeModel) return activeModel;

    // 1. Try Configured/Default
    const preferred = process.env.GEMINI_MODEL || "gemini-1.5-flash";

    try {
        // Test validity (lightweight check if possible, or just list)
        const list = await genAI.models.list();
        const available = [];
        for await (const m of list) {
            available.push(m);
        }

        const modelNames = available.map(m => m.name.replace('models/', ''));
        console.log("Available Models:", modelNames);

        // Check if preferred exists
        if (modelNames.includes(preferred)) {
            activeModel = preferred;
            return activeModel;
        }

        // Fallback Strategy
        // 1. Look for 'flash'
        const flash = modelNames.find(n => n.includes('flash') && n.includes('1.5'));
        if (flash) {
            activeModel = flash;
            return activeModel;
        }

        // 2. Look for 'pro'
        const pro = modelNames.find(n => n.includes('pro') && n.includes('1.5'));
        if (pro) {
            activeModel = pro;
            return activeModel;
        }

        // 3. Look for 'gemini-pro' (1.0)
        const geminiPro = modelNames.find(n => n.includes('gemini-pro'));
        if (geminiPro) {
            activeModel = geminiPro;
            return activeModel;
        }

        // 4. Any gemini
        const anyGemini = modelNames.find(n => n.includes('gemini'));
        if (anyGemini) {
            activeModel = anyGemini;
            return activeModel;
        }

        activeModel = preferred; // Hope for the best
        return activeModel;

    } catch (e) {
        console.error("Failed to list models for resolution:", e);
        return preferred; // Fallback so local dev without API keys listing perms still attempts
    }
};


// 3. Gemini Proxy: Generate Recipe
router.post('/generate-recipe', async (req, res) => {
    if (!genAI) {
        return res.status(503).json({ error: "AI Service Unavailable (Missing Key)" });
    }

    try {
        const { prompt, schema, familySize } = req.body;
        const user = await getUser(req);

        // Auth Check
        if (!user) return res.status(401).json({ error: "Unauthorized. Please Login." });

        // Validate Credits
        if (user.subscriptionTier !== 'pro' && user.credits < 1) {
            return res.status(402).json({ error: "Insufficient credits" });
        }

        const modelName = await resolveModel();
        console.log(`Using model: ${modelName}`);

        const config = {
            responseMimeType: "application/json"
        };
        if (schema) {
            config.responseSchema = schema;
        }

        let finalPrompt = prompt;
        if (familySize) {
             finalPrompt += `\n\nCRITICAL INSTRUCTION: You MUST scale the ingredient quantities to yield exactly ${familySize} servings. Update the 'servings' field to ${familySize}.`;
        }

        const result = await genAI.models.generateContent({
            model: modelName,
            contents: finalPrompt,
            config: config
        });

        const responseText = typeof result.text === 'function' ? result.text() : result.text;

        // Deduct Credit only on success
        if (user.subscriptionTier !== 'pro') {
            const info = await db.query('UPDATE users SET credits = credits - 1 WHERE id = $1', [user.id]);
            console.log(`[CreditAudit] Deducted 1 credit from User ${user.id}. Changes: ${info.rowCount}, Previous Credits: ${user.credits}`);
        } else {
            console.log(`[CreditAudit] User ${user.id} is PRO. No deduction.`);
        }

        // Refetch credit count
        const finalCredit = user.subscriptionTier === 'pro' ? '∞' : (user.credits - 1);

        res.json({
            result: JSON.parse(responseText),
            creditsRemaining: finalCredit
        });

    } catch (error) {
        console.error("Gemini API Error:", error);
        // Reset active model on 404 to trigger re-resolution next time
        if (error.message.includes('404') || error.message.includes('NOT_FOUND')) {
            activeModel = null;
        }
        res.status(500).json({ error: "AI Generation Failed", details: error.message });
    }
});

// 3b. Gemini Proxy: Generate Image
router.post('/generate-image', async (req, res) => {
    if (!genAI) {
        return res.status(503).json({ error: "AI Service Unavailable (Missing Key)" });
    }

    try {
        const { prompt } = req.body;
        const user = await getUser(req);

        // Auth Check
        if (!user) return res.status(401).json({ error: "Unauthorized. Please Login." });

        if (user.subscriptionTier !== 'pro' && user.credits < 1) {
            return res.status(402).json({ error: "Insufficient credits" });
        }

        console.log(`Generating image for prompt: ${prompt}`);

        let base64Image = '';
        try {
            const response = await genAI.models.generateImages({
                model: 'imagen-3.0-generate-002',
                prompt: prompt,
                config: {
                    numberOfImages: 1,
                    aspectRatio: "1:1"
                }
            });

            const generatedImage = response.generatedImages[0];
            
            if (generatedImage.image && generatedImage.image.imageBytes) {
                base64Image = `data:image/jpeg;base64,${generatedImage.image.imageBytes}`;
            } else if (generatedImage.base64) { 
                base64Image = `data:image/jpeg;base64,${generatedImage.base64}`;
            } else {
                throw new Error("Could not parse image bytes");
            }
        } catch (genError) {
            console.error("Gemini native image generation failed. Using fallback:", genError);
            // Fallback to a food-related placeholder containing a representation of the prompt
            base64Image = `https://loremflickr.com/500/500/food,meal`;
        }

        // Deduct Credit only on success
        if (user.subscriptionTier !== 'pro') {
            await db.query('UPDATE users SET credits = credits - 1 WHERE id = $1', [user.id]);
        }

        const finalCredit = user.subscriptionTier === 'pro' ? '∞' : (user.credits - 1);

        res.json({
            result: base64Image,
            creditsRemaining: finalCredit
        });

    } catch (error) {
        console.error("Gemini Image Generation Error:", error);
        res.status(500).json({ error: "Image Generation Failed", details: error.message });
    }
});



// 4. Gemini Proxy: Chat (Sous Chef)
router.post('/chat', async (req, res) => {
    if (!genAI) return res.status(503).json({ error: "AI Service Unavailable" });

    try {
        // 1. Auth & Credit Check
        const user = await getUser(req);
        if (!user) return res.status(401).json({ error: "Unauthorized" });

        if (user.subscriptionTier !== 'pro' && user.credits < 1) {
            return res.status(402).json({ error: "Insufficient credits" });
        }

        const { history, message, systemInstruction } = req.body;

        const modelName = await resolveModel();
        const chat = genAI.chats.create({
            model: modelName,
            config: { systemInstruction },
            history: history || []
        });

        const result = await chat.sendMessage(message);
        const responseText = typeof result.text === 'function' ? result.text() : result.text;

        // 2. Deduct Credit
        if (user.subscriptionTier !== 'pro') {
            const info = await db.query('UPDATE users SET credits = credits - 1 WHERE id = $1', [user.id]);
            console.log(`[CreditAudit] Deducted 1 credit from User ${user.id} (Chat). Changes: ${info.rowCount}`);
        } else {
            console.log(`[CreditAudit] User ${user.id} is PRO. No deduction.`);
        }

        res.json({ result: responseText });
    } catch (error) {
        console.error("Chat Error:", error);
        res.status(500).json({ error: "Chat Failed" });
    }
});

// 5. Gemini Proxy: Parse URL for Recipe
router.post('/ai/parse-url', async (req, res) => {
    if (!genAI) {
        return res.status(503).json({ error: "AI Service Unavailable (Missing Key)" });
    }

    try {
        const { url, schema, familySize } = req.body;
        const user = await getUser(req);

        // Auth & Credit Check
        if (!user) return res.status(401).json({ error: "Unauthorized. Please Login." });

        if (user.subscriptionTier !== 'pro' && user.credits < 1) {
            return res.status(402).json({ error: "Insufficient credits" });
        }

        console.log(`[ParseURL] Fetching content from: ${url}`);
        
        // 1. Fetch the raw HTML from the target URL
        const pageResponse = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) KitchenSync/1.0'
            }
        });
        
        if (!pageResponse.ok) {
            throw new Error(`Failed to fetch URL: ${pageResponse.status} ${pageResponse.statusText}`);
        }
        
        const rawHtml = await pageResponse.text();
        
        // Basic cleanup: remove script and style tags to save tokens
        const cleanText = rawHtml
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
            .substring(0, 100000); // Cap length to avoid token limits

        // 2. Feed to Gemini
        const prompt = `
        You are an expert recipe extractor. Read the following HTML/text extracted from a webpage and identify the core recipe.
        Ignore ads, life stories, comments, and navigation.
        Extract the recipe name, servings, ingredients, instructions, and other details.
        CRITICAL INSTRUCTION: You must try to extract the main image URL for the recipe if it is available in the content (look for image tags, source attributes, or meta og:image). This should be returned as imageUrl.
        ${familySize ? `\nCRITICAL INSTRUCTION: You MUST scale the ingredient quantities from the web page to yield exactly ${familySize} servings instead of the website's default. Update the 'servings' field to ${familySize}.` : ''}
        
        Extracted Webpage Content:
        ${cleanText}
        `;

        const modelName = await resolveModel();
        const config = {
            responseMimeType: "application/json"
        };
        if (schema) {
            config.responseSchema = schema;
        }
        
        const result = await genAI.models.generateContent({
            model: modelName,
            contents: prompt,
            config: config
        });

        const responseText = typeof result.text === 'function' ? result.text() : result.text;
        const data = JSON.parse(responseText);

        // 3. Deduct Credit
        if (user.subscriptionTier !== 'pro') {
            const info = await db.query('UPDATE users SET credits = credits - 1 WHERE id = $1', [user.id]);
            console.log(`[CreditAudit] Deducted 1 credit for URL Parse. User ${user.id}`);
        }

        const finalCredit = user.subscriptionTier === 'pro' ? '∞' : (user.credits - 1);

        res.json({
            result: data,
            creditsRemaining: finalCredit
        });

    } catch (error) {
        console.error("URL Parsing Failed:", error);
        res.status(500).json({ error: "URL Parsing Failed", details: error.message });
    }
});

// 6. Gemini Proxy: Analyze Receipt
router.post('/ai/analyze-receipt', async (req, res) => {
    if (!genAI) {
        return res.status(503).json({ error: "AI Service Unavailable (Missing Key)" });
    }

    try {
        const { image, currentShoppingList } = req.body; // image as base64
        const user = await getUser(req);

        // Auth Check
        if (!user) return res.status(401).json({ error: "Unauthorized. Please Login." });

        // Validate Credits
        if (user.subscriptionTier !== 'pro' && user.credits < 1) {
            return res.status(402).json({ error: "Insufficient credits" });
        }

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

        const modelName = await resolveModel();
        const result = await genAI.models.generateContent({
            model: modelName,
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
            const info = await db.query('UPDATE users SET credits = credits - 1 WHERE id = $1', [user.id]);
            console.log(`[CreditAudit] Deducted 1 credit from User ${user.id}. Changes: ${info.rowCount}`);
        } else {
            console.log(`[CreditAudit] User ${user.id} is PRO. No deduction.`);
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

// 6. Debug: List Models
router.get('/ai/models', async (req, res) => {
    if (!genAI) return res.status(503).json({ error: "AI Service Unavailable" });
    try {
        let models = [];
        try {
            const list = await genAI.models.list();
            for await (const model of list) {
                models.push(model);
            }
        } catch (e1) {
            console.warn("List models method 1 failed", e1);
            try {
                // Fallback for older/different SDK structure
                const response = await genAI.listModels();
                models = response;
            } catch (e2) {
                console.warn("List models method 2 failed", e2);
                return res.status(500).json({ error: "Could not list models", details: [e1.message, e2.message] });
            }
        }

        const names = Array.isArray(models) ? models.map(m => m.name) : models;
        res.json({ models: names, current_configured: process.env.GEMINI_MODEL || "gemini-1.5-flash" });
    } catch (error) {
        console.error("List Models Error:", error);
        res.status(500).json({ error: "Failed to list models" });
    }
});

// 6. Gemini Proxy: Analyze Pantry Photo
router.post('/ai/scan-pantry', async (req, res) => {
    if (!genAI) {
        return res.status(503).json({ error: "AI Service Unavailable (Missing Key)" });
    }

    try {
        const { image } = req.body;
        const user = await getUser(req);

        if (!user) return res.status(401).json({ error: "Unauthorized. Please Login." });

        if (user.subscriptionTier !== 'pro' && user.credits < 1) {
            return res.status(402).json({ error: "Insufficient credits" });
        }

        const prompt = `
        You are a smart inventory assistant. Analyze this photo of a pantry shelf or refrigerator.
        
        Task:
        1. Identify clearly visible food and grocery items.
        2. Estimate the quantity (e.g. 1 jar, 10 eggs).
        3. Guess an appropriate unit and grocery category for each item.
        
        Output strictly as JSON:
        {
          "items": [
             { "name": "Item Name", "quantity": 1, "unit": "unit", "category": "Produce" }
          ]
        }
        `;

        const imagePart = {
            inlineData: {
                data: image.split(',')[1],
                mimeType: "image/jpeg"
            }
        };

        const modelName = await resolveModel();
        const result = await genAI.models.generateContent({
            model: modelName,
            contents: [prompt, imagePart],
            config: { responseMimeType: "application/json" }
        });

        const responseText = typeof result.text === 'function' ? result.text() : result.text;
        const cleanedText = responseText.replace(/```json|```/g, '').trim();
        const data = JSON.parse(cleanedText);

        if (user.subscriptionTier !== 'pro') {
            const info = await db.query('UPDATE users SET credits = credits - 1 WHERE id = $1', [user.id]);
            console.log(`[CreditAudit] Deducted 1 credit for Pantry Scan. User ${user.id}`);
        }

        const finalCredit = user.subscriptionTier === 'pro' ? '∞' : (user.credits - 1);

        res.json({ result: data, creditsRemaining: finalCredit });

    } catch (error) {
        console.error("Pantry Scan Failed:", error);
        res.status(500).json({ error: "Scan Failed", details: error.message });
    }
});

module.exports = router;
