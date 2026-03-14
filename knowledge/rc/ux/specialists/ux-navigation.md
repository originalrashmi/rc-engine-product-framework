# UX Specialist: Navigation & Wayfinding

## Focus Area
Primary navigation, secondary navigation, breadcrumbs, tabs, pagination, search, and all patterns that help users find and move between content.

## Navigation Rules

### Primary Navigation
- Visible on every page (or accessible via hamburger on mobile)
- Max 5-7 top-level items (Miller's Law: 7 plus/minus 2)
- Active item clearly indicated (color + weight + indicator, not just color)
- Order by user priority (most-used first), not by organizational structure
- Sticky/fixed on scroll for long pages
- Consistent across all pages (same items, same order)
- Mobile: hamburger menu, bottom tab bar, or slide-out drawer

### Secondary Navigation
- Use when primary has sub-sections (settings, profile tabs, admin panels)
- Options: sidebar nav, horizontal tabs, segmented control
- Active sub-item indicated within the section
- Collapsible sidebar for complex admin navigation
- Breadcrumbs when navigation depth > 2 levels

### Breadcrumbs
- Show the full path: Home > Section > Subsection > Current Page
- Each breadcrumb is a link (except current page)
- Use `>` or `/` separator (not `|` or `-`)
- Current page is non-interactive (text, not link)
- Placed above the page title, below the primary nav
- Mobile: can truncate middle items with "..."

### Tabs
- Max 5-6 tabs before overflow/scrolling
- Active tab is visually distinct (bottom border, background, bold)
- Tab content loads without full page reload
- Tab state preserved on navigation (don't reset to first tab)
- Keyboard: arrow keys to switch tabs, Tab to move into content
- Don't use tabs for sequential steps (use a stepper instead)

### Pagination
- Show current page and total: "Page 3 of 12" or "Showing 21-30 of 120"
- Previous/Next buttons always present (disabled when at start/end)
- Jump to first/last page for long lists
- Page size selector when appropriate (10, 25, 50, 100)
- Maintain scroll position when paginating (scroll to top of list)
- Consider infinite scroll for browsing content, pagination for task-oriented lists

### Search
- Search visible when content > 20 items (UX-23)
- Search input has clear affordance (magnifying glass icon + text input)
- Auto-suggest after 2-3 characters (debounced, not on every keystroke)
- Show result count: "12 results for 'dashboard'"
- Highlight search terms in results
- No results: suggest alternatives, check spelling, broaden scope
- Recent searches: show last 5 for repeat visitors
- Scoped search: indicate what's being searched (all, this section, this category)

### Filters
- Active filters visible as chips/tags (removable individually)
- "Clear all" option when any filter is active
- Filter count shown: "Showing 23 of 150"
- Mobile: full-screen filter panel or bottom sheet
- Preserve filter state in URL (shareable/bookmarkable)
- Default state: no filters applied (show everything)

## Navigation Anti-Patterns
- Mystery meat navigation (icons without labels)
- Mega menus that open on hover and close when cursor moves to submenu
- Breadcrumbs that don't match the actual page hierarchy
- Pagination that resets when user goes back
- Search that doesn't handle typos or partial matches
- Tab labels that wrap to multiple lines
- Hamburger menu on desktop (unless minimal nav needed)

## Audit Checklist
- [ ] Current location always clear (UX-19)
- [ ] Navigation reachable from every page (UX-20)
- [ ] Depth does not exceed 3 levels (UX-21)
- [ ] Links are distinguishable from text (UX-22)
- [ ] Search available when needed (UX-23)
- [ ] Active states on all nav items
- [ ] Mobile navigation is usable (no tiny links)
- [ ] Filters preserved in URL
