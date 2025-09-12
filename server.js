import express from "express";
import bodyParser from "body-parser";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import OpenAI from "openai";
import twilio from "twilio";
import { v4 as uuidv4 } from "uuid"; // for unique filenames

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const client = twilio();
const openai = new OpenAI();
const polly = new PollyClient({ region: "us-east-1" });

// 🔹 Serve static audio files
app.use("/audio", express.static(path.join(__dirname, "audio")));

// Ensure audio directory exists
if (!fs.existsSync(path.join(__dirname, "audio"))) {
  fs.mkdirSync(path.join(__dirname, "audio"));
}

app.post("/voice", async (req, res) => {
  try {
    console.log("📞 Incoming call request:", req.body);

    const userSpeech = req.body.SpeechResult || "Hello";
    console.log("🗣️ Caller said:", userSpeech);

    // 🔹 Generate AI response
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: userSpeech }],
    });

    const text =
      aiResponse.choices[0].message.content || "How can I assist you today?";
    console.log("🤖 OpenAI response:", text);

    // 🔹 Generate unique filename
    const fileId = uuidv4();
    const audioFilename = `response-${fileId}.mp3`;
    const audioPath = path.join(__dirname, "audio", audioFilename);

    // 🔹 Generate speech with Polly Neural voice
    const command = new SynthesizeSpeechCommand({
      OutputFormat: "mp3",
      Engine: "neural", // 👈 more natural speech
      Text: text,
      VoiceId: "Joanna", // try Kimberly, Matthew, Salli for variety
    });
    const { AudioStream } = await polly.send(command);

    fs.writeFileSync(
      audioPath,
      Buffer.from(await AudioStream.transformToByteArray())
    );
    console.log("🔊 Audio saved:", audioPath);

    // 🔹 Build TwiML response
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.play(`${req.protocol}://${req.get("host")}/audio/${audioFilename}`);
    twiml.gather({
      input: "speech",
      action: "/voice",
      method: "POST",
    });

    res.type("text/xml");
    res.send(twiml.toString());
  } catch (error) {
    console.error("❌ Error handling call:", error);
    res.status(500).send("Error processing call");
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
