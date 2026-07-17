# File Upload System

Wystan AI supports attaching a wide variety of files to chat messages — images for vision models, documents for text extraction, spreadsheets for tabular data, and source code files. This document explains the complete pipeline: how files are uploaded, processed, transmitted to the LLM, previewed in the UI, and persisted.

---

## Table of Contents

1. [Supported File Types](#1-supported-file-types)
2. [Architecture Overview](#2-architecture-overview)
3. [Client-Side Flow](#3-client-side-flow)
4. [Server-Side Processing](#4-server-side-processing)
5. [File Groups & Processing Details](#5-file-groups--processing-details)
6. [LLM Content Assembly](#6-llm-content-assembly)
7. [Multi-Model Routing](#7-multi-model-routing)
8. [File Preview Modal](#8-file-preview-modal)
9. [Image Lightbox](#9-image-lightbox)
10. [Large Paste → File Conversion](#10-large-paste--file-conversion)
11. [Upload Progress & Error Handling](#11-upload-progress--error-handling)
12. [Drag and Drop](#12-drag-and-drop)
13. [Conversation Persistence](#13-conversation-persistence)

---

## 1. Supported File Types

### Images (7 formats)

| Extension | MIME type |
|-----------|-----------|
| `.png` | `image/png` |
| `.jpg` / `.jpeg` | `image/jpeg` |
| `.gif` | `image/gif` |
| `.webp` | `image/webp` |
| `.svg` | `image/svg+xml` |
| `.bmp` | `image/bmp` |

### Documents (3 formats)

| Extension | Format | Processor |
|-----------|--------|-----------|
| `.pdf` | PDF | `pdf-parse` (text + page screenshots) |
| `.docx` | Word | `mammoth` (raw text) |
| `.pptx` | PowerPoint | `adm-zip` (XML slide extraction) |

### Spreadsheets & Tables (4 formats)

| Extension | Format | Processor |
|-----------|--------|-----------|
| `.xlsx` | Excel (modern) | `xlsx` → CSV per sheet |
| `.xls` | Excel (legacy) | `xlsx` → CSV per sheet |
| `.csv` | Comma-separated | Raw UTF-8 |
| `.tsv` | Tab-separated | Raw UTF-8 |

### Code Files (37 languages)

`js` `jsx` `ts` `tsx` `py` `rb` `java` `c` `cpp` `cs` `go` `rs` `swift` `kt` `php` `html` `css` `scss` `less` `sql` `sh` `bash` `yaml` `yml` `xml` `json` `md` `r`

Each code file is tagged with its language in the response and in the API payload (see [LLM Content Assembly](#6-llm-content-assembly)).

### Plain Text

`.txt` — read as UTF-8, untagged.

### Unknown / Binary

Any unrecognized extension is handled as a fallback: the file metadata (name, type, size) is returned but no content is extracted. The LLM sees only a file reference marker.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────┐
│  Client (React 19 + Vite)           │
│                                     │
│  Drop / File picker / Paste          │
│       │                              │
│       ▼                              │
│  POST /api/upload (FormData) ────────┼──→ Server (Express, :5000)
│       │                              │     │
│       ▼                              │     ▼
│  Response: {filename, group,         │   multer (memory, 10MB cap)
│    content, data, pages, language}   │   │
│       │                              │   ▼
│       ▼                              │   FILE_TYPES lookup (ext → group)
│  attachedFiles state                 │   │
│       │                              │   ▼
│       ▼                              │   Group-specific processing
│  buildUserContent (display)          │   │
│  buildApiContent (LLM payload)       │   ▼
│       │                              │   truncateContent (50K chars)
│       ▼                              │   │
│  POST /api/chat-full (JSON) ─────────┼──→ LLM (NVIDIA or OpenCode)
│       │                              │
│       ▼                              │
│  FilePreviewModal / Lightbox         │
└─────────────────────────────────────┘
```

Key principle: files are uploaded once, ahead of the chat message, via a dedicated `/api/upload` endpoint. The response is cached in React state (`attachedFiles`); when the user sends the message, both the file metadata and content are assembled into the chat payload.

---

## 3. Client-Side Flow

### 3.1 Attachment Methods

Users can attach files via three entry points:

1. **File picker** — clicking the `+` button → "Attach file" opens the native OS file picker. The hidden `<input type="file">` accepts all known types via the `accept` attribute.
2. **Drag and drop** — dragging files onto the main chat area. A translucent overlay appears with "Drop files to attach" while dragging.
3. **Large paste** — pasting text ≥ 15,000 characters auto-converts it to a `.txt` file and uploads it (see [section 10](#10-large-paste--file-conversion)).

### 3.2 Upload Sequence (`handleFileSelect` / `handleDrop`)

For each file:

1. Create a `FormData` object and append the file as `formData.append('file', file)`.
2. POST to `/api/upload`.
3. Parse the JSON response and push into `attachedFiles` state.
4. Advance a progress counter.

Files are uploaded **sequentially** (one at a time, awaiting each response), not in parallel. The progress bar tracks `current / total` across the batch.

### 3.3 Upload Response Shape

```typescript
interface UploadResponse {
  filename: string;       // original filename
  mimetype: string;       // MIME type reported by browser
  size: number;           // file size in bytes
  type: string;           // 'image' | 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'xls' | 'csv' | 'tsv' | 'code' | 'text' | 'file'
  group: string;          // 'image' | 'document' | 'table' | 'text' | 'other'
  language: string | null; // programming language (for code files), null otherwise

  // For images:
  data?: string;          // base64 data URL ("data:image/png;base64,...")

  // For documents / text / tables:
  content?: string;       // extracted text content (null if extraction failed)

  // For PDFs only:
  pages?: string[];       // array of page screenshots as base64 data URLs
}
```

### 3.4 File Chip Display

Attached files appear as small clickable chips (`<div>` elements) above the input area. Each chip shows:

- A Material Symbols icon (image, PDF, code, slides, table, or generic document).
- The filename (truncated to ~120px).
- If PDF: the page count (`· 4p`).
- A close button (`×`) to remove the file from the chat before sending.

Clicking a chip opens the [File Preview Modal](#8-file-preview-modal).

### 3.5 Model Auto-Switch

When the user attaches **any image** (`group: 'image'`), ChatPage automatically switches to **MiniMax M3** (`minimaxai/minimax-m3`), the only multimodal model in the selection. This happens at send-time:

```js
const hasImages = attachedFiles.some((f) => f.group === 'image');
const effectiveModel = hasImages
  ? MODELS.find((m) => m.multimodal)?.id || selectedModel
  : selectedModel;
```

Text-only models do not receive OpenAI `image_url` content blocks — instead they get a flat-text reference (`[Attached image: filename.png]`).

---

## 4. Server-Side Processing

Endpoint: **`POST /api/upload`** (Express, `server/index.js:133`)

### 4.1 Request

- Middleware: `multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })`
- Expects `multipart/form-data` with a single field `file`.
- Maximum file size: **10 MB** (413 response if exceeded).

### 4.2 File Type Resolution

The server determines the file type by extension first (lowercased), then falls back to MIME type:

```js
const ext = path.extname(originalname).toLowerCase().replace('.', '');
let info = FILE_TYPES[ext];
```

The `FILE_TYPES` registry maps extensions to `{ type, group, language? }`. If the extension is unknown, the server checks the MIME type:

| MIME pattern | Assigned type |
|---|---|
| `image/*` | `{ type: 'image', group: 'image' }` |
| `text/*` | `{ type: 'text', group: 'text' }` |
| `application/json` | `{ type: 'code', group: 'text', language: 'json' }` |
| `application/pdf` | `{ type: 'pdf', group: 'document' }` |
| `*/*xml*` | `{ type: 'code', group: 'text', language: 'xml' }` |
| Everything else | `{ type: 'file', group: 'other' }` (metadata only) |

### 4.3 Content Truncation

Every text `content` field is truncated to **50,000 characters** (`MAX_CONTEXT_CHARS`) before being returned. Truncated content appends:

```
[Content truncated at 50,000 characters. The original file was N KB.]
```

---

## 5. File Groups & Processing Details

### 5.1 Images (`group: 'image'`)

**Processing:** The raw buffer is converted to a base64 data URL:

```js
response.data = `data:${mimetype};base64,${buffer.toString('base64')}`;
```

**How it reaches the LLM:** When a multimodal model is selected, the data URL is injected as an OpenAI-compatible `image_url` content block:

```typescript
{ type: 'image_url', image_url: { url: 'data:image/png;base64,...' } }
```

For text-only models, the image is replaced with:
```
[Attached image: filename.png]
```

### 5.2 Documents (`group: 'document'`)

#### PDF (`.pdf`)

Two extraction steps, independent of each other:

1. **Text extraction** via `pdf-parse`: calls `parser.getText()` for the document's text content. If this fails (e.g., a scanned document), `content` is set to `null` — the screenshots are still returned.
2. **Page screenshots** via `pdf-parse`'s `getScreenshot()`: each page is rendered as a base64 PNG data URL and returned in the `pages` array. These are used by the [File Preview Modal](#8-file-preview-modal) for paginated viewing.

#### Word (`.docx`)

Extracted via `mammoth.extractRawText({ buffer })`. Returns `.value` as plain text.

#### PowerPoint (`.pptx`)

Extracted via `adm-zip`: the `.pptx` (a ZIP archive) is opened, and all XML files under `ppt/slides/` are parsed for `<a:t>` (text) elements. Slide text is joined with double-newline separators.

### 5.3 Spreadsheets & Tables (`group: 'table'`)

#### CSV / TSV

Read as raw UTF-8 text.

#### XLSX / XLS

Parsed via the `xlsx` library (`XLSX.read(buffer, { type: 'buffer' })`). Each sheet is converted to CSV via `XLSX.utils.sheet_to_csv(sheet)` and formatted as:

```
--- Sheet Name ---
col1,col2,col3
...rows...
```

Empty sheets are omitted.

### 5.4 Text & Code (`group: 'text'`)

Read as UTF-8. Code files carry a `language` tag (e.g., `'javascript'`, `'python'`, `'rust'`) used in the LLM payload for syntax context.

### 5.5 Other / Unknown (`group: 'other'`)

Metadata only. The LLM receives a bare file reference: `[📎 unknown.bin]`.

---

## 6. LLM Content Assembly

Before the chat message is sent to `/api/chat-full`, the client assembles the message content from the user's text and the attached files. Two functions handle this, producing different representations for display vs. the API.

### 6.1 Display Content (`buildUserContent`)

Used to construct the message object stored in React state and saved to Supabase. Shows terse references to keep the chat bubble clean.

**Multimodal model (with images):**

```typescript
[
  { type: 'text', text: 'Describe this image' },
  { type: 'image_url', image_url: { url: 'data:image/png;base64,...' } },
]
```

Non-image files are appended to the text block as `\n\n[📎 filename.ext]`.

**Text-only model:**

```typescript
"[Attached image: photo.png]\n[📎 data.csv]\nAnalyze this data"
```

### 6.2 API Payload Content (`buildApiContent`)

Used only at send-time, included in the JSON sent to the LLM. Full file content is inlined so the AI can read it.

**Multimodal model (with images):**

```typescript
[
  {
    type: 'text',
    text: 'Analyze this data\n\n--- data.csv ---\ncol1,col2\n1,2\n3,4'
  },
  { type: 'image_url', image_url: { url: 'data:image/png;base64,...' } },
]
```

Non-image files get their content appended with a header: `--- filename.ext (language) ---\n<content>`.

**Text-only model:**

```typescript
"[Attached image: photo.png]\n[data.csv]\ncol1,col2\n1,2\n3,4\n\nAnalyze this data"
```

### 6.3 How the API Payload Is Sent

The assembled content is nested in the messages array sent to `/api/chat-full`:

```json
{
  "model": "minimaxai/minimax-m3",
  "messages": [
    { "role": "user", "content": [/* blocks from buildApiContent */] }
  ]
}
```

The server relays this as-is to the upstream provider (NVIDIA or OpenCode). When multimodal content blocks are present, the server **omits the system prompt** — some NVIDIA vision models crash when receiving system + image messages together.

---

## 7. Multi-Model Routing

The file upload system is coupled to the model selection through two mechanisms:

### 7.1 Auto-Switch (Client)

When any image is attached, the selected model is **overridden** to MiniMax M3 (multimodal) at send-time. The user sees the model dropdown still showing their previous choice — the switch is transparent. This ensures vision capabilities are always available when images are present. See [3.5 Model Auto-Switch](#35-model-auto-switch).

### 7.2 Content-Shape Differences

| Scenario | Message Format |
|---|---|
| Multimodal model + images | OpenAI content blocks: `[{type:'text'}, {type:'image_url'}]` |
| Text-only model + images | Flat string with `[Attached image: …]` placeholders |
| Any model + non-image files | File text inlined with `--- filename ---` headers |
| Any model + no files | Plain string — unchanged from text-only chat |

---

## 8. File Preview Modal

The `FilePreviewModal` component (defined inline in `ChatPage.jsx:31`) overlays a full-screen backdrop when a file chip is clicked. The modal adapts to the file type:

### Image Files

```jsx
<img src={file.data} alt={filename} />
```

Displays the image centered, scaled to fit (max 75vh). Clicking opens the [image lightbox](#9-image-lightbox) instead.

### PDF Files

Two-way display:

1. **Text content** — if `file.content` is present, displayed in a `<pre>` block (monospace, scrollable).
2. **Page screenshots** — if `file.pages` exist, shows one page at a time with left/right navigation arrows and a `page N / total` counter. Page images are base64 PNG data URLs rendered as `<img>` elements.

Both can coexist: the text renders first (in the `<pre>`), and below it the user can page through screenshots.

### Text / Code / Table Files

Content is displayed in a `<pre>` block with monospace font, word-wrap, and horizontal scroll. Language tags, where present, are shown as a small uppercase badge in the modal header (e.g., `JAVASCRIPT`, `PYTHON`, `MARKDOWN`).

### Unknown / Binary Files

Shows a `No preview available` message with an eye-off icon.

### Modal Header

All file previews share a common header with:
- Material Symbols icon (matches file type).
- Filename.
- Language badge (if applicable).
- File size in KB.
- Download button (for images, downloads the data URL; for PDFs, downloads the first page screenshot; for other files, the download button is disabled).
- Close button (or press `Escape`).

---

## 9. Image Lightbox

A separate overlay from the File Preview Modal. Triggered by:

- Clicking an image thumbnail in a user message (inline above the bubble).
- Clicking an image displayed inside the File Preview Modal.
- Clicking an image in an assistant message (rendered via `react-markdown` `img` component).

The lightbox shows the image at full resolution on a dark backdrop. Clicking the backdrop or pressing `Escape` closes it. The close button is positioned at the top-right.

---

## 10. Large Paste → File Conversion

When a user pastes text ≥ **15,000 characters** (`LARGE_TEXT_THRESHOLD`), the paste event is intercepted:

1. The pasted text is wrapped in a `File` object as `pasted-text-YYYY-MM-DD.txt`.
2. It is uploaded to `/api/upload` with `Content-Type: text/plain`.
3. If successful, the file chip appears above the input like any other attachment.
4. If the upload fails, the text is inserted inline so nothing is lost. An error banner appears: "Paste upload failed — text inserted inline instead."

A `pasteLockRef` prevents re-entry during the async upload. A spinner indicator ("Converting paste to file…") is shown while uploading.

---

## 11. Upload Progress & Error Handling

### Progress Bar

During file uploads, a progress bar appears above the input:

```
◌ Uploading 2 of 5  [████░░░░░░]
```

- Uses `uploadProgress` state: `{ current: number, total: number }`.
- Counts sequentially (each file completes before the next starts).
- The spinner icon animates while uploading.

### Error States

| Condition | Error Message |
|---|---|
| File > 10 MB | `"filename" is too large. Maximum file size is 10 MB.` |
| Upload HTTP error | `Failed to upload "filename": <server error>` |
| Paste upload fails | `Paste upload failed — text inserted inline instead.` |
| Server reports error | `Failed to upload "filename": <error text>` |

Errors are displayed as a dismissible red banner below the message area. A single upload failure in a batch does not abort the rest — other files continue uploading, and the error banner is set to the last failure. Files that succeeded are still attached.

### Edge Cases

- **Empty file list:** `handleFileSelect` and `handleDrop` both early-return if `files.length === 0`.
- **Duplicate filenames:** No deduplication. Multiple files can share a name; they appear as separate chips.
- **File input reset:** After any upload batch, `fileInputRef.current.value = ''` is set so re-selecting the same file triggers the `onChange` event again.
- **Upload during existing upload:** The file picker and drop zone remain functional but `isUploading` disables the `+` button; no explicit queue — concurrent uploads don't occur because each batch is sequential via the `for (const file of files) { await ... }` loop.

---

## 12. Drag and Drop

### Behavior

The main chat area (the `.flex-1.flex.flex-col` div) handles drag events:

| Event | Action |
|---|---|
| `dragenter` | Increments `dragCounterRef`; sets `isDragging` if items present |
| `dragover` | `preventDefault()` to allow drop |
| `dragleave` | Decrements `dragCounterRef`; clears `isDragging` when counter reaches 0 |
| `drop` | Resets counter + state; reads `e.dataTransfer.files` and uploads each |

The `dragCounterRef` pattern prevents flickering when dragging over child elements: the counter increments on enter, decrements on leave, and only sets/clears the visual state when transitioning to/from zero.

### Drag Overlay

When `isDragging` is true, a translucent overlay fills the main area with:

```
┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
   ✱ Drop files to attach
└─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```

This overlay is `pointer-events: none` so underlying interactions still receive events.

---

## 13. Conversation Persistence

File attachments are persisted as part of the conversation when the user is logged into Supabase.

### How Messages Are Saved

When the assistant response completes, both the user message and assistant message are saved to the `messages` table:

```typescript
// user message
{
  role: 'user',
  content: buildUserContent(text, isMultimodal, attachedFiles), // display content
  files: attachedFiles, // full upload response objects
}
```

The `files` field on the user message stores the complete `UploadResponse` objects. This means:

- **On reload:** When loading a conversation at `/chat/:conversationId`, messages are fetched from Supabase. The `files` array on user messages preserves the file metadata.
- **Re-rendering** uses `extractFileRefs` to rebuild file chips from the content string when `msg.files` is empty (legacy messages).
- **Images in saved messages** (OpenAI `image_url` blocks) are re-rendered as thumbnails above the user bubble. The base64 data URLs remain valid because they were stored directly in the message content — no server-side file storage is involved.

### What Is Not Persisted

- **File content** is not stored in a dedicated file bucket — it lives in the `content` field of the user message object (for text) or as base64 `data` embedded in the message content array (for images). There is no separate file/blob storage beyond what Supabase's `messages` table holds.
- **Large binary content** (PDF screenshots, full base64 images) within the content array could inflate row sizes — images attached during a conversation are stored inline in the message content and re-loaded into state on conversation load.

---

## Server Dependencies

| Package | Used For |
|---|---|
| `multer` | Multipart form parsing, memory storage, 10 MB size limit |
| `pdf-parse` | PDF text extraction + page screenshot rendering |
| `mammoth` | DOCX → plain text conversion |
| `xlsx` | XLSX/XLS → CSV per sheet |
| `adm-zip` | PPTX ZIP extraction for slide XML parsing |

All processing is done in-memory — no temporary files are written to disk.

---

## Key Constants

| Constant | Location | Value | Purpose |
|---|---|---|---|
| `MAX_CONTEXT_CHARS` | `server/index.js` | 50,000 | Truncate file content sent to LLM |
| `LARGE_TEXT_THRESHOLD` | `ChatPage.jsx` | 15,000 chars | Auto-convert pastes to `.txt` files |
| `fileSize` limit | `multer` config | 10 MB | Maximum upload size |
| Input maxLength | `<textarea>` | 10,000 chars | Max user text input length |

---

## Common Gotchas

- **System prompt is omitted when images are attached** on some NVIDIA vision models. See `server/index.js:904-906` (`!hasMultimodalContent` conditional).
- **`VITE_API_URL` in `.env.example` points to port 3001** (the scaffold server, not the live server). The actual upload endpoint is on port 5000 via the Vite proxy — `fetch('/api/upload')` resolves through `vite.config.js`'s proxy to `localhost:5000`.
- **Supabase auth is client-side only.** The server has its own optional auth layer (routes in `server/index.js:39-43`), but file upload at `/api/upload` is unauthenticated — anyone who can reach the endpoint can upload.
- **No image resizing or optimization.** Uploaded images are sent to the LLM at full resolution (as base64). Very large images may hit context window limits or cause slow uploads.
