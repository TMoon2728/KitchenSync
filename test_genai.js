const { GoogleGenAI } = require("@google/genai");
const dotenv = require("dotenv");
dotenv.config({ path: "c:/Users/Tmoon/NewImproved/.env.local" });

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function run() {
    try {
        const response = await genAI.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: "say hi",
        });
        
        console.log("Response:", response.text);
        if (response.generatedImages && response.generatedImages.length > 0) {
            const generatedImage = response.generatedImages[0];
            console.log("generatedImage keys:", Object.keys(generatedImage));
            if (generatedImage.image) {
                 console.log("image keys:", Object.keys(generatedImage.image));
            }
        }
    } catch (e) {
        console.error("Error:", e);
    }
}
run();
