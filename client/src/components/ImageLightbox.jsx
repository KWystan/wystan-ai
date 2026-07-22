import { useEffect } from 'react';

/**
 * Full-screen image lightbox overlay. Closes on Escape or backdrop click.
 */
export default function ImageLightbox({ url, onClose }) {
  useEffect(() => {
    if (!url) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [url, onClose]);

  if (!url) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/15 flex items-center justify-center text-white/70 hover:bg-white/25 hover:text-white transition-all duration-150"
      >
        <span className="material-symbols-outlined text-[20px]">close</span>
      </button>
      <img
        src={url}
        alt="Enlarged"
        className="max-w-full max-h-full rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
