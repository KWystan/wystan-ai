// ── Study tool routes (flashcards + quiz) ─────────────────────────
// POST /api/flashcards — AI flashcard generation via OpenCode
// POST /api/quiz       — AI quiz generation via OpenCode

const { Router } = require('express');

const { validate, schemas } = require('../validators');
const { asyncHandler, AppError } = require('../errors');

const router = Router();

// ── OpenCode config ──────────────────────────────────────────────
const OPENCODE_API_KEY = process.env.OPENCODE_API_KEY;
const OPENCODE_BASE_URL = process.env.OPENCODE_BASE_URL || 'https://opencode.ai/zen/v1';
const MODELS = ['mimo-v2.5-free', 'deepseek-v4-flash-free', 'north-mini-code-free'];
const FETCH_TIMEOUT = 60000; // 60s upstream timeout
const MAX_RETRIES = 3;

// ── System prompts ───────────────────────────────────────────────

/**
 * Build a flashcard system prompt tailored to the requested card style,
 * difficulty, orientation, and count.
 */
function buildFlashcardPrompt(style, difficulty, orientation, count) {
  const countStr = `Generate between 5 and ${count} flashcards depending on material density. Don't pad.`;

  const styleRules = {
    'term-definition': `Each card pairs a KEY TERM (question) with its DEFINITION (answer).
  - question: the term or phrase (≤ 12 words)
  - answer: a concise definition (≤ 30 words)`,
    'question-answer': `Each card pairs a QUESTION (question) with its ANSWER (answer).
  - question: a clear, specific question (≤ 15 words)
  - answer: a complete but concise answer (≤ 30 words)`,
    'cloze': `Each card has a FILL-IN-THE-BLANK statement (question) with the missing WORD(S) (answer).
  - question: a sentence or phrase with ___ where the blank goes
  - answer: the exact word(s) that fill the blank`,
    'concept-example': `Each card pairs a CONCEPT (question) with a concrete EXAMPLE (answer).
  - question: the concept name or idea (≤ 12 words)
  - answer: a specific, real-world example (≤ 30 words)`,
  };

  const diffRules = {
    recap: 'Focus on surface-level recall: key terms, names, dates, and one-sentence definitions. Keep every answer to a single fact.',
    review: 'Balanced recall and understanding. Include definitions, explanations of processes, and cause-effect relationships.',
    master: 'Demand synthesis. Questions should require connecting two or more concepts. Answers should explain the relationship, not just state it.',
  };

  const orientRule = orientation === 'back-front'
    ? 'IMPORTANT — Swapped orientation: the "question" field holds the definition/answer/example, and the "answer" field holds the term/question/concept.'
    : 'The "question" field holds the term/question/concept; the "answer" field holds the definition/answer/example.';

  return `You are a study-materials formatter. Turn raw notes into flashcards that mirror the source — do not rewrite the source's vocabulary.

OUTPUT: a JSON array of flashcard objects. ONLY the array. No prose, no fences, no markdown.

Hard rules:
- Mirror the source's wording. If the PDF says "mitochondria", write "mitochondria", not "cellular organelles".
- Every card must have a "question" and an "answer" field.
- Never invent facts. If the source is too thin to extract enough material, return fewer cards.
- Return ONLY the JSON array. Nothing else.

${countStr}

Card style:
${styleRules[style] || styleRules['term-definition']}

Difficulty:
${diffRules[difficulty] || diffRules.review}

${orientRule}

Example output format:
[{"question": "What does ATP stand for?", "answer": "Adenosine triphosphate, the cell's main energy currency."}]`;
}

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

/**
 * Call the upstream OpenCode API with retry for transient failures.
 * Returns parsed JSON on success; throws AppError on failure.
 */
async function callUpstream(messages, label = 'Generation') {
  const apiKey = OPENCODE_API_KEY;
  if (!apiKey) {
    throw new AppError(`${label} is not configured.`, 503, { log: label });
  }

  const upstreamUrl = `${OPENCODE_BASE_URL}/chat/completions`;
  let lastError;

  // Try each model in order, with retries per model
  for (const model of MODELS) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

      try {
        const apiRes = await fetch(upstreamUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            messages,
            max_tokens: 8192,
            temperature: 0.5,
            top_p: 0.9,
            stream: false,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (apiRes.ok) {
          const data = await apiRes.json();
          const reply = data.choices?.[0]?.message?.content || '';
          return reply;
        }

        // Retry on 5xx (server errors); fail immediately on 4xx (client errors)
        const errText = await apiRes.text();
        lastError = { status: apiRes.status, text: errText, model };

        if (apiRes.status < 500) {
          // Client error (4xx) — don't retry this model, try next model
          console.error(`${label} ${apiRes.status} on ${model}:`, errText.slice(0, 200));
          break; // break retry loop, continue to next model
        }

        // 5xx — log and retry with backoff
        console.error(`${label} 5xx on ${model} (attempt ${attempt}/${MAX_RETRIES}):`, apiRes.status, errText.slice(0, 200));
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, attempt * 1000)); // 1s, 2s, 3s backoff
        }
      } catch (err) {
        clearTimeout(timeout);

        if (err instanceof AppError) throw err;
        if (err.name === 'AbortError') {
          lastError = { status: 504, text: 'Upstream request timed out after 60s.', model };
          console.error(`${label} timeout on ${model} (attempt ${attempt}/${MAX_RETRIES})`);
        } else {
          lastError = { status: 502, text: err.message, model };
          console.error(`${label} fetch error on ${model} (attempt ${attempt}/${MAX_RETRIES}):`, err.message);
        }
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, attempt * 1000));
        }
      }
    }
    // If we got a 4xx on this model, try the next one
  }

  // All models + retries exhausted
  let details = `${label} service is temporarily unavailable. Please try again.`;
  if (lastError) {
    const { text, model } = lastError;
    try { const parsed = JSON.parse(text); details = parsed.error?.message || parsed.message || parsed.error || details; } catch { details = text.slice(0, 200) || details; }
    details = `[${model}] ${details}`;
  }
  throw new AppError(details, 502, { log: label });
}

/**
 * Extract JSON from an LLM response string with multiple fallback strategies.
 * Returns parsed JSON or null.
 */
function extractJSON(reply) {
  // Strategy 1: Try direct parse (works when model returns pure JSON)
  try { return JSON.parse(reply); } catch { /* fall through */ }

  // Strategy 2: Extract from markdown code fence (```json ... ```)
  const fenceMatch = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1]); } catch { /* fall through */ }
  }

  // Strategy 3: Find the first `[` or `{` and last matching `]` or `}` in the response.
  // Handles cases where the model adds explanatory text around the JSON.
  const jsonStart = reply.indexOf('[');
  const objStart = reply.indexOf('{');

  if (jsonStart !== -1 || objStart !== -1) {
    const start = jsonStart !== -1 ? jsonStart : objStart;
    const openBrace = reply[start];
    const closeBrace = openBrace === '[' ? ']' : '}';

    // Walk backward from the end to find the matching closing brace
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < reply.length; i++) {
      const ch = reply[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"') inString = !inString;
      if (inString) continue;
      if (ch === openBrace) depth++;
      if (ch === closeBrace) depth--;
      if (depth === 0) {
        try { return JSON.parse(reply.slice(start, i + 1)); } catch { return null; }
      }
    }
  }

  return null;
}

/**
 * POST /api/flashcards — Generate flashcards from text.
 * Body: { text, cardStyle?, difficulty?, count?, orientation? }
 * Returns: { cards: [{ question, answer }] }
 */
router.post('/flashcards', validate(schemas.flashcard), asyncHandler(async (req, res) => {
  const { text: sourceText, cardStyle, difficulty, count, orientation, rerollFor } = req.body;

  // Truncate to prevent excessive token use (and avoid splitting multi-byte chars)
  const truncatedText = sourceText.slice(0, 15000).replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '');

  // Build a tailored system prompt from the config params
  const systemPrompt = buildFlashcardPrompt(
    cardStyle || 'term-definition',
    difficulty || 'review',
    orientation || 'front-back',
    count || 10,
  );

  // When re-rolling a single card, include context about which card to replace
  const rerollHint = rerollFor
    ? `\n\nNOTE — This is a re-roll request. The user wants to REPLACE the following card with a fresh one on the same topic but with different wording. Generate a FULL set of flashcards; the new version of this card should use different phrasing, examples, or perspective:\nPrevious card — "${rerollFor.question}" / "${rerollFor.answer}"`
    : '';

  const userPrompt = `Generate flashcards from the following material. Follow the card style, difficulty, orientation, and count specified in the system prompt.${rerollHint}\n\nMaterial:\n${truncatedText}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  // Call upstream with retry logic
  const reply = await callUpstream(messages, 'Flashcard');

  if (!reply) {
    throw new AppError('Empty response from AI service.', 502, { log: 'Flashcard' });
  }

  // Parse with multiple fallback strategies
  let cards = extractJSON(reply);

  if (!cards || !Array.isArray(cards) || cards.length === 0) {
    // Log the raw response for debugging
    console.error('Flashcard parse failure — raw reply:', reply.slice(0, 500));
    throw new AppError('We couldn\'t generate flashcards from that content. The AI response was in an unexpected format. Try again or adjust the text.', 422, { log: 'Flashcard' });
  }

  // Validate each card has the required fields
  cards = cards.filter(c => c.question && c.answer).map(c => ({
    question: String(c.question),
    answer: String(c.answer),
  }));

  if (cards.length === 0) {
    console.error('Flashcard validation failure — cards lacked question/answer fields:', JSON.stringify(cards).slice(0, 300));
    throw new AppError('Generated cards were malformed. Try providing clearer content.', 422, { log: 'Flashcard' });
  }

  res.json({ cards });
}));

/**
 * POST /api/quiz — Generate a quiz from text.
 * Body: { text, type, count, difficulty }
 * Returns: { questions: [...] }
 */
router.post('/quiz', validate(schemas.quiz), asyncHandler(async (req, res) => {
  const { text: sourceText, type = 'mixed', count = 10, difficulty = 'medium' } = req.body;

  const questionCount = Math.max(5, Math.min(20, parseInt(count, 10) || 10));
  const validTypes = ['multiple', 'truefalse', 'fillblank', 'mixed'];
  if (!validTypes.includes(type)) {
    throw new AppError('Invalid quiz type.', 400, { log: 'Quiz' });
  }

  // Avoid splitting multi-byte chars
  const truncatedText = sourceText.slice(0, 15000).replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '');

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

  // Call upstream with retry logic (same as flashcard)
  const reply = await callUpstream(messages, 'Quiz');

  if (!reply) {
    throw new AppError('Empty response from AI service.', 502, { log: 'Quiz' });
  }

  // Parse with multiple fallback strategies
  let parsed = extractJSON(reply);
  // Quiz expects an object { questions: [...] }, not a bare array
  if (Array.isArray(parsed)) {
    parsed = { questions: parsed };
  }

  if (!parsed || !parsed.questions || !Array.isArray(parsed.questions)) {
    console.error('Quiz parse failure — raw reply:', reply.slice(0, 500));
    throw new AppError('We couldn\'t generate a valid quiz from that content. Try adjusting the text or providing a clearer topic.', 422, { log: 'Quiz' });
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
    console.error('Quiz validation failure — questions lacked required fields:', JSON.stringify(parsed.questions).slice(0, 300));
    throw new AppError('Generated quiz was malformed. Try providing clearer content.', 422, { log: 'Quiz' });
  }

  res.json({ questions: validQuestions });
}));

// ── Study Hub RAG routes ──────────────────────────────────────────
// POST /api/study/sources  — Create source from extracted text
// GET  /api/study/sources  — List user's sources
// PATCH /api/study/sources/:id — Update source
// DELETE /api/study/sources/:id — Delete source
// GET  /api/study/chunks/:id — Get single chunk for preview
// POST /api/study/chat    — RAG-augmented streaming chat
// POST /api/study/tools/flashcards — Generate flashcards
// POST /api/study/tools/quiz       — Generate quiz
// POST /api/study/tools/summary    — Generate summary

const vectorStore = require('../vectorStore');
const studyHubRouter = Router();

/**
 * Build a RAG system prompt with source excerpts for grounded chat.
 */
function buildRagPrompt(chunks) {
  const excerpts = chunks.map((c, i) =>
    `[${i + 1}] Source: ${c.file_name || 'Unknown'}, page ${c.page_number || '?'}\n${c.raw_text}`
  ).join('\n\n');

  return `You are a study assistant. Answer the user's question using ONLY the provided source excerpts below.

SOURCE EXCERPTS:
${excerpts}

RULES:
- When you reference information from a source, attach a citation tag: [Source: filename, p. X]
- Use the exact filenames and page numbers from the excerpts
- If the answer is not in the excerpts, respond with: "I couldn't find that in your sources. Try rephrasing or adding more materials."
- Do not invent facts or page numbers
- If you are unsure, say so`;
}

/**
 * Call upstream (NVIDIA if model contains '/', else OpenCode) with SSE streaming.
 * Re-emits normalized SSE lines: data: {"content":"..."}
 */
async function callStreamingUpstream(messages, model, res) {
  const apiKey = process.env.OPENCODE_API_KEY;
  const baseUrl = process.env.OPENCODE_BASE_URL || 'https://opencode.ai/zen/v1';

  let upstreamUrl, headers;
  if (model && model.includes('/')) {
    // NVIDIA NIM
    const nvidiaKey = process.env.NVIDIA_API_KEY;
    if (!nvidiaKey) throw new AppError('NVIDIA API key not configured.', 503);
    upstreamUrl = 'https://ai.api.nvidia.com/v1/chat/completions';
    headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${nvidiaKey}`,
    };
  } else {
    if (!apiKey) throw new AppError('OpenCode API key not configured.', 503);
    upstreamUrl = `${baseUrl}/chat/completions`;
    headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };
  }

  const apiRes = await fetch(upstreamUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: model || 'deepseek-v4-flash-free',
      messages,
      max_tokens: 4096,
      temperature: 0.7,
      stream: true,
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!apiRes.ok) {
    const errText = await apiRes.text();
    throw new AppError(`Upstream error: ${errText.slice(0, 200)}`, 502);
  }

  const reader = apiRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();

      if (payload === '[DONE]') {
        res.write(`data: [DONE]\n\n`);
        return;
      }

      try {
        const parsed = JSON.parse(payload);
        const content = parsed.choices?.[0]?.delta?.content || '';
        if (content) {
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      } catch {
        // skip unparseable lines
      }
    }
  }

  res.write(`data: [DONE]\n\n`);
}

/**
 * Generate non-streaming JSON from upstream (for tools).
 */
async function callUpstreamJSON(messages, model) {
  const apiKey = process.env.OPENCODE_API_KEY;
  const baseUrl = process.env.OPENCODE_BASE_URL || 'https://opencode.ai/zen/v1';

  if (!apiKey) throw new AppError('OpenCode API key not configured.', 503);

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model || 'mimo-v2.5-free',
      messages,
      max_tokens: 4096,
      temperature: 0.3,
      stream: false,
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new AppError(`Upstream error: ${errText.slice(0, 200)}`, 502);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * POST /api/study/sources — Create source from extracted text chunks.
 * Body: { fileName, fileType, pages: [{ text, pageNumber }] }
 */
studyHubRouter.post('/sources', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const { fileName, fileType, pages } = req.body;
  if (!fileName || !pages || !pages.length) {
    return res.status(400).json({ error: 'fileName and pages are required' });
  }

  try {
    const source = await vectorStore.addSource(userId, fileName, fileType || 'text', pages);
    res.status(201).json(source);
  } catch (err) {
    console.error('Failed to add source:', err);
    res.status(500).json({ error: 'Failed to process source' });
  }
}));

/**
 * GET /api/study/sources — List user's sources.
 */
studyHubRouter.get('/sources', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const sources = await vectorStore.listSources(userId);
  res.json(sources);
}));

/**
 * PATCH /api/study/sources/:id — Update source (active, file_name).
 */
studyHubRouter.patch('/sources/:id', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const source = await vectorStore.updateSource(userId, req.params.id, req.body);
  if (!source) return res.status(404).json({ error: 'Source not found' });
  res.json(source);
}));

/**
 * DELETE /api/study/sources/:id — Remove source + chunks.
 */
studyHubRouter.delete('/sources/:id', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  await vectorStore.deleteSource(userId, req.params.id);
  res.json({ success: true });
}));

/**
 * GET /api/study/chunks/:id — Get single chunk for citation preview.
 */
studyHubRouter.get('/chunks/:id', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const chunk = await vectorStore.getChunk(req.params.id);
  if (!chunk) return res.status(404).json({ error: 'Chunk not found' });

  // Verify chunk belongs to this user
  const source = await vectorStore.getSource(userId, chunk.source_id);
  if (!source) return res.status(404).json({ error: 'Chunk not found' });

  res.json(chunk);
}));

/**
 * POST /api/study/chat — RAG-augmented streaming chat with citations.
 * Body: { prompt, activeSourceIds, model? }
 */
studyHubRouter.post('/chat', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const { prompt, activeSourceIds, model } = req.body;
  if (!prompt || !activeSourceIds?.length) {
    return res.status(400).json({ error: 'prompt and activeSourceIds are required' });
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    // 1. Retrieve relevant chunks
    const chunks = await vectorStore.search(userId, prompt, activeSourceIds, 6);
    if (!chunks.length) {
      res.write(`data: ${JSON.stringify({ content: "I couldn't find that in your sources. Try adding more materials or rephrasing your question." })}\n\n`);
      res.write(`data: [DONE]\n\n`);
      return res.end();
    }

    // 2. Build RAG prompt
    const systemPrompt = buildRagPrompt(chunks);

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ];

    // 3. Stream response
    await callStreamingUpstream(messages, model, res);

    // 4. Send citations metadata after content
    const citations = chunks.map(c => ({
      chunkId: c.id,
      fileName: c.file_name || 'Unknown',
      pageNumber: c.page_number,
    }));
    res.write(`data: ${JSON.stringify({ citations })}\n\n`);
    res.write(`data: [DONE]\n\n`);
  } catch (err) {
    console.error('Study chat error:', err);
    res.write(`data: ${JSON.stringify({ error: 'Failed to generate response' })}\n\n`);
    res.write(`data: [DONE]\n\n`);
  }

  res.end();
}));

/**
 * POST /api/study/tools/flashcards — Generate flashcards from active sources.
 * Body: { activeSourceIds, chatHistory?, count? }
 */
studyHubRouter.post('/tools/flashcards', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const { activeSourceIds, count = 10 } = req.body;
  if (!activeSourceIds?.length) {
    return res.status(400).json({ error: 'activeSourceIds is required' });
  }

  // Aggregate text from sources
  const supabase = require('../supabase').supabaseAdmin;
  const { data: allChunks } = await supabase
    .from('chunks')
    .select('raw_text')
    .in('source_id', activeSourceIds);

  const aggText = (allChunks || []).map(c => c.raw_text).join('\n').slice(0, 15000);

  if (!aggText.trim()) {
    return res.status(400).json({ error: 'No content in active sources' });
  }

  const systemPrompt = `You are a study-materials formatter. Turn the provided content into flashcards.

OUTPUT: a JSON array of flashcard objects with "question" and "answer" fields. ONLY the array. No prose, no fences, no markdown.

Hard rules:
- Mirror the source's wording. If the content says "mitochondria", write "mitochondria", not "cellular organelles".
- Every card must have a "question" and an "answer" field.
- Never invent facts. If the content is too thin, return fewer cards.
- Return ONLY the JSON array. Nothing else.

Generate ${count} cards, but don't pad if there's insufficient material.`;

  const userPrompt = `Generate flashcards from the following study material:\n\n${aggText}`;

  try {
    const reply = await callUpstreamJSON([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], 'mimo-v2.5-free');

    // Parse JSON
    let cards = extractJSON(reply);
    if (!Array.isArray(cards)) cards = [];
    cards = cards.filter(c => c.question && c.answer).map(c => ({
      question: String(c.question),
      answer: String(c.answer),
    }));

    res.json({ cards });
  } catch (err) {
    console.error('Flashcard generation error:', err);
    res.status(502).json({ error: 'Failed to generate flashcards' });
  }
}));

/**
 * POST /api/study/tools/quiz — Generate quiz from active sources + chat history.
 */
studyHubRouter.post('/tools/quiz', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const { activeSourceIds, chatHistory, count = 10 } = req.body;
  if (!activeSourceIds?.length) {
    return res.status(400).json({ error: 'activeSourceIds is required' });
  }

  const supabase = require('../supabase').supabaseAdmin;
  const { data: allChunks } = await supabase
    .from('chunks')
    .select('raw_text')
    .in('source_id', activeSourceIds);

  const aggText = (allChunks || []).map(c => c.raw_text).join('\n').slice(0, 15000);

  if (!aggText.trim()) {
    return res.status(400).json({ error: 'No content in active sources' });
  }

  const historyContext = (chatHistory || [])
    .map(m => `${m.role}: ${m.content.slice(0, 500)}`).join('\n');

  const systemPrompt = `You are a quiz generator. Generate a quiz based on the provided study material and conversation history.

CRITICAL: Return ONLY a valid JSON object with a "questions" array. No markdown, no code fences, no other text.

Each question object must match one of these exact shapes:

1. Multiple choice: { "type": "multiple", "question": "...", "options": ["A", "B", "C", "D"], "answer": 0, "explanation": "..." }
2. True/False: { "type": "truefalse", "question": "...", "answer": true, "explanation": "..." }
3. Fill in the blank: { "type": "fillblank", "question": "The ___ is ...", "answer": "word", "explanation": "..." }

Generate ${count} questions. Mix types for variety.`;

  const userPrompt = `Study material:\n${aggText}\n\n${historyContext ? `Recent conversation:\n${historyContext}\n\n` : ''}Generate a quiz from this material.`;

  try {
    const reply = await callUpstreamJSON([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], 'mimo-v2.5-free');

    let parsed = extractJSON(reply);
    if (Array.isArray(parsed)) parsed = { questions: parsed };

    const validQuestions = (parsed?.questions || []).filter(q =>
      q.type && q.question && q.explanation &&
      (q.type === 'multiple' ? q.options?.length === 4 && typeof q.answer === 'number' :
       q.type === 'truefalse' ? typeof q.answer === 'boolean' :
       q.type === 'fillblank' ? typeof q.answer === 'string' : false)
    );

    res.json({ questions: validQuestions });
  } catch (err) {
    console.error('Quiz generation error:', err);
    res.status(502).json({ error: 'Failed to generate quiz' });
  }
}));

/**
 * POST /api/study/tools/summary — Generate summary from active sources.
 */
studyHubRouter.post('/tools/summary', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const { activeSourceIds } = req.body;
  if (!activeSourceIds?.length) {
    return res.status(400).json({ error: 'activeSourceIds is required' });
  }

  const supabase = require('../supabase').supabaseAdmin;
  const { data: allChunks } = await supabase
    .from('chunks')
    .select('raw_text, page_number, source_id')
    .in('source_id', activeSourceIds);

  const aggText = (allChunks || []).map(c => c.raw_text).join('\n').slice(0, 15000);

  if (!aggText.trim()) {
    return res.status(400).json({ error: 'No content in active sources' });
  }

  const systemPrompt = `You are a study material summarizer. Generate a structured summary from the provided content.

Return a JSON object:
{
  "title": "Summary title",
  "items": [
    { "text": "Key point or concept", "pageReferences": [1, 3] },
    ...
  ]
}

Rules:
- Extract 5-15 key points covering the main concepts
- Each point should be 1-2 sentences
- Include page references where applicable
- ONLY return the JSON. No markdown, no fences.`;

  try {
    const reply = await callUpstreamJSON([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Summarize this material:\n\n${aggText}` },
    ], 'mimo-v2.5-free');

    let parsed = extractJSON(reply);
    if (parsed && Array.isArray(parsed.items)) {
      // Keep as-is
    } else if (Array.isArray(parsed)) {
      parsed = { title: 'Summary', items: parsed };
    } else {
      throw new Error('Invalid summary format');
    }

    res.json(parsed);
  } catch (err) {
    console.error('Summary generation error:', err);
    res.status(502).json({ error: 'Failed to generate summary' });
  }
}));

module.exports = router;
module.exports.studyHubRouter = studyHubRouter;
