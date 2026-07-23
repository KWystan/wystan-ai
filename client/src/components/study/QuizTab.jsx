import { useState } from 'react';

export default function QuizTab({ quiz, isGenerating, onGenerate }) {
  const [currentQ, setCurrentQ] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [fillInput, setFillInput] = useState('');

  const question = quiz[currentQ] || null;
  const isMultiple = question?.type === 'multiple';
  const isTrueFalse = question?.type === 'truefalse';
  const isFillBlank = question?.type === 'fillblank';
  const isCorrect = selectedAnswer === question?.answer;

  const handleAnswer = (answer) => {
    if (showResult) return;
    setSelectedAnswer(answer);
    setShowResult(true);
    const correct = answer === question.answer;
    if (correct) setScore(s => s + 1);
  };

  const handleFillSubmit = () => {
    if (showResult || !fillInput.trim()) return;
    handleAnswer(fillInput.trim());
  };

  const handleNext = () => {
    setShowResult(false);
    setSelectedAnswer(null);
    setFillInput('');
    if (currentQ >= quiz.length - 1) {
      setFinished(true);
    } else {
      setCurrentQ(q => q + 1);
    }
  };

  const handleRestart = () => {
    setCurrentQ(0);
    setSelectedAnswer(null);
    setShowResult(false);
    setScore(0);
    setFinished(false);
    setFillInput('');
  };

  // Empty state
  if (!quiz.length && !isGenerating) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
        <span className="material-symbols-outlined text-2xl text-black mb-2">quiz</span>
        <p className="text-xs text-black mb-3">Generate a practice quiz from your materials.</p>
        <button onClick={onGenerate}
          className="text-[11px] font-medium bg-black text-white rounded-lg px-3 py-1.5 active:scale-[0.97] transition-all duration-150">
          Generate Quiz
        </button>
      </div>
    );
  }

  // Finished screen
  if (finished) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
        <span className="material-symbols-outlined text-3xl text-black mb-2">
          {score >= quiz.length * 0.7 ? 'award_star' : 'trophy'}
        </span>
        <h3 className="text-sm font-semibold text-black mb-1">Quiz Complete!</h3>
        <p className="text-2xl font-bold text-black mb-1">{score} / {quiz.length}</p>
        <p className="text-xs text-black mb-4">
          {score >= quiz.length * 0.9 ? 'Excellent!' :
           score >= quiz.length * 0.7 ? 'Good job!' :
           score >= quiz.length * 0.5 ? 'Keep practicing.' : 'Review the material and try again.'}
        </p>
        <button onClick={handleRestart}
          className="text-[11px] font-medium bg-black text-white rounded-lg px-3 py-1.5 active:scale-[0.97] transition-all duration-150">
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Progress bar */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 h-1.5 rounded-full bg-black/8 overflow-hidden">
          <div className="h-full bg-black rounded-full transition-all duration-300"
               style={{ width: `${((currentQ + 1) / quiz.length) * 100}%` }} />
        </div>
        <span className="text-[10px] text-black shrink-0">{currentQ + 1}/{quiz.length}</span>
      </div>

      {isGenerating ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex gap-1">
            <span className="w-2 h-2 bg-black/20 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 bg-black/20 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 bg-black/20 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      ) : question ? (
        <div className="flex-1 flex flex-col">
          <p className="text-xs font-medium text-black mb-3 leading-relaxed">{question.question}</p>

          {/* Multiple choice */}
          {isMultiple && question.options?.map((opt, i) => (
            <button key={i} onClick={() => handleAnswer(i)}
              disabled={showResult}
              className={`w-full text-left text-[11px] px-3 py-2 rounded-lg mb-1.5 border transition-all duration-100 active:scale-[0.98]
                ${showResult && i === question.answer ? 'bg-emerald-50 border-emerald-300 text-emerald-700' :
                  showResult && i === selectedAnswer && !isCorrect ? 'bg-red-50 border-red-200 text-red-600' :
                  'border-black/10 text-black hover-gate:border-black/25'}
                ${showResult ? 'cursor-default' : 'cursor-pointer'} disabled:opacity-60`}>
              {String.fromCharCode(65 + i)}. {opt}
            </button>
          ))}

          {/* True/False */}
          {isTrueFalse && (
            <div className="flex gap-2">
              {[true, false].map(val => (
                <button key={String(val)} onClick={() => handleAnswer(val)}
                  disabled={showResult}
                  className={`flex-1 text-[11px] px-3 py-2 rounded-lg border transition-all duration-100 active:scale-[0.98]
                    ${showResult && val === question.answer ? 'bg-emerald-50 border-emerald-300 text-emerald-700' :
                      showResult && val === selectedAnswer && !isCorrect ? 'bg-red-50 border-red-200 text-red-600' :
                      'border-black/10 text-black hover-gate:border-black/25'}
                    ${showResult ? 'cursor-default' : 'cursor-pointer'} disabled:opacity-60`}>
                  {val ? 'True' : 'False'}
                </button>
              ))}
            </div>
          )}

          {/* Fill in the blank */}
          {isFillBlank && (
            <div className="flex gap-2">
              <input
                value={fillInput}
                onChange={e => setFillInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleFillSubmit(); }}
                disabled={showResult}
                placeholder="Type your answer..."
                className="flex-1 text-[11px] px-3 py-2 rounded-lg border border-black/10 text-black outline-none focus:border-black/25 disabled:opacity-40 transition-all duration-100"
                autoFocus
              />
              {!showResult && (
                <button onClick={handleFillSubmit}
                  disabled={!fillInput.trim()}
                  className="text-[11px] px-3 py-2 rounded-lg bg-black text-white disabled:opacity-30 active:scale-[0.97] transition-all duration-100">
                  Submit
                </button>
              )}
            </div>
          )}

          {/* Feedback */}
          {showResult && (
            <div className={`mt-3 px-3 py-2 rounded-lg text-[11px] leading-relaxed
              ${isCorrect ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                             'bg-red-50 text-red-600 border border-red-200'}`}>
              <p className="font-medium mb-1">{isCorrect ? 'Correct!' : 'Incorrect'}</p>
              <p>{question.explanation}</p>
            </div>
          )}

          {/* Next / Results button */}
          <div className="mt-auto pt-3">
            <button onClick={handleNext}
              disabled={!showResult}
              className="w-full text-[11px] font-medium bg-black text-white rounded-lg py-2 active:scale-[0.97] transition-all duration-150 disabled:opacity-30">
              {currentQ >= quiz.length - 1 ? 'See Results' : 'Next Question'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
