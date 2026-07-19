import { useState, useEffect, useCallback } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  /* Close sidebar on route change (mobile) */
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  /* Close sidebar on Escape key */
  useEffect(() => {
    if (!sidebarOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sidebarOpen]);

  const handleToggle = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const handleClose = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  return (
    <div className="min-h-screen bg-white text-black">
      {/* ── Sidebar ──────────────────────────────────────────── */}
      <Sidebar mobileOpen={sidebarOpen} onClose={handleClose} />

      {/* ── Mobile header with hamburger ──────────────────────── */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-30 h-12 bg-white/90 backdrop-blur-md border-b border-black/8 flex items-center px-4">
        <button
          onClick={handleToggle}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-black hover-gate:text-black active:scale-[0.97] transition-all duration-150"
          aria-label={sidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={sidebarOpen}
        >
          {sidebarOpen ? (
            <span className="material-symbols-outlined text-[20px]">close</span>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" className="text-[20px]">
              <path fill="none" d="M0 0h24v24H0z" />
              <path fill="currentColor" d="M2 5.995c0-.55.446-.995.995-.995h8.01a.995.995 0 0 1 0 1.99h-8.01A.995.995 0 0 1 2 5.995M2 12c0-.55.446-.995.995-.995h18.01a.995.995 0 1 1 0 1.99H2.995A.995.995 0 0 1 2 12m.995 5.01a.995.995 0 0 0 0 1.99h12.01a.995.995 0 0 0 0-1.99z" />
            </svg>
          )}
        </button>
      </header>

      {/* ── Main content area ──────────────────────────────────── */}
      <main className="lg:pl-[244px] pt-12 lg:pt-0 min-h-screen">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
