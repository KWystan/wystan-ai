// ── Chat routes ───────────────────────────────────────────────────
// Provides two chat endpoints:
//   POST /api/chat      — Legacy non-streaming NVIDIA NIM
//   POST /api/chat-full — SSE streaming routed by model id

const { Router } = require('express');
const fs = require('fs');
const path = require('path');

const { validate, schemas } = require('../validators');
const { asyncHandler, AppError } = require('../errors');

const router = Router();

// ── NVIDIA NIM config ────────────────────────────────────────────
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const MODEL = 'meta/llama-4-maverick-17b-128e-instruct';

// ── OpenCode config ──────────────────────────────────────────────
const OPENCODE_API_KEY = process.env.OPENCODE_API_KEY;
const OPENCODE_BASE_URL = process.env.OPENCODE_BASE_URL || 'https://opencode.ai/zen/v1';
const CHAT_MODEL = 'mimo-v2.5-free';

// ── System prompts ───────────────────────────────────────────────
const SYSTEM_PROMPT = fs.readFileSync(path.join(__dirname, '..', 'system-prompt.txt'), 'utf8');

const CHAT_SYSTEM_PROMPT = `You are a helpful, friendly, and knowledgeable AI assistant. You can help users with a wide range of topics including answering questions, writing, explaining concepts, brainstorming ideas, coding help, and general conversation.

Guidelines:
- Be conversational, warm, and approachable
- Give clear, concise, and helpful responses
- Use emojis sparingly and naturally where appropriate
- If unsure about something, say so honestly
- Keep responses focused and useful — avoid being overly verbose
- Adapt your tone to match the user's style
- Code, commands, flags, and technical terms with dashes must ALWAYS be wrapped in markdown backticks (\`like this\`). For example: \`--flag-name\`, \`npm install\`, \`-webkit-transform\`. This prevents the browser from misreading dashes as line-break opportunities. Never leave backtick-worthy terms unformatted.`;

/* ── Relay an OpenAI-style SSE stream to the client ──────────
 *  Reads upstream `data: {...}` chunks (with choices[0].delta.content)
 *  and re-emits normalized `data: {content}` / `data: [DONE]` lines.
 *  Used by any chat-completions upstream we pipe through (OpenCode, NVIDIA). */
async function relaySSE(apiRes, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const reader = apiRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;

      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') {
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }

      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) {
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      } catch {
        // skip malformed JSON
      }
    }
  }

  res.write('data: [DONE]\n\n');
  res.end();
}

// ── POST /api/chat — Legacy non-streaming NVIDIA NIM ─────────────
router.post('/chat', validate(schemas.chat), asyncHandler(async (req, res) => {
  const { messages } = req.body;

  if (!NVIDIA_API_KEY || NVIDIA_API_KEY === 'nvapi-YOUR_API_KEY_HERE') {
    throw new AppError('AI chat is not configured yet. Please set the NVIDIA_API_KEY in the server .env file.', 503, { log: 'Chat' });
  }

  /* Keep context short — last 12 messages max */
  const recent = messages.slice(-12);
  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...recent,
    ],
    max_tokens: 512,
    temperature: 0.7,
    top_p: 0.95,
  };

  const nvidiaRes = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${NVIDIA_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!nvidiaRes.ok) {
    const errText = await nvidiaRes.text();
    console.error('NVIDIA API error:', nvidiaRes.status, errText);
    let details = 'AI service returned an error.';
    try {
      const parsed = JSON.parse(errText);
      details = parsed.error?.message || parsed.message || parsed.error || details;
    } catch { details = errText.slice(0, 200) || details; }
    throw new AppError(details, 502, { log: 'NVIDIA API' });
  }

  const data = await nvidiaRes.json();
  const reply = data.choices?.[0]?.message?.content || '';

  res.json({ reply });
}));

// ── POST /api/chat-full — SSE streaming, routed by model id ──────
router.post('/chat-full', validate(schemas.chatFull), asyncHandler(async (req, res) => {
  const { messages, model: clientModel } = req.body;
  const recent = messages.slice(-20);

  /* Route by model id: NVIDIA NIM ids are `org/name` (contain `/`);
     OpenCode ids don't. Pick the upstream URL + credentials accordingly. */
  const isNvidia = typeof clientModel === 'string' && clientModel.includes('/');
  const upstream = isNvidia
    ? { url: `${NVIDIA_BASE_URL}/chat/completions`, apiKey: NVIDIA_API_KEY, defaultModel: 'minimaxai/minimax-m3', label: 'NVIDIA' }
    : { url: `${OPENCODE_BASE_URL}/chat/completions`, apiKey: OPENCODE_API_KEY, defaultModel: CHAT_MODEL, label: 'OpenCode' };

  if (!upstream.apiKey) {
    throw new AppError('AI chat is not configured yet.', 503, { log: 'Chat' });
  }

  /* Check if any message uses multimodal content (array of content blocks).
     Some upstream models (e.g. NVIDIA MiniMax M3) crash with system prompt + images. */
  const hasMultimodal = recent.some(m => Array.isArray(m.content));

  const body = {
    model: clientModel || upstream.defaultModel,
    messages: [
      ...(hasMultimodal ? [] : [{ role: 'system', content: CHAT_SYSTEM_PROMPT }]),
      ...recent,
    ],
    max_tokens: 2048,
    temperature: 0.7,
    top_p: 0.95,
    stream: true,
  };

  const apiRes = await fetch(upstream.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${upstream.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!apiRes.ok) {
    const errText = await apiRes.text();
    console.error(`${upstream.label} API error:`, apiRes.status, errText);
    let details = 'AI service returned an error.';
    try {
      const parsed = JSON.parse(errText);
      details = parsed.error?.message || parsed.message || parsed.error || details;
    } catch { details = errText.slice(0, 200) || details; }
    throw new AppError(details, 502, { log: upstream.label });
  }

  /* ── Stream SSE back to the client ───────────────────────── */
  try {
    await relaySSE(apiRes, res);
  } catch (streamErr) {
    console.error('Chat-full stream error:', streamErr);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    } else {
      res.write(`data: ${JSON.stringify({ error: 'Connection lost. Please try again.' })}\n\n`);
      res.end();
    }
  }
}));

module.exports = router;
