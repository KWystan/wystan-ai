import { useState, useRef } from 'react';
import { useApp } from '../../lib/AppContext';

const VALID_TYPES = ['pdf', 'docx', 'txt', 'pptx', 'xlsx', 'csv', 'md'];

export default function UploadDropzone({ onUpload, isUploading }) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState(null);
  const dragCounter = useRef(0);
  const fileInputRef = useRef(null);
  const { handleOpenAuth, user } = useApp();

  const isValidFile = (file) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    return VALID_TYPES.includes(ext);
  };

  const processFile = async (file) => {
    if (!user) { handleOpenAuth('login'); return; }
    if (!isValidFile(file)) {
      setError(`Unsupported file type. Accepted: ${VALID_TYPES.join(', ')}`);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('File is too large. Maximum size is 10 MB.');
      return;
    }

    setError(null);

    // Upload via existing /api/upload endpoint
    const formData = new FormData();
    formData.append('file', file);

    try {
      const token = localStorage.getItem('wystan_access_token');
      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!uploadRes.ok) throw new Error((await uploadRes.json())?.error || 'Upload failed');
      const uploadData = await uploadRes.json();

      // Convert extracted text into pages array
      const pages = uploadData.pages?.length
        ? uploadData.pages.map((p, i) => ({ text: p.text || p, pageNumber: i + 1 }))
        : [{ text: uploadData.content || '', pageNumber: 1 }];

      await onUpload(uploadData.filename, uploadData.type || 'text', pages);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    dragCounter.current = 0;
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    dragCounter.current++;
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) setDragOver(false);
  };

  return (
    <div
      onDrop={handleDrop}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={e => e.preventDefault()}
      className={`
        border-2 border-dashed rounded-xl p-4 text-center cursor-pointer
        transition-all duration-150
        ${dragOver ? 'border-black/40 bg-black/[0.02]' : 'border-black/10 hover-gate:border-black/25'}
        ${isUploading ? 'opacity-50 pointer-events-none' : ''}
      `}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.txt,.pptx,.xlsx,.csv,.md"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ''; }}
      />
      {isUploading ? (
        <div className="flex items-center justify-center gap-2">
          <span className="w-4 h-4 rounded-full border-2 border-black/15 border-t-black/40 animate-spin" />
          <span className="text-[11px] text-black">Uploading...</span>
        </div>
      ) : (
        <>
          <span className="material-symbols-outlined text-xl text-black mb-1">cloud_upload</span>
          <p className="text-[11px] text-black">Drop a file or click to upload</p>
          <p className="text-[10px] text-black mt-0.5">PDF, DOCX, TXT, PPTX, XLSX, CSV, MD (max 10 MB)</p>
        </>
      )}
      {error && (
        <p className="text-[10px] text-red-500 mt-1">{error}</p>
      )}
    </div>
  );
}
