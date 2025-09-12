import express from "express";
import bodyParser from "body-parser";
import twilio from "twilio";
import OpenAI from "openai";
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import AWS from "aws-sdk";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// Twilio client
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// AWS Polly setup
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || "us-east-1",
});
const polly = new AWS.Polly();

// Utility: convert Polly audio stream to Buffer
async function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", (err) => reject(err));
  });
}

// Handle incoming calls
app.post("/voice", async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say("Hello, this is your AI assistant. How can I help you today?");
  twiml.record({
    action: "/process_speech",
    transcribe: true,
    transcribeCallback: "/transcription",
    maxLength: 30,
  });
  res.type("text/xml");
  res.send(twiml.toString());
});

// Handle transcription (text from Twilio)
app.post("/transcription", async (req, res) => {
  try {
    const userInput = req.body.TranscriptionText || "I didn't catch that.";

    // Get OpenAI response
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful human-like phone assistant." },
        { role: "user", content: userInput },
      ],
    });

    const assistantReply =
      aiResponse.choices[0]?.message?.content || "Sorry, I had trouble answering.";

    // Use Polly to generate audio
    const pollyResult = await polly
      .synthesizeSpeech({
        Text: assistantReply,
        OutputFormat: "mp3",
        VoiceId: process.env.POLLY_VOICE || "Joanna", // try "Matthew" or "Olivia" too
      })
      .promise();

    // Convert Polly stream to buffer and save file
    const audioBuffer = await streamToBuffer(pollyResult.AudioStream);
    const filePath = join(__dirname, "response.mp3");
    fs.writeFileSync(filePath, audioBuffer);

    // Build TwiML to play audio
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.play(`/response.mp3`);
    twiml.record({
      action: "/process_speech",
      transcribe: true,
      transcribeCallback: "/transcription",
      maxLength: 30,
    });

    res.type("text/xml");
    res.send(twiml.toString());
  } catch (error) {
    console.error("Processing error:", error);
    res.status(500).send("Internal error");
  }
});

// Serve mp3 file
app.get("/response.mp3", (req, res) => {
  const filePath = join(__dirname, "response.mp3");
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send("Audio not found");
  }
});

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
