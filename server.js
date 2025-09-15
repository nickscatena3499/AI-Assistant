// server.js
import express from "express";
import expressWs from "express-ws";
import bodyParser from "body-parser";
import cors from "cors";

const app = express();
expressWs(app);

app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 10000;

// 🟢 Root
app.get("/", (req, res) => {
  res.send("🚀 AI Voice Assistant is live!");
});

// 🟢 Media WebSocket
app.ws("/media", (ws, req) => {
  console.log("🔗 Caller connected to media stream");

  ws.on("open", () => {
    console.log("✅ WebSocket open and ready");
  });

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);

      // Handle Twilio start event
      if (data.event === "start") {
        console.log(`📞 Call started. Stream SID: ${data.start.streamSid}`);
        return;
      }

      // Handle Twilio media packets
      if (data.event === "media") {
        console.log("🎤 Received media packet");

        if (ws.readyState === ws.OPEN) {
          // Echo back for now (replace with AI / TTS later)
          ws.send(JSON.stringify({
            event: "media",
            streamSid: data.streamSid,
            media: {
              payload: data.media.payload,
            },
          }));
        }
      }

      // Handle mark events
      if (data.event === "mark") {
        console.log("✅ Mark event received:", data.mark.name);
      }
    } catch (err) {
      console.error("❌ Error parsing message:", err);
    }
  });

  ws.on("close", () => {
    console.log("❌ Caller disconnected from media stream");
  });

  ws.on("error", (err) => {
    console.error("⚠️ WebSocket error:", err);
  });
});

// 🟢 Fallback TTS endpoint (English + Spanish)
app.post("/fallback-tts", (req, res) => {
  const { text, lang } = req.body;

  let responseText;
  if (lang === "es") {
    responseText = text || "Lo siento, no entendí eso. ¿Puede repetirlo?";
  } else {
    responseText = text || "Sorry, I didn’t catch that. Could you repeat?";
  }

  res.json({
    voice: lang === "es" ? "es-ES-AlvaroNeural" : "en-US-JennyNeural",
    text: responseText,
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
