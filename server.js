import express from "express";
import bodyParser from "body-parser";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import OpenAI from "openai";
import twilio from "twilio";

const app = express();
const port = process.env.PORT || 10000;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Fix __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Twilio setup
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// OpenAI setup
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// AWS Polly setup (v3 SDK)
const pollyClient = new PollyClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Route: Incoming call from Twilio
app.post("/voice", async (req, res) => {
  console.log("📞 Incoming call request:", req.body);

  try {
    // Example: simple AI response
    const userText = "Hello! How can I help you today?";

    // Get OpenAI response (replace this with actual conversation logic)
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: "You are a helpful assistant." }],
    });

    const aiResponse = completion.choices[0].message.content;
    console.log("🤖 OpenAI response:", aiResponse);

    // Convert text to speech with Polly
    const command = new SynthesizeSpeechCommand({
      OutputFormat: "mp3",
      VoiceId: "Joanna", // change voice here
      Text: aiResponse,
    });

    const data = await pollyClient.send(command);

    const audioPath = path.join(__dirname, "response.mp3");

    if (data.AudioStream) {
      fs.writeFileSync(audioPath, Buffer.from(await data.AudioStream.transformToByteArray()));
      console.log("🔊 Audio saved:", audioPath);
    } else {
      throw new Error("No audio stream returned from Polly");
    }

    // Respond to Twilio with TwiML that plays the MP3
    const twiml = `
      <Response>
        <Play>${req.protocol}://${req.get("host")}/response.mp3</Play>
      </Response>
    `;

    res.type("text/xml");
    res.send(twiml);
  } catch (err) {
    console.error("❌ Voice route error:", err);
    res.type("text/xml");
    res.send(`
      <Response>
        <Say voice="alice">Sorry, something went wrong with the assistant.</Say>
      </Response>
    `);
  }
});

// Serve audio files
app.get("/response.mp3", (req, res) => {
  const filePath = path.join(__dirname, "response.mp3");
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send("No audio found");
  }
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
