// server.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { VoiceResponse } = require('twilio').twiml;

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// config via env
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const POLLY_VOICE = process.env.POLLY_VOICE || 'Polly.Joanna';
const PORT = process.env.PORT || 3000;

// Simple in-memory session store for Phase 1 testing (per call)
const sessions = new Map();

/**
 * /voice
 * Initial webhook for incoming calls. Twilio should be configured to POST here.
 * Returns TwiML with a Gather for speech input.
 */
app.post('/voice', (req, res) => {
  try {
    const callSid = req.body.CallSid || 'no-call-sid';
    // init session with a system prompt if not present
    if (!sessions.has(callSid)) {
      sessions.set(callSid, [
        {
          role: 'system',
          content:
            'You are a friendly, concise phone assistant for a hospitality business. Be helpful, confirm bookings when requested, and ask clarifying questions if information is missing. Keep replies short (1-2 sentences) so responses are quick.'
        }
      ]);
    }

    const twiml = new VoiceResponse();
    const gather = twiml.gather({
      input: 'speech',
      timeout: 3,
      speechTimeout: 'auto',
      action: '/process-speech',
      method: 'POST'
    });

    gather.say(
      { voice: POLLY_VOICE, language: 'en-US' },
      'Hello — thanks for calling. How can I help you today?'
    );

    // fallback if no speech detected
    twiml.say({ voice: POLLY_VOICE }, "I didn't hear anything. Goodbye!");
    twiml.hangup();

    res.type('text/xml').send(twiml.toString());
  } catch (err) {
    console.error('/voice error', err);
    res.status(500).send('Server error');
  }
});

/**
 * /process-speech
 * Twilio posts collected speech here. We call OpenAI, get a reply, return TwiML that speaks reply and re-gathers.
 */
app.post('/process-speech', async (req, res) => {
  try {
    const callSid = req.body.CallSid || 'no-call-sid';
    const speech = (req.body.SpeechResult || '').trim();
    console.log('process-speech:', { callSid, speech });

    // ensure session exists
    if (!sessions.has(callSid)) {
      sessions.set(callSid, [
        {
          role: 'system',
          content:
            'You are a friendly, concise phone assistant for a hospitality business. Be helpful, confirm bookings when requested, and ask clarifying questions if information is missing. Keep replies short (1-2 sentences).'
        }
      ]);
    }
    const messages = sessions.get(callSid);

    // store user input in convo
    messages.push({ role: 'user', content: speech });

    // quick local hangup detection (so we don't call OpenAI unnecessarily)
    const low = speech.toLowerCase();
    if (/bye|goodbye|thank you|thanks|i\'m done|no thanks|no thank you/.test(low)) {
      const twiml = new VoiceResponse();
      twiml.say({ voice: POLLY_VOICE }, 'Thanks for calling. Goodbye!');
      twiml.hangup();
      sessions.delete(callSid);
      return res.type('text/xml').send(twiml.toString());
    }

    // call OpenAI Chat Completions (gpt-3.5-turbo example)
    const openaiResp = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: messages,
        max_tokens: 150,
        temperature: 0.6
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 14000 // guard against very slow responses (Twilio times out ~15s)
      }
    );

    const assistantText = openaiResp.data.choices[0].message.content.trim();
    console.log('assistantText:', assistantText);

    // append assistant reply to session
    messages.push({ role: 'assistant', content: assistantText });

    // respond to caller with TwiML: say + re-gather for follow-up
    const twiml = new VoiceResponse();
    twiml.say({ voice: POLLY_VOICE, language: 'en-US' }, assistantText);

    // Re-gather for a follow-up question (keeps the call conversational)
    const gather = twiml.gather({
      input: 'speech',
      timeout: 3,
      speechTimeout: 'auto',
      action: '/process-speech',
      method: 'POST'
    });
    gather.say({ voice: POLLY_VOICE }, 'Is there anything else I can help you with?');

    res.type('text/xml').send(twiml.toString());
  } catch (err) {
    console.error('/process-speech error', err?.response?.data || err.message || err);
    const twiml = new VoiceResponse();
    twiml.say(
      { voice: POLLY_VOICE },
      'Sorry, I am having technical trouble right now. Please call back later.'
    );
    twiml.hangup();
    return res.type('text/xml').send(twiml.toString());
  }
});

// simple health check
app.get('/health', (req, res) => res.send('ok'));

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
