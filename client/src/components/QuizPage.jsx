import { Link } from 'react-router-dom';
import useQuiz from '../hooks/useQuiz.js';
import QuizConfig from './QuizConfig.jsx';
import QuizPlay from './QuizPlay.jsx';
import QuizResults from './QuizResults.jsx';
import { useApp } from '../lib/AppContext';

export default function QuizPage() {
  const { setSidebarOpen } = useApp();

  const quiz = useQuiz();

  return (
    <>
      {/* Header */}
      <header className="flex-shrink-0 bg-white/90 backdrop-blur-md border-b border-black/8">
        <div className="px-4 h-12 flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center text-black hover-gate:text-black active:scale-[0.97] transition-all duration-150 [backface-visibility:hidden]"
            aria-label="Open sidebar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" className="text-[20px]"><path d="M0 0h24v24H0z" fill="none" /><path fill="currentColor" d="M2 5.995c0-.55.446-.995.995-.995h8.01a.995.995 0 0 1 0 1.99h-8.01A.995.995 0 0 1 2 5.995M2 12c0-.55.446-.995.995-.995h18.01a.995.995 0 1 1 0 1.99H2.995A.995.995 0 0 1 2 12m.995 5.01a.995.995 0 0 0 0 1.99h12.01a.995.995 0 0 0 0-1.99z" /></svg>
          </button>
          <Link
            to="/learn"
            className="w-8 h-8 rounded-lg border border-black/12 flex items-center justify-center text-black/50 hover-gate:border-black/35 hover-gate:text-black active:scale-[0.97] transition-all duration-150"
            aria-label="Back to tools"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          </Link>
          <span className="material-symbols-outlined text-[20px] text-black/40">quiz</span>
          <span className="text-sm font-medium text-black/70 truncate">Quiz</span>
        </div>
      </header>

      {/* Body */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 w-full">
          {quiz.phase === 'idle' && (
            <QuizConfig
              onGenerate={quiz.startGeneration}
              isGenerating={false}
              error={quiz.error}
            />
          )}

          {quiz.phase === 'generating' && (
            <QuizConfig
              onGenerate={quiz.startGeneration}
              isGenerating={true}
              error={null}
            />
          )}

          {quiz.phase === 'playing' && quiz.currentQuestion && (
            <QuizPlay
              key={quiz.currentIndex}
              question={quiz.currentQuestion}
              currentIndex={quiz.currentIndex}
              totalQuestions={quiz.totalQuestions}
              answered={quiz.answered}
              onSubmitAnswer={quiz.submitAnswer}
              onNext={quiz.nextQuestion}
            />
          )}

          {quiz.phase === 'results' && (
            <QuizResults
              answerLog={quiz.answerLog}
              score={quiz.score}
              totalQuestions={quiz.totalQuestions}
              onRetry={quiz.retry}
              onNewQuiz={quiz.reset}
            />
          )}
        </div>
      </main>
    </>
  );
}
