# Frontend Engineer — Forge Role Knowledge

## Mission
Build accessible, responsive UI components that consume the API contracts and implement the design system. Every component should be production-ready: loading states, error states, empty states, and keyboard navigation.

## Component Architecture

### 1. Component Hierarchy
- **Pages**: Route-level components, handle data fetching and layout
- **Features**: Domain-specific composed components (UserProfile, InvoiceList)
- **UI Primitives**: Buttons, Inputs, Cards, Modals — design system atoms
- **Layouts**: Page shells, sidebars, navigation

### 2. Component Rules
- One component per file
- Props interface exported alongside component
- Default export for page components, named exports for shared components
- Co-locate styles, tests, and types with the component

## Design System Compliance (MANDATORY)

### Color
- ONLY use CSS variables or design tokens: `var(--color-primary)`, `text-primary`
- NEVER hardcode hex values (`#1a1a1a`) or rgb values
- Semantic colors: `--color-success`, `--color-error`, `--color-warning`

### Typography
- Use the type scale: `text-sm`, `text-base`, `text-lg`, `text-xl`
- Font sizes in rem (never px)
- Consistent heading hierarchy: h1 > h2 > h3 (never skip levels)
- Line height: 1.5 for body, 1.2 for headings

### Spacing
- Use the spacing scale: `p-2`, `p-4`, `p-6`, `p-8` (Tailwind) or `var(--space-md)`
- Consistent gaps in flex/grid layouts
- No magic numbers (`margin-top: 13px` = bad)

### Responsive Design
- Mobile-first: start with mobile layout, add breakpoints for larger screens
- Breakpoints: `sm:640px`, `md:768px`, `lg:1024px`, `xl:1280px`
- No fixed widths on containers (use `max-w-*` instead)
- Test at 320px, 768px, 1024px, 1440px

## State Management

### UI States (EVERY interactive component needs these)
1. **Default**: Normal resting state
2. **Loading**: Skeleton screen or spinner during data fetch
3. **Empty**: Helpful message + action when no data exists
4. **Error**: Inline error with retry action
5. **Success**: Confirmation feedback after mutations

### Interaction States (EVERY interactive element)
- `hover`: Visual feedback on cursor hover
- `focus`: Visible focus ring for keyboard navigation
- `active`: Pressed/clicked state
- `disabled`: Grayed out, non-interactive, with `aria-disabled`

## Accessibility (WCAG 2.1 AA — MANDATORY)

### Semantic HTML
- Use `<button>` for actions, `<a>` for navigation (never `<div onClick>`)
- Use `<nav>`, `<main>`, `<header>`, `<footer>` landmarks
- Use `<ul>`/`<ol>` for lists, `<table>` for tabular data
- Heading hierarchy must be sequential

### ARIA
- `aria-label` on icon-only buttons
- `aria-expanded` on toggleable sections
- `aria-live="polite"` for dynamic content updates
- `role="alert"` for error messages
- `aria-describedby` linking form fields to error text

### Keyboard Navigation
- All interactive elements reachable via Tab
- Enter/Space activates buttons
- Escape closes modals/dropdowns
- Arrow keys navigate within menus/lists
- Focus trap in modals

### Color Contrast
- Text on background: minimum 4.5:1 ratio (normal text), 3:1 (large text)
- Non-text elements (icons, borders): minimum 3:1 ratio

## Motion
- Respect `prefers-reduced-motion`:
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }
  ```
- Use subtle transitions (150-300ms) for state changes
- No autoplaying animations without user consent

## Data Fetching Patterns

### React / Next.js
- Server Components for initial data (no loading spinner)
- Client Components with `useSWR` or `@tanstack/react-query` for dynamic data
- Server Actions for mutations (forms)
- Optimistic updates for responsive UX

### General
- Show stale data while revalidating
- Debounce search inputs (300ms)
- Paginate large lists (don't render 1000 items)
- Cache API responses where appropriate

## Forms
- Controlled inputs with validation on blur + submit
- Inline error messages below each field
- Disable submit button during submission
- Show loading indicator on submit button
- Clear form or redirect after successful submission
- Preserve form data on validation error (don't clear inputs)
