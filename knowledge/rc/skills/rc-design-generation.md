# RC Design Generation — Unified Knowledge for Design Agent

## Purpose

This is the primary knowledge file loaded by the Design Agent during `ux_design` tool execution. It provides the complete design intelligence context for generating design options, color palettes, typography selections, layout strategies, and HTML wireframes.

---

## Design Generation Process

### Phase A: Research & Constraints
1. Analyze the ICP (Ideal Customer Profile) to determine visual tone
2. Audit competitor designs to identify gaps and opportunities
3. Map product type to appropriate design patterns
4. Identify brand constraints (if brand assets provided)

### Phase B: Option Generation
1. Generate distinct design options (1 or 3 based on request)
2. Each option must have a unique visual personality
3. Score each for ICP alignment (0-100)
4. Document tradeoffs (strengths/weaknesses) for each

### Phase C: Wireframe Generation
1. For each option, generate key screen wireframes
2. Two fidelity levels: lo-fi (grayscale structure) and hi-fi (full design)
3. HTML must be self-contained (inline CSS, no external dependencies)
4. Include responsive considerations and print styles

### Phase D: Critique & Recommendation
1. Score each option against the critique rubric
2. Recommend the best option with clear reasoning
3. Flag any accessibility or usability concerns

---

## ICP-to-Design Mapping

| ICP Type | Visual Tone | Color Strategy | Typography | Layout |
|----------|------------|----------------|------------|--------|
| Enterprise/B2B | Professional, trustworthy | Conservative palette, blue/navy anchors | System fonts or clean sans-serif (Inter, IBM Plex) | Structured grids, generous whitespace |
| Startup/Tech | Modern, innovative | Vibrant accents on neutral base | Geometric sans-serif (Outfit, Space Grotesk) | Asymmetric layouts, bold sections |
| Consumer/B2C | Friendly, approachable | Warm palette, accessible contrast | Rounded sans-serif (Nunito, Rubik) | Card-based, scannable |
| Creative/Design | Expressive, bold | High-contrast, unexpected combinations | Display fonts for headings, classic body | Breaking the grid, overlapping elements |
| Developer/Technical | Clean, functional | Dark mode friendly, syntax-highlight palette | Monospace accents, technical sans-serif | Dense information, minimal decoration |
| Marketplace/Directory | Organized, discoverable | Category-coded colors, neutral cards | Clear hierarchy fonts, readable at small sizes | Grid layouts, strong filtering UI |

---

## Color Palette Rules

### Generating Palettes
1. **Start with the primary action color** — what color is the main CTA button?
2. **Derive secondary from contrast** — complement or analogous, never too similar
3. **Background must breathe** — light backgrounds (#FAFAFA-#FFFFFF range) or confident dark (#0A0A0A-#1A1A1A)
4. **Surface color for cards/panels** — slight lift from background (white on light, #1E1E1E on dark)
5. **Text must hit 4.5:1 contrast ratio** against background (WCAG AA minimum)
6. **Muted color for secondary text** — same hue family as text, reduced opacity or lightened

### Color Psychology Quick Reference
- **Blue (#3B82F6 range):** Trust, reliability, professionalism
- **Green (#22C55E range):** Growth, success, permission
- **Red (#EF4444 range):** Urgency, error, danger
- **Yellow (#EAB308 range):** Attention, warning, optimism
- **Purple (#A855F7 range):** Creativity, premium, innovation
- **Pink (#EC4899 range):** Playful, bold, unconventional
- **Cyan (#06B6D4 range):** Fresh, modern, digital-native
- **Orange (#F97316 range):** Energy, action, warmth

---

## Typography Selection

### Font Pairing Rules
1. **Contrast principle:** Heading and body fonts should differ in classification (serif + sans, geometric + humanist)
2. **Concordance principle:** Fonts should share proportions (x-height, stroke width) even if styles differ
3. **Never pair two decorative fonts** — one display + one workhorse
4. **Max 3 font families** per project (heading, body, optional accent/code)

### Proven Pairings by Mood
| Mood | Heading | Body | Use Case |
|------|---------|------|----------|
| Professional | Inter | Inter | Enterprise SaaS, dashboards |
| Playful Bold | Outfit | Inter | Creative tools, marketplaces |
| Technical | JetBrains Mono | Inter | Developer tools, documentation |
| Premium | Playfair Display | Source Sans | Luxury, editorial, high-end |
| Modern Clean | Space Grotesk | DM Sans | Startups, modern products |
| Brutalist | Outfit / Space Mono | Inter | Bold statements, experimental |

### Type Scale
- **Standard:** 1.25 ratio (16, 20, 25, 31, 39px)
- **Compact:** 1.2 ratio (14, 17, 20, 24, 29px) — for data-dense interfaces
- **Generous:** 1.333 ratio (16, 21, 28, 38, 50px) — for marketing/editorial

---

## Layout Patterns

### Hero Patterns
1. **Centered hero:** Heading + subheading + CTA centered, optional background image/gradient
2. **Split hero:** Text left, visual right (or reversed), clear CTA
3. **Full-bleed hero:** Background image/video with overlay text
4. **Minimal hero:** Large heading, minimal supporting text, strong typography focus

### Grid Layouts
1. **Standard grid:** 12-column, 1200px max-width, 24px gutters
2. **Bento grid:** Mixed-size cards in a masonry-like arrangement
3. **Magazine layout:** Hero card + supporting grid, editorial feel
4. **Dashboard layout:** Sidebar nav + main content area, data cards

### Card Patterns
1. **Standard card:** Image top, content below, action at bottom
2. **Horizontal card:** Image left, content right (for lists)
3. **Stat card:** Large number, label, optional trend indicator
4. **Feature card:** Icon/illustration, heading, description

### Spacing System
Use a consistent base unit (4px or 8px) with multipliers:
- **Tight:** 4px, 8px (between related elements)
- **Comfortable:** 16px, 24px (between sections within a component)
- **Spacious:** 32px, 48px (between major sections)
- **Generous:** 64px, 96px (page section separators)

---

## Responsive Breakpoints

| Name | Width | Columns | Notes |
|------|-------|---------|-------|
| Mobile | < 640px | 1 | Stack everything, full-width cards |
| Tablet | 640-1023px | 2 | Side-by-side cards, collapsible filters |
| Desktop | 1024-1279px | 3 | Full grid, sidebar visible |
| Wide | >= 1280px | 4 | Maximum content width, more whitespace |

---

## Wireframe Generation Rules

### Lo-Fi Wireframes
- Use **grayscale only** (#F5F5F5 background, #E0E0E0 for cards, #9E9E9E for text, #616161 for headings)
- **Simple rectangles** for images (labeled "Image: [description]")
- **Placeholder text** that describes content type: "[Hero Heading]", "[Tool Description ~50 words]"
- **No shadows, no gradients, no rounded corners** — pure structure
- **Box model visible** — borders on all containers to show layout structure

### Hi-Fi Wireframes
- Use **full color palette** from the design option
- **Realistic content** — actual tool names, real pricing, believable descriptions
- **Proper typography** — correct font families, sizes, weights from spec
- **Shadows and depth** as specified in the design option
- **Hover states** noted with CSS `:hover` rules
- **Interactive indicators** — buttons look clickable, links are underlined/colored

### HTML Requirements
- **Completely self-contained** — all CSS inline in `<style>` tag
- **No external dependencies** — no CDN links, no Google Fonts URLs (use `font-family` fallback stacks)
- **Responsive** — include `@media` queries for mobile/tablet/desktop
- **Print-friendly** — include `@media print` styles for PDF export
- **Semantic HTML** — use `<nav>`, `<main>`, `<section>`, `<article>`, `<button>`, `<table>` appropriately
- **Viewport meta tag** — include `<meta name="viewport" content="width=device-width, initial-scale=1">`

---

## Design Trends (2026)

### Active — Adopt When Appropriate
- **Bento Grid Layouts** — mixed-size cards for visual interest
- **Bold Typography** — oversized headings (48-80px) for impact
- **Neubrutalism** — thick borders, hard shadows, raw aesthetic
- **Micro-interactions** — subtle hover/click feedback
- **Dark mode support** — system preference detection
- **Variable fonts** — single font file, weight/width flexibility

### Fading — Avoid Unless Brand Requires
- Glassmorphism (blurred backgrounds)
- Neumorphism (soft inner shadows)
- Gradients as primary design element
- Parallax scrolling

### Emerging — Consider for Forward-Looking Products
- Spatial/3D elements in flat interfaces
- AI-adaptive interfaces (content rearranges based on behavior)
- Content-first design (minimal UI chrome)

---

## Accessibility Baseline (Non-Negotiable)

Every design option must meet these minimums:
1. **Color contrast:** 4.5:1 for body text, 3:1 for large text and UI components
2. **Focus indicators:** Visible focus rings on all interactive elements
3. **Touch targets:** Minimum 44x44px for mobile interactive elements
4. **Color independence:** Information never conveyed by color alone
5. **Motion respect:** `prefers-reduced-motion` honored for all animations
6. **Semantic structure:** Heading hierarchy (h1 → h2 → h3), landmark regions

---

## Design Critique Rubric (Self-Assessment)

Before presenting options, score each against:

| Category | Weight | What to Check |
|----------|--------|---------------|
| ICP Alignment | 25% | Does the visual tone match the target user? |
| Visual Hierarchy | 15% | Is the primary action obvious? Can you scan in 3 seconds? |
| Usability | 20% | Are interactive elements discoverable? Is the flow intuitive? |
| Accessibility | 15% | Does it meet WCAG AA? Color contrast, keyboard nav, screen reader? |
| Consistency | 10% | Are patterns reused? Same component for same function? |
| Emotional Impact | 10% | Does it evoke the right feeling? Trust? Excitement? Calm? |
| Differentiation | 5% | Does it stand out from competitors? |

**Threshold:** Options scoring below 70% overall should be revised before presenting.
