// ── Storage usage route ───────────────────────────────────────────
// GET /api/storage/usage — Fetch the authenticated user's storage usage

const { Router } = require('express');
const { getUsage } = require('../storage');
const { asyncHandler } = require('../errors');

// Auth middleware — gracefully unavailable when Supabase isn't installed
let requireAuth;
try {
  const mw = require('./middleware');
  requireAuth = mw.requireAuth;
} catch {
  // Supabase not available — auth middleware stays undefined
}

const router = Router();

/**
 * GET /api/storage/usage — Get storage usage for the authenticated user.
 */
router.get('/usage', requireAuth, asyncHandler(async (req, res) => {
  const usage = await getUsage(req.user.id);
  res.json(usage);
}));

module.exports = router;
