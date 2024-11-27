import express from "express";
import cors from "cors";
import { GoogleGenerativeAI } from "@google/generative-ai";

const app = express();
app.use(express.json());
app.use(cors());


const genAI = new GoogleGenerativeAI(process.env.GEMINI_API);
const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
});


/**
 * POST /generateText
 * Endpoint to generate text using Google's Generative AI API.
 * 
 * Request Body:
 * - prompt (string): The text prompt for the model to generate a response.
 * 
 * Response:
 * - Success: Returns the generated text as a JSON response.
 * - Error: Returns a 500 status code with an error message.
 */
app.post("/generateText", async (req, res) => {
    try {
        const result = await model.generateContent([
            {
                text: req.body.prompt,
            },
        ]);
        res.json(result.response.text());
    }
    catch {
        res.status(500).send("Error generating text");
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Proxy server running on http://localhost:${PORT}`);
});
