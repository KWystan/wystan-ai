// ── Token management — replaces direct Supabase client ─────────────
// Stores the Supabase JWT access token in localStorage.
// All API calls that need auth read the token from here.

const TOKEN_KEY = 'wystan_access_token';
const REFRESH_KEY = 'wystan_refresh_token';

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
