import { useState, useEffect, useRef, useCallback } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabase } from '../lib/supabase.js';
import Sidebar from './Sidebar.jsx';

const MODELS = [
  { id: 'minimaxai/minimax-m3', name: 'MiniMax M3', multimodal: true },
  { id: 'mimo-v2.5-free', name: 'MiMo-V2.5', multimodal: false },
  { id: 'nemotron-3-ultra-free', name: 'Nemotron 3 Ultra', multimodal: false },
  { id: 'north-mini-code-free', name: 'North Mini Code', multimodal: false },
];

const SUGGESTIONS = [
  'Explain quantum computing simply',
  'Write a short poem about the ocean',
  'Help me plan a weekend project',
  'What are the best practices for REST APIs?',
];

function renderMessageText(text) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        p({ children }) {
          return <p className="my-1.5 first:mt-0 last:mb-0 leading-relaxed">{children}</p>;
        },
        pre({ children }) {
          return (
            <pre className="bg-black/5 border border-black/8 rounded-lg px-3 py-2.5 my-2 overflow-x-auto text-[13px] leading-relaxed font-mono text-black/75 whitespace-pre-wrap">
              {children}
            </pre>
          );
        },
        code({ className, children, ...props }) {
          const isInline = !className;
          if (isInline) {
            return (
              <code className="bg-black/5 border border-black/8 rounded px-1.5 py-0.5 text-[13px] font-mono text-black/70" {...props}>
                {children}
              </code>
            );
          }
          // Fenced code — children already wrapped in <pre> from the pre component above
          return <code className="text-[13px] font-mono" {...props}>{children}</code>;
        },
        ul({ children }) {
          return <ul className="list-disc pl-5 my-1.5 space-y-0.5">{children}</ul>;
        },
        ol({ children }) {
          return <ol className="list-decimal pl-5 my-1.5 space-y-0.5">{children}</ol>;
        },
        li({ children }) {
          return <li className="leading-relaxed">{children}</li>;
        },
        h1({ children }) {
          return <h1 className="text-base font-semibold mt-4 mb-1.5">{children}</h1>;
        },
        h2({ children }) {
          return <h2 className="text-[15px] font-semibold mt-4 mb-1.5">{children}</h2>;
        },
        h3({ children }) {
          return <h3 className="text-sm font-semibold mt-3 mb-1">{children}</h3>;
        },
        blockquote({ children }) {
          return (
            <blockquote className="border-l-2 border-black/15 pl-3 my-1.5 text-black/50 italic">
              {children}
            </blockquote>
          );
        },
        hr() {
          return <hr className="my-3 border-black/8" />;
        },
        strong({ children }) {
          return <strong className="font-semibold text-black/80">{children}</strong>;
        },
        a({ href, children }) {
          return (
            <a href={href} target="_blank" rel="noopener noreferrer"
               className="underline text-black/60 hover:text-black transition-colors duration-150">
              {children}
            </a>
          );
        },
      }}
    >
      {text}
    </Markdown>
  );
}

/* ── User message content helpers (multimodal) ──────────────────
 *  When a multimodal model is selected and an image is attached, the user
 *  message carries OpenAI-style content blocks: typed text + a real
 *  `image_url` block (the base64 from /api/upload). Text-only models keep
 *  the legacy tagged-string form (inlined below). */
function buildUserContent(text, isMultimodal, attachedFiles) {
  if (!attachedFiles || attachedFiles.length === 0) return text;

  // Multimodal: send images / PDF page renders directly as image_url blocks
  if (isMultimodal) {
    const content = [{ type: 'text', text }];
    for (const file of attachedFiles) {
      if (file.type === 'image') {
        content.push({ type: 'image_url', image_url: { url: file.data } });
      } else if (file.type === 'pdf' && file.pages) {
        for (const pageUrl of file.pages) {
          content.push({ type: 'image_url', image_url: { url: pageUrl } });
        }
      } else if (file.type === 'text' && file.content) {
        content[0].text += `\n\n--- ${file.filename} ---\n${file.content}`;
      }
    }
    return content;
  }

  // Text-only model: build a single tagged string
  const parts = attachedFiles.map((f) => {
    if (f.type === 'image') return `[Attached image: ${f.filename}]`;
    if (f.type === 'pdf') return `[Attached PDF: ${f.filename} (${f.pages?.length || '?'} pages)]`;
    return `[Attached file: ${f.filename} (${f.mimetype})]`;
  });
  return parts.join('\n') + '\n' + text;
}

/* Extract just the text from a possibly-array user message (for editing).
   When editing a multimodal/PDF message we only recover the text portion. */
function userTextFromContent(content) {
  if (Array.isArray(content)) {
    return content.filter((p) => p.type === 'text').map((p) => p.text).join('\n');
  }
  return content;
}

/* Render user bubble text — images are handled separately above the bubble. */
function renderUserContent(content) {
  if (Array.isArray(content)) {
    return content.filter((p) => p.type === 'text').map((p) => p.text).join('\n');
  }
  return content;
}

/* ── Timeout wrapper for hanging auth calls ─────────────────── */
function withTimeout(promise, ms = 15000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out. Check your network and try again.')), ms)
    ),
  ]);
}

export default function ChatPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [user, setUser] = useState(null);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [authSuccessMsg, setAuthSuccessMsg] = useState(null);
  const [conversationRefetchKey, setConversationRefetchKey] = useState(0);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const abortRef = useRef(null);
  const fileInputRef = useRef(null);
  const visibleConversationRef = useRef(null); // which conversation the user is viewing

  /* ── Auto-scroll ──────────────────────────────────────────── */
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  /* ── Auto-resize textarea ─────────────────────────────────── */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [input]);

  /* ── Close lightbox on Escape ──────────────────────────── */
  useEffect(() => {
    if (!lightboxUrl) return;
    const handler = (e) => { if (e.key === 'Escape') setLightboxUrl(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightboxUrl]);

  /* ── Auth session ────────────────────────────────────────── */
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  /* ── Send message with streaming ──────────────────────────── */
  const handleSend = useCallback(async (overrideText) => {
    const text = (overrideText || input).trim();
    if (!text || isLoading) return;

    /* ── If logged in and no conversation yet, create one now ────
     *  Also update the title from the user's first message so it
     *  shows something meaningful in the sidebar immediately. */
    const isFirstMessage = messages.length === 0;
    let effectiveConversationId = currentConversationId;

    if (user) {
      const titleSuggestion =
        text.length > 45 ? text.slice(0, 45) + '…' : text;

      if (!effectiveConversationId) {
        // No conversation yet — create one with the title already set
        try {
          const { data, error } = await supabase
            .from('conversations')
            .insert({ user_id: user.id, title: titleSuggestion })
            .select()
            .single();
          if (!error && data) {
            effectiveConversationId = data.id;
            setCurrentConversationId(data.id);
            setConversationRefetchKey((k) => k + 1);
          }
        } catch (err) {
          console.error('Failed to create conversation:', err);
        }
      } else if (isFirstMessage) {
        // Conversation exists on a fresh chat — update the title
        try {
          const { error } = await supabase
            .from('conversations')
            .update({ title: titleSuggestion, updated_at: new Date().toISOString() })
            .eq('id', effectiveConversationId);
          if (!error) setConversationRefetchKey((k) => k + 1);
        } catch (err) {
          console.error('Failed to update conversation title:', err);
        }
      }
    }

    /* Auto-switch to MiniMax M3 when files are attached — it's the only
       multimodal model we ship, and sending images to a text-only model
       would just waste the round-trip. */
    const effectiveModel = attachedFiles.length > 0
      ? MODELS.find((m) => m.multimodal)?.id || selectedModel
      : selectedModel;
    const isMultimodal = MODELS.find((m) => m.id === effectiveModel)?.multimodal;
    const userMsg = { role: 'user', content: buildUserContent(text, isMultimodal, attachedFiles) };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    setIsLoading(true);
    setError(null);
    setAttachedFiles([]);

    try {
      const controller = new AbortController();
      abortRef.current = controller;

      const res = await fetch('/api/chat-full', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updated, model: effectiveModel }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to get response');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = '';
      let buffer = '';
      const streamConvId = effectiveConversationId; // captured for background-stream check

      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;

          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') break;

          try {
            const parsed = JSON.parse(data);
            if (parsed.error) throw new Error(parsed.error);
            const content = parsed.choices?.[0]?.delta?.content || parsed.content || '';
            if (content) {
              assistantText += content;
              // Only update live messages if user is still viewing this conversation
              if (streamConvId === visibleConversationRef.current) {
                setMessages((prev) => {
                  const next = [...prev];
                  next[next.length - 1] = { role: 'assistant', content: assistantText };
                  return next;
                });
              }
            }
          } catch (e) {
            if (e.message && !e.message.includes('JSON')) throw e;
          }
        }
      }

      if (!assistantText) {
        // Only update live UI if still viewing this conversation
        if (streamConvId === visibleConversationRef.current) {
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = { role: 'assistant', content: 'No response received. Please try again.' };
            return next;
          });
        }
      }

      /* ── Save messages to Supabase ─────────────────────────── */
      if (effectiveConversationId) {
        const assistantReply = assistantText || 'No response received. Please try again.';
        try {
          await supabase.from('messages').insert([
            { conversation_id: effectiveConversationId, role: 'user', content: userMsg.content },
            { conversation_id: effectiveConversationId, role: 'assistant', content: assistantReply },
          ]);
          // Bump updated_at so the sidebar puts it at the top
          await supabase
            .from('conversations')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', effectiveConversationId);
          setConversationRefetchKey((k) => k + 1);
        } catch (err) {
          console.error('Failed to save messages:', err);
          setError('Failed to save messages: ' + err.message);
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err.message);
      setMessages((prev) => prev.filter((_, i) => i !== prev.length - 1 || prev[i].content !== ''));
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }, [input, isLoading, messages, selectedModel, attachedFiles, user, currentConversationId]);

  /* ── Keyboard: Enter to send, Shift+Enter newline ─────────── */
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = () => {
    if (isLoading) abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setIsLoading(false);
    setSidebarOpen(false);
    setAttachedFiles([]);
    setCurrentConversationId(null);
  };

  /* ── Select conversation from sidebar ─────────────────────── */
  const handleSelectConversation = useCallback(async (conversationId) => {
    setCurrentConversationId(conversationId);
    visibleConversationRef.current = conversationId;
    // Don't abort a running stream — it keeps going in the background
    // and saves to Supabase when done
    setMessages([]);
    setError(null);
    setIsLoading(false);
    setSidebarOpen(false);
    setAttachedFiles([]);

    /* Load saved messages from Supabase */
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('role, content')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      if (!error && data && data.length > 0) {
        setMessages(data);
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
      setError('Failed to load messages: ' + err.message);
    }
  }, []);

  /* ── Sign out ────────────────────────────────────────────── */
  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  /* ── Open auth modal ─────────────────────────────────────── */
  const handleOpenAuth = useCallback((mode) => {
    setAuthMode(mode || 'login');
    setAuthOpen(true);
  }, []);

  /* ── Edit: load last user msg back, trim history ──────────── */
  const handleEdit = (idx) => {
    if (isLoading) return;
    setInput(userTextFromContent(messages[idx].content));
    setMessages((prev) => prev.slice(0, idx));
    textareaRef.current?.focus();
  };

  /* ── Copy assistant message to clipboard ───────────────────── */
  const handleCopy = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  /* ── Save conversation as JSON ─────────────────────────────── */
  const handleSaveConversation = () => {
    const model = MODELS.find((m) => m.id === selectedModel)?.name || selectedModel;
    const blob = new Blob(
      [JSON.stringify({ model, messages, savedAt: new Date().toISOString() }, null, 2)],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wystan-${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ── File upload ───────────────────────────────────────────── */
  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const results = [];

    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) throw new Error('Upload failed');
        const data = await res.json();
        results.push(data);
      } catch (err) {
        setError(`Failed to upload ${file.name}`);
      }
    }

    if (results.length > 0) {
      setAttachedFiles((prev) => [...prev, ...results]);
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

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
        refreshKey={conversationRefetchKey}
      />

      {/* ── Mobile overlay ──────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/10 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Main area ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* ── Top bar ──────────────────────────────────────────── */}
        <header className="flex-shrink-0 bg-white/90 backdrop-blur-md">
          <div className="px-4 h-12 flex items-center gap-3">
            {/* Mobile sidebar toggle */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden w-8 h-8 rounded-lg border border-black/12 flex items-center justify-center text-black/50 hover-gate:border-black/35 hover-gate:text-black active:scale-[0.97] transition-all duration-150"
              aria-label="Open sidebar"
            >
              <span className="material-symbols-outlined text-[18px]">menu</span>
            </button>
            {/* ── Model dropdown ────────────────────────────────── */}
            <div className="relative">
              <button
                onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
                className="flex items-center gap-1 text-sm font-medium text-black/60 hover-gate:text-black active:scale-[0.97] transition-all duration-150"
              >
                {MODELS.find((m) => m.id === selectedModel)?.name}
                <span className="material-symbols-outlined text-[14px] text-black/35">expand_more</span>
              </button>
              {modelDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setModelDropdownOpen(false)} />
                  <div
                    className="absolute top-full left-0 mt-1.5 w-52 bg-white border border-black/10 rounded-xl shadow-lg overflow-hidden z-50"
                    style={{ animation: `scale-in 0.15s var(--ease-out-expo) both`, transformOrigin: 'top left' }}
                  >
                    {MODELS.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => { setSelectedModel(m.id); setModelDropdownOpen(false); }}
                        className={`w-full text-left px-3.5 py-2.5 text-xs transition-colors duration-150 flex items-center justify-between ${
                          m.id === selectedModel
                            ? 'bg-black/5 text-black font-medium'
                            : 'text-black/55 hover-gate:text-black hover-gate:bg-black/[0.03]'
                        }`}
                      >
                        {m.name}
                        {m.id === selectedModel && (
                          <span className="material-symbols-outlined text-[14px] text-black/40">check</span>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="ml-auto flex items-center gap-3">
              {/* ── Save conversation ─────────────────────────────── */}
              {messages.length > 0 && (
                <button
                  onClick={handleSaveConversation}
                  className="flex items-center gap-1 text-sm text-black/40 hover-gate:text-black active:scale-[0.97] transition-all duration-150"
                  aria-label="Save conversation"
                >
                  <span className="material-symbols-outlined text-[16px]">download</span>
                  <span className="hidden sm:inline">Save</span>
                </button>
              )}
            </div>
          </div>
        </header>

        {/* ── Messages ──────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-6 w-full">
            {messages.length === 0 ? (
              /* ── Welcome screen ─────────────────────────────────── */
              <div
                className="flex-1 flex flex-col items-center justify-center min-h-[70vh] text-center"
                style={{ animation: 'fade-up 0.4s var(--ease-out-expo) both' }}
              >
                <div className="w-14 h-14 rounded-2xl border border-black/10 flex items-center justify-center mb-5">
                  <span className="material-symbols-outlined text-2xl text-black/30">auto_awesome</span>
                </div>
                <h2 className="font-magazine text-xl font-semibold text-black mb-1.5">
                  How can I help you?
                </h2>
                <p className="text-sm text-black/40 max-w-sm mb-8">
                  Ask me anything — from coding questions to creative writing to casual conversation.
                </p>
                <div className="flex flex-wrap justify-center gap-2 max-w-md">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSend(s)}
                      className="px-3 py-1.5 rounded-lg border border-black/10 text-xs text-black/50 hover-gate:border-black/25 hover-gate:text-black/80 active:scale-[0.97] transition-all duration-150"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* ── Message list ───────────────────────────────────── */
              <div className="space-y-4">
                {messages.map((msg, i) => {
                  const isLastUserMsg = msg.role === 'user' && i === messages.length - 1;
                  const isAssistant = msg.role === 'assistant';
                  const isStreaming = isAssistant && !msg.content;
                  return (
                    <div
                      key={i}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      style={{ animation: `fade-up 0.2s var(--ease-out-expo) both` }}
                    >
                      {msg.role === 'user' ? (
                        /* ── User message ────────────────────────────── */
                        <div className="max-w-[80%] relative group">
                          {/* Images sit on the natural background, above the dark bubble */}
                          {Array.isArray(msg.content) && (
                            <div className="flex flex-wrap gap-2 mb-2 justify-end">
                              {msg.content.filter((p) => p.type === 'image_url').map((img, i) => (
                                <img
                                  key={i}
                                  src={img.image_url.url}
                                  alt={`attachment ${i + 1}`}
                                  className="max-h-48 rounded-xl border border-black/8 cursor-pointer hover:opacity-90 transition-opacity duration-150"
                                  onClick={() => setLightboxUrl(img.image_url.url)}
                                />
                              ))}
                            </div>
                          )}
                          <div className="bg-black text-white rounded-2xl rounded-br-md px-4 py-3 pr-10 text-sm leading-relaxed whitespace-pre-wrap">
                            {renderUserContent(msg.content)}
                          </div>
                          {/* Edit — bottom-right inside bubble, hover only */}
                          {!isLoading && isLastUserMsg && (
                            <button
                              onClick={() => handleEdit(i)}
                              className="absolute bottom-1.5 right-1.5 opacity-0 group-hover:opacity-100 w-7 h-7 rounded-md flex items-center justify-center text-white/50 hover-gate:text-white active:scale-[0.92] transition-all duration-150"
                              aria-label="Edit message"
                            >
                              <span className="material-symbols-outlined text-[14px]">edit</span>
                            </button>
                          )}
                        </div>
                      ) : (
                        /* ── Assistant message ───────────────────────── */
                        <div className="max-w-[80%] flex gap-2.5">
                          <div className="w-7 h-7 rounded-lg border border-black/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="material-symbols-outlined text-[14px] text-black/30">auto_awesome</span>
                          </div>
                          <div className="relative group">
                            <div className="border border-black/8 rounded-2xl rounded-bl-md px-4 pb-8 pt-3 text-sm leading-relaxed text-black/70">
                              {msg.content ? renderMessageText(msg.content) : (
                                <span className="inline-flex gap-1 py-0.5">
                                  <span className="animate-blink size-1.5 rounded-full bg-black/25" />
                                  <span className="animate-blink size-1.5 rounded-full bg-black/25" style={{ animationDelay: '0.2s' }} />
                                  <span className="animate-blink size-1.5 rounded-full bg-black/25" style={{ animationDelay: '0.4s' }} />
                                </span>
                              )}
                            </div>
                            {/* Copy — bottom-right inside bubble, hover only, finished only */}
                            {msg.content && !isStreaming && (
                              <button
                                onClick={() => handleCopy(msg.content, i)}
                                className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 w-6 h-6 rounded-md flex items-center justify-center text-black/30 hover-gate:text-black/60 hover-gate:bg-black/5 active:scale-[0.92] transition-all duration-150"
                                aria-label="Copy reply"
                              >
                                <span className="material-symbols-outlined text-[13px]">
                                  {copiedIdx === i ? 'check' : 'content_copy'}
                                </span>
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </main>

        {/* ── Error banner ──────────────────────────────────────── */}
        {error && (
          <div className="flex-shrink-0 max-w-3xl mx-auto px-4 pb-2 w-full">
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[11px] text-red-600">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="underline hover:no-underline ml-2">Dismiss</button>
            </div>
          </div>
        )}

        {/* ── Input ─────────────────────────────────────────────── */}
        <footer className="flex-shrink-0 bg-white/90 backdrop-blur-md">
          <div className="max-w-3xl mx-auto px-4 py-3">
            {/* Attached files preview */}
            {attachedFiles.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {attachedFiles.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/5 border border-black/10 text-xs text-black/60"
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      {f.type === 'image' ? 'image' : f.type === 'pdf' ? 'picture_as_pdf' : 'description'}
                    </span>
                    <span className="truncate max-w-[140px]">{f.filename}
                      {f.type === 'pdf' && f.pages && (
                        <span className="ml-1 text-black/30">· {f.pages.length}p</span>
                      )}
                    </span>
                    <button
                      onClick={() => setAttachedFiles((prev) => prev.filter((_, j) => j !== i))}
                      className="text-black/40 hover-gate:text-black ml-0.5"
                    >
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <div className="flex-1 relative flex items-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileSelect}
                  className="hidden"
                  accept="image/*,.txt,.json,.md,.csv,.pdf"
                  multiple
                />
                <button
                  onClick={handleAttachClick}
                  className="absolute left-2 w-8 h-8 rounded-lg flex items-center justify-center text-black/50 hover:text-black active:scale-[0.97] transition-all duration-150 z-10"
                  aria-label="Attach file"
                >
                  <span className="material-symbols-outlined text-[18px]">add</span>
                </button>
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  maxLength={4000}
                  rows={1}
                  disabled={isLoading}
                  className="w-full bg-white text-black text-sm rounded-xl pl-12 pr-4 py-2.5 resize-none overflow-hidden outline-none placeholder:text-black/30 border border-black/10 focus:border-black/25 transition-all duration-150 disabled:opacity-50 leading-relaxed"
                />
              </div>
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || isLoading}
                className="w-10 h-10 rounded-xl bg-black text-white flex items-center justify-center flex-shrink-0 active:scale-[0.92] transition-all duration-150 disabled:opacity-25 disabled:cursor-not-allowed hover:bg-black/85"
                aria-label="Send message"
              >
                <span className="material-symbols-outlined text-[18px]">arrow_upward</span>
              </button>
            </div>
            <p className="text-center text-[10px] text-black/20 mt-2">
              AI can make mistakes. Consider checking important information.
            </p>
          </div>
        </footer>
      </div>

      {/* ── Auth modal ──────────────────────────────────────────── */}
      {authOpen && (
        <div
          className="fixed inset-0 z-[200] bg-black/10 flex items-center justify-center p-4"
          onClick={() => { setAuthOpen(false); setAuthError(null); setAuthSuccessMsg(null); setAuthEmail(''); setAuthPassword(''); }}
        >
          <div
            className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-black/8 p-6"
            onClick={(e) => e.stopPropagation()}
            style={{ animation: 'scale-in 0.15s var(--ease-out-expo) both' }}
          >
            {/* Close */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-black">
                {authMode === 'login' ? 'Sign in' : 'Create account'}
              </h2>
              <button
                onClick={() => { setAuthOpen(false); setAuthError(null); setAuthSuccessMsg(null); setAuthEmail(''); setAuthPassword(''); }}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-black/40 hover:text-black active:scale-[0.97] transition-all duration-150"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Google OAuth */}
            <button
              onClick={async () => {
                setAuthLoading(true);
                setAuthError(null);
                setAuthSuccessMsg(null);
                try {
                  const { error } = await withTimeout(
                    supabase.auth.signInWithOAuth({ provider: 'google' }),
                    20000
                  );
                  if (error) setAuthError(error.message);
                } catch (err) {
                  setAuthError(err.message);
                }
                setAuthLoading(false);
              }}
              disabled={authLoading}
              className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl border border-black/10 text-sm text-black/60 hover:border-black/25 hover:text-black active:scale-[0.98] transition-all duration-150 disabled:opacity-40"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              {authLoading ? 'Connecting…' : `Continue with Google`}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 border-t border-black/8" />
              <span className="text-[11px] text-black/30 uppercase tracking-wider">or</span>
              <div className="flex-1 border-t border-black/8" />
            </div>

            {/* Email / Password form */}
            <div className="space-y-3">
              <div>
                <input
                  type="email"
                  placeholder="Email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="w-full bg-white text-black text-sm rounded-xl px-3.5 py-2.5 outline-none placeholder:text-black/30 border border-black/10 focus:border-black/25 transition-all duration-150"
                />
              </div>
              <div>
                <input
                  type="password"
                  placeholder="Password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') document.getElementById('auth-submit')?.click(); }}
                  className="w-full bg-white text-black text-sm rounded-xl px-3.5 py-2.5 outline-none placeholder:text-black/30 border border-black/10 focus:border-black/25 transition-all duration-150"
                />
              </div>

              {authError && (
                <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[11px] text-red-600">
                  {authError}
                </div>
              )}

              {authSuccessMsg && (
                <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-600">
                  {authSuccessMsg}
                </div>
              )}

              {authMode === 'register' && !authSuccessMsg && (
                <div className="px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-[11px] text-blue-600 leading-relaxed">
                  After registering, check your email to confirm your account before signing in.
                </div>
              )}

              <button
                id="auth-submit"
                onClick={async () => {
                  if (!authEmail || !authPassword) return;
                  setAuthLoading(true);
                  setAuthError(null);
                  setAuthSuccessMsg(null);
                  try {
                    const result = await withTimeout(
                      authMode === 'login'
                        ? supabase.auth.signInWithPassword({ email: authEmail, password: authPassword })
                        : supabase.auth.signUp({ email: authEmail, password: authPassword }),
                      20000
                    );
                    const { data, error } = result;
                    if (error) {
                      setAuthError(error.message);
                    } else if (authMode === 'register' && !data.session) {
                      // Email confirmation required — Supabase created the user but no session
                      setAuthSuccessMsg('Account created! Check your email to confirm your sign-in.');
                      setAuthEmail('');
                      setAuthPassword('');
                    } else {
                      setAuthOpen(false);
                      setAuthEmail('');
                      setAuthPassword('');
                    }
                  } catch (err) {
                    setAuthError(err.message);
                  }
                  setAuthLoading(false);
                }}
                disabled={authLoading || !authEmail || !authPassword}
                className="w-full py-2.5 rounded-xl bg-black text-white text-sm font-medium active:scale-[0.98] transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-black/85"
              >
                {authLoading ? 'Please wait…' : authMode === 'login' ? 'Sign in' : 'Create account'}
              </button>

              <p className="text-center text-xs text-black/40">
                {authMode === 'login' ? (
                  <>Don&apos;t have an account?{' '}
                    <button onClick={() => { setAuthMode('register'); setAuthError(null); }} className="underline hover:text-black transition-colors duration-150">
                      Register
                    </button>
                  </>
                ) : (
                  <>Already have an account?{' '}
                    <button onClick={() => { setAuthMode('login'); setAuthError(null); }} className="underline hover:text-black transition-colors duration-150">
                      Sign in
                    </button>
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Image lightbox ──────────────────────────────────────── */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
          onKeyDown={(e) => e.key === 'Escape' && setLightboxUrl(null)}
          tabIndex={0}
        >
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/15 flex items-center justify-center text-white/70 hover:bg-white/25 hover:text-white transition-all duration-150"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
          <img
            src={lightboxUrl}
            alt="Enlarged"
            className="max-w-full max-h-full rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
