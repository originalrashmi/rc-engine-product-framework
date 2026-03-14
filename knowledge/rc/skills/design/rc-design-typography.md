# Typography Design Intelligence

## Purpose
Guide the Design Agent in selecting, pairing, and applying typography that serves the product's ICP, brand, and usability goals.

---

## Typography Principles

### 1. Readability First
- Body text: 16px minimum (desktop), 14px minimum (mobile)
- Line height: 1.4-1.6 for body, 1.1-1.3 for headings
- Line length (measure): 45-75 characters per line
- Paragraph spacing: 1em-1.5em between paragraphs
- Letter spacing: 0 for body, slight positive tracking for all-caps headings

### 2. Hierarchy Through Type
Create visual hierarchy using 4 levers (in order of effectiveness):
1. **Size** - larger = more important (minimum 1.2x difference between levels)
2. **Weight** - bolder = more emphasis (limit to 2-3 weights per page)
3. **Color/Contrast** - darker = primary, lighter = secondary
4. **Position** - top/left = seen first in F/Z scan patterns

### 3. Type Scale Systems
Use a mathematical ratio for consistent sizing:

| Scale | Ratio | Use Case | Sizes (base 16px) |
|-------|-------|----------|-------------------|
| Minor Second | 1.067 | Dense data UIs, admin | 15, 16, 17, 18, 19 |
| Major Second | 1.125 | Compact professional | 14, 16, 18, 20, 23 |
| Minor Third | 1.200 | Balanced, versatile | 13, 16, 19, 23, 28 |
| **Major Third** | **1.250** | **Most web apps** | **13, 16, 20, 25, 31** |
| Perfect Fourth | 1.333 | Marketing, editorial | 12, 16, 21, 28, 38 |
| Golden Ratio | 1.618 | Dramatic, high-impact | 10, 16, 26, 42, 68 |

**Default recommendation:** Major Third (1.250) for most SaaS/web products.

---

## Font Pairing Rules

### Contrast Principle
Pair fonts that are DIFFERENT enough to be distinguishable but SIMILAR enough to feel cohesive:
- **Serif heading + Sans body** - classic contrast, editorial authority + clean readability
- **Geometric heading + Humanist body** - modern heading with warm, approachable body
- **Display heading + Neutral body** - expressive heading, invisible body (doesn't compete)

### Concordance Principle
Use fonts from the same family or superfamily:
- **Same family, different weights** - Inter 700 heading + Inter 400 body
- **Superfamily** - IBM Plex Sans heading + IBM Plex Mono code
- Best for: professional, minimal, technical products

### Pairing Don'ts
- Never pair two display/decorative fonts (visual noise)
- Never pair two serifs unless they're dramatically different in style
- Never pair fonts with similar x-heights AND similar weight ranges (they'll blend, not contrast)
- Never use more than 3 font families on one page
- Never use light/thin weights for body text (legibility risk)

---

## Proven Font Pairings by Mood

### Professional / Enterprise
| Heading | Body | Rationale |
|---------|------|-----------|
| **Inter** (600, 700) | **Inter** (400, 500) | Same family, weight contrast - clean and corporate |
| **DM Sans** (500, 700) | **DM Sans** (400) | Geometric, clean - modern enterprise |
| **Playfair Display** (700) | **Source Sans 3** (400, 600) | Serif/sans contrast - editorial authority |

### Playful / Consumer
| Heading | Body | Rationale |
|---------|------|-----------|
| **Outfit** (600, 700) | **Inter** (400, 500) | Geometric heading, neutral body - approachable |
| **Fredoka** (500, 700) | **Nunito** (400, 600) | Rounded, friendly - consumer apps |
| **Space Grotesk** (500, 700) | **DM Sans** (400) | Modern with character - tech-consumer |

### Luxurious / Premium
| Heading | Body | Rationale |
|---------|------|-----------|
| **Cormorant Garamond** (600, 700) | **Montserrat** (300, 400) | Elegant serif + light sans |
| **Libre Baskerville** (700) | **Raleway** (300, 400) | Classic sophistication |

### Technical / Developer
| Heading | Body | Rationale |
|---------|------|-----------|
| **JetBrains Mono** (700) | **Inter** (400, 500) | Code-forward heading |
| **IBM Plex Sans** (500, 700) | **IBM Plex Sans** (400) | Technical clarity, same family |
| **Space Mono** (700) | **Work Sans** (400, 500) | Monospace accent heading |

### Bold / Memphis-Brutalist
| Heading | Body | Rationale |
|---------|------|-----------|
| **Outfit** (700, 800) | **Inter** (400, 500) | Bold geometric |
| **Syne** (700, 800) | **DM Sans** (400) | Expressive heading |
| **Archivo Black** (400) | **Archivo** (400, 500) | Same family, impact |

### Warm / Friendly
| Heading | Body | Rationale |
|---------|------|-----------|
| **Poppins** (600, 700) | **Nunito Sans** (400, 600) | Rounded, warm |
| **Rubik** (500, 700) | **Rubik** (400, 500) | Slightly rounded, mature-warm |

### Minimal / Clean
| Heading | Body | Rationale |
|---------|------|-----------|
| **Inter** (500, 600) | **Inter** (400) | Invisible typography, content-first |
| **Plus Jakarta Sans** (500, 700) | **Plus Jakarta Sans** (400) | Clean geometric |

---

## Font Loading Best Practices

### For Wireframes (Generated HTML)
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family={Font}:wght@{weights}&display=swap" rel="stylesheet">
```

### For Production Code
- Use `font-display: swap` for body text (shows fallback immediately)
- Use `font-display: optional` for decorative/accent fonts (skip if slow)
- Always specify fallback stack: `'Font Name', system-ui, sans-serif`
- Preconnect to Google Fonts or self-host via Fontsource
- Subset fonts to needed character ranges (latin, latin-ext)
- Prefer variable fonts when available (single file, all weights)

### Performance Budget
- Total web font payload: < 100KB (aim for 50-80KB)
- Maximum font files: 4-6 (2 families × 2-3 weights each)
- Use woff2 format (best compression)

---

## ICP-to-Typography Mapping

| ICP Segment | Recommended Style | Reasoning |
|-------------|------------------|-----------|
| Enterprise B2B | Professional (Inter, DM Sans) | Authority, trust, readability |
| Consumer SaaS | Playful or Warm (Outfit, Poppins) | Approachability, friendliness |
| Developer Tools | Technical (JetBrains Mono, IBM Plex) | Signals technical audience |
| Creative/Design | Bold or Luxurious (Syne, Playfair) | Visual expression, differentiation |
| Healthcare/Gov | Professional + High Contrast | Accessibility, trust, compliance |
| E-commerce | Minimal or Warm | Don't compete with product imagery |
| Fintech | Professional serif/sans | Authority, trust, precision |
