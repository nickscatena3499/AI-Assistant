import express from "express";
import bodyParser from "body-parser";
import { OpenAI } from "openai";
import { twiml as Twiml } from "twilio";
import fs from "fs";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// ✅ OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Utility: get current date/time
function getDateTime() {
  const now = new Date();
  return now.toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" });
}

// ✅ First call entrypoint
app.post("/voice", async (req, res) => {
  const twiml = new Twiml.VoiceResponse();

  // Greeting + gather
  twiml.say("Hello, this is your AI assistant. How can I help you today?");
  const gather = twiml.gather({
    input: "speech",
    action: "/gather",
    speechTimeout: "auto",
  });

  res.type("text/xml");
  res.send(twiml.toString());
});

// ✅ Handle speech input
app.post("/gather", async (req, res) => {
  const userSpeech = req.body.SpeechResult || "";
  console.log("🎙️ User said:", userSpeech);

  let replyText = "I didn’t catch that. Could you repeat?";

  try {
    // Add context about time/date
    const systemPrompt = `You are a helpful voice assistant. 
The current date and time is ${getDateTime()}. 
Respond conversationally, as if you are a real human on the phone.`;

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userSpeech },
      ],
    });

    replyText = completion.choices[0].message.content;
    console.log("🤖 OpenAI reply:", replyText);
  } catch (err) {
    console.error("❌ OpenAI error:", err);
    replyText = "Sorry, I had a problem answering that.";
  }

  // Build TwiML with reply + new Gather to continue conversation
  const twiml = new Twiml.VoiceResponse();
  twiml.say({ voice: "Polly.Joanna" }, replyText); // Twilio Polly voice
  twiml.gather({
    input: "speech",
    action: "/gather",
    speechTimeout: "auto",
  });

  res.type("text/xml");
  res.send(twiml.toString());
});

// ✅ Health check
app.get("/", (req, res) => {
  res.send("AI Voice Assistant is running.");
});

// ✅ Port
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
