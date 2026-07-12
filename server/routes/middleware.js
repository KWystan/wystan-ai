// ── Auth middleware for Express routes ──────────────────────────────

const { createUserClient, verifyToken } = require('../supabase');

/**
 * Optional auth — decorates req.user / req.supabase when a valid
 * Bearer token is present. Never blocks unauthenticated requests.
 */
async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    req.supabase = null;
    return next();
  }

  const token = authHeader.slice(7);
  try {
    const { user, error } = await verifyToken(token);
    if (error || !user) {
      req.user = null;
      req.supabase = null;
      return next();
    }
    req.user = user;
    req.supabase = createUserClient(token);
    req.accessToken = token;
  } catch {
    req.user = null;
    req.supabase = null;
  }
  next();
}

/**
 * Required auth — blocks requests without a valid authenticated user.
 * Must be used AFTER optionalAuth (relies on req.user).
 */
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

module.exports = { optionalAuth, requireAuth };
