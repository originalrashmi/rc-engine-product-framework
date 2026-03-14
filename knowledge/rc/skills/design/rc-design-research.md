# RC Design Research - Starter Edition

> Community edition with essential design research framework.
> Upgrade to RC Engine Pro for cognitive load analysis, emotional design mapping, behavioral psychology patterns, and competitive design auditing.

## Purpose

Guide the Design Research Brief phase. Before generating visual designs, understand the user, the problem space, and the design constraints. This prevents designing in a vacuum.

---

## Design Research Brief Structure

### 1. User Profile Summary
Extract from PRD and ICP data:
- **Primary user**: Who are they? (role, technical comfort, device preferences)
- **Context of use**: Where/when do they use this? (desk, mobile, distracted, focused)
- **Key goals**: What are they trying to accomplish? (jobs-to-be-done)
- **Pain points**: What frustrates them about current solutions?

### 2. Competitive Visual Audit
Review 3-5 competitors or comparable products:
- **Visual patterns**: What layout/interaction patterns are standard in this space?
- **Design gaps**: Where do competitors fall short visually or experientially?
- **Differentiation opportunities**: What can this product do differently?

### 3. Design Constraints
- **Brand**: Existing colors, fonts, logo, voice (if any)
- **Technical**: Framework constraints (e.g., Tailwind utility classes, component library)
- **Content**: How much content exists? Is it dynamic or static?
- **Platform**: Web-only, responsive, or native? Primary breakpoints?

### 4. Design Principles
Define 3-5 principles that guide design decisions:
- e.g., "Clarity over cleverness" - simple, scannable interfaces
- e.g., "Progressive disclosure" - show only what's needed now
- e.g., "Trust through transparency" - show state, explain actions

---

## ICP-to-Design Mapping

| ICP Attribute | Design Implication |
|--------------|-------------------|
| Non-technical users | Simpler interactions, more guidance, fewer options per screen |
| Technical/developer audience | Dense information, keyboard shortcuts, customization |
| Mobile-primary | Touch-friendly, bottom-nav, thumb-zone CTA placement |
| Desktop-primary | Sidebar nav, multi-column layouts, hover interactions |
| Time-pressured | Scannable layouts, clear CTAs, minimal cognitive load |
| Decision-making | Comparison views, data visualization, trust signals |
| First-time users | Onboarding flows, empty states with guidance, tooltips |
| Power users | Keyboard shortcuts, bulk actions, customizable views |

---

## Design Brief Output Format

```markdown
# Design Research Brief - {Project Name}

## User Profile
- Primary user: {description}
- Context: {where/when/how}
- Goals: {top 3}
- Pain points: {top 3}

## Competitive Landscape
| Competitor | Strengths | Weaknesses | Differentiation Opportunity |
|-----------|-----------|------------|---------------------------|
| {name} | {visual/UX strengths} | {gaps} | {what we can do better} |

## Design Constraints
- Brand: {existing assets or "greenfield"}
- Technical: {framework, component library}
- Content: {volume, type, dynamic/static}
- Platform: {primary device/breakpoint}

## Design Principles
1. {Principle}: {rationale}
2. {Principle}: {rationale}
3. {Principle}: {rationale}

## Recommended Approach
- Layout pattern: {e.g., dashboard, marketing, content-heavy}
- Visual direction: {e.g., minimal, bold, playful, professional}
- Key screens to design first: {prioritized list}
```
