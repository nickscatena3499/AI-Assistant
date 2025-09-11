// server.js
const express = require('express');
const bodyParser = require('body-parser');
const { Configuration, OpenAIApi } = require('openai');
const { VoiceResponse } = require('twilio').twiml;

require('dotenv').config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// OpenAI setup
const openai = new OpenAIApi(
  new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  })
);

// Route: First greet caller
app.post('/voice', (req, res) => {
  const twiml = new VoiceResponse();

  const gather = twiml.gather({
    input: 'speech',
    action: '/gather',
    speechTimeout: 'auto'
  });

  gather.say({ voice: process.env.POLLY_VOICE || "Polly.Joanna" },
    "Hello, I am your AI assistant. How can I help you today?"
  );

  res.type('text/xml');
  res.send(twiml.toString());
});

// Route: Handle what the caller says
app.post('/gather', async (req, res) => {
  const twiml = new VoiceResponse();
  const speechResult = req.body.SpeechResult;

  if (speechResult) {
    try {
      const response = await openai.createChatCompletion({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: speechResult }]
      });

      const reply = response.data.choices[0].message.content;

      twiml.say({ voice: process.env.POLLY_VOICE || "Polly.Joanna" }, reply);
    } catch (error) {
      console.error("OpenAI error:", error);
      twiml.say("Sorry, I had a problem connecting to the assistant.");
    }
  } else {
    twiml.say("I didn’t catch that. Could you repeat?");
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
