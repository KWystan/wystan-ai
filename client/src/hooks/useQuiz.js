import { useState, useCallback, useMemo } from 'react';

/**
 * Quiz state machine hook.
 *
 * Phases: idle → generating → playing → results
 *
 * submitAnswer() records the user's selection and evaluates correctness
 * for the current question. nextQuestion() advances or transitions to results.
 * retry() re-shuffles and restarts. reset() goes back to idle.
 *
 * Scoring:
 * - multiple: selected index === question.answer
 * - truefalse: selected boolean === question.answer
 * - fillblank: trimmed, lowercased string match
 */
export default function useQuiz() {
  const [phase, setPhase] = useState('idle');
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answerLog, setAnswerLog] = useState([]);
  const [error, setError] = useState(null);

  /* ── API call ──────────────────────────────────────────────────── */
  const startGeneration = useCallback(async (config) => {
    if (!config.text?.trim()) return;

    setPhase('generating');
    setError(null);

    try {
      const res = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: config.text,
          type: config.type || 'mixed',
          count: config.count || 10,
          difficulty: config.difficulty || 'medium',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Generation failed');
      }
      if (!data.questions || !Array.isArray(data.questions) || data.questions.length === 0) {
        throw new Error('No questions could be generated. Try different content.');
      }

      setQuestions(data.questions);
      setCurrentIndex(0);
      setAnswerLog([]);
      setPhase('playing');
    } catch (err) {
      setError(err.message);
      setPhase('idle');
    }
  }, []);

  /* ── Answer submission ─────────────────────────────────────────── */
  const submitAnswer = useCallback((selected) => {
    setAnswerLog((prev) => {
      // Guard: don't double-answer
      if (prev.length > questions.length || prev.some((e) => e.questionIndex === currentIndex)) {
        return prev;
      }

      const question = questions[currentIndex];
      if (!question) return prev;

      let correct = false;

      switch (question.type) {
        case 'multiple':
          correct = selected === question.answer;
          break;
        case 'truefalse':
          correct = selected === question.answer;
          break;
        case 'fillblank':
          correct =
            String(selected).trim().toLowerCase() ===
            String(question.answer).trim().toLowerCase();
          break;
      }

      return prev.concat({
        questionIndex: currentIndex,
        question,
        selected,
        correct,
      });
    });
  }, [questions, currentIndex]);

  /* ── Navigation ────────────────────────────────────────────────── */
  const nextQuestion = useCallback(() => {
    if (currentIndex >= questions.length - 1) {
      setPhase('results');
    } else {
      setCurrentIndex((i) => i + 1);
    }
  }, [currentIndex, questions.length]);

  /* ── Retry (same questions, shuffled) ──────────────────────────── */
  const retry = useCallback(() => {
    const shuffled = [...questions].sort(() => Math.random() - 0.5);
    setQuestions(shuffled);
    setCurrentIndex(0);
    setAnswerLog([]);
    setPhase('playing');
  }, [questions]);

  /* ── Reset (back to config) ────────────────────────────────────── */
  const reset = useCallback(() => {
    setPhase('idle');
    setQuestions([]);
    setCurrentIndex(0);
    setAnswerLog([]);
    setError(null);
  }, []);

  /* ── Derived values ────────────────────────────────────────────── */
  const currentQuestion = useMemo(
    () => (phase === 'playing' ? questions[currentIndex] ?? null : null),
    [phase, questions, currentIndex]
  );

  const answeredCount = useMemo(
    () => answerLog.filter((e) => e.questionIndex === currentIndex).length,
    [answerLog, currentIndex]
  );

  const score = useMemo(
    () => answerLog.reduce((sum, e) => sum + (e.correct ? 1 : 0), 0),
    [answerLog]
  );

  return {
    phase,
    questions,
    currentIndex,
    answerLog,
    error,
    score,
    totalQuestions: questions.length,
    currentQuestion,
    answered: answeredCount > 0,
    isGenerating: phase === 'generating',
    startGeneration,
    submitAnswer,
    nextQuestion,
    retry,
    reset,
  };
}
