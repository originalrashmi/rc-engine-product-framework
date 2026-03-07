# RC Design Patterns — Starter Edition

> Community edition with essential layout and component patterns.
> Upgrade to RC Engine Pro for cognitive science, emotional design, behavioral patterns, and 2026 trend analysis.

## Purpose

Provide foundational design patterns for UI generation. These patterns ensure every RC Method project has intentional layout, component structure, and visual consistency — not just functional code.

---

## Layout Patterns

### 1. Hero Section
- Full-width or contained, with clear headline + subheadline + CTA
- Image/illustration supports the message, doesn't compete with it
- Mobile: stack vertically, headline first

### 2. Card Grid
- Consistent card dimensions within a grid
- 1 column mobile, 2 tablet, 3-4 desktop
- Cards have: visual (image/icon), title, description, action
- Equal height rows (CSS Grid or flexbox)

### 3. Split Content
- 50/50 or 60/40 text-image split
- Alternate image side on successive sections
- Mobile: stack with image above or below text

### 4. Feature List
- Icon + heading + description per feature
- 2-3 column grid on desktop, single column mobile
- Icons from a consistent set (not mixed styles)

### 5. Pricing Table
- Side-by-side comparison (2-4 tiers)
- Highlight recommended tier
- Feature checklist with checkmarks/crosses
- CTA button per tier, primary on recommended

### 6. Dashboard Layout
- Sidebar navigation (collapsible on mobile)
- Top bar with breadcrumbs/search/user menu
- Main content area with card-based widgets
- Responsive: sidebar becomes bottom nav or hamburger

---

## Component Patterns

### Buttons
- **Primary**: Filled, high contrast, one per section
- **Secondary**: Outlined or muted fill
- **Tertiary**: Text-only, for less important actions
- **Destructive**: Red/warning color, requires confirmation
- All buttons: min 44px touch target, loading state, disabled state

### Forms
- Label above input (never placeholder-only)
- Helper text below input for complex fields
- Inline validation on blur, not on every keystroke
- Group related fields with fieldset/legend
- Progressive disclosure: show fields as needed

### Navigation
- **Top bar**: Logo left, nav center or right, CTA right
- **Sidebar**: For apps with 5+ sections
- **Bottom bar**: Mobile apps, max 5 items
- Active state clearly distinguished (not color-only)

### Cards
- Consistent padding (16-24px)
- Clear visual hierarchy: image > title > description > action
- Hover state if clickable (elevation or border change)
- Skeleton loading state matching card layout

### Modals/Dialogs
- Max width 480-640px, centered
- Clear title, close button (X), dismiss on overlay click
- Primary action right, cancel/secondary left
- Focus trapped inside modal, return focus on close

### Tables
- Sticky header on scroll
- Sortable columns with clear indicator
- Row hover state for readability
- Responsive: horizontal scroll or card view on mobile

---

## Spacing System

Use a consistent spacing scale based on a 4px or 8px unit:

| Token | Value | Use |
|-------|-------|-----|
| xs | 4px | Inline spacing, icon gaps |
| sm | 8px | Compact element spacing |
| md | 16px | Default element spacing |
| lg | 24px | Section padding, card padding |
| xl | 32px | Section gaps |
| 2xl | 48px | Major section separation |
| 3xl | 64px | Page-level section gaps |

---

## Color Usage

- **Primary**: Main brand color for CTAs and key UI elements
- **Secondary**: Supporting brand color for accents
- **Neutral**: Gray scale for text, borders, backgrounds
- **Semantic**: Red (error), green (success), yellow (warning), blue (info)
- Never use color as the sole indicator — always pair with text/icon

---

## Responsive Breakpoints

| Name | Width | Columns | Use |
|------|-------|---------|-----|
| Mobile | < 640px | 1 | Phone portrait |
| Tablet | 640-1023px | 2 | Tablet, phone landscape |
| Desktop | 1024-1439px | 3-4 | Laptop, small desktop |
| Wide | 1440px+ | 4+ | Large desktop |

Content max-width: 1200-1440px. Body text max-width: 680px (45-75 chars).
