import { useState } from 'react';
import { Link } from 'react-router-dom';
import logo from '../assets/logo.png';

const WIDTHS = [512, 768, 1024, 1280];
const STEPS = [2, 4, 6, 8];

export default function GeneratePage() {
  const [prompt, setPrompt] = useState('');
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [steps, setSteps] = useState(4);
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!prompt.trim() || loading) return;

    setLoading(true);
    setError(null);
    setImage(null);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), width, height, steps }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 400) {
          throw new Error(err.error || 'Bad request. Please try a different prompt.');
        }
        throw new Error(err.error || 'Generation failed');
      }

      const data = await res.json();

      // The Flux API returns an array of artifacts, each with base64
      const artifacts = Array.isArray(data) ? data : data.artifacts || data.data || [];
      if (artifacts.length > 0) {
        const img = artifacts[0];
        setImage(img.base64 || img.image || img.url);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!image) return;
    const a = document.createElement('a');
    a.href = image.startsWith('data:') ? image : `data:image/png;base64,${image}`;
    a.download = `flux-${Date.now()}.png`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex bg-white">
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-md border-b border-black/8">
        <div className="px-4 h-12 flex items-center gap-3">
          <Link
            to="/"
            className="flex items-center gap-2.5 group"
          >
            <span className="w-7 h-7 rounded overflow-hidden flex-shrink-0">
              <img src={logo} alt="Logo" className="w-full h-full object-cover" />
            </span>
            <span className="text-sm font-medium text-black/70 group-hover:text-black transition-colors duration-150">
              Wystan
            </span>
          </Link>
          <Link
            to="/"
            className="ml-auto flex items-center gap-1 text-sm text-black/40 hover-gate:text-black active:scale-[0.97] transition-all duration-150"
          >
            <span className="material-symbols-outlined text-[16px]">chat</span>
            <span className="hidden sm:inline">Chat</span>
          </Link>
        </div>
      </header>

      {/* ── Main content ────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto pt-12">
        <div className="max-w-2xl mx-auto px-4 py-8 w-full">
          <h1 className="font-magazine text-xl font-semibold text-black mb-1">
            Image Generation
          </h1>
          <p className="text-sm text-black/40 mb-6">
            Powered by Flux 2 on NVIDIA&apos;s free-tier API
          </p>

          <form onSubmit={handleGenerate} className="space-y-4">
            {/* Prompt */}
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

            {/* Options row */}
            <div className="flex flex-wrap gap-4">
              <div>
                <label className="block text-xs text-black/50 mb-1.5">Width</label>
                <select
                  value={width}
                  onChange={(e) => setWidth(Number(e.target.value))}
                  className="bg-white text-black text-sm rounded-lg px-3 py-2 border border-black/10 outline-none focus:border-black/25 transition-all duration-150"
                >
                  {WIDTHS.map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-black/50 mb-1.5">Height</label>
                <select
                  value={height}
                  onChange={(e) => setHeight(Number(e.target.value))}
                  className="bg-white text-black text-sm rounded-lg px-3 py-2 border border-black/10 outline-none focus:border-black/25 transition-all duration-150"
                >
                  {WIDTHS.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-black/50 mb-1.5">Steps</label>
                <select
                  value={steps}
                  onChange={(e) => setSteps(Number(e.target.value))}
                  className="bg-white text-black text-sm rounded-lg px-3 py-2 border border-black/10 outline-none focus:border-black/25 transition-all duration-150"
                >
                  {STEPS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Generate button */}
            <button
              type="submit"
              disabled={!prompt.trim() || loading}
              className="w-full py-2.5 rounded-xl bg-black text-white text-sm font-medium active:scale-[0.99] transition-all duration-150 disabled:opacity-25 disabled:cursor-not-allowed hover:bg-black/85"
            >
              {loading ? 'Generating…' : 'Generate'}
            </button>
          </form>

          {/* Error */}
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

          {/* Result */}
          {image && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-black/50">Generated image</span>
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-1 text-xs text-black/40 hover-gate:text-black active:scale-[0.97] transition-all duration-150"
                >
                  <span className="material-symbols-outlined text-[14px]">download</span>
                  Download
                </button>
              </div>
              <img
                src={image.startsWith('data:') ? image : `data:image/png;base64,${image}`}
                alt="Generated"
                className="w-full rounded-xl border border-black/8 shadow-sm"
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
