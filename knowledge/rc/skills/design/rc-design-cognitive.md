# Cognitive Psychology for Design

## Purpose
Provide the Design Agent with cognitive science principles to ground design decisions in how humans actually perceive, process, and interact with interfaces.

---

## Core Laws

### Miller's Law (Cognitive Chunking)
**Working memory holds 7 plus/minus 2 items.**

Design implications:
- Navigation: max 5-7 top-level items
- Form sections: group fields into chunks of 3-5
- Dashboard widgets: max 5-7 visible at once
- Options in a dropdown: group beyond 7 items
- Steps in a wizard: ideally 3-5 steps

### Hick's Law (Decision Time)
**Decision time increases logarithmically with the number of choices.**

Formula: T = b * log2(n + 1)

Design implications:
- Reduce options at each decision point (3-5 ideal)
- Use progressive disclosure: show basics first, details on demand
- Provide opinionated defaults: pre-select the best option
- Group and categorize when many options are necessary
- "Recommended" badges reduce decision paralysis

### Fitts' Law (Target Acquisition)
**Time to reach a target depends on distance and size.**

Formula: T = a + b * log2(D/W + 1)

Design implications:
- Primary CTAs should be large and easy to reach
- Related actions should be close together
- Mobile: place key actions in thumb-reach zones (bottom of screen)
- Corner and edge targets are easier (Fitts' infinite edge)
- Don't place destructive actions near constructive ones

### Gestalt Principles

**Proximity**: Elements close together are perceived as related.
→ Group related form fields; space between sections > space within sections.

**Similarity**: Elements that look alike are perceived as related.
→ Consistent styling for same-type elements (all links blue, all buttons rounded).

**Continuity**: Eyes follow smooth lines and curves.
→ Align elements along invisible lines; don't break visual flow.

**Closure**: The brain fills in gaps to see complete shapes.
→ You can imply boundaries without drawing them; card layouts work because of closure.

**Figure-Ground**: Elements are perceived as either foreground (important) or background.
→ Modals use backdrop overlay; selected items use highlight color.

**Common Region**: Elements within the same boundary are grouped.
→ Cards, panels, and bordered sections create groups without explicit labels.

**Common Fate**: Elements moving in the same direction are grouped.
→ Animating items together implies they belong together.

---

## Cognitive Load Theory (Sweller)

Three types of load:

| Type | Definition | Design Goal |
|------|-----------|-------------|
| **Intrinsic** | Complexity inherent to the task | Simplify task structure; break complex tasks into steps |
| **Extraneous** | Load added by poor design | ELIMINATE: confusing layouts, inconsistent patterns, unnecessary decoration |
| **Germane** | Load from learning/understanding | SUPPORT: good mental models, progressive disclosure, helpful feedback |

### Reducing Extraneous Load
- Remove visual clutter (every element must earn its place)
- Consistent interaction patterns (same action = same gesture everywhere)
- Minimize required memory (show, don't make them remember)
- Reduce navigation complexity (fewer clicks to goal)
- Use familiar patterns (don't innovate on standard interactions)

### Supporting Germane Load
- Good onboarding builds correct mental models
- Feedback confirms understanding ("You selected 3 items for export")
- Consistent metaphors (folder = container, trash = delete, etc.)
- Progressive complexity (start simple, unlock advanced features)

---

## Information Foraging Theory (Pirolli & Card)

**Users forage for information like animals forage for food.**

Key concept: **Information Scent** - the strength of cues that indicate valuable content ahead.

Design implications:
- **Strong scent**: descriptive link text, clear categories, preview snippets
- **Weak scent**: vague labels ("Resources"), mystery icons, generic thumbnails
- Users follow the strongest scent trail - make your primary path smell the strongest
- Breadcrumbs provide scent going backward
- Search suggestions provide scent for exploration

---

## Aesthetic-Usability Effect (Kurosu & Kashimura)

**Users perceive aesthetically pleasing designs as more usable.**

This is both an opportunity and a risk:
- **Opportunity**: Beautiful design creates positive first impressions and more patience with issues
- **Risk**: Beautiful design can mask usability problems during testing
- **Action**: Design for beauty AND usability - don't sacrifice one for the other
- Users will forgive minor usability issues in beautiful interfaces
- Users will reject functional but ugly interfaces

---

## Applying Cognitive Science to Design Decisions

When designing, evaluate each screen against:

| Principle | Question | Red Flag |
|-----------|----------|----------|
| Miller's Law | Are there >7 unrelated items competing for attention? | Navigation with 12 items |
| Hick's Law | Is the user facing a wall of choices? | Settings page with 30 toggles |
| Fitts' Law | Are key actions easy to reach and large enough? | Tiny "Submit" button in corner |
| Proximity | Are related items visually grouped? | Form labels far from inputs |
| Similarity | Do same-type elements look the same? | Inconsistent button styles |
| Cognitive Load | Is there anything that could be removed without losing meaning? | Decorative elements that add no info |
| Info Scent | Do labels/links clearly indicate what's behind them? | "Click here", "Learn more" |
| Aesthetic-Usability | Does it look good AND work well? | Beautiful but confusing layout |
