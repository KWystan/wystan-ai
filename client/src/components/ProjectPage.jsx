import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { authFetch, getToken, clearTokens, signInWithGoogle, setTokens, parseOAuthTokensFromHash } from '../lib/auth.js';
import Sidebar from './Sidebar.jsx';
import FilePreviewModal from './FilePreviewModal.jsx';
import ImageLightbox from './ImageLightbox.jsx';

const aiSparkSvg = new URL('../assets/AI Spark_ Interactive Assistant.svg', import.meta.url).href;
const LARGE_TEXT_THRESHOLD = 15000;

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

/* ── User message helpers ──────────────────────────────────── */
function renderUserContent(content) {
  const text = Array.isArray(content)
    ? content.filter((p) => p.type === 'text').map((p) => p.text).join('\n')
    : content;
  return stripFileRefs(text || '');
}

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

function stripFileRefs(text) {
  if (!text) return text;
  return text
    .replace(/\[📎 ([^\]]+)\]\n?/g, '')
    .replace(/\[Attached image: ([^\]]+)\]\n?/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

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

/* ── User-visible content builder (short reference) ────────── */
function buildUserContent(text, isMultimodal, attachedFiles) {
  if (!attachedFiles || attachedFiles.length === 0) return text;

  if (isMultimodal) {
    const content = [];
    if (text) content.push({ type: 'text', text });
    for (const file of attachedFiles) {
      if (file.group === 'image') {
        content.push({ type: 'image_url', image_url: { url: file.data || file.content } });
      }
    }
    return content;
  }

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
  return parts.filter(Boolean).join('\n\n');
}

/* ── Build full API content (includes file text for LLM) ───── */
function buildApiContent(text, isMultimodal, attachedFiles) {
  if (!attachedFiles || attachedFiles.length === 0) return text;

  if (isMultimodal) {
    const content = [{ type: 'text', text }];
    for (const file of attachedFiles) {
      if (file.group === 'image') {
        content.push({ type: 'image_url', image_url: { url: file.data || file.content } });
      } else if (file.content) {
        const language = file.language ? ` (${file.language})` : '';
        content[0].text += `\n\n--- ${file.filename}${language} ---\n${file.content}`;
      } else {
        content[0].text += `\n\n[📎 ${file.filename}]`;
      }
    }
    return content;
  }

  const parts = [text || ''];
  for (const f of attachedFiles) {
    if (f.group === 'image') {
      parts.push(`[Attached image: ${f.filename}]`);
    } else if (f.content) {
      const lang = f.language ? ` (${f.language})` : '';
      parts.push(`[${f.filename}${lang}]\n${f.content}`);
    } else {
      parts.push(`[📎 ${f.filename}]`);
    }
  }
  return parts.filter(Boolean).join('\n\n');
}

/* ── Markdown renderer ──────────────────────────────────────── */
function renderMessageText(text, onImageClick) {
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
        img({ src, alt }) {
          if (!src) return null;
          return (
            <img
              src={src}
              alt={alt || ''}
              className="w-full rounded-lg border border-black/8 my-2 cursor-pointer hover:opacity-90 transition-opacity duration-150"
              onClick={() => onImageClick?.(src)}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          );
        },
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
  const [generatedImage, setGeneratedImage] = useState(null);

  /* -- ChatPage-ported state -- */
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [modelDropdownPos, setModelDropdownPos] = useState({ top: 0, left: 0 });
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pasteConverting, setPasteConverting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [loadingPhase, setLoadingPhase] = useState(null);

  /* -- Auth modal state -- */
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [authSuccessMsg, setAuthSuccessMsg] = useState(null);

  /* -- Sources state -- */
  const [activeTab, setActiveTab] = useState('conversations');
  const [sources, setSources] = useState([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [uploadingSource, setUploadingSource] = useState(false);
  const sourceFileInputRef = useRef(null);

  /* -- Refs -- */
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const abortRef = useRef(null);
  const modelButtonRef = useRef(null);
  const dragCounterRef = useRef(0);
  const pasteLockRef = useRef(false);

  /* ── Auth state ─────────────────────────────────────────── */
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

  /* -- Sources: fetch when tab switches -- */
  const fetchSources = useCallback(async () => {
    if (!id || !user) return;
    setSourcesLoading(true);
    try {
      const res = await authFetch(`/api/projects/${id}/sources`);
      if (res.ok) {
        const data = await res.json();
        setSources(data);
      }
    } catch (err) {
      console.error('Failed to fetch sources:', err);
    } finally {
      setSourcesLoading(false);
    }
  }, [id, user]);

  useEffect(() => {
    if (user) fetchSources();
  }, [fetchSources, user]);

  /* -- Upload source file (with better error handling) -- */
  const handleSourceUpload = useCallback(async (file) => {
    if (!file || !id) return;
    setUploadingSource(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await authFetch(`/api/projects/${id}/sources`, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        fetchSources();
      } else {
        /* Try JSON first, fall back to text for better debugging */
        const contentType = res.headers.get('content-type') || '';
        let errorMsg;
        try {
          if (contentType.includes('application/json')) {
            const data = await res.json();
            errorMsg = data.error || `Upload failed (HTTP ${res.status})`;
            if (data.hint) {
              errorMsg += '. ' + data.hint;
            } else if (data.detail) {
              errorMsg += ' Server: ' + data.detail;
            }
          } else {
            const text = await res.text();
            errorMsg = `Upload failed (HTTP ${res.status}) — server returned non-JSON response. Ensure the server has been restarted.`;
          }
        } catch {
          errorMsg = `Upload failed (HTTP ${res.status}) — response could not be parsed.`;
        }
        throw new Error(errorMsg);
      }
    } catch (err) {
      console.error('Source upload error:', err);
      alert('Failed to upload source: ' + err.message);
    } finally {
      setUploadingSource(false);
    }
  }, [id, fetchSources]);

  /* -- Delete source -- */
  const handleDeleteSource = useCallback(async (sourceId) => {
    if (!id) return;
    try {
      const res = await authFetch(`/api/projects/${id}/sources/${sourceId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setSources(prev => prev.filter(s => s.id !== sourceId));
      }
    } catch (err) {
      console.error('Source delete error:', err);
    }
  }, [id]);

  /* -- Auto-resize textarea -- */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 300) + 'px';
  }, [input]);

  /* ── Auto-scroll to bottom ─────────────────────────────── */
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

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
    if ((!text && attachedFiles.length === 0) || isLoading) return;

    const hasImages = attachedFiles.some((f) => f.group === 'image');
    const effectiveModel = hasImages
      ? MODELS.find((m) => m.multimodal)?.id || selectedModel
      : selectedModel;
    const isMultimodal = MODELS.find((m) => m.id === effectiveModel)?.multimodal;

    /* ── Create/update conversation (if logged in) ──────── */
    let convId = currentConversationId;
    const isFirstMessage = messages.length === 0;
    const title = text.length > 45 ? text.slice(0, 45) + '…' : text || (attachedFiles[0]?.filename || 'New chat');

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

    /* ── Generate mode ──────────────────────────────────── */
    if (activeMode === 'generate') {
      const promptText = text;
      setActiveMode(null);
      const userMsg = { role: 'user', content: promptText };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setIsLoading(true);
      setLoadingPhase('generating');
      setError(null);
      try {
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
        const imageDataUrls = artifacts
          .map((img) => {
            const src = img.base64 || img.image || img.url;
            if (!src) return null;
            return src.startsWith('data:') ? src : `data:image/png;base64,${src}`;
          })
          .filter(Boolean);
        setMessages((prev) => [...prev, { role: 'assistant', content: '', generatedImages: imageDataUrls }]);
        if (convId) {
          try {
            await authFetch(`/api/conversations/${convId}/messages`, {
              method: 'POST',
              body: JSON.stringify({
                messages: [
                  { role: 'user', content: promptText },
                  { role: 'assistant', content: `![Generated image](${imageDataUrls[0] || ''})` },
                ],
              }),
            });
          } catch { /* ignore */ }
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

    /* -- Build source context from project sources -- */
    const sourceContext = sources.length > 0
      ? sources.map(s =>
          "[" + (s.filename || "untitled") + "]\n" + (s.content || "").slice(0, 3000)
        ).join("\n\n")
      : "";

    const userMsgText = buildUserContent(modeText, isMultimodal, attachedFiles);
    const apiContent = buildApiContent(modeText + contextInfo + sourceContext, isMultimodal, attachedFiles);
    const userMsg = { role: 'user', content: userMsgText, files: attachedFiles };

    /* Add user message to state */
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setAttachedFiles([]);
    setActiveMode(null);

    /* Create assistant placeholder */
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
    setIsLoading(true);
    setIsSending(false);

    /* Build API payload */
    const payload = {
      model: effectiveModel,
      messages: [
        ...messages.slice(-20).map((m) => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content : m.content,
        })),
        { role: 'user', content: apiContent },
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
  }, [input, isLoading, messages, attachedFiles, user, currentConversationId, activeMode, id, saveMessagesToDb, sources, selectedModel]);

  /* ── Edit: load last user msg back, trim history ──────── */
  const handleEdit = (idx) => {
    if (isLoading) return;
    const content = messages[idx].content;
    const text = Array.isArray(content)
      ? content.filter((p) => p.type === 'text').map((p) => p.text).join('\n')
      : stripFileRefs(content || '');
    setInput(text || '');
    setMessages((prev) => prev.slice(0, idx));
    textareaRef.current?.focus();
  };

  /* ── Copy assistant message to clipboard ───────────────── */
  const handleCopy = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

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

  const handleOpenAuth = useCallback((mode) => {
    setAuthMode(mode || 'login');
    setAuthOpen(true);
  }, []);

  /* ── File upload handler (with progress) ────────────────── */
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
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
        results.push(data);
      } catch (err) {
        setError(err.message.includes('413') || err.message.includes('too large')
          ? `"${file.name}" is too large. Max 10 MB.`
          : `Failed to upload "${file.name}": ${err.message}`);
      }
      setUploadProgress(prev => prev ? { ...prev, current: prev.current + 1 } : null);
    }
    if (results.length > 0) setAttachedFiles((prev) => [...prev, ...results]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setUploadProgress(null);
    setIsUploading(false);
  };

  const handleOpenModeMenu = () => setModeMenuOpen((p) => !p);

  /* ── Large paste → file attachment ──────────────────────── */
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
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
        results.push(data);
      } catch (err) {
        setError(err.message.includes('413') || err.message.includes('too large')
          ? `"${file.name}" is too large. Max 10 MB.`
          : `Failed to upload "${file.name}": ${err.message}`);
      }
      setUploadProgress(prev => prev ? { ...prev, current: prev.current + 1 } : null);
    }
    if (results.length > 0) setAttachedFiles((prev) => [...prev, ...results]);
    setUploadProgress(null);
    setIsUploading(false);
  };

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
              <span className="material-symbols-outlined text-2xl text-black">add_photo_alternate</span>
              <span className="text-sm text-black">Drop files to attach</span>
            </div>
          </div>
        )}

        {/* ── Header bar ──────────────────────────────────────── */}
        <header className="flex-shrink-0 bg-white/90 backdrop-blur-md">
          <div className="px-4 h-12 flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center text-black hover-gate:text-black active:scale-[0.97] transition-all duration-150 [backface-visibility:hidden]"
              aria-label="Open sidebar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" className="text-[20px]"><path d="M0 0h24v24H0z" fill="none" /><path fill="currentColor" d="M2 5.995c0-.55.446-.995.995-.995h8.01a.995.995 0 0 1 0 1.99h-8.01A.995.995 0 0 1 2 5.995M2 12c0-.55.446-.995.995-.995h18.01a.995.995 0 1 1 0 1.99H2.995A.995.995 0 0 1 2 12m.995 5.01a.995.995 0 0 0 0 1.99h12.01a.995.995 0 0 0 0-1.99z" /></svg>
            </button>

            {/* ── Model dropdown trigger ──────────────────────────── */}
            <button
              ref={modelButtonRef}
              onClick={() => {
                if (!modelDropdownOpen && modelButtonRef.current) {
                  const rect = modelButtonRef.current.getBoundingClientRect();
                  setModelDropdownPos({ top: rect.bottom + 6, left: rect.left });
                }
                setModelDropdownOpen(!modelDropdownOpen);
              }}
              className="flex items-center gap-1 text-sm font-medium text-black hover-gate:text-black active:scale-[0.97] transition-all duration-150"
            >
              {MODELS.find((m) => m.id === selectedModel)?.name}
              <span className="material-symbols-outlined text-[14px] text-black">expand_more</span>
            </button>
          </div>
        </header>

        {/* ── Body ────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-6 w-full">
            {loading ? (
              <div className="flex items-center justify-center min-h-[50vh]">
                <div className="flex gap-1.5">
                  <span className="animate-blink size-1.5 rounded-full bg-black/25" />
                  <span className="animate-blink size-1.5 rounded-full bg-black/25" style={{ animationDelay: '0.2s' }} />
                  <span className="animate-blink size-1.5 rounded-full bg-black/25" style={{ animationDelay: '0.4s' }} />
                </div>
              </div>
            ) : error && showLanding ? (
              <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
                <span className="material-symbols-outlined text-3xl text-red-300 mb-3">folder_off</span>
                <p className="text-sm text-red-500 mb-1">Failed to load project</p>
                <p className="text-xs text-black mb-4">{error}</p>
                <Link to="/chat" className="text-xs underline text-black hover:text-black transition-colors duration-150">
                  Back to chat
                </Link>
              </div>
            ) : !project && showLanding ? (
              <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
                <span className="material-symbols-outlined text-3xl text-black mb-3">folder_off</span>
                <p className="text-sm text-black mb-1">Project not found</p>
                <p className="text-xs text-black mb-4">This project may have been deleted.</p>
                <Link to="/chat" className="text-xs underline text-black hover:text-black transition-colors duration-150">
                  Back to chat
                </Link>
              </div>
            ) : showLanding ? (
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

                {/* ── Tabs: Conversations | Sources ── */}
                <div className="mt-6">
                  <div className="flex items-center gap-0.5 mb-3 px-1">
                    <button
                      onClick={() => setActiveTab('conversations')}
                      className={`text-[11px] font-medium uppercase tracking-wider px-2 py-1 rounded-lg transition-all duration-150 ${
                        activeTab === 'conversations'
                          ? 'text-black bg-black/[0.06]'
                          : 'text-black hover:text-black'
                      }`}
                    >
                      Conversations
                      {conversations.length > 0 && (
                        <span className="ml-1.5 text-[10px] text-black">({conversations.length})</span>
                      )}
                    </button>
                    <button
                      onClick={() => setActiveTab('sources')}
                      className={`text-[11px] font-medium uppercase tracking-wider px-2 py-1 rounded-lg transition-all duration-150 ${
                        activeTab === 'sources'
                          ? 'text-black bg-black/[0.06]'
                          : 'text-black hover:text-black'
                      }`}
                    >
                      Sources
                      {sources.length > 0 && (
                        <span className="ml-1.5 text-[10px] text-black">({sources.length})</span>
                      )}
                    </button>
                  </div>

                  {activeTab === 'conversations' && (
                    <>
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
                    </>
                  )}

                  {activeTab === 'sources' && (
                    <>
                      {user ? (
                        <>
                          <div
                            onClick={() => sourceFileInputRef.current?.click()}
                            className="border-2 border-dashed border-black/10 rounded-xl px-4 py-6 text-center cursor-pointer hover:border-black/25 transition-all duration-150 mb-3"
                          >
                            <input
                              ref={sourceFileInputRef}
                              type="file"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleSourceUpload(file);
                                e.target.value = '';
                              }}
                              className="hidden"
                              accept=".pdf,.docx,.pptx,.xlsx,.xls,.csv,.tsv,.txt,.json,.xml,.md"
                            />
                            <span className="material-symbols-outlined text-2xl text-black mb-2">cloud_upload</span>
                            <p className="text-sm text-black mb-1">
                              {uploadingSource ? 'Uploading...' : 'Upload a document'}
                            </p>
                            <p className="text-xs text-black">
                              PDF, DOCX, TXT, PPTX, XLSX &middot; 10 MB max
                            </p>
                          </div>
                          {sourcesLoading ? (
                            <div className="flex items-center justify-center py-8">
                              <span className="animate-blink size-1.5 rounded-full bg-black/25" />
                            </div>
                          ) : sources.length === 0 ? (
                            <div className="px-4 py-8 text-center">
                              <span className="material-symbols-outlined text-2xl text-black mb-2">description</span>
                              <p className="text-xs text-black">No sources added yet.</p>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              {sources.map((source) => (
                                <div
                                  key={source.id}
                                  className="w-full text-left px-3.5 py-2.5 rounded-xl border border-black/8 text-sm text-black flex items-center gap-3"
                                >
                                  <span className="material-symbols-outlined text-[16px] text-black flex-shrink-0">description</span>
                                  <span className="truncate flex-1">{source.filename}</span>
                                  <button
                                    onClick={() => handleDeleteSource(source.id)}
                                    className="text-black hover:text-red-500 transition-colors duration-150 flex-shrink-0"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">close</span>
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="px-4 py-8 text-center">
                          <span className="material-symbols-outlined text-2xl text-black mb-2">lock</span>
                          <p className="text-xs text-black">Sign in to add sources to your project.</p>
                        </div>
                      )}
                    </>
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
                      {msg.role === 'user' ? (
                        /* ── User message ──────────────────────────── */
                        <div className="max-w-[80%] relative group">
                          {/* Image thumbnails from multimodal content */}
                          {Array.isArray(msg.content) && (
                            <div className="flex flex-wrap gap-2 mb-2 justify-end">
                              {msg.content.filter((p) => p.type === 'image_url').map((img, imgIdx) => (
                                <img
                                  key={imgIdx}
                                  src={img.image_url.url}
                                  alt={`attachment ${imgIdx + 1}`}
                                  className="max-h-48 rounded-xl border border-black/8 cursor-pointer hover:opacity-90 transition-opacity duration-150"
                                  onClick={() => setLightboxUrl(img.image_url.url)}
                                />
                              ))}
                            </div>
                          )}

                          {/* File chips */}
                          {(() => {
                            const hasImageThumbnails = Array.isArray(msg.content) && msg.content.some(p => p.type === 'image_url');
                            let chips = msg.files;
                            if (!chips || chips.length === 0) {
                              const refs = extractFileRefs(msg.content);
                              if (refs.length > 0) chips = refs;
                            }
                            if (hasImageThumbnails) chips = chips?.filter(f => f.group !== 'image');
                            if (!chips || chips.length === 0) return null;
                            return (
                              <div className="flex flex-wrap gap-1.5 mb-2 justify-end">
                                {chips.map((ref, j) => (
                                  <div
                                    key={j}
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/5 border border-black/10 text-xs text-black"
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

                          {/* User text bubble */}
                          {(() => {
                            const hasText = (c) => {
                              if (typeof c === 'string') return c.trim().length > 0;
                              if (Array.isArray(c)) return c.some(p => p.type === 'text' && p.text.trim().length > 0);
                              return false;
                            };
                            return hasText(msg.content);
                          })() && (
                            <>
                              <div className="bg-black text-white rounded-2xl rounded-br-md px-4 py-3 pr-10 text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
                                {renderUserContent(msg.content)}
                              </div>
                              {/* Edit button on last user msg */}
                              {!isLoading && i === messages.length - 1 && (
                                <button
                                  onClick={() => handleEdit(i)}
                                  className="absolute bottom-1.5 right-1.5 opacity-0 group-hover:opacity-100 w-7 h-7 rounded-md flex items-center justify-center text-white/50 hover-gate:text-white active:scale-[0.92] transition-all duration-150"
                                  aria-label="Edit message"
                                >
                                  <span className="material-symbols-outlined text-[14px]">edit</span>
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      ) : (
                        /* ── Assistant message ─────────────────────── */
                        <div className={`${msg.generatedImages?.length ? 'max-w-[90%] sm:max-w-[500px]' : 'max-w-[95%] sm:max-w-[85%]'} flex gap-2.5`}>
                          <div className="w-7 h-7 rounded-lg flex-shrink-0 mt-0.5 overflow-hidden min-w-0">
                            <img src={aiSparkSvg} alt="" className="w-full h-full object-cover" />
                          </div>
                          <div className="relative group min-w-0">
                            <div className={`border border-black/8 rounded-2xl rounded-bl-md text-sm leading-normal text-black [overflow-wrap:anywhere] ${msg.generatedImages?.length ? 'pb-1' : 'px-3 md:px-4 pb-6 md:pb-8 pt-3'}`}>
                              {msg.generatedImages?.length > 0 && (
                                <div className="space-y-2">
                                  {msg.generatedImages.map((url, imgIdx) => (
                                    <img
                                      key={imgIdx}
                                      src={url}
                                      alt={`Generated ${imgIdx + 1}`}
                                      className="w-full rounded-lg border border-black/8 cursor-pointer hover:opacity-90 transition-opacity duration-150"
                                      onClick={() => setLightboxUrl(url)}
                                    />
                                  ))}
                                </div>
                              )}
                              {msg.content && (
                                <div className="[overflow-wrap:anywhere] min-w-0 font-serif">
                                  {renderMessageText(msg.content, (src) => setLightboxUrl(src))}
                                </div>
                              )}
                              {!msg.content && isLoading && i === messages.length - 1 ? (
                                <span className="text-black text-sm">Thinking&hellip;</span>
                              ) : null}
                            </div>
                            {/* Copy button on finished messages */}
                            {msg.content && !(isLoading && i === messages.length - 1) && (
                              <button
                                onClick={() => handleCopy(msg.content, i)}
                                className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 w-6 h-6 rounded-md flex items-center justify-center text-black hover-gate:text-black hover-gate:bg-black/5 active:scale-[0.92] transition-all duration-150"
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
                  ))
                )}

                {/* File preview bubbles for sent messages */}
                {messages.map((msg, i) =>
                  msg.files?.length > 0 && msg.role === 'user' ? (
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

                {/* Loading indicator */}
                {isLoading && (
                  <div className="flex items-center gap-2.5 px-4 py-2 mt-2">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-black/30 animate-bounce" style={{ animationDelay: '0s' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-black/30 animate-bounce" style={{ animationDelay: '0.15s' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-black/30 animate-bounce" style={{ animationDelay: '0.3s' }} />
                    </div>
                    <span className="text-xs text-black">
                      {loadingPhase === 'searching' ? 'Searching the web&hellip;'
                        : loadingPhase === 'generating' ? 'Generating image&hellip;'
                        : 'Thinking'}
                    </span>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </main>

        {/* ── Error banner ──────────────────────────────────────────── */}
        {error && !showLanding && (
          <div className="flex-shrink-0 max-w-3xl mx-auto px-4 pb-2 w-full">
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[11px] text-red-600">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="underline hover:no-underline ml-2">Dismiss</button>
            </div>
          </div>
        )}

        {/* ── Input ─────────────────────────────────────────────── */}
        {(project || currentConversationId) && !(error && showLanding) && (
          <footer className="flex-shrink-0 bg-white/90 backdrop-blur-md">
            <div className="max-w-3xl mx-auto px-4 py-3">
              {/* Attached files preview */}
              {attachedFiles.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {attachedFiles.map((f, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/5 border border-black/10 text-xs text-black cursor-pointer hover-gate:bg-black/10 hover-gate:border-black/20 transition-all duration-150 group"
                      onClick={() => setPreviewFile(f)}
                    >
                      <span className="material-symbols-outlined text-[14px] shrink-0">
                        {f.group === 'image' ? 'image' : f.type === 'pdf' ? 'picture_as_pdf' : f.language ? 'code' : f.type === 'docx' || f.type === 'doc' ? 'description' : f.type === 'pptx' || f.type === 'ppt' ? 'slideshow' : f.group === 'table' ? 'table_chart' : 'description'}
                      </span>
                      <span className="truncate max-w-[120px] group-hover:max-w-none transition-all duration-150">
                        {f.filename}
                        {f.type === 'pdf' && f.pages && (
                          <span className="ml-1 text-black">&middot; {f.pages.length}p</span>
                        )}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setAttachedFiles((prev) => prev.filter((_, j) => j !== i)); }}
                        className="text-black hover-gate:text-black ml-0.5"
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
                <div className="mb-2 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/[0.03] border border-black/8 text-[11px] text-black">
                  <span className="material-symbols-outlined text-[14px] animate-spin shrink-0">progress_activity</span>
                  <span className="flex-1">Uploading {uploadProgress.current + 1} of {uploadProgress.total}&hellip;</span>
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
                    onPaste={handlePaste}
                    placeholder={activeMode === 'generate' ? 'Describe the image you want to generate…' : activeMode === 'search' ? 'Ask anything to search the web…' : `Ask something in ${project?.name || 'this project'}…`}
                    maxLength={10000}
                    rows={1}
                    disabled={isLoading || isSending}
                    className={`w-full bg-white text-black text-sm rounded-xl px-4 py-2.5 resize-none overflow-y-auto hide-scrollbar outline-none placeholder:text-black border border-black/10 focus:border-black/25 transition-all duration-150 disabled:opacity-50 leading-relaxed ${
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
                    <div className="absolute bottom-1 left-3 flex items-center gap-1.5 text-[10px] text-black pointer-events-none">
                      <span className="material-symbols-outlined text-[12px] animate-spin">progress_activity</span>
                      Converting paste to file&hellip;
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
              <p className="text-center text-[10px] text-black mt-2">
                AI can make mistakes. Consider checking important information.
              </p>
              <p className="text-center text-[9px] text-black mt-0.5">
                A personal project by Karl Wystan &mdash; still under development.
              </p>
            </div>
          </footer>
        )}
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
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-black">
                {authMode === 'login' ? 'Sign in' : 'Create account'}
              </h2>
              <button
                onClick={() => { setAuthOpen(false); setAuthError(null); setAuthSuccessMsg(null); setAuthEmail(''); setAuthPassword(''); }}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-black hover:text-black active:scale-[0.97] transition-all duration-150"
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
                  await signInWithGoogle();
                } catch (err) {
                  setAuthError(err.message);
                  setAuthLoading(false);
                }
              }}
              disabled={authLoading}
              className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl border border-black/10 text-sm text-black hover:border-black/25 hover:text-black active:scale-[0.98] transition-all duration-150 disabled:opacity-40"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              {authLoading ? 'Connecting…' : 'Continue with Google'}
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
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="w-full bg-white text-black text-sm rounded-xl px-3.5 py-2.5 outline-none placeholder:text-black border border-black/10 focus:border-black/25 transition-all duration-150"
                />
              </div>
              <div>
                <input
                  type="password"
                  placeholder="Password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') document.getElementById('auth-submit')?.click(); }}
                  className="w-full bg-white text-black text-sm rounded-xl px-3.5 py-2.5 outline-none placeholder:text-black border border-black/10 focus:border-black/25 transition-all duration-150"
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
                    const endpoint = authMode === 'login' ? '/api/auth/signin' : '/api/auth/signup';
                    const res = await fetch(endpoint, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ email: authEmail, password: authPassword }),
                    });
                    const data = await res.json();
                    if (!res.ok) {
                      setAuthError(data.error || 'Authentication failed');
                    } else if (authMode === 'register' && !data.session) {
                      setAuthSuccessMsg(data.message || 'Account created! Check your email to confirm your sign-in.');
                      setAuthEmail('');
                      setAuthPassword('');
                    } else if (data.session) {
                      setTokens(data.session.access_token, data.session.refresh_token);
                      setUser(data.user);
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

              <p className="text-center text-xs text-black">
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
        <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      )}

      {/* ── Model dropdown (portal) ─────────────────────────────── */}
      {modelDropdownOpen && createPortal(
        <>
          <div className="fixed inset-0 z-[9999]" onClick={() => setModelDropdownOpen(false)} />
          <div
            className="fixed z-[10000] w-52 bg-white border border-black/10 rounded-xl shadow-lg overflow-hidden"
            style={{ top: modelDropdownPos.top, left: modelDropdownPos.left, animation: 'scale-in 0.15s cubic-bezier(0.16, 1, 0.3, 1) both', transformOrigin: 'top left' }}
          >
            {MODELS.map((m) => (
              <button
                key={m.id}
                onClick={() => { setSelectedModel(m.id); setModelDropdownOpen(false); }}
                className={`w-full text-left px-3.5 py-2.5 text-xs transition-colors duration-150 flex items-center justify-between ${
                  m.id === selectedModel
                    ? 'bg-black/5 text-black font-medium'
                    : 'text-black hover-gate:text-black hover-gate:bg-black/[0.03]'
                }`}
              >
                {m.name}
                {m.id === selectedModel && (
                  <span className="material-symbols-outlined text-[14px] text-black">check</span>
                )}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
