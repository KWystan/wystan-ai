import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authFetch, getToken, clearTokens, setTokens, parseOAuthTokensFromHash, signInWithGoogle } from './auth';

const AppContext = createContext(null);

/* ── Shared auth modal ────────────────────────────────────────── */
function AuthModal({ state, onClose }) {
  const { setUser } = useApp(); // need setUser from context for post-login
  const [mode, setMode] = useState(state?.mode || 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  useEffect(() => {
    setMode(state?.mode || 'login');
    setEmail('');
    setPassword('');
    setError(null);
    setSuccessMsg(null);
  }, [state?.mode]);

  const handleClose = () => {
    onClose();
    setError(null);
    setSuccessMsg(null);
    setEmail('');
    setPassword('');
  };

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/10 flex items-center justify-center p-4"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-black/8 p-6"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'scale-in 0.15s var(--ease-out-expo) both' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-black">
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </h2>
          <button
            onClick={handleClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-black hover:text-black active:scale-[0.97] transition-all duration-150"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Google OAuth */}
        <button
          onClick={async () => {
            setLoading(true);
            setError(null);
            try {
              await signInWithGoogle();
            } catch (err) {
              setError(err.message);
              setLoading(false);
            }
          }}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl border border-black/10 text-sm text-black hover:border-black/25 hover:text-black active:scale-[0.98] transition-all duration-150 disabled:opacity-40"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          {loading ? 'Connecting...' : 'Continue with Google'}
        </button>

        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 border-t border-black/8" />
          <span className="text-[11px] text-black uppercase tracking-wider">or</span>
          <div className="flex-1 border-t border-black/8" />
        </div>

        <div className="space-y-3">
          <div>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white text-black text-sm rounded-xl px-3.5 py-2.5 outline-none placeholder:text-black border border-black/10 focus:border-black/25 transition-all duration-150"
            />
          </div>
          <div>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') document.getElementById('auth-submit')?.click(); }}
              className="w-full bg-white text-black text-sm rounded-xl px-3.5 py-2.5 outline-none placeholder:text-black border border-black/10 focus:border-black/25 transition-all duration-150"
            />
          </div>

          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[11px] text-red-600">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-600">
              {successMsg}
            </div>
          )}

          {mode === 'register' && !successMsg && (
            <div className="px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-[11px] text-blue-600 leading-relaxed">
              After registering, check your email to confirm your account before signing in.
            </div>
          )}

          <button
            id="auth-submit"
            onClick={async () => {
              if (!email || !password) return;
              setLoading(true);
              setError(null);
              setSuccessMsg(null);
              try {
                const endpoint = mode === 'login' ? '/api/auth/signin' : '/api/auth/signup';
                const res = await fetch(endpoint, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email, password }),
                });
                const data = await res.json();
                if (!res.ok) {
                  setError(data.error || 'Authentication failed');
                } else if (mode === 'register' && !data.session) {
                  setSuccessMsg(data.message || 'Account created! Check your email to confirm your sign-in.');
                  setEmail('');
                  setPassword('');
                } else if (data.session) {
                  setTokens(data.session.access_token, data.session.refresh_token);
                  setUser(data.user);
                  handleClose();
                }
              } catch (err) {
                setError(err.message);
              }
              setLoading(false);
            }}
            disabled={loading || !email || !password}
            className="w-full py-2.5 rounded-xl bg-black text-white text-sm font-medium active:scale-[0.98] transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-black/85"
          >
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>

          <p className="text-center text-xs text-black">
            {mode === 'login' ? (
              <>Don&apos;t have an account?{' '}
                <button onClick={() => { setMode('register'); setError(null); }} className="underline hover:text-black transition-colors duration-150">
                  Register
                </button>
              </>
            ) : (
              <>Already have an account?{' '}
                <button onClick={() => { setMode('login'); setError(null); }} className="underline hover:text-black transition-colors duration-150">
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [authModal, setAuthModal] = useState(null); // { mode: 'login'|'register' } | null

  // Auth initialization — runs once on app mount, not per-page
  useEffect(() => {
    const oauthTokens = parseOAuthTokensFromHash?.();
    if (oauthTokens) {
      setTokens(oauthTokens.accessToken, oauthTokens.refreshToken);
      window.location.hash = '';
    }
    const token = getToken();
    if (token) {
      authFetch('/api/auth/me').then((res) => {
        if (res.ok) res.json().then((data) => setUser(data.user));
        else clearTokens();
      });
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    try {
      await authFetch('/api/auth/signout', { method: 'POST' });
    } catch { /* ignore */ }
    clearTokens();
    setUser(null);
  }, []);

  const handleOpenAuth = useCallback((mode) => {
    setAuthModal(mode ? { mode } : { mode: 'login' });
  }, []);

  return (
    <AppContext.Provider value={{
      user, setUser,
      sidebarOpen, setSidebarOpen,
      handleSignOut,
      currentConversationId, setCurrentConversationId,
      handleOpenAuth,
    }}>
      {children}
      {authModal && (
        <AuthModal state={authModal} onClose={() => setAuthModal(null)} />
      )}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
