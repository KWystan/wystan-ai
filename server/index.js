const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { PDFParse } = require('pdf-parse');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '20mb' }));

// ── File upload config ─────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// ── File upload endpoint ─────────────────────────────────────────
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { originalname, mimetype, size } = req.file;

    // For images, return base64 for display
    if (mimetype.startsWith('image/')) {
      const base64 = req.file.buffer.toString('base64');
      return res.json({
        filename: originalname,
        mimetype,
        size,
        type: 'image',
        data: `data:${mimetype};base64,${base64}`,
      });
    }

    // For PDFs, render pages as images for multimodal models
    if (mimetype === 'application/pdf') {
      const parser = new PDFParse({ data: req.file.buffer });
      const result = await parser.getScreenshot({
        imageDataUrl: true,
        imageBuffer: false,
      });
      const pages = result.pages.map((p) => p.dataUrl);
      return res.json({
        filename: originalname,
        mimetype,
        size,
        type: 'pdf',
        pages,                            // rendered page images for the model
        data: pages[0] || null,           // first page for preview thumbnail
      });
    }

    // For text files, return content
    if (mimetype.startsWith('text/') || mimetype === 'application/json') {
      const content = req.file.buffer.toString('utf8');
      return res.json({
        filename: originalname,
        mimetype,
        size,
        type: 'text',
        content,
      });
    }

    // For other files, just return metadata
    res.json({
      filename: originalname,
      mimetype,
      size,
      type: 'file',
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// ── System prompt loaded from text file ───────────────────────────
const SYSTEM_PROMPT = fs.readFileSync(path.join(__dirname, 'system-prompt.txt'), 'utf8');

// ── NVIDIA NIM API config ───────────────────────────────────────
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const MODEL = 'meta/llama-4-maverick-17b-128e-instruct';

// ── Chat endpoint ───────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    if (!NVIDIA_API_KEY || NVIDIA_API_KEY === 'nvapi-YOUR_API_KEY_HERE') {
      return res.status(503).json({ error: 'AI chat is not configured yet. Please set the NVIDIA_API_KEY in the server .env file.' });
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
      return res.status(502).json({ error: 'AI service returned an error. Please try again.' });
    }

    const data = await nvidiaRes.json();
    const reply = data.choices?.[0]?.message?.content || '';

    res.json({ reply });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ── General-purpose AI chat (OpenCode Zen / MiMo) ───────────────
const OPENCODE_API_KEY = process.env.OPENCODE_API_KEY;
const OPENCODE_BASE_URL = process.env.OPENCODE_BASE_URL || 'https://opencode.ai/zen/v1';
const CHAT_MODEL = 'mimo-v2.5-free';

const CHAT_SYSTEM_PROMPT = `You are a helpful, friendly, and knowledgeable AI assistant. You can help users with a wide range of topics including answering questions, writing, explaining concepts, brainstorming ideas, coding help, and general conversation.

Guidelines:
- Be conversational, warm, and approachable
- Give clear, concise, and helpful responses
- Use emojis sparingly and naturally where appropriate
- If unsure about something, say so honestly
- Keep responses focused and useful — avoid being overly verbose
- Adapt your tone to match the user's style`;

/* ── Relay an OpenAI-style SSE stream to the client ──────────
 *  Reads upstream `data: {...}` chunks (with choices[0].delta.content)
 *  and re-emits normalized `data: {content}` / `data: [DONE]` lines.
 *  Used by any chat-completions upstream we pipe through (OpenCode, NVIDIA). */
function relaySSE(apiRes, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const reader = apiRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  return (async () => {
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
  })();
}

app.post('/api/chat-full', async (req, res) => {
  try {
    const { messages, model: clientModel } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    const recent = messages.slice(-20);

    /* Route by model id: NVIDIA NIM ids are `org/name` (contain `/`);
       OpenCode ids don't. Pick the upstream URL + credentials accordingly. */
    const isNvidia = typeof clientModel === 'string' && clientModel.includes('/');
    const upstream = isNvidia
      ? { url: `${NVIDIA_BASE_URL}/chat/completions`, apiKey: NVIDIA_API_KEY, defaultModel: 'minimaxai/minimax-m3', label: 'NVIDIA' }
      : { url: `${OPENCODE_BASE_URL}/chat/completions`, apiKey: OPENCODE_API_KEY, defaultModel: CHAT_MODEL, label: 'OpenCode' };

    if (!upstream.apiKey) {
      return res.status(503).json({ error: 'AI chat is not configured yet.' });
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
      return res.status(502).json({ error: 'AI service returned an error. Please try again.' });
    }

    /* ── Stream SSE back to the client ───────────────────────── */
    await relaySSE(apiRes, res);
  } catch (err) {
    console.error('Chat-full error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    } else {
      res.write(`data: ${JSON.stringify({ error: 'Connection lost. Please try again.' })}\n\n`);
      res.end();
    }
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running!' });
});

// ── Image generation (NVIDIA Flux) ────────────────────────────────
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt, width = 1024, height = 1024, seed = 0, steps = 4 } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    if (!NVIDIA_API_KEY || NVIDIA_API_KEY === 'nvapi-YOUR_API_KEY_HERE') {
      return res.status(503).json({ error: 'Image generation is not configured. Set NVIDIA_API_KEY in the server .env file.' });
    }

    const nvidiaRes = await fetch('https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${NVIDIA_API_KEY}`,
      },
      body: JSON.stringify({ prompt, width, height, seed, steps }),
    });

    if (!nvidiaRes.ok) {
      const errText = await nvidiaRes.text();
      console.error('NVIDIA GenAI error:', nvidiaRes.status, errText);

      // Check if it was flagged as NSFW / content policy violation
      const isContentPolicy = /nsfw|content.?policy|inappropriate|safety|filtered/i.test(errText);

      return res.status(isContentPolicy ? 400 : 502).json({
        error: isContentPolicy
          ? 'Your prompt was flagged by the content safety filter. Please try something else.'
          : 'Image generation failed. Please try again.',
      });
    }

    const data = await nvidiaRes.json();

    // Some models return nsfw_content_detected in the success payload
    const artifacts = Array.isArray(data) ? data : data.artifacts || data.data || [];
    if (artifacts.length > 0 && artifacts[0].nsfw_content_detected) {
      return res.status(400).json({ error: 'Your prompt was flagged by the content safety filter. Please try something else.' });
    }

    res.json(data);
  } catch (err) {
    console.error('Generate error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
