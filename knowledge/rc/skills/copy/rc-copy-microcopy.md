# Microcopy & UX Writing Patterns — Starter Edition

> Community edition with essential microcopy patterns.
> Upgrade to RC Engine Pro for complete patterns (notifications, onboarding flows, confirmation dialogs), loading state rules, and tooltip guidelines.

## Microcopy Principles

1. **Be specific, not generic**: "Create project" not "Submit"
2. **Be helpful, not clever**: Clarity beats wit in UI text
3. **Be brief, not terse**: Enough words to be clear, no more
4. **Be human, not robotic**: "Something went wrong" not "Error 500"
5. **Be action-oriented**: Tell users what to DO, not just what happened
6. **Be consistent**: Same action = same words everywhere

---

## Form Copy

### Field Labels
- Use nouns, not questions: "Email address" not "What's your email?"
- Be specific: "Work email" not just "Email" (if business context)
- Required fields: mark optional fields, not required (most are required)

### Placeholder Text
- Show format examples: "name@company.com" not "Enter your email"
- Never use placeholder as the only label

### Validation Messages

| State | Pattern | Example |
|-------|---------|---------|
| **Required** | "[Field] is required" | "Email address is required" |
| **Format** | "Enter a valid [format]" + example | "Enter a valid email, like name@company.com" |
| **Length** | "[Field] must be at least [n] characters" | "Password must be at least 8 characters" |
| **Match** | "[Fields] don't match" | "Passwords don't match" |

### Submit Buttons
- Use the specific action verb: "Send message", "Create project", "Save changes"
- Never "Submit" — it's generic
- During processing: "Sending..." / "Creating..."

---

## Empty States

| Type | Headline | Body | CTA |
|------|----------|------|-----|
| **First use** | "No projects yet" | "Create your first project to get started" | "New project" |
| **No results** | "No results for '[query]'" | "Try different keywords or remove some filters" | "Clear filters" |
| **Error-caused** | "Couldn't load [items]" | "Check your connection and try again" | "Retry" |

---

## Error States

### Error Message Rules
- **No blame**: "That didn't work" not "You did it wrong"
- **No jargon**: "Something went wrong" not "Error 500"
- **No panic**: No exclamation marks, no "Oops!"
- **Always include recovery**: What to do next

| Error | Headline | Body | CTA |
|-------|----------|------|-----|
| **404** | "Page not found" | "The page you're looking for doesn't exist or has been moved." | "Go to homepage" |
| **500** | "Something went wrong" | "We're working on it. Try refreshing the page." | "Refresh page" |
| **Offline** | "You're offline" | "Check your internet connection and try again." | "Retry" |

---

## Success States

| Action | Toast Message |
|--------|-------------|
| **Created** | "[Item] created" |
| **Updated** | "Changes saved" |
| **Deleted** | "[Item] deleted" + "Undo" |
| **Copied** | "Copied to clipboard" |

---

## Microcopy Checklist

- [ ] Every button label is a specific action verb
- [ ] Every error message tells the user how to fix it
- [ ] Every empty state has a clear CTA
- [ ] All validation messages are constructive and blame-free
- [ ] Terminology is consistent across the entire product
- [ ] No "Submit", "Click here", "N/A", or "Error" anywhere
