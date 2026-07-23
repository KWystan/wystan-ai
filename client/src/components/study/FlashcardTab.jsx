import { useState, useMemo } from 'react';

function FlipCard({ card, flipped, onClick }) {
  return (
    <div
      className="relative w-full aspect-[3/2] cursor-pointer select-none"
      onClick={onClick}
      style={{ perspective: '1000px' }}
    >
      <div
        className="relative w-full h-full transition-transform duration-500"
        style={{
          transformStyle: 'preserve-3d',
          transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          willChange: 'transform',
        }}
      >
        {/* Front (question) */}
        <div
          className="absolute inset-0 rounded-xl border border-black/10 bg-white flex flex-col items-center justify-center p-4 text-center"
          style={{ backfaceVisibility: 'hidden' }}
        >
          <span className="material-symbols-outlined text-lg text-black mb-2">help_outline</span>
          <p className="text-xs leading-relaxed text-black max-w-sm [overflow-wrap:anywhere]">{card.question}</p>
          <p className="text-[10px] text-black mt-3">Tap to reveal</p>
        </div>
        {/* Back (answer) */}
        <div
          className="absolute inset-0 rounded-xl border border-black/10 bg-black text-white flex flex-col items-center justify-center p-4 text-center"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <span className="material-symbols-outlined text-lg text-white/70 mb-2">lightbulb</span>
          <p className="text-xs leading-relaxed text-white max-w-sm [overflow-wrap:anywhere]">{card.answer}</p>
          <p className="text-[10px] text-white/50 mt-3">Tap to see question</p>
        </div>
      </div>
    </div>
  );
}

export default function FlashcardTab({
  flashcards, isGenerating, onGenerate,
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [seed, setSeed] = useState(0);

  const orderedCards = useMemo(() => {
    if (!flashcards.length || !seed) return flashcards;
    const arr = [...flashcards];
    // Fisher-Yates shuffle seeded by timestamp
    let s = (seed * 1664525 + 1013904223) | 0;
    for (let i = arr.length - 1; i > 0; i--) {
      s = (s * 1664525 + 1013904223) | 0;
      const j = ((s >>> 0) % (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [flashcards, seed]);

  const currentCard = orderedCards[currentIndex] || null;

  const handleFlip = () => setFlipped(p => !p);
  const handlePrev = () => { setCurrentIndex(p => Math.max(0, p - 1)); setFlipped(false); };
  const handleNext = () => { setCurrentIndex(p => Math.min(orderedCards.length - 1, p + 1)); setFlipped(false); };
  const handleShuffle = () => { setSeed(Date.now()); setCurrentIndex(0); setFlipped(false); };

  // Keyboard shortcuts
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowLeft') handlePrev();
    else if (e.key === 'ArrowRight') handleNext();
    else if (e.key === ' ' || e.key === 'f') { e.preventDefault(); handleFlip(); }
  };

  // Empty state
  if (!flashcards.length && !isGenerating) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
        <span className="material-symbols-outlined text-2xl text-black mb-2">style</span>
        <p className="text-xs text-black mb-3">Generate flashcards from your active sources.</p>
        <button onClick={onGenerate}
          className="text-[11px] font-medium bg-black text-white rounded-lg px-3 py-1.5 active:scale-[0.97] transition-all duration-150">
          Generate Flashcards
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col" onKeyDown={handleKeyDown} tabIndex={-1}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={handleShuffle}
          className="text-[11px] px-2 py-1 rounded-md border border-black/10 hover-gate:border-black/25 text-black active:scale-[0.97] transition-all duration-150 flex items-center gap-1">
          <span className="material-symbols-outlined text-[12px]">shuffle</span>
          Shuffle
        </button>
        <span className="text-[11px] text-black">
          {currentIndex + 1} / {orderedCards.length}
        </span>
        <button onClick={onGenerate}
          disabled={isGenerating}
          className="text-[11px] px-2 py-1 rounded-md border border-black/10 hover-gate:border-black/25 text-black active:scale-[0.97] transition-all duration-150 flex items-center gap-1 disabled:opacity-40">
          <span className="material-symbols-outlined text-[12px]">refresh</span>
          Regenerate
        </button>
      </div>

      {isGenerating ? (
        /* Loading skeleton */
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-sm aspect-[3/2] rounded-xl border border-black/10 bg-black/[0.02] flex items-center justify-center">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-black/20 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-black/20 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-black/20 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      ) : currentCard ? (
        <div className="flex-1 flex flex-col">
          <FlipCard card={currentCard} flipped={flipped} onClick={handleFlip} />

          {/* Navigation */}
          <div className="flex items-center justify-between mt-3">
            <button onClick={handlePrev}
              disabled={currentIndex === 0}
              className="w-8 h-8 rounded-lg border border-black/10 flex items-center justify-center text-black disabled:opacity-20 active:scale-[0.97] transition-all duration-150">
              <span className="material-symbols-outlined text-[16px]">chevron_left</span>
            </button>
            <button onClick={handleFlip}
              className="text-[11px] px-3 py-1.5 rounded-lg border border-black/10 text-black hover-gate:border-black/25 active:scale-[0.97] transition-all duration-150 flex items-center gap-1">
              <span className="material-symbols-outlined text-[12px]">flip</span>
              Flip card
            </button>
            <button onClick={handleNext}
              disabled={currentIndex >= orderedCards.length - 1}
              className="w-8 h-8 rounded-lg border border-black/10 flex items-center justify-center text-black disabled:opacity-20 active:scale-[0.97] transition-all duration-150">
              <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            </button>
          </div>
        </div>
      ) : null}

      {/* Keyboard shortcuts */}
      {currentCard && (
        <p className="text-[10px] text-black text-center mt-2">
          ← → navigate · Space to flip
        </p>
      )}
    </div>
  );
}
