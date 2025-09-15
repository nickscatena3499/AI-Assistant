import express from "express";
import bodyParser from "body-parser";
import pkg from "twilio";
import fs from "fs";
import OpenAI from "openai";

const { twiml: Twiml } = pkg;
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Conversation context & language detection
let conversationHistory = [];
let language = "en"; // default

function isSpanish(text) {
  return /[áéíóúñ¿¡]|(gracias|hola|restaurante|mesa|favor|menú|orden)/i.test(
    text
  );
}

app.post("/voice", async (req, res) => {
  console.log("📞 Incoming call:", req.body);

  const twiml = new Twiml.VoiceResponse();
  try {
    const userMessage = req.body.SpeechResult || req.body.Body || "";

    if (userMessage) {
      if (isSpanish(userMessage)) {
        language = "es";
        console.log("🌐 Switching to Spanish");
      }
      conversationHistory.push({ role: "user", content: userMessage });
    }

    const now = new Date();
    const dateTime = now.toLocaleString(language === "es" ? "es-ES" : "en-US", {
      dateStyle: "full",
      timeStyle: "short",
    });

    const systemPrompt =
      language === "es"
        ? `Eres un asistente de voz humano para un restaurante italiano.
        Fecha y hora actual: ${dateTime}.
        Tareas: reservas, modificar/cancelar reservas, responder sobre el menú y alergias, pedidos para llevar, eventos, horarios del negocio y especiales.
        Sé profesional, cálido y conciso. Responde en español.`
        : `You are a human-like restaurant voice assistant.
        Current date/time: ${dateTime}.
        Tasks: handle reservations, modify/cancel reservations, answer menu & allergy questions, takeout orders, events, specials, and business hours.
        Always be polite, professional, and concise.
        If the caller prefers Spanish, say: "If you’d like to continue in Spanish, just let me know."`;

    const messages = [{ role: "system", content: systemPrompt }, ...conversationHistory];

    // Fast response from OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
    });

    const aiResponse = completion.choices[0].message.content;
    console.log("🤖 AI response:", aiResponse);

    conversationHistory.push({ role: "assistant", content: aiResponse });

    // OpenAI TTS (human-like voice)
    const voice = language === "es" ? "alloy" : "verse"; // pick best available voices
    const ttsResponse = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice,
      input: aiResponse,
    });

    const outputFile = "/tmp/response.mp3";
    const buffer = Buffer.from(await ttsResponse.arrayBuffer());
    fs.writeFileSync(outputFile, buffer);

    // Play TTS audio back to user
    const gather = twiml.gather({
      input: "speech",
      action: "/voice",
      method: "POST",
    });
    gather.play(`https://ai-assistant-491f.onrender.com/response.mp3`);

    res.type("text/xml");
    res.send(twiml.toString());
  } catch (error) {
    console.error("❌ Error in /voice:", error);
    twiml.say("Sorry, something went wrong. Please try again.");
    res.type("text/xml");
    res.send(twiml.toString());
  }
});

// Serve audio files
app.get("/response.mp3", (req, res) => {
  res.set("Content-Type", "audio/mpeg");
  fs.createReadStream("/tmp/response.mp3").pipe(res);
});

// Health check
app.get("/", (req, res) => {
  res.send("🍝 Restaurant AI Voice Assistant is running.");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
