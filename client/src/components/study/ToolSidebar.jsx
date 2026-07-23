import FlashcardTab from './FlashcardTab';
import QuizTab from './QuizTab';
import SummaryTab from './SummaryTab';

const TABS = [
  { id: 'flashcards', label: 'Flashcards', icon: 'style' },
  { id: 'quiz', label: 'Quiz', icon: 'quiz' },
  { id: 'summary', label: 'Summary', icon: 'summarize' },
];

export default function ToolSidebar({
  toolTab, onSetTab,
  flashcards, quiz, summary,
  isGeneratingFlashcards, isGeneratingQuiz, isGeneratingSummary,
  onGenerateFlashcards, onGenerateQuiz, onGenerateSummary,
  activeSourceIds,
}) {
  return (
    <div className="w-[320px] border-l border-black/8 bg-white flex flex-col shrink-0">
      {/* Tab bar */}
      <div className="flex border-b border-black/8 shrink-0" role="tablist">
        {TABS.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={toolTab === tab.id}
            onClick={() => onSetTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-medium transition-all duration-100
              ${toolTab === tab.id
                ? 'text-black border-b-2 border-black'
                : 'text-black/40 hover-gate:text-black border-b-2 border-transparent'}`}
          >
            <span className="material-symbols-outlined text-[14px]">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {toolTab === 'flashcards' && (
          <FlashcardTab
            flashcards={flashcards}
            isGenerating={isGeneratingFlashcards}
            onGenerate={onGenerateFlashcards}
          />
        )}
        {toolTab === 'quiz' && (
          <QuizTab
            quiz={quiz}
            isGenerating={isGeneratingQuiz}
            onGenerate={onGenerateQuiz}
          />
        )}
        {toolTab === 'summary' && (
          <SummaryTab
            summary={summary}
            isGenerating={isGeneratingSummary}
            onGenerate={onGenerateSummary}
          />
        )}

        {/* No sources hint */}
        {!activeSourceIds.length && (
          <div className="text-center py-4 border-t border-black/8 mt-3">
            <p className="text-[10px] text-black">Select sources on the left to enable tool generation.</p>
          </div>
        )}
      </div>
    </div>
  );
}
