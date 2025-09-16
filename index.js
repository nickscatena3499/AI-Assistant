import express from "express";
import bodyParser from "body-parser";
import twilio from "twilio";

const app = express();
const port = process.env.PORT || 10000;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Health check
app.get("/", (req, res) => {
  res.send("✅ Voice assistant server is running.");
});

// Twilio webhook when a call comes in
app.post("/calls", (req, res) => {
  console.log("📞 Incoming call webhook received");

  const response = new twilio.twiml.VoiceResponse();

  // Greeting
  response.say("Hello! You are connected to your AI voice assistant.");

  // Start streaming audio from caller
  response.connect().stream({
    url: `${process.env.PUBLIC_URL}/media`,
  });

  res.type("text/xml");
  res.send(response.toString());
});

// Twilio media stream (receives caller audio)
app.post("/media", (req, res) => {
  console.log("🔗 Media stream event received:", req.body);
  res.sendStatus(200); // Always ACK
});

app.listen(port, "0.0.0.0", () => {
  console.log(`🚀 Server running on http://0.0.0.0:${port}`);
  console.log(`     ==> Available at your primary URL ${process.env.PUBLIC_URL}`);
});
