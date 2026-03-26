import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import OpenAI from "openai";
import dotenv from "dotenv";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // NVIDIA NIM Integration
  const nvidiaApiKey = process.env.NVIDIA_API_KEY;
  const openai = new OpenAI({
    apiKey: nvidiaApiKey || 'dummy',
    baseURL: 'https://integrate.api.nvidia.com/v1',
  });

  app.post("/api/generate-thesis", async (req, res) => {
    const { prompt, systemInstruction, model = "meta/llama-3.1-405b-instruct", response_format } = req.body;

    if (!nvidiaApiKey || nvidiaApiKey === 'nvapi-...') {
      // Fallback for demo if key is not set, but we should encourage setting it
      console.warn("NVIDIA API Key not configured in environment.");
    }

    try {
      console.log(`Attempting generation with model: ${model}`);
      const completion = await openai.chat.completions.create({
        model: model,
        messages: [
          ...(systemInstruction ? [{ role: "system", content: systemInstruction } as const] : []),
          { role: "user", content: prompt } as const
        ],
        temperature: 0.6,
        max_tokens: 2048,
        response_format: response_format
      });

      res.json({ text: completion.choices[0].message.content });
    } catch (error: any) {
      console.error("NVIDIA API Error Detail:", error);
      
      let userMessage = "Failed to generate content. ";
      if (error.status === 404) {
        userMessage += `Model '${model}' not found or API endpoint is incorrect.`;
      } else if (error.status === 401) {
        userMessage += "Invalid API Key or unauthorized.";
      } else {
        userMessage += error.message || "Unknown error";
      }
      
      res.status(error.status || 500).json({ error: userMessage });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
