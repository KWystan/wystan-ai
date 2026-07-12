// ── Auth routes — signup, signin, signout, me, OAuth ──────────────

const { Router } = require('express');
const { supabaseAdmin } = require('../supabase');
const { optionalAuth, requireAuth } = require('./middleware');

const router = Router();

/* ── Sign up ────────────────────────────────────────────────────
 *  Body: { email, password }
 *  Returns: { user, session?, message? }
 *  - session is null when email confirmation is required
 *  - message guides the client UI */
router.post('/signup', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Check if an account with this email already exists
    const { data: userList, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) {
      console.error('Failed to list users:', listError);
    } else if (userList?.users?.some(u => u.email === email.toLowerCase())) {
      return res.status(409).json({ error: 'An account with this email already exists. Please sign in instead.' });
    }

    const { data, error } = await supabaseAdmin.auth.signUp({
      email,
      password,
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // If no session returned, email confirmation is required
    if (!data.session) {
      return res.json({
        user: data.user,
        session: null,
        message: 'Account created! Check your email to confirm your sign-in.',
      });
    }

    return res.json({
      user: data.user,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_in: data.session.expires_in,
      },
    });
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/* ── Sign in ────────────────────────────────────────────────────
 *  Body: { email, password }
 *  Returns: { user, session } */
router.post('/signin', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return res.status(401).json({ error: error.message });
    }

    return res.json({
      user: data.user,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_in: data.session.expires_in,
      },
    });
  } catch (err) {
    console.error('Signin error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/* ── Sign out ───────────────────────────────────────────────────
 *  Requires auth (reads token from Authorization header).
 *  Returns: { success: true } */
router.post('/signout', optionalAuth, async (req, res) => {
  try {
    if (req.accessToken) {
      await supabaseAdmin.auth.signOut(req.accessToken);
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('Signout error:', err);
    return res.json({ success: true }); // still succeed client-side
  }
});

/* ── Get current user ───────────────────────────────────────────
 *  Requires auth. Returns: { user } */
router.get('/me', optionalAuth, requireAuth, (req, res) => {
  return res.json({ user: req.user });
});

/* ── Initiate OAuth ─────────────────────────────────────────────
 *  Body: { provider, redirectTo? }
 *  Returns: { url } — the OAuth authorization URL to redirect to */
router.post('/oauth', async (req, res) => {
  try {
    const { provider } = req.body;
    if (!provider) {
      return res.status(400).json({ error: 'Provider is required (e.g., "google")' });
    }

    // Use the current request's host to build the callback URL
    const callbackUrl = `${req.protocol}://${req.get('host')}/api/auth/oauth/callback`;

    const { data, error } = await supabaseAdmin.auth.signInWithOAuth({
      provider,
      options: { redirectTo: callbackUrl },
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.json({ url: data.url });
  } catch (err) {
    console.error('OAuth error:', err);
    return res.status(500).json({ error: 'Failed to start OAuth flow' });
  }
});

/* ── OAuth callback ─────────────────────────────────────────────
 *  Supabase redirects here after the user authenticates with Google.
 *  We exchange the auth code for a session, then redirect the browser
 *  back to the client app with tokens in the URL hash. */
router.get('/oauth/callback', async (req, res) => {
  try {
    // The URL fragment containing the PKCE code is in the query params
    // Supabase redirects with ?code=xxx&state=yyy after OAuth
    const { data, error } = await supabaseAdmin.auth.exchangeCodeForSession(
      req.originalUrl
    );

    // Determine the client origin for the redirect
    const clientOrigin = `${req.protocol}://${req.get('host')}`;
    // On Vercel this is the same domain; locally it's :5000 but the
    // client is on :5173. Use the Vite proxy in dev — redirect to :5000
    // which is where the Express server lives.

    if (error || !data.session) {
      return res.redirect(`${clientOrigin}/?auth_error=${encodeURIComponent(error?.message || 'OAuth failed')}`);
    }

    // Redirect with tokens — the client reads them from the URL hash
    return res.redirect(
      `${clientOrigin}/#access_token=${data.session.access_token}&refresh_token=${data.session.refresh_token}`
    );
  } catch (err) {
    console.error('OAuth callback error:', err);
    const clientOrigin = `${req.protocol}://${req.get('host')}`;
    return res.redirect(`${clientOrigin}/?auth_error=OAuth+callback+failed`);
  }
});

module.exports = router;
