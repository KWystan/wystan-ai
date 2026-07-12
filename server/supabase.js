// ── Server-side Supabase client (CommonJS) ──────────────────────────
// Uses new-style keys (SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY /
// SUPABASE_SECRET_KEY) as recommended by @supabase/server.
//
// - supabaseAdmin  → secret key, bypasses RLS (server-side ops)
// - createUserClient(token) → publishable key + user JWT, respects RLS
// - verifyToken(token) → validates a JWT and returns the user

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey || !supabasePublishableKey) {
  console.warn(
    'Missing Supabase env vars (SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY). Server-side Supabase is disabled.'
  );
}

/** Admin client — bypasses RLS, uses the secret key. */
const supabaseAdmin = createClient(supabaseUrl || '', supabaseSecretKey || '', {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Create a user-scoped client (respects RLS).
 * Uses the publishable key + the user's access token.
 */
function createUserClient(accessToken) {
  return createClient(supabaseUrl || '', supabasePublishableKey || '', {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Verify a JWT access token and return the user.
 * Returns { user, error } — error is null if valid.
 */
async function verifyToken(accessToken) {
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
    if (error) return { user: null, error };
    return { user: data.user, error: null };
  } catch (err) {
    return { user: null, error: err };
  }
}

module.exports = { supabaseAdmin, createUserClient, verifyToken };
