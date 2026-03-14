# RC Method: Quality Gate

> **Skill Type:** Phase 5 (Validate)
> **Activates:** After Sequence gate, before any build session, or on-demand
> **Output:** Quality report presented to operator; fixes applied to PRDs/tasks

## Purpose

Validate PRDs and task lists against security anti-patterns and token budget constraints BEFORE any code is written. This is the "catch it early" phase — fixing an anti-pattern in a PRD costs 5 minutes; fixing it in deployed code costs days.

## Quality Check #1: Anti-Pattern Scan

### What It Does

Reads the active PRD(s) and task list, then cross-references against `docs/reference/ANTI_PATTERNS_BREADTH.md` to identify potential security and architectural issues BEFORE they become code.

### How to Run

1. Load the relevant PRD (parent or child)
2. Load the corresponding task list
3. Reference `docs/reference/ANTI_PATTERNS_BREADTH.md`
4. For each task, check if the described implementation could trigger any anti-pattern

### Anti-Pattern Categories to Check

| Category | What to Look For in PRD/Tasks | Severity |
|----------|-------------------------------|----------|
| **Secrets Management** | Any mention of API keys, credentials, passwords in task descriptions | Critical |
| **Input Validation** | User-facing forms or inputs without explicit validation requirements | High |
| **Authentication** | Features requiring login/auth without specifying auth method | Critical |
| **SQL/Injection** | Database queries mentioned without parameterization note | Critical |
| **File Uploads** | File handling without size/type validation in acceptance criteria | Critical |
| **XSS** | User-generated content display without encoding requirement | Critical |
| **Rate Limiting** | Public-facing APIs without rate limit specification | High |
| **Data Exposure** | API responses without field-level filtering specified | High |
| **Error Handling** | Features without error/edge case acceptance criteria | Medium |
| **Session Management** | Auth features without session handling specification | High |

### Scan Process

For each task in the task list:

```
TASK-XXX: [Description]
  → Check: Does this task involve user input?
    → If yes: Is input validation in the acceptance criteria?
    → If no validation specified: FLAG as "Missing Input Validation (CWE-20)"

  → Check: Does this task involve database operations?
    → If yes: Does the task or PRD specify parameterized queries?
    → If not specified: FLAG as "Potential SQL Injection (CWE-89)"

  → Check: Does this task involve displaying user content?
    → If yes: Is output encoding in the acceptance criteria?
    → If not specified: FLAG as "Potential XSS (CWE-79)"

  → Check: Does this task involve authentication or API keys?
    → If yes: Is credential management specified (env vars, vault)?
    → If not specified: FLAG as "Potential Hardcoded Secrets (CWE-798)"

  → Check: Does this task create an API endpoint?
    → If yes: Is auth + rate limiting specified?
    → If not specified: FLAG as "Missing Auth/Rate Limit (CWE-287/CWE-770)"

  → Check: Does this task involve file uploads?
    → If yes: Is file type/size validation specified?
    → If not specified: FLAG as "Unrestricted File Upload (CWE-434)"
```

### Scan Output Format

```
═══════════════════════════════════════════════════
🛡️ RC METHOD QUALITY GATE: ANTI-PATTERN SCAN
═══════════════════════════════════════════════════

📄 Source: [PRD filename]
📋 Tasks Scanned: [count]
🔍 Anti-Patterns Reference: ANTI_PATTERNS_BREADTH.md

🔴 CRITICAL (Must fix before build):
  • TASK-003: [Finding + CWE reference + Fix suggestion]

🟡 HIGH (Should fix before build):
  • TASK-005: [Finding + Fix suggestion]

🟢 PASSED:
  • TASK-001: Setup — no security surface (✓)

  VERDICT: [PASS — ready to build / FAIL — fixes required]

→ Type "fix all" to auto-update PRD and tasks with fixes
→ Type "fix [task#]" to fix specific items
→ Type "override [reason]" to proceed despite warnings
═══════════════════════════════════════════════════
```

## Quality Check #2: Token Budget Audit

### Token Thresholds

| Artifact | Target | Warning | Critical |
|----------|--------|---------|----------|
| Main PRD | ≤ 3,000 tokens | 3,001–4,000 | > 4,000 |
| Child PRD | 1,500–2,500 tokens | 2,501–3,000 | > 3,000 |
| UX Child PRD | ≤ 2,500 tokens | 2,501–3,000 | > 3,000 |
| Task list (per feature) | ≤ 2,000 tokens | 2,001–2,500 | > 2,500 |
| Session package (PRD + tasks) | ≤ 4,500 tokens | 4,501–5,500 | > 5,500 |
| Session package with UX PRD | ≤ 6,000 tokens | 6,001–7,000 | > 7,000 |

## Quality Check #3: Scope Drift Detection

### Detection Rules

- **Added scope:** Task exists that maps to no PRD acceptance criterion
- **Missing scope:** PRD acceptance criterion has no corresponding task
- **Changed scope:** Task description contradicts PRD specification

## Quality Check #4: UX Quality Scan

**Runs when:** Task list contains any `[UI]` tasks.
**Reference:** `rc-method/skills/rc-ux-core.md` (42 core rules)

### UX Scan Process

For each `[UI]` task in the task list:

```
TASK-XXX [UI]: [Description]
  → Check: Are loading/empty/error/success states defined in acceptance criteria?
    → If missing ANY state: FLAG as "Incomplete State Coverage (UX Rules #15, #19, #20)"

  → Check: Does acceptance criteria include hover/focus/active/disabled states?
    → If no interaction states: FLAG as "Missing Interaction States (UX Rule #11)"

  → Check: Is keyboard navigation specified (Tab, Enter/Space, Esc)?
    → If not specified: FLAG as "Missing Keyboard Support (UX Rule #40)"

  → Check: Are form fields required to have visible labels (not just placeholders)?
    → If not specified: FLAG as "Accessibility Risk — Labels (UX Rule #38)"

  → Check: Is there more than one primary CTA on the screen?
    → If yes: FLAG as "Competing Primary Actions (UX Rule #30)"

  → Check: Is the screen referenced in PRD-[project]-ux.md state contracts?
    → If UX PRD exists but screen is missing: FLAG as "Missing UX Spec Coverage"
```

### UX-Specific Checks (across all tasks)

| Check | What to Look For | Severity | Rule |
|---|---|---|---|
| Missing states | `[UI]` task with no loading/empty/error/success criteria | High | #15, #19, #20 |
| Unclear primary CTA | Screen with 2+ equally-styled action buttons | Medium | #30 |
| Design system drift | Any `[UI]` task referencing hardcoded colors/spacing | Medium | #6, #8, #42 |
| Accessibility gaps | Form without label requirements, no keyboard spec | High | #38, #40 |
| White-label risk | Generic CRUD layout with no visual hierarchy spec | Medium | #31, #34 |
| Missing UX spec | `[UI]` tasks exist but no UX child PRD (score ≥ 7) | High | — |
| Copy gaps | Error/empty states with no microcopy defined | Medium | #19, #20 |

### UX Scan Output Format

```
═══════════════════════════════════════════════════
🎨 RC METHOD QUALITY GATE: UX SCAN
═══════════════════════════════════════════════════

📄 Source: [PRD + Tasks]
📋 UI Tasks Scanned: [count of [UI] tasks]
📐 UX Reference: rc-ux-core.md (42 core rules)

🔴 HIGH (Fix before build):
  • TASK-012 [UI]: Missing loading/error states (Rules #15, #19)
  • TASK-015 [UI]: No keyboard navigation spec (Rule #40)

🟡 MEDIUM (Should fix):
  • TASK-013 [UI]: Two primary buttons on same screen (Rule #30)
  • TASK-014 [UI]: Hardcoded color in description (Rule #42)

🟢 PASSED:
  • TASK-011 [UI]: All states covered, keyboard spec included (✓)

  UI TASKS: [X] passed, [Y] flagged
  VERDICT: [PASS / FIXES NEEDED]
═══════════════════════════════════════════════════
```

## Quality Check #5: Test Script Coverage

**Runs when:** Task list contains any `[UI]`, `[API]`, or `[INTEGRATION]` tasks.
**Reference:** `rc-method/skills/rc-test-scripts.md`

### What It Does

Verifies that every task requiring a user test script has adequate `[TEST-CRITERIA]` defined. Tasks without test criteria will produce weak or missing test scripts during Forge.

### Test Coverage Scan Process

For each `[UI]`, `[API]`, or `[INTEGRATION]` task:

```
TASK-XXX [UI/API/INTEGRATION]: [Description]
  → Check: Does the task include a "Test criteria" section?
    → If missing entirely: FLAG as "Missing Test Criteria — no test script will be generated"

  → Check: Does the test criteria include a happy path scenario?
    → If missing: FLAG as "No Happy Path — primary flow untested"

  → Check: Does the test criteria include an error/failure scenario?
    → If missing: FLAG as "No Error Path — failure behavior undefined"

  → Check: For [UI] tasks, does test criteria reference states (empty/loading/error)?
    → If missing: FLAG as "UI States Not Covered in Test Criteria"
```

### Coverage Summary

```
Total tasks requiring test scripts: [X]
Tasks with complete test criteria: [Y]
Tasks missing test criteria: [Z]
Coverage: [Y/X] ([%])
```

### Severity Levels

| Finding | Severity | Impact |
|---------|----------|--------|
| Missing test criteria entirely | High | No test script generated — bugs ship silently |
| Missing happy path | High | Primary user flow untested |
| Missing error path | Medium | Failure behavior undefined |
| Missing edge cases | Low | Boundary bugs may surface later |

### Test Coverage Output Format

```
═══════════════════════════════════════════════════
🧪 RC METHOD QUALITY GATE: TEST SCRIPT COVERAGE
═══════════════════════════════════════════════════

📄 Source: [Task list filename]
📋 Tasks Requiring Test Scripts: [count]
📐 Reference: rc-test-scripts.md

🔴 HIGH (Must fix before build):
  • TASK-005 [API]: Missing test criteria entirely
  • TASK-008 [UI]: No error path defined

🟡 MEDIUM (Should fix):
  • TASK-012 [INTEGRATION]: No edge case scenario

🟢 PASSED:
  • TASK-003 [API]: Happy path + error + edge case (✓)
  • TASK-009 [UI]: All states + happy path + error (✓)

  COVERAGE: [X] of [Y] tasks have complete test criteria ([%])
  VERDICT: [PASS / FIXES NEEDED]
═══════════════════════════════════════════════════
```

## Combined Quality Report

When all checks complete, present a unified report:

```
═══════════════════════════════════════════════════
🚦 RC METHOD QUALITY GATE: FULL REPORT
═══════════════════════════════════════════════════

📍 Phase: 5 — Validate
📄 Source: [PRD + Tasks]

  🛡️ Anti-Pattern Scan:  [PASS/FAIL] — [X] critical, [Y] high
  📊 Token Budget:       [PASS/WARN/FAIL]
  🎯 Scope Alignment:    [PASS/FAIL] — [X] gaps
  🎨 UX Quality:         [PASS/FAIL/N/A] — [X] high, [Y] medium (N/A if no [UI] tasks)
  🧪 Test Coverage:      [PASS/FAIL/N/A] — [X] of [Y] tasks covered (N/A if no [UI]/[API]/[INTEGRATION] tasks)

  OVERALL VERDICT: [READY TO BUILD / FIXES REQUIRED]

→ Type "approve" to pass the Validate gate
→ Type "fix" to address findings first
═══════════════════════════════════════════════════
```

## Auto-Fix Capabilities

When the operator types "fix all":
1. Add missing input validation criteria to relevant tasks
2. Add auth requirements to unprotected API tasks
3. Add rate limiting specs to public endpoints
4. Reduce verbose task descriptions to hit token targets
5. Add missing tasks for uncovered PRD criteria
6. Remove tasks that don't map to approved PRD scope
7. **UX fixes:** Add loading/empty/error/success state criteria to `[UI]` tasks missing them
8. **UX fixes:** Add keyboard navigation requirements to `[UI]` tasks missing them
9. **UX fixes:** Add accessibility baseline (labels, contrast, tap targets) to `[UI]` tasks
10. **UX fixes:** Flag and resolve competing primary CTAs per screen
11. **Test fixes:** Add missing test criteria (happy path + error path) to `[UI]`, `[API]`, `[INTEGRATION]` tasks that lack them
12. **Test fixes:** Add edge case scenarios to tasks with only happy/error paths

All auto-fixes are logged in `rc-method/logs/DECISIONS-[project].md`.
