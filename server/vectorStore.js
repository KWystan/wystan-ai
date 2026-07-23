// ── pgvector-backed chunk store for study hub ────────────────────
// Each user's sources and chunks live in Supabase with RLS.
// Embeddings are 384-dim arrays converted to PostgreSQL vector format.

const { supabaseAdmin } = require('./supabase');
const { vectorize, batchTagChunks } = require('./embeddings');

const OPENCODE_API_KEY = process.env.OPENCODE_API_KEY;
const OPENCODE_BASE_URL = process.env.OPENCODE_BASE_URL || 'https://opencode.ai/zen/v1';

/**
 * Upload a source: extract text, chunk it, embed each chunk, tag,
 * insert source + chunks. Returns the source row.
 *
 * @param {string} userId - Supabase user UUID
 * @param {string} fileName - Original file name
 * @param {string} fileType - File extension/type
 * @param {Array<{text: string, pageNumber?: number}>} pages - Extracted text pages
 * @returns {Promise<Object>} Source row with chunk_count
 */
async function addSource(userId, fileName, fileType, pages) {
  if (!supabaseAdmin) throw new Error('Supabase not configured');

  // 1. Insert source row
  const { data: source, error: srcErr } = await supabaseAdmin
    .from('sources')
    .insert({ user_id: userId, file_name: fileName, file_type: fileType, chunk_count: 0, active: true })
    .select()
    .single();

  if (srcErr || !source) throw new Error(`Failed to create source: ${srcErr?.message}`);

  // 2. Chunk into segments with overlap
  const textChunks = chunkText(pages, 500, 50);

  if (textChunks.length === 0) {
    // No chunks to insert — update count and return
    await supabaseAdmin.from('sources').update({ chunk_count: 0 }).eq('id', source.id);
    return { ...source, chunk_count: 0 };
  }

  // 3. Vectorize each chunk (TF-IDF)
  const embeddings = textChunks.map(c => vectorize(c.text));

  // 4. Tag each chunk (OpenCode, in batches)
  const tags = await batchTagChunks(textChunks, OPENCODE_API_KEY, OPENCODE_BASE_URL);

  // 5. Build chunk rows
  const chunkRows = textChunks.map((c, i) => ({
    source_id: source.id,
    page_number: c.pageNumber,
    raw_text: c.text,
    embedding: embeddings[i],  // pgvector accepts JS arrays
    tags: tags[i] || { concepts: [], terms: [], summary: '' },
  }));

  // 6. Bulk insert
  const { error: chunkErr } = await supabaseAdmin.from('chunks').insert(chunkRows);
  if (chunkErr) throw new Error(`Failed to insert chunks: ${chunkErr.message}`);

  // 7. Update chunk count
  await supabaseAdmin.from('sources').update({ chunk_count: textChunks.length }).eq('id', source.id);

  return { ...source, chunk_count: textChunks.length };
}

/**
 * Internal: split extracted text into overlapping chunks.
 * Chunk boundary-aware — splits on paragraph breaks first, then sentence breaks.
 *
 * @param {Array<{text: string, pageNumber?: number}>} pages
 * @param {number} maxLen - Maximum chunk length in characters
 * @param {number} overlap - Overlap between adjacent chunks
 * @returns {Array<{text: string, pageNumber?: number}>}
 */
function chunkText(pages, maxLen, overlap) {
  const results = [];

  for (const page of pages) {
    let remaining = page.text;

    while (remaining.length > 0) {
      // Trim whitespace
      remaining = remaining.trim();
      if (!remaining) break;

      if (remaining.length <= maxLen) {
        results.push({ text: remaining, pageNumber: page.pageNumber });
        break;
      }

      // Try to cut at a paragraph break within maxLen
      let cut = remaining.lastIndexOf('\n\n', maxLen);
      if (cut < maxLen / 2) cut = remaining.lastIndexOf('. ', maxLen);
      if (cut < maxLen / 2) cut = remaining.lastIndexOf(' ', maxLen);
      if (cut < 50) cut = maxLen; // hard cut

      results.push({ text: remaining.slice(0, cut).trim(), pageNumber: page.pageNumber });
      remaining = remaining.slice(Math.max(0, cut - overlap));
    }
  }

  return results;
}

/**
 * Search chunks by cosine similarity + semantic reranking.
 * Returns top K chunks with metadata.
 *
 * @param {string} userId
 * @param {string} query
 * @param {string[]} activeSourceIds
 * @param {number} topK
 * @returns {Promise<Array>}
 */
async function search(userId, query, activeSourceIds, topK = 6) {
  if (!supabaseAdmin) throw new Error('Supabase not configured');

  // 1. Embed the query
  const queryVec = vectorize(query);

  // 2. pgvector cosine search via RPC
  const { data: candidates, error } = await supabaseAdmin.rpc('search_chunks', {
    p_user_id: userId,
    p_source_ids: activeSourceIds,
    p_embedding: queryVec,
    p_top_k: 20,
  });

  if (error) {
    console.error('pgvector search RPC failed, falling back to sequential scan:', error.message);
    // Fallback: sequential scan
    const { data: fallback, error: fbErr } = await supabaseAdmin
      .from('chunks')
      .select('id, source_id, page_number, raw_text, tags')
      .in('source_id', activeSourceIds)
      .limit(50);

    if (fbErr || !fallback) return [];
    return rerankChunks(fallback, query, queryVec, topK);
  }

  return rerankChunks(candidates || [], query, queryVec, topK);
}

/**
 * Rerank chunks: combine vector cosine score + tag overlap score.
 * Score = 0.7 * vector + 0.3 * tag_overlap
 */
function rerankChunks(chunks, query, queryVec, topK) {
  const queryTerms = new Set(
    query.toLowerCase().split(/\s+/).filter(t => t.length > 2)
  );
  const scored = chunks.map(chunk => {
    // Vector score (pgvector returns distance, invert to similarity)
    const vecScore = chunk.vector_score !== undefined ? chunk.vector_score : 0.5;

    // Tag overlap score: fraction of query tokens that appear in tags or text
    const text = (chunk.raw_text || '').toLowerCase();
    const tags = chunk.tags || {};
    const tagText = [
      ...(Array.isArray(tags.concepts) ? tags.concepts : []),
      ...(Array.isArray(tags.terms) ? tags.terms : []),
      tags.summary || '',
    ].join(' ').toLowerCase();

    let overlap = 0;
    for (const term of queryTerms) {
      if (text.includes(term) || tagText.includes(term)) overlap++;
    }
    const tagScore = queryTerms.size > 0 ? overlap / queryTerms.size : 0;

    // Combined: 70% vector, 30% tag
    const combined = 0.7 * vecScore + 0.3 * tagScore;

    return { ...chunk, score: combined };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/**
 * List sources for a user.
 */
async function listSources(userId) {
  if (!supabaseAdmin) return [];
  const { data, error } = await supabaseAdmin
    .from('sources')
    .select('id, file_name, file_type, chunk_count, active, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to list sources: ${error.message}`);
  return data || [];
}

/**
 * Get a single source.
 */
async function getSource(userId, sourceId) {
  const { data, error } = await supabaseAdmin
    .from('sources')
    .select('id, file_name, file_type, chunk_count, active, created_at')
    .eq('id', sourceId)
    .eq('user_id', userId)
    .single();

  if (error) return null;
  return data;
}

/**
 * Update source (active, file_name).
 */
async function updateSource(userId, sourceId, updates) {
  const allowed = {};
  if (updates.active !== undefined) allowed.active = updates.active;
  if (updates.file_name !== undefined) allowed.file_name = updates.file_name;

  const { data, error } = await supabaseAdmin
    .from('sources')
    .update(allowed)
    .eq('id', sourceId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update source: ${error.message}`);
  return data;
}

/**
 * Delete a source and its chunks (cascade via DB FK).
 */
async function deleteSource(userId, sourceId) {
  const { error } = await supabaseAdmin
    .from('sources')
    .delete()
    .eq('id', sourceId)
    .eq('user_id', userId);

  if (error) throw new Error(`Failed to delete source: ${error.message}`);
}

/**
 * Get single chunk by id (for citation pill preview).
 */
async function getChunk(chunkId) {
  const { data, error } = await supabaseAdmin
    .from('chunks')
    .select('id, source_id, page_number, raw_text')
    .eq('id', chunkId)
    .single();

  if (error) return null;
  return data;
}

module.exports = {
  addSource, listSources, getSource, updateSource, deleteSource, search, getChunk,
};
