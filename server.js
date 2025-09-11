import express from "express";
import bodyParser from "body-parser";
import twilio from "twilio";
import OpenAI from "openai";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 🟢 Helper: Generate current context
function getBusinessContext() {
  const now = new Date();
  return `
You are a helpful AI voice assistant for ${process.env.BUSINESS_NAME || "Nick's Argentine Barbecue"}.
Today’s date is ${now.toLocaleDateString()} and the current time is ${now.toLocaleTimeString()}.
Business hours: ${process.env.BUSINESS_HOURS || "Mon-Sun 10am to 10pm"}.
Address: ${process.env.BUSINESS_ADDRESS || "6445 Biscayne Blvd, Miami, FL"}.
Phone: ${process.env.BUSINESS_PHONE || "555-123-4567"}.

Always answer as if you are part of this business, and keep responses short and conversational for voice. 
If someone asks to make a reservation, confirm the time/day relative to today’s date.
`;
}

// 🟢 Handle incoming call
app.post("/voice", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  const gather = twiml.gather({
    input: "speech",
    action: "/gather",
    method: "POST",
    speechTimeout: "1", // ⏱️ respond quicker (1 second after silence)
  });

  gather.say(
    { voice: process.env.POLLY_VOICE || "Polly.Matthew", language: "en-US" },
    "Hello! How can I assist you today?"
  );

  res.type("text/xml");
  res.send(twiml.toString());
});

// 🟢 Handle gathered speech
app.post("/gather", async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const speechResult = req.body.SpeechResult || "";

  console.log("User said:", speechResult);

  if (!speechResult) {
    twiml.say(
      { voice: process.env.POLLY_VOICE || "Polly.Matthew", language: "en-US" },
      "Sorry, I didn’t catch that. Could you repeat?"
    );
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

    console.log("AI response:", aiResponse);

    twiml.say(
      { voice: process.env.POLLY_VOICE || "Polly.Matthew", language: "en-US" },
      aiResponse
    );

    // Keep call open for another round
    twiml.redirect("/voice");
  } catch (err) {
    console.error("Error with OpenAI:", err);
    twiml.say(
      { voice: process.env.POLLY_VOICE || "Polly.Matthew", language: "en-US" },
      "Sorry, I had trouble processing that."
    );
  }

  res.type("text/xml").send(twiml.toString());
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);
