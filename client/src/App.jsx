import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

const ChatPage = lazy(() => import("./components/ChatPage"));
const GeneratePage = lazy(() => import("./components/GeneratePage"));
const ProjectPage = lazy(() => import("./components/ProjectPage"));
const LearnPage = lazy(() => import("./components/LearnPage"));
const FlashcardsPage = lazy(() => import("./components/FlashcardsPage"));
const QuizPage = lazy(() => import("./components/QuizPage"));

function PageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-5 h-5 rounded-full border-2 border-black/15 border-t-black/40 animate-spin" />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<ChatPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/chat/:conversationId" element={<ChatPage />} />
          <Route path="/project/:id" element={<ProjectPage />} />
          <Route path="/generate" element={<GeneratePage />} />
          <Route path="/learn" element={<LearnPage />} />
          <Route path="/learn/flashcards" element={<FlashcardsPage />} />
          <Route path="/learn/quiz" element={<QuizPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
