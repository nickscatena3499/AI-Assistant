// server.js
import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Twilio from "twilio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// config from env
const PORT = process.env.PORT || 10000;
const PUBLIC_URL = process.env.PUBLIC_URL || ""; // e.g. https://ai-assistant-491f.onrender.com
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// small restaurant knowledge base (edit as desired)
const RESTAURANT_INFO = {
  name: "La Trattoria",
  hours: "We are open 11 AM - 10 PM Monday through Saturday, closed Sunday.",
  specials: "Today's special: fresh homemade lasagna and grilled sea bass.",
  events: "Live jazz this Friday at 7 PM.",
  menu: "We serve pasta, pizza, risotto, salads, and tiramisu.",
  allergies: "We can accommodate gluten-free, nut-free, and dairy-free requests."
};

// helper: safe log
function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

// helper: detect Spanish (simple heuristic using transcript)
function detectSpanish(text) {
  if (!text) return false;
  return /\b(hola|gracias|quiero|mesa|cena|comida|reservar|por favor|buenos|tardes|mañana)\b/i.test(
    text
  );
}

// helper: build system prompt with date/time and restaurant info
function buildSystemPrompt(isSpanish) {
  const now = new Date();
  const locale = isSpanish ? "es-ES" : "en-US";
  const dateTime = now.toLocaleString(locale, { dateStyle: "full", timeStyle: "short" });

  if (isSpanish) {
    return `Eres un asistente de voz para un restaurante llamado ${RESTAURANT_INFO.name}.
La fecha y hora actual es ${dateTime}.
Tareas principales: responder preguntas sobre el menú (${RESTAURANT_INFO.menu}), alergias (${RESTAURANT_INFO.allergies}), horarios (${RESTAURANT_INFO.hours}), especiales (${RESTAURANT_INFO.specials}), eventos (${RESTAURANT_INFO.events}), manejar reservas y pedidos para llevar.
Sé profesional, cálido y conciso. Responde en español.`;
  } else {
    return `You are a voice assistant for a restaurant called ${RESTAURANT_INFO.name}.
Current date and time is ${dateTime}.
Main tasks: answer menu questions (${RESTAURANT_INFO.menu}), handle allergy questions (${RESTAURANT_INFO.allergies}), business hours (${RESTAURANT_INFO.hours}), specials (${RESTAURANT_INFO.specials}), events (${RESTAURANT_INFO.events}), accept or modify reservations, and accept takeout orders.
Be professional, warm, and concise.`;
  }
}

// Serve health check
app.get("/", (req, res) => {
  res.send("✅ Restaurant AI Voice Assistant (with Spanish fallback) is running");
});

// Endpoint Twilio calls when a call starts
// Twilio phone number voice webhook should point to: POST https://<PUBLIC_URL>/voice
app.post("/voice", (req, res) => {
  log("Incoming /voice webhook", req.body.CallSid || "");
  // Build TwiML using simple XML
  // Use <Gather> to capture speech and post to /gather
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Hello — welcome to ${RESTAURANT_INFO.name}. How can I help you today?</Say>
  <Gather input="speech" action="/gather" method="POST" timeout="5" speechTimeout="auto">
    <Say voice="Polly.Joanna">You can ask about reservations, menu items, specials, or hours.</Say>
  </Gather>
  <!-- if gather times out, loop back to /voice to prompt again -->
  <Redirect>/voice</Redirect>
</Response>`;

  res.type("text/xml");
  res.send(twiml);
});

// Gather result (Twilio posts here after speech captured)
// Twilio will send fields like SpeechResult, Confidence, CallSid
app.post("/gather", async (req, res) => {
  const callSid = req.body.CallSid || `c_${Date.now()}`;
  const speechResult = req.body.SpeechResult || "";
  log("/gather", { callSid, speechResult });

  // If nothing captured, ask again
  if (!speechResult || speechResult.trim().length === 0) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Sorry, I didn't catch that. Let me try again.</Say>
  <Redirect>/voice</Redirect>
</Response>`;
    res.type("text/xml");
    return res.send(twiml);
  }

  // Detect language
  const isSpanish = detectSpanish(speechResult);
  log("Language detected:", isSpanish ? "es" : "en");

  // Build system prompt and messages
  const systemPrompt = buildSystemPrompt(isSpanish);
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: speechResult }
  ];

  // Call OpenAI Chat to get reply text
  let assistantReply = "";
  try {
    const chatResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        max_tokens: 300,
        temperature: 0.2
      })
    });

    if (!chatResp.ok) {
      const text = await chatResp.text();
      log("OpenAI chat error:", text);
      throw new Error("OpenAI chat call failed");
    }

    const chatJson = await chatResp.json();
    assistantReply = (chatJson.choices?.[0]?.message?.content || "").trim();

    if (!assistantReply) {
      assistantReply = isSpanish
        ? "Lo siento, no pude procesar su solicitud en este momento."
        : "Sorry, I couldn't process your request right now.";
    }
  } catch (err) {
    log("OpenAI chat exception:", err);
    assistantReply = isSpanish
      ? "Lo siento, ocurrió un error al procesar su solicitud."
      : "Sorry, there was an error processing your request.";
  }

  log("Assistant reply:", assistantReply);

  // Convert assistantReply → MP3 via OpenAI TTS
  // Save MP3 as /tmp/response-<callSid>.mp3 and serve at /response/:id
  const filename = `response-${callSid}.mp3`;
  const filepath = path.join("/tmp", filename);

  try {
    const ttsResp = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: isSpanish ? "alloy" : "verse", // alloy/verse are valid voices
        input: assistantReply
      })
    });

    if (!ttsResp.ok) {
      const errText = await ttsResp.text();
      log("TTS API error:", errText);
      // fallback to TwiML <Say> if TTS fails
      const twimlFallback = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${assistantReply}</Say>
  <Redirect>/voice</Redirect>
</Response>`;
      res.type("text/xml");
      return res.send(twimlFallback);
    }

    const arrayBuf = await ttsResp.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    fs.writeFileSync(filepath, buffer);
    log("Saved TTS file:", filepath);
  } catch (err) {
    log("TTS exception:", err);
    const twimlFallback = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${assistantReply}</Say>
  <Redirect>/voice</Redirect>
</Response>`;
    res.type("text/xml");
    return res.send(twimlFallback);
  }

  // Respond with TwiML that plays the MP3, then returns to /voice for continuous conversation
  // The Play URL must be absolute and accessible by Twilio via HTTPS
  const playUrl = `${PUBLIC_URL}/response/${encodeURIComponent(filename)}`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${playUrl}</Play>
  <Pause length="0.5"/>
  <Redirect>/voice</Redirect>
</Response>`;

  res.type("text/xml");
  res.send(twiml);
});

// Serve generated MP3 files (temp)
app.get("/response/:name", (req, res) => {
  const name = req.params.name;
  // basic sanitization
  if (!/^[a-zA-Z0-9\-_.]+\.mp3$/.test(name)) {
    return res.status(400).send("invalid filename");
  }
  const filepath = path.join("/tmp", name);
  if (!fs.existsSync(filepath)) {
    return res.status(404).send("not found");
  }
  res.setHeader("Content-Type", "audio/mpeg");
  fs.createReadStream(filepath).pipe(res);
  // optionally: remove after some time — could be added
});

// Global error handlers so Render shows logs
process.on("uncaughtException", (err) => {
  log("Uncaught Exception:", err);
});
process.on("unhandledRejection", (reason) => {
  log("Unhandled Rejection:", reason);
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  log(`Server running on http://0.0.0.0:${PORT}`);
  log(`PUBLIC_URL = ${PUBLIC_URL}`);
});
