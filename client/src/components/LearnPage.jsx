import { Link, useNavigate } from "react-router-dom";
import { useApp } from "../lib/AppContext";

const TOOLS = [
  {
    id: "flashcards",
    title: "Flashcards",
    subtitle: "Turn notes, PDFs, or any topic into study cards.",
    icon: "memory_alt",
    status: "free",
    href: "/learn/flashcards",
  },
  {
    id: "chat-pdf",
    title: "Chat with PDF",
    subtitle: "Upload a document and ask questions ? AI answers with citations from the text.",
    icon: "picture_as_pdf",
    status: "coming-soon",
    href: null,
  },
  {
    id: "ai-tutor",
    title: "AI Tutor",
    subtitle: "Pick a subject and level ? get adaptive tutoring that adjusts to what you get wrong.",
    icon: "school",
    status: "coming-soon",
    href: null,
  },
  {
    id: "essay-grader",
    title: "Essay Grader",
    subtitle: "Paste an essay for scoring on structure, grammar, clarity, and argument strength.",
    icon: "rate_review",
    status: "coming-soon",
    href: null,
  },
  {
    id: "math-solver",
    title: "Math Solver",
    subtitle: "Type or upload a problem ? get step-by-step solutions with explanations.",
    icon: "calculate",
    status: "coming-soon",
    href: null,
  },
  {
    id: "language-tutor",
    title: "Language Tutor",
    subtitle: "Practice conversations in any language with grammar corrections and better phrasing.",
    icon: "translate",
    status: "coming-soon",
    href: null,
  },
  {
    id: "practice-tests",
    title: "Practice Tests",
    subtitle: "Simulate a timed exam with scoring and detailed question breakdown.",
    icon: "assignment",
    status: "coming-soon",
    href: null,
  },
  {
    id: "flashcard-export",
    title: "Flashcard Exporter",
    subtitle: "Export decks to Anki, Quizlet, CSV, or printable PDF for offline study.",
    icon: "file_download",
    status: "coming-soon",
    href: null,
  },
  {
    id: "grammar-check",
    title: "Grammar & Style",
    subtitle: "Fix grammar, improve style, and check readability ? like a free Grammarly.",
    icon: "spellcheck",
    status: "coming-soon",
    href: null,
  },
  {
    id: "paraphraser",
    title: "Paraphraser",
    subtitle: "Rewrite text at any level: simpler, formal, academic, or creative.",
    icon: "edit_note",
    status: "coming-soon",
    href: null,
  },
  {
    id: "code-tutor",
    title: "Code Tutor",
    subtitle: "Explain concepts, review your code, or generate practice problems with test cases.",
    icon: "code",
    status: "coming-soon",
    href: null,
  },
  {
    id: "data-analyzer",
    title: "Data Analyzer",
    subtitle: "Upload CSV or Excel ? AI generates insights, charts, and summary stats.",
    icon: "table_chart",
    status: "coming-soon",
    href: null,
  },
  {
    id: "lab-report",
    title: "Lab Report Generator",
    subtitle: "Input experiment data ? get a formatted report with hypothesis, method, and conclusion.",
    icon: "science",
    status: "coming-soon",
    href: null,
  },
  {
    id: "study-guide",
    title: "Study Guide",
    subtitle: "Generate structured guides with key terms, concepts, and practice questions.",
    icon: "menu_book",
    status: "coming-soon",
    href: null,
  },
  {
    id: "vocabulary",
    title: "Vocabulary Builder",
    subtitle: "Extract key terms with definitions, examples, and memory aids from any text.",
    icon: "dictionary",
    status: "coming-soon",
    href: null,
  },
  {
    id: "explain",
    title: "Explain Like I'm 15",
    subtitle: "Simplify complex topics with analogies and plain-language breakdowns.",
    icon: "lightbulb",
    status: "coming-soon",
    href: null,
  },
  {
    id: "comparison",
    title: "Comparison Matrix",
    subtitle: "Compare theories, concepts, or methods across key dimensions side by side.",
    icon: "stacked_bar_chart",
    status: "coming-soon",
    href: null,
  },
  {
    id: "timeline",
    title: "Timeline Generator",
    subtitle: "Turn history or process text into a chronological timeline of events.",
    icon: "timeline",
    status: "coming-soon",
    href: null,
  },
  {
    id: "essay-outline",
    title: "Essay Outline",
    subtitle: "Create structured outlines with thesis, arguments, and suggested evidence.",
    icon: "article",
    status: "coming-soon",
    href: null,
  },
  {
    id: "memory-aids",
    title: "Memory Aids",
    subtitle: "Generate mnemonics, acronyms, and memory tricks for key facts.",
    icon: "psychology",
    status: "coming-soon",
    href: null,
  },
  {
    id: "summarize",
    title: "Summarize",
    subtitle: "Condense long texts and documents into key bullet points.",
    icon: "summarize",
    status: "coming-soon",
    href: null,
  },
  {
    id: "quiz",
    title: "Quiz Generator",
    subtitle: "Create interactive quizzes from any text or document.",
    icon: "quiz",
    status: "free",
    href: "/learn/quiz",
  },
  {
    id: "mindmap",
    title: "Mind Maps",
    subtitle: "Visual outlines and concept maps from any content.",
    icon: "account_tree",
    status: "coming-soon",
    href: null,
  },
  {
    id: "writing-prompts",
    title: "Writing Prompts",
    subtitle: "Generate creative writing prompts by genre, tone, or keywords.",
    icon: "draw",
    status: "coming-soon",
    href: null,
  },
  {
    id: "citation-tool",
    title: "Citation Formatter",
    subtitle: "Paste a URL or title ? get formatted citations in APA, MLA, Chicago, or IEEE.",
    icon: "format_quote",
    status: "coming-soon",
    href: null,
  },
  {
    id: "study-planner",
    title: "Study Schedule Planner",
    subtitle: "Tell it your exam date and topics ? AI builds a day-by-day study plan.",
    icon: "calendar_month",
    status: "coming-soon",
    href: null,
  },
  {
    id: "debate-sim",
    title: "Debate Simulator",
    subtitle: "Pick a topic ? AI argues the opposing side to sharpen your critical thinking.",
    icon: "forum",
    status: "coming-soon",
    href: null,
  },
  {
    id: "story-gen",
    title: "Story Generator",
    subtitle: "Give a genre, characters, and setting ? AI writes a short story.",
    icon: "auto_stories",
    status: "coming-soon",
    href: null,
  },
  {
    id: "reading-level",
    title: "Reading Level Adjuster",
    subtitle: "Rewrite any text for a specific grade level from elementary to college.",
    icon: "text_fields",
    status: "coming-soon",
    href: null,
  },
  {
    id: "pomodoro",
    title: "Pomodoro Timer",
    subtitle: "Built-in study timer with AI-suggested break activities.",
    icon: "timer",
    status: "coming-soon",
    href: null,
  },
];

export default function LearnPage() {
  const { setSidebarOpen } = useApp();
  const navigate = useNavigate();

  return (
    <>
      <header className="flex-shrink-0 bg-white/90 backdrop-blur-md border-b border-black/8">
        <div className="px-4 h-12 flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center text-black hover-gate:text-black active:scale-[0.97] transition-all duration-150 [backface-visibility:hidden]"
            aria-label="Open sidebar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" className="text-[20px]"><path d="M0 0h24v24H0z" fill="none" /><path fill="currentColor" d="M2 5.995c0-.55.446-.995.995-.995h8.01a.995.995 0 0 1 0 1.99h-8.01A.995.995 0 0 1 2 5.995M2 12c0-.55.446-.995.995-.995h18.01a.995.995 0 1 1 0 1.99H2.995A.995.995 0 0 1 2 12m.995 5.01a.995.995 0 0 0 0 1.99h12.01a.995.995 0 0 0 0-1.99z" /></svg>
          </button>
          <span className="material-symbols-outlined text-[20px] text-black mr-2">school</span>
          <span className="text-sm font-medium text-black">Learn</span>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 w-full">
            {/* Heading */}
            <div className="mb-8 text-center" style={{ animation: "fade-up 0.3s var(--ease-out-expo) both" }}>
              <h1 className="font-display text-2xl font-bold text-black mb-1">Learning Tools</h1>
              <p className="text-sm text-black">
                Free, AI-powered tools to help you study and learn faster.
              </p>
            </div>

            {/* Tool Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
              {TOOLS.map((tool, i) =>
                tool.href ? (
                  <Link
                    key={tool.id}
                    to={tool.href}
                    className="group block rounded-2xl border border-black/8 bg-white p-5 hover-gate:border-black/20 active:scale-[0.98] transition-all duration-150 [backface-visibility:hidden]"
                    style={{ animation: "fade-up 0.3s var(--ease-out-expo) both", animationDelay: `${i * 0.06}s` }}
                  >
                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-2xl text-black mt-0.5">{tool.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h3 className="text-sm font-semibold text-black">{tool.title}</h3>
                          <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 leading-none">
                            Free
                          </span>
                        </div>
                        <p className="text-xs text-black">{tool.subtitle}</p>
                      </div>
                      <span className="material-symbols-outlined text-[16px] text-black opacity-0 group-hover-gate:opacity-100 transition-all duration-150 -mr-1">
                        arrow_forward
                      </span>
                    </div>
                  </Link>
                ) : (
                  <div
                    key={tool.id}
                    className="rounded-2xl border border-black/5 bg-black/[0.02] p-5 opacity-50 cursor-not-allowed select-none"
                    style={{ animation: "fade-up 0.3s var(--ease-out-expo) both", animationDelay: `${i * 0.06}s` }}
                  >
                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-2xl text-black mt-0.5">{tool.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h3 className="text-sm font-semibold text-black">{tool.title}</h3>
                          <span className="text-[10px] font-medium text-black bg-black/5 border border-black/8 rounded-full px-2 py-0.5 leading-none">
                            Coming Soon
                          </span>
                        </div>
                        <p className="text-xs text-black">{tool.subtitle}</p>
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        </main>
    </>
  );
}
