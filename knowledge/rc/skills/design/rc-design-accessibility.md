# RC Design Accessibility — Starter Edition

> Community edition with WCAG 2.1 AA essentials.
> Upgrade to RC Engine Pro for AAA guidance, ARIA pattern library, and assistive technology testing protocols.

## Purpose

Ensure every RC Method project meets baseline accessibility standards. Accessibility is not optional — it's a design constraint that improves usability for everyone.

---

## Color Contrast

### Minimum Ratios (WCAG 2.1 AA)
- **Normal text** (< 18px): 4.5:1 contrast ratio
- **Large text** (>= 18px, or >= 14px bold): 3:1 contrast ratio
- **UI components** (borders, icons, focus rings): 3:1 contrast ratio
- **Decorative elements**: No requirement

### Common Failures
- Light gray text on white (#999 on #fff = 2.85:1 — FAIL)
- Placeholder text with insufficient contrast
- Colored text on colored backgrounds without checking ratio
- Disabled states that are too faint to read

### Tools
- Check with browser DevTools contrast picker
- WebAIM Contrast Checker
- Lighthouse accessibility audit

---

## Keyboard Navigation

### Requirements
- All interactive elements reachable via Tab key
- Logical tab order (follows visual layout, left-to-right, top-to-bottom)
- Enter/Space activates buttons and links
- Escape closes modals, popovers, dropdowns
- Arrow keys navigate within composite widgets (tabs, menus, radio groups)

### Focus Management
- Visible focus ring on all interactive elements (never `outline: none` without replacement)
- Focus trapped inside modals (Tab cycles within modal, not behind it)
- Focus returned to trigger element when modal/popover closes
- Skip-to-content link as first focusable element on page

### Focus Ring Styling
```css
/* Visible, accessible focus ring */
:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
```

---

## Semantic HTML

### Element Selection
| Need | Use | Not |
|------|-----|-----|
| Click action | `<button>` | `<div onclick>` |
| Navigation | `<a href>` | `<span onclick>` |
| Text input | `<input>` / `<textarea>` | `<div contenteditable>` |
| Selection | `<select>` or radio/checkbox | Custom div-based dropdown |
| List of items | `<ul>` / `<ol>` | Nested divs |
| Data grid | `<table>` with `<th>` | Div-based grid |

### Landmark Regions
```html
<header>  <!-- Site header, logo, nav -->
<nav>     <!-- Primary navigation -->
<main>    <!-- Page main content (one per page) -->
<aside>   <!-- Sidebar, related content -->
<footer>  <!-- Site footer, links -->
```

### Heading Hierarchy
- One `<h1>` per page (page title)
- Sequential: h1 > h2 > h3 (never skip levels)
- Headings describe the content section they introduce

---

## Images and Media

- **Informative images**: Descriptive `alt` text explaining content
- **Decorative images**: Empty `alt=""` (not omitted, explicitly empty)
- **Complex images** (charts, diagrams): Long description via `aria-describedby`
- **Icons with meaning**: `aria-label` on the interactive element
- **Video**: Captions for deaf/hard-of-hearing users
- **Audio**: Transcript available

---

## Forms

- Every input has a visible `<label>` (linked via `for`/`id`)
- Required fields marked with text ("Required"), not just asterisk
- Error messages linked to input via `aria-describedby`
- Group related inputs with `<fieldset>` and `<legend>`
- Don't rely on placeholder text as the only label

---

## Motion and Animation

- Respect `prefers-reduced-motion` media query
- No auto-playing animations that can't be paused
- No flashing/strobing content (seizure risk)
- Keep transitions under 300ms for comfort
- Provide static alternatives for animated content

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Testing Checklist

- [ ] Tab through entire page — all elements reachable?
- [ ] Focus ring visible on every interactive element?
- [ ] All images have appropriate alt text?
- [ ] Color contrast passes 4.5:1 for text?
- [ ] Form inputs have visible labels?
- [ ] Error messages are descriptive and linked?
- [ ] Modals trap focus and return it on close?
- [ ] Page works without mouse?
