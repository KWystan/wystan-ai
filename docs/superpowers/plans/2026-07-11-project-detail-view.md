# Project Detail View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated project detail page at `/project/:id` showing folder icon/name, a chat input, and clickable conversation items. Add `/chat/:conversationId` route for loading conversations by URL.

**Architecture:** New `ProjectPage` component on a new route. ChatPage gains `useParams` to load conversations from URL. Sidebar project rows navigate instead of expanding. No new state management — all existing Supabase patterns reused.

**Tech Stack:** React 19, React Router DOM v7, Supabase client (existing `supabase` instance)

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| **Create** | `client/src/components/ProjectPage.jsx` | New project detail view |
| **Modify** | `client/src/App.jsx` | Add 2 new routes + import |
| **Modify** | `client/src/components/ChatPage.jsx` | Add `/chat/:conversationId` route loading |
| **Modify** | `client/src/components/Sidebar.jsx` | Project clicks → navigate, remove nested convos |

---

### Task 1: Create ProjectPage component

**Files:**
- Create: `client/src/components/ProjectPage.jsx`

- [ ] **Step 1: Write the ProjectPage component shell**

```jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';

const SUGGESTIONS = [
  'Explain quantum computing simply',
  'Write a short poem about the ocean',
  'Help me plan a weekend project',
  'What are the best practices for REST APIs?',
];

export default function ProjectPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [project, setProject] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const textareaRef = useRef(null);

  /* ── Fetch project + conversations on mount ────────────── */
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [projectRes, convRes] = await Promise.all([
          supabase.from('projects').select('*').eq('id', id).single(),
          supabase.from('conversations').select('*').eq('project_id', id).order('updated_at', { ascending: false }),
        ]);

        if (cancelled) return;

        if (projectRes.error) throw projectRes.error;
        if (convRes.error) throw convRes.error;

        setProject(projectRes.data);
        setConversations(convRes.data || []);
      } catch (err) {
        console.error('Failed to load project:', err);
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [id]);

  /* ── Auto-resize textarea ─────────────────────────────── */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [input]);

  /* ── Handle send ──────────────────────────────────────── */
  const handleSend = useCallback(async (overrideText) => {
    const text = (overrideText || input).trim();
    if (!text) return;

    /* Check if user is logged in */
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;

    if (user) {
      /* Logged in: create conversation in this project */
      const title = text.length > 45 ? text.slice(0, 45) + '…' : text;
      try {
        const { data, error } = await supabase
          .from('conversations')
          .insert({ user_id: user.id, project_id: id, title })
          .select()
          .single();

        if (!error && data) {
          navigate(`/chat/${data.id}`);
        }
      } catch (err) {
        console.error('Failed to create conversation:', err);
      }
    } else {
      /* Logged out: navigate to chat */
      navigate('/chat', { state: { initialText: text } });
    }
  }, [input, id, navigate]);

  /* ── Keyboard: Enter to send, Shift+Enter newline ─────── */
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex bg-white">
      {/* ── Main area ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* ── Header bar ──────────────────────────────────────── */}
        <header className="flex-shrink-0 bg-white/90 backdrop-blur-md border-b border-black/8">
          <div className="px-4 h-12 flex items-center gap-3">
            <Link
              to="/chat"
              className="w-8 h-8 rounded-lg border border-black/12 flex items-center justify-center text-black/50 hover-gate:border-black/35 hover-gate:text-black active:scale-[0.97] transition-all duration-150"
              aria-label="Back to chat"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            </Link>
            <span className="material-symbols-outlined text-[20px] text-black/40">folder</span>
            <span className="text-sm font-medium text-black/70 truncate">
              {project?.name || 'Loading…'}
            </span>
          </div>
        </header>

        {/* ── Body ────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-6 w-full">
            {loading ? (
              /* ── Loading state ──────────────────────────────── */
              <div className="flex items-center justify-center min-h-[50vh]">
                <div className="flex gap-1.5">
                  <span className="animate-blink size-1.5 rounded-full bg-black/25" />
                  <span className="animate-blink size-1.5 rounded-full bg-black/25" style={{ animationDelay: '0.2s' }} />
                  <span className="animate-blink size-1.5 rounded-full bg-black/25" style={{ animationDelay: '0.4s' }} />
                </div>
              </div>
            ) : error ? (
              /* ── Error state ────────────────────────────────── */
              <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
                <span className="material-symbols-outlined text-3xl text-red-300 mb-3">folder_off</span>
                <p className="text-sm text-red-500 mb-1">Failed to load project</p>
                <p className="text-xs text-black/40 mb-4">{error}</p>
                <Link to="/chat" className="text-xs underline text-black/40 hover:text-black transition-colors duration-150">
                  Back to chat
                </Link>
              </div>
            ) : !project ? (
              /* ── Not found ──────────────────────────────────── */
              <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
                <span className="material-symbols-outlined text-3xl text-black/20 mb-3">folder_off</span>
                <p className="text-sm text-black/50 mb-1">Project not found</p>
                <p className="text-xs text-black/30 mb-4">This project may have been deleted.</p>
                <Link to="/chat" className="text-xs underline text-black/40 hover:text-black transition-colors duration-150">
                  Back to chat
                </Link>
              </div>
            ) : (
              <>
                {/* ── Folder identity ──────────────────────────── */}
                <div
                  className="flex flex-col items-center justify-center min-h-[30vh] text-center"
                  style={{ animation: 'fade-up 0.4s var(--ease-out-expo) both' }}
                >
                  <div className="w-14 h-14 rounded-2xl border border-black/10 flex items-center justify-center mb-4">
                    <span className="material-symbols-outlined text-2xl text-black/30">folder</span>
                  </div>
                  <h2 className="font-magazine text-xl font-semibold text-black mb-1">
                    {project.name}
                  </h2>
                  <p className="text-sm text-black/40 max-w-sm">
                    Ask a question or click a past conversation.
                  </p>
                </div>

                {/* ── Conversation list ────────────────────────── */}
                <div className="mt-6">
                  <h3 className="text-[11px] font-medium text-black/40 uppercase tracking-wider mb-3 px-1">
                    Conversations
                  </h3>

                  {conversations.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <span className="material-symbols-outlined text-2xl text-black/15 mb-2">forum</span>
                      <p className="text-xs text-black/30">No conversations yet. Start one above.</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {conversations.map((conv) => (
                        <button
                          key={conv.id}
                          onClick={() => navigate(`/chat/${conv.id}`)}
                          className="w-full text-left px-3.5 py-2.5 rounded-xl border border-black/8 text-sm text-black/60 hover-gate:border-black/20 hover-gate:text-black active:scale-[0.99] transition-all duration-150 flex items-center gap-3"
                        >
                          <span className="material-symbols-outlined text-[16px] text-black/25 flex-shrink-0">chat</span>
                          <span className="truncate">{conv.title}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </main>

        {/* ── Input ─────────────────────────────────────────────── */}
        {project && !error && (
          <footer className="flex-shrink-0 bg-white/90 backdrop-blur-md">
            <div className="max-w-3xl mx-auto px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 relative flex items-center">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`Ask something in ${project.name}…`}
                    maxLength={4000}
                    rows={1}
                    className="w-full bg-white text-black text-sm rounded-xl pl-4 pr-4 py-2.5 resize-none overflow-hidden outline-none placeholder:text-black/30 border border-black/10 focus:border-black/25 transition-all duration-150 leading-relaxed"
                  />
                </div>
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim()}
                  className="w-10 h-10 rounded-xl bg-black text-white flex items-center justify-center flex-shrink-0 active:scale-[0.92] transition-all duration-150 disabled:opacity-25 disabled:cursor-not-allowed hover:bg-black/85"
                  aria-label="Send message"
                >
                  <span className="material-symbols-outlined text-[18px]">arrow_upward</span>
                </button>
              </div>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the file compiles** (Vite will pick it up when imported — no explicit compile step)

---

### Task 2: Wire routes in App.jsx

**Files:**
- Modify: `client/src/App.jsx`

- [ ] **Step 1: Add import and two new routes**

Replace the current `App.jsx` content:

```jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ChatPage from './components/ChatPage';
import GeneratePage from './components/GeneratePage';
import ProjectPage from './components/ProjectPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ChatPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/chat/:conversationId" element={<ChatPage />} />
        <Route path="/project/:id" element={<ProjectPage />} />
        <Route path="/generate" element={<GeneratePage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
```

---

### Task 3: Update ChatPage for route-based conversation loading

**Files:**
- Modify: `client/src/components/ChatPage.jsx`

- [ ] **Step 1: Add `useParams` import**

Change:
```jsx
import { useState, useEffect, useRef, useCallback } from 'react';
```
To:
```jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
```

- [ ] **Step 2: Add `useParams` call and route-based loading effect**

Add this right after the `visibleConversationRef` line (~line 377):

```jsx
  const { conversationId: urlConversationId } = useParams();
  const hasLoadedFromUrl = useRef(false);

  /* ── Load conversation from URL param ──────────────────── */
  useEffect(() => {
    if (!urlConversationId) {
      hasLoadedFromUrl.current = false;
      return;
    }
    if (hasLoadedFromUrl.current) return;
    hasLoadedFromUrl.current = true;

    setCurrentConversationId(urlConversationId);
    visibleConversationRef.current = urlConversationId;
    setMessages([]);
    setError(null);
    setIsLoading(false);
    setSidebarOpen(false);
    setAttachedFiles([]);

    supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', urlConversationId)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data && data.length > 0) {
          setMessages(data);
        }
      })
      .catch((err) => {
        console.error('Failed to load messages:', err);
        setError('Failed to load messages: ' + err.message);
      });
  }, [urlConversationId]);

  /* ── Accept initial text from navigation state ────────── */
  useEffect(() => {
    if (urlConversationId) return; // only set on bare /chat
    const state = window.history.state?.usr;
    if (state?.initialText) {
      setInput(state.initialText);
    }
  }, []); // once on mount
```

Note: Put these after the existing `visibleConversationRef` line (line 377) and before the `/* ── Auto-scroll ── */` section.

---

### Task 4: Update Sidebar project navigation

**Files:**
- Modify: `client/src/components/Sidebar.jsx`

- [ ] **Step 1: Add `useNavigate` import**

Change:
```jsx
import { Link } from 'react-router-dom';
```
To:
```jsx
import { Link, useNavigate } from 'react-router-dom';
```

- [ ] **Step 2: Add `navigate` inside the component**

Add at the top of the component body, right after the refs (~line 42):
```jsx
  const navigate = useNavigate();
```

- [ ] **Step 3: Change project row onClick to navigate**

Find the project row div (the one wrapping the project name button) — it's the `projects.map` block around line 536. The current structure has the toggle button wrapping both the expand arrow and name. Change the entire project row from this:

```jsx
                      <div key={project.id}>
                        <div className="relative group flex items-center px-2 py-1 rounded-lg hover:bg-black/[0.03] transition-colors duration-150">
                          <button
                            onClick={() => toggleProject(project.id)}
                            className="flex items-center gap-1 flex-1 min-w-0"
                          >
                            <span className="material-symbols-outlined text-[13px] text-black/25 flex-shrink-0">
                              {expandedProjects.has(project.id) ? 'expand_more' : 'chevron_right'}
                            </span>
                            <span className="text-xs text-black/50 truncate">{project.name}</span>
                          </button>
                          <div className="flex-shrink-0 relative">
                            <button
                              onClick={(e) => { e.stopPropagation(); setKebabProjectId(kebabProjectId === project.id ? null : project.id); setKebabOpenId(null); }}
                              className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-black/25 hover:text-black/60 hover:bg-black/5 transition-all duration-150"
                              aria-label="Project menu"
                            >
                              <span className="material-symbols-outlined text-[13px]">more_horiz</span>
                            </button>
                            <ProjectKebab projectId={project.id} />
                          </div>
                        </div>
                        {/* Nested conversations */}
                        {expandedProjects.has(project.id) && (
                          <div className="ml-4 space-y-0.5">
                            {conversationsForProject(project.id).length === 0 ? (
                              <div className="px-3 py-1 text-[10px] text-black/20 italic">Empty project</div>
                            ) : (
                              conversationsForProject(project.id).map((conv) => (
                                <div
                                  key={conv.id}
                                  className={`relative group flex items-center px-2 py-1 rounded-lg cursor-pointer transition-colors duration-150 ${
                                    conv.id === currentConversationId
                                      ? 'bg-black/5 text-black'
                                      : 'text-black/50 hover:bg-black/[0.03] hover:text-black/70'
                                  }`}
                                  onClick={() => onSelectConversation?.(conv.id)}
                                >
                                  <span className="text-xs truncate flex-1">{conv.title}</span>
                                  <div className="flex-shrink-0 relative">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setKebabOpenId(kebabOpenId === conv.id ? null : conv.id); setKebabProjectId(null); }}
                                      className="opacity-0 group-hover:opacity-100 w-4 h-4 rounded flex items-center justify-center text-black/20 hover:text-black/50 hover:bg-black/5 transition-all duration-150"
                                      aria-label="Conversation menu"
                                    >
                                      <span className="material-symbols-outlined text-[11px]">more_horiz</span>
                                    </button>
                                    <KebabMenu conversationId={conv.id} />
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
```

To this:

```jsx
                      <div key={project.id}>
                        <div
                          className="relative group flex items-center px-2 py-1 rounded-lg cursor-pointer hover:bg-black/[0.03] transition-colors duration-150"
                          onClick={() => { navigate(`/project/${project.id}`); onCloseSidebar?.(); }}
                        >
                          <span className="material-symbols-outlined text-[16px] text-black/30 mr-2 flex-shrink-0">folder</span>
                          <span className="text-xs text-black/50 truncate flex-1">{project.name}</span>
                          <div className="flex-shrink-0 relative">
                            <button
                              onClick={(e) => { e.stopPropagation(); setKebabProjectId(kebabProjectId === project.id ? null : project.id); setKebabOpenId(null); }}
                              className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-black/25 hover:text-black/60 hover:bg-black/5 transition-all duration-150"
                              aria-label="Project menu"
                            >
                              <span className="material-symbols-outlined text-[13px]">more_horiz</span>
                            </button>
                            <ProjectKebab projectId={project.id} />
                          </div>
                        </div>
                      </div>
```

- [ ] **Step 4: Clean up unused state and helpers**

Remove these lines/declarations that are no longer needed:

1. Remove `const [expandedProjects, setExpandedProjects] = useState(new Set());` (around line 26)
2. Remove the `toggleProject` function (around line 253-260)
3. Remove the `conversationsForProject` function (around line 263-264)
4. Remove the `unassignedConversations` can stay — it's still used for the "Recent" section

Actually, keep `unassignedConversations` — it's used below for the "Recent" list. Only remove the project-nested state.

---

## Spec Coverage Check

| Spec Requirement | Task |
|-----------------|------|
| `/project/:id` route | Task 2 (App.jsx) + Task 1 (ProjectPage) |
| Folder icon + name at top | Task 1 — ProjectPage header + body section |
| Chat input above conversations | Task 1 — footer input + send button |
| Clickable conversation list below input | Task 1 — conversation list buttons |
| Click → navigate to /chat/:convId | Task 1 — `navigate(/chat/${conv.id})` |
| `useParams` loads conversation in ChatPage | Task 3 |
| Sidebar project clicks navigate instead of expand | Task 4 |
| Removed nested conversations from sidebar | Task 4 |
