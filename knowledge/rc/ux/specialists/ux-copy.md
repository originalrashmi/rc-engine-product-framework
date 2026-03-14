# UX Specialist: UI Copy & Microcopy

## Focus Area
Button labels, form labels, error messages, empty states, tooltips, onboarding text, confirmation dialogs, and all interface text that guides user behavior.

## Copy Rules

### General Principles
- Lead with the verb (action-first): "Save changes", not "Changes will be saved"
- Use the user's vocabulary, not internal jargon
- Be specific: "Delete project" not "Delete", "Save draft" not "Save"
- Keep it scannable: front-load important words
- Use sentence case for UI text (not Title Case except for proper nouns)
- One idea per sentence in UI copy
- No periods on single-sentence labels, tooltips, or button text

### Button Labels
- Use action verbs: "Create account", "Send message", "Export CSV"
- Match the button to the outcome: "Place order" not "Submit"
- Destructive actions state the consequence: "Delete permanently"
- Cancel buttons say "Cancel", not "No" or "Go back"
- Avoid generic labels: "OK", "Submit", "Yes", "No", "Click here"
- Primary CTA should be distinguishable by word choice AND visual treatment
- Max 3-4 words for button labels

### Error Messages
- State what happened: "Email address is already registered"
- State how to fix it: "Try signing in instead, or use a different email"
- Never blame the user: "Invalid input" → "Please enter a valid email address"
- Never show raw error codes or stack traces
- Inline errors next to the field, not in a banner at top of form
- Use plain language: "Something went wrong" → "We couldn't save your changes. Please try again."

### Empty States
- Explain what will be here: "Your notifications will appear here"
- Explain why it's empty (if not obvious): "You haven't created any projects yet"
- Provide a clear next action: "Create your first project"
- Tone: encouraging, not apologetic ("No results found" → "No matches yet. Try broadening your search.")

### Tooltips & Helper Text
- Tooltips for supplementary info, not essential instructions
- Helper text below inputs for format requirements: "Format: MM/DD/YYYY"
- Keep tooltips under 15 words
- Don't put critical information only in tooltips (it's hidden)

### Confirmation Dialogs
- Title states the action: "Delete this project?"
- Body explains consequences: "This will permanently remove all project files and cannot be undone."
- Confirm button matches the action: "Delete project" (not "Yes" or "OK")
- Cancel is always an option

### Loading & Progress
- Tell the user what's happening: "Saving your changes..." not just a spinner
- For long operations: "Uploading file (3 of 7)..."
- Success: "Changes saved" (brief, auto-dismiss)
- Never say "Please wait" without context

### Onboarding
- Welcome message: acknowledge the user, set expectations
- Step instructions: one action per step, clear outcome
- Skip option: always let the user skip onboarding
- Progressive disclosure: don't explain everything upfront

## Tone Spectrum
| Context | Tone | Example |
|---------|------|---------|
| Success | Brief, warm | "Done! Your report is ready." |
| Error | Calm, helpful | "We couldn't connect. Check your internet and try again." |
| Onboarding | Encouraging | "Great start! Let's set up your workspace." |
| Destructive | Serious, clear | "This action cannot be undone." |
| Empty state | Motivating | "No projects yet. Create one to get started." |
| Loading | Informative | "Loading your dashboard..." |

## Audit Checklist
- [ ] All buttons use action verbs (not "OK"/"Submit")
- [ ] Error messages explain the fix, not just the problem
- [ ] Empty states have description + next action (UX-33)
- [ ] No jargon or technical terms in user-facing copy
- [ ] Confirmation dialogs state consequences clearly (UX-27)
- [ ] Loading states describe what's happening (UX-32)
- [ ] Tooltip text is supplementary, not essential
- [ ] Consistent terminology (same action = same word everywhere)
