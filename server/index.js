require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { uploadBlob, deleteBlob, isConfigured } = require('./blob');
const { checkQuota, checkImageLimit, recordUsage, deleteUsage, getUsage } = require('./storage');
let PDFParse;
try {
  PDFParse = require('pdf-parse').PDFParse;
} catch (e) {
  console.warn('pdf-parse not available — PDF processing disabled:', e.message);
}
const mammoth = require('mammoth');
const XLSX = require('xlsx');
const AdmZip = require('adm-zip');

// ── Routes (Supabase-dependent; handle missing deps gracefully) ──
let authRouter, conversationsRouter, projectsRouter, sourcesRouter, optionalAuth, requireAuth;
try {
  authRouter = require('./routes/auth');
  conversationsRouter = require('./routes/conversations');
  projectsRouter = require('./routes/projects');
  sourcesRouter = require('./routes/sources');
  const mw = require('./routes/middleware');
  optionalAuth = mw.optionalAuth;
  requireAuth = mw.requireAuth;
  console.log('Supabase client loaded.');
} catch (err) {
  console.warn('Supabase not available — install @supabase/supabase-js and set env vars.');
}

// ── Simple in-memory TTL cache ────────────────────────────────────
function createTTLCache(ttlMs = 300_000) {
  const store = new Map();
  const timers = new Map();

  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return null;
      if (Date.now() - entry.ts > ttlMs) {
        store.delete(key);
        clearTimeout(timers.get(key));
        timers.delete(key);
        return null;
      }
      return entry.data;
    },
    set(key, data) {
      store.set(key, { data, ts: Date.now() });
      clearTimeout(timers.get(key));
      timers.set(key, setTimeout(() => { store.delete(key); timers.delete(key); }, ttlMs));
    },
    _size: () => store.size,
  };
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
  if (sourcesRouter) {
    app.use('/api/projects', optionalAuth, requireAuth, sourcesRouter);
    console.log('Sources router loaded.');
  }
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
app.post('/api/upload', optionalAuth, upload.single('file'), async (req, res) => {
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
          if (!PDFParse) {
            response.content = 'PDF processing is not available in this environment.';
            break;
          }
          const parser = new PDFParse({ data: buffer });
          // Extract text — wrap in try/catch so a text failure doesn't lose screenshots
          try {
            const pdfResult = await parser.getText();
            response.content = pdfResult.text || pdfResult;
          } catch (e) {
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

    /* -- Azure Blob Storage (logged-in users only) -------------------- */
    if (req.user && isConfigured()) {
      try {
        const userId = req.user.id;
        const folder = info.group === 'image' ? 'images' : 'docs';
        const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${originalname}`;

        // Check quotas before upload
        if (folder === 'images') {
          const imgLimit = await checkImageLimit(userId);
          if (!imgLimit.allowed) {
            response.stored = false;
            response.storageError = imgLimit.error;
            return res.status(403).json({ ...response, error: imgLimit.error });
          }
        }

        const quota = await checkQuota(userId, size);
        if (!quota.allowed) {
          response.stored = false;
          response.storageError = quota.error;
          return res.status(403).json({ ...response, error: quota.error });
        }

        // Upload to Azure
        const { blobUrl } = await uploadBlob(userId, folder, uniqueName, buffer, mimetype);

        // Record in Supabase
        await recordUsage(userId, blobUrl, originalname, info.group, size);

        response.stored = true;
        response.blobUrl = blobUrl;
        response.storage = {
          usedBytes: quota.usedBytes + size,
          remainingBytes: quota.remainingBytes - size,
        };
      } catch (azureErr) {
        // Azure failure is non-blocking � file is still processed ephemerally
        console.error('[Upload] Azure storage failed (non-blocking):', azureErr.message);
        response.stored = false;
        response.storageError = 'Cloud storage unavailable. File processed in-memory.';
      }
    } else {
      response.stored = false;
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
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ status: 'OK', message: 'Server is running!' });
});

// ── Image generation (NVIDIA Flux) ────────────────────────────────
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt, width: rawWidth, height: rawHeight, seed = 0, steps = 4 } = req.body;

    // Clamp dimensions — Flux.2-klein-4b caps at 1024
    const width = Math.min(rawWidth || 1024, 1024);
    const height = Math.min(rawHeight || 1024, 1024);

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
          : `Image generation failed (${nvidiaRes.status}): ${errText.slice(0, 300)}`,
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
const searchCache = createTTLCache(300_000); // 5-min TTL

app.post('/api/search', async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || !query.trim()) {
      return res.status(400).json({ error: 'Query is required' });
    }

    if (!TAVILY_API_KEY) {
      return res.status(503).json({ error: 'Web search is not configured.' });
    }

    const trimmed = query.trim().toLowerCase();
    const cached = searchCache.get(trimmed);
    if (cached) {
      res.set('X-Cache', 'HIT');
      return res.json(cached);
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
    searchCache.set(trimmed, data);
    res.set('X-Cache', 'MISS');
    res.json(data);
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});


// ── Flashcard generation ───────────
const FLASHCARD_SYSTEM_PROMPT = `You are a flashcard generator. Given study material or a topic, extract the key concepts and generate question-and-answer flashcards.

Rules:
- Return ONLY a valid JSON array — no markdown, no code fences, no other text.
- Each flashcard must have a "question" and an "answer" field.
- Generate between 5 and 10 flashcards.
- Questions should test understanding, not just recall.
- Answers should be concise but complete.
- If the material is very short or vague, generate flashcards that cover the core concepts.
- Use clear, study-friendly language.

Example:
[{"question": "What is the function of mitochondria?", "answer": "Mitochondria are the powerhouses of the cell, generating ATP through cellular respiration."}];`

/* POST /api/flashcards
 * Non-streaming flashcard generation using the cheapest available model.
 * Body: { text: "..." } — raw material from text input or file extraction.
 * Returns: { cards: [{ question, answer }] } */
app.post('/api/flashcards', async (req, res) => {
  try {
    const { text: sourceText } = req.body;

    if (!sourceText || typeof sourceText !== 'string' || !sourceText.trim()) {
      return res.status(400).json({ error: 'Text content is required.' });
    }

    // Truncate to prevent excessive token use
    const truncatedText = sourceText.slice(0, 15000);

    const messages = [
      { role: 'system', content: FLASHCARD_SYSTEM_PROMPT },
      { role: 'user', content: "Generate flashcards from the following material:\n\n" + truncatedText },
    ];

    const body = {
      model: CHAT_MODEL,
      messages,
      max_tokens: 4096,
      temperature: 0.7,
      top_p: 0.95,
      stream: false,
    };

    const upstreamUrl = `${OPENCODE_BASE_URL}/chat/completions`;
    const apiKey = OPENCODE_API_KEY;

    if (!apiKey) {
      return res.status(503).json({ error: 'Flashcard generation is not configured.' });
    }

    const apiRes = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('Flashcard API error:', apiRes.status, errText);
      let details = 'Generation service returned an error.';
      try { const parsed = JSON.parse(errText); details = parsed.error?.message || parsed.message || parsed.error || details; } catch { details = errText.slice(0, 200) || details; }
      return res.status(502).json({ error: details });
    }

    const data = await apiRes.json();
    const reply = data.choices?.[0]?.message?.content || '';

    if (!reply) {
      return res.status(502).json({ error: 'Empty response from AI service.' });
    }

    // Parse the JSON response — the model should return a pure JSON array
    let cards;
    try {
      cards = JSON.parse(reply);
    } catch {
      // Try to extract JSON from markdown code fence
      const match = reply.match(/`(?:json)?\s*([\s\S]*?)`/);
      if (match) {
        try { cards = JSON.parse(match[1]); } catch { cards = null; }
      } else {
        cards = null;
      }
    }

    if (!cards || !Array.isArray(cards) || cards.length === 0) {
      return res.status(422).json({ error: 'We couldn\'t generate flashcards from that content. Try adjusting the text or providing a clearer topic.' });
    }

    // Validate each card has the required fields
    cards = cards.filter(c => c.question && c.answer).map(c => ({
      question: c.question,
      answer: c.answer,
    }));

    if (cards.length === 0) {
      return res.status(422).json({ error: 'Generated cards were malformed. Try providing clearer content.' });
    }

    res.json({ cards });
  } catch (err) {
    console.error('Flashcard error:', err);
    res.status(500).json({ error: 'Something went wrong generating flashcards.' });
  }
});

// ── Quiz generation ──────────────────────────────────────────────

const QUIZ_SYSTEM_PROMPT = `You are a quiz generator. Generate a structured quiz based on the provided material.

CRITICAL: Return ONLY a valid JSON object with a "questions" array. No markdown, no code fences, no other text.

Each question object must match one of these exact shapes:

1. Multiple choice:
{ "type": "multiple", "question": "What is the capital of France?", "options": ["Berlin", "Madrid", "Paris", "Rome"], "answer": 2, "explanation": "Paris has been the capital of France since the 10th century." }
- "answer" is the 0-based index of the correct option
- ALWAYS provide exactly 4 options
- Distractors must be plausible but incorrect

2. True/False:
{ "type": "truefalse", "question": "The Great Wall of China is visible from space.", "answer": false, "explanation": "This is a common myth. It is not visible from orbit without magnification." }
- "answer" is true or false (boolean, not string)

3. Fill in the blank:
{ "type": "fillblank", "question": "The chemical symbol for gold is ___", "answer": "Au", "explanation": "Au comes from the Latin word 'aurum' meaning gold." }
- question text MUST contain ___ where the blank goes
- answer is the exact text that fills the blank

Difficulty guidelines:
- easy: Basic recall, simple vocabulary, obvious distractors
- medium: Application-level understanding, plausible distractors
- hard: Analysis/synthesis, subtle distractors, multi-step reasoning`;

/* POST /api/quiz
 * Non-streaming quiz generation using OpenCode.
 * Body: { text, type, count, difficulty }
 * Returns: { questions: [...] } */
app.post('/api/quiz', async (req, res) => {
  try {
    const { text: sourceText, type = 'mixed', count = 10, difficulty = 'medium' } = req.body;

    if (!sourceText || typeof sourceText !== 'string' || !sourceText.trim()) {
      return res.status(400).json({ error: 'Text content is required.' });
    }

    const questionCount = Math.max(5, Math.min(20, parseInt(count, 10) || 10));
    const validTypes = ['multiple', 'truefalse', 'fillblank', 'mixed'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid quiz type.' });
    }

    const truncatedText = sourceText.slice(0, 15000);

    const typeInstruction = type === 'mixed'
      ? `Generate a mix of all three question types distributed as evenly as possible across the ${questionCount} questions.`
      : `All questions MUST be type "${type}".`;

    const diffGuide = {
      easy: 'Basic recall with simple vocabulary and clearly wrong distractors.',
      medium: 'Application-level understanding with plausible distractors.',
      hard: 'Analysis and synthesis with subtle distractors and multi-step reasoning.',
    };

    const prompt = `Generate a quiz with exactly ${questionCount} questions at "${difficulty}" difficulty.

${typeInstruction}

${diffGuide[difficulty] || diffGuide.medium}

Material to generate questions from:
${truncatedText}`;

    const messages = [
      { role: 'system', content: QUIZ_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ];

    const body = {
      model: CHAT_MODEL,
      messages,
      max_tokens: 8192,
      temperature: 0.7,
      top_p: 0.95,
      stream: false,
    };

    const upstreamUrl = `${OPENCODE_BASE_URL}/chat/completions`;
    const apiKey = OPENCODE_API_KEY;

    if (!apiKey) {
      return res.status(503).json({ error: 'Quiz generation is not configured.' });
    }

    const apiRes = await fetch(upstreamUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('Quiz API error:', apiRes.status, errText);
      let details = 'Generation service returned an error.';
      try { const parsed = JSON.parse(errText); details = parsed.error?.message || parsed.message || parsed.error || details; } catch { details = errText.slice(0, 200) || details; }
      return res.status(502).json({ error: details });
    }

    const data = await apiRes.json();
    const reply = data.choices?.[0]?.message?.content || '';

    if (!reply) {
      return res.status(502).json({ error: 'Empty response from AI service.' });
    }

    // Parse JSON with code-fence fallback (same pattern as flashcards)
    let parsed;
    try {
      parsed = JSON.parse(reply);
    } catch {
      const match = reply.match(/`(?:json)?\s*([\s\S]*?)`/);
      if (match) {
        try { parsed = JSON.parse(match[1]); } catch { parsed = null; }
      } else {
        parsed = null;
      }
    }

    if (!parsed || !parsed.questions || !Array.isArray(parsed.questions)) {
      return res.status(422).json({ error: 'We couldn\'t generate a valid quiz from that content. Try adjusting the text or providing a clearer topic.' });
    }

    // Validate each question has required fields for its type
    const validQuestions = parsed.questions.filter(q => {
      if (!q.type || !q.question || !q.explanation) return false;
      if (q.type === 'multiple') {
        return Array.isArray(q.options) && q.options.length === 4 && typeof q.answer === 'number' && q.answer >= 0 && q.answer <= 3;
      }
      if (q.type === 'truefalse') {
        return typeof q.answer === 'boolean';
      }
      if (q.type === 'fillblank') {
        return typeof q.answer === 'string' && q.answer.trim().length > 0;
      }
      return false;
    }).map(q => ({
      type: q.type,
      question: q.question,
      ...(q.options ? { options: q.options } : {}),
      answer: q.answer,
      explanation: q.explanation,
    }));

    if (validQuestions.length === 0) {
      return res.status(422).json({ error: 'Generated quiz was malformed. Try providing clearer content.' });
    }

    res.json({ questions: validQuestions });
  } catch (err) {
    console.error('Quiz error:', err);
    res.status(500).json({ error: 'Something went wrong generating the quiz.' });
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

// -- Storage endpoints --------------------------------------------------
app.delete('/api/upload', requireAuth, async (req, res) => {
  try {
    const { blobUrl } = req.body;
    if (!blobUrl) return res.status(400).json({ error: 'blobUrl is required' });

    await deleteBlob(blobUrl);
    await deleteUsage(blobUrl);

    res.json({ success: true });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

app.get('/api/storage/usage', requireAuth, async (req, res) => {
  try {
    const usage = await getUsage(req.user.id);
    res.json(usage);
  } catch (err) {
    console.error('Storage usage error:', err);
    res.status(500).json({ error: 'Failed to fetch storage usage' });
  }
});
// Export for Vercel serverless
module.exports = app;

// Start server (only when run directly, not when imported by Vercel)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}






