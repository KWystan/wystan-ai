import { useState, useRef } from 'react';

const QUIZ_TYPES = [
  { id: 'multiple', label: 'Multiple Choice', icon: 'checklist' },
  { id: 'truefalse', label: 'True or False', icon: 'toggle_off' },
  { id: 'fillblank', label: 'Fill in the Blank', icon: 'edit_note' },
  { id: 'mixed', label: 'Mixed', icon: 'shuffle' },
];

const DIFFICULTIES = [
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
];

export default function QuizConfig({ onGenerate, isGenerating, error }) {
  const [inputMode, setInputMode] = useState('text');
  const [text, setText] = useState('');
  const [uploadedFilename, setUploadedFilename] = useState(null);
  const [uploadedContent, setUploadedContent] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const [quizType, setQuizType] = useState('mixed');
  const [questionCount, setQuestionCount] = useState(10);
  const [difficulty, setDifficulty] = useState('medium');

  const fileInputRef = useRef(null);

  const sourceText = inputMode === 'text' ? text : uploadedContent;
  const canGenerate = sourceText.trim().length > 0 && !isGenerating && !isUploading;

  /* ── File upload ──────────────────────────────────────────────── */
  const uploadFile = async (file) => {
    setIsUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Upload failed');
      }
      const data = await res.json();
      if (!data.content || data.content.trim().length === 0) {
        throw new Error('No text could be extracted from this file. Try a different file.');
      }
      setUploadedFilename(data.filename);
      setUploadedContent(data.content);
      setText(data.content);
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

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

  const handleRemoveFile = () => {
    setUploadedFilename(null);
    setUploadedContent('');
    if (inputMode === 'upload') setText('');
  };

  /* ── Generate ──────────────────────────────────────────────────── */
  const handleGenerate = () => {
    if (!canGenerate) return;
    onGenerate({
      text: sourceText.trim(),
      type: quizType,
      count: questionCount,
      difficulty,
    });
  };

  return (
    <div style={{ animation: 'fade-up 0.3s var(--ease-out-expo) both' }}>
      <h1 className="font-display text-xl font-bold text-black mb-1">Quiz Generator</h1>
      <p className="text-xs text-black mb-6">
        Create interactive quizzes from any text or document.
      </p>

      {/* ── Mode Tabs ───────────────────────────────────────────── */}
      <div className="flex gap-1 mb-4 p-0.5 rounded-xl bg-black/5 border border-black/8 w-fit">
        <button
          onClick={() => { setInputMode('text'); setUploadError(null); }}
          className={`px-3.5 py-1.5 text-xs rounded-lg font-medium transition-all duration-150 ${
            inputMode === 'text'
              ? 'bg-white text-black border border-black/10 shadow-sm'
              : 'text-black hover-gate:text-black'
          }`}
        >
          Type / Paste
        </button>
        <button
          onClick={() => { setInputMode('upload'); setUploadError(null); }}
          className={`px-3.5 py-1.5 text-xs rounded-lg font-medium transition-all duration-150 ${
            inputMode === 'upload'
              ? 'bg-white text-black border border-black/10 shadow-sm'
              : 'text-black hover-gate:text-black'
          }`}
        >
          Upload Material
        </button>
      </div>

      {/* ── Text Input ──────────────────────────────────────────── */}
      {inputMode === 'text' ? (
        <div className="mb-4">
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (uploadedFilename) handleRemoveFile();
            }}
            placeholder="e.g., 'The French Revolution' or paste a paragraph from your textbook..."
            maxLength={50000}
            rows={5}
            className="w-full bg-white text-black text-sm rounded-xl px-4 py-3 resize-y min-h-[130px] outline-none placeholder:text-black border border-black/10 focus:border-black/25 transition-all duration-150 leading-relaxed"
          />
          <p className="text-[10px] text-black mt-1 text-right">{text.length.toLocaleString()} / 50,000</p>
        </div>
      ) : (
        /* ── Upload Area ────────────────────────────────────────── */
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
              <div className="max-h-36 overflow-y-auto rounded-lg bg-black/[0.02] border border-black/5 p-3">
                <pre className="text-[11px] text-black leading-relaxed whitespace-pre-wrap font-mono">
                  {uploadedContent.slice(0, 2000)}
                  {uploadedContent.length > 2000 ? '\n\n... (content truncated for preview)' : ''}
                </pre>
              </div>
              <p className="text-[10px] text-black mt-2">
                {(uploadedContent.length / 1024).toFixed(0)} KB extracted — configure quiz settings below.
              </p>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }}
              onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); }}
              onDrop={handleFileDrop}
              className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-7 cursor-pointer transition-all duration-150 ${
                isDragOver
                  ? 'border-blue-400 bg-blue-50/50'
                  : 'border-black/15 bg-black/[0.02] hover-gate:border-black/25 hover-gate:bg-black/[0.04]'
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
          {uploadError && (
            <div className="mt-2 flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[11px] text-red-600 leading-relaxed">
              <span className="material-symbols-outlined text-[14px] mt-0.5 flex-shrink-0">error_outline</span>
              <span>{uploadError}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Settings ─────────────────────────────────────────────── */}
      <div className="space-y-4 mb-6">
        {/* Quiz Type */}
        <div>
          <label className="text-xs font-medium text-black mb-2 block">Quiz Type</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {QUIZ_TYPES.map((t) => (
              <button
                key={t.id}
                onClick={() => setQuizType(t.id)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-150 active:scale-[0.98] ${
                  quizType === t.id
                    ? 'bg-black text-white border border-black'
                    : 'bg-white text-black border border-black/10 hover-gate:border-black/25'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Difficulty */}
        <div>
          <label className="text-xs font-medium text-black mb-2 block">Difficulty</label>
          <div className="flex gap-2">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.id}
                onClick={() => setDifficulty(d.id)}
                className={`flex-1 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 active:scale-[0.98] ${
                  difficulty === d.id
                    ? 'bg-black text-white border border-black'
                    : 'bg-white text-black border border-black/10 hover-gate:border-black/25'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Number of Questions */}
        <div>
          <label className="text-xs font-medium text-black mb-2 block">
            Questions: <span className="font-bold">{questionCount}</span>
          </label>
          <input
            type="range"
            min={5}
            max={20}
            value={questionCount}
            onChange={(e) => setQuestionCount(Number(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none bg-black/10 cursor-pointer accent-black [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-sm"
          />
          <div className="flex justify-between text-[10px] text-black mt-1">
            <span>5</span>
            <span>20</span>
          </div>
        </div>
      </div>

      {/* ── Generate Button ──────────────────────────────────────── */}
      <button
        onClick={handleGenerate}
        disabled={!canGenerate || isGenerating || isUploading}
        className="w-full py-2.5 rounded-xl bg-black text-white text-sm font-medium active:scale-[0.99] transition-all duration-150 disabled:opacity-25 disabled:cursor-not-allowed hover:bg-black/85 flex items-center justify-center gap-2"
      >
        {isGenerating ? (
          <>
            <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
            Generating quiz...
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
            Generate Quiz
          </>
        )}
      </button>

      {/* ── Error ────────────────────────────────────────────────── */}
      {(error || uploadError) && !isGenerating && (
        <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[11px] text-red-600 leading-relaxed">
          <span className="material-symbols-outlined text-[14px] mt-0.5 flex-shrink-0">error_outline</span>
          <span>{error || uploadError}</span>
        </div>
      )}

      {/* ── Generating Skeleton ──────────────────────────────────── */}
      {isGenerating && (
        <div className="mt-6 flex flex-col items-center gap-4">
          <div className="w-full max-w-md h-48 rounded-2xl border border-black/8 bg-black/[0.02] flex items-center justify-center">
            <div className="flex gap-1.5">
              <span className="animate-blink size-1.5 rounded-full bg-black/25" />
              <span className="animate-blink size-1.5 rounded-full bg-black/25" style={{ animationDelay: '0.2s' }} />
              <span className="animate-blink size-1.5 rounded-full bg-black/25" style={{ animationDelay: '0.4s' }} />
            </div>
          </div>
          <p className="text-xs text-black">Creating your quiz questions...</p>
        </div>
      )}
    </div>
  );
}
