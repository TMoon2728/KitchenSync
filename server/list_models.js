require('dotenv').config();
const { GoogleGenAI } = require("@google/genai");

async function listModels() {
    try {
        if (!process.env.GEMINI_API_KEY) {
            console.error("Error: GEMINI_API_KEY not found in environment.");
            return;
        }

        const genAI = new GoogleGenAI(process.env.GEMINI_API_KEY);
        // Note: In some SDK versions, listModels might be on the client or helper.
        // For @google/genai, it is usually separate or on the client.
        // Since I don't have the exact docs for the *very* latest @google/genai vs @google/generative-ai, 
        // I will try the standard way for the newer SDK if possible, or the older one.

        // Actually, @google/genai is likely the newer alpha/beta generic SDK or the specific Vertex one?
        // Wait, package.json said "@google/genai": "^1.30.0" ? 
        // Let me check package.json again. 
        // It says "@google/genai": "^1.30.0" in the user provided metadata? 
        // NO, wait. 
        // User's metadata showed: "@google/genai": "^0.0.1" or similar?
        // Let's re-read the package.json view I did in step 1326.
        // It said: `"@google/genai": "^1.30.0"`?? 
        // Provide metadata said: "@google/genai": "^1.30.0"

        // Wait, `google-genai` package or `@google/generative-ai`?
        // The popular one is `@google/generative-ai`.
        // `@google/genai` might be the new unified SDK.

        // Let's try to list models using likely methods.

        console.log("Attempting to list models...");
        // This is a guess for @google/genai interface since it differs from @google/generative-ai
        // If it fails, I'll see the error.

        const response = await genAI.models.list();
        // OR
        // const response = await genAI.listModels();

        console.log("Models:", response);

        // If that fails, try the common one for the other package just in case I misread the import
        // const { GoogleGenerativeAI } = require("@google/generative-ai");

    } catch (error) {
        console.error("Error listing models:", error);
    }
}

listModels();
