import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function Home() {
  const [health, setHealth] = useState(null);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then(setHealth)
      .catch(console.error);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <h1 className="font-display text-3xl font-semibold text-black">Wystan AI</h1>
      <p className="text-sm text-black">{health ? health.message : 'Connecting to server...'}</p>
      <Link
        to="/chat"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-black/15 text-sm font-medium text-black hover-gate:border-black/35 hover-gate:text-black active:scale-[0.97] transition-all duration-150"
      >
        Open Chat
        <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
      </Link>
    </div>
  );
}
