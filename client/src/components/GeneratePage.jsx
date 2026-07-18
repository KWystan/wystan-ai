import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { getToken, setTokens, clearTokens, parseOAuthTokensFromHash, authFetch } from '../lib/auth.js';
import Sidebar from './Sidebar.jsx';
import logo from '../assets/logo.png';

const WIDTHS = [512, 768, 1024, 1280];
const STEPS = [2, 4, 6, 8];
const BATCH_OPTIONS = [1, 2, 4];

/* ── Send an inspiration image to MiniMax M3 for style analysis ────
 *   Returns a 2-3 sentence description of the image's visual style. */
async function analyzeInspirationImage(file) {
  /* Upload first */
  const formData = new FormData();
  formData.append('file', file);
  const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
  if (!uploadRes.ok) throw new Error('Failed to upload inspiration image');
  const uploaded = await uploadRes.json();
  if (!uploaded.data) throw new Error('Uploaded file is not an image');

  /* Send to MiniMax M3 for analysis */
  const messages = [{
    role: 'user',
    content: [
      { type: 'text', text: 'Describe this image\'s visual style, composition, colors, lighting, and mood in 2-3 concise sentences. Focus on what makes it visually distinctive.' },
      { type: 'image_url', image_url: { url: uploaded.data } },
    ],
  }];

  const res = await fetch('/api/chat-full', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, model: 'minimaxai/minimax-m3' }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Style analysis failed');
  }

  /* Read SSE stream */
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let result = '';
  let buffer = '';

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
      if (data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data);
        if (parsed.error) throw new Error(parsed.error);
        const content = parsed.choices?.[0]?.delta?.content || parsed.content || '';
        result += content;
      } catch { /* skip malformed JSON */ }
    }
  }

  return result.trim() || null;
}

export default function GeneratePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const fileInputRef = useRef(null);

  const [prompt, setPrompt] = useState('');
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [steps, setSteps] = useState(4);
  const [batchSize, setBatchSize] = useState(1);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [batchProgress, setBatchProgress] = useState(null); // { current: number, total: number } | null
  const [inspirationFile, setInspirationFile] = useState(null);
  const [inspirationPreview, setInspirationPreview] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  /* ── Auth state ─────────────────────────────────────────── */
  useEffect(() => {
    const token = getToken();
    if (token) {
      authFetch('/api/auth/me').then((res) => {
        if (res.ok) res.json().then((data) => setUser(data.user));
      });
    }
  }, []);

  /* ── Accept initial prompt from ChatPage navigation ─────── */
  useEffect(() => {
    const state = location.state;
    if (state?.initialPrompt) {
      setPrompt(state.initialPrompt);
      // Clear the state so it doesn't re-trigger on re-render
      window.history.replaceState({}, document.title);
    }
  }, []);

  /* ── Handle inspiration image upload ────────────────────── */
  const handleInspirationUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    /* Validate type */
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file (PNG, JPG, etc.)');
      return;
    }

    /* Validate size (10MB) */
    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be under 10 MB');
      return;
    }

    setInspirationFile(file);
    setInspirationPreview(URL.createObjectURL(file));
    setError(null);
  };

  const handleRemoveInspiration = () => {
    if (inspirationPreview) URL.revokeObjectURL(inspirationPreview);
    setInspirationFile(null);
    setInspirationPreview(null);
  };

  /* ── Drag & drop inspiration ────────────────────────────── */
  const handleInspirationDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleInspirationDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleInspirationDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please drop an image file (PNG, JPG, etc.)');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be under 10 MB');
      return;
    }

    setInspirationFile(file);
    setInspirationPreview(URL.createObjectURL(file));
    setError(null);
  };

  /* ── Generate ───────────────────────────────────────────── */
  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!prompt.trim() || loading) return;

    setLoading(true);
    setError(null);
    setImages([]);

    let enhancedPrompt = prompt.trim();

    try {
      /* Step 1: analyze inspiration image if provided */
      if (inspirationFile) {
        setAnalyzing(true);
        try {
          const analysis = await analyzeInspirationImage(inspirationFile);
          if (analysis) {
            enhancedPrompt = `${prompt.trim()} — in the style of: ${analysis}`;
          }
        } catch (err) {
          console.error('Style analysis failed:', err);
          /* Continue with original prompt — non-blocking */
        } finally {
          setAnalyzing(false);
        }
      }

      /* Step 2: generate batch */
      setBatchProgress({ current: 0, total: batchSize });
      const requests = Array.from({ length: batchSize }, () =>
        fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: enhancedPrompt, width, height, steps }),
        }).then(async (res) => {
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Generation failed');
          }
          return res.json();
        }).then((data) => {
          const artifacts = Array.isArray(data) ? data : data.artifacts || data.data || [];
          if (artifacts.length > 0) {
            const img = artifacts[0];
            return img.base64 || img.image || img.url;
          }
          return null;
        }).finally(() => {
          setBatchProgress(prev => prev ? { ...prev, current: prev.current + 1 } : null);
        })
      );

      const results = await Promise.allSettled(requests);
      setBatchProgress(null);
      const successful = results
        .filter((r) => r.status === 'fulfilled' && r.value)
        .map((r) => r.value);

      if (successful.length === 0) {
        throw new Error('All generations failed. Please try again.');
      }

      setImages(successful);

      /* Show partial failure warning */
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0 && successful.length > 0) {
        setError(`${failed} of ${batchSize} generations failed.`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  /* ── Download helper ────────────────────────────────────── */
  const handleDownload = (img, i) => {
    if (!img) return;
    const a = document.createElement('a');
    a.href = img.startsWith('data:') ? img : `data:image/png;base64,${img}`;
    a.download = `flux-${Date.now()}-${i}.png`;
    a.click();
  };

  const handleDownloadAll = () => {
    images.forEach((img, i) => handleDownload(img, i));
  };

  /* ── Sidebar handlers ───────────────────────────────────── */
  const handleClear = () => navigate('/chat');
  const handleSignOut = async () => {
    try {
      await authFetch('/api/auth/signout', { method: 'POST' });
    } catch { /* ignore */ }
    clearTokens();
    setUser(null);
  };
  const handleOpenAuth = () => navigate('/chat');

  return (
    <div className="fixed inset-0 z-50 flex bg-white">
      {/* ── Sidebar ────────────────────────────────────────────── */}
      <Sidebar
        user={user}
        onNewChat={handleClear}
        currentConversationId={null}
        onSelectConversation={(id) => navigate(`/chat/${id}`)}
        onSignOut={handleSignOut}
        onOpenAuth={handleOpenAuth}
        sidebarOpen={sidebarOpen}
        onCloseSidebar={() => setSidebarOpen(false)}
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
        {/* ── Top bar ────────────────────────────────────────── */}
        <header className="flex-shrink-0 bg-white/90 backdrop-blur-md border-b border-black/8">
          <div className="px-4 h-12 flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden w-8 h-8 rounded-lg border border-black/12 flex items-center justify-center text-black/50 hover-gate:border-black/35 hover-gate:text-black active:scale-[0.97] transition-all duration-150 [backface-visibility:hidden]"
              aria-label="Open sidebar"
            >
              <span className="material-symbols-outlined text-[18px]">menu</span>
            </button>
            <Link to="/" className="flex items-center gap-2.5 group">
              <span className="w-7 h-7 rounded overflow-hidden flex-shrink-0">
                <img src={logo} alt="Logo" className="w-full h-full object-cover" />
              </span>
              <span className="text-sm font-medium text-black/70 group-hover:text-black transition-colors duration-150">Wystan</span>
            </Link>
            <Link to="/chat" className="ml-auto flex items-center gap-1 text-sm text-black/40 hover-gate:text-black active:scale-[0.97] transition-all duration-150">
              <span className="material-symbols-outlined text-[16px]">chat</span>
              <span className="hidden sm:inline">Chat</span>
            </Link>
          </div>
        </header>

        {/* ── Main content ─────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-4 py-8 w-full">
            <h1 className="font-display text-2xl font-bold text-black mb-1.5">
              Image Generation
            </h1>
            <p className="text-sm text-black/40 mb-6">
              Powered by Flux 2 on NVIDIA's free-tier API
            </p>

            <form onSubmit={handleGenerate} className="space-y-4">
              {/* ── Prompt ────────────────────────────────────────── */}
              <div>
                <label className="block text-xs text-black/50 mb-1.5">Prompt</label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe the image you want to generate..."
                  maxLength={1000}
                  rows={3}
                  className="w-full bg-white text-black text-sm rounded-xl px-4 py-3 resize-none outline-none placeholder:text-black/30 border border-black/10 focus:border-black/25 transition-all duration-150 leading-relaxed"
                />
              </div>

              {/* ── Options row ────────────────────────────────────── */}
              <div className="flex flex-wrap gap-4">
                <div>
                  <label className="block text-xs text-black/50 mb-1.5">Width</label>
                  <select value={width} onChange={(e) => setWidth(Number(e.target.value))}
                    className="bg-white text-black text-sm rounded-lg px-3 py-2 border border-black/10 outline-none focus:border-black/25 transition-all duration-150">
                    {WIDTHS.map((w) => (<option key={w} value={w}>{w}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-black/50 mb-1.5">Height</label>
                  <select value={height} onChange={(e) => setHeight(Number(e.target.value))}
                    className="bg-white text-black text-sm rounded-lg px-3 py-2 border border-black/10 outline-none focus:border-black/25 transition-all duration-150">
                    {WIDTHS.map((h) => (<option key={h} value={h}>{h}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-black/50 mb-1.5">Steps</label>
                  <select value={steps} onChange={(e) => setSteps(Number(e.target.value))}
                    className="bg-white text-black text-sm rounded-lg px-3 py-2 border border-black/10 outline-none focus:border-black/25 transition-all duration-150">
                    {STEPS.map((s) => (<option key={s} value={s}>{s}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-black/50 mb-1.5">Batch</label>
                  <select value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value))}
                    className="bg-white text-black text-sm rounded-lg px-3 py-2 border border-black/10 outline-none focus:border-black/25 transition-all duration-150">
                    {BATCH_OPTIONS.map((b) => (<option key={b} value={b}>{b}</option>))}
                  </select>
                </div>
              </div>

              {/* ── Inspiration image ──────────────────────────────── */}
              <div>
                <label className="block text-xs text-black/50 mb-1.5">
                  Inspiration image <span className="text-black/25">(optional — style reference)</span>
                </label>
                {inspirationPreview ? (
                  <div className="relative inline-block">
                    <img
                      src={inspirationPreview}
                      alt="Inspiration"
                      className="h-32 rounded-xl border border-black/8 object-cover shadow-sm"
                    />
                    <button
                      type="button"
                      onClick={handleRemoveInspiration}
                      className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center text-[12px] hover:bg-black/80 transition-colors duration-150"
                      aria-label="Remove inspiration image"
                    >
                      close
                    </button>
                    <span className="material-symbols-outlined text-[14px] absolute -bottom-2 -left-2 w-5 h-5 rounded-full bg-black/10 text-black/50 flex items-center justify-center backdrop-blur-sm">auto_awesome</span>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={handleInspirationDragOver}
                    onDragLeave={handleInspirationDragLeave}
                    onDrop={handleInspirationDrop}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border border-dashed cursor-pointer transition-all duration-150 ${
                      isDragOver
                        ? 'border-blue-400 bg-blue-50/50'
                        : 'border-black/15 bg-black/[0.02] hover:bg-black/[0.04] hover:border-black/25'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px] text-black/25">image</span>
                    <span className="text-xs text-black/35">Click or drag an image here for style inspiration</span>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleInspirationUpload}
                />
              </div>

              {/* ── Generate button ────────────────────────────────── */}
              <button
                type="submit"
                disabled={!prompt.trim() || loading || analyzing}
                className="w-full py-2.5 rounded-xl bg-black text-white text-sm font-medium active:scale-[0.99] transition-all duration-150 disabled:opacity-25 disabled:cursor-not-allowed hover:bg-black/85"
              >
                {analyzing ? 'Analyzing inspiration…' : loading ? (batchProgress ? `Generating ${batchProgress.current}/${batchProgress.total}…` : `Generating ${batchSize > 1 ? `${batchSize} images…` : '…'}`) : 'Generate'}
              </button>
            </form>

            {/* ── Progress indicator (analyzing) ──────────────────── */}
            {analyzing && (
              <div className="mt-4 px-3 py-2.5 rounded-lg bg-black/[0.03] border border-black/8 text-[11px] text-black/50 flex items-center gap-2">
                <div className="flex gap-1">
                  <span className="animate-blink size-1.5 rounded-full bg-black/25" />
                  <span className="animate-blink size-1.5 rounded-full bg-black/25" style={{ animationDelay: '0.2s' }} />
                  <span className="animate-blink size-1.5 rounded-full bg-black/25" style={{ animationDelay: '0.4s' }} />
                </div>
                <span>Analyzing style reference image with MiniMax M3…</span>
              </div>
            )}

            {/* ── Batch generation progress ──────────────────────── */}
            {batchProgress && batchProgress.total > 1 && (
              <div className="mt-4 px-3 py-2.5 rounded-lg bg-black/[0.03] border border-black/8 text-[11px] text-black/50 flex items-center gap-2">
                <span className="material-symbols-outlined text-[14px] animate-spin shrink-0">progress_activity</span>
                <span className="flex-1">Generated {batchProgress.current} of {batchProgress.total}</span>
                <div className="w-20 h-1.5 rounded-full bg-black/8 overflow-hidden flex-shrink-0">
                  <div
                    className="h-full rounded-full bg-black/30 transition-all duration-300"
                    style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* ── Error ───────────────────────────────────────────── */}
            {error && (
              <div className={`mt-4 px-3 py-2.5 rounded-lg border text-[11px] leading-relaxed flex items-start gap-2 ${
                error.includes('flagged') || error.includes('content safety')
                  ? 'bg-amber-50 border-amber-200 text-amber-700'
                  : 'bg-red-50 border-red-200 text-red-600'
              }`}>
                <span className="material-symbols-outlined text-[14px] mt-0.5 flex-shrink-0">
                  {error.includes('flagged') || error.includes('content safety') ? 'warning' : 'error'}
                </span>
                <span>{error}</span>
              </div>
            )}

            {/* ── Results grid ────────────────────────────────────── */}
            {images.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-black/50">
                    {images.length} image{images.length > 1 ? 's' : ''} generated
                  </span>
                  {images.length > 1 && (
                    <button
                      onClick={handleDownloadAll}
                      className="flex items-center gap-1 text-xs text-black/40 hover-gate:text-black active:scale-[0.97] transition-all duration-150"
                    >
                      <span className="material-symbols-outlined text-[14px]">download</span>
                      Download all
                    </button>
                  )}
                </div>
                <div className={`grid gap-3 ${images.length === 1 ? 'grid-cols-1' : images.length === 2 ? 'grid-cols-2' : 'grid-cols-2'}`}>
                  {images.map((img, i) => (
                    <div key={i} className="group relative">
                      <img
                        src={img.startsWith('data:') ? img : `data:image/png;base64,${img}`}
                        alt={`Generated ${i + 1}`}
                        className="w-full rounded-xl border border-black/8 shadow-sm"
                      />
                      <div className="absolute inset-0 rounded-xl bg-black/0 group-hover:bg-black/5 transition-colors duration-150 flex items-center justify-center">
                        <button
                          onClick={() => handleDownload(img, i)}
                          className="opacity-0 group-hover:opacity-100 px-3 py-1.5 rounded-lg bg-white/90 text-black/70 text-xs shadow-sm backdrop-blur-sm hover:bg-white transition-all duration-150"
                        >
                          Download
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
