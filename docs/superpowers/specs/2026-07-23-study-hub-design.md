# Study Hub — Design Spec

**Date:** 2026-07-23
**Status:** Approved for implementation
**Author:** Karl Wystan Cabalonga + Claude

---

## 1. Overview

The Study Hub is a three-pane workspace (sources → chat → tools) that replaces the current `/learn` route. It is inspired by NotebookLM's grounded-RAG pattern but ships with our own visual language, our own backend, and our own scope cuts.

**Single sentence:** Upload study materials, ask questions grounded in those materials with inline citations, and generate flashcards/quizzes/summaries from the same source pool.

---

## 2. Routing

| Route | Component | Notes |
|---|---|---|
| `/learn` | **StudyHubPage** (new) | Replaces ToolsPage at this path |
| `/tools` | ToolsPage (unchanged) | 30-tool grid lives here now |
| `/learn/flashcards` | FlashcardsPage (unchanged) | Standalone paste-text → flashcards |
| `/learn/quiz` | QuizPage (unchanged) | Standalone paste-text → quiz |

**Sidebar:** the "Learn" link in `client/src/components/Sidebar.jsx` (line ~494) continues to point to `/learn`. The "Tools" link already points to `/tools` — no change needed. Users get one nav entry for the Study Hub and one for the standalone tools grid.

---

## 3. Three-pane layout

### Left sidebar (260px fixed, hidden on mobile behind a drawer)
- Sticky header: "Sources" + "+" button (opens upload modal)
- Drag-and-drop zone (visible on hover, can be expanded)
- Scrollable list of source rows:
  - Checkbox (drives `activeSourceIds`)
  - Filename (truncated, full on hover)
  - Chunk count badge
  - Kebab menu: Rename, Toggle active, Delete
- Footer: "N sources active" counter
- Empty state: dotted outline box with "Drop PDFs, DOCX, or paste text to get started"

### Center canvas (flex-1)
- Sticky header: "Study Hub" + active-source count + model selector (reuses the same model list as ChatPage)
- Scrollable message stream (user right, assistant left, like ChatPage)
- Assistant messages render Markdown + **citation pills** for `[Source: filename, p. X]` tags
- Clicking a pill → `SourcePreviewModal` shows the exact chunk text with source name + page
- Sticky bottom input: textarea (auto-grow to 200px max) + send button + paperclip (opens upload modal)
- Empty state: "Add sources on the left, then ask me anything about them."

### Right sidebar (320px fixed, hidden on mobile, toggleable)
- Tabs: **Flashcards** | **Quiz** | **Summary**
- Each tab: header (title + Generate button) + scrollable content area
- Tab content types:
  - **Flashcards**: animated 3D flip deck (reuses `FlipCard` from FlashcardsPage), card counter, prev/next, shuffle, new-deck
  - **Quiz**: progress bar, current question, radio options, submit → feedback → next → final score
  - **Summary**: bullet list of key concepts with source pills on each

### Responsive behavior
- ≥ 1024px: all three panes visible
- 768–1023px: left sidebar collapsible, right sidebar hidden by default with floating "Tools" button
- < 768px: mobile drawer pattern (existing app's `sidebarOpen` pattern reused)

---

## 4. Backend architecture

### 4.1 New files

| File | Purpose | LOC est. |
|---|---|---|
| `server/vectorStore.js` | pgvector-backed chunk store | ~150 |
| `server/embeddings.js` | TF-IDF vectorizer + semantic-tag generator | ~200 |
| `server/vocabulary.json` | Top 384 English + study-domain terms for TF-IDF (generated at build time from a static list) | data |
| `server/routes/study.js` | Seven endpoints (sources CRUD, chunks, chat, tools) | ~350 |
| `supabase/migrations/2026-07-23-study-hub.sql` | Tables, indexes, RLS | ~80 |

### 4.2 Database schema

```sql
-- Sources: one per uploaded file
create table sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  file_type text not null,           -- 'pdf' | 'docx' | 'pptx' | 'txt' | 'md' | 'xlsx' | 'csv'
  chunk_count int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Chunks: one per text segment, with embedding
create table chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources(id) on delete cascade,
  page_number int,                    -- nullable for non-paginated formats
  raw_text text not null,
  embedding vector(384),              -- pgvector column
  tags jsonb default '{}'::jsonb,     -- { concepts: [], terms: [], summary: '' }
  created_at timestamptz not null default now()
);

-- Indexes
create index sources_user_id_idx on sources(user_id);
create index chunks_source_id_idx on chunks(source_id);
create index chunks_embedding_idx on chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- RLS
alter table sources enable row level security;
alter table chunks enable row level security;
create policy "Users see their own sources" on sources for all using (auth.uid() = user_id);
create policy "Users see their own chunks" on chunks for all using (
  source_id in (select id from sources where user_id = auth.uid())
);
```

### 4.3 Embedding strategy (hybrid)

**Why hybrid:** OpenCode's `deepseek-v4-flash-free` is a chat model, not a true embedding model. A pure chat-model embedding has known quality issues (no continuous semantic space). So we use:

1. **TF-IDF vector (384-dim)** — computed server-side in `server/embeddings.js`. Built from a shared vocabulary loaded from `server/vocabulary.json` (top 384 English terms + study-domain terms). No API cost. Stored in `chunks.embedding` as `vector(384)`.
2. **Semantic tags JSONB** — generated via OpenCode deepseek-flash per chunk: `{ concepts: string[], terms: string[], summary: string }`. Used for reranking, not vector search.
3. **Retrieval pipeline:**
   - Step 1: pgvector cosine search returns top 20 chunks from `activeSourceIds`
   - Step 2: For each candidate, score tag overlap with query terms
   - Step 3: Combine scores (0.7 × vector + 0.3 × tag) → top 6 chunks
   - Step 4: Pass top 6 to chat LLM with strict system prompt

**Future swap:** If a real embedding model is added later (NVIDIA NIM embed-qa-4, OpenAI text-embedding-3, etc.), only `server/embeddings.js` changes. The `chunks.embedding` column stays `vector(384)` (or we add a migration to change the dimension). API contract unchanged.

### 4.4 Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/study/sources` | optionalAuth | Multipart upload → extract → chunk → embed → tag → store. Returns source. |
| GET | `/api/study/sources` | optionalAuth | List user's sources with chunk_count |
| PATCH | `/api/study/sources/:id` | requireAuth | Update `active` or `file_name` |
| DELETE | `/api/study/sources/:id` | requireAuth | Remove source + cascade chunks |
| GET | `/api/study/chunks/:id` | requireAuth | Fetch single chunk by id (for citation pill preview modal) |
| POST | `/api/study/chat` | optionalAuth | RAG-augmented streaming chat with citations. Returns SSE. |
| POST | `/api/study/tools/flashcards` | optionalAuth | Generate flashcard JSON from active sources |
| POST | `/api/study/tools/quiz` | optionalAuth | Generate quiz JSON from active sources + chat history |
| POST | `/api/study/tools/summary` | optionalAuth | Generate bullet summary from active sources |

**`POST /api/study/sources` flow:**
1. Multer receives file (10MB cap, reusing `server/index.js` config)
2. Reuse `server/extractors.js` to get text + page numbers
3. Reuse `server/file-types.js` for type detection
4. Chunk text: 500 chars, 50 char overlap, sentence-aware (split on `. ` `! ` `? ` `\n\n`)
5. For each chunk: compute TF-IDF vector + call OpenCode for semantic tags (rate-limited, 1 concurrent)
6. Insert source row, then bulk-insert chunks
7. Return `{ id, fileName, fileType, chunkCount, active: true, createdAt }`

**`POST /api/study/chat` flow:**
1. Client sends `{ prompt, activeSourceIds, model, conversationId? }`
2. Server embeds query (same TF-IDF + tag generation)
3. pgvector cosine search: top 20 from `chunks WHERE source_id = ANY(activeSourceIds)`
4. Rerank by tag overlap → top 6
5. Build LLM messages: system prompt + `{ chunks: [{fileName, pageNumber, rawText}] }` + chat history + user prompt
6. Stream response from OpenCode via SSE
7. Server emits chunks as before (`data: {content}`), client parses `[Source: ...]` tags

**System prompt for chat:**
```
You are a study assistant. Answer the user's question using ONLY the provided source excerpts below.

When you reference information from a source, attach a citation tag in this exact format:
[Source: {fileName}, p. {pageNumber}]

If the answer is not in the provided excerpts, respond with: "I couldn't find that in your sources. Try rephrasing or adding more materials."

Do not invent page numbers. Use only the page numbers provided in the excerpts.
```

### 4.5 Models & routing

| Endpoint | Provider | Model | Notes |
|---|---|---|---|
| `/api/study/chat` | OpenCode (id without `/`) | `deepseek-v4-flash-free` (default) | Same routing as existing `/api/chat-full` |
| `/api/study/tools/flashcards` | OpenCode | `mimo-v2.5-free` | Cheapest for structured JSON |
| `/api/study/tools/quiz` | OpenCode | `mimo-v2.5-free` | Same |
| `/api/study/tools/summary` | OpenCode | `mimo-v2.5-free` | Same |

---

## 5. Frontend architecture

### 5.1 New files

| File | Purpose | LOC est. |
|---|---|---|
| `client/src/components/StudyHubPage.jsx` | Top-level page, three-pane layout | ~250 |
| `client/src/components/study/SourceSidebar.jsx` | Left pane | ~250 |
| `client/src/components/study/UploadDropzone.jsx` | Drag-and-drop | ~120 |
| `client/src/components/study/SourceItem.jsx` | Single source row | ~150 |
| `client/src/components/study/ChatCanvas.jsx` | Center pane | ~280 |
| `client/src/components/study/MessageBubble.jsx` | With citation rendering | ~180 |
| `client/src/components/study/CitationPill.jsx` | Clickable tag | ~80 |
| `client/src/components/study/SourcePreviewModal.jsx` | Chunk preview | ~120 |
| `client/src/components/study/ToolSidebar.jsx` | Right pane (tab router) | ~150 |
| `client/src/components/study/FlashcardTab.jsx` | Reuses FlipCard | ~250 |
| `client/src/components/study/QuizTab.jsx` | Quiz UI | ~300 |
| `client/src/components/study/SummaryTab.jsx` | Bullet list | ~120 |
| `client/src/hooks/useStudyHub.js` | Central state + actions | ~300 |
| **Total** | | **~2550** |

### 5.2 State shape

`useStudyHub()` returns:
```js
{
  // Data
  sources: Source[],                    // [{id, fileName, fileType, chunkCount, active, createdAt}]
  activeSourceIds: string[],            // computed: sources.filter(s => s.active).map(s => s.id)
  messages: Message[],                  // [{id, role, content, citations: [{fileName, pageNumber, chunkId}]}]
  flashcards: Flashcard[],              // [{id, front, back, topic}]
  quiz: QuizQuestion[],                 // [{id, question, options, answer, explanation}]
  summary: SummaryItem[],               // [{text, citations: [...]}]

  // UI state
  isUploading: boolean,
  isChatting: boolean,
  isGeneratingFlashcards: boolean,
  isGeneratingQuiz: boolean,
  isGeneratingSummary: boolean,
  previewSource: Source | null,         // when a citation pill is clicked
  toolTab: 'flashcards' | 'quiz' | 'summary',
  chatError: string | null,

  // Actions
  uploadFile(file: File): Promise<Source>,
  toggleSource(id: string): Promise<void>,
  deleteSource(id: string): Promise<void>,
  renameSource(id: string, name: string): Promise<void>,
  sendMessage(prompt: string): Promise<void>,
  generateFlashcards(): Promise<void>,
  generateQuiz(): Promise<void>,
  generateSummary(): Promise<void>,
  openPreview(source: Source): void,
  closePreview(): void,
  setToolTab(tab): void,
  clearChat(): void,
}
```

### 5.3 Streaming contract

Reuses the existing SSE format from `/api/chat-full`:
- Server: `data: {JSON.stringify({content: '...'})}\n\n`
- Server: `data: {JSON.stringify({citations: [{fileName, pageNumber, chunkId}]})}\n\n` (sent at end of each turn)
- Server: `data: [DONE]\n\n`
- Client: `ReadableStream` + `TextDecoder` + line buffer (same as ChatPage)

Citation tags `[Source: filename, p. X]` in the streamed content are parsed client-side with regex `/\[Source:\s*([^,]+),\s*p\.\s*(\d+)\]/g` and rendered as `<CitationPill>` components. Each pill is clickable and triggers `openPreview`.

### 5.4 Component design notes

**`SourceSidebar.jsx`:**
- Uses the same `dragCounterRef` pattern as ChatPage (line ~XYZ) to survive child element crossings
- Reuses the `authFetch` wrapper
- Empty state: dotted outline box centered with `material-symbols-outlined` upload icon

**`ChatCanvas.jsx`:**
- Markdown rendering via `react-markdown` (already a vendor chunk)
- Auto-scrolling to bottom on new message (same as ChatPage)
- Reuses the model selector from ChatPage (extract `MODELS` to `client/src/lib/models.js` as a shared constant)

**`MessageBubble.jsx`:**
- Custom `remarkPlugin` that intercepts `[Source: ...]` patterns and replaces them with `<CitationPill>` components
- Citation pill onClick: `onCitationClick({fileName, pageNumber, chunkId})` → parent opens modal

**`FlashcardTab.jsx`:**
- Reuses the `FlipCard` component pattern from `FlashcardsPage.jsx` (line 5-41)
- Reuses the keyboard shortcuts (Arrow keys, Space/F to flip)
- Different from `FlashcardsPage`: source-aware (shows source name on each card back)

**`QuizTab.jsx`:**
- Single-question-at-a-time, no skip-back
- Submits → shows correct/incorrect + explanation → "Next" button
- Final screen: score + "Try Again" / "Back to Hub"

**`SummaryTab.jsx`:**
- Simple bullet list
- Each bullet has hover-revealed source pill(s)
- No interactivity beyond the pills

### 5.5 Animations

Reuse existing motion discipline (transform/opacity only, custom eases, ~250-300ms):
- Source row enter: `fade-up 0.25s` with 30ms stagger
- Citation pill hover: scale + color shift, 150ms
- Tab switch: fade + 4px slide
- Flashcard flip: 3D rotateY(180deg) with `preserve-3d` + `backface-visibility` (existing pattern)
- Source preview modal: `scale-in 0.15s`
- All gated to `prefers-reduced-motion`

### 5.6 Accessibility

- Source checkboxes: real `<input type="checkbox">` (not just onClick on a div)
- Citation pills: `<button>` with `aria-label="View source: {fileName} page {pageNumber}"`
- Tab nav in right sidebar: `role="tablist"` + `role="tab"` + `aria-selected`
- Modal: focus trap, `aria-modal="true"`, ESC to close
- All interactive elements have `aria-label` if icon-only

---

## 6. Data flow (end-to-end example)

User uploads `lecture.pdf`, activates it, asks "What is photosynthesis?":

```
1. User drops lecture.pdf onto left sidebar
   → SourceSidebar.handleDrop(file)
   → useStudyHub.uploadFile(file)
   → POST /api/study/sources (multipart)
   → server: extract → chunk → embed → tag
   → server returns { id: 'src_1', chunkCount: 23, ... }
   → client adds to sources, sets active=true

2. User clicks the checkbox (already checked by default)
   → useStudyHub.toggleSource('src_1')
   → PATCH /api/study/sources/src_1 { active: true }
   → client updates local state

3. User types "What is photosynthesis?" in center pane
   → ChatCanvas.handleSubmit(prompt)
   → useStudyHub.sendMessage(prompt)
   → POST /api/study/chat { prompt, activeSourceIds: ['src_1'] }
   → server: embed query → pgvector search → rerank → top 6 chunks
   → server: build LLM messages with chunks + strict system prompt
   → server: stream response via SSE
   → client: append chunks to last assistant message
   → client: parse [Source: lecture.pdf, p. 4] → render as CitationPill

4. User clicks the pill
   → MessageBubble.onCitationClick({fileName: 'lecture.pdf', pageNumber: 4, chunkId: 'chk_18'})
   → useStudyHub.openPreview({fileName, pageNumber, chunkId})
   → SourcePreviewModal fetches chunk text from server (GET /api/study/chunks/:id)
   → modal shows: "lecture.pdf — page 4\n\n[raw chunk text]"

5. User switches to Flashcards tab on right
   → ToolSidebar.setToolTab('flashcards')
   → user clicks "Generate"
   → useStudyHub.generateFlashcards()
   → POST /api/study/tools/flashcards { activeSourceIds: ['src_1'] }
   → server: aggregate chunks → LLM JSON return
   → client renders FlipCard deck
```

---

## 7. Out of scope (v1)

- Notebooks (grouping sources)
- Audio overview / podcast generation
- Mind maps from sources
- Shared notebooks / collaboration
- Source annotations / highlights
- Cross-source comparison view
- Persistent chat history (chat is ephemeral per session)
- Mobile-native layouts (uses responsive drawer pattern, not optimized)
- Real-time collaboration
- Source preview before upload

---

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| pgvector ivfflat index needs enough data to be useful | Document threshold (~1000 rows); fall back to sequential scan with `ORDER BY embedding <=> $1 LIMIT 20` for small datasets |
| TF-IDF vocabulary is English-only | Document limitation; allow user to extend `vocabulary.json` |
| OpenCode rate limits on tag generation | Batch tags per source (1 call per ~5 chunks) with rate-limit backoff |
| Citation hallucination by LLM | System prompt says "do not invent page numbers"; server validates tag format on stream and warns client if invalid |
| 10MB upload limit on multer | Reuse existing config; document in UI; show friendly error |
| In-flight request cancellation on tab switch | AbortController in `useStudyHub.sendMessage` |

---

## 9. Migration & rollout

1. **Commit 1: Backend + DB**
   - DB migration file
   - `server/vectorStore.js`, `server/embeddings.js`, `server/routes/study.js`
   - Wire into `server/index.js` with conditional Supabase check
   - Manual test: upload via curl, query via curl

2. **Commit 2: Frontend**
   - All `client/src/components/study/*` files
   - `client/src/components/StudyHubPage.jsx`
   - `client/src/hooks/useStudyHub.js`
   - Update `client/src/App.jsx` route
   - Update `client/src/lib/models.js` (extract MODELS to shared file)
   - Manual test: full flow in browser

3. **Commit 3: Polish (optional)**
   - Empty states
   - Error banners
   - Keyboard shortcuts
   - Mobile responsive pass

---

## 10. Success criteria

- [ ] User can upload a PDF and see it appear in the left sidebar within 5 seconds
- [ ] User can ask a question and receive a streamed response with at least one citation
- [ ] Clicking a citation pill opens a modal showing the exact chunk text
- [ ] User can generate flashcards from active sources and flip through them
- [ ] User can take a quiz and see a final score
- [ ] User can generate a summary and see bullet points with source pills
- [ ] No 500 errors on any of the six endpoints
- [ ] All existing routes (chat, generate, flashcards standalone, quiz standalone) still work
