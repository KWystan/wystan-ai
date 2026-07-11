# Project Detail View

## Summary

When a user selects a folder/project from the sidebar, the main page restructures into that project's dedicated view, showing the folder icon/name at the top, a chat input field below it, and clickable conversation items beneath the input.

## Routes

| Path | Component | Notes |
|------|-----------|-------|
| `/` | `ChatPage` | Unchanged — all chat root |
| `/chat` | `ChatPage` | Unchanged |
| `/chat/:conversationId` | `ChatPage` | **New** — loads a specific conversation on mount |
| `/project/:id` | `ProjectPage` | **New** — the folder detail view |
| `/generate` | `GeneratePage` | Unchanged |

## New Component: `ProjectPage.jsx`

```
┌────────────────────────────────────┐
│ ← Back    📁 Project Name          │  Header bar
├────────────────────────────────────┤
│                                    │
│  [Type a message...]         [➤]  │  Chat input — starts new conversation
│                                    │
├────────────────────────────────────┤
│  Conversations                    │
│                                    │
│  ○ Conversation title 1           │  Clickable → /chat/:id
│  ○ Conversation title 2           │
│  ○ Conversation title 3           │
│                                    │
│  (empty state: "No conversations   │
│   yet. Start one above.")         │
│                                    │
└────────────────────────────────────┘
```

### Props & state

- `id` from route params → fetch project by primary key from Supabase
- `projects` table: `id`, `name`, `user_id`, `created_at`, `updated_at`
- `conversations` table: `id`, `title`, `project_id`, `user_id`, `created_at`, `updated_at`
- Local state: `project`, `conversations[]`, `input`, `isLoading`, `error`

### Behaviors

| Trigger | Action |
|---------|--------|
| Page mounts | Fetch project + its conversations from Supabase |
| User types + sends (logged in) | Create conversation with `project_id = project.id`, navigate to `/chat/:newId` |
| User types + sends (logged out) | Navigate to `/chat` (ephemeral chat, no persistence) |
| User clicks a conversation | Navigate to `/chat/:conversationId` |
| Back button / logo click | Navigate to `/chat` |
| Error fetching data | Show error banner (same pattern as Sidebar) |

## Changes to Existing Files

### `Sidebar.jsx`
- Project click handler: change from `toggleProject(id)` to `navigate(/project/${id})`
- Remove expand/collapse arrows and nested conversation rendering under projects (no longer needed — conversations live in the project view)
- Simplify project rows to: icon + name + kebab menu; clicking anywhere on the row navigates
- Remove `expandedProjects`, `projectsExpanded` state (or leave `projectsExpanded` to toggle visibility of the project list section itself)
- Change `onClick` on project row to `navigate(/project/${project.id})`
- Add `useNavigate` import

### `App.jsx`
- Add two routes: `/project/:id` → `ProjectPage`, `/chat/:conversationId` → `ChatPage`
- Import `ProjectPage`

### `ChatPage.jsx`
- Add route param handling: if `conversationId` from URL params exists, auto-load that conversation on mount (reuse `handleSelectConversation` logic)
- Import `useParams`

### New file: `ProjectPage.jsx`
- Shared CSS/pattern reuse: same header bar, input footer, error banner pattern as ChatPage
- Reuse `SUGGESTIONS` or omit suggestions (more minimal than ChatPage's welcome screen)

## Data Flow

```
Sidebar click project
  → navigate(/project/${id})
  → ProjectPage mounts
  → fetch project by id from supabase
  → fetch conversations WHERE project_id = id ORDER BY updated_at DESC
  → render header + input + conversation list

User sends message
  → if user is logged in:
    → supabase INSERT conversation { user_id, project_id, title }
    → navigate(/chat/${newId})
  → if user is logged out:
    → navigate(/chat) with ephemeral state

User clicks conversation
  → navigate(/chat/${conversationId})
  → ChatPage loads conversation messages from supabase
```

## State Handling

- **Loading**: Show spinner/skeleton while fetching project + conversations
- **Empty**: "No conversations yet. Start one above." when conversations list is empty
- **Error**: Red/amber error banner if Supabase fetch fails (same pattern as ChatPage/Sidebar)
- **Edge case — project not found**: Show "Project not found" with a link back to `/chat`
- **Edge case — user navigates away mid-load**: Cleanup via useEffect return
