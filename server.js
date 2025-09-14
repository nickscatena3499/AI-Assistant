import express from "express";
import bodyParser from "body-parser";
import twilio from "twilio";
import { OpenAI } from "openai";

const { twiml: Twiml } = twilio;
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Store session history
let conversationHistory = [];

app.post("/voice", async (req, res) => {
  const twiml = new Twiml.VoiceResponse();

  try {
    const userSpeech = req.body.SpeechResult || "Hello";

    // Keep conversation continuous
    conversationHistory.push({ role: "user", content: userSpeech });

    // Add system message with live date/time
    conversationHistory.unshift({
      role: "system",
      content: `You are a helpful, natural-sounding AI assistant. 
      Current date/time is: ${new Date().toLocaleString()}. 
      Respond quickly and conversationally.`,
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: conversationHistory,
    });

    const aiResponse = response.choices[0].message.content;

    // Save assistant reply in history
    conversationHistory.push({ role: "assistant", content: aiResponse });

    twiml.say({ voice: "Polly.Joanna" }, aiResponse); // AWS Polly-style voice (Twilio maps voices)

  } catch (err) {
    console.error("Error handling voice request:", err);
    twiml.say("Sorry, I had an error processing that.");
  }

  res.type("text/xml");
  res.send(twiml.toString());
});

// Root check
app.get("/", (req, res) => {
  res.send("AI Voice Assistant is running ✅");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
