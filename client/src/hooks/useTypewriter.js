import { useState, useEffect, useRef } from 'react';

const DEFAULT_WORDS = [
  'Aspiring Web Developer',
  'Frontend Developer',
  'Web Designer',
  'Problem Solver',
  'Tech Enthusiast',
];

export function useTypewriter({
  words = DEFAULT_WORDS,
  typingSpeed = 60,
  deletingSpeed = 35,
  pauseAfterType = 2000,
  pauseBeforeNext = 400,
} = {}) {
  const [displayedText, setDisplayedText] = useState('');
  const wordIndexRef = useRef(0);
  const charIndexRef = useRef(0);
  const isDeletingRef = useRef(false);

  useEffect(() => {
    const currentWord = words[wordIndexRef.current];
    let timeoutId;

    const tick = () => {
      if (!isDeletingRef.current) {
        charIndexRef.current++;
        setDisplayedText(currentWord.slice(0, charIndexRef.current));

        if (charIndexRef.current === currentWord.length) {
          isDeletingRef.current = true;
          timeoutId = setTimeout(tick, pauseAfterType);
        } else {
          timeoutId = setTimeout(tick, typingSpeed);
        }
      } else {
        if (charIndexRef.current === 0) {
          isDeletingRef.current = false;
          wordIndexRef.current = (wordIndexRef.current + 1) % words.length;
          timeoutId = setTimeout(tick, pauseBeforeNext);
        } else {
          charIndexRef.current--;
          setDisplayedText(currentWord.slice(0, charIndexRef.current));
          timeoutId = setTimeout(tick, deletingSpeed);
        }
      }
    };

    timeoutId = setTimeout(tick, 0);
    return () => clearTimeout(timeoutId);
  }, [words, typingSpeed, deletingSpeed, pauseAfterType, pauseBeforeNext]);

  return displayedText;
}
