// server.js
import express from "express";
import expressWs from "express-ws";
import bodyParser from "body-parser";
import cors from "cors";
import fetch from "node-fetch";

// Create express app with WebSocket support
const app = express();
expressWs(app);

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cors());

// ✅ Catch errors so they show in Render logs
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection:", reason);
});

// 🔑 Load environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ---
// 1. Handle incoming Twilio call
// ---
app.post("/voice", (req, res) => {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Start>
    <Stream url="wss://${req.headers.host}/media"/>
  </Start>
  <Say voice="Polly.Joanna">Hello, welcome to our restaurant assistant. How may I help you today?</Say>
</Response>`;

  res.type("text/xml");
  res.send(twiml);
});

// ---
// 2. WebSocket: Handle audio/media from Twilio
// ---
app.ws("/media", (ws, req) => {
  console.log("🔗 Caller connected to media stream");

  let streamSid = null;

  ws.on("message", async (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch (err) {
      console.error("Invalid JSON:", msg);
      return;
    }

    if (data.event === "start") {
      console.log("Call started");
      streamSid = data.start.streamSid;
    }

    if (data.event === "media") {
      // ⚠️ Replace with real transcription later (OpenAI STT)
      const fakeTranscript = "hola, quiero reservar una mesa"; // demo

      // Detect Spanish fallback
      const isSpanish = /\b(hola|gracias|quiero|mesa|cena|comida)\b/i.test(
        fakeTranscript
      );

      const replyText = isSpanish
        ? "Claro, hoy tenemos como especial lasaña casera fresca. ¿Quiere reservar una mesa?"
        : "Our special today is fresh homemade lasagna. Would you like to book a table?";

      try {
        // 🔊 Text → Speech using OpenAI
        const ttsResponse = await fetch(
          "https://api.openai.com/v1/audio/speech",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${OPENAI_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gpt-4o-mini-tts",
              voice: isSpanish ? "nova" : "verse", // ✅ valid voices
              input: replyText,
            }),
          }
        );

        if (!ttsResponse.ok) {
          console.error("TTS error:", await ttsResponse.text());
          return;
        }

        const buffer = Buffer.from(await ttsResponse.arrayBuffer());

        // ✅ Correct Twilio Media Stream format
        ws.send(
          JSON.stringify({
            event: "media",
            streamSid: streamSid,
            media: {
              payload: buffer.toString("base64"),
            },
          })
        );
      } catch (err) {
        console.error("TTS processing error:", err);
      }
    }

    if (data.event === "stop") {
      console.log("Call ended");
    }
  });

  ws.on("close", () => {
    console.log("❌ Caller disconnected");
  });
});

// ---
// 3. Healthcheck route
// ---
app.get("/", (req, res) => {
  res.send("✅ Restaurant Voice Assistant is running with Spanish fallback!");
});

// ---
// 4. Start server
// ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
});
