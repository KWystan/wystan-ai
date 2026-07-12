import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabase } from '../lib/supabase.js';
import Sidebar from './Sidebar.jsx';

// Import animated SVG logo for welcome screen
const aiSparkSvg = new URL('../assets/AI Spark_ Interactive Assistant.svg', import.meta.url).href;

/* ── Large paste threshold — pastes >= this length are auto-converted
 *    to a .txt file and attached instead of rendered inline. ────── */
const LARGE_TEXT_THRESHOLD = 15000;

const MODELS = [
  { id: 'minimaxai/minimax-m3', name: 'MiniMax M3', multimodal: true },
  { id: 'deepseek-v4-flash-free', name: 'DeepSeek V4 Flash', multimodal: false },
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

/* ── File preview modal (overlay for viewing attached files) ───── */
function FilePreviewModal({ file, onClose }) {
  const [page, setPage] = useState(0);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!file) return null;

  const isImage = file.group === 'image';
  const isPdf = file.type === 'pdf' && file.pages?.length;
  const hasContent = !!file.content;

  const fileIcon = () => {
    if (file.type === 'image') return 'image';
    if (file.type === 'pdf') return 'picture_as_pdf';
    if (file.type === 'docx' || file.type === 'doc') return 'description';
    if (file.type === 'pptx' || file.type === 'ppt') return 'slideshow';
    if (file.type === 'xlsx' || file.type === 'xls' || file.type === 'csv' || file.type === 'tsv') return 'table_chart';
    if (file.type === 'code') return 'code';
    if (file.group === 'text') return 'article';
    return 'insert_drive_file';
  };

  return (
    <div
      className="fixed inset-0 z-[110] bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ──────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-black/8 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-[18px] text-black/40">
              {fileIcon()}
            </span>
            <span className="text-sm font-medium text-black truncate">{file.filename}</span>
            {file.language && (
              <span className="text-[10px] uppercase tracking-wider text-black/30 bg-black/5 rounded px-1.5 py-0.5 shrink-0">
                {file.language}
              </span>
            )}
            <span className="text-[11px] text-black/30 shrink-0">
              {(file.size / 1024).toFixed(1)} KB
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => {
                // Determine download URL: images use data, PDF pages use first page, others try content
                const href = file.data || file.pages?.[0] || null;
                if (!href) return;
                const a = document.createElement('a');
                a.href = href;
                a.download = file.filename;
                a.click();
              }}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-black/40 hover-gate:text-black hover-gate:bg-black/5 active:scale-[0.92] transition-all duration-150"
              aria-label="Download file"
            >
              <span className="material-symbols-outlined text-[18px]">download</span>
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-black/40 hover-gate:text-black hover-gate:bg-black/5 active:scale-[0.92] transition-all duration-150"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>

        {/* ── Body ────────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto min-h-0">
          {isImage && (
            <div className="flex items-center justify-center p-4">
              <img
                src={file.data}
                alt={file.filename}
                className="max-w-full max-h-[75vh] rounded-lg object-contain"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}

          {isPdf && (
            <div className="flex flex-col items-center p-4 gap-3">
              {/* Page navigation */}
              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-black/40 hover-gate:text-black hover-gate:bg-black/5 disabled:opacity-20 disabled:pointer-events-none active:scale-[0.92] transition-all duration-150"
                >
                  <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                </button>
                <span className="text-xs text-black/40 font-medium min-w-[4rem] text-center">
                  {page + 1} / {file.pages.length}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(file.pages.length - 1, p + 1))}
                  disabled={page >= file.pages.length - 1}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-black/40 hover-gate:text-black hover-gate:bg-black/5 disabled:opacity-20 disabled:pointer-events-none active:scale-[0.92] transition-all duration-150"
                >
                  <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                </button>
              </div>
              {/* Page screenshot */}
              <img
                src={file.pages[page]}
                alt={`Page ${page + 1}`}
                className="w-full max-w-2xl rounded-lg border border-black/8 shadow-sm"
              />
            </div>
          )}

          {hasContent && !isImage && (
            <pre className="p-4 text-[13px] leading-relaxed font-mono text-black/75 whitespace-pre-wrap overflow-x-auto">
              {file.content}
            </pre>
          )}

          {!isImage && !hasContent && !isPdf && (
            <div className="flex flex-col items-center justify-center p-8 text-black/40">
              <span className="material-symbols-outlined text-3xl mb-2">visibility_off</span>
              <p className="text-sm">No preview available for this file.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Code panel component (language label + copy button) ────────── */
function CodePanel({ language, codeString, children }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(codeString).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <div className="my-3 rounded-lg overflow-hidden border border-black/8 bg-[#f8f8f8]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-black/5 border-b border-black/8 select-none">
        <span className="text-[11px] font-medium text-black/40 uppercase tracking-wider">
          {language || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className="hover-gate:opacity-100 flex items-center gap-1 text-[11px] font-medium text-black/40 hover:text-black/60 transition-colors duration-150"
        >
          <span
            className="material-symbols-outlined text-[14px]"
            style={{ fontVariationSettings: "'wght' 280, 'opsz' 20" }}
          >
            {copied ? 'check' : 'content_copy'}
          </span>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {/* Code area */}
      <pre className="px-3 py-2.5 overflow-x-auto text-[13px] leading-relaxed font-mono text-black/75 whitespace-pre m-0 border-0 bg-transparent">
        <code className="text-[13px] font-mono">{children}</code>
      </pre>
    </div>
  );
}

function renderMessageText(text) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        p({ children }) {
          return <p className="my-1.5 first:mt-0 last:mb-0 leading-relaxed">{children}</p>;
        },
        pre({ children }) {
          // Detect fenced code blocks via the code child's className
          const codeChild = children?.props?.children;
          const className = children?.props?.className || '';
          const isFenced = className.startsWith('language-');

          if (isFenced) {
            const language = className.replace('language-', '');
            const codeString = String(codeChild || '');
            return (
              <CodePanel language={language} codeString={codeString}>
                {codeChild}
              </CodePanel>
            );
          }

          // Fallback: plain pre block (edge case like indented code)
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
              <code className="bg-black/5 border border-black/8 rounded px-1.5 py-0.5 text-[13px] font-mono text-black/70 whitespace-nowrap" {...props}>
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
        img({ src, alt }) {
          if (!src) return null;
          return (
            <img
              src={src}
              alt={alt || ''}
              className="w-full rounded-lg border border-black/8 my-2 cursor-pointer hover:opacity-90 transition-opacity duration-150"
              onClick={() => setLightboxUrl(src)}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
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
/* Build user-visible message content — file content is replaced with a
   terse reference so the bubble stays clean. Images get their own array
   part (displayed as thumbnails above the bubble); text files appear as a
   card-style reference that the system can read from the full payload. */
function buildUserContent(text, isMultimodal, attachedFiles) {
  if (!attachedFiles || attachedFiles.length === 0) return text;

  if (isMultimodal) {
    const content = [{ type: 'text', text }];
    for (const file of attachedFiles) {
      if (file.group === 'image') {
        content.push({ type: 'image_url', image_url: { url: file.data } });
      } else {
        content[0].text += `\n\n[📎 ${file.filename}]`;
      }
    }
    return content;
  }

  // Text-only model: flat string with references
  const parts = attachedFiles.map((f) => {
    if (f.group === 'image') return `[Attached image: ${f.filename}]`;
    return `[📎 ${f.filename}]`;
  });
  return parts.join('\n') + '\n' + text;
}

/* Build the full API payload content — same structure but includes the
   actual file text so the AI can read it. Used only at send-time, not
   stored in the rendered message. */
function buildApiContent(text, isMultimodal, attachedFiles) {
  if (!attachedFiles || attachedFiles.length === 0) return text;

  if (isMultimodal) {
    const content = [{ type: 'text', text }];
    for (const file of attachedFiles) {
      if (file.group === 'image') {
        content.push({ type: 'image_url', image_url: { url: file.data } });
      } else if (file.content) {
        const language = file.language ? ` (${file.language})` : '';
        content[0].text += `\n\n--- ${file.filename}${language} ---\n${file.content}`;
      } else {
        content[0].text += `\n\n[📎 ${file.filename}]`;
      }
    }
    return content;
  }

  // Text-only model: flat string with full content
  const parts = attachedFiles.map((f) => {
    if (f.group === 'image') return `[Attached image: ${f.filename}]`;
    if (f.content) {
      const lang = f.language ? ` (${f.language})` : '';
      return `[${f.filename}${lang}]\n${f.content}`;
    }
    return `[📎 ${f.filename}]`;
  });
  return parts.join('\n') + '\n' + text;
}

/* Extract just the text from a possibly-array user message (for editing).
   When editing a multimodal/PDF message we only recover the text portion. */
function userTextFromContent(content) {
  const text = Array.isArray(content)
    ? content.filter((p) => p.type === 'text').map((p) => p.text).join('\n')
    : content;
  return stripFileRefs(text || '');
}

/* Render user bubble text — images are handled separately above the bubble. */
function renderUserContent(content) {
  const text = Array.isArray(content)
    ? content.filter((p) => p.type === 'text').map((p) => p.text).join('\n')
    : content;
  return stripFileRefs(text || '');
}

/* ── Extract file reference markers from user message content ── */
function extractFileRefs(content) {
  if (!content) return [];
  const text = typeof content === 'string' ? content
    : Array.isArray(content)
      ? content.filter((p) => p.type === 'text').map((p) => p.text).join('\n')
      : '';

  const refs = [];
  const refRe = /\[📎 ([^\]]+)\]/g;
  let m;
  while ((m = refRe.exec(text)) !== null) refs.push({ filename: m[1], group: 'file' });
  const imgRe = /\[Attached image: ([^\]]+)\]/g;
  while ((m = imgRe.exec(text)) !== null) refs.push({ filename: m[1], group: 'image' });
  return refs;
}

/* ── Strip file reference markers from display text ────────── */
function stripFileRefs(text) {
  if (!text) return text;
  return text
    .replace(/\[📎 ([^\]]+)\]\n?/g, '')
    .replace(/\[Attached image: ([^\]]+)\]\n?/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* ── Pick a Material Symbols icon for a given filename ──────── */
function iconForFilename(filename) {
  const ext = filename?.split('.').pop()?.toLowerCase();
  if (!ext) return 'description';
  const image = ['png','jpg','jpeg','gif','webp','svg','bmp'];
  const pdf = ['pdf'];
  const doc = ['docx','doc'];
  const slide = ['pptx','ppt'];
  const table = ['xlsx','xls','csv','tsv','ods'];
  const code = ['js','jsx','ts','tsx','py','rb','java','c','cpp','cs','go','rs','swift','kt','php','html','css','scss','less','sql','sh','bash','yaml','yml','xml','json','md','r'];
  if (image.includes(ext)) return 'image';
  if (pdf.includes(ext)) return 'picture_as_pdf';
  if (doc.includes(ext)) return 'description';
  if (slide.includes(ext)) return 'slideshow';
  if (table.includes(ext)) return 'table_chart';
  if (code.includes(ext)) return 'code';
  return 'description';
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
  const [previewFile, setPreviewFile] = useState(null);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [activeMode, setActiveMode] = useState(null); // 'search' | 'generate' | null
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [pasteConverting, setPasteConverting] = useState(false);
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
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState(null); // 'searching' | 'generating' | null
  const [uploadProgress, setUploadProgress] = useState(null); // { current: number, total: number } | null
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const abortRef = useRef(null);
  const fileInputRef = useRef(null);
  const dragCounterRef = useRef(0);
  const pasteLockRef = useRef(false);
  const visibleConversationRef = useRef(null); // which conversation the user is viewing
  const { conversationId: urlConversationId } = useParams();
  /* ── Load conversation from URL param ──────────────────── */
  useEffect(() => {
    if (!urlConversationId) return;

    let cancelled = false;

    setCurrentConversationId(urlConversationId);
    visibleConversationRef.current = urlConversationId;
    setMessages([]);
    setError(null);
    setIsLoading(false);
    setSidebarOpen(false);
    setAttachedFiles([]);
    setLoadingMessages(true);

    supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', urlConversationId)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoadingMessages(false);
        if (!error && data && data.length > 0) {
          setMessages(data);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadingMessages(false);
        console.error('Failed to load messages:', err);
        setError('Failed to load messages: ' + err.message);
      });

    return () => { cancelled = true; };
  }, [urlConversationId]);

  /* ── Accept initial text from navigation state ────────── */
  useEffect(() => {
    if (urlConversationId) return;
    const state = window.history.state?.usr;
    if (state?.initialText) {
      setInput(state.initialText);
    }
  }, []); // once on mount

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
    el.style.height = Math.min(el.scrollHeight, 300) + 'px';
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

    /* Auto-switch to MiniMax M3 when *images* are attached — text-only
       models can't display images, but they handle code/doc text fine. */
    const hasImages = attachedFiles.some((f) => f.group === 'image');
    const effectiveModel = hasImages
      ? MODELS.find((m) => m.multimodal)?.id || selectedModel
      : selectedModel;
    const isMultimodal = MODELS.find((m) => m.id === effectiveModel)?.multimodal;

    /* ── Mode dispatch: generate, search, or normal ────── */
    if (activeMode === 'generate') {
      const promptText = text;
      setActiveMode(null);

      /* Add user message with their prompt */
      const userMsg = { role: 'user', content: promptText };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setIsLoading(true);
      setError(null);

      try {
        setLoadingPhase('generating');
        const genRes = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: promptText, width: 1024, height: 1024, steps: 4 }),
        });

        if (!genRes.ok) {
          const errData = await genRes.json().catch(() => ({}));
          throw new Error(errData.error || 'Image generation failed');
        }

        const genData = await genRes.json();
        const artifacts = Array.isArray(genData) ? genData : genData.artifacts || genData.data || [];

        if (artifacts.length === 0) {
          throw new Error('No image was generated. Please try again.');
        }

        /* Store generated images as data URLs alongside a text summary */
        const imageDataUrls = artifacts
          .map((img) => {
            const src = img.base64 || img.image || img.url;
            if (!src) return null;
            return src.startsWith('data:') ? src : `data:image/png;base64,${src}`;
          })
          .filter(Boolean);

        setMessages((prev) => [...prev, { role: 'assistant', content: '', generatedImages: imageDataUrls }]);

        /* ── Save to Supabase ────────────────────────────── */
        if (effectiveConversationId) {
          try {
            await supabase.from('messages').insert([
              { conversation_id: effectiveConversationId, role: 'user', content: promptText },
              { conversation_id: effectiveConversationId, role: 'assistant', content: `![Generated image](${imageDataUrls[0] || ''})` },
            ]);
            await supabase
              .from('conversations')
              .update({ updated_at: new Date().toISOString() })
              .eq('id', effectiveConversationId);
            setConversationRefetchKey((k) => k + 1);
          } catch (err) {
            console.error('Failed to save generated messages:', err);
          }
        }
      } catch (err) {
        setError(err.message);
        setMessages((prev) => [...prev, { role: 'assistant', content: `Image generation failed: ${err.message}` }]);
      } finally {
        setLoadingPhase(null);
        setIsLoading(false);
      }
      return;
    }

    let searchText = null;
    const modeText = text;
    if (activeMode === 'search') {
      searchText = text;
      setActiveMode(null);
    }

    const userMsg = { role: 'user', content: buildUserContent(modeText, isMultimodal, attachedFiles), files: attachedFiles };
    let updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    setIsLoading(true);
    setError(null);
    setAttachedFiles([]);

    /* ── Web search (if /search mode) ─────────────────────── */
    if (searchText) {
      setLoadingPhase('searching');
      try {
        const searchRes = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: searchText }),
        });
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          if (searchData.results?.length > 0) {
            const lines = searchData.results.map((r, i) =>
              `${i + 1}. ${r.title}\n   ${(r.content || '').slice(0, 500)}`
            );
            const summary = searchData.answer ? `\n\nSummary: ${searchData.answer}` : '';
            const searchMsg = {
              role: 'user',
              content: `[Web search results for "${searchText}"]\n${lines.join('\n')}${summary}`,
            };
            updated = [...updated.slice(0, -1), searchMsg, userMsg];
            setMessages(updated);
          }
        }
      } catch (err) {
        console.error('Web search failed:', err);
      }
      setLoadingPhase(null);
    }

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
  }, [input, isLoading, messages, selectedModel, attachedFiles, user, currentConversationId, activeMode]);

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
    setMessages([]);
    setError(null);
    setIsLoading(false);
    setSidebarOpen(false);
    setAttachedFiles([]);
    setLoadingMessages(true);

    /* Load saved messages from Supabase */
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('role, content')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      setLoadingMessages(false);
      if (!error && data && data.length > 0) {
        setMessages(data);
      }
    } catch (err) {
      setLoadingMessages(false);
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

    setIsUploading(true);
    setError(null);
    setUploadProgress({ current: 0, total: files.length });
    const results = [];

    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data.error || `Upload failed (${res.status})`);
        }
        results.push(data);
      } catch (err) {
        setError(err.message.includes('413') || err.message.includes('too large')
          ? `"${file.name}" is too large. Maximum file size is 10 MB.`
          : `Failed to upload "${file.name}": ${err.message}`);
      }
      setUploadProgress(prev => prev ? { ...prev, current: prev.current + 1 } : null);
    }

    if (results.length > 0) {
      setAttachedFiles((prev) => [...prev, ...results]);
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setUploadProgress(null);
    setIsUploading(false);
  };

  const handleOpenModeMenu = () => {
    setModeMenuOpen((p) => !p);
  };

  /* ── Large paste → file attachment ───────────────────────── */
  const handlePaste = useCallback(async (e) => {
    if (pasteLockRef.current) return;
    const pastedText = e.clipboardData.getData('text/plain');
    if (!pastedText || pastedText.length < LARGE_TEXT_THRESHOLD) return;

    e.preventDefault();
    pasteLockRef.current = true;
    setPasteConverting(true);

    const filename = `pasted-text-${new Date().toISOString().slice(0, 10)}.txt`;
    const blob = new Blob([pastedText], { type: 'text/plain' });
    const file = new File([blob], filename, { type: 'text/plain' });
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      const data = await res.json();
      setAttachedFiles((prev) => [...prev, data]);
    } catch (err) {
      // Upload failed — insert the text inline so it's not lost
      setInput((prev) => prev + pastedText);
      setError(`Paste upload failed — text inserted inline instead.`);
    } finally {
      pasteLockRef.current = false;
      setPasteConverting(false);
    }
  }, []);

  /* ── Drag & drop ────────────────────────────────────────── */
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return;

    setIsUploading(true);
    setError(null);
    setUploadProgress({ current: 0, total: files.length });
    const results = [];

    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data.error || `Upload failed (${res.status})`);
        }
        results.push(data);
      } catch (err) {
        setError(err.message.includes('413') || err.message.includes('too large')
          ? `"${file.name}" is too large. Maximum file size is 10 MB.`
          : `Failed to upload "${file.name}": ${err.message}`);
      }
      setUploadProgress(prev => prev ? { ...prev, current: prev.current + 1 } : null);
    }

    if (results.length > 0) {
      setAttachedFiles((prev) => [...prev, ...results]);
    }

    setUploadProgress(null);
    setIsUploading(false);
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
      <div
        className="flex-1 flex flex-col min-w-0 h-full relative"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* ── Drop overlay ──────────────────────────────────────── */}
        {isDragging && (
          <div className="absolute inset-0 z-[100] bg-black/[0.04] flex items-center justify-center pointer-events-none">
            <div className="flex flex-col items-center gap-2 p-6 rounded-2xl bg-white/80 backdrop-blur-md border border-dashed border-black/20 shadow-sm">
              <span className="material-symbols-outlined text-2xl text-black/30">add_photo_alternate</span>
              <span className="text-sm text-black/50">Drop files to attach</span>
            </div>
          </div>
        )}

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
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="max-w-3xl mx-auto px-4 py-6 w-full">
            {messages.length === 0 ? (
              loadingMessages ? (
                /* ── Loading skeleton ──────────────────────────────── */
                <div className="max-w-2xl mx-auto pt-16 space-y-5">
                  {/* Assistant skeleton */}
                  <div className="flex justify-start">
                    <div className="max-w-[75%] flex gap-2.5">
                      <div className="w-7 h-7 rounded-lg flex-shrink-0 mt-1 bg-black/5 animate-pulse" />
                      <div className="flex-1 space-y-2.5 py-1">
                        <div className="h-3.5 bg-black/5 rounded-full w-3/4 animate-pulse" />
                        <div className="h-3.5 bg-black/5 rounded-full w-1/2 animate-pulse" />
                      </div>
                    </div>
                  </div>
                  {/* User skeleton */}
                  <div className="flex justify-end">
                    <div className="max-w-[60%]">
                      <div className="h-10 bg-black/8 rounded-2xl rounded-br-md animate-pulse" />
                    </div>
                  </div>
                  {/* Assistant skeleton */}
                  <div className="flex justify-start">
                    <div className="max-w-[75%] flex gap-2.5">
                      <div className="w-7 h-7 rounded-lg flex-shrink-0 mt-1 bg-black/5 animate-pulse" />
                      <div className="flex-1 space-y-2.5 py-1">
                        <div className="h-3.5 bg-black/5 rounded-full w-5/6 animate-pulse" />
                        <div className="h-3.5 bg-black/5 rounded-full w-2/3 animate-pulse" />
                        <div className="h-3.5 bg-black/5 rounded-full w-1/3 animate-pulse" />
                      </div>
                    </div>
                  </div>
                  {/* User skeleton */}
                  <div className="flex justify-end">
                    <div className="max-w-[55%]">
                      <div className="h-12 bg-black/8 rounded-2xl rounded-br-md animate-pulse" />
                    </div>
                  </div>
                </div>
              ) : (
              /* ── Welcome screen ─────────────────────────────────── */
              <div
                className="flex-1 flex flex-col items-center justify-center min-h-[70vh] text-center"
                style={{ animation: 'fade-up 0.4s var(--ease-out-expo) both' }}
              >
                <div className="w-28 h-28 rounded-2xl mb-5 overflow-hidden">
                  <img src={aiSparkSvg} alt="AI Spark" className="w-full h-full object-cover" />
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
            )) : (
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
                        /* ── Search results block ──────────────────── */
                        typeof msg.content === 'string' && msg.content.startsWith('[Web search results for') ? (
                          <div className="max-w-[80%]">
                            <div className="bg-blue-50 border border-blue-100 rounded-2xl rounded-br-md px-3.5 py-2.5 text-[11px] leading-relaxed whitespace-pre-wrap">
                              <div className="flex items-center gap-1.5 mb-1.5 text-black/40">
                                <span className="material-symbols-outlined text-[13px]">travel_explore</span>
                                <span className="font-medium text-[10px] uppercase tracking-wider">Web Search</span>
                              </div>
                              <div className="text-black/65">{msg.content.replace(/^\[Web search results for ".+"\]\n?/, '')}</div>
                            </div>
                          </div>
                        ) : (
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

                          {/* File chips — same design as input area, above the dark bubble */}
                          {(() => {
                            const hasImageThumbnails = Array.isArray(msg.content) && msg.content.some(p => p.type === 'image_url');
                            let chips = msg.files; // rich metadata from current session
                            if (!chips || chips.length === 0) {
                              const refs = extractFileRefs(msg.content);
                              if (refs.length > 0) chips = refs;
                            }
                            if (hasImageThumbnails) chips = chips?.filter(f => f.group !== 'image');
                            if (!chips || chips.length === 0) return null;

                            return (
                              <div className="flex flex-wrap gap-1.5 mb-2 justify-end">
                                {chips.map((ref, i) => (
                                  <div
                                    key={i}
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/5 border border-black/10 text-xs text-black/60"
                                  >
                                    <span className="material-symbols-outlined text-[14px] shrink-0">
                                      {iconForFilename(ref.filename)}
                                    </span>
                                    <span className="truncate max-w-[200px]">{ref.filename}</span>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}

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
                      )) : msg.content ? (
                        /* ── Assistant message ───────────────────────── */
                        <div className={`${msg.generatedImages?.length ? 'max-w-[90%] sm:max-w-[500px]' : 'max-w-[80%]'} flex gap-2.5`}>
                          <div className="w-7 h-7 rounded-lg flex-shrink-0 mt-0.5 overflow-hidden min-w-0">
                            <img src={aiSparkSvg} alt="" className="w-full h-full object-cover" />
                          </div>
                          <div className="relative group min-w-0 overflow-x-auto">
                            <div className={`border border-black/8 rounded-2xl rounded-bl-md text-sm leading-relaxed text-black/70 ${msg.generatedImages?.length ? 'pb-1' : 'px-4 pb-8 pt-3'}`}>
                              {msg.generatedImages?.length > 0 && (
                                <div className="space-y-2">
                                  {msg.generatedImages.map((url, i) => (
                                    <img
                                      key={i}
                                      src={url}
                                      alt={`Generated ${i + 1}`}
                                      className="w-full rounded-lg border border-black/8 cursor-pointer hover:opacity-90 transition-opacity duration-150"
                                      onClick={() => setLightboxUrl(url)}
                                    />
                                  ))}
                                </div>
                              )}
                              {msg.content && (
                                <div className="whitespace-nowrap min-w-0" style={{ overflowX: 'auto' }}>
                                  {renderMessageText(msg.content)}
                                </div>
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
                      ) : null}
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
                {isLoading && (
                  <div className="flex items-center gap-2.5 px-4 py-2 mt-2">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-black/30 animate-bounce" style={{ animationDelay: '0s' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-black/30 animate-bounce" style={{ animationDelay: '0.15s' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-black/30 animate-bounce" style={{ animationDelay: '0.3s' }} />
                    </div>
                    <span className="text-xs text-black/40">
                      {loadingPhase === 'searching' ? 'Searching the web…'
                        : loadingPhase === 'generating' ? 'Generating image…'
                        : 'Thinking'}
                    </span>
                  </div>
                )}
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
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/5 border border-black/10 text-xs text-black/60 cursor-pointer hover-gate:bg-black/10 hover-gate:border-black/20 transition-all duration-150 group"
                    onClick={() => setPreviewFile(f)}
                  >
                    <span className="material-symbols-outlined text-[14px] shrink-0">
                      {f.group === 'image' ? 'image' : f.type === 'pdf' ? 'picture_as_pdf' : f.language ? 'code' : f.type === 'docx' || f.type === 'doc' ? 'description' : f.type === 'pptx' || f.type === 'ppt' ? 'slideshow' : f.group === 'table' ? 'table_chart' : 'description'}
                    </span>
                    <span className="truncate max-w-[120px] group-hover:max-w-none transition-all duration-150">
                      {f.filename}
                      {f.type === 'pdf' && f.pages && (
                        <span className="ml-1 text-black/30">· {f.pages.length}p</span>
                      )}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setAttachedFiles((prev) => prev.filter((_, j) => j !== i));
                      }}
                      className="text-black/40 hover-gate:text-black ml-0.5"
                      aria-label="Remove file"
                    >
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
            {/* Upload progress */}
            {uploadProgress && (
              <div className="mb-2 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/[0.03] border border-black/8 text-[11px] text-black/50">
                <span className="material-symbols-outlined text-[14px] animate-spin shrink-0">progress_activity</span>
                <span className="flex-1">Uploading {uploadProgress.current + 1} of {uploadProgress.total}…</span>
                <div className="w-16 h-1 rounded-full bg-black/8 overflow-hidden flex-shrink-0">
                  <div
                    className="h-full rounded-full bg-black/30 transition-all duration-300"
                    style={{ width: `${((uploadProgress.current + 1) / uploadProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
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
                  className="absolute left-2 w-8 h-8 rounded-lg flex items-center justify-center text-black/50 hover:text-black disabled:text-black/20 active:scale-[0.97] transition-all duration-150 z-10"
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
                      style={{ animation: `scale-in 0.15s var(--ease-out-expo) both`, transformOrigin: 'bottom left' }}
                    >
                      <button
                        onClick={() => { setModeMenuOpen(false); fileInputRef.current?.click(); }}
                        className="w-full text-left px-3.5 py-1.5 text-xs text-black/55 hover-gate:text-black hover-gate:bg-black/[0.03] transition-colors duration-150 flex items-center gap-2.5"
                      >
                        <span className="material-symbols-outlined text-[16px]">attach_file</span>
                        Attach file
                      </button>
                      <button
                        onClick={() => { setModeMenuOpen(false); setActiveMode('generate'); textareaRef.current?.focus(); }}
                        className="w-full text-left px-3.5 py-1.5 text-xs text-black/55 hover-gate:text-black hover-gate:bg-black/[0.03] transition-colors duration-150 flex items-center gap-2.5"
                      >
                        <span className="material-symbols-outlined text-[16px]">image</span>
                        Generate
                      </button>
                      <button
                        onClick={() => { setModeMenuOpen(false); setActiveMode('search'); textareaRef.current?.focus(); }}
                        className="w-full text-left px-3.5 py-1.5 text-xs text-black/55 hover-gate:text-black hover-gate:bg-black/[0.03] transition-colors duration-150 flex items-center gap-2.5"
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
                  onPaste={handlePaste}
                  placeholder="Type a message..."
                  maxLength={10000}
                  rows={1}
                  disabled={isLoading}
                  className={`w-full bg-white text-black text-sm rounded-xl px-4 py-2.5 resize-none overflow-y-auto hide-scrollbar outline-none placeholder:text-black/30 border border-black/10 focus:border-black/25 transition-all duration-150 disabled:opacity-50 leading-relaxed ${
                    activeMode ? 'pl-36' : 'pl-12'
                  }`}
                />
                {input.length > 8000 && (
                  <div className={`absolute bottom-1 right-3 text-[10px] font-medium pointer-events-none ${
                    input.length > 9500 ? 'text-red-500' : 'text-amber-500'
                  }`}>
                    {input.length.toLocaleString()}/10,000
                  </div>
                )}
                {pasteConverting && (
                  <div className="absolute bottom-1 left-3 flex items-center gap-1.5 text-[10px] text-black/35 pointer-events-none">
                    <span className="material-symbols-outlined text-[12px] animate-spin">progress_activity</span>
                    Converting paste to file…
                  </div>
                )}
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

      {/* ── File preview modal ──────────────────────────────────── */}
      {previewFile && (
        <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
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
