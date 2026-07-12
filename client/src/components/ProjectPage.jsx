import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { authFetch, getToken, clearTokens } from '../lib/auth.js';
import Sidebar from './Sidebar.jsx';

export default function ProjectPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [project, setProject] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [user, setUser] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const textareaRef = useRef(null);

  /* ── Auth state ─────────────────────────────────────────── */
  useEffect(() => {
    const token = getToken();
    if (token) {
      authFetch('/api/auth/me').then((res) => {
        if (res.ok) res.json().then((data) => setUser(data.user));
      });
    }
  }, []);

  /* ── Fetch project + conversations on mount ────────────── */
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await authFetch(`/api/projects/${id}`);

        if (cancelled) return;

        if (res.status === 404) {
          setProject(null);
        } else if (!res.ok) {
          throw new Error('Failed to load project');
        } else {
          const data = await res.json();
          setProject(data.project);
          setConversations(data.conversations || []);
        }
      } catch (err) {
        console.error('Failed to load project:', err);
        if (!cancelled) {
          setError(err.message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [id]);

  /* ── Auto-resize textarea ─────────────────────────────── */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [input]);

  /* ── Handle send ──────────────────────────────────────── */
  const handleSend = useCallback(async (overrideText) => {
    const text = (overrideText || input).trim();
    if (!text || isSending) return;
    setIsSending(true);

    if (user) {
      /* Logged in: create conversation in this project */
      const title = text.length > 45 ? text.slice(0, 45) + '…' : text;
      try {
        const res = await authFetch('/api/conversations', {
          method: 'POST',
          body: JSON.stringify({ title, project_id: id }),
        });

        if (res.ok) {
          const data = await res.json();
          navigate(`/chat/${data.id}`);
        } else {
          throw new Error('Failed to create conversation');
        }
      } catch (err) {
        console.error('Failed to create conversation:', err);
        setError('Failed to start conversation. Please try again.');
      } finally {
        setIsSending(false);
      }
    } else {
      /* Logged out: navigate to chat */
      setIsSending(false);
      navigate('/chat', { state: { initialText: text } });
    }
  }, [input, id, navigate, isSending, user]);

  /* ── Keyboard: Enter to send, Shift+Enter newline ─────── */
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /* ── Sidebar handlers ──────────────────────────────────── */
  const handleClear = () => {
    navigate('/chat');
  };

  const handleSelectConversation = (conversationId) => {
    navigate(`/chat/${conversationId}`);
  };

  const handleSignOut = async () => {
    try {
      await authFetch('/api/auth/signout', { method: 'POST' });
    } catch { /* ignore */ }
    clearTokens();
    setUser(null);
  };

  const handleOpenAuth = () => {
    navigate('/chat');
  };

  return (
    <div className="fixed inset-0 z-50 flex bg-white">
      {/* ── Sidebar ────────────────────────────────────────────── */}
      <Sidebar
        user={user}
        onNewChat={handleClear}
        currentConversationId={null}
        onSelectConversation={handleSelectConversation}
        onSignOut={handleSignOut}
        onOpenAuth={handleOpenAuth}
        sidebarOpen={sidebarOpen}
        onCloseSidebar={() => setSidebarOpen(false)}
        refreshKey={refreshKey}
      />

      {/* ── Mobile overlay ──────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/10 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Main area ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* ── Header bar ──────────────────────────────────────── */}
        <header className="flex-shrink-0 bg-white/90 backdrop-blur-md border-b border-black/8">
          <div className="px-4 h-12 flex items-center gap-3">
            {/* Mobile sidebar toggle */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden w-8 h-8 rounded-lg border border-black/12 flex items-center justify-center text-black/50 hover-gate:border-black/35 hover-gate:text-black active:scale-[0.97] transition-all duration-150 [backface-visibility:hidden]"
              aria-label="Open sidebar"
            >
              <span className="material-symbols-outlined text-[18px]">menu</span>
            </button>
            <span className="material-symbols-outlined text-[20px] text-black/40">folder</span>
            <span className="text-sm font-medium text-black/70 truncate">
              {project?.name || 'Loading…'}
            </span>
          </div>
        </header>

        {/* ── Body ────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-6 w-full">
            {loading ? (
              /* ── Loading state ──────────────────────────────── */
              <div className="flex items-center justify-center min-h-[50vh]">
                <div className="flex gap-1.5">
                  <span className="animate-blink size-1.5 rounded-full bg-black/25" />
                  <span className="animate-blink size-1.5 rounded-full bg-black/25" style={{ animationDelay: '0.2s' }} />
                  <span className="animate-blink size-1.5 rounded-full bg-black/25" style={{ animationDelay: '0.4s' }} />
                </div>
              </div>
            ) : error ? (
              /* ── Error state ────────────────────────────────── */
              <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
                <span className="material-symbols-outlined text-3xl text-red-300 mb-3">folder_off</span>
                <p className="text-sm text-red-500 mb-1">Failed to load project</p>
                <p className="text-xs text-black/40 mb-4">{error}</p>
                <Link to="/chat" className="text-xs underline text-black/40 hover:text-black transition-colors duration-150">
                  Back to chat
                </Link>
              </div>
            ) : !project ? (
              /* ── Not found ──────────────────────────────────── */
              <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
                <span className="material-symbols-outlined text-3xl text-black/20 mb-3">folder_off</span>
                <p className="text-sm text-black/50 mb-1">Project not found</p>
                <p className="text-xs text-black/30 mb-4">This project may have been deleted.</p>
                <Link to="/chat" className="text-xs underline text-black/40 hover:text-black transition-colors duration-150">
                  Back to chat
                </Link>
              </div>
            ) : (
              <>
                {/* ── Folder identity ──────────────────────────── */}
                <div
                  className="flex flex-col items-center justify-center min-h-[30vh] text-center"
                  style={{ animation: 'fade-up 0.4s var(--ease-out-expo) both' }}
                >
                  <div className="w-14 h-14 rounded-2xl border border-black/10 flex items-center justify-center mb-4">
                    <span className="material-symbols-outlined text-2xl text-black/30">folder</span>
                  </div>
                  <h2 className="font-magazine text-xl font-semibold text-black mb-1">
                    {project.name}
                  </h2>
                  <p className="text-sm text-black/40 max-w-sm">
                    Ask a question or click a past conversation.
                  </p>
                </div>

                {/* ── Conversation list ────────────────────────── */}
                <div className="mt-6">
                  <h3 className="text-[11px] font-medium text-black/40 uppercase tracking-wider mb-3 px-1">
                    Conversations
                  </h3>

                  {conversations.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <span className="material-symbols-outlined text-2xl text-black/15 mb-2">forum</span>
                      <p className="text-xs text-black/30">No conversations yet. Start one above.</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {conversations.map((conv) => (
                        <button
                          key={conv.id}
                          onClick={() => navigate(`/chat/${conv.id}`)}
                          className="w-full text-left px-3.5 py-2.5 rounded-xl border border-black/8 text-sm text-black/60 hover-gate:border-black/20 hover-gate:text-black active:scale-[0.99] transition-all duration-150 flex items-center gap-3 [backface-visibility:hidden]"
                        >
                          <span className="material-symbols-outlined text-[16px] text-black/25 flex-shrink-0">chat</span>
                          <span className="truncate">{conv.title}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </main>

        {/* ── Input ─────────────────────────────────────────────── */}
        {project && !error && (
          <footer className="flex-shrink-0 bg-white/90 backdrop-blur-md">
            <div className="max-w-3xl mx-auto px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 relative flex items-center">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`Ask something in ${project.name}…`}
                    maxLength={4000}
                    rows={1}
                    className="w-full bg-white text-black text-sm rounded-xl pl-4 pr-4 py-2.5 resize-none overflow-hidden outline-none placeholder:text-black/30 border border-black/10 focus:border-black/25 transition-all duration-150 leading-relaxed"
                  />
                </div>
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim() || isSending}
                  className="w-10 h-10 rounded-xl bg-black text-white flex items-center justify-center flex-shrink-0 active:scale-[0.92] transition-all duration-150 disabled:opacity-25 disabled:cursor-not-allowed hover:bg-black/85 [backface-visibility:hidden]"
                  aria-label="Send message"
                >
                  <span className="material-symbols-outlined text-[18px]">arrow_upward</span>
                </button>
              </div>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}
