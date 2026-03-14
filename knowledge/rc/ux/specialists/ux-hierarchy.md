# UX Specialist: Visual Hierarchy & Information Architecture

## Focus Area
Content organization, visual weight distribution, scanning patterns, data density, dashboard layout, and information prioritization.

## Hierarchy Rules

### Visual Weight Distribution
- Primary content gets the most visual weight (size, contrast, position)
- Secondary content is present but not competing (smaller, muted, peripheral)
- Tertiary content is available on demand (expandable, linked, tooltipped)
- Only ONE primary focal point per viewport - the user must know where to look first
- Use size contrast: primary elements at least 1.5x larger than secondary

### Information Density
- Match density to user expertise:
  - Novice users: low density, generous whitespace, progressive disclosure
  - Expert users: high density, data-rich, keyboard shortcuts
  - Mixed audience: default to low density with "compact mode" option
- Dashboard cards: max 1 key metric per card at glance level
- Data tables: max 7-8 visible columns before horizontal scroll or column hiding
- Long lists: group by category, add section headers, or paginate at 20-50 items

### Scanning Patterns
- F-pattern: for text-heavy pages (articles, settings, documentation)
  - Left-align headings and key labels
  - Bold first 2-3 words of each paragraph/item
  - Use bullet points for scanability
- Z-pattern: for marketing/landing pages
  - Logo/nav top-left, CTA top-right
  - Visual content center
  - Final CTA bottom-right
- Grid pattern: for browsing (product catalogs, galleries, dashboards)
  - Consistent card sizes and spacing
  - Progressive loading (infinite scroll or pagination)

### Grouping & Relationships (Gestalt)
- **Proximity**: related items close together, unrelated items far apart
- **Similarity**: consistent styling for items of the same type
- **Enclosure**: borders or background color to group related content
- **Continuity**: alignment creates implied connections
- **Common region**: shared background groups disparate elements
- Apply grouping BEFORE adding borders/dividers - space alone should create groups

### Dashboard Layout
- Key metrics at top (above the fold)
- Trend data (charts/graphs) in the middle
- Detail data (tables/lists) below
- Filters and controls persistent (sidebar or top bar, not hidden)
- Time period selector prominent and consistent
- Each widget should answer one question ("How many users this week?")
- No chart without context: always include comparison (vs. last period, vs. target)

### Content Pages
- Article/documentation: heading, content, sidebar (table of contents)
- Settings: grouped by category, each group has a heading
- Profile/detail: hero section (key info), tabbed sections for detail
- List page: filters left or top, results right/below, count visible

## Audit Checklist
- [ ] Clear visual hierarchy: primary → secondary → tertiary (UX-01)
- [ ] Consistent spacing scale creates grouping (UX-02)
- [ ] Content width constrained for readability (UX-03)
- [ ] Scanning pattern supported (F or Z) (UX-07)
- [ ] Information density appropriate for audience
- [ ] Gestalt principles applied for grouping
- [ ] Dashboard metrics have context and comparison
- [ ] No competing focal points in a single viewport
