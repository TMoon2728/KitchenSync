const express = require('express');
const router = express.Router();
const { GoogleGenAI } = require("@google/genai");
const rateLimit = require('express-rate-limit');

const db = require('../db');
const { normalizeRecipeIngredientsList } = require('../utils/ingredientNormalizer');

// --- AI Rate Limiter ---
const aiRateLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 10, // Limit each IP to 10 requests per `window`
    message: { error: "Too many AI requests from this IP, please try again after a minute." },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Initialize Gemini
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

// --- Helpers ---
const getUser = async (req, { includeHousehold = false } = {}) => {
    if (!req.user || !req.user.id) return null;
    const row = req.user;

    // Parse JSON fields for primary user
    const preferences = typeof row.preferences === 'string' ? JSON.parse(row.preferences || '{}') : (row.preferences || {});
    // The newer preferences payload structure nests actual preferences under `appPreferences`
    // to make room in the JSONB for other profile fields (household, grocery stores, etc.)
    const kitchenName = preferences.kitchenName || row.kitchen_name;
    const dailyCalorieGoal = preferences.dailyCalorieGoal || 2000;
    const proteinGoal = preferences.proteinGoal;
    const carbGoal = preferences.carbGoal;
    const fatGoal = preferences.fatGoal;

    let allHouseholdMembers = [...(preferences.householdMembers || [])];
    let allGroceryStores = [...(preferences.groceryStores || [])];
    let effectiveSubscriptionTier = row.effective_subscription_tier || row.subscription_tier;

    if (includeHousehold) {
        const householdId = row.household_id || String(row.id);
        const householdResult = await db.query(
            'SELECT * FROM users WHERE (household_id = $1 OR id::text = $1) AND id != $2',
            [householdId, row.id]
        );

        for (const hUser of householdResult.rows) {
            if (hUser.subscription_tier === 'pro') {
                effectiveSubscriptionTier = 'pro';
            }

            const hPrefs = typeof hUser.preferences === 'string' ? JSON.parse(hUser.preferences || '{}') : (hUser.preferences || {});

            // Add the linked user themselves as a household member automatically
            let defaultName = hUser.username;
            if (!defaultName || defaultName.includes('|')) {
                defaultName = hUser.email ? hUser.email.split('@')[0] : 'Partner';
            }
            const partnerName = hPrefs.name || defaultName;

            if (!allHouseholdMembers.find(m => m.name === partnerName)) {
                allHouseholdMembers.push({
                    id: `linked-${hUser.id}`,
                    name: partnerName,
                    dietaryRestrictions: "Linked Account"
                });
            }

            if (hPrefs.householdMembers) {
                hPrefs.householdMembers.forEach(m => {
                    if (!allHouseholdMembers.find(existing => existing.name === m.name)) {
                        allHouseholdMembers.push({
                            ...m,
                            _sourceUserId: hUser.id
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
        rawPreferences: preferences,
        inviteCode: row.invite_code,
        hasUsedFreeImageGeneration: !!preferences.hasUsedFreeImageGeneration,
        subscriptionTier: effectiveSubscriptionTier, // shared pro tier
        credits: effectiveSubscriptionTier === 'pro' ? '∞' : row.credits // show infinite if pro
    };
};

// --- Routes ---

// 1. Get User Profile
router.get('/user/profile', async (req, res) => {
    try {
        const user = await getUser(req, { includeHousehold: true });
        if (!user) return res.status(401).json({ error: "Unauthorized" });
        const { rawPreferences, password_hash, ...safeUser } = user;
        res.json(safeUser);
    } catch (e) {
        console.error("Profile Error:", e);
        res.status(500).json({ error: "Failed to fetch profile" });
    }
});

// 2. Update User Profile
router.put('/user/profile', async (req, res) => {
    try {
        const user = await getUser(req, { includeHousehold: true });
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
            name,
            hasUsedFreeImageGeneration
        } = req.body;

        // Read the raw DB JSONB preferences so we don't lose nested keys
        const currentRaw = user.rawPreferences || {};
        const currentAppPrefs = user.preferences || {};
        
        // Filter out linked accounts and borrowed members from being saved back as manual members
        const rawMembers = householdMembers !== undefined ? householdMembers : (currentRaw.householdMembers || []);
        const filteredMembers = rawMembers.filter(m => {
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
            ...currentRaw,
            kitchenName: kitchenName !== undefined ? kitchenName : currentRaw.kitchenName,
            dailyCalorieGoal: req.body.dailyCalorieGoal ?? req.body.calorieGoal ?? currentRaw.dailyCalorieGoal ?? 2000,
            proteinGoal: proteinGoal !== undefined ? proteinGoal : currentRaw.proteinGoal,
            carbGoal: carbGoal !== undefined ? carbGoal : currentRaw.carbGoal,
            fatGoal: fatGoal !== undefined ? fatGoal : currentRaw.fatGoal,
            householdMembers: cleanMembers,
            groceryStores: groceryStores !== undefined ? groceryStores : (currentRaw.groceryStores || []),
            appPreferences: preferences !== undefined ? { ...currentAppPrefs, ...preferences } : currentAppPrefs,
            avatar: avatar !== undefined ? avatar : currentRaw.avatar,
            name: name !== undefined ? name : currentRaw.name,
            hasUsedFreeImageGeneration: hasUsedFreeImageGeneration !== undefined
                ? hasUsedFreeImageGeneration
                : currentRaw.hasUsedFreeImageGeneration
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

// 3. Consume Credits (Atomic Pre-Flight Deduction)
router.post('/credits/consume', async (req, res) => {
    try {
        const { amount } = req.body;
        const user = await getUser(req);

        if (!user) return res.status(401).json({ error: "Unauthorized" });

        if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0 || amount > 10) {
            return res.status(400).json({ error: "Invalid amount. Must be a positive integer between 1 and 10." });
        }

        if (user.subscriptionTier === 'pro') {
            return res.json({ success: true, remaining: '∞', tier: 'pro' });
        }

        const deductResult = await db.query(
            'UPDATE users SET credits = credits - $1 WHERE id = $2 AND credits >= $1 RETURNING credits',
            [amount, user.id]
        );

        if (deductResult.rowCount === 0) {
            return res.status(402).json({ error: "Insufficient credits", current: user.credits });
        }

        const updatedCredits = deductResult.rows[0].credits;
        return res.json({ success: true, remaining: updatedCredits, tier: user.subscriptionTier });
    } catch (e) {
        console.error("Consume Credits Error:", e);
        res.status(500).json({ error: "Failed to consume credits" });
    }
});

// --- Model Resolution Helper (Single-Flight Memoized) ---
let activeModel = null;
let modelResolutionPromise = null;

const resolveModel = async () => {
    if (activeModel) return activeModel;
    if (modelResolutionPromise) return modelResolutionPromise;

    const preferred = process.env.GEMINI_MODEL || "gemini-2.5-flash";

    modelResolutionPromise = (async () => {
        try {
            const list = await genAI.models.list();
            const available = [];
            for await (const m of list) {
                available.push(m);
            }

            const modelNames = available.map(m => m.name.replace('models/', ''));
            console.log("Available Models:", modelNames);

            if (modelNames.includes(preferred)) {
                activeModel = preferred;
                return activeModel;
            }

            const flash25 = modelNames.find(n => n.includes('flash') && n.includes('2.5'));
            if (flash25) {
                activeModel = flash25;
                return activeModel;
            }

            const flash20 = modelNames.find(n => n.includes('flash') && n.includes('2.0'));
            if (flash20) {
                activeModel = flash20;
                return activeModel;
            }

            const flash = modelNames.find(n => n.includes('flash') && n.includes('1.5'));
            if (flash) {
                activeModel = flash;
                return activeModel;
            }

            const pro = modelNames.find(n => n.includes('pro') && (n.includes('2.5') || n.includes('1.5')));
            if (pro) {
                activeModel = pro;
                return activeModel;
            }

            const anyGemini = modelNames.find(n => n.includes('gemini'));
            if (anyGemini) {
                activeModel = anyGemini;
                return activeModel;
            }

            activeModel = preferred;
            return activeModel;
        } catch (e) {
            console.error("Failed to list models for resolution:", e);
            return preferred;
        } finally {
            modelResolutionPromise = null;
        }
    })();

    return modelResolutionPromise;
};


// 3. Gemini Proxy: Generate Recipe
router.post('/generate-recipe', aiRateLimiter, async (req, res) => {
    if (!genAI) {
        return res.status(503).json({ error: "AI Service Unavailable (Missing Key)" });
    }

    const rawCost = req.body?.cost;
    const creditCost = (typeof rawCost === 'number' && Number.isInteger(rawCost) && rawCost >= 1 && rawCost <= 5) ? rawCost : 1;
    let creditDeducted = false;
    let deductedUserId = null;

    try {
        const { prompt, schema, familySize } = req.body;
        if (!prompt || typeof prompt !== 'string') {
            return res.status(400).json({ error: "A valid prompt string is required." });
        }

        const user = await getUser(req);
        if (!user) return res.status(401).json({ error: "Unauthorized. Please Login." });

        let currentCredits = user.credits;

        // Pre-Flight Atomic Credit Check & Deduction
        if (user.subscriptionTier !== 'pro') {
            const deductResult = await db.query(
                'UPDATE users SET credits = credits - $1 WHERE id = $2 AND credits >= $1 RETURNING credits',
                [creditCost, user.id]
            );
            if (deductResult.rowCount === 0) {
                return res.status(402).json({ error: "Insufficient credits" });
            }
            creditDeducted = true;
            deductedUserId = user.id;
            currentCredits = deductResult.rows[0].credits;
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
             finalPrompt += `\n\nCRITICAL INSTRUCTION: You MUST scale the ingredient quantities to yield exactly ${familySize} servings. Update the 'servings' field to ${familySize}. Round countable items (eggs, cans, onions, rolls, sheets) to whole numbers, and round volume/weight to clean kitchen fractions (0.25, 0.33, 0.5, 0.67, 0.75). Keep ingredient names clean for a grocery list without preparation suffixes like ', chopped' or ', beaten', and do NOT include plain tap water.`;
        }

        const result = await genAI.models.generateContent({
            model: modelName,
            contents: finalPrompt,
            config: config
        });

        const responseText = typeof result.text === 'function' ? result.text() : result.text;
        const parsedOutput = JSON.parse(responseText);
        if (parsedOutput && !Array.isArray(parsedOutput) && Array.isArray(parsedOutput.ingredients)) {
            parsedOutput.ingredients = normalizeRecipeIngredientsList(parsedOutput.ingredients);
        }

        const finalCredit = user.subscriptionTier === 'pro' ? '∞' : currentCredits;

        res.json({
            result: parsedOutput,
            creditsRemaining: finalCredit
        });

    } catch (error) {
        console.error("Gemini API Error:", error);
        
        // Refund credit ONLY if pre-flight deduction actually occurred
        if (creditDeducted && deductedUserId) {
            await db.query('UPDATE users SET credits = credits + $1 WHERE id = $2', [creditCost, deductedUserId]).catch(() => {});
            console.log(`[CreditAudit] Refunded ${creditCost} credit(s) to User ${deductedUserId} due to API failure`);
        }

        // Reset active model on 404 to trigger re-resolution next time
        if (error.message && (error.message.includes('404') || error.message.includes('NOT_FOUND'))) {
            activeModel = null;
        }
        res.status(500).json({ error: "AI Generation Failed", details: error.message });
    }
});

// 3b. Gemini Proxy: Generate Image
router.post('/generate-image', aiRateLimiter, async (req, res) => {
    if (!genAI) {
        return res.status(503).json({ error: "AI Service Unavailable (Missing Key)" });
    }

    let creditDeducted = false;
    let deductedUserId = null;

    try {
        const { prompt } = req.body;
        if (!prompt || typeof prompt !== 'string') {
            return res.status(400).json({ error: "A valid prompt string is required." });
        }

        const user = await getUser(req);
        if (!user) return res.status(401).json({ error: "Unauthorized. Please Login." });

        let currentCredits = user.credits;

        // Pre-Flight Atomic Credit Check & Deduction
        if (user.subscriptionTier !== 'pro') {
            const deductResult = await db.query(
                'UPDATE users SET credits = credits - 1 WHERE id = $1 AND credits >= 1 RETURNING credits',
                [user.id]
            );
            if (deductResult.rowCount === 0) {
                return res.status(402).json({ error: "Insufficient credits" });
            }
            creditDeducted = true;
            deductedUserId = user.id;
            currentCredits = deductResult.rows[0].credits;
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
            base64Image = `https://loremflickr.com/500/500/food,meal`;
        }

        const finalCredit = user.subscriptionTier === 'pro' ? '∞' : currentCredits;

        res.json({
            result: base64Image,
            creditsRemaining: finalCredit
        });

    } catch (error) {
        console.error("Gemini Image Generation Error:", error);

        if (creditDeducted && deductedUserId) {
            await db.query('UPDATE users SET credits = credits + 1 WHERE id = $1', [deductedUserId]).catch(() => {});
            console.log(`[CreditAudit] Refunded 1 credit to User ${deductedUserId} due to API Image failure`);
        }

        res.status(500).json({ error: "Image Generation Failed", details: error.message });
    }
});



// 4. Gemini Proxy: Chat (Sous Chef)
router.post('/chat', aiRateLimiter, async (req, res) => {
    if (!genAI) return res.status(503).json({ error: "AI Service Unavailable" });

    let creditDeducted = false;
    let deductedUserId = null;

    try {
        const { history, message, systemInstruction } = req.body;
        if (!message || typeof message !== 'string') {
            return res.status(400).json({ error: "A valid message is required." });
        }

        const user = await getUser(req);
        if (!user) return res.status(401).json({ error: "Unauthorized" });

        // Pre-Flight Atomic Credit Check & Deduction
        if (user.subscriptionTier !== 'pro') {
            const deductResult = await db.query(
                'UPDATE users SET credits = credits - 1 WHERE id = $1 AND credits >= 1 RETURNING credits',
                [user.id]
            );
            if (deductResult.rowCount === 0) {
                return res.status(402).json({ error: "Insufficient credits" });
            }
            creditDeducted = true;
            deductedUserId = user.id;
        }

        const modelName = await resolveModel();
        const normalizedHistory = [];
        if (Array.isArray(history)) {
            for (const entry of history.slice(-20)) {
                if (!entry || (entry.role !== 'user' && entry.role !== 'model')) continue;
                const textVal = typeof entry.text === 'string'
                    ? entry.text.trim()
                    : (Array.isArray(entry.parts) && typeof entry.parts[0]?.text === 'string' ? entry.parts[0].text.trim() : '');
                if (!textVal) continue;
                // Gemini multi-turn history must start with a 'user' turn
                if (normalizedHistory.length === 0 && entry.role !== 'user') continue;
                normalizedHistory.push({
                    role: entry.role,
                    parts: [{ text: textVal }]
                });
            }
            // Drop trailing user message if the client included the current prompt inside history
            if (
                normalizedHistory.length > 0 &&
                normalizedHistory[normalizedHistory.length - 1].role === 'user' &&
                normalizedHistory[normalizedHistory.length - 1].parts[0].text === message.trim()
            ) {
                normalizedHistory.pop();
            }
        }

        const chat = genAI.chats.create({
            model: modelName,
            config: { systemInstruction },
            history: normalizedHistory
        });

        const result = await chat.sendMessage({ message });
        const responseText = typeof result.text === 'function' ? result.text() : result.text;

        res.json({ result: responseText });
    } catch (error) {
        console.error("Chat Error:", error);

        if (creditDeducted && deductedUserId) {
            await db.query('UPDATE users SET credits = credits + 1 WHERE id = $1', [deductedUserId]).catch(() => {});
            console.log(`[CreditAudit] Refunded 1 credit to User ${deductedUserId} due to API Chat failure`);
        }

        res.status(500).json({ error: "Chat Failed" });
    }
});

// --- URL Scraping & Pinterest Unwrapping Helpers ---
const isPrivateOrReservedIp = (ipStr) => {
    const clean = String(ipStr || '').toLowerCase().replace(/^\[|\]$/g, '');
    if (
        clean === 'localhost' ||
        clean === '127.0.0.1' ||
        clean === '0.0.0.0' ||
        clean === '::1' ||
        clean === '::' ||
        clean.startsWith('127.') ||
        clean.startsWith('10.') ||
        clean.startsWith('192.168.') ||
        clean.startsWith('169.254.') ||
        clean.startsWith('::ffff:127.') ||
        clean.startsWith('::ffff:10.') ||
        clean.startsWith('::ffff:192.168.') ||
        clean.startsWith('::ffff:169.254.') ||
        clean.startsWith('fe80:') ||
        clean.startsWith('fc00:') ||
        clean.startsWith('fd00:') ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(clean) ||
        /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./.test(clean)
    ) {
        return true;
    }
    return false;
};

const isSafePublicUrl = (urlStr) => {
    try {
        const parsed = new URL(urlStr);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return { ok: false, error: "Only http and https URLs are supported" };
        }
        const host = parsed.hostname.toLowerCase();
        if (
            isPrivateOrReservedIp(host) ||
            host.endsWith('.local') ||
            host.endsWith('.internal') ||
            /^\d+$/.test(host) // block decimal-encoded IPv4 literals
        ) {
            return { ok: false, error: "Restricted URL host" };
        }
        return { ok: true, parsed };
    } catch (_) {
        return { ok: false, error: "Invalid URL provided" };
    }
};

const IGNORED_OUTBOUND_DOMAINS = [
    'pinterest.', 'pinimg.com', 'pin.it', 'facebook.com', 'instagram.com',
    'twitter.com', 'x.com', 'google.com', 'apple.com', 'play.google.com',
    'cloudflare.com', 'w3.org', 'schema.org', 'example.com', ' doubleclick.net'
];

const isCandidateRecipeUrl = (candidateStr) => {
    const check = isSafePublicUrl(candidateStr);
    if (!check.ok) return false;
    const host = check.parsed.hostname.toLowerCase();
    if (IGNORED_OUTBOUND_DOMAINS.some(d => host.includes(d.trim()))) return false;
    if (/\.(jpg|jpeg|png|gif|webp|svg|css|js|woff2?|ttf|ico)(\?|$)/i.test(check.parsed.pathname)) return false;
    return true;
};

const findRecipeNodeInJsonLd = (node) => {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node)) {
        for (const item of node) {
            const found = findRecipeNodeInJsonLd(item);
            if (found) return found;
        }
        return null;
    }
    const typeVal = node['@type'];
    const isRecipeType =
        typeVal === 'Recipe' ||
        (typeof typeVal === 'string' && typeVal.toLowerCase().endsWith('recipe')) ||
        (Array.isArray(typeVal) && typeVal.some(t => typeof t === 'string' && t.toLowerCase().includes('recipe')));

    if (isRecipeType && Array.isArray(node.recipeIngredient) && node.recipeIngredient.length > 0 && node.recipeInstructions) {
        return {
            '@type': 'Recipe',
            name: node.name,
            description: node.description,
            recipeYield: node.recipeYield || node.yield,
            prepTime: node.prepTime,
            cookTime: node.cookTime,
            totalTime: node.totalTime,
            recipeCategory: node.recipeCategory,
            recipeCuisine: node.recipeCuisine,
            keywords: node.keywords,
            nutrition: node.nutrition,
            image: node.image,
            recipeIngredient: node.recipeIngredient,
            recipeInstructions: node.recipeInstructions
        };
    }

    if (Array.isArray(node['@graph'])) {
        return findRecipeNodeInJsonLd(node['@graph']);
    }
    return null;
};

const extractHtmlInsights = (rawHtml = '') => {
    if (!rawHtml) {
        return { metaSummary: '', jsonLdSummary: '', recipeJsonLd: null, pinterestSummary: '', outboundUrl: null, ogImage: null, cleanText: '' };
    }

    // 1. Extract <title> and <meta> tags
    const metaLines = [];
    let ogImage = null;
    const titleMatch = rawHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
        metaLines.push(`Title: ${titleMatch[1].replace(/\s+/g, ' ').trim()}`);
    }

    const metaRegex = /<meta\s+[^>]*>/gi;
    let metaTag;
    while ((metaTag = metaRegex.exec(rawHtml)) !== null) {
        const tag = metaTag[0];
        const propMatch = tag.match(/(?:property|name)=["']([^"']+)["']/i);
        const contentMatch = tag.match(/content=["']([^"']+)["']/i);
        if (propMatch && contentMatch) {
            const key = propMatch[1].toLowerCase();
            const val = contentMatch[1].trim();
            if (
                key.startsWith('og:') ||
                key.startsWith('twitter:') ||
                key.includes('description') ||
                key.includes('title') ||
                key.startsWith('pinterestapp:')
            ) {
                metaLines.push(`${key}: ${val}`);
                if ((key === 'og:image' || key === 'twitter:image') && !ogImage && val.startsWith('http')) {
                    ogImage = val;
                }
            }
        }
    }

    // 2. Extract <script type="application/ld+json"> before stripping scripts
    const jsonLdBlocks = [];
    let recipeJsonLd = null;
    const ldRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let ldMatch;
    while ((ldMatch = ldRegex.exec(rawHtml)) !== null) {
        const content = (ldMatch[1] || '').trim();
        if (content) {
            jsonLdBlocks.push(content.substring(0, 25000));
            if (!recipeJsonLd) {
                try {
                    const parsedLd = JSON.parse(content);
                    const recipeNode = findRecipeNodeInJsonLd(parsedLd);
                    if (recipeNode) {
                        recipeJsonLd = JSON.stringify(recipeNode);
                    }
                } catch (_) {
                    // Ignore malformed JSON-LD blocks and continue
                }
            }
        }
    }

    // 3. Extract Pinterest hydration JSON (__PWS_INITIAL_PROPS__, __PWS_DATA__, data-relay-response)
    let outboundUrl = null;
    const pinterestSnippets = [];
    const pwsRegex = /<script[^>]*(?:id=["']__PWS_(?:INITIAL_PROPS|DATA)__["']|data-relay-response=["']true["'])[^>]*>([\s\S]*?)<\/script>/gi;
    let pwsMatch;
    while ((pwsMatch = pwsRegex.exec(rawHtml)) !== null) {
        const rawJson = (pwsMatch[1] || '').trim();
        if (!rawJson) continue;

        // Look for outbound recipe URL inside Pinterest JSON
        const linkPatterns = [
            /"link"\s*:\s*"(https?:\/\/[^"]+)"/gi,
            /"tracked_link"\s*:\s*"(https?:\/\/[^"]+)"/gi,
            /"rich_metadata"\s*:\s*\{[^}]*"url"\s*:\s*"(https?:\/\/[^"]+)"/gi,
            /"attribution"\s*:\s*\{[^}]*"url"\s*:\s*"(https?:\/\/[^"]+)"/gi
        ];
        for (const pat of linkPatterns) {
            let m;
            while ((m = pat.exec(rawJson)) !== null) {
                const unescaped = m[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/');
                if (isCandidateRecipeUrl(unescaped)) {
                    outboundUrl = unescaped;
                    break;
                }
            }
            if (outboundUrl) break;
        }

        // Extract meaningful text fields from Pinterest JSON (descriptions, titles, rich_metadata.recipe)
        const textFieldRegex = /"(?:description|closeup_unified_description|grid_title|title|display_description|article_body|ingredient|ingredients|instructions)"\s*:\s*(\[[^\]]*\]|"[^"]{5,2000}")/gi;
        let tf;
        while ((tf = textFieldRegex.exec(rawJson)) !== null && pinterestSnippets.length < 25) {
            pinterestSnippets.push(tf[0]);
        }

        if (!ogImage) {
            const imgMatch = rawJson.match(/"orig"\s*:\s*\{\s*[^}]*"url"\s*:\s*"(https:\/\/i\.pinimg\.com\/[^"]+)"/i);
            if (imgMatch) ogImage = imgMatch[1];
        }
    }

    // 4. Strip scripts/styles/svg to get visible body text
    const cleanText = rawHtml
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
        .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 60000);

    return {
        metaSummary: metaLines.slice(0, 30).join('\n'),
        jsonLdSummary: jsonLdBlocks.join('\n---\n').substring(0, 40000),
        recipeJsonLd,
        pinterestSummary: pinterestSnippets.join('\n').substring(0, 15000),
        outboundUrl,
        ogImage,
        cleanText
    };
};

const dns = require('dns').promises;

const assertSafeResolvedHost = async (urlStr) => {
    const check = isSafePublicUrl(urlStr);
    if (!check.ok) return check;
    const hostname = check.parsed.hostname.replace(/^\[|\]$/g, '');
    try {
        const records = await dns.lookup(hostname, { all: true });
        for (const rec of records) {
            if (isPrivateOrReservedIp(rec.address)) {
                return { ok: false, error: "Restricted resolved IP address" };
            }
        }
        return { ok: true, parsed: check.parsed };
    } catch (_) {
        return { ok: false, error: "Could not resolve target hostname" };
    }
};

const readBoundedText = async (response, maxBytes = 2 * 1024 * 1024) => {
    if (!response.body || typeof response.body.getReader !== 'function') {
        const text = await response.text();
        return text.substring(0, maxBytes);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: false });
    let totalBytes = 0;
    let out = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
            totalBytes += value.byteLength;
            if (totalBytes > maxBytes) {
                out += decoder.decode(value.subarray(0, Math.max(0, maxBytes - (totalBytes - value.byteLength))), { stream: false });
                await reader.cancel().catch(() => {});
                break;
            }
            out += decoder.decode(value, { stream: true });
        }
    }
    out += decoder.decode();
    return out;
};

const fetchViaJinaReader = async (targetUrl) => {
    try {
        const safety = await assertSafeResolvedHost(targetUrl);
        if (!safety.ok) return '';
        const res = await fetch(`https://r.jina.ai/${targetUrl}`, {
            headers: {
                'Accept': 'text/plain',
                'X-Return-Format': 'markdown'
            },
            signal: AbortSignal.timeout(12000)
        });
        if (!res.ok) return '';
        const text = await readBoundedText(res, 512 * 1024);
        return text ? text.substring(0, 60000) : '';
    } catch (e) {
        console.warn(`[ParseURL] Jina Reader failed for ${targetUrl}: ${e.message}`);
        return '';
    }
};

const fetchSingleUrlInsights = async (targetUrl) => {
    let finalUrl = targetUrl;
    let rawHtml = '';
    let blockedOrEmpty = false;

    try {
        let currentUrl = targetUrl;
        let pageResponse = null;

        // Follow up to 4 redirects manually, validating each hop against SSRF & DNS rebinding
        for (let hop = 0; hop <= 4; hop++) {
            const hopCheck = await assertSafeResolvedHost(currentUrl);
            if (!hopCheck.ok) {
                throw new Error(hopCheck.error || 'Blocked unsafe redirect hop');
            }
            finalUrl = currentUrl;

            pageResponse = await fetch(currentUrl, {
                redirect: 'manual',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9'
                },
                signal: AbortSignal.timeout(10000)
            });

            if (pageResponse.status >= 300 && pageResponse.status < 400) {
                const location = pageResponse.headers.get('location');
                if (!location) break;
                currentUrl = new URL(location, currentUrl).toString();
                continue;
            }
            break;
        }

        if (!pageResponse || !pageResponse.ok) {
            blockedOrEmpty = true;
        } else {
            rawHtml = await readBoundedText(pageResponse, 2 * 1024 * 1024);
            if (rawHtml.includes('Just a moment...') || rawHtml.includes('cf-browser-verification') || rawHtml.length < 1000) {
                blockedOrEmpty = true;
            }
        }
    } catch (err) {
        console.warn(`[ParseURL] Direct fetch failed for ${targetUrl}: ${err.message}`);
        blockedOrEmpty = true;
    }

    const insights = extractHtmlInsights(rawHtml);
    let jinaMarkdown = '';

    const isPinterest = /(^|\.)pinterest\.|(^|\.)pin\.it$/i.test(new URL(finalUrl).hostname);
    const hasEnoughContent = insights.jsonLdSummary.length > 100 || insights.cleanText.length > 800 || insights.pinterestSummary.length > 200;

    if (blockedOrEmpty || !hasEnoughContent || (isPinterest && !insights.outboundUrl)) {
        jinaMarkdown = await fetchViaJinaReader(finalUrl);
        if (isPinterest && !insights.outboundUrl && jinaMarkdown) {
            // Look for external recipe blog links in Jina markdown
            const mdLinkRegex = /https?:\/\/[^\s)>\]"']+/gi;
            let m;
            while ((m = mdLinkRegex.exec(jinaMarkdown)) !== null) {
                if (isCandidateRecipeUrl(m[0])) {
                    insights.outboundUrl = m[0];
                    break;
                }
            }
        }
    }

    return { finalUrl, isPinterest, insights, jinaMarkdown };
};

const parseQuantityNumber = (val) => {
    if (typeof val === 'number' && !Number.isNaN(val)) return val;
    if (typeof val === 'string') {
        const trimmed = val.trim();
        const fracMatch = trimmed.match(/^(\d+)\s+(\d+)\/(\d+)$/);
        if (fracMatch) return Number(fracMatch[1]) + Number(fracMatch[2]) / Number(fracMatch[3]);
        const simpleFrac = trimmed.match(/^(\d+)\/(\d+)$/);
        if (simpleFrac) return Number(simpleFrac[1]) / Number(simpleFrac[2]);
        const num = parseFloat(trimmed.replace(/[^0-9.]/g, ''));
        if (!Number.isNaN(num) && num > 0) return num;
    }
    return 1;
};

const normalizeExtractedRecipe = (rawData, sourceUrl, fallbackImage, familySize) => {
    if (!rawData || typeof rawData !== 'object') return null;
    const validMealTypes = ['Main Course', 'Side Dish', 'Dessert', 'Snack', 'Meal Prep'];
    const mealType = validMealTypes.includes(rawData.meal_type) ? rawData.meal_type : 'Main Course';

    let instructions = rawData.instructions || '';
    if (Array.isArray(instructions)) {
        instructions = instructions
            .map((step, idx) => {
                const text = typeof step === 'string' ? step : (step?.text || '');
                return /^\d+\./.test(text.trim()) ? text.trim() : `${idx + 1}. ${text.trim()}`;
            })
            .filter(Boolean)
            .join('\n\n');
    }

    const rawIngredients = Array.isArray(rawData.ingredients) ? rawData.ingredients : [];
    const ingredients = normalizeRecipeIngredientsList(rawIngredients);

    if (!rawData.name || ingredients.length === 0 || !instructions) {
        return null;
    }

    return {
        name: String(rawData.name).trim(),
        servings: Number(familySize || rawData.servings || 4),
        prep_time: String(rawData.prep_time || '15 mins'),
        cook_time: String(rawData.cook_time || '30 mins'),
        calories: Number(rawData.calories || 400),
        protein: Number(rawData.protein || 20),
        fat: Number(rawData.fat || 15),
        carbs: Number(rawData.carbs || 40),
        ingredients,
        instructions: String(instructions).trim(),
        meal_type: mealType,
        tags: Array.isArray(rawData.tags) ? rawData.tags.map(String) : [],
        imageUrl: rawData.imageUrl || fallbackImage || undefined,
        source: sourceUrl
    };
};

// 5. Gemini Proxy: Parse URL for Recipe
router.post('/ai/parse-url', aiRateLimiter, async (req, res) => {
    if (!genAI) {
        return res.status(503).json({ error: "AI Service Unavailable (Missing Key)" });
    }

    let creditDeducted = false;
    let deductedUserId = null;

    try {
        const { url, schema, familySize } = req.body;
        const user = await getUser(req);

        // Auth & Credit Check
        if (!user) return res.status(401).json({ error: "Unauthorized. Please Login." });

        // SSRF Protection: Validate URL protocol, private IP ranges, and DNS resolution
        const safetyCheck = await assertSafeResolvedHost(url);
        if (!safetyCheck.ok) {
            return res.status(400).json({ error: safetyCheck.error });
        }

        let currentCredits = user.credits;

        // Pre-Flight Atomic Credit Check & Deduction
        if (user.subscriptionTier !== 'pro') {
            const deductResult = await db.query(
                'UPDATE users SET credits = credits - 1 WHERE id = $1 AND credits >= 1 RETURNING credits',
                [user.id]
            );
            if (deductResult.rowCount === 0) {
                return res.status(402).json({ error: "Insufficient credits" });
            }
            creditDeducted = true;
            deductedUserId = user.id;
            currentCredits = deductResult.rows[0].credits;
        }

        console.log(`[ParseURL] Fetching content from: ${url}`);

        // Step 1: Scrape primary URL (and unwrap Pinterest pins if applicable)
        const primary = await fetchSingleUrlInsights(url);
        let effectiveSourceUrl = primary.finalUrl;
        let fallbackImage = primary.insights.ogImage;
        let fastRecipeJsonLd = primary.insights.recipeJsonLd || null;
        let fastMetaSummary = primary.insights.metaSummary || '';
        const contextBlocks = [];

        if (primary.insights.metaSummary) {
            contextBlocks.push(`=== PAGE METADATA (${primary.finalUrl}) ===\n${primary.insights.metaSummary}`);
        }
        if (primary.insights.jsonLdSummary) {
            contextBlocks.push(`=== JSON-LD STRUCTURED DATA (${primary.finalUrl}) ===\n${primary.insights.jsonLdSummary}`);
        }
        if (primary.insights.pinterestSummary) {
            contextBlocks.push(`=== PINTEREST PIN DATA ===\n${primary.insights.pinterestSummary}`);
        }
        if (primary.jinaMarkdown) {
            contextBlocks.push(`=== RENDERED PAGE MARKDOWN (${primary.finalUrl}) ===\n${primary.jinaMarkdown}`);
        }
        if (primary.insights.cleanText) {
            contextBlocks.push(`=== PAGE BODY TEXT (${primary.finalUrl}) ===\n${primary.insights.cleanText}`);
        }

        // Step 2: If this was a Pinterest URL and we discovered an outbound recipe blog link, follow it!
        if (primary.isPinterest && primary.insights.outboundUrl) {
            const outboundUrl = primary.insights.outboundUrl;
            console.log(`[ParseURL] Following Pinterest outbound recipe link: ${outboundUrl}`);
            const outbound = await fetchSingleUrlInsights(outboundUrl);
            effectiveSourceUrl = outbound.finalUrl || outboundUrl;
            if (outbound.insights.ogImage) {
                fallbackImage = outbound.insights.ogImage;
            }
            if (outbound.insights.recipeJsonLd) {
                fastRecipeJsonLd = outbound.insights.recipeJsonLd;
                fastMetaSummary = outbound.insights.metaSummary || fastMetaSummary;
            }
            if (outbound.insights.jsonLdSummary) {
                contextBlocks.unshift(`=== LINKED RECIPE BLOG JSON-LD (${effectiveSourceUrl}) ===\n${outbound.insights.jsonLdSummary}`);
            }
            if (outbound.insights.metaSummary) {
                contextBlocks.unshift(`=== LINKED RECIPE BLOG METADATA (${effectiveSourceUrl}) ===\n${outbound.insights.metaSummary}`);
            }
            if (outbound.jinaMarkdown) {
                contextBlocks.push(`=== LINKED RECIPE BLOG MARKDOWN (${effectiveSourceUrl}) ===\n${outbound.jinaMarkdown}`);
            }
            if (outbound.insights.cleanText) {
                contextBlocks.push(`=== LINKED RECIPE BLOG TEXT (${effectiveSourceUrl}) ===\n${outbound.insights.cleanText}`);
            }
        }

        const fullCombinedContent = contextBlocks.join('\n\n').substring(0, 110000);
        // JSON-LD Fast Path: When structured Schema.org Recipe JSON-LD is present, avoid sending 110K chars of noisy HTML/Markdown
        const combinedExtractedContent = fastRecipeJsonLd
            ? `=== PAGE METADATA (${effectiveSourceUrl}) ===\n${fastMetaSummary}\n\n=== STRUCTURED RECIPE JSON-LD ===\n${fastRecipeJsonLd}`
            : fullCombinedContent;
        const hasSubstantialContent = combinedExtractedContent.length >= 150;
        const modelName = await resolveModel();
        let parsedRecipe = null;

        // Step 3A: Try structured extraction from the scraped content first
        if (hasSubstantialContent) {
            try {
                const extractPrompt = `
You are an expert recipe extractor. Extract the core recipe from the following webpage/Pin content retrieved from ${effectiveSourceUrl} (original link: ${url}).
Ignore ads, life stories, comments, and navigation.
If the source is a social media post or Pinterest Pin with partial instructions, infer reasonable culinary steps and quantities to make the recipe complete and cookable.
CRITICAL INGREDIENT RULES:
1. Keep ingredient "name" as a clean grocery store item WITHOUT preparation notes (e.g., use "Ground Beef", "Large Egg", "Yellow Onion", "Bacon" — do NOT include ", chopped", ", diced", ", beaten", ", thawed", ", peeled and chopped" in the ingredient name; put prep actions in "instructions").
2. Do NOT include plain tap water in the ingredients list.
3. Assign each ingredient a strict category from: "Produce", "Meat", "Dairy & Eggs", "Bakery", "Frozen", "Pantry Staples", "Beverages", "Household", "Other".
4. Extract the main image URL for the recipe if available (look for og:image, JSON-LD image, or pinimg URLs) and return it as imageUrl.
${familySize ? `\nCRITICAL SCALING INSTRUCTION: Scale the ingredient quantities to yield ${familySize} servings and set 'servings' to ${familySize}. Round countable items (eggs, cans, onions, rolls, sheets) to whole numbers (never 0.83 egg or 0.83 can!), and round volume/weight measurements to clean culinary fractions (0.25, 0.33, 0.5, 0.67, 0.75).` : ''}

Extracted Webpage Content:
${combinedExtractedContent}
`;
                const config = { responseMimeType: "application/json" };
                if (schema) config.responseSchema = schema;

                const result = await genAI.models.generateContent({
                    model: modelName,
                    contents: extractPrompt,
                    config
                });
                const responseText = typeof result.text === 'function' ? result.text() : result.text;
                const rawJson = JSON.parse(responseText.replace(/```json|```/g, '').trim());
                parsedRecipe = normalizeExtractedRecipe(rawJson, effectiveSourceUrl, fallbackImage, familySize);
            } catch (extractErr) {
                console.warn(`[ParseURL] Primary structured extraction failed (${extractErr.message}), falling back to Google Search Grounding.`);
            }
        }

        // Step 3B: Fallback to Google Search Grounding (NOTE: Gemini API does not allow responseMimeType/responseSchema alongside googleSearch tool)
        if (!parsedRecipe) {
            console.log(`[ParseURL] Activating Google Search Grounding for URL: ${effectiveSourceUrl}`);
            const searchPrompt = `
You are an expert recipe extractor. The user wants to import the recipe from this URL: ${effectiveSourceUrl} (originally shared as: ${url}).
${combinedExtractedContent ? `\nKnown metadata from link:\n${combinedExtractedContent.substring(0, 4000)}\n` : ''}
Use Google Search to find the recipe at that URL or matching that title/pin, and extract the complete ingredients and step-by-step instructions.
${familySize ? `Scale the ingredient quantities to yield ${familySize} servings and set "servings" to ${familySize}.` : ''}

Respond ONLY with a valid JSON object (no markdown formatting, no extra commentary) matching this exact structure:
{
  "name": "Recipe Title",
  "servings": 4,
  "prep_time": "15 mins",
  "cook_time": "30 mins",
  "calories": 450,
  "protein": 25,
  "fat": 18,
  "carbs": 42,
  "ingredients": [
    { "name": "Ingredient Name", "quantity": 1, "unit": "cup", "category": "Produce" }
  ],
  "instructions": "1. First step...\\n\\n2. Second step...",
  "meal_type": "Main Course",
  "tags": ["Dinner", "Easy"],
  "imageUrl": ${fallbackImage ? JSON.stringify(fallbackImage) : 'null'}
}
`;
            const searchResult = await genAI.models.generateContent({
                model: modelName,
                contents: searchPrompt,
                config: {
                    tools: [{ googleSearch: {} }]
                }
            });

            const rawSearchText = (typeof searchResult.text === 'function' ? searchResult.text() : searchResult.text) || '';
            const cleanedSearchText = rawSearchText.replace(/```json|```/gi, '').trim();
            const jsonBraceMatch = cleanedSearchText.match(/\{[\s\S]*\}/);
            if (!jsonBraceMatch) {
                throw new Error("Could not extract recipe JSON from search grounding response");
            }
            const rawSearchJson = JSON.parse(jsonBraceMatch[0]);
            parsedRecipe = normalizeExtractedRecipe(rawSearchJson, effectiveSourceUrl, fallbackImage, familySize);
        }

        if (!parsedRecipe) {
            throw new Error("Could not extract a valid recipe from the provided URL");
        }

        const finalCredit = user.subscriptionTier === 'pro' ? '∞' : currentCredits;

        res.json({
            result: parsedRecipe,
            creditsRemaining: finalCredit
        });

    } catch (error) {
        console.error("URL Parsing Failed:", error);

        if (creditDeducted && deductedUserId) {
            await db.query('UPDATE users SET credits = credits + 1 WHERE id = $1', [deductedUserId]).catch(() => {});
            console.log(`[CreditAudit] Refunded 1 credit to User ${deductedUserId} due to API URL Parse failure`);
        }

        res.status(500).json({ error: "URL Parsing Failed", details: error.message });
    }
});

// 6. Gemini Proxy: Analyze Receipt
router.post('/ai/analyze-receipt', aiRateLimiter, async (req, res) => {
    if (!genAI) {
        return res.status(503).json({ error: "AI Service Unavailable (Missing Key)" });
    }

    let creditDeducted = false;
    let deductedUserId = null;

    try {
        const { image, currentShoppingList } = req.body; // image as base64
        if (!image || typeof image !== 'string' || !image.includes(',')) {
            return res.status(400).json({ error: "A valid base64 image payload is required." });
        }

        const user = await getUser(req);

        // Auth Check
        if (!user) return res.status(401).json({ error: "Unauthorized. Please Login." });

        let currentCredits = user.credits;

        // Pre-Flight Atomic Credit Check & Deduction
        if (user.subscriptionTier !== 'pro') {
            const deductResult = await db.query(
                'UPDATE users SET credits = credits - 1 WHERE id = $1 AND credits >= 1 RETURNING credits',
                [user.id]
            );
            if (deductResult.rowCount === 0) {
                return res.status(402).json({ error: "Insufficient credits" });
            }
            creditDeducted = true;
            deductedUserId = user.id;
            currentCredits = deductResult.rows[0].credits;
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
                data: image.split(',')[1],
                mimeType: "image/jpeg"
            }
        };

        const modelName = await resolveModel();
        const result = await genAI.models.generateContent({
            model: modelName,
            contents: [prompt, imagePart],
            config: {
                responseMimeType: "application/json"
            }
        });

        const responseText = typeof result.text === 'function' ? result.text() : result.text;

        // Parse JSON safely
        const cleanedText = responseText.replace(/```json|```/g, '').trim();
        const data = JSON.parse(cleanedText);

        const finalCredit = user.subscriptionTier === 'pro' ? '∞' : currentCredits;

        res.json({
            result: data,
            creditsRemaining: finalCredit
        });

    } catch (error) {
        console.error("Receipt Analysis Failed:", error);

        if (creditDeducted && deductedUserId) {
            await db.query('UPDATE users SET credits = credits + 1 WHERE id = $1', [deductedUserId]).catch(() => {});
            console.log(`[CreditAudit] Refunded 1 credit to User ${deductedUserId} due to API Receipt Parse failure`);
        }

        res.status(500).json({ error: "Analysis Failed", details: error.message });
    }
});

// 6. Debug: List Models (Authenticated & Rate-Limited)
router.get('/ai/models', aiRateLimiter, async (req, res) => {
    if (!genAI) return res.status(503).json({ error: "AI Service Unavailable" });
    try {
        const user = await getUser(req);
        if (!user) return res.status(401).json({ error: "Unauthorized" });

        let models = [];
        try {
            const list = await genAI.models.list();
            for await (const model of list) {
                models.push(model);
            }
        } catch (e1) {
            console.warn("List models method 1 failed", e1);
            try {
                const response = await genAI.listModels();
                models = response;
            } catch (e2) {
                console.warn("List models method 2 failed", e2);
                return res.status(500).json({ error: "Could not list models", details: [e1.message, e2.message] });
            }
        }

        const names = Array.isArray(models) ? models.map(m => m.name) : models;
        res.json({ models: names, current_configured: process.env.GEMINI_MODEL || "gemini-2.5-flash" });
    } catch (error) {
        console.error("List Models Error:", error);
        res.status(500).json({ error: "Failed to list models" });
    }
});

// 6. Gemini Proxy: Analyze Pantry Photo
router.post('/ai/scan-pantry', aiRateLimiter, async (req, res) => {
    if (!genAI) {
        return res.status(503).json({ error: "AI Service Unavailable (Missing Key)" });
    }

    let creditDeducted = false;
    let deductedUserId = null;

    try {
        const { image } = req.body;
        if (!image || typeof image !== 'string' || !image.includes(',')) {
            return res.status(400).json({ error: "A valid base64 image payload is required." });
        }

        const user = await getUser(req);

        if (!user) return res.status(401).json({ error: "Unauthorized. Please Login." });

        let currentCredits = user.credits;

        // Pre-Flight Atomic Credit Check & Deduction
        if (user.subscriptionTier !== 'pro') {
            const deductResult = await db.query(
                'UPDATE users SET credits = credits - 1 WHERE id = $1 AND credits >= 1 RETURNING credits',
                [user.id]
            );
            if (deductResult.rowCount === 0) {
                return res.status(402).json({ error: "Insufficient credits" });
            }
            creditDeducted = true;
            deductedUserId = user.id;
            currentCredits = deductResult.rows[0].credits;
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

        const finalCredit = user.subscriptionTier === 'pro' ? '∞' : currentCredits;

        res.json({ result: data, creditsRemaining: finalCredit });

    } catch (error) {
        console.error("Pantry Scan Failed:", error);

        if (creditDeducted && deductedUserId) {
            await db.query('UPDATE users SET credits = credits + 1 WHERE id = $1', [deductedUserId]).catch(() => {});
            console.log(`[CreditAudit] Refunded 1 credit to User ${deductedUserId} due to API Pantry Scan failure`);
        }

        res.status(500).json({ error: "Scan Failed", details: error.message });
    }
});

module.exports = router;
