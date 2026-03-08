# RC Engine Design Upgrade Backlog

> **Created:** 2026-03-08
> **Source:** Gap analysis of 4 Playbooks.com skills vs RC Engine design capabilities
> **Skills Reviewed:** Anthropic frontend-design, design-critique, Vercel web-design-guidelines, antigravity-kit frontend-design
> **Status:** Backlog — implement incrementally, test after each batch

---

## Shipped (Steps 1-5)

- [ ] Resolve conflicts in existing knowledge files (trends, typography)
- [ ] Add `rc-design-anti-generic.md` (concise blocklist)
- [ ] Add P0-P3 severity to critique + challenger
- [ ] Add 4 scanner rules (with negative matches)
- [ ] Make schema additions optional in `design-types.ts`

---

## Backlog — Grouped by File

### A. `rc-design-anti-generic.md` (NEW — shipped in step 2)

| # | Change | Priority | Source | Status |
|---|--------|----------|--------|--------|
| 1 | AI Default Blocklist — ban bento on simple pages, mesh/aurora gradients, blanket glassmorphism, deep cyan/fintech blue, dark+neon, rounded everything, "Orchestrate/Empower" copy | P0 | Skill #4 | SHIPPED |
| 2 | Variation enforcement — never same font/color/layout across consecutive projects | P0 | Skill #1 | SHIPPED |
| 3 | Bold aesthetic direction forcing — require extreme tone before generating | P0 | Skill #1 | SHIPPED |
| 4 | "What makes this UNFORGETTABLE?" mandatory prompt | P1 | Skill #1 | SHIPPED |
| 5 | Premium indicator checklist (whitespace, depth, alignment, rhythm, custom elements) | P1 | Skill #4 | SHIPPED |

### B. `rc-design-patterns.md` (UPDATE)

| # | Change | Priority | Source | Status |
|---|--------|----------|--------|--------|
| 6 | Spatial composition — asymmetry, overlap, diagonal flow, grid-breaking | P1 | Skill #1 | BACKLOG |
| 7 | Background/texture depth — gradient meshes, noise, grain overlays, layered transparencies | P1 | Skill #1 | BACKLOG |
| 8 | Shadow hierarchy — higher=larger, Y>X offset, multi-layer, dark mode glow | P1 | Skill #4 | BACKLOG |
| 9 | Golden ratio — content:sidebar 62:38, heading scale × 1.618 | P2 | Skill #4 | BACKLOG |

### C. `rc-design-color-strategy.md` (NEW)

| # | Change | Priority | Source | Status |
|---|--------|----------|--------|--------|
| 10 | 60-30-10 color distribution rule | P0 | Skill #4 | BACKLOG |
| 11 | Color psychology mapping (trust=blue, growth=green, urgency=red, luxury=teal/gold) | P1 | Skill #4 | BACKLOG |
| 12 | Gradient quality rules — analogous only, ban harsh complementary, ban mesh blobs | P1 | Skill #4 | BACKLOG |

### D. `rc-design-implementation.md` (NEW)

| # | Change | Priority | Source | Status |
|---|--------|----------|--------|--------|
| 13 | Form behavior — autocomplete, inputmode, never block paste, warn unsaved, focus first error | P0 | Skill #3 | BACKLOG |
| 14 | Animation performance — only transform/opacity, ban transition:all, interruptible | P0 | Skill #3 | BACKLOG |
| 15 | URL-as-state — filters/tabs/pagination in query params | P0 | Skill #3 | BACKLOG |
| 16 | Performance — virtualize >50 items, no layout reads in render, preconnect, font preload | P0 | Skill #3 | BACKLOG |
| 17 | Image rules — width/height on img, lazy below fold, fetchpriority above fold | P0 | Skill #3 | BACKLOG |
| 18 | Content overflow — truncation, line-clamp, break-words, min-w-0 on flex children | P1 | Skill #3 | BACKLOG |
| 19 | Touch optimization — touch-action:manipulation, overscroll-behavior:contain in modals | P1 | Skill #3 | BACKLOG |
| 20 | Dark mode implementation — color-scheme:dark, meta theme-color, native select fix | P1 | Skill #3 | BACKLOG |
| 21 | Hydration safety — controlled inputs need onChange, date/time mismatch guards | P1 | Skill #3 | BACKLOG |
| 22 | Safe area / layout — env(safe-area-inset-*), overflow-x-hidden, prefer flex/grid | P2 | Skill #3 | BACKLOG |

### E. `rc-design-copy-style.md` (NEW)

| # | Change | Priority | Source | Status |
|---|--------|----------|--------|--------|
| 23 | Typography micro-rules — curly quotes, ellipsis, tabular-nums, text-wrap:balance, nbsp | P1 | Skill #3 | BACKLOG |
| 24 | Copy style — active voice, title case, numerals for counts, specific button labels, error messages include fix | P1 | Skill #3 | BACKLOG |
| 25 | i18n — Intl.DateTimeFormat/NumberFormat, Accept-Language not IP | P2 | Skill #3 | BACKLOG |

### F. `rc-design-critique.md` (UPDATE — shipped in step 3)

| # | Change | Priority | Source | Status |
|---|--------|----------|--------|--------|
| 26 | P0-P3 severity tiers replacing binary READY/NOT READY | P0 | Skill #2 | SHIPPED |
| 27 | Per-issue structured output: what/why/evidence/fix | P0 | Skill #2 | SHIPPED |
| 28 | "Craft" evaluation lens | P1 | Skill #2 | BACKLOG |
| 29 | "What's Working" section — 2-3 strengths in output | P1 | Skill #2 | BACKLOG |
| 30 | Forcing questions — "What if we removed this?", "Would a new user understand?" | P2 | Skill #2 | BACKLOG |

### G. `rc-design-challenger.md` (UPDATE — shipped in step 3)

| # | Change | Priority | Source | Status |
|---|--------|----------|--------|--------|
| 31 | P0-P3 severity in challenger output | P0 | Skill #2 | SHIPPED |
| 32 | Interaction state audit — hover, focus, active, disabled, loading, error | P1 | Skill #2 | BACKLOG |

### H. `rc-design-emotional.md` (UPDATE)

| # | Change | Priority | Source | Status |
|---|--------|----------|--------|--------|
| 33 | Von Restorff Effect — make CTAs visually distinct | P1 | Skill #4 | BACKLOG |
| 34 | Serial Position Effect — key info at start/end | P1 | Skill #4 | BACKLOG |
| 35 | Trust builder checklist — security cues, social proof, value prop, imagery, consistency | P1 | Skill #4 | BACKLOG |

### I. `rc-design-typography.md` (UPDATE — conflict resolved in step 1)

| # | Change | Priority | Source | Status |
|---|--------|----------|--------|--------|
| 36 | Ban generic font defaults warning | P1 | Skill #1 | SHIPPED (via conflict resolution) |
| 37 | Complexity matching — maximalist=elaborate, minimalist=restraint | P2 | Skill #1 | BACKLOG |

### J. `rc-design-trends-2026.md` (UPDATE — conflict resolved in step 1)

| # | Change | Priority | Source | Status |
|---|--------|----------|--------|--------|
| 38 | AI Default Warning section — bento/glassmorphism moved to "use selectively" | P0 | Skill #4 | SHIPPED (via conflict resolution) |

### K. `design-intake.ts` + types (UPDATE)

| # | Change | Priority | Source | Status |
|---|--------|----------|--------|--------|
| 39 | Constraint analysis gate — soft warning in pipeline mode, hard stop in interactive | P1 | Skill #4 | BACKLOG |
| 40 | "What makes this UNFORGETTABLE?" intake field | P1 | Skill #1 | BACKLOG |
| 41 | Bold aesthetic direction picker in intake | P1 | Skill #1 | BACKLOG |

### L. `design-agent.ts` (UPDATE)

| # | Change | Priority | Source | Status |
|---|--------|----------|--------|--------|
| 42 | Load `rc-design-anti-generic.md` in system prompt | P0 | Skill #1, #4 | BACKLOG |
| 43 | Load `rc-design-color-strategy.md` in system prompt | P0 | Skill #4 | BACKLOG |
| 44 | 60-30-10 enforcement in design spec schema | P1 | Skill #4 | BACKLOG |
| 45 | Anti-generic self-check after generating options | P1 | Skill #4 | BACKLOG |

### M. `design-types.ts` (UPDATE — shipped in step 5)

| # | Change | Priority | Source | Status |
|---|--------|----------|--------|--------|
| 46 | Add optional `colorDistribution` to DesignStyleSchema | P1 | Skill #4 | SHIPPED |
| 47 | Add optional `aestheticDirection` enum | P1 | Skill #1 | SHIPPED |
| 48 | Add optional `differentiator` field | P2 | Skill #1 | SHIPPED |

### N. `ux-tools.ts` (UPDATE)

| # | Change | Priority | Source | Status |
|---|--------|----------|--------|--------|
| 49 | Load `rc-design-implementation.md` in ux_audit | P0 | Skill #3 | BACKLOG |
| 50 | Interaction state audit in ux_audit | P1 | Skill #2 | BACKLOG |
| 51 | P0-P3 severity in audit output | P0 | Skill #2 | BACKLOG |

### O. `forge/agents/ux-designer.ts` (UPDATE)

| # | Change | Priority | Source | Status |
|---|--------|----------|--------|--------|
| 52 | Load `rc-design-implementation.md` for generated code quality | P0 | Skill #3 | BACKLOG |
| 53 | Easing selection framework | P2 | Skill #4 | BACKLOG |

### P. `security-scanner.ts` (UPDATE — shipped in step 4)

| # | Pattern | Priority | Source | Status |
|---|---------|----------|--------|--------|
| 54 | `transition: all` anti-pattern | P0 | Skill #3 | SHIPPED |
| 55 | `<div onClick>` without role="button" | P0 | Skill #3 | SHIPPED |
| 56 | `outline: none` without focus-visible replacement | P0 | Skill #3 | SHIPPED |
| 57 | `user-scalable=no` / `maximum-scale=1` | P0 | Skill #3 | SHIPPED |
| 58 | `<img>` without width/height | P1 | Skill #3 | BACKLOG |
| 59 | `onPaste` + `preventDefault` | P1 | Skill #3 | BACKLOG |
| 60 | Frontend console.log with sensitive context | P1 | Skill #3 | BACKLOG |

### Q. `rc-design-accessibility.md` (UPDATE)

| # | Change | Priority | Source | Status |
|---|--------|----------|--------|--------|
| 61 | Focus state specifics — :focus-visible, :focus-within, no bare outline-none | P1 | Skill #3 | BACKLOG |
| 62 | aria-live="polite" for async updates | P1 | Skill #3 | BACKLOG |
| 63 | Skip link + scroll-margin-top | P2 | Skill #3 | BACKLOG |

### R. `rc-design-research.md` (UPDATE)

| # | Change | Priority | Source | Status |
|---|--------|----------|--------|--------|
| 64 | Motion choreography — staggered reveals, scroll-triggered, hover choreography | P1 | Skill #1 | BACKLOG |
| 65 | Complexity-to-code matching — maximalist=elaborate, minimalist=restraint | P2 | Skill #1 | BACKLOG |

---

## Implementation Order (Future Batches)

### Batch 2: Implementation Correctness (after eval confirms batch 1 works)
Items: #13-17, #49, #51, #52, #58-60

### Batch 3: Visual Depth & Composition
Items: #6-8, #10-12, #33-35, #64

### Batch 4: Interaction & Platform
Items: #18-22, #32, #50, #53, #61-63

### Batch 5: Copy & Content Polish
Items: #23-25, #28-30, #37

### Batch 6: Intake & Agent Orchestration
Items: #39-45

### Batch 7: Remaining
Items: #9, #65

---

## Eval Criteria

Before each batch ships, test against 5 project prompts:
1. Marketing landing page for fintech startup
2. Admin dashboard for enterprise HR tool
3. E-commerce product page for DTC brand
4. Developer documentation site
5. Consumer mobile-first social app

**Measure:** Does output quality improve without false positives or degraded creativity?
