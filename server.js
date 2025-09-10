const express = require("express");
const bodyParser = require("body-parser");
const VoiceResponse = require("twilio").twiml.VoiceResponse;

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// When a call comes in
app.post("/voice", (req, res) => {
  const twiml = new VoiceResponse();

  // Simple greeting
  twiml.say("Hello, thanks for calling! How can I help you today?", { voice: "Polly.Joanna" });

  // Listen to caller's speech
  const gather = twiml.gather({
    input: "speech",
    action: "/process-speech",
    method: "POST"
  });

  res.type("text/xml");
  res.send(twiml.toString());
});

// Handle speech input
app.post("/process-speech", (req, res) => {
  const speech = req.body.SpeechResult || "no speech detected";

  const twiml = new VoiceResponse();
  twiml.say(`You said: ${speech}. I will connect this with AI soon.`);

  res.type("text/xml");
  res.send(twiml.toString());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
