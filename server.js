import express from "express";
import pkg from "twilio";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import OpenAI from "openai";

const { twiml: Twiml } = pkg;
const app = express();
const port = process.env.PORT || 10000;

app.use(bodyParser.urlencoded({ extended: false }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Conversation memory (simple in-memory, can move to Redis/DB later)
let conversationHistory = [];
let currentLanguage = "en"; // "en" = English, "es" = Spanish

// Helper: get current date/time
function getCurrentDateTime() {
  const now = new Date();
  return now.toLocaleString(currentLanguage === "es" ? "es-ES" : "en-US", {
    dateStyle: "full",
    timeStyle: "short",
  });
}

// Route for incoming calls
app.post("/voice", async (req, res) => {
  const twiml = new Twiml.VoiceResponse();

  const userInput = req.body.SpeechResult || req.body.Transcription || "";

  // Language switch detection
  if (/spanish|español/i.test(userInput)) {
    currentLanguage = "es";
  } else if (/english|inglés/i.test(userInput)) {
    currentLanguage = "en";
  }

  // Build system prompt
  const systemPrompt =
    currentLanguage === "en"
      ? `You are a helpful AI voice assistant for an Italian restaurant. 
      Today is ${getCurrentDateTime()}. 
      Speak naturally, warmly, and keep responses brief like a human. 
      You can help with menu questions, hours, reservations, and specials.`
      : `Eres un asistente de voz útil para un restaurante italiano. 
      Hoy es ${getCurrentDateTime()}. 
      Habla de manera natural y breve, como una persona real. 
      Puedes ayudar con preguntas sobre el menú, horarios, reservas y promociones.`;

  // Add user input to conversation history
  if (userInput.trim()) {
    conversationHistory.push({ role: "user", content: userInput });
  }

  try {
    // Query OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...conversationHistory,
      ],
    });

    const assistantReply = completion.choices[0].message.content;

    // Save assistant reply to conversation
    conversationHistory.push({ role: "assistant", content: assistantReply });

    // Convert reply to speech
    const speechFile = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: currentLanguage === "es" ? "aria" : "alloy",
      input: assistantReply,
    });

    // Stream audio back to Twilio
    const buffer = Buffer.from(await speechFile.arrayBuffer());
    const audioBase64 = buffer.toString("base64");

    twiml.play(
      {
        loop: 1,
      },
      `data:audio/mpeg;base64,${audioBase64}`
    );

    res.type("text/xml");
    res.send(twiml.toString());
  } catch (error) {
    console.error("Error:", error);
    twiml.say(
      currentLanguage === "es"
        ? "Lo siento, hubo un problema técnico."
        : "Sorry, there was a technical issue."
    );
    res.type("text/xml");
    res.send(twiml.toString());
  }
});

app.listen(port, () =>
  console.log(`🚀 Server running on http://localhost:${port}`)
);
