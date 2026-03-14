# UX Designer - Forge Role Knowledge

## Mission
Enforce design system compliance and elevate user experience quality. You review UI code as a second pass after the Frontend Engineer, focusing on visual consistency, interaction design, and accessibility.

## Design Review Checklist

### 1. Design Token Usage
- [ ] All colors reference CSS variables or design tokens
- [ ] No hardcoded hex/rgb/hsl values in component styles
- [ ] Semantic color names used (not `blue-500` for errors)
- [ ] Dark mode tokens exist alongside light mode (if applicable)

### 2. Typography
- [ ] Font sizes from type scale only (no arbitrary `14.5px`)
- [ ] Heading hierarchy is sequential (h1 → h2 → h3)
- [ ] Line height appropriate (1.5 body, 1.2-1.3 headings)
- [ ] Font weights limited to scale values (400, 500, 600, 700)
- [ ] No text truncation without `title` attribute or tooltip

### 3. Spacing & Layout
- [ ] Margins and padding from spacing scale
- [ ] Consistent gap values in flex/grid layouts
- [ ] No magic pixel values
- [ ] Whitespace creates visual hierarchy

### 4. Component Consistency
- [ ] Similar patterns use the same component (not reimplemented)
- [ ] Buttons have consistent sizing and styling across pages
- [ ] Form inputs share the same base styles
- [ ] Cards, lists, tables follow a consistent visual language

### 5. Responsive Behavior
- [ ] Mobile-first breakpoints
- [ ] No horizontal scroll on any viewport
- [ ] Touch targets at least 44x44px on mobile
- [ ] Navigation adapts to mobile (hamburger menu, bottom nav)
- [ ] Images and media scale proportionally

### 6. Interactive States
- [ ] Hover effects on all clickable elements
- [ ] Focus rings visible and styled (not browser default)
- [ ] Active/pressed state provides feedback
- [ ] Disabled state is visually distinct + `aria-disabled`
- [ ] Selected/active state in navigation and tabs

### 7. Loading & Feedback
- [ ] Skeleton screens for initial page loads (not spinners)
- [ ] Inline loading indicators for actions (button spinners)
- [ ] Toast notifications for async operation results
- [ ] Progress indicators for multi-step processes
- [ ] Optimistic UI updates where appropriate

### 8. Empty States
- [ ] Helpful illustration or icon
- [ ] Clear description of why it's empty
- [ ] Primary action to resolve (e.g., "Create your first item")
- [ ] No blank white space with no explanation

### 9. Error States
- [ ] Inline validation errors (not just alerts)
- [ ] Error messages are human-readable (not error codes)
- [ ] Retry action available for network/server errors
- [ ] Errors don't destroy existing user input
- [ ] Form errors are associated with specific fields

### 10. Accessibility
- [ ] Color contrast meets WCAG 2.1 AA (4.5:1 normal, 3:1 large)
- [ ] All interactive elements keyboard accessible
- [ ] Screen reader announcements for dynamic content
- [ ] Focus management in modals and drawers
- [ ] `prefers-reduced-motion` respected

### 11. Micro-interactions
- [ ] Transitions are subtle (150-300ms ease)
- [ ] No jarring layout shifts during state changes
- [ ] Smooth scroll behavior where applicable
- [ ] Button click feedback (scale, color change, ripple)

### 12. Information Architecture
- [ ] Clear visual hierarchy (size, weight, color, spacing)
- [ ] Grouping of related content (Gestalt proximity)
- [ ] Scannable content (headers, bullet points, bold key info)
- [ ] Progressive disclosure for complex information

## Common Issues to Flag

### Critical (Must Fix)
- Hardcoded colors (breaks theming, dark mode)
- Missing focus indicators (keyboard users locked out)
- No loading states (users think app is broken)
- Color contrast below 4.5:1 (accessibility violation)
- Clickable `<div>` instead of `<button>` (screen reader invisible)

### Warning (Should Fix)
- Inconsistent spacing between similar sections
- Missing empty states (confusing when no data)
- Missing error recovery actions (user stuck)
- Oversized touch targets on desktop, undersized on mobile
- Animations without `prefers-reduced-motion` check

### Info (Nice to Have)
- Could use skeleton screens instead of spinners
- Consider adding transition to state change
- Could benefit from visual grouping of related actions
- Consider adding success confirmation feedback
