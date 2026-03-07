# UX Triggers — Complexity Scoring Rubric

## Purpose

Score the UX complexity of a feature list to determine the appropriate level of UX effort. This rubric is loaded by the `ux_score` tool during Phase 2 (Define).

## Scoring Table

Evaluate each condition against the feature list. Award points for each condition that applies.

| # | Condition | Points | Example |
|---|-----------|--------|---------|
| T1 | **Multi-step form or wizard** (3+ steps) | 2 | Onboarding flow, checkout, account setup |
| T2 | **Real-time data display** (live updates, charts, dashboards) | 2 | Analytics dashboard, monitoring, chat |
| T3 | **Role-based access** (different UI per user role) | 1 | Admin vs. user views, permission-gated features |
| T4 | **Complex state management** (optimistic updates, offline, sync) | 2 | Collaborative editing, drag-and-drop reorder |
| T5 | **Payment/transaction flow** | 2 | Checkout, subscription management, refunds |
| T6 | **User-generated content** (forms, uploads, rich text) | 1 | Profile editing, post creation, file uploads |
| T7 | **Search with filters** (faceted search, sort, pagination) | 1 | Product catalog, user directory, log viewer |
| T8 | **Onboarding/activation flow** (first-time user experience) | 1 | Welcome wizard, tutorial, setup checklist |
| T9 | **Notification system** (in-app, email, push) | 1 | Alert center, notification preferences |
| T10 | **Data tables with actions** (sort, filter, bulk actions) | 2 | Admin panels, CRM, inventory management |
| T11 | **Modal/overlay-heavy interaction** | 1 | Configuration dialogs, confirmation flows |
| T12 | **Drag-and-drop interaction** | 2 | Kanban boards, list reordering |
| T13 | **Multi-page navigation** (5+ distinct page types) | 1 | Marketing site, SaaS app |
| T14 | **Accessibility-critical audience** | 2 | Government, healthcare, education |
| T15 | **Internationalization** (multiple languages, RTL) | 1 | Multi-locale app |
| T16 | **Dark mode or theming** | 1 | User-selectable themes |
| T17 | **Animation-heavy design** | 1 | Portfolio site, creative tool |
| T18 | **Comparison/decision UI** | 1 | Pricing page, product comparison |

**Maximum possible score: 25**

## Mode Determination

| Score Range | Mode | UX Effort Level |
|-------------|------|-----------------|
| 0-3 | **Standard** | Minimal UX effort. Apply core rules during Forge. No UX child PRD needed. |
| 4-6 | **Selective** | Moderate UX effort. Generate UX child PRD focusing on triggered areas. |
| 7+ | **Deep Dive** | Full UX treatment. Generate comprehensive UX child PRD. Consider design research. |

## Output Format

When scoring, present results in this format:

```
## UX Complexity Score

| # | Condition | Applies? | Points |
|---|-----------|----------|--------|
| T1 | Multi-step form | Yes/No | 0-2 |
| ... | ... | ... | ... |

**Total Score: X**
**Mode: Standard / Selective / Deep Dive**

### Triggered Conditions
- T{n}: {condition} — {why it applies}

### Key UX Challenges
1. {Challenge from the triggered conditions}
2. ...
```
