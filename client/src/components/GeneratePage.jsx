import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../lib/AppContext';
import logo from '../assets/logo.png';

const WIDTHS = [512, 768, 1024];
const STEPS = [2, 4, 6, 8];
const BATCH_OPTIONS = [1, 2, 4];

/* ── In-memory image cache (30-min TTL) ────────────────── */
const imageCache = new Map();
const IMAGE_CACHE_TTL = 30 * 60 * 1000;

function getCachedImages(prompt, width, height, steps) {
  const key = `${prompt}|${width}|${height}|${steps}`;
  const entry = imageCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > IMAGE_CACHE_TTL) {
    imageCache.delete(key);
    return null;
  }
  return entry.images;
}

function setCachedImages(prompt, width, height, steps, images) {
  const key = `${prompt}|${width}|${height}|${steps}`;
  imageCache.set(key, { images, timestamp: Date.now() });
}

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
  const { user, setSidebarOpen } = useApp();
  const [error, setError] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [recentImages, setRecentImages] = useState([]);
  const [lightboxUrl, setLightboxUrl] = useState(null);

  /* ── Accept initial prompt from ChatPage navigation ─────── */
  useEffect(() => {
    const state = location.state;
    if (state?.initialPrompt) {
      setPrompt(state.initialPrompt);
      // Clear the state so it doesn't re-trigger on re-render
      window.history.replaceState({}, document.title);
    }
  }, []);

  /* ── Close lightbox on Escape ──────────────────────────── */
  useEffect(() => {
    if (!lightboxUrl) return;
    const handler = (e) => { if (e.key === 'Escape') setLightboxUrl(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightboxUrl]);

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

      /* Step 2: check cache */
      const cached = getCachedImages(enhancedPrompt, width, height, steps);
      if (cached) {
        setImages(cached);
        setRecentImages(prev => [...cached.slice(0, 4), ...prev].slice(0, 20));
        setLoading(false);
        return;
      }

      /* Step 3: generate batch */
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
        /* Collect actual failure reasons for better diagnostics */
        const reasons = results
          .filter((r) => r.status === 'rejected')
          .map((r) => r.reason?.message?.replace(/^Error:\s*/i, ''));
        const unique = [...new Set(reasons)].filter(Boolean);
        const detail = unique.length > 0 ? unique.slice(0, 2).join('; ') : '';

        /* If the enhanced prompt (with style analysis) failed, retry with original prompt */
        if (enhancedPrompt !== prompt.trim()) {
          console.warn('Generation with style analysis failed, retrying with original prompt:', detail);
          enhancedPrompt = prompt.trim();
          /* Retry once with original prompt — recurse carefully */
          setBatchProgress({ current: 0, total: batchSize });
          const retryRequests = Array.from({ length: batchSize }, () =>
            fetch('/api/generate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prompt: enhancedPrompt, width, height, steps }),
            }).then(async (res) => {
              if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Generation failed'); }
              return res.json();
            }).then((data) => {
              const artifacts = Array.isArray(data) ? data : data.artifacts || data.data || [];
              if (artifacts.length > 0) { const img = artifacts[0]; return img.base64 || img.image || img.url; }
              return null;
            }).finally(() => { setBatchProgress(prev => prev ? { ...prev, current: prev.current + 1 } : null); })
          );
          const retryResults = await Promise.allSettled(retryRequests);
          setBatchProgress(null);
          const retrySuccessful = retryResults.filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value);
          if (retrySuccessful.length > 0) {
            setImages(retrySuccessful);
            setCachedImages(enhancedPrompt, width, height, steps, retrySuccessful);
            setRecentImages(prev => [...retrySuccessful.slice(0, 4), ...prev].slice(0, 20));
            /* Show warning but don't block */
            setError(`Style analysis didn't work with this image, generated with your prompt only.`);
            setLoading(false);
            return;
          }
        }

        throw new Error(detail ? `Generation failed: ${detail}` : 'All generations failed. Please try again.');
      }

      setImages(successful);
      setCachedImages(enhancedPrompt, width, height, steps, successful);
      setRecentImages(prev => [...successful.slice(0, 4), ...prev].slice(0, 20));

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

  return (
    <>
      <div className="flex-1 flex flex-col min-w-0 h-full lg:pl-4">
        {/* ── Top bar ────────────────────────────────────────── */}
        <header className="flex-shrink-0 bg-white/90 backdrop-blur-md">
          <div className="px-4 h-12 flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center text-black hover-gate:text-black active:scale-[0.97] transition-all duration-150 [backface-visibility:hidden]"
              aria-label="Open sidebar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" className="text-[20px]"><path d="M0 0h24v24H0z" fill="none" /><path fill="currentColor" d="M2 5.995c0-.55.446-.995.995-.995h8.01a.995.995 0 0 1 0 1.99h-8.01A.995.995 0 0 1 2 5.995M2 12c0-.55.446-.995.995-.995h18.01a.995.995 0 1 1 0 1.99H2.995A.995.995 0 0 1 2 12m.995 5.01a.995.995 0 0 0 0 1.99h12.01a.995.995 0 0 0 0-1.99z" /></svg>
            </button>
            <Link to="/" className="md:hidden flex items-center gap-2.5 group">
              <span className="w-7 h-7 rounded overflow-hidden flex-shrink-0">
                <img src={logo} alt="Logo" className="w-full h-full object-cover" />
              </span>
              <span className="text-sm font-medium text-black group-hover:text-black transition-colors duration-150">Wystan</span>
            </Link>
          </div>
        </header>

        {/* ── Split content ────────────────────────────────────── */}
        <div className="flex-1 flex flex-col lg:flex-row min-h-0">
          {/* ── Left panel (settings) ──────────────────────────────── */}
          <aside className="flex-shrink-0 w-full lg:w-[400px] border border-black/8 bg-white flex flex-col">
            <form onSubmit={handleGenerate}>
              <div className="overflow-y-auto px-4 py-4 space-y-3.5">
                {/* Heading */}
                <div>
                  <h1 className="font-display text-xl font-bold text-black">Image Generation</h1>
                  <p className="text-xs text-black/55 mt-0.5">Powered by Flux 2</p>
                </div>

                {/* Prompt */}
                <div>
                  <label className="block text-xs text-black mb-1">Prompt</label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe the image you want to generate..."
                    maxLength={1000}
                    rows={2}
                    className="w-full bg-white text-black text-sm rounded-xl px-4 py-3 resize-none outline-none placeholder:text-black/35 border border-black/10 focus:border-black/25 transition-all duration-150 leading-relaxed"
                  />
                </div>

                {/* Controls grid (2×2) */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs text-black mb-1">Width</label>
                    <select value={width} onChange={(e) => setWidth(Number(e.target.value))}
                      className="w-full bg-white text-black text-sm rounded-lg px-3 py-2 border border-black/10 outline-none focus:border-black/25 transition-all duration-150">
                      {WIDTHS.map((w) => (<option key={w} value={w}>{w}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-black mb-1">Height</label>
                    <select value={height} onChange={(e) => setHeight(Number(e.target.value))}
                      className="w-full bg-white text-black text-sm rounded-lg px-3 py-2 border border-black/10 outline-none focus:border-black/25 transition-all duration-150">
                      {WIDTHS.map((h) => (<option key={h} value={h}>{h}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-black mb-1">Steps</label>
                    <select value={steps} onChange={(e) => setSteps(Number(e.target.value))}
                      className="w-full bg-white text-black text-sm rounded-lg px-3 py-2 border border-black/10 outline-none focus:border-black/25 transition-all duration-150">
                      {STEPS.map((s) => (<option key={s} value={s}>{s}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-black mb-1">Batch</label>
                    <select value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value))}
                      className="w-full bg-white text-black text-sm rounded-lg px-3 py-2 border border-black/10 outline-none focus:border-black/25 transition-all duration-150">
                      {BATCH_OPTIONS.map((b) => (<option key={b} value={b}>{b}</option>))}
                    </select>
                  </div>
                </div>

                {/* Inspiration */}
                <div>
                  <label className="block text-xs text-black mb-1">
                    Inspiration <span className="text-black/50">(optional)</span>
                  </label>
                  {inspirationPreview ? (
                    <div className="relative inline-block">
                      <img
                        src={inspirationPreview}
                        alt="Inspiration"
                        className="h-28 rounded-xl border border-black/8 object-cover shadow-sm"
                      />
                      <button
                        type="button"
                        onClick={handleRemoveInspiration}
                        className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors duration-150"
                        aria-label="Remove inspiration image"
                      >
                        <span className="material-symbols-outlined text-[14px]">close</span>
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={handleInspirationDragOver}
                      onDragLeave={handleInspirationDragLeave}
                      onDrop={handleInspirationDrop}
                      className={`flex items-center gap-3 px-3 py-2 rounded-xl border border-dashed cursor-pointer transition-all duration-150 ${
                        isDragOver
                          ? 'border-blue-400 bg-blue-50/50'
                          : 'border-black/15 bg-black/[0.02] hover:bg-black/[0.04] hover:border-black/25'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[16px] text-black">image</span>
                      <span className="text-[11px] text-black">Style reference</span>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleInspirationUpload}
                  />

                  {/* Analyzing progress (inline) */}
                  {analyzing && (
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-black">
                      <div className="flex gap-1">
                        <span className="animate-blink size-1.5 rounded-full bg-black/25" />
                        <span className="animate-blink size-1.5 rounded-full bg-black/25" style={{ animationDelay: '0.2s' }} />
                        <span className="animate-blink size-1.5 rounded-full bg-black/25" style={{ animationDelay: '0.4s' }} />
                      </div>
                      <span>Analyzing style reference…</span>
                    </div>
                  )}
                </div>

                {/* Generate button */}
                <button
                  type="submit"
                  disabled={!prompt.trim() || loading || analyzing}
                  className="w-full py-2.5 rounded-xl bg-black text-white text-sm font-medium active:scale-[0.99] transition-all duration-150 disabled:opacity-25 disabled:cursor-not-allowed hover:bg-black/85"
                >
                  {analyzing
                    ? 'Analyzing…'
                    : loading
                      ? (batchProgress
                          ? `Generating ${batchProgress.current}/${batchProgress.total}…`
                          : `Generating${batchSize > 1 ? ` ${batchSize}` : ''}…`)
                      : 'Generate'}
                </button>
                {/* Batch progress bar below button */}
                {batchProgress && batchProgress.total > 1 && (
                  <div className="h-1 rounded-full bg-black/8 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-black transition-all duration-300"
                      style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                    />
                  </div>
                )}
              </div>
            </form>
          </aside>

          {/* ── Right panel (canvas) ───────────────────────────────── */}
          <main className="flex-1 flex flex-col min-h-0 bg-[#fafafa]">
            {/* Error banner */}
            {error && (
              <div className={`flex-shrink-0 px-4 py-2.5 border-b text-[11px] leading-relaxed flex items-start gap-2 ${
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

            {/* Canvas area */}
            <div className={`flex-1 min-h-0 ${images.length === 0 ? 'flex items-center justify-center' : 'overflow-y-auto p-6'}`}>
              {images.length > 0 ? (
                <div className="w-full max-w-3xl mx-auto">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-black/55">
                      {images.length} image{images.length > 1 ? 's' : ''}
                    </span>
                    {images.length > 1 && (
                      <button
                        onClick={handleDownloadAll}
                        className="flex items-center gap-1 text-xs text-black hover-gate:text-black active:scale-[0.97] transition-all duration-150"
                      >
                        <span className="material-symbols-outlined text-[14px]">download</span>
                        Download all
                      </button>
                    )}
                  </div>
                  <div className={`grid gap-4 ${images.length === 1 ? 'grid-cols-1 max-w-lg mx-auto' : 'grid-cols-2'}`}>
                    {images.map((img, i) => (
                      <div key={i} className="group relative">
                        <img
                          src={img.startsWith('data:') ? img : `data:image/png;base64,${img}`}
                          alt={`Generated ${i + 1}`}
                          className="w-full rounded-xl border border-black/8 shadow-sm bg-white cursor-pointer"
                          onClick={() => setLightboxUrl(img.startsWith('data:') ? img : `data:image/png;base64,${img}`)}
                        />
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-all duration-150">
                          <button
                            onClick={() => handleDownload(img, i)}
                            className="w-8 h-8 rounded-lg bg-white/90 text-black shadow-sm backdrop-blur-sm hover:bg-white flex items-center justify-center transition-all duration-150"
                            aria-label="Download image"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
                              <path d="M0 0h24v24H0z" fill="none" />
                              <path fill="currentColor" d="m12 16l-5-5l1.4-1.45l2.6 2.6V4h2v8.15l2.6-2.6L17 11zm-6 4q-.825 0-1.412-.587T4 18v-3h2v3h12v-3h2v3q0 .825-.587 1.413T18 20z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <span className="material-symbols-outlined text-5xl text-black/20">auto_awesome</span>
                  <p className="text-sm text-black/35 text-center max-w-[200px] leading-relaxed">
                    Your generated images will appear here
                  </p>
                </div>
              )}
            </div>

            {/* Recent thumbnail strip */}
            {recentImages.length > 0 && (
              <div className="flex-shrink-0 border-t border-black/8 px-4 py-3 bg-white">
                <span className="text-[10px] text-black/40 uppercase tracking-wider font-medium mb-2 block">Recent</span>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {recentImages.map((img, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        const a = document.createElement('a');
                        a.href = img.startsWith('data:') ? img : `data:image/png;base64,${img}`;
                        a.download = `flux-${Date.now()}-${i}.png`;
                        a.click();
                      }}
                      className="flex-shrink-0 rounded-lg overflow-hidden border border-black/8 hover:border-black/25 transition-colors duration-150"
                    >
                      <img
                        src={img.startsWith('data:') ? img : `data:image/png;base64,${img}`}
                        alt={`Recent ${i + 1}`}
                        className="w-14 h-14 object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

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
    </>
  );
}
