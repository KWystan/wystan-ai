# Wystan AI — Full Site Audit

> **Audit Date:** 2026-07-22
> **Audit Scope:** Full-stack architecture, code quality, security posture, performance, deployment, documentation
> **Project:** Wystan AI — A personal AI chat platform by Karl Wystan Cabalonga

---

## 1. Executive Summary

Wystan AI is a sophisticated full-stack AI chat application featuring a React 19 + Vite 8 + Tailwind v4 frontend with a CommonJS Express backend. The platform proxies multiple upstream LLM providers (NVIDIA NIM, OpenCode), supports multimodal file attachments (images, PDFs, DOCX, XLSX, code files), image generation via NVIDIA Flux 2, web search via Tavily, and Supabase-powered authentication with conversation/project persistence. The app is deployed on Vercel with serverless API functions.

**Overall Health: GOOD** — The codebase is well-structured with clear separation of concerns, thoughtful UX patterns, and comprehensive documentation. Several areas need attention, primarily around security hardening, error handling consistency, stale scaffold removal, and testing coverage.

---

## 2. Technology Stack

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| **Frontend Framework** | React | 19.2.7 | Latest with concurrent features |
| **Build Tool** | Vite | 8.1.1 | Very latest major |
| **CSS** | Tailwind CSS | 4.3.2 | v4 with `@theme` directive, no config file |
| **CSS Plugin** | @tailwindcss/vite | 4.3.2 | First-party Vite integration |
| **Routing** | React Router DOM | 7.18.1 | v7 with nested routes |
| **Markdown Rendering** | react-markdown | 10.1.0 | With remark-gfm plugin |
| **Fonts** | Geist (self-hosted), Source Serif 4 (npm), Material Symbols (Google Fonts) | — | Three-families strategy |
| **Linting** | Oxlint | 1.71.0 | Rust-based linter |
| **Icons** | react-icons + Material Symbols Outlined | — | Dual icon system |
| **Backend** | Express | 4.21.2 | CommonJS |
| **Runtime** | Node.js (Vercel serverless) | — | 256MB, 30s timeout |
| **File Upload** | Multer | 2.2.0 | Memory storage, 10MB cap |
| **PDF Processing** | pdf-parse | 2.4.5 | Text + page screenshots |
| **DOCX Processing** | mammoth | 1.12.0 | Raw text extraction |
| **XLSX Processing** | xlsx (SheetJS) | 0.18.5 | CSV per sheet |
| **PPTX Processing** | adm-zip | 0.6.0 | XML slide extraction |
| **Database/Auth** | Supabase | 2.110.2 | Client + Admin SDKs |
| **AI Provider** | NVIDIA NIM API + OpenCode Zen | — | Dual routing by model ID |
| **Image Gen** | NVIDIA Flux 2 (black-forest-labs/flux.2-klein-4b) | — | Up to 1024×1024 |
| **Web Search** | Tavily API | — | 5-min TTL cache |
| **Dev Tooling** | concurrently, nodemon | 9.1.2 / 3.1.9 | Monorepo orchestration |

---

## 3. Project Structure

```
E:\Project\Wystan - AI\
├── api/                          # Vercel serverless entry point
│   └── index.js                  # Imports server/index.js
├── client/                       # React frontend (Vite)
│   ├── public/
│   │   ├── fonts/                # Self-hosted Geist font family (6 variants)
│   │   ├── favicon.svg
│   │   └── icons.svg
│   ├── src/
│   │   ├── assets/               # Static assets (logos, SVGs, hero images)
│   │   ├── components/
│   │   │   ├── ChatPage.jsx      # Main chat interface (~1800 lines)
│   │   │   ├── GeneratePage.jsx  # Image generation page
│   │   │   ├── ProjectPage.jsx   # Project detail view
│   │   │   ├── Layout.jsx        # Page layout wrapper
│   │   │   ├── Navbar.jsx        # Minimal navbar (unused?)
│   │   │   ├── Noise.jsx         # Canvas-based grain/noise overlay
│   │   │   └── Sidebar.jsx       # Navigation sidebar (~720 lines)
│   │   ├── data/
│   │   │   └── portfolioData.js  # Portfolio content for personal site
│   │   ├── hooks/
│   │   │   ├── useScrollReveal.js # IntersectionObserver reveal
│   │   │   └── useTypewriter.js   # Typewriter animation
│   │   ├── lib/
│   │   │   └── auth.js           # Token management + authFetch
│   │   ├── pages/
│   │   │   └── Home.jsx          # Landing page (health check)
│   │   ├── App.jsx               # Router configuration
│   │   ├── index.css             # Tailwind theme + global styles
│   │   └── main.jsx              # Entry point
│   ├── dist/                     # Build output
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── .env.example
├── docs/
│   ├── file-upload.md            # Comprehensive file upload docs
│   └── superpowers/
│       ├── plans/                # Implementation plans
│       └── specs/                # Design specs
├── server/                       # Express backend (CommonJS — LIVE)
│   ├── src/                      # ESM scaffold (NOT LIVE)
│   │   ├── app.js
│   │   ├── index.js
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── routes/
│   │   └── utils/
│   ├── routes/                   # Auth + data route modules
│   │   ├── auth.js
│   │   ├── conversations.js
│   │   ├── middleware.js
│   │   └── projects.js
│   ├── index.js                  # Main server (ALL live endpoints)
│   ├── supabase.js               # Server-side Supabase client
│   ├── cache.js                  # In-memory TTL cache utility
│   ├── system-prompt.txt         # Legacy system prompt
│   ├── package.json
│   └── .env.example
├── package.json                  # Root monorepo scripts
├── vercel.json                   # Deployment config
├── .gitignore
├── CLAUDE.md                     # Agent guidance document
└── test-upload.js                # Upload test script
```

---

## 4. Architecture Deep-Dive

### 4.1 Frontend Architecture

**Routing:** React Router v7 with lazy-loaded routes via `React.lazy()` + `<Suspense>`. Five routes across three components.

**State Management:** No external state library — pure React hooks across the board:
- `useState` for local UI state
- `useEffect` for side effects (data fetching, subscriptions)
- `useCallback` for memoized handlers
- `useRef` for DOM refs, counters, and abort controllers
- `useParams` for route parameters

**Streaming Chat Protocol:**
```
Client                          Server                          Upstream LLM
  │                               │                               │
  │── POST /api/chat-full ───────→│                               │
  │    {messages, model}          │── POST /chat/completions ────→│
  │                               │    {stream: true}             │
  │←── SSE: data: {content} ─────│←── data: {choices[...delta]} ─│
  │←── SSE: data: [DONE] ────────│←── data: [DONE] ──────────────│
```

**Key Client Patterns:**
- **Drag-and-drop:** Uses `dragCounterRef` pattern to prevent child-element flickering
- **Multimodal content assembly:** Two functions (`buildUserContent` / `buildApiContent`) produce different representations for display vs. API
- **Inline slash commands:** `/search` triggers Tavily web search, `/generate` triggers Flux 2 image gen
- **Model auto-switch:** Images attached → forces MiniMax M3 (multimodal)
- **File cache:** 30-min in-memory TTL for generated images
- **Conversation persistence:** Messages saved to Supabase after streaming completes

### 4.2 Backend Architecture

**Server Pattern:** Flat CommonJS Express (live) alongside modular ESM scaffold (not live). Two servers coexist — only `server/index.js` on port 5000 is operational.

**API Design:**
- Chat endpoints: non-streaming legacy (`/api/chat`) + streaming (`/api/chat-full`)
- File upload: single endpoint with type-dispatch switch
- Auth: Supabase-mediated with Bearer token pattern
- Data routes: RESTful CRUD for conversations and projects
- Search/image-gen: Thin wrappers around third-party APIs

**Key Server Patterns:**
- **TTL cache utility** — shared by conversation and project routes (30s default)
- **Model routing by ID convention** — `org/name` format → NVIDIA; simple name → OpenCode
- **System prompt omission** — multimodal messages bypass the system prompt (NVIDIA vision models crash with system+images)
- **Graceful degradation** — Supabase routes conditionally loaded; pdf-parse has try/catch fallbacks

### 4.3 Deployment Architecture

```
Vercel Edge/Functions
│
├── SPA: client/dist/ (static)
│   └── Serves /* → index.html (SPA fallback)
│
└── Serverless: api/index.js → server/index.js
    ├── 256MB memory
    ├── 30s timeout
    └── Includes system-prompt.txt
```

---

## 5. Code Health Assessment

### 5.1 Strengths

1. **Comprehensive documentation** — `file-upload.md` is thorough; `CLAUDE.md` provides complete developer onboarding
2. **Excellent motion discipline** — transform/opacity only, ~250-300ms, custom eases, `prefers-reduced-motion` support
3. **Hover gating** — `hover-gate:` variant prevents sticky hover states on touch devices
4. **Drag-and-drop robustness** — counter pattern solves child-element flickering
5. **Streaming resilience** — buffer-based SSE parsing handles partial chunks
6. **Security-aware patterns** — `dragCounterRef` pattern, content truncation at 50K chars, file size limits
7. **Modern tooling** — Vite 8, Tailwind v4, React 19, Oxlint — all latest major versions
8. **Code splitting** — Manual chunks for React, markdown, and Supabase vendor bundles
9. **Graceful degradation** — Conditional Supabase loading, PDF processing try/catch
10. **Cache invalidation** — TTL caches with prefix-based clearing on mutations

### 5.2 Issues & Anti-Patterns

#### Critical

| Issue | Location | Description |
|-------|----------|-------------|
| **Duplicate system prompt** | `server/index.js` inline `CHAT_SYSTEM_PROMPT` vs `system-prompt.txt` | Two sources of truth for assistant behavior — `/api/chat` uses file, `/api/chat-full` uses inline constant. They must be manually kept in sync. |
| **Unused ESM scaffold** | `server/src/` (7 files) | Complete modular refactor that's never wired in. Causes confusion — `.env.example` references port 3001 (scaffold), but the live server is on port 5000. |
| **Misleading VITE_API_URL** | `client/.env.example` → `http://localhost:3001` | Points to the non-live scaffold server. Should either be removed or pointed to 5000. |

#### High

| Issue | Location | Description |
|-------|----------|-------------|
| **No file size validation in upload response handler** | `ChatPage.jsx` — `handleFileSelect` | Relies entirely on server 413 response. No client-side pre-check means the upload round-trip fails after transfer. |
| **File upload is unauthenticated** | `server/index.js` — `/api/upload` | No auth middleware on upload endpoint — anyone who can reach the server can upload. |
| **No request rate limiting** | `server/index.js` — all endpoints | No rate limiting on chat, generate, or search endpoints. Potential for abuse/cost escalation. |
| **In-memory state across function invocations** | `server/index.js` — cache, auth state | Vercel serverless may reuse instances (cache hits) or create fresh ones (cache misses). Unpredictable behavior. |
| **Client-side token storage** | `auth.js` — localStorage | JWT tokens in localStorage are accessible to any JavaScript on the same origin. No httpOnly cookies. |
| **No input sanitization on rendered markdown** | `ChatPage.jsx`, `ProjectPage.jsx` | `react-markdown` has XSS protection by default, but custom `dangerouslySetInnerHTML` patterns should be audited. |

#### Medium

| Issue | Location | Description |
|-------|----------|-------------|
| **Large component files** | `ChatPage.jsx` (~1800 lines), `Sidebar.jsx` (~720 lines) | These should be broken into smaller, testable components. |
| **Inline component definitions** | `ChatPage.jsx` — `FilePreviewModal`, `CodePanel` | Components defined inside other components cause re-mounts on every render. |
| **Missing error boundaries** | `App.jsx` | No React error boundary wrapping routes — a render crash takes down the entire app. |
| **No test coverage** | Entire repo | No test runner configured. Zero unit, integration, or E2E tests. |
| **Hardcoded model list** | `ChatPage.jsx`, `ProjectPage.jsx`, `GeneratePage.jsx` | `MODELS` array duplicated across three components. Should be a shared constant. |
| **Mixed icon systems** | Throughout | Uses both `react-icons` (in dependencies) and Material Symbols (loaded via Google Fonts). Should pick one. |
| **Navbar component appears unused** | `Navbar.jsx` | Very minimal — not imported in any page component. Likely dead code. |

#### Low

| Issue | Location | Description |
|-------|----------|-------------|
| **React.StrictMode double-mounting** | `main.jsx` | Wraps app in StrictMode, which double-invokes effects in development. Several effects may need cleanup. |
| **Unused dependencies** | `client/package.json` — `react-icons` | Installed but not imported in any component (Material Symbols used instead). |
| **Fragile `showLanding` logic** | `ProjectPage.jsx` | Derived state (`showLanding`) from `messages.length === 0 && !generatedImage` — could be simplified. |
| **Comment formatting inconsistency** | Throughout | Mix of ASCII box-drawing headers (`┌──┐`) and plain comments. |
| **`.gitkeep` files in empty dirs** | `server/src/config/`, `controllers/`, etc. | Markers for directories that serve no purpose if the scaffold is not used. |

---

## 6. Security Analysis

| Concern | Risk | Recommendation |
|---------|------|----------------|
| Unauthenticated file upload | **Medium** — potential abuse for storage/processing | Add optional auth middleware (like `/api/conversations` uses) |
| JWT in localStorage | **Medium** — XSS vulnerability | Migrate to httpOnly cookies for token storage |
| No rate limiting | **Medium** — API abuse/cost | Implement in-memory rate limiting or use Vercel's built-in WAF |
| API keys in environment | **Low** — standard practice | Ensure `.env` files never committed (.gitignore confirms this) |
| Content truncation safety | **Low** — 50K char limit | Reasonable, but could be configurable per model |
| multer 10MB cap | **Low** | Adequate for the use case |
| No CSRF protection | **Low** — API is not cookie-auth | Acceptable for Bearer token pattern |
| No Helmet.js | **Low** | Add `helmet` middleware for security headers |

---

## 7. Performance Observations

| Area | Status | Notes |
|------|--------|-------|
| **Vite code splitting** | ✅ Good | Manual chunks for React, markdown, Supabase |
| **Lazy loading routes** | ✅ Good | `React.lazy()` + `<Suspense>` for all page components |
| **Image optimization** | ⚠️ Concern | No resizing/compression — images sent as full-res base64 to LLM |
| **Bundle size** | ⚠️ Unknown | No bundle analysis configured; should add `vite-plugin-visualizer` |
| **Caching** | ⚠️ Mixed | Server-side TTL caches (good), but unpredictable in serverless (bad) |
| **Font loading** | ✅ Good | Geist self-hosted via WOFF2; Source Serif 4 via npm |
| **Motion performance** | ✅ Excellent | Only transform/opacity, hardware-accelerated |
| **Canvas noise** | ⚠️ Potential perf issue | Continuous `requestAnimationFrame` loop drawing full 1024×1024 canvas every 2 frames. Could be expensive on low-end devices. |

---

## 8. Documentation Gaps

| Missing | Importance | Notes |
|---------|-----------|-------|
| Setup guide for new developers | **High** | CLAUDE.md covers commands but assumes Node/npm ready |
| Supabase schema documentation | **High** | Tables (projects, conversations, messages) defined in code but no formal schema doc |
| Environment variable reference | **Medium** | .env.example exists but no description of what each var does |
| Deployment checklist | **Medium** | Vercel config exists but no step-by-step deploy guide |
| API reference | **Medium** | Endpoints documented in CLAUDE.md but no formal OpenAPI/Swagger |
| Design system documentation | **High** | **This audit addresses this** — see designs document |
| Testing strategy | **Low** | No tests to document, but a plan is needed |

---

## 9. Recommendations

### Immediate (Quick Wins)

1. **Delete `server/src/` scaffold** — Remove the unused ESM scaffold to eliminate confusion. Move anything valuable (like the supabase config) into the live server.
2. **Fix `client/.env.example`** — Update `VITE_API_URL` to point to port 5000, or remove the file and document the proxy in CLAUDE.md.
3. **Consolidate system prompts** — Either read the file in `server/index.js` for `/api/chat-full` too, or inline both. Eliminate the duplicate.
4. **Refactor inline components** — Move `FilePreviewModal` and `CodePanel` out of `ChatPage.jsx` into their own files.
5. **Remove dead code** — Delete `Navbar.jsx`, unused `react-icons` dependency, `.gitkeep` files.

### Short-Term (Next Sprint)

6. **Add rate limiting** — Implement simple in-memory or use Upstash for Vercel-compatible rate limiting.
7. **Add auth to upload endpoint** — Mirror the `optionalAuth` pattern used by conversation routes.
8. **Implement error boundaries** — Wrap each route in an ErrorBoundary component.
9. **Add bundle analysis** — `vite-plugin-visualizer` to track bundle size.
10. **Share model constants** — Extract `MODELS` array to a shared config file consumed by all pages.

### Medium-Term

11. **Add test infrastructure** — Choose a testing framework (Vitest + React Testing Library) and add critical path tests.
12. **Migrate to httpOnly cookies** — More secure token management with refresh token rotation.
13. **Component decomposition** — Split `ChatPage.jsx` (~1800 lines) into ~5-7 focused components.
14. **Add Supabase schema docs** — Auto-generate or manually document the database schema.
15. **Image optimization pipeline** — Add server-side resizing for uploaded images before base64 conversion.

### Long-Term

16. **Progressive Web App** — Add service worker, offline support, and install prompt.
17. **i18n support** — Extract strings for internationalization.
18. **Sentry/Rollbar integration** — Error tracking for production.
19. **WebSocket upgrade** — Replace SSE polling with WebSocket for bidirectional streaming.
20. **Formal API documentation** — OpenAPI/Swagger spec for all endpoints.

---


---


## 11. New Features (2026-07-22)

### 11.1 Learn Page — /learn

**Status:** ✅ Complete

A dedicated learning tools hub accessible from the sidebar via the "Learn" nav item. Displays a 2-column grid of **30 tool cards**:

| Tool | Status | Badge | Clickable |
|------|--------|-------|-----------|
| Flashcards | **Active** | Free (green) | ✅ /learn/flashcards |
| Chat with PDF | Coming Soon | Coming Soon | ❌ |
| AI Tutor | Coming Soon | Coming Soon | ❌ |
| Essay Grader | Coming Soon | Coming Soon | ❌ |
| Math Solver | Coming Soon | Coming Soon | ❌ |
| Language Tutor | Coming Soon | Coming Soon | ❌ |
| Practice Tests | Coming Soon | Coming Soon | ❌ |
| Flashcard Exporter | Coming Soon | Coming Soon | ❌ |
| Grammar & Style | Coming Soon | Coming Soon | ❌ |
| Paraphraser | Coming Soon | Coming Soon | ❌ |
| Code Tutor | Coming Soon | Coming Soon | ❌ |
| Data Analyzer | Coming Soon | Coming Soon | ❌ |
| Lab Report Generator | Coming Soon | Coming Soon | ❌ |
| Study Guide | Coming Soon | Coming Soon | ❌ |
| Vocabulary Builder | Coming Soon | Coming Soon | ❌ |
| Explain Like I\'m 15 | Coming Soon | Coming Soon | ❌ |
| Comparison Matrix | Coming Soon | Coming Soon | ❌ |
| Timeline Generator | Coming Soon | Coming Soon | ❌ |
| Essay Outline | Coming Soon | Coming Soon | ❌ |
| Memory Aids | Coming Soon | Coming Soon | ❌ |
| Summarize | Coming Soon | Coming Soon | ❌ |
| Quiz Generator | Coming Soon | Coming Soon | ❌ |
| Mind Maps | Coming Soon | Coming Soon | ❌ |
| Writing Prompts | Coming Soon | Coming Soon | ❌ |
| Citation Formatter | Coming Soon | Coming Soon | ❌ |
| Study Schedule Planner | Coming Soon | Coming Soon | ❌ |
| Debate Simulator | Coming Soon | Coming Soon | ❌ |
| Story Generator | Coming Soon | Coming Soon | ❌ |
| Reading Level Adjuster | Coming Soon | Coming Soon | ❌ |
| Pomodoro Timer | Coming Soon | Coming Soon | ❌ |

**Implementation:**
- client/src/components/LearnPage.jsx — React component with 30-item TOOLS array
- Route: /learn → <LearnPage /> in App.jsx
- Header has NO bottom border (removed per user request)
- Staggered fade-up entrance animation (60ms delay per card)
- All material-symbols-outlined icons consistent with the app\'s icon system

### 11.2 Flashcard Generator — /learn/flashcards

**Status:** ✅ Complete (Frontend + Backend)

A free, AI-powered study tool that converts notes, PDFs, or any topic into interactive question-and-answer flashcards.

**Frontend (client/src/components/FlashcardsPage.jsx):**
- **Two input modes** via tab toggle: "Type / Paste" (textarea, 50K char limit) or "Upload Material" (drag-and-drop zone + file picker)
- **File upload** reuses existing /api/upload endpoint — supports PDF, DOCX, TXT, PPTX, XLSX, CSV, TSV, MD
- **Extracted text preview** after upload (first 2K chars shown, removable)
- **Generate button** disabled until content present, shows loading spinner
- **Interactive flip deck**: 3D rotateY(180deg) CSS flip with perspective, preserve-3d, backface-visibility. White front (question) / black back (answer). Tap to flip
- **Navigation**: Previous/Next buttons, "Card X / Y" counter, Shuffle button (deterministic seed-based shuffle), New button to reset
- **Keyboard shortcuts**: ArrowLeft/ArrowRight to navigate, Space/F to flip
- **Error handling**: Red banner for generation failures, empty-state hiding
- **Loading skeleton**: Pulsing card placeholder during generation
- Header has NO bottom border (removed per user request)
- All motion uses the app\'s established discipline (transform only, custom eases, will-change)

**Backend (server/index.js — POST /api/flashcards):**
- **Non-streaming** request to the cheapest available model (mimo-v2.5-free via OpenCode)
- **Dedicated system prompt** (FLASHCARD_SYSTEM_PROMPT) instructs the LLM to return a strict JSON array of {question, answer} objects
- **Input truncated** to 15K chars to limit token usage
- **Response validation**: Parses JSON, falls back to extracting from markdown code fences, filters malformed cards
- **Error responses**: 400 (no text), 502 (API error), 422 (empty/malformed cards), 503 (not configured)
- **No authentication required** — works for both logged-in and guest users

### 11.3 Sidebar Update

**Change:** Added "Learn" navigation link between "Generate" and the user conditional section.

| Detail | Value |
|--------|-------|
| Label | Learn |
| Icon | Custom cat/fox face SVG (viewBox 48x48, 13x13px rendering) |
| Target | /learn |
| Placement | Between "Generate" and the auth section divider |
| Styling | w-[13px] icon wrapper, gap-1.5, text-xs, same pattern as New chat and Generate |

### 11.4 App.jsx Routes Added

| Path | Component | Loaded |
|------|-----------|--------|
| /learn | LearnPage | Lazy |
| /learn/flashcards | FlashcardsPage | Lazy |
| /learn/quiz | QuizPage | Lazy |

### 11.5 File Changes Summary

| File | Change |
|------|--------|
| client/src/App.jsx | Added routes for /learn, /learn/flashcards, /learn/quiz |
| client/src/components/LearnPage.jsx | **New** — 30-tool card grid |
| client/src/components/FlashcardsPage.jsx | **New** — Full flashcard generator |
| client/src/components/Sidebar.jsx | Added "Learn" nav link with cat/fox face SVG icon |
| server/index.js | Added POST /api/flashcards and POST /api/quiz endpoints |
| docs/designs.md | Added Section 20 — Learn page & Flashcard Generator design |
| docs/site-audit.md | This section — new feature findings |
| client/.env | Fixed VITE_API_URL from port 3001 to 5000 |


### 11.1 Learn Page — /learn

**Status:** ✅ Complete

A dedicated learning tools hub accessible from the sidebar via the "Learn" nav item. Displays a grid of tool cards:
- **Flashcards** (Active, "Free" badge) — links to /learn/flashcards
- **Summarize** (Coming Soon, greyed out)
- **Quiz Generator** (Coming Soon, greyed out)
- **Mind Maps** (Coming Soon, greyed out)

**Implementation:**
- client/src/components/LearnPage.jsx — React component, lazy-loaded via React.lazy()
- Route: /learn → <LearnPage /> in App.jsx
- Sidebar entry: <Link to="/learn"> with school Material Symbols icon, placed after "Generate"
- Shared pattern: full-page overlay (ixed inset-0 z-50 flex bg-white), header bar with back navigation, scrollable main area
- Uses ade-up staggered entrance animation
- All material-symbols-outlined icons consistent with the app's icon system

### 11.2 Flashcard Generator — /learn/flashcards

**Status:** ✅ Complete (Frontend + Backend)

A free, AI-powered study tool that converts notes, PDFs, or any topic into interactive question-and-answer flashcards.

**Frontend (client/src/components/FlashcardsPage.jsx):**
- **Two input modes** via tab toggle: "Type / Paste" (textarea, 50K char limit) or "Upload Material" (drag-and-drop zone + file picker)
- **File upload** reuses existing /api/upload endpoint — supports PDF, DOCX, TXT, PPTX, XLSX, CSV, TSV, MD
- **Extracted text preview** after upload (first 2K chars shown, removable)
- **Generate button** disabled until content present, shows loading spinner
- **Interactive flip deck**: 3D otateY(180deg) CSS flip with perspective, preserve-3d, ackface-visibility. White front (question) / black back (answer). Tap to flip
- **Navigation**: Previous/Next buttons, "Card X / Y" counter, Shuffle button (deterministic seed-based shuffle), New button to reset
- **Keyboard shortcuts**: ArrowLeft/ArrowRight to navigate, Space/F to flip
- **Error handling**: Red banner for generation failures, empty-state hiding
- **Loading skeleton**: Pulsing card placeholder during generation
- All motion uses the app's established discipline (transform only, custom eases, will-change)

**Backend (server/index.js — POST /api/flashcards):**
- **Non-streaming** request to the cheapest available model (mimo-v2.5-free via OpenCode)
- **Dedicated system prompt** (FLASHCARD_SYSTEM_PROMPT) instructs the LLM to return a strict JSON array of {question, answer} objects
- **Input truncated** to 15K chars to limit token usage
- **Response validation**: Parses JSON, falls back to extracting from markdown code fences, filters malformed cards
- **Error responses**: 400 (no text), 502 (API error), 422 (empty/malformed cards), 503 (not configured)
- **No authentication required** — works for both logged-in and guest users

### 11.3 Sidebar Update

**Change:** Added "Learn" navigation link between "Generate" and the user conditional section.

| Detail | Value |
|--------|-------|
| Label | Learn |
| Icon | school (Material Symbols) |
| Target | /learn |
| Styling | Matches existing sidebar link pattern (text-xs, hover-gate, active:scale) |


## 10. Conclusion

Wystan AI is a technically impressive personal project that demonstrates strong command of modern full-stack development patterns. The codebase is generally clean, well-documented, and thoughtfully designed — particularly the motion system, drag-and-drop UX, and streaming chat protocol.

The primary areas for attention are **security hardening** (upload auth, rate limiting, token storage), **removing the stale scaffold** to eliminate confusion, and **adding test coverage**. The large component files would benefit from decomposition as the app grows.

**Overall Grade: B+** — Production-ready for personal use with manageable technical debt in clear, documented patterns.


### 11.6 Fixes Applied (2026-07-22)

| Fix | Files | Description |
|-----|-------|-------------|
| **Sidebar icon alignment** | Sidebar.jsx | Replaced cat/fox face SVG (viewBox 48) with graduation hat SVG (viewBox 24) matching the + icon format — all three nav items now render at identical visual size |
| **Removed back button** | FlashcardsPage.jsx | Removed `arrow_back` link from header — navigation is handled entirely via the sidebar |
| **Fixed upload error handling** | FlashcardsPage.jsx | Added client-side file size validation (10MB pre-check), nested JSON parse try/catch, HTTP status code in error messages, and console logging for debugging |
| **Header border consistency** | FlashcardsPage.jsx | Removed bottom border line — header matches the Learn page style with `bg-white/90 backdrop-blur-md` only |

### 11.7 Known Issues

| Issue | Status | Notes |
|-------|--------|-------|
| Sidebar re-mounts on page navigation | ⚠️ Open | Each page component (ChatPage, GeneratePage, LearnPage, FlashcardsPage) manages its own `<Sidebar>` instance. Navigating between pages causes the sidebar to re-mount and lose its scroll position / state. A future refactor should wrap all routes in a shared layout with a persistent sidebar. |
| No dark mode support | ⚠️ Known | The paper-texture aesthetic is inherently light-themed. Documented in section 18. |
| No test coverage | ⚠️ Known | Zero unit, integration, or E2E tests across the entire repository. |
| Large component files | ⚠️ Known | ChatPage.jsx (~1800 lines), Sidebar.jsx (~720 lines) — decomposition planned for future sprints. |

