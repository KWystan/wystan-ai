import { useCallback } from 'react';
import { useApp } from '../lib/AppContext';
import useStudyHub from '../hooks/useStudyHub';
import SourceSidebar from './study/SourceSidebar';
import ChatCanvas from './study/ChatCanvas';
import ToolSidebar from './study/ToolSidebar';
import SourcePreviewModal from './study/SourcePreviewModal';

export default function StudyHubPage() {
  const { user, setSidebarOpen } = useApp();
  const hub = useStudyHub({ user });

  const handleCitationClick = useCallback((chunkId, fileName, pageNumber) => {
    if (chunkId) hub.openPreview(chunkId, fileName, pageNumber);
  }, [hub]);

  return (
    <div className="h-full flex">
      {/* Mobile hamburger */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="md:hidden fixed top-3 left-3 z-50 w-9 h-9 rounded-lg flex items-center justify-center text-black bg-white/90 backdrop-blur-sm border border-black/8"
        aria-label="Open sidebar"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" className="text-[20px]">
          <path d="M0 0h24v24H0z" fill="none" />
          <path fill="currentColor" d="M2 5.995c0-.55.446-.995.995-.995h8.01a.995.995 0 0 1 0 1.99h-8.01A.995.995 0 0 1 2 5.995M2 12c0-.55.446-.995.995-.995h18.01a.995.995 0 1 1 0 1.99H2.995A.995.995 0 0 1 2 12m.995 5.01a.995.995 0 0 0 0 1.99h12.01a.995.995 0 0 0 0-1.99z" />
        </svg>
      </button>

      {/* Left: Sources sidebar */}
      <div className="hidden md:flex">
        <SourceSidebar
          sources={hub.sources}
          activeSourceIds={hub.activeSourceIds}
          isUploading={hub.isUploading}
          onUpload={hub.uploadFile}
          onToggle={hub.toggleSource}
          onDelete={hub.deleteSource}
          onFetchSources={hub.fetchSources}
        />
      </div>

      {/* Center: Chat canvas */}
      <ChatCanvas
        messages={hub.messages}
        activeSourceIds={hub.activeSourceIds}
        isChatting={hub.isChatting}
        chatError={hub.chatError}
        onSend={hub.sendMessage}
        onAbort={hub.abortChat}
        onClear={hub.clearChat}
        onCitationClick={handleCitationClick}
      />

      {/* Right: Tools sidebar */}
      <div className="hidden lg:flex">
        <ToolSidebar
          toolTab={hub.toolTab}
          onSetTab={hub.setToolTab}
          flashcards={hub.flashcards}
          quiz={hub.quiz}
          summary={hub.summary}
          isGeneratingFlashcards={hub.isGeneratingFlashcards}
          isGeneratingQuiz={hub.isGeneratingQuiz}
          isGeneratingSummary={hub.isGeneratingSummary}
          onGenerateFlashcards={hub.generateFlashcards}
          onGenerateQuiz={hub.generateQuiz}
          onGenerateSummary={hub.generateSummary}
          activeSourceIds={hub.activeSourceIds}
        />
      </div>

      {/* Citation preview modal */}
      {hub.previewSource && (
        <SourcePreviewModal
          chunkId={hub.previewSource.chunkId}
          fileName={hub.previewSource.fileName}
          pageNumber={hub.previewSource.pageNumber}
          onClose={hub.closePreview}
        />
      )}
    </div>
  );
}
