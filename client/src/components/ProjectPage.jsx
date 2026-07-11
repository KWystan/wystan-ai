import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';

const SUGGESTIONS = [
  'Explain quantum computing simply',
  'Write a short poem about the ocean',
  'Help me plan a weekend project',
  'What are the best practices for REST APIs?',
];

export default function ProjectPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [project, setProject] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const textareaRef = useRef(null);

  /* ── Fetch project + conversations on mount ────────────── */
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [projectRes, convRes] = await Promise.all([
          supabase.from('projects').select('*').eq('id', id).single(),
          supabase.from('conversations').select('*').eq('project_id', id).order('updated_at', { ascending: false }),
        ]);

        if (cancelled) return;

        if (projectRes.error) throw projectRes.error;
        if (convRes.error) throw convRes.error;

        setProject(projectRes.data);
        setConversations(convRes.data || []);
      } catch (err) {
        console.error('Failed to load project:', err);
        if (!cancelled) setError(err.message);
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
    if (!text) return;

    /* Check if user is logged in */
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;

    if (user) {
      /* Logged in: create conversation in this project */
      const title = text.length > 45 ? text.slice(0, 45) + '…' : text;
      try {
        const { data, error } = await supabase
          .from('conversations')
          .insert({ user_id: user.id, project_id: id, title })
          .select()
          .single();

        if (!error && data) {
          navigate(`/chat/${data.id}`);
        }
      } catch (err) {
        console.error('Failed to create conversation:', err);
      }
    } else {
      /* Logged out: navigate to chat */
      navigate('/chat', { state: { initialText: text } });
    }
  }, [input, id, navigate]);

  /* ── Keyboard: Enter to send, Shift+Enter newline ─────── */
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex bg-white">
      {/* ── Main area ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* ── Header bar ──────────────────────────────────────── */}
        <header className="flex-shrink-0 bg-white/90 backdrop-blur-md border-b border-black/8">
          <div className="px-4 h-12 flex items-center gap-3">
            <Link
              to="/chat"
              className="w-8 h-8 rounded-lg border border-black/12 flex items-center justify-center text-black/50 hover-gate:border-black/35 hover-gate:text-black active:scale-[0.97] transition-all duration-150"
              aria-label="Back to chat"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            </Link>
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
                          className="w-full text-left px-3.5 py-2.5 rounded-xl border border-black/8 text-sm text-black/60 hover-gate:border-black/20 hover-gate:text-black active:scale-[0.99] transition-all duration-150 flex items-center gap-3"
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
                  disabled={!input.trim()}
                  className="w-10 h-10 rounded-xl bg-black text-white flex items-center justify-center flex-shrink-0 active:scale-[0.92] transition-all duration-150 disabled:opacity-25 disabled:cursor-not-allowed hover:bg-black/85"
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
