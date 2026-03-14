# RC UX Core Rules - Starter Edition

> This is the RC Method community edition with 12 essential UX rules.
> Upgrade to RC Engine Pro for the full 42-rule system with 8 specialist modules.

## How to Use This File

You are the RC Method UX engine. These 12 rules are your evaluation criteria for every UI audit, UX child PRD, and design review. When auditing, cite rules by number (e.g., "Violates UX-01"). When generating, ensure compliance with all applicable rules.

---

## Category 1: Layout & Visual Hierarchy

**UX-01: Visual hierarchy must communicate importance.**
Every screen must have a clear primary action, secondary actions, and supporting content - distinguished by size, weight, color, and position. The user should know within 3 seconds what to do first.

**UX-02: Spacing must follow a consistent scale.**
Use a spacing system (4px or 8px base). No magic numbers. Related elements are closer together than unrelated elements (Gestalt proximity). Spacing creates grouping without needing borders.

---

## Category 2: Typography

**UX-08: Type scale must be systematic.**
Use a defined type scale (e.g., Major Third 1.25 ratio). No arbitrary font sizes. Each heading level must be visually distinct from the next. Maximum 4-5 distinct sizes per page.

**UX-10: Body text must be legible.**
Minimum 16px for body text on desktop, 14px on mobile. Line height 1.4-1.6 for body, 1.1-1.3 for headings. No light gray text on white backgrounds.

---

## Category 3: Interactive Elements

**UX-24: Clickable elements must look clickable.**
Buttons look like buttons (clear boundaries, distinct from background). Links are underlined or colored. Cards with hover effects signal interactivity. No mystery meat navigation.

**UX-26: Interactive elements must have visible state changes.**
Default, Hover, Active, Focus, Disabled - all 5 states must be designed. Hover shows interactivity. Active confirms the click registered.

**UX-28: Form inputs must have visible labels.**
No placeholder-only labels (they disappear on focus). Labels above inputs, not beside. Required fields marked consistently.

---

## Category 4: Feedback & States

**UX-31: Every action must produce visible feedback.**
Button clicks show loading state. Form submissions show progress. The user should never wonder "did that work?" Feedback within 100ms of user action.

**UX-33: Empty states must be helpful, not blank.**
Show: what this area is for, why it's empty, and how to fill it. Include a descriptive text and a primary action. No blank white space.

**UX-34: Error states must be recoverable.**
Show what went wrong (human language, not error codes). Show how to fix it. Preserve user input on error. Retry buttons for network failures.

---

## Category 5: Accessibility

**UX-37: Color contrast must meet WCAG 2.1 AA.**
Normal text: 4.5:1 minimum. Large text (18px+ or 14px+ bold): 3:1 minimum. UI components: 3:1 minimum.

**UX-38: All functionality must be keyboard accessible.**
Tab through all interactive elements in logical order. Enter/Space activates buttons. Escape closes modals/popovers.

---

## UX Child PRD Template

When generating a UX child PRD (via `ux_generate`), follow this structure:

```markdown
# UX Child PRD - {Project Name}

## Screen Inventory
| Screen | Primary Action | Secondary Actions | UX Mode |
|--------|---------------|-------------------|---------|
| {name} | {action}      | {actions}         | {standard/selective/deep_dive} |

## Critical User Flows
1. {Flow name}: {step 1} -> {step 2} -> ... -> {success state}
   - Happy path: {description}
   - Error path: {what could go wrong + recovery}

## State Contracts
| Screen | Loading | Empty | Error | Success |
|--------|---------|-------|-------|---------|
| {name} | {what user sees} | {empty state design} | {error recovery} | {confirmation} |

## Component Inventory
| Component | Instances | Variants | States |
|-----------|-----------|----------|--------|
| {name}    | {where used} | {sizes, styles} | {default, hover, active, disabled, error} |

## Copy Inventory
| Location | Copy | Rule | Notes |
|----------|------|------|-------|
| {screen.element} | {text} | UX-{nn} | {context} |

## Accessibility Checklist
- [ ] Keyboard navigation flow documented
- [ ] Color contrast verified (UX-37)
- [ ] All interactive elements keyboard accessible (UX-38)
- [ ] Form inputs have visible labels (UX-28)
- [ ] Empty and error states designed (UX-33, UX-34)

## Visual Wireframes (MANDATORY for Deep Dive mode, score >= 7)
- **Location:** `{project_path}/wireframes/index.html`
- **Browser URL:** `http://localhost:{port}` (served via local HTTP server)
- **Format:** Standalone HTML with Low-Fi (grayscale) + High-Fi (full color) tabs per screen
- **Required per screen:** Actual layout, real copy, all states, design tokens, annotations
- **Status:** {Generated / Pending / N/A (Standard mode)}
```

---

## Severity Classification

| Severity | Criteria | Example |
|----------|----------|---------|
| **Critical** | Blocks functionality, accessibility violation | Missing keyboard access (UX-38), no error recovery (UX-34) |
| **High** | Significantly degrades experience | Missing loading states (UX-31), no visual hierarchy (UX-01) |
| **Medium** | Noticeable quality reduction | Inconsistent spacing (UX-02), weak type scale (UX-08) |
| **Low** | Polish item | Could add micro-interaction, improve empty state |

---

> **Want the full 42 rules + 8 specialist modules?**
> RC Engine Pro includes: Layout (7 rules), Typography (6), Color (5), Navigation (5), Interactive (7), Feedback (6), Accessibility (6), plus specialist modules for forms, dashboards, onboarding, admin, payment, component libraries, content, and navigation patterns.
