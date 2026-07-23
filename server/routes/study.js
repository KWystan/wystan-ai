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
 * Body: { text: "..." }
 * Returns: { cards: [{ question, answer }] }
 */
router.post('/flashcards', validate(schemas.flashcard), asyncHandler(async (req, res) => {
  const { text: sourceText } = req.body;

  // Truncate to prevent excessive token use (and avoid splitting multi-byte chars)
  const truncatedText = sourceText.slice(0, 15000).replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '');

  const messages = [
    { role: 'system', content: FLASHCARD_SYSTEM_PROMPT },
    { role: 'user', content: "Generate flashcards from the following material:\n\n" + truncatedText },
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

module.exports = router;
