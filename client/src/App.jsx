import { lazy, Suspense, useState } from "react";
import { BrowserRouter, Routes, Route, Outlet, useNavigate } from "react-router-dom";
import { AppProvider, useApp } from "./lib/AppContext";
import Sidebar from "./components/Sidebar";
import ErrorBoundary from "./components/ErrorBoundary";

const ChatPage = lazy(() => import("./components/ChatPage"));
const GeneratePage = lazy(() => import("./components/GeneratePage"));
const ProjectPage = lazy(() => import("./components/ProjectPage"));
const ToolsPage = lazy(() => import("./components/ToolsPage"));
const FlashcardsPage = lazy(() => import("./components/FlashcardsPage"));
const QuizPage = lazy(() => import("./components/QuizPage"));
const StudyHubPage = lazy(() => import("./components/StudyHubPage"));

function PageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-5 h-5 rounded-full border-2 border-black/15 border-t-black/40 animate-spin" />
    </div>
  );
}

/* ── Layout: renders Sidebar once, persists across route changes ── */
function MainLayout() {
  const { user, sidebarOpen, setSidebarOpen, currentConversationId, setCurrentConversationId, handleOpenAuth, handleSignOut } = useApp();
  const [refreshKey, setRefreshKey] = useState(0);
  const navigate = useNavigate();

  return (
    <div className="fixed inset-0 z-50 flex bg-white">
      <Sidebar
        user={user}
        onNewChat={() => {
          setCurrentConversationId(null);
          navigate('/chat');
        }}
        currentConversationId={currentConversationId}
        onSelectConversation={(id) => navigate(`/chat/${id}`)}
        onOpenAuth={handleOpenAuth}
        onSignOut={handleSignOut}
        sidebarOpen={sidebarOpen}
        onCloseSidebar={() => setSidebarOpen(false)}
        refreshKey={refreshKey}
      />

      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/10 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <div className="flex-1 flex flex-col min-w-0 h-full">
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <AppProvider>
        <Routes>
          <Route element={<MainLayout />}>
            <Route path="/" element={<ChatPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/chat/:conversationId" element={<ChatPage />} />
            <Route path="/project/:id" element={<ProjectPage />} />
            <Route path="/generate" element={<GeneratePage />} />
            <Route path="/learn" element={<StudyHubPage />} />
            <Route path="/tools" element={<ToolsPage />} />
            <Route path="/learn/flashcards" element={<FlashcardsPage />} />
            <Route path="/learn/quiz" element={<QuizPage />} />
          </Route>
        </Routes>
      </AppProvider>
    </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
