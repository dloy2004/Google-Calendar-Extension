import express from "express";
import cors from "cors";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

const secretClient = new SecretManagerServiceClient();

async function getSecret(name) {
    const [version] = await secretClient.accessSecretVersion({
        name: `projects/dailyassistantai/secrets/${name}/versions/latest`,
    });
    return version.payload.data.toString();
}

const app = express();
app.use(express.json());
const allowedOrigins = ["chrome-extension://pammmhaiffcdmpfjiifnkjkoljcapedk"];
app.use(cors({
    origin: (origin, callback) => {
        if (allowedOrigins.includes(origin) || !origin) {
            callback(null, true);
        } else {
            callback(new Error("Not allowed by CORS"));
        }
    }
}));

// Endpoint to provide secrets to the Chrome extension
app.get("/getSecrets", async (req, res) => {
    try {
        const CLIENT_ID = await getSecret("CLIENT_ID");
        const CLIENT_SECRET = await getSecret("CLIENT_SECRET");
        res.json({ CLIENT_ID, CLIENT_SECRET });
    } catch (error) {
        console.error("Error fetching secrets:", error);
        res.status(500).send("Failed to fetch secrets");
    }
});

// Endpoint to generate text using Google's Generative AI API
app.post("/generateText", async (req, res) => {
    try {
        const GEMINI_API_KEY = await getSecret("GEMINI_API_KEY");
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
        });

        const result = await model.generateContent([{
            text: req.body.prompt,
        }]);

        res.json({ response: result.response.text() });
    } catch (error) {
        console.error("Error generating text:", error);
        res.status(500).send("Error generating text");
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Proxy server running on http://localhost:${PORT}`);
});
