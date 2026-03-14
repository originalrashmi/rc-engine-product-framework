# UX Specialist: Design System & Component Architecture

## Focus Area
Design token usage, component consistency, theming, dark mode, responsive patterns, and ensuring the UI is built from a coherent system rather than ad-hoc elements.

## System Rules

### Design Tokens
- All visual properties referenced through tokens (not hardcoded values)
- Token categories: color, typography, spacing, border-radius, shadows, z-index, animation
- Semantic token naming: `--color-error` not `--color-red-500`
- Tokens layered: primitive → semantic → component-specific
  - Primitive: `--blue-500: #3B82F6`
  - Semantic: `--color-primary: var(--blue-500)`
  - Component: `--button-bg: var(--color-primary)`
- Token changes propagate automatically (change primary color = all primary elements update)

### Component Consistency
- Same pattern = same component (don't rebuild a card in 3 different ways)
- Components have defined variants (size: sm/md/lg, style: primary/secondary/ghost)
- Variant matrix documented: which combinations are valid
- Component props should be exhaustive but not bloated (max 10-12 props)
- Prefer composition over configuration (slot pattern > 20 boolean props)

### Responsive Strategy
- Mobile-first CSS (min-width breakpoints, not max-width)
- Standard breakpoints: 640px (sm), 768px (md), 1024px (lg), 1280px (xl), 1536px (2xl)
- Components adapt, not just shrink:
  - Side-by-side → stacked
  - Data table → card list
  - Multi-column → single column
  - Sidebar → bottom sheet or full-screen
- Touch targets scale up on mobile (44px minimum, UX-25)
- Test at 320px (iPhone SE), 375px, 768px, 1024px, 1440px, 1920px

### Theming & Dark Mode
- Theme implemented via CSS custom properties (not classes per element)
- Dark mode is a proper inversion (UX-18):
  - Background: dark gray/near-black, not pure `#000000`
  - Text: off-white, not pure `#FFFFFF` (reduces eye strain)
  - Colors desaturated 10-20% (vivid colors are harsh on dark backgrounds)
  - Shadows: subtle light glow instead of dark drop shadow
  - Images: apply slight dimming filter or provide dark-mode variants
- Honor `prefers-color-scheme` media query
- Persist user preference in localStorage
- No FOUC (flash of wrong theme) on page load

### Component States
Every interactive component must define these states:
| State | Visual | Trigger |
|-------|--------|---------|
| Default | Normal appearance | None |
| Hover | Subtle highlight, cursor change | Mouse enter |
| Focus | Focus ring (visible, 3:1 contrast) | Keyboard Tab |
| Active/Pressed | Pressed effect (scale, darken) | Mouse down / Enter |
| Disabled | Muted, cursor: not-allowed | Programmatic |
| Loading | Spinner or skeleton | Async operation |
| Error | Error color, icon, message | Validation failure |
| Selected | Highlighted, check/indicator | User selection |

### Z-Index Scale
- Background: 0
- Content: 1
- Sticky headers: 10
- Dropdowns: 20
- Fixed nav: 30
- Modals/overlays: 40
- Toasts/notifications: 50
- Tooltips: 60
- Never use arbitrary z-index values (999, 99999)

### Animation System
- Duration scale: fast (100ms), normal (200ms), slow (400ms), deliberate (600ms)
- Easing: ease-out for entrances, ease-in for exits, ease-in-out for state changes
- Honor `prefers-reduced-motion` (UX-41)
- No animation on initial page render (only on state changes)
- Consistent animation across similar interactions (all modals open the same way)

## Audit Checklist
- [ ] All colors use design tokens (UX-14)
- [ ] Semantic color naming (UX-15)
- [ ] Components are consistent (UX-04)
- [ ] Dark mode properly implemented (UX-18)
- [ ] All component states defined (UX-26)
- [ ] Z-index follows scale
- [ ] Animation system is consistent (UX-41)
- [ ] Responsive behavior tested at all breakpoints
