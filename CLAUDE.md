# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Wystan AI is a full-stack AI chat app. A **React 19 + Vite 8 + Tailwind v4** frontend talks to a **CommonJS Express** backend that proxies two upstream LLM providers plus a file-upload endpoint. A Supabase integration (auth + data) is being added and is currently half-wired — read the "Two servers" note below before editing any server code.

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

No test runner is configured in this repo (neither client nor server), and the server is run directly with `node`/`nodemon` (no build step).

Env setup: copy `server/.env.example` → `server/.env` and `client/.env.example` → `client/.env`. The live server reads `NVIDIA_API_KEY`, `OPENCODE_API_KEY`, `OPENCODE_BASE_URL` (optional; defaults to `https://opencode.ai/zen/v1`), and `PORT`. The client reads `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL` (note: `VITE_API_URL=http://localhost:3001` points at the **scaffold** port, not the live server — the Vite proxy on :5173 → :5000 is the actual contract).

## Architecture

### Two servers coexist — only one is live

- **`server/index.js`** (flat, **CommonJS**, default **port 5000**) is the **live server**. `server/package.json` runs `nodemon index.js`, so this file owns every endpoint the client actually calls.
- **`server/src/`** (`app.js`, `index.js` on **port 3001**, `routes/index.js`, `config/supabase.js`, plus empty `controllers/middleware/utils/config` `.gitkeep` dirs) is a **modular ESM refactor scaffold that is not wired in** — nothing runs it, and its router only exposes `GET /api` → `{message:'API is working'}`. Treat it as the *intended future shape* (ESM + layered folders + Supabase auth), not the running app. **Editing `server/src/` will not change runtime behavior.**

### Live server endpoints (`server/index.js`, CommonJS)

- `POST /api/chat` — NVIDIA NIM (`meta/llama-4-maverick-17b-128e-instruct`), non-streaming, system prompt loaded from `server/system-prompt.txt`, last 12 messages as context.
- `POST /api/chat-full` — **SSE streaming, routed by model id**: ids containing `/` (e.g. `minimaxai/minimax-m3`) hit NVIDIA NIM (`NVIDIA_BASE_URL` + `NVIDIA_API_KEY`); others hit OpenCode (`OPENCODE_BASE_URL` + `OPENCODE_API_KEY`). Both upstreams are OpenAI-compatible chat-completions, so the same `relaySSE()` helper re-emits `data: {content}` / `data: [DONE]` to the client. Defaults: NVIDIA → `minimaxai/minimax-m3` (multimodal), OpenCode → `mimo-v2.5-free`. ChatPage ships four selectable ids: `minimaxai/minimax-m3` (default, multimodal), `mimo-v2.5-free`, `nemotron-3-ultra-free`, `north-mini-code-free`. Last 20 messages as context. **Omits the system prompt when multimodal content blocks are present** (some NVIDIA vision models crash with system + images together).
- `POST /api/upload` — `multer` memory upload (10 MB cap, `async` handler). Images → base64 data URL (`data:${mimetype};base64,...`); PDFs → rendered page images via `pdf-parse`'s `getScreenshot` (returns per-page data URLs); text/JSON → utf8 content; others → metadata only. ChatPage uses this via `buildUserContent`.
- `POST /api/generate` — Image generation via NVIDIA's Flux 2 model endpoint (`black-forest-labs/flux.2-klein-4b`). Accepts `{ prompt, width, height, seed, steps }`. Content-safety-filtered prompts return 400. Used by GeneratePage.
- `GET /api/health` → `{status:'OK', message:'Server is running!'}` (called by `client/src/pages/Home.jsx`; note `App.jsx` currently routes both `/` and `/chat` to `ChatPage`, so `Home` is not mounted).

### Pages

- **ChatPage** (`client/src/components/ChatPage.jsx`, 677 lines) — the main app at both `/` and `/chat`. Streaming chat with model selection (4 models), multimodal file attachment, message editing/copying/saving, and an image lightbox. Sends to `/api/chat-full` with `model` routing.
- **GeneratePage** (`client/src/components/GeneratePage.jsx`, 200 lines) — image generation at `/generate`. Form with prompt textarea, width/height/steps selects, calls `/api/generate`, displays results with download. Content-safety errors get amber banners vs red for other failures.
- **Navbar** (`client/src/components/Navbar.jsx`) — minimal unused component (renders a single link). Not wired into the router, similar to Noise.jsx.

### System-prompt gotcha

`server/system-prompt.txt` feeds **only** `/api/chat`. `/api/chat-full` uses an **inline `CHAT_SYSTEM_PROMPT` constant** (a hardcoded duplicate of the same text). Editing the `.txt` will not change streaming responses — update both if you want them in sync.

### Streaming contract (frontend ↔ backend)

The server forwards upstream SSE but **re-normalizes** it: it reads the provider's `data: {...}` deltas and re-emits only `data: ${JSON.stringify({content})}` lines, terminated by `data: [DONE]`. The client (`ChatPage.jsx`) reads with a `ReadableStream` + `TextDecoder`, splits on `\n`, parses each `data:` line, and appends `parsed.content` (or `parsed.choices[0].delta.content`) to the live assistant message. On error mid-stream the server writes `data: ${JSON.stringify({error})}` and the client throws on `parsed.error`. Keep both sides agreed on `{content}` / `{error}` / `[DONE]` when touching either end.

### Proxy & ports

`client/vite.config.js` proxies `/api` → `http://localhost:5000` (matches the live server). `client/.env.example`'s `VITE_API_URL=http://localhost:3001` points at the **scaffold** port and is inconsistent with the proxy — don't trust it as the source of truth.

### Supabase (in progress)

- Client: `client/src/lib/supabase.js` uses `@supabase/supabase-js` `createClient` with `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (legacy anon key).
- Scaffold server: `server/src/config/supabase.js` uses `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY` (new `sb_publishable_` key model).
- A leased skill at `server/.agents/skills/supabase-server/SKILL.md` documents the new `@supabase/server` package (auth modes `user`/`publishable`/`secret`/`none`, Hono/Edge adapters, migration off `anon`/`service_role`). The scaffold's env names (`SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWKS_URL`) signal the intended migration target. **Read that skill before writing server-side Supabase code.**

## Key Patterns

- **Live backend = CommonJS; client + scaffold = ESM.** `server/index.js` uses `require`; everything in `client/` and `server/src/` uses `import`. Don't `import` into the flat server, and don't `require` from the ESM scaffold.
- **SSE forwarding** (`relaySSE`) = read upstream `body.getReader()` → split on newlines (buffer partial lines across chunks) → re-emit normalized `data: {content}` → end with `data: [DONE]`. Used by every `/api/chat-full` branch (NVIDIA + OpenCode); the client SSE parser is provider-agnostic and unchanged.
- **Multimodal (vision) content** — `ChatPage.jsx` only sends OpenAI `image_url` content blocks (the base64 from `/api/upload`) when a `multimodal: true` entry in `MODELS` is selected; text-only models get the legacy string with a `[Attached image: …]` tag so they never reject array content. Array user messages render via `renderUserContent` (thumbnail + text); `userTextFromContent` extracts the text for edit.
- **Icons** = Google Material Symbols Outlined (loaded via Google Fonts in `client/index.html`); render as `<span className="material-symbols-outlined">name</span>`. The class is styled in `index.css` at a thin weight (`'wght' 280, 'opsz' 20`).
- **Styling/theme tokens** live in `client/src/index.css` via Tailwind v4: `@import "tailwindcss"` + an `@theme` block defining custom eases (`--ease-out-expo`, `--ease-spring`, …), `--font-magazine` (Playfair Display) and `--font-cursive` (Dancing Script), and keyframes (`fade-up`, `scale-in`, `float`, `blink`). There is **no `tailwind.config.js`** — Tailwind v4 is configured through `@theme`, so add new tokens there.
- **`hover-gate:` variant** — hand-written CSS under `@media (hover:hover) and (pointer:fine)` so hover styles don't "stick" on touch devices. Used throughout ChatPage (`hover-gate:border-black/25`, `hover-gate:text-black`, …); reuse it for new hover affordances instead of bare `:hover`.
- **Motion discipline** — only `transform`/`opacity`, under ~250–300ms, on the custom eases; `prefers-reduced-motion` is honored globally. The paper/grain look in the live UI comes from `body::before`/`::after` SVG turbulence overlays over a `bg-white` app shell. The canvas-based `client/src/components/Noise.jsx` exists but is **not used** by the routed pages.
