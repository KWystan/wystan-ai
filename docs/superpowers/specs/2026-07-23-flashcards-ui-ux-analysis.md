# Flashcards UI/UX & Logic Analysis

**Date:** 2026-07-23
**Scope:** `/learn/flashcards` page — UX, flow, generation logic, and prompt design
**Status:** Brainstorm / suggestions — no implementation yet
**Files reviewed:** `client/src/components/FlashcardsPage.jsx`, `server/routes/study.js`, `client/src/hooks/useQuiz.js`, `client/src/components/LearnPage.jsx`

---

## 1. What the current flow actually is

The Flashcards tool is a **two-flat-pages** UI with no in-between. There is one input screen and one results screen, with a hard transition between them.

### 1.1 Input screen (`FlashcardsPage.jsx:249-404`)

- A mode tab: **Type / Paste** vs **Upload Material**
- A textarea (text mode) or drag-and-drop dropzone (upload mode)
- A single "Generate Flashcards" button
- A loading skeleton (3 blinking dots + placeholder card)
- An error banner

That is everything. **No count slider, no difficulty, no card-type selector, no orientation control, no per-deck options.** The only thing the user can change is the source text.

### 1.2 Results screen (`FlashcardsPage.jsx:405-473`)

- A single `FlipCard` (lines 7-43) with 3D flip animation
- A counter: `Card 3 / 10`
- Prev / Next buttons + a progress line
- A **Shuffle** button (deterministic — see bug #2)
- A **New** button (returns to input)
- Keyboard shortcuts: `←/→`, `Space`, `F`

No edit, no rate, no save, no overview, no spaced repetition, no progress strip. After the last card, the user is dropped back at the start of the same deck with no record of what they knew.

### 1.3 What is already good (don't waste it)

- The 3D flip with `backfaceVisibility: hidden` is genuinely nice.
- Keyboard shortcuts are properly wired and `preventDefault` is called (lines 92-106).
- The upload pipeline is real — PDF, DOCX, TXT, PPTX, XLSX all extract text server-side, and the client shows a **2 KB preview** of the extracted text (lines 313-317). That preview is a feature; it lets the user verify the upload worked before generating.
- The `fade-up` keyframe + blinking-dot skeleton gives the generation step a sense of progress (lines 392-402).
- Server-side retry + multi-strategy JSON extraction in `study.js:215-217` is robust.

---

## 2. Bugs & friction points

### Bug 1 — Mojibake on the upload preview (line 320)

```jsx
{(uploadedContent.length / 1024).toFixed(0)} KB extracted � click Generate below.
```

The `�` is a corrupted bullet character. Caused by a Windows cp1252 → UTF-8 round-trip somewhere in the source. Visible to users, looks unprofessional. One-character fix to `•`.

### Bug 2 — Deterministic shuffle is broken (lines 64-75)

```js
for (let i = arr.length - 1; i > 0; i--) {
  const j = (seed * (i + 1) + i) % (i + 1);
  [arr[i], arr[j]] = [arr[j], arr[i]];
}
```

The modulo base is `i + 1`, so `j` is in `[0, i]`. But `seed * (i + 1) + i` mod `(i + 1)` collapses to `i` for any seed that is a multiple of `(i+1)`, and biases strongly toward the high end. In practice the first card barely moves. This is a *real* shuffle bug, not a nit. Replace with a proper LCG (`(seed * 9301 + 49297) % 233280` then scale) or use `crypto.getRandomValues()`.

### Bug 3 — Text and upload clobber each other silently (lines 171-172, 286-289)

When the user uploads a file, the code sets `text = data.content` (line 172). Then if the user clicks in the textarea and types a character, `onChange` calls `handleRemoveFile()` (line 288) and **silently deletes the upload**. No confirmation, no warning. The user's file vanishes, the text area now contains a mix of the old extracted text + the new keystroke. Two inputs that look independent are actually racing.

**Fix:** treat text and upload as separate sources, with a single "source text" derived value used at generate time. Don't sync them.

### Bug 4 — No recovery for malformed AI output

`server/routes/study.js:220-222` logs the raw AI reply to the server console when JSON parsing fails, but the client gets a generic message: *"The AI response was in an unexpected format. Try again or adjust the text."* The user has no signal about *what* to adjust. Show a "Re-try with adjusted prompt" affordance, or surface a "Show raw response (for debugging)" toggle.

### Bug 5 — One bad card forces a full re-roll

There is no "regenerate this card only." If 9 of 10 cards are great and 1 is nonsense, the user has to regenerate the entire deck and hope. This is a small, high-leverage feature.

### Bug 6 — No way to edit a card

AI wrote *"What is photosynthesis?"* when the user wanted *"Photosynthesis"* as the front (vocab deck). User cannot fix it without starting over. Inline edit per card is a 1-day win that removes most "the AI got it wrong" frustration.

### Bug 7 — No persistence

Once the user navigates away, the deck is gone. There is no `flashcard_decks` table — only `conversations` (chat rows) and `projects`. For a *study* tool, this is a glaring gap. Decks should save to the user's account, appear in the sidebar, and resume on reload.

### Bug 8 — Empty / very short input is a silent quality risk

Paste the single word *"Photosynthesis"* and the AI gets almost no signal. The system prompt is generic; the LLM has to guess what to extract. The result is wildly inconsistent. A **minimum-content guard** with a friendlier message ("Paste at least a paragraph or upload a file — single words are too sparse to generate good cards") would help, or a one-click "Expand this topic" button that sends a follow-up prompt to the LLM.

### Bug 9 — `maxLength={50000}` on the textarea but no server-side truncation for flashcards

`study.js:253` truncates the **quiz** endpoint to 15K chars. The **flashcard** endpoint has no truncation. So a 49 KB paste goes through whole, hits the upstream LLM, costs more tokens, and returns a slow response. Mirror the quiz behavior: truncate to 15K with a friendly note.

### Bug 10 — "Tap to reveal answer" hint is the wrong word on desktop (line 29)

The hint is *"Tap to reveal answer"* — but the primary interaction on desktop is a *click*. A user on a laptop sees "tap" and momentarily wonders if they need to touch the screen. On touch devices the hint is correct. Detect input type or use a neutral *"Click to reveal answer"*.

### Friction 11 — Self-rating / spaced repetition is missing entirely

This is not a bug — it's a missing feature. The user can flip through all 10 cards and the only feedback they get is "you saw them." Compare to the sibling tool **Quiz** (`useQuiz.js`), which has full answer logging, a score, and a retry. Flashcards is dramatically underbuilt by comparison.

### Friction 12 — Card-type vocabulary is hardcoded

Lines 27, 36: front is `help_outline` with "Tap to reveal answer," back is `lightbulb` with the answer. The labels say "Question" and "Answer" — even though the user's PDF might say "Term / Definition," "Word / Meaning," or "Front / Back." This is the **#1 thing the user flagged** and the most important problem to solve.

---

## 3. Three directions to push the tool forward

The user asked for customization (front/back orientation, schema flexibility), a smoother flow, and prompt alignment with the source PDF. Here are three ways to get there, in order of effort.

### Direction A — "Study-Grade Flashcards" *(recommended)*

The big bet. Treat flashcards as a real study tool, not a slideshow. Add what every flashcard app since Anki has.

**Customization (the user's primary ask):**
- **Card-type presets** the user picks *before* generation:
  - `Term ↔ Definition` (default)
  - `Question ↔ Answer`
  - `Cloze (fill-in-the-blank)` — front has a blank, back has the missing word
  - `True / False` — front is a statement, back is T/F
  - `Concept ↔ Example`
  - `Language: Word ↔ Translation`
  - `Date ↔ Event`
- **Front/Back orientation toggle** (the "or the other way around" the user requested):
  - For term/definition: `front = term` (default) or `front = definition`
  - For Q/A: `front = question` (default) or `front = answer`
  - Affects the **prompt sent to the LLM**, not just the display — so the AI is told the orientation from the start
- **Per-card edit** — click a card to open an inline edit modal; the user fixes what the LLM got wrong without regenerating the deck
- **Per-card re-roll** — "regenerate just this one"
- **Self-rating** (Again / Hard / Good / Easy) on each card → weak-card replay filter at the end

**Flow & look improvements:**
- A thin progress strip above the card
- Animate the *new* card sliding in when navigating (currently the same `<FlipCard>` rerenders with new content, which feels like a jarring snap)
- Disable-with-fade on prev/next at the deck boundaries
- Real shuffle (with `crypto.getRandomValues` or a proper LCG)
- Save & resume via Supabase — new `flashcard_decks` table or extend `conversations` with a `kind: 'flashcards'` discriminator

**Biggest, most coherent move. ~4 days of work end-to-end.**

### Direction B — "Magic Card-Pull"

Smaller, but flashy. Keep the two-page flow but make generation much smarter.

- A single textbox that takes anything: a topic, a paste, a URL, an uploaded file
- The LLM extracts concepts **and** decides the best card type for each one (term, definition, cloze, example). User gets a mixed deck that's already varied
- A 3-tier **difficulty slider**: Recap → Review → Master. Each one tightens the prompt:
  - *Recap*: surface every key term
  - *Review*: balanced recall + understanding
  - *Master*: synthesis questions requiring applying two concepts together
- A **card count slider**: 5 / 10 / 15 / 20
- A **deck-overview mode**: a small scrollable list of all cards next to the focused one. Click any card to jump to it
- One-click **re-roll this card**
- **Smart front/back labels** based on what the AI detected: vocab list → icon `abc` + label "Term", dates → icon `event` + label "Date", generic → icon `help_outline` + label "Question"

Less work than A. Best if you want a quick, visible win.

### Direction C — "PDF-Form-Aware"

The most surgical fix to the user's explicit problem: *"have a prompt that will almost follow the wording seen on the PDF so that user will not confuse."*

- Before generating, **detect the structure** of the input. Heuristics on the first 2 KB (regex for "term: definition" patterns, headers, Q/A lines) + a quick LLM call: *"Describe the structure of this material in one sentence."*
- **Match the card type to the structure**: vocab list → Term/Definition, chapter → Concept/Explanation, Q&A list → mirror the existing Q/A pairs **verbatim**
- An optional **"Card scheme" dropdown** in the config:
  - `Auto-detect` (default)
  - `Term → Definition`
  - `Question → Answer`
  - `Cloze deletion`
  - `Custom prompt…` (textbox where the user types the exact instruction, e.g. *"Front: the disease name. Back: symptoms and treatment."*)
- A **"Use the PDF's own words" toggle** — when on, the prompt is *"Do not rephrase — extract pairs exactly as written in the source."*

**This is the path to take if "matching the PDF's wording" is the actual problem, not just one of many.**

---

## 4. The prompt rewrite (universal)

The current `FLASHCARD_SYSTEM_PROMPT` in `server/routes/study.js:21-33` is generic. Whatever direction is chosen, the prompt needs to match. This rewrite solves the wording problem **and** supports custom front/back orientation.

```
You are a study-materials formatter. You turn raw notes into flashcards
that look like the source — not like a textbook rewrite.

INPUT: a topic, paragraph, or document the user is studying.
OUTPUT: a JSON array of flashcards. ONLY the array. No prose, no fences.

Each card is { "front": "...", "back": "..." }.

Hard rules:
- Mirror the source's vocabulary. If the PDF says "Mitochondria",
  do not write "cellular organelles."
- Front and back are SHORT (front ≤ 12 words, back ≤ 30 words).
  One fact per card. Never two facts glued together.
- If the source is a list (term: definition, Q: A, Word: Meaning),
  keep that exact structure on the card.
- 5–12 cards depending on material density. Don't pad.
- Never invent facts. If the source is thin, say so with fewer cards.

Card style:    ${CARD_STYLE}      ← "term-definition" | "question-answer"
                                       "cloze" | "concept-example" | "auto"
Orientation:   ${ORIENTATION}    ← "front-is-term" | "front-is-definition"
                                       "auto"
Difficulty:    ${DIFFICULTY}     ← "recap" | "review" | "master"
Count:         ${COUNT}          ← integer 5–20
```

The `CARD_STYLE` and `ORIENTATION` slots are filled by the new config UI. The AI's job is to obey *your* schema, not invent one. This is why the cards start matching the PDF — the model is told the *form* of the answer, not just "make flashcards."

For the orientation toggle specifically: a vocab deck where the user wants "front = term, back = definition" sends `front-is-term`. The model still has to decide what counts as the term — but now it is not confused about which side is which.

---

## 5. Recommended implementation order

If greenlit, ship in small, independently-valuable chunks:

| # | What | Effort | Visible value |
|---|---|---|---|
| 1 | Fix the mojibake (`•`) + the broken shuffle | ~15 min | Quality bump |
| 2 | Add the prompt rewrite + a **config panel** (count, difficulty, card style, orientation) above the Generate button | ~1 day | Big perceived improvement |
| 3 | Add the **swap front/back** button + **per-card edit** + **re-roll-one** in the deck view | ~1 day | Solves 90% of "the AI got it wrong" |
| 4 | **Persist decks** to Supabase with a new `flashcard_decks` table (or extend `conversations` with a `kind` column). Save/load/list in sidebar | ~1 day | Decks survive reload |
| 5 | **Self-rating + weak-card replay** | ~0.5 day | Now it is a real study tool |

**Total: ~4 days for a meaningfully better Flashcards experience, and every step is independently shippable.**

---

## 6. Recommendation

**Go Direction A. Ship steps 1-3 in v1, 4-5 in v2.**

The user gets the customization they asked for (card style, orientation, edit, swap, re-roll), the prompt alignment with the PDF, and the smoother flow — without the larger commitment of persistence and spaced repetition. If users love it (and they will, because right now there is nothing to love), ship 4-5 as v2.

---

## 7. Open questions for the user

Before any implementation begins:

1. **Which direction (A / B / C) is the right bet?** Or a mix?
2. **Card-type preset list** — is the 7-item list above right? Should `Cloze` and `True/False` be in v1 or v2?
3. **Orientation toggle** — should it be a config option *before* generation, or also a button *during* the deck (so the user can flip a whole deck at once)? Or both?
4. **Persistence** — new `flashcard_decks` table, or extend the `conversations` table with a `kind` discriminator? The latter is less migration; the former is cleaner long-term.
5. **Should the existing keyboard shortcuts be kept?** They are good, but if a per-card editor opens, the `Space` key conflicts with both the editor's space and the flip. Needs a small refactor.
