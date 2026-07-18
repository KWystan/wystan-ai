import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authFetch } from '../lib/auth.js';
import logo from '../assets/logo.png';

export default function Sidebar({
  user,
  onNewChat,
  currentConversationId,
  onSelectConversation,
  onSignOut,
  onOpenAuth,
  sidebarOpen,
  onCloseSidebar,
  refreshKey,
}) {
  /* ── Data state ───────────────────────────────────────────── */
  const [conversations, setConversations] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [dataError, setDataError] = useState(null);

  /* ── UI state ─────────────────────────────────────────────── */
  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const [expandedProjects, setExpandedProjects] = useState(new Set());
  const [kebabOpenId, setKebabOpenId] = useState(null); // conversation id with open kebab
  const [kebabProjectId, setKebabProjectId] = useState(null); // project id with open kebab
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(null); // string id tracking in-flight CRUD op
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  /* ── Rename state ─────────────────────────────────────────── */
  const [renamingId, setRenamingId] = useState(null); // { type: 'conversation'|'project', id }
  const [renameValue, setRenameValue] = useState('');

  /* ── Move conversation state ──────────────────────────────── */
  const [movingConversationId, setMovingConversationId] = useState(null);

  const kebabRef = useRef(null);
  const userMenuRef = useRef(null);
  const navigate = useNavigate();

  /* ── Close kebab on click outside ─────────────────────────── */
  useEffect(() => {
    if (!kebabOpenId && !kebabProjectId) return;
    const handler = (e) => {
      if (kebabRef.current && !kebabRef.current.contains(e.target)) {
        setKebabOpenId(null);
        setKebabProjectId(null);
      }
    };
    // Use click not mousedown — mousedown races with the toggle button's
    // onClick (which calls stopPropagation), causing a flicker when
    // clicking the toggle to refocus the page.
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [kebabOpenId, kebabProjectId]);

  /* ── Close user menu on click outside ─────────────────────── */
  useEffect(() => {
    if (!userMenuOpen) return;
    const handler = (e) => {
      // Don't close if clicking the toggle button or inside the dropdown
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [userMenuOpen]);

  /* ── Fetch conversations ──────────────────────────────────── */
  const fetchConversations = useCallback(async () => {
    if (!user) return;
    setLoadingConversations(true);
    setDataError(null);
    try {
      const res = await authFetch('/api/conversations');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setConversations(data || []);
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
      setDataError('Failed to load conversations');
    } finally {
      setLoadingConversations(false);
    }
  }, [user]);

  /* ── Fetch projects (with nested conversations) ───────────── */
  const fetchProjects = useCallback(async () => {
    if (!user) return;
    setLoadingProjects(true);
    try {
      const res = await authFetch('/api/projects');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setProjects(data || []);
    } catch (err) {
      console.error('Failed to fetch projects:', err);
      setDataError('Failed to load projects');
    } finally {
      setLoadingProjects(false);
    }
  }, [user]);

  /* ── Refetch on user change ───────────────────────────────── */
  useEffect(() => {
    if (user) {
      fetchConversations();
      fetchProjects();
    } else {
      setConversations([]);
      setProjects([]);
    }
  }, [user, fetchConversations, fetchProjects, refreshKey]);

  /* ── New chat — don't create in DB until first message ──────── */
  const handleNewChat = useCallback(() => {
    onNewChat?.();
  }, [onNewChat]);

  /* ── Rename conversation ──────────────────────────────────── */
  const renameConversation = useCallback(async (id, title) => {
    if (!title.trim()) return;
    setActionLoading(`rename-conversation-${id}`);
    try {
      const res = await authFetch(`/api/conversations/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ title: title.trim() }),
      });
      if (!res.ok) throw new Error('Failed to rename');
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: title.trim() } : c))
      );
    } catch (err) {
      console.error('Failed to rename conversation:', err);
    }
    setRenamingId(null);
    setKebabOpenId(null);
    setActionLoading(null);
  }, []);

  /* ── Delete conversation ──────────────────────────────────── */
  const deleteConversation = useCallback(async (id) => {
    setActionLoading(`delete-conversation-${id}`);
    try {
      const res = await authFetch(`/api/conversations/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      setConversations((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
    setKebabOpenId(null);
    setActionLoading(null);
  }, []);

  /* ── Create project ───────────────────────────────────────── */
  const createProject = useCallback(async () => {
    if (!user || !newProjectName.trim()) return;
    setActionLoading('create-project');
    try {
      const res = await authFetch('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name: newProjectName.trim() }),
      });
      if (!res.ok) throw new Error('Failed to create');
      const data = await res.json();
      setProjects((prev) => [data, ...prev]);
      setNewProjectName('');
      setCreatingProject(false);
    } catch (err) {
      console.error('Failed to create project:', err);
    }
    setActionLoading(null);
  }, [user, newProjectName]);

  /* ── Rename project ───────────────────────────────────────── */
  const renameProject = useCallback(async (id, name) => {
    if (!name.trim()) return;
    setActionLoading(`rename-project-${id}`);
    try {
      const res = await authFetch(`/api/projects/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error('Failed to rename');
      setProjects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, name: name.trim() } : p))
      );
    } catch (err) {
      console.error('Failed to rename project:', err);
    }
    setRenamingId(null);
    setKebabProjectId(null);
    setActionLoading(null);
  }, []);

  /* ── Delete project ───────────────────────────────────────── */
  const deleteProject = useCallback(async (id) => {
    setActionLoading(`delete-project-${id}`);
    try {
      const res = await authFetch(`/api/projects/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      setProjects((prev) => prev.filter((p) => p.id !== id));
      // Conversations in this project are now project_id = null (cascade SET NULL)
      fetchConversations();
    } catch (err) {
      console.error('Failed to delete project:', err);
    }
    setKebabProjectId(null);
    setActionLoading(null);
  }, [fetchConversations]);

  /* ── Move conversation to project ─────────────────────────── */
  const moveConversation = useCallback(async (conversationId, projectId) => {
    setActionLoading(`move-conversation-${conversationId}`);
    try {
      const res = await authFetch(`/api/conversations/${conversationId}`, {
        method: 'PUT',
        body: JSON.stringify({ project_id: projectId }),
      });
      if (!res.ok) throw new Error('Failed to move');
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId ? { ...c, project_id: projectId } : c
        )
      );
    } catch (err) {
      console.error('Failed to move conversation:', err);
    }
    setMovingConversationId(null);
    setKebabOpenId(null);
    setActionLoading(null);
  }, []);

  /* ── Toggle project expand ────────────────────────────────── */
  const toggleProject = (id) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /* ── Conversations scoped to a project or unassigned ──────── */
  const conversationsForProject = (projectId) =>
    conversations.filter((c) => c.project_id === projectId);
  const unassignedConversations = conversations.filter((c) => !c.project_id);

  /* ── Current conversation title for display ───────────────── */
  const currentTitle =
    conversations.find((c) => c.id === currentConversationId)?.title || null;

  /* ── Render kebab menu for a conversation row ─────────────── */
  const KebabMenu = ({ conversationId }) => {
    const isOpen = kebabOpenId === conversationId;
    const isRenaming = renamingId?.type === 'conversation' && renamingId?.id === conversationId;
    const isMoving = movingConversationId === conversationId;

    if (isRenaming) {
      return (
        <div className="px-2 py-1.5">
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !actionLoading) renameConversation(conversationId, renameValue);
              if (e.key === 'Escape') { setRenamingId(null); setKebabOpenId(null); }
            }}
            onBlur={() => { if (!actionLoading) renameConversation(conversationId, renameValue); }}
            disabled={actionLoading === `rename-conversation-${conversationId}`}
            className="w-full text-[11px] rounded-md px-2 py-1 border border-black/10 outline-none focus:border-black/25 bg-white disabled:opacity-40"
            placeholder="Rename…"
          />
        </div>
      );
    }

    if (isMoving) {
      return (
        <div className="px-2 py-1.5 space-y-0.5">
          <div className="text-[10px] text-black/40 mb-1">Move to project:</div>
          <button
            onClick={() => moveConversation(conversationId, null)}
            disabled={actionLoading === `move-conversation-${conversationId}`}
            className="w-full text-left text-[11px] px-2 py-1 rounded hover:bg-black/5 text-black/60 disabled:opacity-40"
          >
            No project
          </button>
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => moveConversation(conversationId, p.id)}
              disabled={actionLoading === `move-conversation-${conversationId}`}
              className="w-full text-left text-[11px] px-2 py-1 rounded hover:bg-black/5 text-black/60 truncate disabled:opacity-40"
            >
              {p.name}
            </button>
          ))}
        </div>
      );
    }

    return (
      <>
        {isOpen && (
          <div
            ref={kebabRef}
            className="absolute right-full top-0 mr-1 w-36 bg-white border border-black/8 rounded-lg shadow-lg z-50 overflow-hidden py-1"
            style={{ animation: 'scale-in 0.1s var(--ease-out-expo) both', transformOrigin: 'top right' }}
          >
            <button
              onClick={() => { setRenameValue(conversations.find(c => c.id === conversationId)?.title || ''); setRenamingId({ type: 'conversation', id: conversationId }); setKebabOpenId(null); }}
              className="w-full text-left px-3 py-1.5 text-[11px] text-black/60 hover:bg-black/5 transition-colors duration-100"
            >
              Rename
            </button>
            <button
              onClick={() => { setMovingConversationId(conversationId); setKebabOpenId(null); }}
              className="w-full text-left px-3 py-1.5 text-[11px] text-black/60 hover:bg-black/5 transition-colors duration-100"
            >
              Move to project
            </button>
            <button
              onClick={() => deleteConversation(conversationId)}
              disabled={actionLoading === `delete-conversation-${conversationId}`}
              className="w-full text-left px-3 py-1.5 text-[11px] text-red-500 hover:bg-red-50 transition-colors duration-100 disabled:opacity-40 disabled:cursor-default"
            >
              {actionLoading === `delete-conversation-${conversationId}` ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        )}
      </>
    );
  };

  /* ── Project kebab menu ───────────────────────────────────── */
  const ProjectKebab = ({ projectId }) => {
    const isOpen = kebabProjectId === projectId;
    const isRenaming = renamingId?.type === 'project' && renamingId?.id === projectId;

    if (isRenaming) {
      return (
        <div className="px-2 py-1">
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !actionLoading) renameProject(projectId, renameValue);
              if (e.key === 'Escape') { setRenamingId(null); setKebabProjectId(null); }
            }}
            onBlur={() => { if (!actionLoading) renameProject(projectId, renameValue); }}
            disabled={actionLoading === `rename-project-${projectId}`}
            className="w-full text-[11px] rounded-md px-2 py-1 border border-black/10 outline-none focus:border-black/25 bg-white disabled:opacity-40"
            placeholder="Rename…"
          />
        </div>
      );
    }

    return (
      <>
        {isOpen && (
          <div
            ref={kebabRef}
            className="absolute right-0 top-full mt-0.5 w-32 bg-white border border-black/8 rounded-lg shadow-lg z-50 overflow-hidden py-1"
            style={{ animation: 'scale-in 0.1s var(--ease-out-expo) both', transformOrigin: 'top right' }}
          >
            <button
              onClick={() => { setRenameValue(projects.find(p => p.id === projectId)?.name || ''); setRenamingId({ type: 'project', id: projectId }); setKebabProjectId(null); }}
              className="w-full text-left px-3 py-1.5 text-[11px] text-black/60 hover:bg-black/5 transition-colors duration-100"
            >
              Rename
            </button>
            <button
              onClick={() => deleteProject(projectId)}
              disabled={actionLoading === `delete-project-${projectId}`}
              className="w-full text-left px-3 py-1.5 text-[11px] text-red-500 hover:bg-red-50 transition-colors duration-100 disabled:opacity-40 disabled:cursor-default"
            >
              {actionLoading === `delete-project-${projectId}` ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        )}
      </>
    );
  };

  return (
    <aside
      className={`
        fixed md:static inset-y-0 left-0 z-40
        w-60 bg-white flex flex-col border-r border-black/8
        transition-transform md:transition-none duration-200 ease-[var(--ease-out-expo)]
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        [contain:paint_layout]
      `}
    >
      {/* ── Logo / brand ──────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2.5 group">
          <span className="w-7 h-7 rounded overflow-hidden flex-shrink-0">
            <img src={logo} alt="Logo" className="w-full h-full object-cover" />
          </span>
          <span className="text-sm font-medium text-black/70 group-hover:text-black transition-colors duration-150">
            Wystan
          </span>
        </Link>
        <button
          onClick={onCloseSidebar}
          className="md:hidden w-7 h-7 rounded-lg flex items-center justify-center text-black/40 hover-gate:text-black active:scale-[0.97] transition-all duration-150"
          aria-label="Close sidebar"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      {/* ── New chat ──────────────────────────────────────────── */}
      <div className="px-3">
        <button
          onClick={handleNewChat}
          disabled={actionLoading === 'new-chat'}
          className="w-full flex items-center gap-1 px-2 py-1 rounded-md text-xs text-black/65 hover-gate:text-black active:scale-[0.97] transition-all duration-150 disabled:opacity-40 disabled:cursor-default disabled:active:scale-100"
        >
          {actionLoading === 'new-chat' ? (
            <span className="material-symbols-outlined text-[13px] animate-spin">progress_activity</span>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" className="shrink-0">
              <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2.5" d="M12 5v14M5 12h14" />
            </svg>
          )}
          {actionLoading === 'new-chat' ? 'Creating…' : 'New chat'}
        </button>
      </div>

      {/* ── Generate ──────────────────────────────────────────── */}
      <div className="px-3 mt-px">
        <Link
          to="/generate"
          className="w-full flex items-center gap-1 px-2 py-1 rounded-md text-xs text-black/65 hover-gate:text-black active:scale-[0.97] transition-all duration-150"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 20 20" className="shrink-0 mr-px">
            <path fill="currentColor" d="M17.125 6.17L15.079.535c-.151-.416-.595-.637-.989-.492L.492 5.006c-.394.144-.593.597-.441 1.013l2.156 5.941V8.777c0-1.438 1.148-2.607 2.56-2.607H8.36l4.285-3.008l2.479 3.008zM19.238 8H4.767a.76.76 0 0 0-.762.777v9.42c.001.444.343.803.762.803h14.471c.42 0 .762-.359.762-.803v-9.42A.76.76 0 0 0 19.238 8M18 17H6v-2l1.984-4.018l2.768 3.436l2.598-2.662l3.338-1.205L18 14z" />
          </svg>
          Generate
        </Link>
      </div>

      {!user ? (
        /* ── Logged-out state ─────────────────────────────────── */
        <>
          <div className="flex-1 flex items-center justify-center px-6">
            <p className="text-xs text-black/30 text-center leading-relaxed">
              Sign in to see your conversations and projects.
            </p>
          </div>

          {/* ── Auth footer (logged out) ───────────────────────── */}
          <div className="px-3 pb-1">
            <div className="border-t border-black/8" />
          </div>
          <div className="px-3 pb-4 space-y-2">
            <button
              onClick={() => onOpenAuth?.('login')}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-black text-white text-sm font-medium active:scale-[0.97] transition-all duration-150 hover:bg-black/85"
            >
              Sign in
            </button>
            <p className="text-center text-xs text-black/30">
              New here?{' '}
              <button
                onClick={() => onOpenAuth?.('register')}
                className="underline hover:text-black/50 transition-colors duration-150"
              >
                Create an account
              </button>
            </p>
          </div>
        </>
      ) : (
        /* ── Logged-in state ──────────────────────────────────── */
        <>
          {/* ── Scrollable content area ────────────────────────── */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {/* ── Projects section ──────────────────────────────── */}
            <div className="px-3 mt-2">
              <div className="flex items-center justify-between px-1 py-0.5">
                <button
                  onClick={() => setProjectsExpanded(!projectsExpanded)}
                  className="flex items-center gap-0.5 text-[10px] font-medium text-black/55 hover:text-black/70 transition-colors duration-150 uppercase tracking-wider"
                >
                  <span className="material-symbols-outlined text-[12px]">
                    {projectsExpanded ? 'expand_more' : 'chevron_right'}
                  </span>
                  Projects
                </button>
                <button
                  onClick={() => setCreatingProject(true)}
                  className="w-4 h-4 rounded flex items-center justify-center text-black/45 hover:text-black hover:bg-black/5 transition-all duration-150"
                  aria-label="New project"
                >
                  <span className="material-symbols-outlined text-[12px]">add</span>
                </button>
              </div>

              {projectsExpanded && (
                <div className="space-y-px mt-px">
                  {/* Inline project creation */}
                  {creatingProject && (
                    <div className="px-2 py-1">
                      <input
                        autoFocus
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !actionLoading) createProject();
                          if (e.key === 'Escape') { setCreatingProject(false); setNewProjectName(''); }
                        }}
                        onBlur={() => { if (newProjectName.trim() && !actionLoading) createProject(); else { setCreatingProject(false); setNewProjectName(''); } }}
                        disabled={actionLoading === 'create-project'}
                        className="w-full text-[11px] rounded-md px-2 py-1 border border-black/10 outline-none focus:border-black/25 bg-white disabled:opacity-40"
                        placeholder="Project name…"
                      />
                    </div>
                  )}

                  {loadingProjects ? (
                    <div className="px-3 py-2 text-[11px] text-black/30">Loading…</div>
                  ) : projects.length === 0 ? (
                    <div className="px-3 py-2 text-[11px] text-black/25 italic">
                      {creatingProject ? '' : 'No projects yet'}
                    </div>
                  ) : (
                    projects.map((project) => (
                      <div key={project.id}>
                        <div className="relative group flex items-center px-2 py-1 rounded-lg hover:bg-black/[0.03] transition-colors duration-150 [backface-visibility:hidden]">
                          <button
                            onClick={() => toggleProject(project.id)}
                            className="flex items-center justify-center w-5 h-5 flex-shrink-0"
                            aria-label="Toggle project"
                          >
                            <span className="material-symbols-outlined text-[13px] text-black/25">
                              {expandedProjects.has(project.id) ? 'expand_more' : 'chevron_right'}
                            </span>
                          </button>
                          <span
                            className="flex items-center gap-1.5 flex-1 min-w-0 cursor-pointer"
                            onClick={(e) => { e.stopPropagation(); navigate(`/project/${project.id}`); onCloseSidebar?.(); }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 512 512" className="shrink-0 text-black/30">
                              <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M440 432H72a40 40 0 0 1-40-40V120a40 40 0 0 1 40-40h75.89a40 40 0 0 1 22.19 6.72l27.84 18.56a40 40 0 0 0 22.19 6.72H440a40 40 0 0 1 40 40v240a40 40 0 0 1-40 40M32 192h448" />
                            </svg>
                            <span className="text-xs text-black/50 truncate">{project.name}</span>
                          </span>
                          <div className="flex-shrink-0 relative">
                            <button
                              onClick={(e) => { e.stopPropagation(); setKebabProjectId(kebabProjectId === project.id ? null : project.id); setKebabOpenId(null); }}
                              className="opacity-60 sm:opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-black/25 hover:text-black/60 hover:bg-black/5 transition-all duration-150"
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
                                  className={`relative group flex items-center px-2 py-1 rounded-lg cursor-pointer transition-colors duration-150 [backface-visibility:hidden] ${
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
                                      className="opacity-60 sm:opacity-0 group-hover:opacity-100 w-4 h-4 rounded flex items-center justify-center text-black/20 hover:text-black/50 hover:bg-black/5 transition-all duration-150"
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
                    ))
                  )}
                </div>
              )}
            </div>

            {/* ── Recent conversations ───────────────────────────── */}
            <div className="px-3 mt-2">
              <div className="flex items-center gap-0.5 px-1 py-0.5">
                <span className="material-symbols-outlined text-[12px] text-black/45">history</span>
                <span className="text-[10px] font-medium text-black/55 uppercase tracking-wider">
                  Recent
                </span>
              </div>

              {loadingConversations && conversations.length === 0 ? (
                <div className="px-3 py-2 text-[11px] text-black/30">Loading…</div>
              ) : conversations.length === 0 ? (
                <div className="px-3 py-2 text-[11px] text-black/25 italic">
                  Start a conversation to see it here
                </div>
              ) : (
                <div className="space-y-0.5 mt-0.5">
                  {unassignedConversations.map((conv) => (
                    <div
                      key={conv.id}
                      className={`relative group flex items-center px-2 py-1.5 rounded-lg cursor-pointer transition-colors duration-150 [backface-visibility:hidden] ${
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
                          className="opacity-60 sm:opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-black/20 hover:text-black/50 hover:bg-black/5 transition-all duration-150"
                          aria-label="Conversation menu"
                        >
                          <span className="material-symbols-outlined text-[12px]">more_horiz</span>
                        </button>
                        <KebabMenu conversationId={conv.id} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Bottom padding for scroll area ──────────────── */}
            <div className="h-2" />

            {/* ── Data error banner ──────────────────────────── */}
            {dataError && (
              <div className="px-3 py-1.5 mx-3 mb-2 rounded-lg bg-amber-50 border border-amber-200 text-[10px] text-amber-600 leading-relaxed">
                {dataError}
              </div>
            )}
          </div>

          {/* ── Divider ───────────────────────────────────────── */}
          <div className="px-3 pb-1">
            <div className="border-t border-black/8" />
          </div>

          {/* ── Auth footer (logged in) ───────────────────────── */}
          <div className="px-3 pb-4 relative" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-black/[0.03] active:scale-[0.99] transition-all duration-150"
            >
              {/* Avatar */}
              <span className="w-7 h-7 rounded-full bg-black/10 flex items-center justify-center text-[11px] font-medium text-black/50 flex-shrink-0">
                {user.user_metadata?.avatar_url ? (
                  <img src={user.user_metadata.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  (user.email?.charAt(0) || '?').toUpperCase()
                )}
              </span>
              {/* Email */}
              <span className="text-xs text-black/50 truncate flex-1 text-left">
                {user.email}
              </span>
              <span className="material-symbols-outlined text-[14px] text-black/25 flex-shrink-0">
                {userMenuOpen ? 'expand_less' : 'expand_more'}
              </span>
            </button>

            {/* User menu dropdown */}
            {userMenuOpen && (
              <div
                className="absolute bottom-full left-3 right-3 mb-1 bg-white border border-black/8 rounded-lg shadow-lg z-50 overflow-hidden py-1"
                style={{ animation: 'scale-in 0.1s var(--ease-out-expo) both', transformOrigin: 'bottom left' }}
              >
                <div className="px-3 py-2 border-b border-black/5">
                  <div className="text-xs font-medium text-black/70 truncate">
                    {user.user_metadata?.full_name || user.email?.split('@')[0] || 'User'}
                  </div>
                  <div className="text-[10px] text-black/35 truncate">{user.email}</div>
                </div>
                <button
                  className="w-full text-left px-3 py-1.5 text-[11px] text-black/60 hover:bg-black/5 transition-colors duration-100"
                >
                  Settings
                </button>
                <button
                  onClick={() => { setUserMenuOpen(false); onSignOut?.(); }}
                  className="w-full text-left px-3 py-1.5 text-[11px] text-red-500 hover:bg-red-50 transition-colors duration-100"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
