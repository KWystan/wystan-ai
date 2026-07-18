import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { authFetch, getToken, clearTokens } from '../lib/auth.js';
import Sidebar from './Sidebar.jsx';

/* ── Code block component ───────────────────────────────────── */
function CodePanel({ language, codeString, children }) {
  const [copied, setCopied] = useState(false);
  const copyCode = () => {
    navigator.clipboard.writeText(codeString || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative group my-2 rounded-lg overflow-hidden border border-black/10 bg-[#fafafa]">
      <div className="flex items-center justify-between px-3 py-1 bg-black/[0.03] border-b border-black/8">
        <span className="text-[10px] font-mono text-black uppercase tracking-wider">
          {language || 'code'}
        </span>
        <button
          onClick={copyCode}
          className="flex items-center gap-1 text-[10px] text-black hover:text-black transition-colors duration-100"
        >
          <span className="material-symbols-outlined text-[12px]">{copied ? 'check' : 'content_copy'}</span>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="p-3 text-sm leading-relaxed overflow-x-auto [&>pre]:m-0 [&>pre]:bg-transparent">
        {children}
      </div>
    </div>
  );
}

/* ── Markdown renderer ──────────────────────────────────────── */
function renderMessageText(text) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ node, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const codeString = String(children).replace(/\n$/, '');
          if (match) {
            return (
              <CodePanel language={match[1]} codeString={codeString}>
                <code className={className} {...props}>
                  {children}
                </code>
              </CodePanel>
            );
          }
          return (
            <code
              className="bg-black/[0.06] text-black text-[13px] px-1 py-0.5 rounded font-mono"
              {...props}
            >
              {children}
            </code>
          );
        },
        p: ({ children }) => <p className="my-0.5 leading-normal">{children}</p>,
        ul: ({ children }) => <ul className="my-0.5 pl-4 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="my-0.5 pl-4 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="my-0.5 leading-normal">{children}</li>,
        h1: ({ children }) => <h1 className="text-xl font-bold text-black mt-2 mb-1">{children}</h1>,
        h2: ({ children }) => <h2 className="text-lg font-bold text-black mt-1.5 mb-0.5">{children}</h2>,
        h3: ({ children }) => <h3 className="text-base font-bold text-black mt-1 mb-0.5">{children}</h3>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-black/15 pl-3 my-1 text-black italic">{children}</blockquote>
        ),
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline decoration-blue-300 hover:decoration-blue-600 transition-colors duration-150">
            {children}
          </a>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table className="min-w-full text-sm border-collapse border border-black/10">{children}</table>
          </div>
        ),
        th: ({ children }) => <th className="border border-black/10 px-2 py-1 bg-black/[0.03] text-left font-medium">{children}</th>,
        td: ({ children }) => <td className="border border-black/10 px-2 py-1">{children}</td>,
      }}
    >
      {text}
    </Markdown>
  );
}

/* ── Build user-visible content (short reference) ────────────── */
function buildUserContent(text, isMultimodal, attachedFiles) {
  const imgFiles = attachedFiles.filter((f) => f.group === 'image');
  const otherFiles = attachedFiles.filter((f) => f.group !== 'image');
  const parts = [text || ''];

  let fileRefs = '';
  if (imgFiles.length) {
    fileRefs += `[Attached image${imgFiles.length > 1 ? 's' : ''}: ${imgFiles.map(f => f.filename).join(', ')}]\n`;
  }
  if (otherFiles.length) {
    fileRefs += `[Attached file${otherFiles.length > 1 ? 's' : ''}: ${otherFiles.map(f => f.filename).join(', ')}]\n`;
  }
  if (fileRefs) parts.push(fileRefs.trim());

  // Multimodal: include image data for the vision model
  if (isMultimodal && imgFiles.length > 0) {
    const content = [];
    if (text) content.push({ type: 'text', text });
    for (const f of imgFiles) {
      content.push({ type: 'image_url', image_url: { url: f.content } });
    }
    return content;
  }

  return parts.filter(Boolean).join('\n\n');
}

/* ── Build API content (full file text) ──────────────────────── */
function buildApiContent(text, isMultimodal, attachedFiles) {
  const imgFiles = attachedFiles.filter((f) => f.group === 'image');
  const otherFiles = attachedFiles.filter((f) => f.group !== 'image');

  // Multimodal: array with text + image_url blocks
  if (isMultimodal && imgFiles.length > 0) {
    const content = [];
    const textParts = [text || ''];
    for (const f of otherFiles) {
      textParts.push(`\n\n--- ${f.filename} ---\n${f.content || '(content unavailable)'}`);
    }
    content.push({ type: 'text', text: textParts.join('\n\n') });
    for (const f of imgFiles) {
      content.push({ type: 'image_url', image_url: { url: f.content } });
    }
    return content;
  }

  // Text-only: append file text to the message
  const parts = [text || ''];
  for (const f of attachedFiles) {
    if (f.content) {
      parts.push(`\n\n--- ${f.filename} ---\n${f.content}`);
    }
  }
  return parts.filter(Boolean).join('\n\n');
}

/* ── Models (same as ChatPage) ───────────────────────────────── */
const MODELS = [
  { id: 'mimo-v2.5-free', name: 'MiMo-V2.5', multimodal: false },
  { id: 'minimaxai/minimax-m3', name: 'MiniMax M3', multimodal: true },
  { id: 'deepseek-v4-flash-free', name: 'DeepSeek V4 Flash', multimodal: false },
  { id: 'nemotron-3-ultra-free', name: 'Nemotron 3 Ultra', multimodal: false },
  { id: 'north-mini-code-free', name: 'North Mini Code', multimodal: false },
];

/* ── SSE streaming relay ─────────────────────────────────────── */
async function relaySSE(url, body, onContent, onError) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(errText || `HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const payload = trimmed.slice(6);
      if (payload === '[DONE]') return;
      try {
        const parsed = JSON.parse(payload);
        if (parsed.error) {
          onError?.(parsed.error);
          return;
        }
        const delta = parsed.content || parsed.choices?.[0]?.delta?.content || '';
        if (delta) onContent(delta);
      } catch { /* skip partial */ }
    }
  }
}

export default function ProjectPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [project, setProject] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  /* ── Chat state ─────────────────────────────────────────── */
  const [messages, setMessages] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [activeMode, setActiveMode] = useState(null); // 'search' | 'generate' | null
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [generatedImage, setGeneratedImage] = useState(null); // { url, prompt } for inline display

  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const abortRef = useRef(null);

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

  /* ── Auto-scroll to bottom ─────────────────────────────── */
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  /* ── Save messages to Supabase ──────────────────────────── */
  const saveMessagesToDb = useCallback(async (convId, msgList) => {
    if (!convId || !user || msgList.length === 0) return;
    try {
      await authFetch(`/api/conversations/${convId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ messages: msgList.map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) })) }),
      });
    } catch (err) {
      console.error('Failed to save messages:', err);
    }
  }, [user]);

  /* ── Handle send ───────────────────────────────────────── */
  const handleSend = useCallback(async (overrideText) => {
    const text = (overrideText || input).trim();
    if (!text || isLoading || isSending) return;

    const hasImages = attachedFiles.some((f) => f.group === 'image');
    const effectiveModel = hasImages
      ? MODELS.find((m) => m.multimodal)?.id || MODELS[0].id
      : MODELS[0].id;
    const isMultimodal = MODELS.find((m) => m.id === effectiveModel)?.multimodal;

    /* ── Generate mode: handle image generation inline ───── */
    if (activeMode === 'generate') {
      setIsSending(true);
      setGeneratedImage(null);
      try {
        const genRes = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: text }),
        });
        const genData = await genRes.json();
        if (!genRes.ok) {
          setError(genRes.status === 400 ? `Content filter: ${genData.error}` : genData.error || 'Generation failed');
        } else {
          const imageUrl = genData.images?.[0] || genData.image || genData.url;
          if (imageUrl) {
            setGeneratedImage({ url: imageUrl, prompt: text });
          }
        }
      } catch (err) {
        setError(`Generation failed: ${err.message}`);
      } finally {
        setIsSending(false);
        setInput('');
        setActiveMode(null);
      }
      return;
    }

    /* ── Normal / search mode ────────────────────────────── */
    setIsSending(true);
    setError(null);

    /* Build user message */
    const modeText = text;
    let searchResults = null;

    /* ── Web search (if /search mode) ─────────────────────── */
    if (activeMode === 'search') {
      try {
        const searchRes = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: text }),
        });
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          searchResults = searchData.results || searchData;
        }
      } catch (err) {
        console.error('Search failed:', err);
      }
    }

    const contextInfo = searchResults
      ? `\n\nWeb search results:\n${searchResults.map((r, i) => `${i + 1}. ${r.title || r.url || ''}${r.content ? ': ' + r.content : ''}`).join('\n')}`
      : '';

    const userMsgText = buildUserContent(modeText, isMultimodal, attachedFiles);
    const apiMsgText = buildApiContent(modeText + contextInfo, isMultimodal, attachedFiles);
    const userMsg = { role: 'user', content: userMsgText, files: attachedFiles };

    /* Create or reuse conversation */
    let convId = currentConversationId;
    const isFirstMessage = messages.length === 0;
    const title = text.length > 45 ? text.slice(0, 45) + '…' : text;

    if (user && !convId) {
      try {
        const res = await authFetch('/api/conversations', {
          method: 'POST',
          body: JSON.stringify({ title, project_id: id }),
        });
        if (res.ok) {
          const conv = await res.json();
          convId = conv.id;
          setCurrentConversationId(conv.id);
          setRefreshKey((k) => k + 1);
        }
      } catch (err) {
        console.error('Failed to create conversation:', err);
      }
    } else if (user && isFirstMessage && convId) {
      try {
        await authFetch(`/api/conversations/${convId}`, {
          method: 'PUT',
          body: JSON.stringify({ title }),
        });
        setRefreshKey((k) => k + 1);
      } catch { /* ignore */ }
    }

    /* Add user message to state */
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setAttachedFiles([]);
    setActiveMode(null);

    /* Create assistant placeholder */
    const assistantMsg = { role: 'assistant', content: '' };
    setMessages((prev) => [...prev, assistantMsg]);
    setIsLoading(true);
    setIsSending(false);

    /* Build API payload — use original messages, not updatedMessages
       which already includes the new user msg (would send it twice). */
    const payload = {
      model: effectiveModel,
      messages: [
        ...messages.slice(-20).map((m) => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content : m.content,
        })),
        {
          role: 'user',
          content: typeof apiMsgText === 'string' ? apiMsgText : apiMsgText,
        },
      ],
    };

    /* Stream from API */
    let fullContent = '';
    abortRef.current = new AbortController();

    try {
      await relaySSE(
        '/api/chat-full',
        payload,
        (delta) => {
          fullContent += delta;
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === 'assistant') {
              next[next.length - 1] = { ...last, content: fullContent };
            }
            return next;
          });
        },
        (errMsg) => {
          setError(errMsg);
        }
      );
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Stream failed');
      }
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }

    /* Save to DB */
    if (convId && user) {
      const finalMessages = [
        { role: 'user', content: typeof userMsgText === 'string' ? userMsgText : JSON.stringify(userMsgText) },
        { role: 'assistant', content: fullContent },
      ];
      saveMessagesToDb(convId, finalMessages);
    }
  }, [input, isLoading, isSending, messages, attachedFiles, user, currentConversationId, activeMode, id, saveMessagesToDb]);

  /* ── Keyboard: Enter to send, Shift+Enter newline ─────── */
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /* ── Sidebar handlers ──────────────────────────────────── */
  const handleClear = () => {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setIsLoading(false);
    setSidebarOpen(false);
    setAttachedFiles([]);
    setCurrentConversationId(null);
    setGeneratedImage(null);
  };

  const handleSelectConversation = (conversationId) => {
    navigate(`/chat/${conversationId}`);
  };

  const handleSignOut = async () => {
    try { await authFetch('/api/auth/signout', { method: 'POST' }); } catch { /* ignore */ }
    clearTokens();
    setUser(null);
  };

  const handleOpenAuth = () => {
    navigate('/chat');
  };

  /* ── File upload handler ────────────────────────────────── */
  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setIsUploading(true);
    setError(null);
    const results = [];
    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
        results.push(data);
      } catch (err) {
        setError(err.message.includes('413') || err.message.includes('too large')
          ? `"${file.name}" is too large. Max 10 MB.`
          : `Failed to upload "${file.name}": ${err.message}`);
      }
    }
    if (results.length > 0) setAttachedFiles((prev) => [...prev, ...results]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setIsUploading(false);
  };

  const handleOpenModeMenu = () => setModeMenuOpen((p) => !p);

  /* ── Show conversation list if no active chat ──────────── */
  const showLanding = !currentConversationId && messages.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex bg-white">
      {/* ── Sidebar ────────────────────────────────────────────── */}
      <Sidebar
        user={user}
        onNewChat={handleClear}
        currentConversationId={currentConversationId}
        onSelectConversation={handleSelectConversation}
        onSignOut={handleSignOut}
        onOpenAuth={handleOpenAuth}
        sidebarOpen={sidebarOpen}
        onCloseSidebar={() => setSidebarOpen(false)}
        refreshKey={refreshKey}
      />

      {/* ── Mobile overlay ──────────────────────────────────────── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/10 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Main area ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* ── Header bar ──────────────────────────────────────── */}
        <header className="flex-shrink-0 bg-white/90 backdrop-blur-md">
          <div className="px-4 h-12 flex items-center">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden w-8 h-8 rounded-lg border border-black/12 flex items-center justify-center text-black hover-gate:border-black/35 hover-gate:text-black active:scale-[0.97] transition-all duration-150 [backface-visibility:hidden]"
              aria-label="Open sidebar"
            >
              <span className="material-symbols-outlined text-[18px]">menu</span>
            </button>
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
            ) : error && showLanding ? (
              /* ── Error state (landing only) ──────────────────── */
              <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
                <span className="material-symbols-outlined text-3xl text-red-300 mb-3">folder_off</span>
                <p className="text-sm text-red-500 mb-1">Failed to load project</p>
                <p className="text-xs text-black mb-4">{error}</p>
                <Link to="/chat" className="text-xs underline text-black hover:text-black transition-colors duration-150">
                  Back to chat
                </Link>
              </div>
            ) : !project && showLanding ? (
              /* ── Not found ──────────────────────────────────── */
              <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
                <span className="material-symbols-outlined text-3xl text-black mb-3">folder_off</span>
                <p className="text-sm text-black mb-1">Project not found</p>
                <p className="text-xs text-black mb-4">This project may have been deleted.</p>
                <Link to="/chat" className="text-xs underline text-black hover:text-black transition-colors duration-150">
                  Back to chat
                </Link>
              </div>
            ) : showLanding ? (
              /* ── Project landing ────────────────────────────── */
              <>
                <div
                  className="flex flex-col items-center justify-center min-h-[30vh] text-center"
                  style={{ animation: 'fade-up 0.4s var(--ease-out-expo) both' }}
                >
                  <div className="w-14 h-14 rounded-2xl border border-black/10 flex items-center justify-center mb-4">
                    <span className="material-symbols-outlined text-2xl text-black">folder</span>
                  </div>
                  <h2 className="font-display text-2xl font-bold text-black mb-1">
                    {project?.name}
                  </h2>
                  <p className="text-sm text-black max-w-sm">
                    Ask a question or click a past conversation.
                  </p>
                </div>

                {/* ── Conversation list ────────────────────────── */}
                <div className="mt-6">
                  <h3 className="text-[11px] font-medium text-black uppercase tracking-wider mb-3 px-1">
                    Conversations
                  </h3>
                  {conversations.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <span className="material-symbols-outlined text-2xl text-black mb-2">forum</span>
                      <p className="text-xs text-black">No conversations yet. Start one above.</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {conversations.map((conv) => (
                        <button
                          key={conv.id}
                          onClick={() => navigate(`/chat/${conv.id}`)}
                          className="w-full text-left px-3.5 py-2.5 rounded-xl border border-black/8 text-sm text-black hover-gate:border-black/20 hover-gate:text-black active:scale-[0.99] transition-all duration-150 flex items-center gap-3 [backface-visibility:hidden]"
                        >
                          <span className="material-symbols-outlined text-[16px] text-black flex-shrink-0">chat</span>
                          <span className="truncate">{conv.title}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* ── Chat view ──────────────────────────────────── */
              <div className="space-y-4 mt-2">
                {/* Generated image display */}
                {generatedImage && (
                  <div className="flex flex-col items-center gap-3 py-4" style={{ animation: 'fade-up 0.3s var(--ease-out-expo) both' }}>
                    <img
                      src={generatedImage.url}
                      alt={generatedImage.prompt}
                      className="max-w-full rounded-xl border border-black/10 shadow-sm"
                    />
                    <p className="text-xs text-black text-center max-w-md">{generatedImage.prompt}</p>
                  </div>
                )}

                {/* Messages */}
                {messages.length === 0 && !generatedImage ? (
                  <div className="flex flex-col items-center justify-center min-h-[30vh] text-center">
                    <p className="text-sm text-black">Type a message to start chatting in this project.</p>
                  </div>
                ) : (
                  messages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      style={{ animation: 'fade-up 0.2s var(--ease-out-expo) both' }}
                    >
                      <div
                        className={`max-w-[85%] sm:max-w-[75%] ${
                          msg.role === 'user'
                            ? 'bg-black text-white rounded-2xl px-3.5 py-2.5'
                            : 'px-3 md:px-4 pb-6 md:pb-8 pt-3 leading-normal'
                        }`}
                      >
                        {msg.role === 'user' ? (
                          <div className="text-sm [overflow-wrap:anywhere] min-w-0 leading-normal">
                            {typeof msg.content === 'string'
                              ? msg.content
                              : Array.isArray(msg.content)
                                ? msg.content
                                    .filter((c) => c.type === 'text')
                                    .map((c) => c.text)
                                    .join(' ')
                                : ''}
                          </div>
                        ) : (
                          <div className="[overflow-wrap:anywhere] min-w-0 font-serif">
                            {msg.content ? (
                              renderMessageText(msg.content)
                            ) : isLoading && i === messages.length - 1 ? (
                              <span className="text-black text-sm">Thinking…</span>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}

                {/* Inline error */}
                {error && !showLanding && (
                  <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
                    <span className="material-symbols-outlined text-[16px]">error_outline</span>
                    <span>{error}</span>
                  </div>
                )}

                {/* File preview bubbles */}
                {messages.map((msg, i) =>
                  msg.files?.length > 0 ? (
                    <div key={`files-${i}`} className="flex justify-end -mt-2">
                      <div className="max-w-[85%] sm:max-w-[75%] flex flex-wrap gap-1.5">
                        {msg.files.map((f, j) => (
                          <span key={j} className="text-[10px] text-black bg-black/[0.03] px-2 py-0.5 rounded-full truncate max-w-[140px]">
                            {f.filename || f.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </main>

        {/* ── Input ─────────────────────────────────────────────── */}
        {(project || currentConversationId) && !(error && showLanding) && (
          <footer className="flex-shrink-0 bg-white/90 backdrop-blur-md">
            <div className="max-w-3xl mx-auto px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 relative flex items-center">
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleFileSelect}
                    className="hidden"
                    accept="image/*,.pdf,.docx,.pptx,.xlsx,.xls,.csv,.tsv,.txt,.json,.xml,.yaml,.yml,.md,.html,.css,.js,.jsx,.ts,.tsx,.py,.rb,.java,.c,.cpp,.cs,.go,.rs,.swift,.kt,.php,.sh,.bash,.sql,.scss,.less,.r,.svg,.webp,.gif,.bmp"
                    multiple
                  />
                  <button
                    onClick={handleOpenModeMenu}
                    disabled={isUploading}
                    className="absolute left-2 w-8 h-8 rounded-lg flex items-center justify-center text-black hover:text-black disabled:text-black active:scale-[0.97] transition-all duration-150 z-10"
                    aria-label="Add mode"
                  >
                    <span className={`material-symbols-outlined text-[18px] ${isUploading ? 'animate-spin' : ''}`}>
                      {isUploading ? 'progress_activity' : 'add'}
                    </span>
                  </button>
                  {modeMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setModeMenuOpen(false)} />
                      <div
                        className="absolute bottom-full left-2 mb-1.5 w-44 bg-white border border-black/10 rounded-xl shadow-lg overflow-hidden z-50"
                        style={{ animation: 'scale-in 0.15s var(--ease-out-expo) both', transformOrigin: 'bottom left' }}
                      >
                        <button
                          onClick={() => { setModeMenuOpen(false); fileInputRef.current?.click(); }}
                          className="w-full text-left px-3.5 py-1.5 text-xs text-black hover-gate:text-black hover-gate:bg-black/[0.03] transition-colors duration-150 flex items-center gap-2.5"
                        >
                          <span className="material-symbols-outlined text-[16px]">attach_file</span>
                          Attach file
                        </button>
                        <button
                          onClick={() => { setModeMenuOpen(false); setActiveMode('generate'); textareaRef.current?.focus(); }}
                          className="w-full text-left px-3.5 py-1.5 text-xs text-black hover-gate:text-black hover-gate:bg-black/[0.03] transition-colors duration-150 flex items-center gap-2.5"
                        >
                          <span className="material-symbols-outlined text-[16px]">image</span>
                          Generate
                        </button>
                        <button
                          onClick={() => { setModeMenuOpen(false); setActiveMode('search'); textareaRef.current?.focus(); }}
                          className="w-full text-left px-3.5 py-1.5 text-xs text-black hover-gate:text-black hover-gate:bg-black/[0.03] transition-colors duration-150 flex items-center gap-2.5"
                        >
                          <span className="material-symbols-outlined text-[16px]">travel_explore</span>
                          Search
                        </button>
                      </div>
                    </>
                  )}
                  {activeMode && (
                    <button
                      onClick={() => setActiveMode(null)}
                      className="absolute left-10 text-blue-500 text-sm font-medium z-10 flex items-center gap-1 cursor-pointer"
                    >
                      <span className="pointer-events-none">/{activeMode === 'search' ? 'search' : 'generate'}</span>
                      <span className="material-symbols-outlined text-[14px] text-blue-400 hover:text-blue-600 transition-colors duration-150">close</span>
                    </button>
                  )}
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={activeMode === 'generate' ? 'Describe the image you want to generate…' : activeMode === 'search' ? 'Ask anything to search the web…' : `Ask something in ${project?.name || 'this project'}…`}
                    maxLength={10000}
                    rows={1}
                    disabled={isLoading || isSending}
                    className={`w-full bg-white text-black text-sm rounded-xl px-4 py-2.5 resize-none overflow-y-auto hide-scrollbar outline-none placeholder:text-black border border-black/10 focus:border-black/25 transition-all duration-150 disabled:opacity-50 leading-relaxed ${
                      activeMode ? 'pl-36' : 'pl-12'
                    }`}
                  />
                  {attachedFiles.length > 0 && (
                    <div className="absolute bottom-1 left-3 flex items-center gap-1 text-[10px] text-black pointer-events-none max-w-[60%]">
                      <span className="material-symbols-outlined text-[12px]">attach_file</span>
                      <span className="truncate">{attachedFiles.length} file{attachedFiles.length > 1 ? 's' : ''}</span>
                    </div>
                  )}
                  {input.length > 8000 && (
                    <div className={`absolute bottom-1 right-3 text-[10px] font-medium pointer-events-none ${
                      input.length > 9500 ? 'text-red-500' : 'text-amber-500'
                    }`}>
                      {input.length.toLocaleString()}/10,000
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleSend()}
                  disabled={(!input.trim() && attachedFiles.length === 0) || isLoading || isSending || isUploading}
                  className="w-10 h-10 rounded-xl bg-black text-white flex items-center justify-center flex-shrink-0 active:scale-[0.92] transition-all duration-150 disabled:opacity-25 disabled:cursor-not-allowed hover:bg-black/85 [backface-visibility:hidden]"
                  aria-label="Send message"
                >
                  <span className={`material-symbols-outlined text-[18px] ${isSending ? 'animate-spin' : ''}`}>
                    {isSending ? 'progress_activity' : 'arrow_upward'}
                  </span>
                </button>
              </div>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}
