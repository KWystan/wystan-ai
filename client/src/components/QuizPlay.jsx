import { useState, useCallback } from 'react';

/* ── Multiple Choice ────────────────────────────────────────────── */
function MultipleChoice({ question, selected, onSelect, disabled }) {
  return (
    <div className="space-y-2">
      {question.options.map((opt, i) => {
        const isSelected = selected === i;
        const isCorrect = disabled && i === question.answer;
        const isWrong = disabled && isSelected && i !== question.answer;
        return (
          <button
            key={i}
            onClick={() => !disabled && onSelect(i)}
            disabled={disabled}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-left transition-all duration-150 active:scale-[0.99] ${
              disabled
                ? isCorrect
                  ? 'bg-emerald-50 border border-emerald-300 text-emerald-700'
                  : isWrong
                    ? 'bg-red-50 border border-red-300 text-red-600'
                    : 'bg-white border border-black/8 text-black/50'
                : isSelected
                  ? 'bg-black/5 border border-black/20 text-black font-medium'
                  : 'bg-white border border-black/10 text-black hover-gate:border-black/25 hover-gate:bg-black/[0.02]'
            }`}
          >
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-medium shrink-0 transition-all duration-150 ${
                disabled
                  ? isCorrect
                    ? 'bg-emerald-500 text-white'
                    : isWrong
                      ? 'bg-red-400 text-white'
                      : 'bg-black/10 text-black/30'
                  : isSelected
                    ? 'bg-black text-white'
                    : 'bg-black/8 text-black/50'
              }`}
            >
              {String.fromCharCode(65 + i)}
            </span>
            <span className="flex-1">{opt}</span>
            {disabled && isCorrect && (
              <span className="material-symbols-outlined text-[18px] text-emerald-500">check_circle</span>
            )}
            {disabled && isWrong && (
              <span className="material-symbols-outlined text-[18px] text-red-400">cancel</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ── True / False ───────────────────────────────────────────────── */
function TrueFalse({ question, selected, onSelect, disabled }) {
  const selTrue = selected === true;
  const selFalse = selected === false;
  const isCorrect = question.answer;

  const correctTrue = disabled && question.answer === true;
  const correctFalse = disabled && question.answer === false;
  const wrongTrue = disabled && selected === true && !question.answer;
  const wrongFalse = disabled && selected === false && question.answer;

  return (
    <div className="grid grid-cols-2 gap-3">
      <button
        onClick={() => !disabled && onSelect(true)}
        disabled={disabled}
        className={`flex flex-col items-center gap-2 px-6 py-8 rounded-xl text-sm font-medium transition-all duration-150 active:scale-[0.98] ${
          disabled
            ? correctTrue
              ? 'bg-emerald-50 border-2 border-emerald-300 text-emerald-700'
              : wrongTrue
                ? 'bg-red-50 border-2 border-red-300 text-red-600'
                : 'bg-white border border-black/8 text-black/30'
            : selTrue
              ? 'bg-black/5 border-2 border-black/20 text-black'
              : 'bg-white border border-black/10 text-black hover-gate:border-black/25'
        }`}
      >
        <span
          className={`material-symbols-outlined text-3xl transition-all duration-150 ${
            disabled
              ? correctTrue
                ? 'text-emerald-500'
                : wrongTrue
                  ? 'text-red-400'
                  : 'text-black/20'
              : selTrue
                ? 'text-black'
                : 'text-black/30'
          }`}
        >
          check
        </span>
        <span>True</span>
        {disabled && correctTrue && (
          <span className="material-symbols-outlined text-[18px] text-emerald-500">check_circle</span>
        )}
        {disabled && wrongTrue && (
          <span className="material-symbols-outlined text-[18px] text-red-400">cancel</span>
        )}
      </button>
      <button
        onClick={() => !disabled && onSelect(false)}
        disabled={disabled}
        className={`flex flex-col items-center gap-2 px-6 py-8 rounded-xl text-sm font-medium transition-all duration-150 active:scale-[0.98] ${
          disabled
            ? correctFalse
              ? 'bg-emerald-50 border-2 border-emerald-300 text-emerald-700'
              : wrongFalse
                ? 'bg-red-50 border-2 border-red-300 text-red-600'
                : 'bg-white border border-black/8 text-black/30'
            : selFalse
              ? 'bg-black/5 border-2 border-black/20 text-black'
              : 'bg-white border border-black/10 text-black hover-gate:border-black/25'
        }`}
      >
        <span
          className={`material-symbols-outlined text-3xl transition-all duration-150 ${
            disabled
              ? correctFalse
                ? 'text-emerald-500'
                : wrongFalse
                  ? 'text-red-400'
                  : 'text-black/20'
              : selFalse
                ? 'text-black'
                : 'text-black/30'
          }`}
        >
          close
        </span>
        <span>False</span>
        {disabled && correctFalse && (
          <span className="material-symbols-outlined text-[18px] text-emerald-500">check_circle</span>
        )}
        {disabled && wrongFalse && (
          <span className="material-symbols-outlined text-[18px] text-red-400">cancel</span>
        )}
      </button>
    </div>
  );
}

/* ── Fill in the Blank ──────────────────────────────────────────── */
function FillBlank({ question, selected, onSelect, disabled }) {
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (!input.trim()) return;
    setSubmitted(true);
    onSelect(input.trim());
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !submitted) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // If disabled (answered), show result state
  if (disabled) {
    const isCorrect = submitted && selected && selected.toLowerCase() === question.answer.toLowerCase();
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 rounded-xl bg-white border border-black/10">
          <span className="text-sm text-black font-mono bg-black/5 px-2 py-0.5 rounded">
            {selected || input}
          </span>
          <span className="text-xs text-black/50">→</span>
          <span className="text-sm text-emerald-600 font-medium">{question.answer}</span>
          {isCorrect ? (
            <span className="material-symbols-outlined text-[18px] text-emerald-500 ml-auto">check_circle</span>
          ) : (
            <span className="material-symbols-outlined text-[18px] text-red-400 ml-auto">cancel</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your answer..."
          autoFocus
          className="flex-1 bg-white text-black text-sm rounded-xl px-4 py-3 outline-none placeholder:text-black border border-black/10 focus:border-black/25 transition-all duration-150"
        />
      </div>
      <button
        onClick={handleSubmit}
        disabled={!input.trim()}
        className="w-full py-2.5 rounded-xl bg-black text-white text-sm font-medium active:scale-[0.99] transition-all duration-150 disabled:opacity-25 disabled:cursor-not-allowed hover:bg-black/85"
      >
        Submit Answer
      </button>
    </div>
  );
}

/* ── QuizPlay ──────────────────────────────────────────────────────── */
export default function QuizPlay({
  question,
  currentIndex,
  totalQuestions,
  answered,
  onSubmitAnswer,
  onNext,
}) {
  const [selected, setSelected] = useState(null);
  const q = question;

  const handleSelect = useCallback(
    (value) => {
      if (answered) return;
      setSelected(value);
      onSubmitAnswer(value);
    },
    [answered, onSubmitAnswer]
  );

  // Reset local selection when question changes
  if (!q) return null;

  return (
    <div style={{ animation: 'fade-up 0.3s var(--ease-out-expo) both' }}>
      {/* ── Progress Bar ────────────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-black">
            Question {currentIndex + 1} / {totalQuestions}
          </span>
          <span className="text-xs text-black">
            {Math.round(((currentIndex + (answered ? 1 : 0)) / totalQuestions) * 100)}%
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-black/8 overflow-hidden">
          <div
            className="h-full rounded-full bg-black transition-all duration-300"
            style={{
              width: `${((currentIndex + (answered ? 1 : 0)) / totalQuestions) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* ── Question Type Badge ──────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-3">
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

      {/* ── Question Text ───────────────────────────────────────── */}
      <div className="mb-6">
        <h2 className="text-base font-medium text-black leading-relaxed">
          {q.type === 'fillblank'
            ? q.question.split('___').map((part, i, arr) => (
                <span key={i}>
                  {part}
                  {i < arr.length - 1 && (
                    <span className="inline-block border-b-2 border-black w-24 mx-1" />
                  )}
                </span>
              ))
            : q.question}
        </h2>
      </div>

      {/* ── Answer Input ────────────────────────────────────────── */}
      {q.type === 'multiple' && (
        <MultipleChoice
          question={q}
          selected={answered ? selected : selected}
          onSelect={handleSelect}
          disabled={answered}
        />
      )}
      {q.type === 'truefalse' && (
        <TrueFalse
          question={q}
          selected={answered ? selected : selected}
          onSelect={handleSelect}
          disabled={answered}
        />
      )}
      {q.type === 'fillblank' && (
        <FillBlank
          question={q}
          selected={selected}
          onSelect={handleSelect}
          disabled={answered}
        />
      )}

      {/* ── Feedback ────────────────────────────────────────────── */}
      {answered && (
        <div
          className={`mt-4 flex items-start gap-2 px-4 py-3 rounded-xl text-xs leading-relaxed ${
            selected === q.answer || (q.type === 'fillblank' && String(selected).toLowerCase() === String(q.answer).toLowerCase())
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
              : 'bg-red-50 border border-red-200 text-red-600'
          }`}
          style={{ animation: 'fade-up 0.2s var(--ease-out-expo) both' }}
        >
          <span className="material-symbols-outlined text-[16px] mt-0.5 flex-shrink-0">
            {selected === q.answer || (q.type === 'fillblank' && String(selected).toLowerCase() === String(q.answer).toLowerCase())
              ? 'check_circle'
              : 'cancel'}
          </span>
          <div>
            <span className="font-semibold">
              {selected === q.answer || (q.type === 'fillblank' && String(selected).toLowerCase() === String(q.answer).toLowerCase())
                ? 'Correct!'
                : 'Not quite.'}
            </span>
            <span className="ml-1">{q.explanation}</span>
          </div>
        </div>
      )}

      {/* ── Next Button ─────────────────────────────────────────── */}
      {answered && (
        <button
          onClick={onNext}
          className="mt-4 w-full py-2.5 rounded-xl bg-black text-white text-sm font-medium active:scale-[0.99] transition-all duration-150 hover:bg-black/85 flex items-center justify-center gap-2"
          style={{ animation: 'fade-up 0.2s var(--ease-out-expo) both' }}
        >
          {currentIndex < totalQuestions - 1 ? (
            <>
              Next
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </>
          ) : (
            <>
              See Results
              <span className="material-symbols-outlined text-[16px]">bar_chart</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
