# RC Method: Owner Gate

> **Skill Type:** All Gated Phases (1-5, 7-8)
> **Activates:** At every phase transition requiring operator approval
> **Output:** `rc-method/gates/GATE-[phase#]-[phase-name]-[date].md`

## Purpose

The Owner Gate is the enforcement mechanism that makes the RC Method different from every other framework. It ensures the non-technical product owner sees, understands, and explicitly approves every major decision before work proceeds. **No gate, no progress.**

## Gate Presentation Rules

### Rule 1: Business Language Only
NEVER present technical details without business translation.

**Wrong:** "The REST API uses JWT auth with RS256 signing and refresh token rotation."
**Right:** "Users log in securely. Their session stays active for 24 hours. If someone steals a login token, it expires in 15 minutes and can't be reused."

### Rule 2: Show Impact, Not Implementation
Every gate item should answer: **"What does this mean for my business/users/timeline/budget?"**

### Rule 3: Binary Decision
Every gate ends with a clear yes/no question. No ambiguity.

### Rule 4: Record Everything
Every gate decision is logged to `rc-method/gates/` with timestamp, decision, and reasoning.

## Gate Record Template

```markdown
# Gate Record: [Phase Name]
## RC Method — Gate Decision Log

**Project:** [Name]
**Phase:** [# — Name]
**Date:** [ISO timestamp]
**Decision:** APPROVED / REJECTED
**Decided by:** [Operator name/identifier]

---

### What Was Presented
[2-3 sentence summary of the gate presentation]

### Key Artifacts
- [File 1 path — brief description]
- [File 2 path — brief description]

### Decision
**APPROVED** / **REJECTED**

### Operator Feedback
[Exact text of the operator's response — quoted directly]

### Conditions (if any)
- [Condition 1]
- [Condition 2]

### What Happens Next
[Next phase that activates as a result of this decision]
```

## Gate Types

### Standard Gate (End of Phase)
Used at normal phase transitions. Presents summary + asks for approval.

### Emergency Gate (Scope Change During Build)
Triggered during Forge when scope changes are discovered:

```
═══════════════════════════════════════════════════
🚨 RC METHOD EMERGENCY GATE
═══════════════════════════════════════════════════

⚠️ BUILD PAUSED — Decision Required

During [Phase 6: Forge], the following was discovered:
  [Clear description of what changed and why]

Impact on your project:
  • Timeline: [How this affects delivery]
  • Scope: [What needs to change]
  • Cost: [Additional effort required]

Options:
  A) [Option A — and its trade-off]
  B) [Option B — and its trade-off]
  C) [Pause build and re-plan]

→ Type "A", "B", or "C" to decide
═══════════════════════════════════════════════════
```

### Re-Gate (After Rejection Fixes)
```
═══════════════════════════════════════════════════
🔄 RC METHOD RE-GATE: [Phase Name]
═══════════════════════════════════════════════════

Previously rejected on [date]. You requested:
  1. [Change 1] → ✅ Addressed: [how]
  2. [Change 2] → ✅ Addressed: [how]

🔑 Ready to re-approve?
→ Type "approve" to proceed
→ Type "still not right [feedback]" to iterate
═══════════════════════════════════════════════════
```

## Phase-Specific Gate Content

| Phase | Present | Decision Question |
|-------|---------|-------------------|
| Illuminate | What exists today, what's broken, what's manual | "Do these findings accurately represent your current situation?" |
| Define | PRD scope — what gets built, what doesn't | "Is this what you want built? Anything missing or wrong?" |
| Architect | Tech approach in plain language | "Are you comfortable with this approach?" |
| Sequence | Build order + timeline estimate | "Does this build order match your business priorities?" |
| Validate | Quality report — security, tokens, scope | "Everything checks out. Ready to start building?" |
| Connect | Integration + deployment plan | "Ready to go live with these connections?" |
| Compound | Learnings + launch readiness | "Ready to release this to your users?" |

## Approval Shortcuts

- `approve` — approve and advance
- `reject [reason]` — reject with feedback
- `question [text]` — ask for clarification without approving/rejecting
- `defer` — pause this gate, come back later
- `skip` — NOT ALLOWED. Gates cannot be skipped.

## Skip Prevention

If the operator says "just skip the gate" or "I don't need to approve this":

```
I understand you want to move fast, and I respect that. But the
RC Method's gates exist because decisions made now affect everything
downstream. Skipping a gate means:

  • Changes could be made you didn't agree to
  • Scope could drift without your knowledge
  • Issues caught later cost 10x more to fix

This gate takes 2 minutes to review. The rework from skipping it
could take 2 days.

[Present the gate summary anyway]
```

**The only exception:** The operator can say `approve all remaining gates for this session` to batch-approve within a single build session. This is logged as a batch approval.
