import { useState, useEffect } from 'react';

/**
 * Modal overlay for previewing attached files (images, PDFs, text, code, etc.).
 */
export default function FilePreviewModal({ file, onClose }) {
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
            <span className="material-symbols-outlined text-[18px] text-black">
              {fileIcon()}
            </span>
            <span className="text-sm font-medium text-black truncate">{file.filename}</span>
            {file.language && (
              <span className="text-[10px] uppercase tracking-wider text-black bg-black/5 rounded px-1.5 py-0.5 shrink-0">
                {file.language}
              </span>
            )}
            <span className="text-[11px] text-black shrink-0">
              {(file.size / 1024).toFixed(1)} KB
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => {
                const href = file.data || file.pages?.[0] || null;
                if (!href) return;
                const a = document.createElement('a');
                a.href = href;
                a.download = file.filename;
                a.click();
              }}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-black hover-gate:text-black hover-gate:bg-black/5 active:scale-[0.92] transition-all duration-150"
              aria-label="Download file"
            >
              <span className="material-symbols-outlined text-[18px]">download</span>
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-black hover-gate:text-black hover-gate:bg-black/5 active:scale-[0.92] transition-all duration-150"
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
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-black hover-gate:text-black hover-gate:bg-black/5 disabled:opacity-20 disabled:pointer-events-none active:scale-[0.92] transition-all duration-150"
                >
                  <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                </button>
                <span className="text-xs text-black font-medium min-w-[4rem] text-center">
                  {page + 1} / {file.pages.length}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(file.pages.length - 1, p + 1))}
                  disabled={page >= file.pages.length - 1}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-black hover-gate:text-black hover-gate:bg-black/5 disabled:opacity-20 disabled:pointer-events-none active:scale-[0.92] transition-all duration-150"
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
            <pre className="p-4 text-[13px] leading-relaxed font-mono text-black whitespace-pre-wrap overflow-x-auto">
              {file.content}
            </pre>
          )}

          {!isImage && !hasContent && !isPdf && (
            <div className="flex flex-col items-center justify-center p-8 text-black">
              <span className="material-symbols-outlined text-3xl mb-2">visibility_off</span>
              <p className="text-sm">No preview available for this file.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
