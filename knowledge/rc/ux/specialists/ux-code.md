# UX Specialist: Code Quality for UX

## Focus Area
Semantic HTML, ARIA implementation, CSS architecture, performance impact on UX, component code patterns, and ensuring the code produces the intended user experience.

## Code Rules

### Semantic HTML
- `<button>` for actions, `<a>` for navigation - never swap them (UX-42)
- `<nav>` wraps navigation, `<main>` wraps primary content
- `<header>`, `<footer>`, `<aside>` used as landmarks
- `<ul>`/`<ol>` for lists (screen readers announce "list of 5 items")
- `<table>` for tabular data with `<th>` headers and `scope` attribute
- `<form>` wraps form elements with `<label>` associated via `for` attribute
- `<section>` and `<article>` with heading for content sections
- `<dialog>` for modals (native focus trapping, Escape handling)
- No `<div>` with `onClick` - always `<button>` or `<a>`

### ARIA Usage
- Rule 1: Don't use ARIA if a native HTML element works
- Rule 2: Don't change native semantics (`<h2 role="tab">` - use `<button role="tab">`)
- Rule 3: All interactive ARIA controls must be keyboard accessible
- Rule 4: Don't use `role="presentation"` or `aria-hidden="true"` on focusable elements
- Rule 5: All interactive elements must have an accessible name

Common patterns:
```html
<!-- Live regions for dynamic content -->
<div aria-live="polite" aria-atomic="true">{status message}</div>

<!-- Custom dropdown -->
<button aria-haspopup="listbox" aria-expanded="false">
<ul role="listbox" aria-label="Options">
  <li role="option" aria-selected="true">

<!-- Tab interface -->
<div role="tablist">
  <button role="tab" aria-selected="true" aria-controls="panel-1">
<div role="tabpanel" id="panel-1" aria-labelledby="tab-1">
```

### CSS Architecture
- Use CSS custom properties for theming (not Sass variables in production)
- Class naming: BEM, utility-first (Tailwind), or CSS Modules - be consistent
- No `!important` except for utility overrides in a design system
- No inline styles (breaks theming, CSP, and maintainability)
- Layer ordering: reset → tokens → base → components → utilities
- Prefer `gap` over margin for flex/grid spacing (consistent, no margin collapse)
- Use logical properties: `margin-inline-start` over `margin-left` (RTL support)

### Performance Impact on UX
- Largest Contentful Paint (LCP) < 2.5s - hero image/text renders fast
- First Input Delay (FID) < 100ms - interactions respond immediately
- Cumulative Layout Shift (CLS) < 0.1 - no content jumping
- Font loading: `font-display: swap`, preconnect to font CDN
- Image loading: `loading="lazy"` for below-fold images, explicit `width`/`height`
- JavaScript: defer non-critical scripts, code-split routes
- Skeleton screens while data loads (better perceived performance than spinners)
- Preload critical resources: `<link rel="preload">`

### Component Patterns
- Props interface defines all variants explicitly (TypeScript)
- Default props match the most common usage
- Forward `ref` for DOM access (React: `forwardRef`)
- Spread remaining props to root element (`...rest`)
- Children over render props for simple composition
- Controlled + uncontrolled support for form components
- `className` prop for style extension (cn() helper)
- Test: unit test for logic, snapshot for rendering, a11y test with axe

### State Management for UX
- URL state for shareable/bookmarkable views (filters, tabs, pagination)
- Local state for ephemeral UI (open/closed, hover, focus)
- Server state via data fetching library (React Query, SWR) - not global state
- Optimistic updates for low-risk actions (toggle, like, reorder)
- Pessimistic updates for high-risk actions (payment, delete)
- Loading states co-located with the component, not global

### Animation Code
- CSS transitions for simple state changes (hover, focus, open/close)
- CSS animations for repeating/complex sequences
- JS animation libraries (Framer Motion, GSAP) for orchestrated sequences
- `prefers-reduced-motion` media query respected:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```
- `will-change` for GPU-accelerated properties (transform, opacity)
- Never animate `width`, `height`, `top`, `left` - use `transform` instead

## Audit Checklist
- [ ] Semantic HTML used correctly (UX-42)
- [ ] ARIA used only when native HTML insufficient
- [ ] No `<div onClick>` patterns (use `<button>`)
- [ ] CSS uses design tokens/custom properties (UX-14)
- [ ] Core Web Vitals within budget
- [ ] Images lazy-loaded with dimensions
- [ ] Font loading doesn't cause layout shift (UX-13)
- [ ] Reduced motion preference respected (UX-41)
- [ ] Component props typed and documented
- [ ] State management appropriate per concern
