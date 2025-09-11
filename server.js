// server.js
const express = require("express");
const bodyParser = require("body-parser");
const { Configuration, OpenAIApi } = require("openai");
const twilio = require("twilio");

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// OpenAI setup
const openai = new OpenAIApi(
  new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  })
);

// Twilio setup
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Handle incoming call
app.post("/voice", async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  try {
    const userQuestion = req.body.SpeechResult || req.body.Digits || "Hello";

    console.log("🔹 User said:", userQuestion);

    // Send to OpenAI
    const aiResponse = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: userQuestion }],
    });

    const assistantReply = aiResponse.data.choices[0].message.content;
    console.log("🤖 Assistant reply:", assistantReply);

    // Speak response
    twiml.say({ voice: process.env.POLLY_VOICE || "Polly.Joanna" }, assistantReply);

  } catch (error) {
    console.error("❌ Error with OpenAI/Twilio:", error.response?.data || error.message);
    twiml.say("I had a problem connecting with the assistant. Please try again later.");
  }

  res.type("text/xml");
  res.send(twiml.toString());
});

// Start server (Render uses process.env.PORT automatically)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
