import express from "express";
import bodyParser from "body-parser";
import twilio from "twilio";
import expressWs from "express-ws";
import WebSocket from "ws";
import OpenAI from "openai";

const app = express();
expressWs(app); // enable ws routes
const port = process.env.PORT || 10000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Twilio setup
const VoiceResponse = twilio.twiml.VoiceResponse;

app.use(bodyParser.urlencoded({ extended: false }));

// ===== Restaurant Knowledge Base =====
const restaurantInfo = {
  hours: "We are open from 11 AM to 10 PM, Monday through Saturday, and closed on Sunday.",
  specials: "Today’s specials are truffle pasta and grilled sea bass.",
  events: "This Friday we’re hosting a live jazz night at 7 PM.",
  allergy: "We can accommodate gluten-free, nut-free, and dairy-free requests.",
  menu: "We serve Italian classics including pasta, pizza, risotto, and tiramisu.",
};

// ===== Handle Incoming Calls =====
app.post("/voice", (req, res) => {
  const twiml = new VoiceResponse();

  // Connect caller to our WebSocket endpoint
  const connect = twiml.connect();
  connect.stream({
    url: `wss://${req.headers.host}/media`,
  });

  res.type("text/xml");
  res.send(twiml.toString());
});

// ===== WebSocket Bridge =====
app.ws("/media", (ws, req) => {
  console.log("🔗 Caller connected to media stream");

  // Connect to OpenAI Realtime API
  const session = new WebSocket("wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview", {
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  session.on("open", () => {
    console.log("✅ Connected to OpenAI Realtime API");

    // Inject system instructions (restaurant context)
    session.send(
      JSON.stringify({
        type: "session.update",
        session: {
          instructions: `
            You are a helpful restaurant voice assistant for an Italian restaurant.
            Tasks:
            - Answer questions about hours: ${restaurantInfo.hours}
            - Handle reservations and cancellations.
            - Provide menu info: ${restaurantInfo.menu}
            - Handle allergy questions: ${restaurantInfo.allergy}
            - Share specials: ${restaurantInfo.specials}
            - Mention upcoming events: ${restaurantInfo.events}
            - Handle takeout orders.
            If caller speaks Spanish, switch to Spanish and respond fluently.
          `,
          voice: "alloy",
          modalities: ["text", "audio"],
          input_audio_format: { type: "twilio" },
          output_audio_format: { type: "twilio" }
        },
      })
    );
  });

  // Forward audio from Twilio → OpenAI
  ws.on("message", (msg) => {
    session.send(msg);
  });

  // Forward audio back OpenAI → Twilio
  session.on("message", (data) => {
    try {
      ws.send(data.toString());
    } catch (err) {
      console.error("⚠️ Error forwarding message:", err);
    }
  });

  ws.on("close", () => {
    console.log("❌ Caller disconnected");
    session.close();
  });
});

// ===== Start Server =====
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});
