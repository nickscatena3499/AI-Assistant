import express from "express";
import bodyParser from "body-parser";
import twilio from "twilio";
import dotenv from "dotenv";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { OpenAI } from "openai";

dotenv.config();
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// Twilio + OpenAI setup
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const VoiceResponse = twilio.twiml.VoiceResponse;

// AWS Polly setup
const polly = new PollyClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Directory for temp audio files
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const audioDir = path.join(__dirname, "audio");
if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir);

// Helper: synthesize speech with Polly
async function synthesizeSpeech(text) {
  const voice = process.env.POLLY_VOICE || "Joanna"; // e.g. Joanna, Matthew
  const command = new SynthesizeSpeechCommand({
    OutputFormat: "mp3",
    Text: text,
    VoiceId: voice,
  });
  const response = await polly.send(command);

  const audioFile = path.join(audioDir, `speech-${Date.now()}.mp3`);
  const buffer = await response.AudioStream.transformToByteArray();
  fs.writeFileSync(audioFile, Buffer.from(buffer));

  return audioFile;
}

// Business/system context for assistant
function getBusinessContext() {
  return `
You are a polite, helpful AI phone assistant.
- You always respond conversationally and naturally.
- You know the current date and time: ${new Date().toLocaleString()}.
- If asked to book something "today" or "tomorrow", use this information.
- Keep answers short, clear, and human-like. Do not sound robotic.
- If you cannot perform a task, say you’ll forward the request to a human.
`;
}

// Route: initial greeting
app.post("/voice", async (req, res) => {
  const twiml = new VoiceResponse();

  const greetingText = "Hello! How can I assist you today?";
  const audioFile = await synthesizeSpeech(greetingText);

  // Serve MP3 from server
  twiml.play(`${req.protocol}://${req.get("host")}/audio/${path.basename(audioFile)}`);

  const gather = twiml.gather({
    input: "speech",
    action: "/gather",
    method: "POST",
    speechTimeout: "auto",
  });

  res.type("text/xml").send(twiml.toString());
});

// Route: serve audio files
app.get("/audio/:filename", (req, res) => {
  const filePath = path.join(audioDir, req.params.filename);
  res.sendFile(filePath);
});

// Route: handle conversation
app.post("/gather", async (req, res) => {
  const twiml = new VoiceResponse();
  const speechResult = req.body.SpeechResult || "";

  console.log("🔹 User said:", speechResult);

  if (!speechResult) {
    const fallback = "Sorry, I didn’t catch that. Could you repeat?";
    const audioFile = await synthesizeSpeech(fallback);
    twiml.play(`${req.protocol}://${req.get("host")}/audio/${path.basename(audioFile)}`);

    const gather = twiml.gather({
      input: "speech",
      action: "/gather",
      method: "POST",
      speechTimeout: "auto",
    });
    return res.type("text/xml").send(twiml.toString());
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: getBusinessContext() },
        { role: "user", content: speechResult },
      ],
    });

    const aiResponse =
      completion.choices[0].message.content || "I’m not sure about that.";

    console.log("🤖 AI response:", aiResponse);

    const audioFile = await synthesizeSpeech(aiResponse);
    twiml.play(`${req.protocol}://${req.get("host")}/audio/${path.basename(audioFile)}`);

    // Stay in conversation mode (no redirect to /voice, no repeat greeting)
    const gather = twiml.gather({
      input: "speech",
      action: "/gather",
      method: "POST",
      speechTimeout: "auto",
    });
  } catch (err) {
    console.error("❌ Error with OpenAI/Polly:", err);

    const errorText = "Sorry, I had trouble processing that.";
    const audioFile = await synthesizeSpeech(errorText);
    twiml.play(`${req.protocol}://${req.get("host")}/audio/${path.basename(audioFile)}`);
  }

  res.type("text/xml").send(twiml.toString());
});

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
