import { useState } from 'react';

function getMotivation(score, total) {
  const pct = total > 0 ? score / total : 0;
  if (pct >= 0.9) return { emoji: '🌟', message: 'Outstanding! You really know your stuff.' };
  if (pct >= 0.7) return { emoji: '👏', message: 'Great job! Solid understanding.' };
  if (pct >= 0.5) return { emoji: '💪', message: 'Good effort! A little more review and you\'ll nail it.' };
  if (pct >= 0.3) return { emoji: '📖', message: 'Keep studying! Review the material and try again.' };
  return { emoji: '🔄', message: 'Don\'t give up! Go back to the material and give it another shot.' };
}

export default function QuizResults({
  answerLog,
  score,
  totalQuestions,
  onRetry,
  onNewQuiz,
}) {
  const [showReview, setShowReview] = useState(false);
  const pct = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;
  const { emoji, message } = getMotivation(score, totalQuestions);
  const incorrect = answerLog.filter((e) => !e.correct);

  return (
    <div style={{ animation: 'fade-up 0.3s var(--ease-out-expo) both' }}>
      {/* ── Score ───────────────────────────────────────────────── */}
      <div className="flex flex-col items-center mb-8 pt-4">
        <span className="text-5xl mb-3">{emoji}</span>
        <div className="flex items-baseline gap-1 mb-1">
          <span className="text-4xl font-bold text-black">{score}</span>
          <span className="text-lg text-black/50">/ {totalQuestions}</span>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-32 h-1.5 rounded-full bg-black/8 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-400'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs font-medium text-black">{pct}%</span>
        </div>
        <p className="text-sm text-black text-center max-w-xs">{message}</p>
      </div>

      {/* ── Stats ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="rounded-xl border border-black/8 bg-white p-3 text-center">
          <span className="block text-lg font-bold text-emerald-600">{score}</span>
          <span className="text-[10px] text-black">Correct</span>
        </div>
        <div className="rounded-xl border border-black/8 bg-white p-3 text-center">
          <span className="block text-lg font-bold text-red-500">{totalQuestions - score}</span>
          <span className="text-[10px] text-black">Incorrect</span>
        </div>
        <div className="rounded-xl border border-black/8 bg-white p-3 text-center">
          <span className="block text-lg font-bold text-black">{totalQuestions}</span>
          <span className="text-[10px] text-black">Total</span>
        </div>
      </div>

      {/* ── Review Toggle ───────────────────────────────────────── */}
      {incorrect.length > 0 && (
        <div className="mb-6">
          <button
            onClick={() => setShowReview((p) => !p)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-white border border-black/10 text-sm font-medium text-black hover-gate:border-black/25 transition-all duration-150"
          >
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">rate_review</span>
              Review Incorrect Answers ({incorrect.length})
            </div>
            <span
              className={`material-symbols-outlined text-[18px] transition-transform duration-200 ${
                showReview ? 'rotate-180' : ''
              }`}
            >
              expand_more
            </span>
          </button>

          {showReview && (
            <div className="mt-3 space-y-3" style={{ animation: 'fade-up 0.2s var(--ease-out-expo) both' }}>
              {incorrect.map((entry, i) => {
                const q = entry.question;
                return (
                  <div key={i} className="rounded-xl border border-red-100 bg-red-50/50 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                          q.type === 'multiple'
                            ? 'bg-blue-50 border-blue-200 text-blue-600'
                            : q.type === 'truefalse'
                              ? 'bg-purple-50 border-purple-200 text-purple-600'
                              : 'bg-amber-50 border-amber-200 text-amber-700'
                        }`}
                      >
                        {q.type === 'multiple'
                          ? 'Multiple Choice'
                          : q.type === 'truefalse'
                            ? 'True / False'
                            : 'Fill in the Blank'}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-black mb-2 leading-relaxed">{q.question}</p>
                    <div className="space-y-1 text-[11px]">
                      <p className="text-red-500">
                        <span className="font-medium">Your answer:</span>{' '}
                        {q.type === 'multiple'
                          ? q.options[entry.selected] ?? '—'
                          : q.type === 'truefalse'
                            ? entry.selected ? 'True' : 'False'
                            : entry.selected || '—'}
                      </p>
                      <p className="text-emerald-600">
                        <span className="font-medium">Correct answer:</span>{' '}
                        {q.type === 'multiple'
                          ? q.options[q.answer]
                          : q.type === 'truefalse'
                            ? q.answer ? 'True' : 'False'
                            : q.answer}
                      </p>
                      <p className="text-black mt-1 leading-relaxed">{q.explanation}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Actions ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <button
          onClick={onRetry}
          className="w-full py-2.5 rounded-xl bg-black text-white text-sm font-medium active:scale-[0.99] transition-all duration-150 hover:bg-black/85 flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-[16px]">shuffle</span>
          Retry Quiz (Shuffled)
        </button>
        <button
          onClick={onNewQuiz}
          className="w-full py-2.5 rounded-xl border border-black/10 bg-white text-black text-sm font-medium active:scale-[0.99] transition-all duration-150 hover-gate:border-black/25 flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-[16px]">refresh</span>
          New Quiz
        </button>
      </div>
    </div>
  );
}
