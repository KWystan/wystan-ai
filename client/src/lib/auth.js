// ── Token management — replaces direct Supabase client ─────────────
// Stores the Supabase JWT access token in localStorage.
// All API calls that need auth read the token from here.

import { createClient } from '@supabase/supabase-js';

const TOKEN_KEY = 'wystan_access_token';
const REFRESH_KEY = 'wystan_refresh_token';

// Client-side Supabase instance for OAuth flow (PKCE handled via cookies)
let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      console.warn('Supabase env vars not set — OAuth login will fail');
      return null;
    }
    _supabase = createClient(url, anonKey);
  }
  return _supabase;
}

/**
 * Initiate Google OAuth from the client side.
 * This uses the Supabase browser SDK which handles PKCE automatically
 * via cookies — unlike the server-side flow where the verifier is lost.
 */
export async function signInWithGoogle() {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase not configured');

  // Store tokens before redirect so we don't clear them on page reload
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
    },
  });

  if (error) throw error;
  if (data?.url) {
    window.location.href = data.url;
    // Never returns — page navigates away
    await new Promise(() => {});
  }
  throw new Error('Failed to get OAuth URL');
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(accessToken, refreshToken) {
  if (accessToken) localStorage.setItem(TOKEN_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export function isLoggedIn() {
  return !!getToken();
}

/**
 * Parse tokens from the URL hash after an OAuth redirect.
 * Returns { access_token, refresh_token } or null.
 */
export function parseOAuthTokensFromHash() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  if (!hash || !hash.includes('access_token=')) return null;

  const params = new URLSearchParams(hash);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken) return null;

  return { accessToken, refreshToken };
}

/**
 * Fetch wrapper that adds the Authorization header when a token exists.
 * Falls back to plain fetch if no token is stored.
 */
export async function authFetch(url, options = {}) {
  const token = getToken();
  const headers = { ...options.headers };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, { ...options, headers });
  return res;
}
