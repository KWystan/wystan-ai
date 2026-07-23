import { useState, useCallback, useRef } from 'react';
import { authFetch } from '../lib/auth';

/**
 * Central state hook for the Study Hub.
 * Manages sources, grounded chat, and study tool state.
 */
export default function useStudyHub({ user } = {}) {
  const [sources, setSources] = useState([]);
  const [messages, setMessages] = useState([]);
  const [flashcards, setFlashcards] = useState([]);
  const [quiz, setQuiz] = useState([]);
  const [summary, setSummary] = useState(null);
  const [toolTab, setToolTab] = useState('flashcards');
  const [isUploading, setIsUploading] = useState(false);
  const [isChatting, setIsChatting] = useState(false);
  const [isGeneratingFlashcards, setIsGeneratingFlashcards] = useState(false);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [previewSource, setPreviewSource] = useState(null);
  const [chatError, setChatError] = useState(null);
  const abortRef = useRef(null);

  const activeSourceIds = sources.filter(s => s.active).map(s => s.id);

  /* ── Sources ────────────────────────────────── */

  const fetchSources = useCallback(async () => {
    try {
      const res = await authFetch('/api/study/sources');
      if (res.ok) setSources(await res.json());
    } catch (err) {
      console.error('Failed to fetch sources:', err);
    }
  }, []);

  const uploadFile = useCallback(async (fileName, fileType, pages) => {
    setIsUploading(true);
    try {
      const res = await authFetch('/api/study/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName, fileType, pages }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Upload failed');
      const source = await res.json();
      setSources(prev => [source, ...prev]);
      return source;
    } catch (err) {
      console.error('Upload error:', err);
      throw err;
    } finally {
      setIsUploading(false);
    }
  }, []);

  const toggleSource = useCallback(async (id) => {
    const source = sources.find(s => s.id === id);
    if (!source) return;
    setSources(prev => prev.map(s => s.id === id ? { ...s, active: !s.active } : s));
    try {
      await authFetch(`/api/study/sources/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !source.active }),
      });
    } catch (err) {
      console.error('Failed to toggle source:', err);
      setSources(prev => prev.map(s => s.id === id ? { ...s, active: source.active } : s));
    }
  }, [sources]);

  const deleteSource = useCallback(async (id) => {
    setSources(prev => prev.filter(s => s.id !== id));
    try {
      await authFetch(`/api/study/sources/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to delete source:', err);
      fetchSources();
    }
  }, [fetchSources]);

  /* ── Chat ───────────────────────────────────── */

  const sendMessage = useCallback(async (prompt) => {
    if (!prompt.trim() || !activeSourceIds.length || isChatting) return;

    setChatError(null);
    const userMsg = { id: Date.now().toString(), role: 'user', content: prompt };
    setMessages(prev => [...prev, userMsg]);
    setIsChatting(true);

    const assistantMsg = { id: (Date.now() + 1).toString(), role: 'assistant', content: '', citations: [] };
    setMessages(prev => [...prev, assistantMsg]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/study/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('wystan_access_token') || ''}`,
        },
        body: JSON.stringify({ prompt, activeSourceIds }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Chat failed' }));
        throw new Error(err.error || 'Chat failed');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let content = '';
      let lastCitations = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') continue;

          try {
            const data = JSON.parse(payload);
            if (data.content) {
              content += data.content;
              setMessages(prev => prev.map(m =>
                m.id === assistantMsg.id ? { ...m, content } : m
              ));
            }
            if (data.citations) {
              lastCitations = data.citations;
            }
            if (data.error) {
              setChatError(data.error);
            }
          } catch { /* skip malformed */ }
        }
      }

      // Update with citations
      if (lastCitations.length) {
        setMessages(prev => prev.map(m =>
          m.id === assistantMsg.id ? { ...m, citations: lastCitations } : m
        ));
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setChatError(err.message);
        setMessages(prev => prev.filter(m => m.id !== assistantMsg.id));
      }
    } finally {
      setIsChatting(false);
      abortRef.current = null;
    }
  }, [activeSourceIds, isChatting]);

  const abortChat = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clearChat = useCallback(() => {
    setMessages([]);
    setChatError(null);
  }, []);

  /* ── Tools ──────────────────────────────────── */

  const generateFlashcards = useCallback(async () => {
    if (!activeSourceIds.length || isGeneratingFlashcards) return;
    setIsGeneratingFlashcards(true);
    try {
      const res = await authFetch('/api/study/tools/flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activeSourceIds }),
      });
      if (!res.ok) throw new Error('Failed to generate flashcards');
      const data = await res.json();
      setFlashcards(data.cards || []);
    } catch (err) {
      console.error('Flashcard generation error:', err);
    } finally {
      setIsGeneratingFlashcards(false);
    }
  }, [activeSourceIds, isGeneratingFlashcards]);

  const generateQuiz = useCallback(async () => {
    if (!activeSourceIds.length || isGeneratingQuiz) return;
    setIsGeneratingQuiz(true);
    try {
      const chatContext = messages.slice(-10).map(m => ({ role: m.role, content: m.content }));
      const res = await authFetch('/api/study/tools/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activeSourceIds, chatHistory: chatContext }),
      });
      if (!res.ok) throw new Error('Failed to generate quiz');
      const data = await res.json();
      setQuiz(data.questions || []);
    } catch (err) {
      console.error('Quiz generation error:', err);
    } finally {
      setIsGeneratingQuiz(false);
    }
  }, [activeSourceIds, messages, isGeneratingQuiz]);

  const generateSummary = useCallback(async () => {
    if (!activeSourceIds.length || isGeneratingSummary) return;
    setIsGeneratingSummary(true);
    try {
      const res = await authFetch('/api/study/tools/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activeSourceIds }),
      });
      if (!res.ok) throw new Error('Failed to generate summary');
      const data = await res.json();
      setSummary(data);
    } catch (err) {
      console.error('Summary generation error:', err);
    } finally {
      setIsGeneratingSummary(false);
    }
  }, [activeSourceIds, isGeneratingSummary]);

  /* ── Preview ────────────────────────────────── */

  const openPreview = useCallback((chunkId, fileName, pageNumber) => {
    setPreviewSource({ chunkId, fileName, pageNumber });
  }, []);

  const closePreview = useCallback(() => {
    setPreviewSource(null);
  }, []);

  return {
    sources, activeSourceIds, messages, flashcards, quiz, summary,
    toolTab, isUploading, isChatting, isGeneratingFlashcards,
    isGeneratingQuiz, isGeneratingSummary, previewSource, chatError,
    fetchSources, uploadFile, toggleSource, deleteSource,
    sendMessage, abortChat, clearChat,
    generateFlashcards, generateQuiz, generateSummary,
    openPreview, closePreview, setToolTab,
  };
}
