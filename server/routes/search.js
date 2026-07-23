// ── Web search route ──────────────────────────────────────────────
// POST /api/search — Web search via Tavily API with 5-minute cache

const { Router } = require('express');
const { createTTLCache } = require('../cache');
const { validate, schemas } = require('../validators');
const { asyncHandler, AppError } = require('../errors');

const router = Router();

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const searchCache = createTTLCache(300_000); // 5-min TTL

/**
 * POST /api/search — Search the web via Tavily.
 * Results are cached in-memory for 5 minutes per normalized query.
 */
router.post('/', validate(schemas.search), asyncHandler(async (req, res) => {
  const { query } = req.body;

  if (!TAVILY_API_KEY) {
    throw new AppError('Web search is not configured.', 503, { log: 'Search' });
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
    throw new AppError('Search service returned an error.', 502, { log: 'Search' });
  }

  const data = await tavRes.json();
  searchCache.set(trimmed, data);
  res.set('X-Cache', 'MISS');
  res.json(data);
}));

module.exports = router;
