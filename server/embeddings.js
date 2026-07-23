// ── TF-IDF vectorizer for study hub chunk embeddings ──────────────
// 384-dim fixed vocabulary with precomputed IDF weights.
// No external dependencies — pure JS.

const VOCABULARY = require('./vocabulary.json');

/**
 * Tokenize text into lowercase terms, stripping punctuation and
 * splitting on whitespace.
 */
function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')  // strip punctuation, keep apostrophes
    .split(/\s+/)
    .filter(t => t.length > 1);       // skip single chars (noise)
}

/**
 * Produce a 384-dim Float64Array normalized TF-IDF vector for a text string
 * using the global vocabulary + precomputed IDF weights.
 */
function vectorize(text) {
  const tokens = tokenize(text);
  const dim = VOCABULARY.length;
  const vec = new Array(dim).fill(0);

  // Map term to index for fast lookup
  const termIndex = {};
  for (let i = 0; i < dim; i++) {
    termIndex[VOCABULARY[i].term] = i;
  }

  // Count term frequencies for tokens in vocabulary
  for (const token of tokens) {
    const idx = termIndex[token];
    if (idx !== undefined) {
      vec[idx] += 1;
    }
  }

  // Apply IDF weight and normalize
  let sumSq = 0;
  for (let i = 0; i < dim; i++) {
    if (vec[i] > 0) {
      // Sub-linear TF scaling: 1 + log(tf)
      vec[i] = (1 + Math.log(vec[i])) * VOCABULARY[i].idf;
      sumSq += vec[i] * vec[i];
    }
  }

  // L2 normalize
  const norm = Math.sqrt(sumSq);
  if (norm > 0) {
    for (let i = 0; i < dim; i++) {
      vec[i] /= norm;
    }
  }

  return vec;
}

/**
 * Cosine similarity between two 384-dim vectors.
 */
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < 384; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Batch-generate semantic tags for chunks using OpenCode.
 * Sends chunks in groups of 5 to limit API calls.
 * Returns array of tag objects aligned with input chunks.
 */
async function batchTagChunks(chunks, apiKey, baseUrl) {
  if (!apiKey) return chunks.map(() => ({ concepts: [], terms: [], summary: '' }));

  const results = [];
  const BATCH_SIZE = 5;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const batchTags = await tagBatch(batch, apiKey, baseUrl);
    results.push(...batchTags);
  }

  return results;
}

async function tagBatch(batch, apiKey, baseUrl) {
  const prompt = batch.map((chunk, idx) =>
    `Chunk ${idx}: "${chunk.text.slice(0, 300)}"`
  ).join('\n\n');

  const systemPrompt = `Extract key information from each chunk and return a JSON array of objects.
For each chunk, provide:
- concepts: array of 2-5 main concepts mentioned
- terms: array of 3-8 important keywords/phrases
- summary: one-sentence summary of the chunk's content

ONLY output the JSON array. Format:
[{"concepts": ["...", "..."], "terms": ["...", "..."], "summary": "..."}]

If a chunk is too short or empty, return empty arrays and "No content" for summary.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: prompt },
  ];

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'deepseek-v4-flash-free',
        messages,
        max_tokens: 1024,
        temperature: 0.3,
        stream: false,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return batch.map(() => ({ concepts: [], terms: [], summary: '' }));

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || '';
    let tags;
    try { tags = JSON.parse(reply); } catch {
      const m = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (m) try { tags = JSON.parse(m[1]); } catch { tags = null; }
    }

    if (!Array.isArray(tags) || tags.length !== batch.length) {
      return batch.map(() => ({ concepts: [], terms: [], summary: '' }));
    }

    return tags.map(t => ({
      concepts: Array.isArray(t.concepts) ? t.concepts : [],
      terms: Array.isArray(t.terms) ? t.terms : [],
      summary: typeof t.summary === 'string' ? t.summary : '',
    }));
  } catch {
    return batch.map(() => ({ concepts: [], terms: [], summary: '' }));
  }
}

module.exports = { tokenize, vectorize, cosineSimilarity, batchTagChunks };
