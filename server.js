import express from "express";
import dotenv from "dotenv";
import twilio from "twilio";
import OpenAI from "openai";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import fs from "fs";

dotenv.config();

const app = express();
app.use(express.urlencoded({ extended: true }));

// Twilio setup
const VoiceResponse = twilio.twiml.VoiceResponse;

// OpenAI setup (new SDK)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// AWS Polly setup
const polly = new PollyClient({
  region: process.env.AWS_REGION, // e.g. "us-east-1"
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Simple in-memory conversation history
let conversationHistory = [];

// Incoming call handler
app.post("/voice", async (req, res) => {
  const twiml = new VoiceResponse();

  twiml.gather({
    input: "speech",
    action: "/gather",
    method: "POST",
  }).say("Hello, I am your AI assistant. How can I help you today?");

  res.type("text/xml");
  res.send(twiml.toString());
});

// Handle speech input
app.post("/gather", async (req, res) => {
  const twiml = new VoiceResponse();
  const speechResult = req.body.SpeechResult;

  if (!speechResult) {
    twiml.say("Sorry, I didn't catch that. Can you repeat?");
    return res.type("text/xml").send(twiml.toString());
  }

  // Add user input to conversation
  conversationHistory.push({ role: "user", content: speechResult });

  // Get AI reply
  let aiReply = "I'm not sure how to answer that.";
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: conversationHistory,
    });
    aiReply = completion.choices[0].message.content;
    conversationHistory.push({ role: "assistant", content: aiReply });
  } catch (err) {
    console.error("OpenAI error:", err);
  }

  // Convert AI reply to speech with Polly
  const audioFile = "./response.mp3";
  try {
    const command = new SynthesizeSpeechCommand({
      Text: aiReply,
      OutputFormat: "mp3",
      VoiceId: "Joanna", // natural female voice, can change
    });
    const data = await polly.send(command);

    if (data.AudioStream) {
      fs.writeFileSync(audioFile, data.AudioStream);
    }
  } catch (err) {
    console.error("Polly error:", err);
  }

  // Play AI reply back
  twiml.play(`https://${req.headers.host}/response.mp3`);

  // Continue the loop
  twiml.gather({
    input: "speech",
    action: "/gather",
    method: "POST",
  }).say("What else would you like to ask?");

  res.type("text/xml");
  res.send(twiml.toString());
});

// Serve audio file
app.get("/response.mp3", (req, res) => {
  res.sendFile("response.mp3", { root: "." });
});

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
