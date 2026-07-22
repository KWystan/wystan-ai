# Wystan AI Ã¢â‚¬â€ Complete Design System & Architecture Document

> **Document Version:** 1.1 | **Last Updated:** 2026-07-22 | **Author:** Karl Wystan Cabalonga | **Status:** Living Document

---

## Table of Contents

1. [Project Vision & Philosophy](#1-project-vision--philosophy)
2. [Design Principles](#2-design-principles)
3. [Visual Design System](#3-visual-design-system)
4. [Typography](#4-typography)
5. [Color System](#5-color-system)
6. [Iconography](#6-iconography)
7. [Motion & Animation](#7-motion--animation)
8. [Layout System](#8-layout-system)
9. [Component Architecture](#9-component-architecture)
10. [Data Flow Architecture](#10-data-flow-architecture)
11. [Route Design](#11-route-design)
12. [API Design](#12-api-design)
13. [Interaction Design](#13-interaction-design)
14. [Responsive Design Strategy](#14-responsive-design-strategy)
15. [Accessibility Considerations](#15-accessibility-considerations)
16. [Performance Design](#16-performance-design)
17. [Deployment Design](#17-deployment-design)
18. [Design Decisions Register](#18-design-decisions-register)
19. [Future Design Directions](#19-future-design-directions)
20. [Learn Page & Flashcard Generator Design](#20-learn-page--flashcard-generator-design)
    - [20.1 Overview](#201-overview)
    - [20.2 User Journey](#202-user-journey)
    - [20.3 Navigation & Entry Point](#203-navigation--entry-point)
    - [20.4 Learn Page](#204-learn-page-learn)
    - [20.5 Flashcards Page](#205-flashcards-page-learnflashcards)
    - [20.6 Backend: POST /api/flashcards & POST /api/quiz](#206-backend-post-apiflashcards--post-apiquiz)
    - [20.7 Design Decisions](#207-design-decisions)
    - [20.8 Complete Tool Grid (30 Tools)](#208-complete-tool-grid-30-tools)
    - [20.9 Sidebar Icon Fix](#209-sidebar-icon-fix)
    - [20.10 Header Border Fix](#2010-header-border-fix)
    - [20.11 Files Changed](#2011-files-changed)
    - [20.1 Overview](#201-overview)
    - [20.2 User Journey](#202-user-journey)
    - [20.3 Navigation & Entry Point](#203-navigation--entry-point)
    - [20.4 Learn Page](#204-learn-page-learn)
    - [20.5 Flashcards Page](#205-flashcards-page-learnflashcards)
    - [20.6 Backend: POST /api/flashcards](#206-backend-post-apiflashcards)
    - [20.7 Design Decisions](#207-design-decisions)
    - [20.8 Future Tools](#208-future-tools)
    - [20.9 Sidebar Icon Fix](#209-sidebar-icon-fix)
    - [20.10 Header Border Fix](#2010-header-border-fix)
    - [20.11 Files Changed](#2011-files-changed)

---

## 1. Project Vision & Philosophy

### Core Identity
Wystan AI is a **personal AI interaction platform** that combines chat, image generation, file analysis, and web search into a unified, minimal interface. It functions as both a portfolio piece demonstrating full-stack capability and a practical daily-use tool.

### Design Philosophy: "Clean paper, compressed, outlined"
Inspired by **Emil Kowalski Design Engineering** Ã¢â‚¬â€ a light, paper-like canvas where content breathes. Every element is purposeful; nothing is decorative without function. Priorities:
- **Reading comfort** Ã¢â‚¬â€ Serif fonts for AI responses, ample line height, generous whitespace
- **Interaction clarity** Ã¢â‚¬â€ Clear affordance without noise
- **Motion minimalism** Ã¢â‚¬â€ Transform/opacity only, under 300ms, custom easing
- **Content-first** Ã¢â‚¬â€ The interface recedes; conversation takes center stage


## 2. Design Principles

### P1: The Interface Should Disappear
Clean backgrounds, minimal borders, subtle separators. The conversation is the hero.

### P2: Motion Must Feel Intentional
Every animation serves a purpose: reveal, confirm, transition. Never animate for spectacle. Custom `--ease-out-expo` cubic-bezier for natural motion.

### P3: One Source of Truth
No duplicate state. Portfolio data in one file (`portfolioData.js`), API routes in one server (`server/index.js`), tokens in one auth module (`auth.js`).

### P4: Graceful Degradation
Supabase unavailable? Chat still works (ephemeral). Model fails? Switch models. Upload fails? Error shown but app doesn't crash. Every feature has a fallback.

### P5: Touch-Friendly by Default
Mobile: 44x44px minimum hit targets. Sidebar becomes slide-over overlay. Input bar always visible. Hover effects gated to hover-capable devices.

### P6: Content Truncation is a Feature
Files truncated at 50K chars. Chat history truncated to last 20 messages. Pastes over 15K chars auto-convert to files. The AI needs enough context Ã¢â‚¬â€ not everything.

---

## 3. Visual Design System

### 3.1 Overall Aesthetic
- **Background:** White (#ffffff)
- **Text:** Black (#000000)
- **Texture:** Subtle paper grain (dual SVG turbulence overlays)
- **Borders:** Thin 1px (opacity 8-15%)
- **Corners:** Rounded 8-16px (rounded-lg to rounded-2xl)
- **Shadows:** None on surfaces Ã¢â‚¬â€ only on elevated elements (modals, dropdowns)

### 3.2 Paper Texture
Two layered SVG turbulence filters via `body::before` / `body::after`:
- **Layer 1:** `baseFrequency: 0.65`, `numOctaves: 5`, `opacity: 0.28`, `mix-blend-mode: multiply`
- **Layer 2:** `baseFrequency: 1.8`, `numOctaves: 3`, `opacity: 0.08`, `mix-blend-mode: multiply`
Creates subtle, tactile paper grain adding warmth to the flat UI.

### 3.3 Border Token System
| Token | Value | Usage |
|-------|-------|-------|
| `border-black/8` | rgba(0,0,0,0.08) | Default separators, card borders |
| `border-black/10` | rgba(0,0,0,0.10) | Input borders, subtle containers |
| `border-black/15` | rgba(0,0,0,0.15) | Tables, prominent dividers |
| `border-black/25` | rgba(0,0,0,0.25) | Focus states, hover borders |

### 3.4 Surface System
| Surface | Background | Usage |
|---------|-----------|-------|
| Page | #ffffff | Main canvas |
| Card | #ffffff + border | File previews, code blocks |
| Elevated | #ffffff + border + shadow | Modals, dropdowns |
| Input | #ffffff + border | Textareas, selects |
| Code block | #f8f8f8 | Code panels |
| Canvas | #fafafa | Image generation viewport |
| Overlay | rgba(0,0,0,0.70) | Lightbox, modal backdrops |


---

## 4. Typography

### 4.1 Font Stack
| Family | Role | Source |
|--------|------|--------|
| **Geist** | Primary UI sans-serif | Self-hosted WOFF2 (variable 100-900) |
| **Geist Mono** | Code monospace | Self-hosted WOFF2 (variable 100-900) |
| **Geist Pixel** | Display/headlines (mono pixel) | Self-hosted WOFF2 (weight 400) |
| **Source Serif 4** | AI response body serif | npm @fontsource (400, 600, 700 + italics) |

### 4.2 Font Loading Strategy
- **Geist family:** Self-hosted as WOFF2 in `client/public/fonts/` Ã¢â‚¬â€ zero external requests
- **Source Serif 4:** Bundled via npm Ã¢â‚¬â€ no FOUT/FOIT
- **Material Symbols:** Google Fonts CDN Ã¢â‚¬â€ only external font dependency

### 4.3 Type Scale
| Token | Size | Weight | Family | Usage |
|-------|------|--------|--------|-------|
| `text-[9px]` | 9px | 400 Geist | Footer note |
| `text-[10px]` | 10px | 500 Geist | Timestamps, labels, badges |
| `text-[11px]` | 11px | 400/500 Geist | File details, sidebar items |
| `text-xs` (12px) | 12px | 400/500 Geist | Secondary text, table headers |
| `text-[13px]` | 13px | 400 Geist Mono | Code blocks, inline code |
| **`text-sm` (14px)** | **14px** | **400 Geist** | **Body text, chat messages** |
| `text-base` (16px) | 16px | 600 Geist | Subheadings |
| `text-lg` (18px) | 18px | 700 Geist | Section headings |
| `text-xl` (20px) | 20px | 700 Geist Pixel | Page titles |
| `text-2xl` (24px) | 24px | 700 Geist Pixel | Project headings |
| `text-3xl` (30px) | 30px | 600 Geist | Home page title |

### 4.4 Serif Body (AI Messages)
AI responses use **Source Serif 4** at 14px Ã¢â‚¬â€ signals readable AI-generated content and contrasts with sans-serif chrome. Line-height: ~1.5, paragraph spacing: ~2px, max-width: 75% of container.

### 4.5 Code Typography
All code uses **Geist Mono** at 13px. Inline: `bg-black/5`, `border-black/8`, `px-1.5 py-0.5`, `whitespace-nowrap`. Blocks: `#f8f8f8` background, header bar with language label + copy button.

---

## 5. Color System

### 5.1 Core Palette (Monochromatic)
| Token | Value | Role |
|-------|-------|------|
| `black` | #000000 | Primary text, icons, interactive |
| `white` | #ffffff | Page background, card surfaces |
| `black/8` | rgba(0,0,0,0.08) | Subtle borders |
| `black/10` | rgba(0,0,0,0.10) | Input borders |
| `black/15` | rgba(0,0,0,0.15) | Table borders |
| `black/25` | rgba(0,0,0,0.25) | Focus rings, disabled opacity |
| `black/35` | rgba(0,0,0,0.35) | Placeholder text |
| `black/50` | rgba(0,0,0,0.50) | Dimmed UI text |
| `black/60` | rgba(0,0,0,0.60) | Secondary text |
| `black/5` | rgba(0,0,0,0.05) | Subtle hover, selected state |

### 5.2 Semantic Colors (Functional Only)
| Token | Usage |
|-------|-------|
| `red-50/200/600` | Error banners and delete actions |
| `amber-50/200/700` | Content policy warnings |
| `emerald-50/200/600` | Success messages |
| `blue-50/200/600` | Info banners and links |

### 5.3 Dark Mode
**Not implemented.** The paper-texture aesthetic is inherently light-themed. Dark mode would require rethinking the entire visual language.


---

## 6. Iconography

### 6.1 Primary: Material Symbols Outlined
Rendered as `<span className="material-symbols-outlined">icon_name</span>`. Configured with `font-variation-settings: "wght" 280, "opsz" 20` Ã¢â‚¬â€ thinner and smaller than defaults for an elegant UI appearance.

### 6.2 Icon Library (30+ icons)
`add`, `arrow_back`, `arrow_upward`, `attach_file`, `auto_awesome`, `chat`, `check`, `chevron_left/right`, `close`, `code`, `content_copy`, `delete`, `description`, `download`, `edit`, `error`, `expand_more/less`, `folder`, `forum`, `history`, `image`, `mail`, `more_horiz`, `person`, `picture_as_pdf`, `progress_activity`, `search`, `settings`, `slideshow`, `table_chart`, `travel_explore`, `visibility_off`, `warning`, `work_history`.

### 6.3 SVG Inline Icons (5 instances)
- Hamburger menu, download overlay, Google logo, project folder icon, generate icon.

---

## 7. Motion & Animation

### 7.1 Constraints
- **Only transform + opacity** Ã¢â‚¬â€ never width, height, margin, color, or box-shadow
- **Duration:** 150-300ms (interactive), up to 700ms (entrance reveals)
- **Easing:** Custom cubic-bezier curves
- **`prefers-reduced-motion`** respected Ã¢â‚¬â€ all animations collapse to 0.01ms

### 7.2 Custom Eases (Tailwind @theme)
| Token | Curve | Usage |
|-------|-------|-------|
| `--ease-out-expo` | cubic-bezier(0.16, 1, 0.3, 1) | Primary Ã¢â‚¬â€ fast start, slow finish |
| `--ease-in-out-expo` | cubic-bezier(0.65, 0, 0.35, 1) | Float/continuous motion |
| `--ease-spring` | cubic-bezier(0.34, 1.56, 0.64, 1) | Rare playful bounce |

### 7.3 Keyframe Animations
- `fade-up`: opacity 0Ã¢â€ â€™1 + translateY(10pxÃ¢â€ â€™0) Ã¢â‚¬â€ entrance reveals
- `scale-in`: opacity 0Ã¢â€ â€™1 + scale(0.95Ã¢â€ â€™1) Ã¢â‚¬â€ modals, dropdowns
- `float`: translateY(0Ã¢â€ â€™-5px) loop Ã¢â‚¬â€ continuous subtle motion
- `blink`: opacity toggle Ã¢â‚¬â€ loading dots

### 7.4 Animation Usage Map
| Component | Animation | Duration | Trigger |
|-----------|-----------|----------|---------|
| Message bubbles | fade-up | 200ms | On render |
| Page sections | fade-up | 400ms | On mount |
| Modals | scale-in | 150ms | Open |
| Dropdowns | scale-in | 100-150ms | Open |
| Sidebar | transform + opacity | 200ms | Toggle |
| Loading dots | blink | 700ms | Continuous |

### 7.5 Hover Gating
All hover effects use the `hover-gate:` variant Ã¢â‚¬â€ `@media (hover: hover) and (pointer: fine)` Ã¢â‚¬â€ preventing sticky hover states on touch devices.

### 7.6 Active/Press States
Interactive elements use `active:scale-[0.92]` or `active:scale-[0.97]` Ã¢â‚¬â€ subtle "squish" providing tactile feedback. Scale factor varies by element role.

---

## 8. Layout System

### 8.1 Page Hierarchy
```
Ã¢â€Å’Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€Â
Ã¢â€â€š Header Bar (48px) Ã¢â‚¬â€ mobile only            Ã¢â€â€š
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€Â¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€Â¤
Ã¢â€â€š Sidebar Ã¢â€â€š  Main Content (flex-1, scroll)    Ã¢â€â€š
Ã¢â€â€š 244px   Ã¢â€â€š  Ã¢â€Å’Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€Â    Ã¢â€â€š
Ã¢â€â€š fixed   Ã¢â€â€š  Ã¢â€â€š Messages / Chat Stream    Ã¢â€â€š    Ã¢â€â€š
Ã¢â€â€š scroll  Ã¢â€â€š  Ã¢â€â€š                          Ã¢â€â€š    Ã¢â€â€š
Ã¢â€â€š         Ã¢â€â€š  Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€Ëœ    Ã¢â€â€š
Ã¢â€â€š         Ã¢â€â€š  Ã¢â€Å’Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€Â    Ã¢â€â€š
Ã¢â€â€š         Ã¢â€â€š  Ã¢â€â€š Input Bar (sticky footer) Ã¢â€â€š    Ã¢â€â€š
Ã¢â€â€š         Ã¢â€â€š  Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€Ëœ    Ã¢â€â€š
Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€Â´Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€Ëœ
```

### 8.2 Sidebar (244px)
Desktop: fixed left, full height, scrollable. Mobile: slide-over overlay with backdrop. Logged-out: centered Sign In CTA. Logged-in: Projects, Recent conversations, user profile.

### 8.3 Chat Page Layout
Welcome screen: centered logo + suggestions + model selector. Conversation view: messages fill area, input fixed at bottom. Input: auto-resizing textarea (up to 300px) with attachment/mode/send controls.

### 8.4 Generate Page Layout
Desktop split: left settings panel (400px) + right canvas. Mobile: single-column stacked.

### 8.5 Responsive Breakpoints
| Breakpoint | Width | Changes |
|-----------|-------|---------|
| Mobile | < 768px | Sidebar off-canvas, stacked layouts |
| md | >= 768px | Wider content |
| lg | >= 1024px | Sidebar fixed, split layouts |


---

## 9. Component Architecture

### 9.1 Component Tree
```
<App>
  <BrowserRouter>
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<ChatPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/chat/:conversationId" element={<ChatPage />} />
        <Route path="/project/:id" element={<ProjectPage />} />
        <Route path="/generate" element={<GeneratePage />} />
      </Routes>
    </Suspense>
  </BrowserRouter>
</App>
```

### 9.2 ChatPage (~1800 lines)
Main chat interface. State: messages[], input, isLoading, attachedFiles[], selectedModel, user, authOpen, sidebarOpen, lightboxUrl, previewFile, uploadProgress, activeMode. Contains FilePreviewModal, CodePanel, auth modal, image lightbox.

### 9.3 Sidebar (~720 lines)
Navigation. State: conversations[], projects[], expandedProjects, kebabOpenId, userMenuOpen. Contains KebabMenu (rename/move/delete), ProjectKebab, user dropdown.

### 9.4 ProjectPage (~850 lines)
Project detail at /project/:id. Full chat inline + conversation list. State: project, conversations[], messages[], input, currentConversationId, attachedFiles[], generatedImage.

### 9.5 GeneratePage (~200 lines)
Image generation form. State: prompt, width, height, steps, batchSize, images[], inspirationFile, analyzing, error. Features inspiration analysis via MiniMax M3.

### 9.6 Shared Patterns
- **Loading:** three animated dots, "Loading..." text, progress bars
- **Empty states:** "No conversations yet", "Your generated images will appear here"
- **Error states:** red/amber banners with icon + message

---

## 10. Data Flow Architecture

### 10.1 Chat Message Flow
1. User types Ã¢â€ â€™ Input state update
2. /search mode? Ã¢â€ â€™ POST /api/search Ã¢â€ â€™ Append results to prompt
3. /generate mode? Ã¢â€ â€™ POST /api/generate Ã¢â€ â€™ Display image inline
4. Normal mode: Build user content + API content
5. Add user message to state, create assistant placeholder
6. POST /api/chat-full Ã¢â€ â€™ SSE stream
7. Read stream via ReadableStream Ã¢â€ â€™ Update assistant message in real-time
8. Stream complete Ã¢â€ â€™ Save to Supabase (if logged in)

### 10.2 File Upload Flow
1. File selected/dropped/pasted
2. Pre-check: size > 10MB? Ã¢â€ â€™ Error
3. FormData Ã¢â€ â€™ POST /api/upload (sequential per file)
4. Response: { filename, group, content, data, pages, language }
5. Push to attachedFiles[] state
6. On send: buildUserContent (display) + buildApiContent (LLM payload)

### 10.3 Supabase Data Model
- **projects:** id, user_id, name, created_at, updated_at
- **conversations:** id, user_id, project_id (FK Ã¢â€ â€™ SET NULL), title, created_at, updated_at
- **messages:** id, conversation_id (FK Ã¢â€ â€™ CASCADE), role, content (JSONB), created_at

### 10.4 State Management
No external library. Pure React hooks: useState (UI), useEffect (side effects), useCallback (memoized handlers), useRef (DOM refs), useParams (route params). Auth tokens in localStorage. Image cache in-memory Map (30-min TTL).

---

## 11. Route Design

| Path | Component | Auth | Description |
|------|-----------|------|-------------|
| `/` | ChatPage | Optional | Landing Ã¢â‚¬â€ chat interface |
| `/chat` | ChatPage | Optional | Explicit chat route |
| `/chat/:conversationId` | ChatPage | Required | Load saved conversation |
| `/project/:id` | ProjectPage | Required | Project detail with conversations |
| `/generate` | GeneratePage | Optional | Image generation tool |
| `/learn` | LearnPage | Optional | Learning tools hub (Flashcards, etc.) |
| `/learn/flashcards` | FlashcardsPage | Optional | AI-powered flashcard generator |


---

## 12. API Design

### 12.1 Chat Endpoints
**POST /api/chat** (Legacy, non-streaming): `{ messages }` Ã¢â€ â€™ `{ reply }`. Model: `meta/llama-4-maverick-17b-128e-instruct`. Context: last 12 messages. System prompt from file.

**POST /api/chat-full** (Streaming, primary): `{ messages, model }` Ã¢â€ â€™ SSE stream (`data: {content}` / `[DONE]`). Model routing: `org/name` Ã¢â€ â€™ NVIDIA, simple name Ã¢â€ â€™ OpenCode. Context: last 20 messages. System prompt inline (omitted for multimodal). Max tokens: 2048. Temp: 0.7.

### 12.2 File Upload
**POST /api/upload**: `multipart/form-data` with field `file`. Multer: memory storage, 10MB limit. Returns: `{ filename, mimetype, size, type, group, language, content, data?, pages? }`.

### 12.3 Image Generation
**POST /api/generate**: `{ prompt, width, height, seed, steps }` Ã¢â€ â€™ NVIDIA Flux 2 response. Dimensions clamped to 1024. Content filtering for NSFW.

### 12.4 Web Search
**POST /api/search**: `{ query }` Ã¢â€ â€™ Tavily results (5 max + answer). 5-min TTL cache.

### 12.5 Auth Endpoints
| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| /api/auth/signup | POST | None | Register |
| /api/auth/signin | POST | None | Login |
| /api/auth/signout | POST | Bearer | Revoke session |
| /api/auth/me | GET | Bearer | Current user |
| /api/auth/oauth | POST | None | Initiate OAuth |
| /api/auth/oauth/callback | GET | None | OAuth callback |

### 12.6 Data Endpoints (CRUD)
- `/api/conversations` Ã¢â‚¬â€ GET (list), POST (create)
- `/api/conversations/:id` Ã¢â‚¬â€ PUT (update), DELETE
- `/api/conversations/:id/messages` Ã¢â‚¬â€ GET (list), POST (save)
- `/api/projects` Ã¢â‚¬â€ GET (list), POST (create)
- `/api/projects/:id` Ã¢â‚¬â€ GET (detail + conversations), PUT (update), DELETE

---

## 13. Interaction Design

### 13.1 Chat Interactions
- **Enter** sends; **Shift+Enter** newline
- **10K char limit** with counter at 8K+ (amber) and 9.5K+ (red)
- **Empty input + files** is valid Ã¢â‚¬â€ sends files without text
- **User messages:** right-aligned, black bg, white text, rounded-2xl
- **Assistant messages:** left-aligned, serif, generous padding
- **Code blocks:** header bar with language + copy, light gray background
- **Images in messages:** clickable Ã¢â€ â€™ lightbox

### 13.2 File Interactions
Three attachment methods: file picker (`+` Ã¢â€ â€™ "Attach file"), drag-and-drop (overlay appears), large paste (>= 15K chars Ã¢â€ â€™ auto .txt). Sequential uploads with progress bar. File chips removable above input. Preview via FilePreviewModal (images full-size, PDFs paginated, code/text monospace).

### 13.3 Image Generation Interactions
Form with prompt (1K chars), params (width/height/steps/batch), inspiration upload (style analysis via MiniMax M3). Generation progress with bar. Results in grid with download. Recent thumbnail strip.

### 13.4 Sidebar Interactions
New Chat Ã¢â€ â€™ clears conversation. Generate Ã¢â€ â€™ /generate. Project click Ã¢â€ â€™ /project/:id. Conversation click Ã¢â€ â€™ /chat/:id. Project CRUD from kebab menu. Conversation rename/move/delete from kebab. User menu: profile, settings (placeholder), sign out.

### 13.5 Auth Interactions
Modal with login/register toggle. Google OAuth (PKCE via Supabase) or email/password. OAuth returns with tokens in URL hash Ã¢â€ â€™ parsed and stored in localStorage.


---

## 14. Responsive Design Strategy

**Mobile (< 768px):** Sidebar off-canvas (hamburger), fixed header (48px), full-width messages (max 85%), input always visible, single-column layouts.

**Desktop (>= 1024px):** Sidebar fixed (244px), no mobile header, content fills remaining width, split layouts for generate page (settings 400px + canvas).

---

## 15. Accessibility

### Strengths
- Focus states on all interactive elements
- ARIA labels on icon buttons
- `prefers-reduced-motion` respected globally
- Semantic HTML (h1-h3, nav, main, header, footer)
- Alt text on images
- Keyboard navigation (Enter to send, Escape to close)

### Gaps
- No skip-to-content link
- No focus trap in modals
- `text-black/35` placeholders may lack 4.5:1 contrast
- No screen reader announcements for dynamic content
- No focus management when modals open
- Some touch targets < 44x44px
- No `role` attributes on custom interactive elements (kebab menus)

---

## 16. Performance Design

### Build Optimizations
- Manual Rollup chunks (React, markdown, Supabase)
- `React.lazy()` for all route components
- Self-hosted WOFF2 fonts, npm-bundled Source Serif 4
- Tailwind v4 JIT (only generated classes)
- No bundle analyzer configured

### Runtime
- SSE buffer-based parsing (no memory accumulation)
- 30-min in-memory image cache avoids redundant API calls
- Server 30s TTL on conversations, 5-min on search
- 50K char limit prevents oversized LLM context
- Canvas noise loop at 1024x1024 Ã¢â‚¬â€ potential mobile battery drain

---

## 17. Deployment Design (Vercel)

**Build:** `cd client && npm run build` Ã¢â€ â€™ `client/dist/`. Install: both client + server deps.

**Rewrites:** `/api/*` Ã¢â€ â€™ serverless function; `/*` Ã¢â€ â€™ SPA index.html.

**Serverless function:** 256MB memory, 30s timeout, includes `system-prompt.txt`. Cold start includes Express boot (~200-500ms). In-memory caches are per-instance (unreliable).

### Required Environment Variables
| Variable | Purpose |
|----------|---------|
| SUPABASE_URL | Supabase project URL |
| SUPABASE_PUBLISHABLE_KEY | Anon key |
| SUPABASE_SECRET_KEY | Service role key |
| NVIDIA_API_KEY | NVIDIA NIM subscription |
| OPENCODE_API_KEY | OpenCode Zen API key |
| TAVILY_API_KEY | Web search (optional) |
| PORT | Server port (default 5000) |


---

## 18. Design Decisions Register

### D1: Light-Mode Only
**Decision:** White background, black text. No dark mode.
**Why:** Paper-texture aesthetic is inherently light-themed. Dark mode would require rethinking the entire visual language.
**Trade-off:** Excludes dark-mode-preferring users.

### D2: No External State Library
**Decision:** Pure React hooks only (no Redux, Zustand, etc.).
**Why:** State flow is straightforward Ã¢â‚¬â€ component-local UI + server data fetched on mount.
**Trade-off:** Prop drilling in deep component trees (ChatPage Ã¢â€ â€™ Sidebar).

### D3: CommonJS Server, ESM Client
**Decision:** Server uses `require()`, client uses `import`.
**Why:** Server packages (multer, pdf-parse, xlsx) have unreliable ESM support. Vite natively handles ESM.
**Trade-off:** Dual module systems create cognitive overhead.

### D4: Inline File Storage
**Decision:** File content stored as base64 in Supabase messages.content JSONB.
**Why:** No S3 bucket, no file cleanup, no CDN Ã¢â‚¬â€ simpler architecture for a personal tool.
**Trade-off:** Inflated DB row sizes, no direct-URL sharing.

### D5: Sequential File Uploads
**Decision:** Files uploaded one-at-a-time, awaiting each response.
**Why:** Simpler error handling, cleaner progress tracking.
**Trade-off:** Slow for large batches (5x10MB = 50MB sequential transfer).

### D6: No Image Resizing
**Decision:** Uploaded images sent to LLM at full resolution.
**Why:** Vision models benefit from full resolution. Client-side resizing adds complexity.
**Trade-off:** Large images consume significant context window space.

### D7: Model Auto-Switch for Images
**Decision:** Attaching images auto-switches to MiniMax M3 (multimodal).
**Why:** Text-only models can't process images. Transparent switch ensures vision capabilities always available.
**Trade-off:** Overrides explicit user model choice.

---

## 20. Learn Page & Flashcard Generator Design

### 20.1 Overview

The Learn feature adds a dedicated educational tools hub to the application, starting with a Flashcard Generator. This section documents the design decisions, component architecture, and user experience for the Learn page and its tools.

### 20.2 User Journey

```
Sidebar "Learn" -> /learn (tool grid) -> Click "Flashcards" -> /learn/flashcards
                                                          |
                                              Type text or upload file
                                                          |
                                              Click "Generate Flashcards"
                                                          |
                                              Interactive flip-card deck
```

### 20.3 Navigation & Entry Point

**Sidebar Item:**
- Label: "Learn"
- Icon: school (Material Symbols Outlined, text-[13px])
- Target: /learn
- Placement: Immediately after "Generate" link, before the logged-in/logged-out section divider
- Styling: Identical to existing sidebar links

### 20.4 Learn Page (/learn)

**Layout:** Full-page overlay with header bar + scrollable main content (same pattern as GeneratePage and FlashcardsPage).

**Header:**
- Icon: school (text-[20px])
- Title: "Learn" (text-sm font-medium)

**Content:**
- Centered heading: "Learning Tools" + subtitle "Free, AI-powered tools to help you study and learn faster."
- 2-column grid of tool cards, max-width 2xl, centered

**Tool Cards:**

| Card | Status | Badge | Clickable |
|------|--------|-------|-----------|
| Flashcards | Active | Free (green) | Yes -> /learn/flashcards |
| Summarize | Coming Soon | Coming Soon | No |
| Quiz Generator | Coming Soon | Coming Soon | No |
| Mind Maps | Coming Soon | Coming Soon | No |

**Active card design:** Rounded-2xl, border-black/8, white bg, hover:border-black/20, active:scale-[0.98]. Shows arrow_forward icon on hover. fade-up staggered animation (60ms delay per card).

**Disabled card design:** Rounded-2xl, border-black/5, bg-black/[0.02], opacity-50, cursor-not-allowed, no hover/active states.

### 20.5 Flashcards Page (/learn/flashcards)

#### Header
- Back button: Arrow back icon -> /learn
- Icon: memory_alt
- Title: "Flashcards"
- Same header pattern as other pages (bg-white/90 backdrop-blur-md, border-b border-black/8)

#### Input Section

**Mode Tabs:**
- Toggle between "Type / Paste" and "Upload Material"
- Styled as pill-shaped buttons within a rounded-xl bg-black/5 container
- Active tab: white bg, border-black/10, shadow-sm

**Type / Paste Mode:**
- Textarea: 50,000 char limit, 6 rows (min-h-[150px]), resize-y
- Placeholder: "e.g., 'Photosynthesis' or paste a paragraph from your textbook..."
- Character counter: right-aligned, text-[10px], live count
- Styling: rounded-xl, border-black/10, focus:border-black/25, white bg

**Upload Material Mode:**
- Drag-and-drop zone: border-2 border-dashed, rounded-xl, p-8
- Accepted formats: .pdf, .docx, .txt, .pptx, .xlsx, .csv, .tsv, .md
- Visual states: Default (border-black/15, bg-black/[0.02]), Drag-over (border-blue-400, bg-blue-50/50)
- "Choose file" button: black bg, white text, rounded-lg
- Hidden input type="file" triggers OS file picker
- After upload: Shows filename + extracted text preview (first 2K chars in scrollable pre block)
- Remove button (x) clears the uploaded content
- Upload progress: Animated spinner + "Uploading and extracting text..."

**Generate Button:**
- Full width, rounded-xl, black bg, white text, text-sm font-medium
- Disabled (opacity-25): When no content is provided or during generation
- Loading state: Spinner icon + "Generating flashcards..."
- Error state: Red banner (bg-red-50, border-red-200, text-red-600) below button

#### Generation Pipeline

```
User clicks "Generate"
  -> POST /api/flashcards { text: extractedOrTypedText }
  -> Server: non-streaming LLM call (mimo-v2.5-free via OpenCode)
  -> LLM: returns JSON array [{ question, answer }]
  -> Server: validates JSON, filters malformed cards
  -> Response: { cards: [{ question, answer }, ...] }
  -> Frontend: renders interactive flip deck
```

#### Flashcard Deck - Interactive Component

**FlipCard component:**
- 3D card flip using CSS transforms:
  - Container: perspective: 1000px
  - Inner: transform-style: preserve-3d, transition: transform 500ms, will-change: transform
  - Front face: backface-visibility: hidden, rotateY(0deg)
  - Back face: backface-visibility: hidden, rotateY(180deg)
  - Flipped state: inner transforms to rotateY(180deg)
- Dimensions: max-w-lg (max-width 512px), aspect-[3/2]
- Front face: White bg, border-black/10, help_outline icon, question text (text-sm), "Tap to reveal answer"
- Back face: Black bg, white text, lightbulb icon, answer text, "Tap to see question"

**Navigation Controls:**
- Previous/Next buttons: 40x40px, rounded-xl, border-black/10, chevron icons, disabled at boundaries
- Position counter: "Card X / Y" centered between buttons, text-xs font-medium
- Shuffle button: Shuffle icon + label, deterministic seed-based shuffle
- New button: Refresh icon + label, resets to input view
- Keyboard shortcuts: ArrowLeft (previous), ArrowRight (next), Space or F (flip)
- Keyboard hint text: "Use arrow keys to navigate . Space or F to flip"

#### States

| State | UI |
|-------|-----|
| No cards | Input section visible, deck hidden |
| Generating | Button shows spinner, card skeleton (pulsing border + blink dots) appears in deck area |
| Error | Red banner with error message, input remains editable |
| Empty cards response | Error: "We couldn't generate flashcards from that content..." |
| Cards loaded | Deck visible with navigation, "Card X / Y" counter, Shuffle + New buttons |
| First card | Previous button disabled |
| Last card | Next button disabled |
| Card flipped | Back face visible, hint text changes |
| Shuffled | Cards reordered deterministically, returns to card 1 |

### 20.6 Backend: POST /api/flashcards & POST /api/quiz

#### POST /api/flashcards

**Endpoint:** POST /api/flashcards

**Authentication:** None required (works for guests and logged-in users)

**Request Body:**
```json
{ "text": "Study material or topic description..." }
```

**Processing:**
1. Validate text is a non-empty string
2. Truncate to 15,000 characters to limit token usage
3. Construct messages array with system prompt + user prompt
4. Call OpenCode model (mimo-v2.5-free) with stream: false
5. Parse response JSON - attempt direct parse first, fall back to extracting from markdown code fences
6. Filter cards to ensure each has question and answer fields
7. Return validated card array

**Response:**
```json
{
  "cards": [
    { "question": "What is...?", "answer": "It is..." },
    { "question": "How does...?", "answer": "It works by..." }
  ]
}
```

**Error Responses:**

| Status | Condition |
|--------|-----------|
| 400 | Missing or empty text field |
| 502 | AI service API error |
| 422 | Empty response, unparseable JSON, or no valid cards |
| 503 | API key not configured |

**System Prompt (FLASHCARD_SYSTEM_PROMPT):**
You are a flashcard generator. Given study material or a topic, extract the key concepts and generate question-and-answer flashcards.

Rules:
- Return ONLY a valid JSON array - no markdown, no code fences, no other text.
- Each flashcard must have a "question" and an "answer" field.
- Generate between 5 and 10 flashcards.
- Questions should test understanding, not just recall.
- Answers should be concise but complete.
- If the material is very short or vague, generate flashcards that cover the core concepts.
- Use clear, study-friendly language.

#### POST /api/quiz
**Authentication:** None required

**Request Body:**
```json
{
  "text": "Study material...",
  "type": "mixed|multiple|truefalse|fillblank",
  "count": 10,
  "difficulty": "easy|medium|hard"
}
```

**Processing:**
1. Validate text, type, count, and difficulty parameters
2. Truncate to 15,000 characters
3. Construct system prompt with type-specific instructions
4. Call OpenCode model (mimo-v2.5-free) with stream: false
5. Parse response JSON with code-fence fallback
6. Validate each question by type (multiple choice: 4 options + 0-3 index; true/false: boolean; fill-in-blank: string)
7. Return validated question array

**Response:**
```json
{
  "questions": [
    {
      "type": "multiple",
      "question": "What is the capital of France?",
      "options": ["Berlin", "Madrid", "Paris", "Rome"],
      "answer": 2,
      "explanation": "Paris has been the capital since..."
    }
  ]
}
```

### 20.7 Design Decisions

| Decision | Rationale |
|----------|-----------|
| Non-streaming generation | Flashcards are short, structured outputs - no need for streaming. Cheaper and faster. |
| Lightweight model | Uses mimo-v2.5-free (the cheapest available model). Flashcard generation doesn't need a powerful model. |
| No auto-save | Cards exist only in React state. Ephemeral by design - reduces complexity and storage costs. |
| Reuse /api/upload | File extraction for flashcards uses the same pipeline as chat attachments. No duplicate infrastructure. |
| Server-side JSON validation | LLMs can return malformed JSON. Two-parser fallback (direct + code fence extraction) plus field filtering ensures robustness. |
| 15K char truncation | More aggressive than the 50K limit used for file uploads - flashcards need less context, and using less tokens is cheaper. |
| Deterministic shuffle | Seed-based shuffle ensures consistent ordering if the user shuffles multiple times with the same set. |
| 3D flip animation | Uses only transform and will-change - consistent with the app's motion discipline. prefers-reduced-motion disables the animation. |

### 20.8 Complete Tool Grid (30 Tools)

The Learn page now hosts **30 tool cards** in a 2-column responsive grid, following this pattern:
- Active tool: White bg, border, hover effects, "Free" badge, clickable
- Coming Soon: Greyed out (opacity-50, border-black/5, bg-black/[0.02]), not clickable, "Coming Soon" badge

#### Active Tool
| Tool | Route | Status |
|------|-------|--------|
| Flashcards | /learn/flashcards | ✅ Live — AI generates Q&A flashcards from text or uploaded documents |

#### Coming Soon Tools (29)
| Tool | Icon | Description |
|------|------|-------------|
| Chat with PDF | picture_as_pdf | Upload a document and ask questions with citations |
| AI Tutor | school | Adaptive tutoring that adjusts to your knowledge level |
| Essay Grader | rate_review | Score essays on structure, grammar, clarity, and argument strength |
| Math Solver | calculate | Step-by-step solutions with explanations |
| Language Tutor | translate | Practice conversations with grammar corrections |
| Practice Tests | assignment | Simulated timed exams with scoring |
| Flashcard Exporter | file_download | Export decks to Anki, Quizlet, CSV, or PDF |
| Grammar & Style | spellcheck | Fix grammar and improve readability |
| Paraphraser | edit_note | Rewrite text at any level (simple, formal, academic, creative) |
| Code Tutor | code | Explain concepts, review code, generate practice problems |
| Data Analyzer | table_chart | Upload CSV/Excel for AI-generated insights and charts |
| Lab Report Generator | science | Formatted lab reports from experiment data |
| Study Guide | menu_book | Structured guides with key terms and concepts |
| Vocabulary Builder | dictionary | Extract key terms with definitions and memory aids |
| Explain Like I\'m 15 | lightbulb | Simplify complex topics with analogies |
| Comparison Matrix | stacked_bar_chart | Compare theories/concepts side by side |
| Timeline Generator | timeline | Turn text into chronological timelines |
| Essay Outline | article | Structured outlines with thesis and arguments |
| Memory Aids | psychology | Generate mnemonics and acronyms |
| Summarize | summarize | Condense long texts into bullet points |
| Quiz Generator | quiz | Multiple-choice questions from material |
| Mind Maps | account_tree | Visual concept maps from content |
| Writing Prompts | draw | Creative writing prompts by genre/tone |
| Citation Formatter | format_quote | Format citations in APA, MLA, Chicago, IEEE |
| Study Schedule Planner | calendar_month | Day-by-day study plans based on exam date |
| Debate Simulator | forum | AI argues opposing side to sharpen critical thinking |
| Story Generator | auto_stories | Short stories from genre/characters/setting |
| Reading Level Adjuster | text_fields | Rewrite text for specific grade levels |
| Pomodoro Timer | timer | Built-in study timer with AI-suggested breaks |

### 20.9 Sidebar Icon Fix

**Issue:** The "Learn" sidebar icon (cat/fox face SVG) was rendering at a different size than "New chat" and "Generate" due to a viewBox/transform mismatch.

**Original (broken):** 
- `viewBox="0 0 20 20"` with inner `<g transform="scale(0.41667)">` wrapping 48×48 coordinate paths
- Result: icon appeared at ~42% of intended size, misaligned with adjacent text in the sidebar

**Fix:**
- Changed to `viewBox="0 0 48 48"` (matching the path coordinates)
- Removed the outer `<g transform="scale(0.41667)">` wrapper
- Removed the empty `<path d="M0 0h48v48H0z" fill="none" />` placeholder
- Result: icon now renders at full 13×13px, properly aligned with the `w-[13px]` icon wrapper
- All three nav items (New chat, Generate, Learn) now use identical `gap-1.5` spacing and `w-[13px]` icon wrappers for consistent visual alignment

### 20.10 Header Border Fix

**Issue:** The Flashcards page header had a `border-b border-black/8` bottom line, while the Learn page header had none.

**Fix:** Removed the border from the Flashcards page header to match the Learn page style. Both headers now use `bg-white/90 backdrop-blur-md` with no bottom border.
### 20.11 Files Changed

| File | Change |
|------|--------|
| client/src/App.jsx | Added routes for /learn -> LearnPage and /learn/flashcards -> FlashcardsPage |
| client/src/components/LearnPage.jsx | **New** - Tool selector grid page |
| client/src/components/FlashcardsPage.jsx | **New** - Full flashcard generator |
| client/src/components/Sidebar.jsx | Added "Learn" nav link after "Generate" |
| server/index.js | Added POST /api/flashcards endpoint with FLASHCARD_SYSTEM_PROMPT |



## 19. Future Design Directions

### Short-Term (3 months)
- Dark Mode v1 (simplified theme, adjusted texture opacity)
- Message search across all conversations
- Model persistence per conversation
- Streaming cursor animation

### Medium-Term (3-9 months)
- PWA support (service worker for offline access)
- Multi-modal chat history (image thumbnails in conversation list)
- Custom model configuration (temperature, top_p, max_tokens)
- Message branching (fork conversations)
- File management dashboard

### Long-Term (9+ months)
- Plugin system (calculator, weather, news integrations)
- Voice interface (STT input, TTS responses)
- Real-time collaboration (shared conversations)
- Local-first architecture (offline sync engine)
- Custom AI personas (user-created system prompts)

---

*End of Design Document Ã¢â‚¬â€ Living reference. Update as design evolves.*



### 20.12 Upload Error Fix (2026-07-22)

**Issue:** The Flashcards page upload was failing silently when the server returned non-JSON responses or network errors occurred.

**Root Cause:** The `uploadFile` function in FlashcardsPage.jsx had insufficient error handling:
- No client-side file size validation (relied solely on the server's multer 10MB limit)
- `res.json()` parsing failure cascaded to a generic "Upload failed" message without status code context
- No console logging to aid debugging

**Fix:**
- Added client-side file size validation (10MB check before sending)
- Added nested try/catch for JSON parsing with a descriptive error message when the server returns invalid JSON
- Error message now includes HTTP status code when available
- Added `console.error` logging to help diagnose future issues
- Improved error flow: network errors, server errors, and extraction failures each get specific messages

**Before (broken):**
```javascript
if (!res.ok) {
  const err = await res.json().catch(() => ({}));
  throw new Error(err.error || "Upload failed");
}
```

**After (fixed):**
```javascript
let data;
try {
  data = await res.json();
} catch {
  throw new Error("Server returned an invalid response. Check that the API server is running.");
}

if (!res.ok) {
  throw new Error(data.error || `Upload failed (${res.status})`);
}
```

### 20.13 Final UI Tweaks (2026-07-22)

| Change | File | Description |
|--------|------|-------------|
| Removed back button | FlashcardsPage.jsx | Removed the `<Link to="/learn">` arrow_back button from the flashcards page header — navigation is handled via the sidebar |
| Fixed header border | FlashcardsPage.jsx | Header uses `bg-white/90 backdrop-blur-md` with no bottom border, matching the Learn page style |
| Sidebar icon alignment | Sidebar.jsx | Replaced cat/fox face SVG (viewBox 48) with graduation hat SVG (viewBox 24) for consistent sizing with New chat icon |
| Upload error handling | FlashcardsPage.jsx | Added client-side file validation, better JSON error handling, status code in error messages |

### 20.14 Files Changed (Complete List)

| File | Change |
|------|--------|
| client/src/App.jsx | Added routes for /learn -> LearnPage, /learn/flashcards -> FlashcardsPage, /learn/quiz -> QuizPage |
| client/src/components/LearnPage.jsx | **New** — Tool selector grid page with 30 tool cards (1 active, 29 coming soon) |
| client/src/components/FlashcardsPage.jsx | **New** — Full flashcard generator with text/file input, flip-card deck, navigation |
| client/src/components/Sidebar.jsx | Added "Learn" nav link with graduation hat SVG icon |
| server/index.js | Added POST /api/flashcards and POST /api/quiz endpoints |
| client/src/components/QuizPage.jsx | **New** — Quiz generator page (linked from Learn page) |

