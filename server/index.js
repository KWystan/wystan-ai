const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');
const XLSX = require('xlsx');
const AdmZip = require('adm-zip');
require('dotenv').config();

// ── Routes (Supabase-dependent; handle missing deps gracefully) ──
let authRouter, conversationsRouter, projectsRouter, optionalAuth, requireAuth;
try {
  authRouter = require('./routes/auth');
  conversationsRouter = require('./routes/conversations');
  projectsRouter = require('./routes/projects');
  const mw = require('./routes/middleware');
  optionalAuth = mw.optionalAuth;
  requireAuth = mw.requireAuth;
  console.log('Supabase client loaded.');
} catch (err) {
  console.warn('Supabase not available — install @supabase/supabase-js and set env vars.');
}

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '20mb' }));

// API routes (auth + data)
if (authRouter && conversationsRouter && projectsRouter) {
  app.use('/api/auth', authRouter);
  app.use('/api/conversations', optionalAuth, requireAuth, conversationsRouter);
  app.use('/api/projects', optionalAuth, requireAuth, projectsRouter);
}

// ── File upload config ─────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// ── File type registry ──────────────────────────────────────────
const FILE_TYPES = {
  // Documents
  pdf:  { type: 'pdf',  group: 'document' },
  docx: { type: 'docx', group: 'document' },
  pptx: { type: 'pptx', group: 'document' },
  // Spreadsheets / tables
  xlsx: { type: 'xlsx', group: 'table' },
  xls:  { type: 'xls',  group: 'table' },
  csv:  { type: 'csv',  group: 'table' },
  tsv:  { type: 'tsv',  group: 'table' },
  // Code files (sent as context to LLM)
  js:   { type: 'code', group: 'text', language: 'javascript' },
  jsx:  { type: 'code', group: 'text', language: 'jsx' },
  ts:   { type: 'code', group: 'text', language: 'typescript' },
  tsx:  { type: 'code', group: 'text', language: 'tsx' },
  py:   { type: 'code', group: 'text', language: 'python' },
  rb:   { type: 'code', group: 'text', language: 'ruby' },
  java: { type: 'code', group: 'text', language: 'java' },
  c:    { type: 'code', group: 'text', language: 'c' },
  cpp:  { type: 'code', group: 'text', language: 'cpp' },
  cs:   { type: 'code', group: 'text', language: 'csharp' },
  go:   { type: 'code', group: 'text', language: 'go' },
  rs:   { type: 'code', group: 'text', language: 'rust' },
  swift:{ type: 'code', group: 'text', language: 'swift' },
  kt:   { type: 'code', group: 'text', language: 'kotlin' },
  php:  { type: 'code', group: 'text', language: 'php' },
  html: { type: 'code', group: 'text', language: 'html' },
  css:  { type: 'code', group: 'text', language: 'css' },
  scss: { type: 'code', group: 'text', language: 'scss' },
  less: { type: 'code', group: 'text', language: 'less' },
  sql:  { type: 'code', group: 'text', language: 'sql' },
  sh:   { type: 'code', group: 'text', language: 'bash' },
  bash: { type: 'code', group: 'text', language: 'bash' },
  yaml: { type: 'code', group: 'text', language: 'yaml' },
  yml:  { type: 'code', group: 'text', language: 'yaml' },
  xml:  { type: 'code', group: 'text', language: 'xml' },
  json: { type: 'code', group: 'text', language: 'json' },
  md:   { type: 'code', group: 'text', language: 'markdown' },
  r:    { type: 'code', group: 'text', language: 'r' },
  // Plain text
  txt:  { type: 'text', group: 'text' },
  // Images
  png:  { type: 'image', group: 'image' },
  jpg:  { type: 'image', group: 'image' },
  jpeg: { type: 'image', group: 'image' },
  gif:  { type: 'image', group: 'image' },
  webp: { type: 'image', group: 'image' },
  svg:  { type: 'image', group: 'image' },
  bmp:  { type: 'image', group: 'image' },
};

/** Extract plain text from a PPTX buffer (zip of XML slides). */
function extractPptxText(buffer) {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  const slideTexts = [];

  for (const entry of entries) {
    // Slide files live inside ppt/slides/ as slideN.xml
    if (!entry.entryName.startsWith('ppt/slides/') || !entry.entryName.endsWith('.xml')) continue;

    const xml = entry.getData().toString('utf8');
    // Extract text between <a:t>...</a:t> elements
    const texts = [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)].map(m => m[1]);
    if (texts.length) slideTexts.push(texts.join(' '));
  }

  return slideTexts.join('\n\n');
}

/** Maximum characters to send as context to the LLM (~15-20K tokens). */
const MAX_CONTEXT_CHARS = 50000;

/** Truncate text content with a notice if it exceeds MAX_CONTEXT_CHARS. */
function truncateContent(text) {
  if (!text || text.length <= MAX_CONTEXT_CHARS) return text;
  return text.slice(0, MAX_CONTEXT_CHARS) +
    `\n\n[Content truncated at ${MAX_CONTEXT_CHARS.toLocaleString()} characters. The original file was ${(text.length / 1024).toFixed(0)} KB.]`;
}

// ── File upload endpoint ─────────────────────────────────────────
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { originalname, mimetype, size, buffer } = req.file;

    /* Determine file type from extension first, fall back to MIME */
    const ext = path.extname(originalname).toLowerCase().replace('.', '');
    let info = FILE_TYPES[ext];

    // Fallback: infer from MIME type when extension isn't in our map
    if (!info) {
      if (mimetype.startsWith('image/'))        info = { type: 'image', group: 'image' };
      else if (mimetype.startsWith('text/'))     info = { type: 'text',  group: 'text' };
      else if (mimetype === 'application/json')  info = { type: 'code', group: 'text', language: 'json' };
      else if (mimetype === 'application/pdf')   info = { type: 'pdf',  group: 'document' };
      else if (mimetype.includes('xml'))          info = { type: 'code', group: 'text', language: 'xml' };
      else                                        info = { type: 'file', group: 'other' };
    }

    // Build base response with metadata
    const response = {
      filename: originalname,
      mimetype,
      size,
      type: info.type,
      group: info.group,
      language: info.language || null,
    };

    switch (info.group) {
      /* ── Images ───────────────────────────────────────────── */
      case 'image': {
        response.data = `data:${mimetype};base64,${buffer.toString('base64')}`;
        break;
      }

      /* ── Text / code files (read as utf8) ─────────────────── */
      case 'text': {
        response.content = buffer.toString('utf8');
        break;
      }

      /* ── Document files (PDF, DOCX, PPTX) ─────────────────── */
      case 'document': {
        if (info.type === 'pdf') {
          const parser = new PDFParse({ data: buffer });
          // Extract text — wrap in try/catch so a text failure doesn't lose screenshots
          try { response.content = await parser.getText(); } catch (e) {
            console.error('PDF text extraction failed:', e.message);
            response.content = null;
          }
          // Render pages as images for the preview modal (independent from text)
          try {
            const result = await parser.getScreenshot({
              imageDataUrl: true,
              imageBuffer: false,
            });
            response.pages = result.pages.map((p) => p.dataUrl);
          } catch (e) {
            console.error('PDF screenshot failed:', e.message);
          }
        } else if (info.type === 'docx') {
          try {
            const result = await mammoth.extractRawText({ buffer });
            response.content = result.value;
          } catch (e) {
            console.error('DOCX extraction failed:', e.message);
          }
        } else if (info.type === 'pptx') {
          try { response.content = extractPptxText(buffer); } catch (e) {
            console.error('PPTX extraction failed:', e.message);
          }
        }
        break;
      }

      /* ── Spreadsheet / table files (XLSX, XLS, CSV, TSV) ─── */
      case 'table': {
        if (info.type === 'csv' || info.type === 'tsv') {
          response.content = buffer.toString('utf8');
        } else {
          try {
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            const parts = workbook.SheetNames.map((name) => {
              const sheet = workbook.Sheets[name];
              const csv = XLSX.utils.sheet_to_csv(sheet);
              return csv ? `--- ${name} ---\n${csv}` : null;
            }).filter(Boolean);
            response.content = parts.join('\n\n');
          } catch (e) {
            console.error('XLSX/XLS parsing failed:', e.message);
          }
        }
        break;
      }

      /* ── Fallback: binary / unknown — metadata only ───────── */
      default:
        break;
    }

    // Truncate content for LLM context window safety
    if (response.content) {
      response.content = truncateContent(response.content);
    }

    res.json(response);
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
      let details = 'AI service returned an error.';
      try {
        const parsed = JSON.parse(errText);
        details = parsed.error?.message || parsed.message || parsed.error || details;
      } catch { details = errText.slice(0, 200) || details; }
      return res.status(502).json({ error: details });
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
- Adapt your tone to match the user's style
- Code, commands, flags, and technical terms with dashes must ALWAYS be wrapped in markdown backticks (\`like this\`). For example: \`--flag-name\`, \`npm install\`, \`-webkit-transform\`. This prevents the browser from misreading dashes as line-break opportunities. Never leave backtick-worthy terms unformatted.`;

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
      let details = 'AI service returned an error.';
      try {
        const parsed = JSON.parse(errText);
        details = parsed.error?.message || parsed.message || parsed.error || details;
      } catch { details = errText.slice(0, 200) || details; }
      return res.status(502).json({ error: details });
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

// ── Web search (Tavily) ────────────────────────────────────────────
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

app.post('/api/search', async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || !query.trim()) {
      return res.status(400).json({ error: 'Query is required' });
    }

    if (!TAVILY_API_KEY) {
      return res.status(503).json({ error: 'Web search is not configured.' });
    }

    const tavRes = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query: query.trim(),
        max_results: 5,
        include_answer: true,
      }),
    });

    if (!tavRes.ok) {
      const errText = await tavRes.text();
      console.error('Tavily error:', tavRes.status, errText);
      return res.status(502).json({ error: 'Search service returned an error.' });
    }

    const data = await tavRes.json();
    res.json(data);
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// ── Multer / file-size error handler ────────────────────────────
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File is too large. Maximum size is 10 MB.' });
    }
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  next(err);
});

// Export for Vercel serverless
module.exports = app;

// Start server (only when run directly, not when imported by Vercel)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}
