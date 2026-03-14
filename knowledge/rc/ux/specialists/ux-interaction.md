# UX Specialist: Interaction Design

## Focus Area
Form design, input handling, multi-step flows, drag-and-drop, modals, and all direct user-to-interface interactions.

## Interaction Rules

### Forms
- Labels above inputs (not inline placeholders that disappear)
- Group related fields visually (name fields together, address fields together)
- Inline validation on blur, not on every keystroke
- Show validation rules BEFORE the user fails (e.g., "Password: 8+ characters, 1 number")
- Auto-focus first empty field on error
- Tab order matches visual order (left-to-right, top-to-bottom)
- Submit button disabled only with clear explanation (UX-36)
- Show character count for textarea limits
- Auto-save for long forms (or warn on navigation away)
- Date inputs: use date picker, not free text (unless specific format is required)
- Phone/credit card: auto-format as user types

### Multi-Step Flows
- Show progress indicator (step X of Y, not just progress bar)
- Allow backward navigation without losing data
- Validate each step before allowing next
- Show summary/review step before final submission
- Persist progress (browser refresh shouldn't lose data)
- Steps should be meaningful chunks, not arbitrary splits
- Final step should clearly indicate irreversibility (if applicable)

### Modals & Overlays
- Trap focus inside modal (Tab cycles within, not to background)
- Close on Escape key press
- Close on backdrop click (unless destructive action in progress)
- Return focus to trigger element on close
- No nested modals (use a new page or slide panel instead)
- Modal content should be concise - if scrolling is needed, consider a page
- Overlay dismissal must not cause data loss

### Drag-and-Drop
- Grip handle affordance (6-dot icon or similar)
- Keyboard alternative: select item → arrow keys to move → Enter to confirm
- Visual feedback during drag (ghost element, drop zone highlighting)
- Announce reorder to screen readers via `aria-live`
- Support touch: long-press to initiate, clear drop targets
- Undo last reorder action

### Click & Tap
- Feedback within 100ms of interaction
- Double-click protection on submit actions (disable after first click)
- Long-press on mobile should not interfere with scroll
- Right-click context menus: provide alternative access to all actions
- Link targets open in same tab (unless explicitly external)

## Audit Checklist
- [ ] All forms have visible labels (UX-28)
- [ ] Tab order is logical (UX-38)
- [ ] Inline validation present (UX-34)
- [ ] Multi-step flows show progress
- [ ] Modals trap focus (UX-39)
- [ ] Drag interactions have keyboard alternatives (UX-30)
- [ ] Submit buttons show loading state (UX-31)
- [ ] Destructive actions have confirmation (UX-27)
