import express from "express";
import bodyParser from "body-parser";
import twilio from "twilio";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// ✅ OpenAI setup
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ✅ Root test endpoint
app.get("/", (req, res) => {
  res.send("✅ AI Voice Assistant is running.");
});

// ✅ First call entrypoint
app.post("/voice", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  // Prompt + gather speech
  const gather = twiml.gather({
    input: "speech",
    action: "/gather",
    method: "POST",
  });

  gather.say("Hello! How can I assist you today?", {
    voice: process.env.POLLY_VOICE || "alice",
    language: "en-US",
  });

  // Fallback if no speech input
  twiml.say("Goodbye!");

  res.type("text/xml");
  res.send(twiml.toString());
});

// ✅ Handle speech input from Twilio
app.post("/gather", async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const speechResult = req.body.SpeechResult;

  console.log("🔹 User said:", speechResult);

  if (speechResult) {
    try {
      // Send to OpenAI
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a helpful voice assistant for businesses." },
          { role: "user", content: speechResult },
        ],
      });

      const reply = completion.choices[0].message.content;
      console.log("🤖 Assistant reply:", reply);

      // Respond and keep listening
      const gather = twiml.gather({
        input: "speech",
        action: "/gather",
        method: "POST",
      });

      gather.say(reply, {
        voice: process.env.POLLY_VOICE || "alice",
        language: "en-US",
      });

    } catch (err) {
      console.error("❌ Error with OpenAI/Twilio:", err.message);
      twiml.say("Sorry, I had a problem connecting to the assistant.");
    }
  } else {
    twiml.say("I didn’t hear anything. Goodbye!");
  }

  res.type("text/xml");
  res.send(twiml.toString());
});

// ✅ Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
