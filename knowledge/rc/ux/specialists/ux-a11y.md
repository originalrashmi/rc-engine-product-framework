# UX Specialist: Accessibility

## Focus Area
WCAG 2.1 AA compliance, keyboard navigation, screen reader support, motor impairment accommodations, and cognitive accessibility.

## Accessibility Rules

### Perceivable
- All non-text content has text alternatives (images: `alt`, icons: `aria-label`)
- Decorative images use `alt=""` (not omitted, which makes screen readers read filename)
- Video/audio has captions or transcripts
- Color is not the sole means of conveying information (UX-16)
- Contrast ratios met: 4.5:1 normal text, 3:1 large text, 3:1 UI components (UX-37)
- Text can be resized to 200% without loss of content or functionality
- Content does not require specific orientation (landscape/portrait)

### Operable
- All functionality available via keyboard (UX-38)
- No keyboard traps (user can Tab away from any element)
- Focus order follows logical reading order
- Focus indicator is visible and meets 3:1 contrast (UX-39)
- Skip navigation link as first focusable element
- No time limits (or provide extend/disable option)
- No content that flashes more than 3 times per second
- Page titles are descriptive and unique
- Link purpose is clear from link text alone (no "click here")
- Touch targets minimum 44x44px (UX-25)

### Understandable
- Language attribute set on `<html>` element
- Form inputs have associated `<label>` elements (UX-28)
- Error messages identify the field and describe the error in text (UX-34)
- Input purpose indicated for autofill (`autocomplete` attribute)
- Consistent navigation across pages (UX-20)
- No unexpected context changes on focus or input

### Robust
- Valid, semantic HTML (UX-42)
- ARIA used correctly: `role`, `aria-label`, `aria-describedby`, `aria-live`
- Custom components follow WAI-ARIA Authoring Practices
- Content works across modern assistive technologies (NVDA, VoiceOver, JAWS)

### Cognitive Accessibility
- Simple, clear language (avoid jargon without explanation)
- Consistent layout patterns across pages
- Error recovery doesn't require memory of previous steps
- Important actions are reversible (undo > confirmation)
- Progress saved automatically for complex tasks

## ARIA Patterns Quick Reference

| Component | Role | Key Interactions | ARIA |
|-----------|------|-----------------|------|
| Modal | `dialog` | Escape closes, focus trapped | `aria-modal="true"`, `aria-labelledby` |
| Tabs | `tablist` / `tab` / `tabpanel` | Arrow keys switch, Enter selects | `aria-selected`, `aria-controls` |
| Dropdown | `listbox` / `option` | Arrow keys navigate, Enter selects | `aria-expanded`, `aria-activedescendant` |
| Toast | `alert` or `status` | Auto-announce | `role="alert"` or `aria-live="polite"` |
| Accordion | `button` + region | Enter/Space toggles | `aria-expanded`, `aria-controls` |
| Menu | `menu` / `menuitem` | Arrow keys, Enter, Escape | `aria-haspopup`, `aria-expanded` |

## Audit Checklist
- [ ] Contrast ratios pass WCAG AA (UX-37)
- [ ] All interactive elements keyboard accessible (UX-38)
- [ ] Focus indicators visible and styled (UX-39)
- [ ] Screen reader announces all dynamic changes (UX-40)
- [ ] Reduced motion respected (UX-41)
- [ ] Semantic HTML used correctly (UX-42)
- [ ] Skip-to-content link present
- [ ] Form labels associated with inputs
- [ ] Images have appropriate alt text
- [ ] ARIA roles used correctly (not overused)
