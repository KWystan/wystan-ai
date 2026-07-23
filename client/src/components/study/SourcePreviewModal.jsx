import { useState, useEffect } from 'react';

export default function SourcePreviewModal({ chunkId, fileName, pageNumber, onClose }) {
  const [chunkText, setChunkText] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!chunkId) return;
    setLoading(true);
    const token = localStorage.getItem('wystan_access_token');
    fetch(`/api/study/chunks/${chunkId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json())
      .then(data => {
        setChunkText(data.raw_text || 'Unable to load chunk');
        setLoading(false);
      })
      .catch(() => {
        setChunkText('Failed to load source text');
        setLoading(false);
      });
  }, [chunkId]);

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/10 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-black/8 p-5"
        onClick={e => e.stopPropagation()}
        style={{ animation: 'scale-in 0.15s var(--ease-out-expo) both' }}
        role="dialog"
        aria-modal="true"
        aria-label="Source preview"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-lg">description</span>
            <h3 className="text-sm font-semibold text-black">{fileName}</h3>
            {pageNumber && <span className="text-[11px] text-black">p. {pageNumber}</span>}
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-black hover:text-black active:scale-[0.97] transition-all duration-150"
            aria-label="Close preview"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {loading ? (
            <div className="space-y-2">
              <div className="h-4 bg-black/5 rounded animate-pulse" />
              <div className="h-4 bg-black/5 rounded animate-pulse w-3/4" />
              <div className="h-4 bg-black/5 rounded animate-pulse w-1/2" />
            </div>
          ) : (
            <p className="text-xs leading-relaxed text-black whitespace-pre-wrap">{chunkText}</p>
          )}
        </div>
      </div>
    </div>
  );
}
