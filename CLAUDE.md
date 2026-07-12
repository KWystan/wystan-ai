# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Wystan AI is a full-stack AI chat app. A **React 19 + Vite 8 + Tailwind v4** frontend talks to a **CommonJS Express** backend that proxies multiple upstream LLM providers, file upload processing, web search, and image generation. Supabase integration (auth + conversation persistence) is wired into the live server and client.

## Commands

```bash
# Install everything (root + client + server)
npm run install:all

# Run both via concurrently
npm run dev

# Individual
npm run dev:client            # Vite dev server on :5173
npm run dev:server             # nodemon server/index.js on :5000

# Client
npm run build --prefix client  # vite build → client/dist
npm run lint --prefix client   # oxlint (rules in client/.oxlintrc.json)
npm run preview --prefix client
```

No test runner is configured in this repo (neither client nor server), and the server is run directly with `node`/`nodemon` (no build step). Lint rules live in `client/.oxlintrc.json` (React + Oxc plugins, hooks and export-const rules).

Env setup: copy `server/.env.example` → `server/.env` and `client/.env.example` → `client/.env`. The live server reads `NVIDIA_API_KEY`, `OPENCODE_API_KEY`, `OPENCODE_BASE_URL` (optional; defaults to `https://opencode.ai/zen/v1`), `TAVILY_API_KEY`, and `PORT`. The client reads `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL` (note: `VITE_API_URL=http://localhost:3001` points at the **scaffold** port, not the live server — the Vite proxy on :5173 → :5000 is the actual contract).

## Architecture

### Two servers coexist — only one is live

- **`server/index.js`** (flat, **CommonJS**, default **port 5000**) is the **live server**. `server/package.json` runs `nodemon index.js`, so this file owns every endpoint the client actually calls.
- **`server/src/`** (`app.js`, `index.js` on **port 3001**, `routes/index.js`, `config/supabase.js`, plus empty `controllers/middleware/utils/config` `.gitkeep` dirs) is a **modular ESM refactor scaffold that is not wired in** — nothing runs it, and its router only exposes `GET /api` → `{message:'API is working'}`. Treat it as the *intended future shape* (ESM + layered folders + Supabase auth), not the running app. **Editing `server/src/` will not change runtime behavior.**

### Live server endpoints (`server/index.js`, CommonJS)

- `POST /api/chat` — **Legacy non-streaming** NVIDIA NIM endpoint (`meta/llama-4-maverick-17b-128e-instruct`), system prompt loaded from `server/system-prompt.txt`, last 12 messages as context. Only used for fallback/testing.
- `POST /api/chat-full` — **SSE streaming, routed by model id**: ids containing `/` (e.g. `minimaxai/minimax-m3`) hit NVIDIA NIM (`NVIDIA_BASE_URL` + `NVIDIA_API_KEY`); others hit OpenCode (`OPENCODE_BASE_URL` + `OPENCODE_API_KEY`). Both upstreams are OpenAI-compatible chat-completions, so the same `relaySSE()` helper re-emits `data: {content}` / `data: [DONE]` to the client. Last 20 messages as context. **Omits the system prompt when multimodal content blocks are present** (some NVIDIA vision models crash with system + images together). ChatPage ships 5 selectable models (see Model Selection below).
- `POST /api/upload` — `multer` memory upload (10 MB cap, `async` handler). Processes files by their **group** (image, text, document, table): images → base64 data URL; PDFs → text (via `pdf-parse`) + page screenshots; DOCX → text (via `mammoth`); PPTX → text (via `adm-zip` XML extraction); XLSX/XLS → CSV text per sheet (via `xlsx`); CSV/TSV → raw utf8; code/text files → utf8 content with language tag. Content is truncated at 50,000 chars for LLM context safety. ChatPage uses this via `buildUserContent` / `buildApiContent`. A dedicated multer error handler returns 413 for files over 10 MB.
- `POST /api/generate` — Image generation via NVIDIA's Flux 2 model endpoint (`black-forest-labs/flux.2-klein-4b`). Accepts `{ prompt, width, height, seed, steps }`. Content-safety-filtered prompts return 400. Used by GeneratePage.
- `POST /api/search` — Web search via Tavily API (`TAVILY_API_KEY`). Accepts `{ query }`, returns up to 5 results with an answer summary. Used by ChatPage's `/search` slash-command mode.
- `GET /api/health` → `{status:'OK', message:'Server is running!'}` (called by `client/src/pages/Home.jsx`; note `App.jsx` currently routes both `/` and `/chat` to `ChatPage`, so `Home` is not mounted).

### Server dependencies

`express`, `cors`, `dotenv`, `multer`, `pdf-parse`, `mammoth` (DOCX), `xlsx` (spreadsheets), `adm-zip` (PPTX), plus `nodemon` for dev. All live-server code is flat in `server/index.js`.

### Client routing (`App.jsx`)

| Route | Component | Notes |
|---|---|---|
| `/` | ChatPage | Default landing |
| `/chat` | ChatPage | Same as `/` |
| `/chat/:conversationId` | ChatPage | Loads saved messages from Supabase |
| `/project/:id` | ProjectPage | Project home with conversation list + new-chat input |
| `/generate` | GeneratePage | Image generation form |

### Pages & Components

- **ChatPage** (`client/src/components/ChatPage.jsx`, ~1300 lines) — the main app at `/`, `/chat`, and `/chat/:conversationId`. Streaming chat with 5-model selection, multimodal file attachment (images + documents), paste-to-file conversion, web search slash-command, image generation slash-command, message editing/copying/saving, image lightbox, file preview modal, and Supabase auth/auth-modal. Sends to `/api/chat-full` with `model` routing.

  - **Slash commands:** `/search` → runs a Tavily web search, prepends results to the user message before sending to the LLM. `/generate` → navigates to GeneratePage with any typed text as the initial prompt. The active mode is shown as a tag below the input.
  - **Model selection** (`MODELS` array): `minimaxai/minimax-m3` (default, multimodal), `deepseek-v4-flash-free`, `mimo-v2.5-free`, `nemotron-3-ultra-free`, `north-mini-code-free`. When images are attached, auto-switches to MiniMax M3 (the only multimodal model).
  - **Large paste:** Pastes ≥ 15,000 chars are auto-converted to a `.txt` file upload instead of inline text. Falls back to inline insertion if the upload fails.
  - **File preview:** `FilePreviewModal` overlays images, PDFs (paginated with screenshots), and text/code content. Opened by clicking an attached file bubble.
  - **Markdown rendering:** `react-markdown` + `remark-gfm` with custom components for code blocks (CodePanel with language label + copy button), lists, headings, blockquotes, links, tables.
  - **Conversation persistence:** When a user is logged in, messages save to Supabase `messages` table (per `conversation_id`). The first message of a new chat auto-creates the conversation row with a title derived from the message text. Loading `/chat/:conversationId` fetches saved messages from Supabase.

- **Sidebar** (`client/src/components/Sidebar.jsx`, ~720 lines) — rendered inside ChatPage and ProjectPage. Shows logo, New Chat button, Generate link. When logged in: collapsible Projects section (create/rename/delete project, inline creation input), nested conversations per expanded project, Recent section for unassigned conversations, kebab menus with rename/move-to-project/delete actions, user menu with sign out. When logged out: "Sign in" CTA and register link. Data fetched from Supabase `conversations` and `projects` tables, ordered by `updated_at`. Responsive: fixed overlay on mobile with backdrop, static sidebar on desktop.

- **ProjectPage** (`client/src/components/ProjectPage.jsx`, ~300 lines) — project landing at `/project/:id`. Loads project metadata and its conversations from Supabase. Shows project name, folder icon, conversation list (clickable → `navigate(/chat/${id})`), and a text input to start a new conversation within that project. Handles loading, error, and not-found states.

- **GeneratePage** (`client/src/components/GeneratePage.jsx`, ~200 lines) — image generation at `/generate`. Form with prompt textarea, width/height/steps selects, calls `/api/generate`, displays results with download. Content-safety errors get amber banners vs red for other failures. Accepts `initialPrompt` from ChatPage's `/generate` navigation state.

- **Navbar** (`client/src/components/Navbar.jsx`) — minimal unused component (renders a single link). Not wired into the router, similar to Noise.jsx and `client/src/pages/Home.jsx` (both `/` and `/chat` route to ChatPage, so Home is never mounted).

### Supabase (live, client-side)

- **Client library:** `client/src/lib/supabase.js` uses `@supabase/supabase-js` `createClient` with `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (legacy anon key).
- **Auth:** ChatPage and ProjectPage listen to `supabase.auth.onAuthStateChange` and pass `user` state into Sidebar. ChatPage has an inline auth modal (login/register) opened via Sidebar's `onOpenAuth` callback or when sending messages logged out. The live server is **not** involved in auth — Supabase auth is entirely client-side via `@supabase/supabase-js`.
- **Data tables:**
  - `conversations` — `id`, `user_id`, `project_id` (nullable FK), `title`, `created_at`, `updated_at`. CRUD in Sidebar.
  - `messages` — `id`, `conversation_id`, `role` (`'user'` | `'assistant'`), `content`, `created_at`. Inserted in pairs after each assistant reply.
  - `projects` — `id`, `user_id`, `name`, `created_at`, `updated_at`. CRUD in Sidebar.
- **Scaffold server:** `server/src/config/supabase.js` uses `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY` (new `sb_publishable_` key model). A leased skill at `server/.agents/skills/supabase-server/SKILL.md` documents the new `@supabase/server` package. **Read that skill before writing server-side Supabase code.**

### System-prompt gotcha

`server/system-prompt.txt` feeds **only** `/api/chat`. `/api/chat-full` uses an **inline `CHAT_SYSTEM_PROMPT` constant** (a hardcoded duplicate of the same text). Editing the `.txt` will not change streaming responses — update both if you want them in sync.

### Streaming contract (frontend ↔ backend)

The server forwards upstream SSE but **re-normalizes** it: it reads the provider's `data: {...}` deltas and re-emits only `data: ${JSON.stringify({content})}` lines, terminated by `data: [DONE]`. The client (`ChatPage.jsx`) reads with a `ReadableStream` + `TextDecoder`, splits on `\n`, parses each `data:` line, and appends `parsed.content` (or `parsed.choices[0].delta.content`) to the live assistant message. On error mid-stream the server writes `data: ${JSON.stringify({error})}` and the client throws on `parsed.error`. Keep both sides agreed on `{content}` / `{error}` / `[DONE]` when touching either end.

The client's SSE parser also respects `visibleConversationRef` — if the user navigates away mid-stream, the stream continues saving to Supabase in the background but stops updating the visible UI.

### Proxy & ports

`client/vite.config.js` proxies `/api` → `http://localhost:5000` (matches the live server). `client/.env.example`'s `VITE_API_URL=http://localhost:3001` points at the **scaffold** port and is inconsistent with the proxy — don't trust it as the source of truth.

### File upload: groups & processing

The server categorizes files by extension into **groups**, each processed differently:

| Group | Types | Processing |
|---|---|---|
| `image` | png, jpg, jpeg, gif, webp, svg, bmp | Base64 data URL |
| `text` | txt, plus code files (js, jsx, ts, tsx, py, rb, java, c, cpp, cs, go, rs, swift, kt, php, html, css, scss, less, sql, sh, bash, yaml, yml, xml, json, md, r) | UTF-8 content with language tag |
| `document` | pdf, docx, pptx | PDF: text via `pdf-parse` + page screenshots; DOCX: text via `mammoth`; PPTX: text via `adm-zip` XML extraction |
| `table` | xlsx, xls, csv, tsv | XLSX/XLS: CSV per sheet via `xlsx`; CSV/TSV: raw utf8 |
| `other` | unknown extensions | Metadata only (no content) |

All text content is truncated to 50,000 characters (`MAX_CONTEXT_CHARS`) before being sent to the LLM. The client's `buildApiContent` attaches the full text of non-image files to the API payload so the model can read them.

### Conversation lifecycle

1. **Logged-out user:** Messages exist only in React state. No persistence.
2. **Logged-in user, new chat:** First message creates a `conversations` row (title = truncated message text), then saves user + assistant messages to `messages`. URL updates to `/chat/:id`.
3. **Logged-in user, existing chat (`/chat/:conversationId`):** Messages loaded from `messages` table on mount. New messages appended and saved.
4. **Navigating away mid-stream:** The stream continues in the background and saves to Supabase when done; the UI for the new conversation loads fresh from the DB.
5. **Sidebar:** Reflects all conversations and projects from the DB. Rename/delete/move modify rows directly. `refreshKey` prop triggers refetch after ChatPage creates or modifies conversations.

## Key Patterns

- **Live backend = CommonJS; client + scaffold = ESM.** `server/index.js` uses `require`; everything in `client/` and `server/src/` uses `import`. Don't `import` into the flat server, and don't `require` from the ESM scaffold.
- **SSE forwarding** (`relaySSE`) = read upstream `body.getReader()` → split on newlines (buffer partial lines across chunks) → re-emit normalized `data: {content}` → end with `data: [DONE]`. Used by every `/api/chat-full` branch (NVIDIA + OpenCode); the client SSE parser is provider-agnostic and unchanged.
- **Multimodal (vision) content** — `ChatPage.jsx` only sends OpenAI `image_url` content blocks (the base64 from `/api/upload`) when a `multimodal: true` entry in `MODELS` is selected; text-only models get the legacy string with an `[Attached image: …]` tag so they never reject array content. For non-image files, `buildApiContent` inlines the file text into the message for the model to read. `buildUserContent` shows only a terse reference so the bubble stays clean. Array user messages render via `renderUserContent` (text only); `userTextFromContent` extracts text for editing.
- **Icons** = Google Material Symbols Outlined (loaded via Google Fonts in `client/index.html`); render as `<span className="material-symbols-outlined">name</span>`. The class is styled in `index.css` at a thin weight (`'wght' 280, 'opsz' 20`).
- **Styling/theme tokens** live in `client/src/index.css` via Tailwind v4: `@import "tailwindcss"` + an `@theme` block defining custom eases (`--ease-out-expo`, `--ease-spring`, …), `--font-magazine` (Playfair Display) and `--font-cursive` (Dancing Script), and keyframes (`fade-up`, `scale-in`, `float`, `blink`). There is **no `tailwind.config.js`** — Tailwind v4 is configured through `@theme`, so add new tokens there.
- **Client entry point** — `client/src/main.jsx` calls `createRoot` inside `<StrictMode>`. StrictMode double-mounts components in development (effects run twice, refs/state persist between mounts), which can cause duplicate fetches or SSE connections during dev — design cleanup effects (`return () => ...`) accordingly.
- **`hover-gate:` variant** — hand-written CSS under `@media (hover:hover) and (pointer:fine)` so hover styles don't "stick" on touch devices. Used throughout ChatPage (`hover-gate:border-black/25`, `hover-gate:text-black`, …); reuse it for new hover affordances instead of bare `:hover`.
- **Motion discipline** — only `transform`/`opacity`, under ~250–300ms, on the custom eases; `prefers-reduced-motion` is honored globally. The paper/grain look in the live UI comes from `body::before`/`::after` SVG turbulence overlays over a `bg-white` app shell. The canvas-based `client/src/components/Noise.jsx` exists but is **not used** by the routed pages.
- **Drag-and-drop** — ChatPage uses a `dragCounterRef` pattern (increment on enter, decrement on leave, reset to 0 on drop) so drag state survives child-element crossings. Files are batch-uploaded on drop (or file input change) via sequential `/api/upload` calls.