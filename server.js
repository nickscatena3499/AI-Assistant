import express from "express";
import bodyParser from "body-parser";
import twilio from "twilio";
import WebSocket from "ws";
import OpenAI from "openai";

const app = express();
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

  // Connect caller to our WebSocket that talks to OpenAI Realtime API
  const connect = twiml.connect();
  connect.stream({
    url: `wss://${req.headers.host}/media`, // WebSocket endpoint
  });

  res.type("text/xml");
  res.send(twiml.toString());
});

// ===== WebSocket Bridge =====
app.ws("/media", (ws, req) => {
  console.log("🔗 Caller connected to media stream");

  // Create a Realtime session with OpenAI
  const session = new WebSocket("wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview", {
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  session.on("open", () => {
    console.log("✅ Connected to OpenAI Realtime API");
  });

  // Forward audio between Twilio <-> OpenAI
  ws.on("message", (msg) => {
    session.send(msg);
  });

  session.on("message", async (data) => {
    try {
      const event = JSON.parse(data.toString());

      // Stream audio responses back to Twilio
      if (event.type === "response.output_audio.delta") {
        ws.send(
          JSON.stringify({
            event: "media",
            media: { payload: event.delta }, // base64-encoded audio chunks
          })
        );
      }

      // Handle text analysis (detect Spanish)
      if (event.type === "response.text.delta") {
        const text = event.delta.toLowerCase();
        if (text.includes("español") || text.match(/[ñáéíóú]/)) {
          session.send(
            JSON.stringify({
              type: "response.create",
              response: {
                instructions:
                  "Por supuesto, puedo hablar en español. ¿Cómo puedo ayudarte hoy?",
                modalities: ["text", "audio"],
                voice: "alloy",
              },
            })
          );
        }
      }
    } catch (err) {
      console.error("⚠️ Error handling session event:", err);
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
