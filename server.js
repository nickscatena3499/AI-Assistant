// server.js
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";

// Ensure "public" folder always exists
const publicDir = path.join(process.cwd(), "public");
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
  console.log("📂 Created public folder automatically");
}

// Create express app
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cors());

// ✅ Catch errors so they show in Render logs
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection:", reason);
});

// 🔑 Environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PUBLIC_URL = process.env.PUBLIC_URL || "";

// ---
// 1. Handle incoming Twilio call
// ---
app.post("/voice", (req, res) => {
  console.log("📞 Incoming /voice webhook", req.body.CallSid);

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="/gather" language="en-US" speechTimeout="auto">
    <Say voice="Polly.Joanna">Hello, welcome to our restaurant assistant. How may I help you today?</Say>
  </Gather>
</Response>`;

  res.type("text/xml");
  res.send(twiml);
});

// ---
// 2. Handle user speech (speech-to-text result from Twilio)
// ---
async function textToSpeech(text, lang = "en") {
  try {
    const voice = lang === "es" ? "alloy" : "verse"; // pick voices
    const filename = `tts-${Date.now()}.mp3`;
    const filepath = path.join(publicDir, filename);

    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice,
        input: text,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error("TTS error: " + err);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(filepath, buffer);

    return `${PUBLIC_URL}/public/${filename}`;
  } catch (err) {
    console.error("❌ textToSpeech error:", err);
    return null;
  }
}

app.post("/gather", async (req, res) => {
  const { speechResult } = req.body;
  console.log("/gather", { speechResult });

  // Detect language
  const isSpanish = /\b(hola|gracias|quiero|mesa|cena|comida|mañana)\b/i.test(
    speechResult || ""
  );
  const lang = isSpanish ? "es" : "en";
  console.log("Language detected:", lang);

  const reply =
    lang === "es"
      ? "Claro, tenemos mesas disponibles mañana. ¿A qué hora le gustaría reservar?"
      : "Yes, we have tables available tomorrow. What time would you like to book?";

  const audioUrl = await textToSpeech(reply, lang);

  const twiml = audioUrl
    ? `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${audioUrl}</Play>
  <Gather input="speech" action="/gather" language="${
    lang === "es" ? "es-ES" : "en-US"
  }" speechTimeout="auto"/>
</Response>`
    : `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Sorry, there was an error generating audio.</Say>
</Response>`;

  res.type("text/xml");
  res.send(twiml);
});

// ---
// 3. Healthcheck
// ---
app.get("/", (req, res) => {
  res.send("✅ Restaurant Voice Assistant is running with Spanish fallback!");
});

// ---
// 4. Start server
// ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
  console.log(`PUBLIC_URL = ${PUBLIC_URL}`);
});
