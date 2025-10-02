import express from "express";
import bodyParser from "body-parser";
import Twilio from "twilio";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 10000;
const PUBLIC_URL = process.env.PUBLIC_URL || "http://localhost:" + PORT;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper: Call OpenAI for text response
async function askOpenAI(prompt, lang = "en") {
  const systemMsg =
    lang === "es"
      ? "Responde como un camarero profesional en un restaurante elegante, en español."
      : "Respond as a professional restaurant server in an elegant restaurant, in English.";

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemMsg },
        { role: "user", content: prompt }
      ]
    })
  });

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "Sorry, I had trouble understanding.";
}

// Helper: Convert text to speech (OpenAI TTS)
async function textToSpeech(text, lang = "en") {
  const voice = lang === "es" ? "alloy" : "verse"; // choose different voice if desired

  const resp = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice: voice,
      input: text
    })
  });

  const buffer = Buffer.from(await resp.arrayBuffer());
  const filename = `tts-${Date.now()}.mp3`;
  const filepath = path.join(__dirname, "public", filename);
  fs.writeFileSync(filepath, buffer);
  return `${PUBLIC_URL}/${filename}`;
}

// Serve audio files
app.use(express.static(path.join(__dirname, "public")));

// Twilio entry point
app.post("/voice", (req, res) => {
  const twiml = new Twilio.twiml.VoiceResponse();
  const gather = twiml.gather({
    input: "speech",
    action: "/gather",
    language: "en-US",
    timeout: 5
  });
  gather.say("Hello! Welcome to our restaurant. Please ask me about our menu, specials, or reservations.");
  res.type("text/xml");
  res.send(twiml.toString());
});

// Handle speech input
app.post("/gather", async (req, res) => {
  const speech = req.body.SpeechResult || "";
  console.log("/gather", { speechResult: speech });

  let lang = "en";
  if (speech.toLowerCase().includes("hola") || /[áéíóúñ]/.test(speech)) {
    lang = "es";
  }

  const reply = await askOpenAI(speech, lang);
  const audioUrl = await textToSpeech(reply, lang);

  const twiml = new Twilio.twiml.VoiceResponse();
  twiml.play(audioUrl);
  twiml.hangup();

  res.type("text/xml");
  res.send(twiml.toString());
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
  console.log(`PUBLIC_URL = ${PUBLIC_URL}`);
});
