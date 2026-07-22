import { useState, useRef, useCallback, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getToken, authFetch } from "../lib/auth.js";
import Sidebar from "./Sidebar.jsx";

/* Flip card component with 3D animation */
function FlipCard({ card, flipped, onClick }) {
  return (
    <div
      className="relative w-full max-w-lg mx-auto aspect-[3/2] cursor-pointer select-none"
      onClick={onClick}
      style={{ perspective: "1000px" }}
    >
      <div
        className="relative w-full h-full transition-transform duration-500"
        style={{
          transformStyle: "preserve-3d",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          willChange: "transform",
        }}
      >
        {/* Front (question) */}
        <div
          className="absolute inset-0 rounded-2xl border border-black/10 bg-white flex flex-col items-center justify-center p-6 text-center"
          style={{ backfaceVisibility: "hidden" }}
        >
          <span className="material-symbols-outlined text-xl text-black mb-3">help_outline</span>
          <p className="text-sm leading-relaxed text-black max-w-md [overflow-wrap:anywhere]">{card.question}</p>
          <p className="text-[10px] text-black mt-4">Tap to reveal answer</p>
        </div>
        {/* Back (answer) */}
        <div
          className="absolute inset-0 rounded-2xl border border-black/10 bg-black text-white flex flex-col items-center justify-center p-6 text-center"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          <span className="material-symbols-outlined text-xl text-white/70 mb-3">lightbulb</span>
          <p className="text-sm leading-relaxed text-white max-w-md [overflow-wrap:anywhere]">{card.answer}</p>
          <p className="text-[10px] text-white/50 mt-4">Tap to see question</p>
        </div>
      </div>
    </div>
  );
}

export default function FlashcardsPage() {
    const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  /* Auth state */
  useEffect(() => {
    const token = getToken();
    if (token) {
      authFetch("/api/auth/me").then((res) => {
        if (res.ok) res.json().then((data) => setUser(data.user));
      });
    }
  }, []);

  /* Sidebar callbacks */
  const handleClear = () => navigate("/chat");
  const handleSignOut = () => {
    if (typeof clearTokens !== "undefined") clearTokens();
    setUser(null);
    navigate("/chat");
  };
  const handleOpenAuth = () => navigate("/chat");

const [inputMode, setInputMode] = useState("text"); // "text" | "upload"
  const [text, setText] = useState("");
  const [uploadedFilename, setUploadedFilename] = useState(null);
  const [uploadedContent, setUploadedContent] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [cards, setCards] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [shuffledSeed, setShuffledSeed] = useState(0);
  const fileInputRef = useRef(null);

  const orderedCards = useCallback(() => {
    if (!cards.length) return [];
    if (!shuffledSeed) return cards;
    const arr = [...cards];
    // Deterministic shuffle based on seed
    const seed = shuffledSeed;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = (seed * (i + 1) + i) % (i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [cards, shuffledSeed]);

  const displayCards = orderedCards();
  const currentCard = displayCards[currentIndex] || null;
  const canGenerate =
    (inputMode === "text" && text.trim().length > 0) ||
    (inputMode === "upload" && uploadedContent.trim().length > 0);

  /* Reset when cards change */
  useEffect(() => {
    setCurrentIndex(0);
    setFlipped(false);
  }, [cards]);

  /* Keyboard shortcuts */
  useEffect(() => {
    const handler = (e) => {
      if (!cards.length) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      } else if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        handleNext();
      } else if (e.key === "Enter" || e.key === "f") {
        e.preventDefault();
        setFlipped((p) => !p);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [cards.length, currentIndex]);

  const handlePrev = () => {
    setFlipped(false);
    setCurrentIndex((p) => Math.max(0, p - 1));
  };

  const handleNext = () => {
    setFlipped(false);
    setCurrentIndex((p) => Math.min(displayCards.length - 1, p + 1));
  };

  const handleShuffle = () => {
    setShuffledSeed((p) => (p + 1) % 1000000);
  };

  /* File upload */
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFile(file);
  };

  const handleFileDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await uploadFile(file);
  };

  const uploadFile = async (file) => {
    setIsUploading(true);
    setError(null);

    // Validate file
    const maxSize = 10 * 1024 * 1024; // 10 MB
    if (file.size > maxSize) {
      setIsUploading(false);
      setError("File is too large. Maximum size is 10 MB.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });

      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error("Server returned an invalid response. Check that the API server is running.");
      }

      if (!res.ok) {
        throw new Error(data.error || `Upload failed (${res.status})`);
      }

      if (!data.content || data.content.trim().length === 0) {
        throw new Error("No text could be extracted from this file. Try a different file.");
      }

      setUploadedFilename(data.filename);
      setUploadedContent(data.content);
      setText(data.content);
    } catch (err) {
      console.error("[Flashcards] Upload error:", err);
      setError(err.message || "Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  /* Generate flashcards */
  const handleGenerate = async () => {
    const sourceText =
      inputMode === "text" ? text.trim() : uploadedContent.trim();
    if (!sourceText) return;

    setIsGenerating(true);
    setError(null);
    setCards([]);

    try {
      const res = await fetch("/api/flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sourceText }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Generation failed");
      }

      if (!data.cards || !Array.isArray(data.cards) || data.cards.length === 0) {
        throw new Error(
          "We couldn't generate flashcards from that content. Try adjusting the text or providing a clearer topic."
        );
      }

      setCards(data.cards);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  /* Remove uploaded file */
  const handleRemoveFile = () => {
    setUploadedFilename(null);
    setUploadedContent("");
    if (inputMode === "upload") setText("");
  };

  /* Drag handlers for drop zone */
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex bg-white">
      {/* Sidebar */}
      <Sidebar
        user={user}
        onNewChat={handleClear}
        currentConversationId={null}
        onSelectConversation={(id) => navigate(`/chat/${id}`)}
        onSignOut={handleSignOut}
        onOpenAuth={handleOpenAuth}
        sidebarOpen={sidebarOpen}
        onCloseSidebar={() => setSidebarOpen(false)}
      />

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/10 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* Header */}
        <header className="flex-shrink-0 bg-white/90 backdrop-blur-md">
          <div className="px-4 h-12 flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center text-black hover-gate:text-black active:scale-[0.97] transition-all duration-150 [backface-visibility:hidden]"
              aria-label="Open sidebar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" className="text-[20px]"><path d="M0 0h24v24H0z" fill="none" /><path fill="currentColor" d="M2 5.995c0-.55.446-.995.995-.995h8.01a.995.995 0 0 1 0 1.99h-8.01A.995.995 0 0 1 2 5.995M2 12c0-.55.446-.995.995-.995h18.01a.995.995 0 1 1 0 1.99H2.995A.995.995 0 0 1 2 12m.995 5.01a.995.995 0 0 0 0 1.99h12.01a.995.995 0 0 0 0-1.99z" /></svg>
            </button>
            <span className="material-symbols-outlined text-[20px] text-black/40">memory_alt</span>
            <span className="text-sm font-medium text-black/70 truncate">Flashcards</span>
          </div>
        </header>

        {/* Body */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-6 w-full">
            {cards.length === 0 ? (
              /* Input Section */
              <div style={{ animation: "fade-up 0.3s var(--ease-out-expo) both" }}>
                <h1 className="font-display text-xl font-bold text-black mb-1">Flashcard Generator</h1>
                <p className="text-xs text-black mb-6">
                  Turn your notes, PDFs, or any topic into study flashcards.
                </p>

                {/* Mode Tabs */}
                <div className="flex gap-1 mb-4 p-0.5 rounded-xl bg-black/5 border border-black/8 w-fit">
                  <button
                    onClick={() => { setInputMode("text"); setError(null); }}
                    className={`px-3.5 py-1.5 text-xs rounded-lg font-medium transition-all duration-150 ${
                      inputMode === "text"
                        ? "bg-white text-black border border-black/10 shadow-sm"
                        : "text-black hover-gate:text-black"
                    }`}
                  >
                    Type / Paste
                  </button>
                  <button
                    onClick={() => { setInputMode("upload"); setError(null); }}
                    className={`px-3.5 py-1.5 text-xs rounded-lg font-medium transition-all duration-150 ${
                      inputMode === "upload"
                        ? "bg-white text-black border border-black/10 shadow-sm"
                        : "text-black hover-gate:text-black"
                    }`}
                  >
                    Upload Material
                  </button>
                </div>

                {/* Text Input */}
                {inputMode === "text" ? (
                  <div className="mb-4">
                    <textarea
                      value={text}
                      onChange={(e) => {
                        setText(e.target.value);
                        if (uploadedFilename) handleRemoveFile();
                      }}
                      placeholder="e.g., 'Photosynthesis' or paste a paragraph from your textbook..."
                      maxLength={50000}
                      rows={6}
                      className="w-full bg-white text-black text-sm rounded-xl px-4 py-3 resize-y min-h-[150px] outline-none placeholder:text-black border border-black/10 focus:border-black/25 transition-all duration-150 leading-relaxed"
                    />
                    <p className="text-[10px] text-black mt-1 text-right">{text.length.toLocaleString()} / 50,000</p>
                  </div>
                ) : (
                  /* Upload Area */
                  <div className="mb-4">
                    {uploadedFilename ? (
                      <div className="rounded-xl border border-black/10 bg-white p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="material-symbols-outlined text-[18px] text-black">description</span>
                          <span className="text-xs text-black truncate flex-1">{uploadedFilename}</span>
                          <button
                            onClick={handleRemoveFile}
                            className="w-6 h-6 rounded flex items-center justify-center text-black hover-gate:text-black hover-gate:bg-black/5 transition-all duration-150"
                            aria-label="Remove file"
                          >
                            <span className="material-symbols-outlined text-[14px]">close</span>
                          </button>
                        </div>
                        <div className="max-h-40 overflow-y-auto rounded-lg bg-black/[0.02] border border-black/5 p-3">
                          <pre className="text-[11px] text-black leading-relaxed whitespace-pre-wrap font-mono">
                            {uploadedContent.slice(0, 2000)}
                            {uploadedContent.length > 2000 ? "\n\n... (content truncated for preview)" : ""}
                          </pre>
                        </div>
                        <p className="text-[10px] text-black mt-2">
                          {(uploadedContent.length / 1024).toFixed(0)} KB extracted � click Generate below.
                        </p>
                      </div>
                    ) : (
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }}
                        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); }}
                        onDrop={handleFileDrop}
                        className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-all duration-150 ${
                          isDragOver
                            ? "border-blue-400 bg-blue-50/50"
                            : "border-black/15 bg-black/[0.02] hover-gate:border-black/25 hover-gate:bg-black/[0.04]"
                        }`}
                      >
                        <span className="material-symbols-outlined text-3xl text-black/30">upload_file</span>
                        <p className="text-sm font-medium text-black">Upload PDF or document</p>
                        <p className="text-[11px] text-black text-center">
                          Supports PDF, DOCX, TXT, PPTX, XLSX (max 10 MB)
                        </p>
                        <button
                          onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                          className="px-4 py-1.5 rounded-lg bg-black text-white text-xs font-medium active:scale-[0.97] transition-all duration-150 hover:bg-black/85"
                        >
                          Choose file
                        </button>
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      onChange={handleFileSelect}
                      className="hidden"
                      accept=".pdf,.docx,.txt,.pptx,.xlsx,.csv,.tsv,.md"
                    />
                    {isUploading && (
                      <div className="mt-2 flex items-center gap-2 text-[11px] text-black">
                        <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
                        Uploading and extracting text...
                      </div>
                    )}
                  </div>
                )}

                {/* Generate Button */}
                <button
                  onClick={handleGenerate}
                  disabled={!canGenerate || isGenerating || isUploading}
                  className="w-full py-2.5 rounded-xl bg-black text-white text-sm font-medium active:scale-[0.99] transition-all duration-150 disabled:opacity-25 disabled:cursor-not-allowed hover:bg-black/85 flex items-center justify-center gap-2"
                >
                  {isGenerating ? (
                    <>
                      <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                      Generating flashcards...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
                      Generate Flashcards
                    </>
                  )}
                </button>

                {/* Error */}
                {error && (
                  <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[11px] text-red-600 leading-relaxed">
                    <span className="material-symbols-outlined text-[14px] mt-0.5 flex-shrink-0">error_outline</span>
                    <span>{error}</span>
                  </div>
                )}

                {/* Loading skeleton */}
                {isGenerating && (
                  <div className="mt-6 flex flex-col items-center gap-4">
                    <div className="w-full max-w-lg aspect-[3/2] rounded-2xl border border-black/8 bg-black/[0.02] flex items-center justify-center">
                      <div className="flex gap-1.5">
                        <span className="animate-blink size-1.5 rounded-full bg-black/25" />
                        <span className="animate-blink size-1.5 rounded-full bg-black/25" style={{ animationDelay: "0.2s" }} />
                        <span className="animate-blink size-1.5 rounded-full bg-black/25" style={{ animationDelay: "0.4s" }} />
                      </div>
                    </div>
                    <p className="text-xs text-black">Extracting concepts from your material...</p>
                  </div>
                )}
              </div>
            ) : (
              /* Results: Flashcard Deck */
              <div style={{ animation: "fade-up 0.3s var(--ease-out-expo) both" }}>
                {/* Counter + Controls */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-black">style</span>
                    <span className="text-xs font-medium text-black">
                      {cards.length} card{cards.length > 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleShuffle}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] text-black hover-gate:bg-black/5 active:scale-[0.97] transition-all duration-150"
                      aria-label="Shuffle cards"
                    >
                      <span className="material-symbols-outlined text-[14px]">shuffle</span>
                      Shuffle
                    </button>
                    <button
                      onClick={() => setCards([])}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] text-black hover-gate:bg-black/5 active:scale-[0.97] transition-all duration-150"
                      aria-label="New flashcards"
                    >
                      <span className="material-symbols-outlined text-[14px]">refresh</span>
                      New
                    </button>
                  </div>
                </div>

                {/* Card */}
                <FlipCard
                  card={currentCard}
                  flipped={flipped}
                  onClick={() => setFlipped((p) => !p)}
                />

                {/* Navigation */}
                <div className="flex items-center justify-center gap-4 mt-4">
                  <button
                    onClick={handlePrev}
                    disabled={currentIndex === 0}
                    className="w-10 h-10 rounded-xl border border-black/10 flex items-center justify-center text-black hover-gate:border-black/25 active:scale-[0.92] transition-all duration-150 disabled:opacity-20 disabled:pointer-events-none"
                    aria-label="Previous card"
                  >
                    <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                  </button>

                  <span className="text-xs font-medium text-black min-w-[6rem] text-center">
                    Card {currentIndex + 1} / {displayCards.length}
                  </span>

                  <button
                    onClick={handleNext}
                    disabled={currentIndex >= displayCards.length - 1}
                    className="w-10 h-10 rounded-xl border border-black/10 flex items-center justify-center text-black hover-gate:border-black/25 active:scale-[0.92] transition-all duration-150 disabled:opacity-20 disabled:pointer-events-none"
                    aria-label="Next card"
                  >
                    <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                  </button>
                </div>

                {/* Keyboard hint */}
                <p className="text-center text-[10px] text-black mt-3">
                  Use arrow keys to navigate &middot; Space or F to flip
                </p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

