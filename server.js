import express from "express";
import bodyParser from "body-parser";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import twilio from "twilio";
import { OpenAI } from "openai";

const { twiml: Twiml } = twilio;
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// File path helper
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Keep session history
let conversationHistory = [];

app.post("/voice", async (req, res) => {
  const twiml = new Twiml.VoiceResponse();

  try {
    const userSpeech = req.body.SpeechResult || "";

    // System prompt for restaurant assistant
    const systemPrompt = {
      role: "system",
      content: `You are a polite, professional restaurant phone assistant for "Bella Roma Ristorante".
      - Greet callers warmly.
      - Handle reservations.
      - Answer menu questions with concise but appetizing detail.
      - If asked about hours, say "We are open daily from 11 AM to 10 PM."
      - Keep responses short and natural, like a human receptionist.`,
    };

    // Add conversation history
    conversationHistory.unshift(systemPrompt);
    conversationHistory.push({ role: "user", content: userSpeech });

    // Get AI text response
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: conversationHistory,
    });

    const aiResponse = response.choices[0].message.content;
    conversationHistory.push({ role: "assistant", content: aiResponse });

    // Generate TTS MP3
    const speechFile = path.resolve(__dirname, "response.mp3");
    const mp3 = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      input: aiResponse,
    });
    const buffer = Buffer.from(await mp3.arrayBuffer());
    fs.writeFileSync(speechFile, buffer);

    // Expose audio file to Twilio
    app.get("/response.mp3", (req, res2) => {
      res2.setHeader("Content-Type", "audio/mpeg");
      res2.sendFile(speechFile);
    });

    // Tell Twilio to play MP3, then listen again
    twiml.play(`${req.protocol}://${req.get("host")}/response.mp3`);
    twiml.gather({
      input: "speech",
      action: "/voice",
      speechTimeout: "auto",
    });

  } catch (err) {
    console.error("Error:", err);
    twiml.say("Sorry, I had trouble handling your request.");
  }

  res.type("text/xml");
  res.send(twiml.toString());
});

// Root check
app.get("/", (req, res) => {
  res.send("🍝 Bella Roma Assistant running ✅");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
