# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Wystan AI is a full-stack AI chat app. A **React 19 + Vite 8 + Tailwind v4** frontend talks to a **CommonJS Express** backend that proxies multiple upstream LLM providers, file upload processing, web search, and image generation. Supabase integration (auth + conversation persistence) is wired into both the live server and client.

---

## Commands

```bash
# Install everything (root + client + server)
npm run install:all

# Run both via concurrently
npm run dev

# Individual
npm run dev:client            # Vite dev server on :5173
npm run dev:server             # nodemon server/index.js on :5000

# Client only
npm run build --prefix client  # vite build → client/dist
npm run lint --prefix client   # oxlint (rules in client/.oxlintrc.json)
npm run preview --prefix client
```

No test runner is configured in this repo. Env setup: copy `server/.env.example` → `server/.env` and `client/.env.example` → `client/.env`.

---

## Architecture

### Two servers coexist — only one is live

- **`server/index.js`** (flat, **CommonJS**, default **port 5000**) is the **live server**. Every endpoint the client actually calls lives here.
- **`server/src/`** (`app.js`, `index.js` on **port 3001**, empty `controllers/middleware/utils/config` dirs) is a **modular ESM refactor scaffold that is not wired in** — nothing runs it, and its router only exposes `GET /api` → `{message:'API is working'}`. **Editing `server/src/` will not change runtime behavior.**

### Live server endpoints (`server/index.js`, CommonJS)

| Endpoint | Purpose |
|---|---|
| `POST /api/chat` | Legacy non-streaming NVIDIA NIM (`meta/llama-4-maverick-17b-128e-instruct`), last 12 messages. Fallback/testing only. |
| `POST /api/chat-full` | **SSE streaming, routed by model id** — ids containing `/` (e.g. `minimaxai/minimax-m3`) hit NVIDIA NIM; others hit OpenCode. Last 20 messages as context. Omits the system prompt when multimodal content blocks are present. |
| `POST /api/upload` | Multipart file upload via multer (10 MB cap, memory storage). Processes images → base64, PDFs → text + page screenshots, DOCX/PPTX/XLSX/CSV/TSV → extracted text, code files → UTF-8 with language tag. Content truncated at 50,000 chars. |
| `POST /api/generate` | Image generation via NVIDIA Flux 2 (`black-forest-labs/flux.2-klein-4b`). Accepts `{ prompt, width, height, seed, steps }`. |
| `POST /api/search` | Web search via Tavily API. Accepts `{ query }`, returns up to 5 results with answer summary. Results cached in-memory for 5 minutes. |
| `POST /api/flashcards` | Non-streaming flashcard generation via OpenCode. Accepts `{ text }`, returns `{ cards: [{ question, answer }] }`. Uses strict JSON parsing with code-fence fallback. Max 15K chars input. |
| `POST /api/quiz` | Non-streaming quiz generation via OpenCode. Accepts `{ text, type, count, difficulty }`. Returns `{ questions: [...] }`. Validates each question's structure per type. Max 15K chars input. |
| `GET  /api/health` | `{status:'OK', message:'Server is running!'}` |

### Server-side auth & data routes (Supabase)

Loaded conditionally — if `@supabase/supabase-js` is installed:

- `POST /api/auth/signup` — email/password signup via `supabaseAdmin.auth.signUp()`
- `POST /api/auth/signin` — email/password signin via `supabaseAdmin.auth.signInWithPassword()`
- `POST /api/auth/signout` — revokes session token
- `GET  /api/auth/me` — returns authenticated user
- `POST /api/auth/oauth` — initiates OAuth flow (Google), returns authorization URL
- `GET  /api/auth/oauth/callback` — exchanges PKCE code for session tokens, redirects to client with `#access_token=...&refresh_token=...`
- `CRUD /api/conversations` — user's conversation rows
- `CRUD /api/projects` — user's project rows (organize conversations)

Auth middleware: `optionalAuth` decorates `req.user`/`req.supabase` if a Bearer token is present; `requireAuth` blocks unauthenticated requests.

### Client routing (`App.jsx`)

| Route | Component | Notes |
|---|---|---|
| `/` | ChatPage | Default landing |
| `/chat` | ChatPage | Same as `/` |
| `/chat/:conversationId` | ChatPage | Loads saved messages from Supabase |
| `/project/:id` | ProjectPage | Project home with conversation list + new-chat input |
| `/generate` | GeneratePage | Image generation form |
| `/learn` | LearnPage | Learning tools hub (25 tools: Flashcards, Quiz active; others coming-soon) |
| `/learn/flashcards` | FlashcardsPage | AI flashcard generation from pasted text or uploaded files |
| `/learn/quiz` | QuizPage | AI quiz generator: config → play → results |

### Client-side OAuth vs server-side OAuth

There are **two OAuth flows**:

1. **Client-side (primary, `client/src/lib/auth.js`)**: Uses `supabase.auth.signInWithOAuth({ provider: 'google' })` with PKCE handled via cookies. Tokens are stored in localStorage (`wystan_access_token`, `wystan_refresh_token`). After redirect, `parseOAuthTokensFromHash()` reads tokens from the URL hash. This is the main Google sign-in path.

2. **Server-side (fallback, `server/routes/auth.js`)**: The `POST /api/auth/oauth` endpoint initiates a server-driven OAuth flow, returning an authorization URL. The callback at `/api/auth/oauth/callback` exchanges the PKCE code and redirects to the client with `#access_token=...&refresh_token=...`.

All authenticated API calls use the `authFetch()` wrapper from `client/src/lib/auth.js`, which reads the stored token and adds `Authorization: Bearer`.

### Font system

Fonts are self-hosted via the `geist` npm package (copied to `client/public/fonts/`) and `@fontsource/source-serif-4`:

| CSS Variable | Font | Source |
|---|---|---|
| `--font-sans` | Geist (variable) | `/fonts/Geist-Variable.woff2` |
| `--font-mono` | Geist Mono (variable) | `/fonts/GeistMono-Variable.woff2` |
| `--font-display` | Geist Pixel (square) | `/fonts/GeistPixel-Square.woff2` |
| `--font-serif` | Source Serif 4 | npm `@fontsource/source-serif-4` |

### Vite build chunking

`client/vite.config.js` defines manual `rollupOptions.output.manualChunks` for three vendor bundles:
- `vendor-react` — react-dom, react, react-router
- `vendor-markdown` — react-markdown, remark-*
- `vendor-supabase` — @supabase/supabase-js

### Supabase integration

**Client-side** (via `@supabase/supabase-js` in `client/src/lib/supabase.js`):
- Auth state via `supabase.auth.onAuthStateChange` with Google OAuth (PKCE) or email/password
- Token management in `client/src/lib/auth.js` — stores JWT in localStorage, provides `authFetch()` wrapper that adds `Authorization: Bearer` header
- Data tables: `conversations` (id, user_id, project_id, title, created_at, updated_at), `messages` (id, conversation_id, role, content, created_at), `projects` (id, user_id, name, created_at, updated_at)

**Server-side** (via `server/supabase.js`, CommonJS):
- `supabaseAdmin` — secret key client, bypasses RLS for admin ops (signup, token verification)
- `createUserClient(token)` — publishable key + user JWT, respects RLS for user-scoped queries
- Uses new-style keys: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`
- Auth routes in `server/routes/`: `auth.js`, `conversations.js`, `projects.js`, `middleware.js`

### Key client pages & components

- **ChatPage** (`client/src/components/ChatPage.jsx`, ~1800 lines) — the main app. Streaming chat with 5-model selection (`minimaxai/minimax-m3`, `mimo-v2.5-free`, `deepseek-v4-flash-free`, `nemotron-3-ultra-free`, `north-mini-code-free`), multimodal file attachment, slash commands (`/search` for web search, `/generate` for image gen), message editing/copying/saving, image lightbox, file preview modal, auth modal, and Supabase conversation persistence. Model auto-switches to MiniMax M3 when images are attached. The input textarea auto-resizes up to 300px and has a 10,000-char limit.

- **Sidebar** (`client/src/components/Sidebar.jsx`, ~720 lines) — rendered inside ChatPage and ProjectPage. Logo, New Chat button, Generate link. Logged-in: collapsible Projects section with inline creation, nested conversations, Recent section for unassigned convos, kebab menus with rename/move/delete. Logged-out: "Sign in" CTA and register link. Responsive: fixed overlay on mobile, static on desktop.

- **ProjectPage** (`client/src/components/ProjectPage.jsx`, ~850 lines) — project landing at `/project/:id`. Shows project name, conversation list, text input for new conversations, full chat functionality inline (streaming, file upload, markdown rendering with code blocks). Uses `authFetch` for all API calls.

- **GeneratePage** (`client/src/components/GeneratePage.jsx`, ~670 lines) — image generation at `/generate`. Form with prompt, width/height/steps selects, batch count selector. Supports inspiration image upload + AI style analysis (sends image to MiniMax M3 via `/api/chat-full` for style description, then uses that as prompt context). Generated images displayed with download links.

- **LearnPage** (`client/src/components/LearnPage.jsx`, ~375 lines) — learning tools hub at `/learn`. 25-tool card grid (Flashcards and Quiz active; ChatGPT with PDF, AI Tutor, Essay Grader, etc. as coming-soon).

- **FlashcardsPage** (`client/src/components/FlashcardsPage.jsx`, ~460 lines) — full flashcard generation flow at `/learn/flashcards`. Text input or file upload, generation via `/api/flashcards`, study-mode UI (flip, rate, cycle through cards), print and export.

- **Layout** (`client/src/components/Layout.jsx`, ~65 lines) — wraps pages that need a Sidebar + mobile hamburger header. Renders `<Sidebar>` with mobile state management and `<Outlet>` for content. Used by the Learn tools; ChatPage/ProjectPage/GeneratePage render Sidebar directly.

- **Noise** (`client/src/components/Noise.jsx`, ~75 lines) — animated canvas grain overlay component. Used as background texture in the app.

- **QuizPage** (`client/src/components/QuizPage.jsx`) — orchestrator for the quiz generator at `/learn/quiz`. Delegates to three sub-components via `useQuiz` hook state machine: `QuizConfig` (input + settings), `QuizPlay` (question-by-question with feedback), `QuizResults` (score + review + retry). Sub-components: `QuizConfig.jsx`, `QuizPlay.jsx`, `QuizResults.jsx`. Hook: `client/src/hooks/useQuiz.js`.

### Streaming contract (frontend ↔ backend)

The server reads upstream SSE via `body.getReader()`, re-emits normalized `data: {JSON.stringify({content})}` lines, terminated by `data: [DONE]`. The client reads with `ReadableStream` + `TextDecoder`, splits on `\n`, parses each `data:` line. On error: `data: {JSON.stringify({error})}`. Both ends must agree on the `{content}` / `{error}` / `[DONE]` shape. Uses a `buffer` variable to handle partial lines across chunks.

### File upload processing

- **Images** (png, jpg, gif, webp, svg, bmp) → base64 data URL
- **Documents** (pdf → `pdf-parse` text + page screenshots, docx → `mammoth`, pptx → `adm-zip` XML slide extraction)
- **Tables** (xlsx/xls → `xlsx` CSV per sheet, csv/tsv → raw UTF-8)
- **Code** (37 languages) → UTF-8 with language tag
- **Text** (.txt) → raw UTF-8
- **Unknown** → metadata only
- All text content truncated to 50,000 characters

### Vercel deployment

- **`vercel.json`**: build from `client/`, output to `client/dist`, installs both client and server deps. Rewrites `/api/*` → serverless function, `/*` → SPA. Serverless entry at `api/index.js` imports the Express app. Server function has 256 MB memory, 30s timeout, includes `server/system-prompt.txt`.
- `.gitignore` excludes `.claude/` and `.env.*`.

### Key patterns

- **Live backend = CommonJS; client + scaffold = ESM.** `server/index.js` uses `require`; everything in `client/` and `server/src/` uses `import`.
- **Icons** = Google Material Symbols Outlined (loaded via Google Fonts in `client/index.html`); render as `<span className="material-symbols-outlined">icon_name</span>` with font variation `'wght' 280, 'opsz' 20`.
- **Styling** via Tailwind v4 `@theme` block in `client/src/index.css` — no `tailwind.config.js`. Custom eases, keyframes, `hover-gate:` variant (gated to `@media (hover:hover) and (pointer:fine)` to prevent sticky hover on touch). Light paper texture via `body::before`/`body::after` SVG turbulence overlays.
- **Motion discipline** — only `transform`/`opacity`, ~250–300ms, on custom eases; `prefers-reduced-motion` honored globally.
- **Drag-and-drop** in ChatPage uses `dragCounterRef` to survive child-element crossings.
- **System prompt gotcha:** `server/system-prompt.txt` feeds only `/api/chat` (legacy). `/api/chat-full` uses an inline `CHAT_SYSTEM_PROMPT` constant — a hardcoded duplicate. Edit both to keep them in sync.
- **Proxy & ports:** Vite proxies `/api` → `http://localhost:5000`. `VITE_API_URL` in `.env.example` points to port 3001 (scaffold server) — don't trust it as the source of truth.
- **StrictMode:** `client/src/main.jsx` wraps in `<StrictMode>`, which double-mounts in development — design cleanup effects accordingly.
