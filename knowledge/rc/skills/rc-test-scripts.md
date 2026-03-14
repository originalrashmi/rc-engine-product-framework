# RC Method: User Test Scripts

> **Skill Type:** Phase 6 (Forge) — Post-Task Verification
> **Activates:** After each `[UI]`, `[API]`, or `[INTEGRATION]` task is forged
> **Output:** Test script appended to forge task output
> **Feeds into:** Phase 8 (Compound) learnings

## Purpose

Generate structured, human-readable test scripts after each qualifying task so bugs are caught during build — not at demo time. Test scripts are manual QA procedures a product owner or tester can run immediately after a task is complete.

## Scope — Which Tasks Get Test Scripts

| Task Type | Test Script? | Reason |
|-----------|-------------|--------|
| `[UI]` | Yes | User-facing, highest regression risk |
| `[API]` | Yes | Behavior contracts that break silently |
| `[INTEGRATION]` | Yes | Cross-boundary, hardest to debug |
| `[SETUP]` | No | Binary pass/fail, verified by pipeline |
| `[DATA]` | No | Verified by migration/seed success |
| `[CONFIG]` | No | Verified by deployment pipeline |
| `[TEST]` | No | Is itself a test — no recursion |

## Test Script Template

Every test script follows this structure:

```markdown
═══════════════════════════════════════════════════
🧪 USER TEST SCRIPT: [TASK-ID]
═══════════════════════════════════════════════════

📋 Task: [Task description]
🏷️ Type: [UI / API / INTEGRATION]
📄 PRD Criteria: [Which acceptance criterion this verifies]

## Prerequisites
- [ ] [What must be true before testing — e.g., "logged in as test user", "dev server running"]

## Test Cases

### TC-1: Happy Path — [Scenario name]
**Given:** [Starting state]
**When:** [Action taken]
**Then:** [Expected result]
**Pass:** [ ] Yes  [ ] No
**Notes:** ___

### TC-2: [Edge case / Error path]
**Given:** [Starting state]
**When:** [Action taken]
**Then:** [Expected result]
**Pass:** [ ] Yes  [ ] No
**Notes:** ___

### TC-3: [Additional scenario if needed]
...

## Accessibility Check (UI tasks only)
- [ ] Keyboard: Tab reaches all interactive elements
- [ ] Keyboard: Enter/Space activates buttons and links
- [ ] Keyboard: Esc dismisses modals/dropdowns
- [ ] Screen reader: All form fields have visible labels
- [ ] Contrast: Text passes 4.5:1 ratio check
- [ ] Tap targets: All clickable elements ≥ 44×44px

## Result
- **Status:** [ ] ALL PASS  [ ] PARTIAL  [ ] FAIL
- **Bugs found:** ___
- **Blocked by:** ___

═══════════════════════════════════════════════════
```

## Generation Rules

### For `[UI]` Tasks
Generate test cases for:
1. **Happy path** — The primary user flow works end-to-end
2. **Empty state** — What the user sees with no data
3. **Error state** — What happens when something fails (network error, validation error)
4. **Loading state** — Spinner/skeleton renders during async operations
5. **Interaction states** — Hover, focus, active, disabled behave correctly
6. **Responsive** — Layout doesn't break at 375px mobile width

Minimum: 3 test cases. Maximum: 6.

### For `[API]` Tasks
Generate test cases for:
1. **Happy path** — Correct request returns expected response
2. **Validation error** — Invalid input returns 400 with clear error message
3. **Auth guard** — Unauthenticated request returns 401 (if endpoint is protected)
4. **Not found** — Missing resource returns 404
5. **Edge case** — Boundary values, empty arrays, null fields

Minimum: 3 test cases. Maximum: 5.

### For `[INTEGRATION]` Tasks
Generate test cases for:
1. **Happy path** — Integration works end-to-end
2. **External service down** — Graceful degradation when dependency is unavailable
3. **Timeout** — Request doesn't hang indefinitely
4. **Data mismatch** — Handles unexpected response shape from external service

Minimum: 2 test cases. Maximum: 4.

## Test Script Quality Rules

1. **Every test case is runnable.** No vague "verify it works" — state exact inputs and expected outputs.
2. **Prerequisites are explicit.** Don't assume the tester knows the setup.
3. **Test cases map to PRD criteria.** Every script references which acceptance criterion it verifies.
4. **No implementation details.** Write for a non-technical product owner — describe what to do, not how the code works.
5. **Keep it short.** Each test case is 3-4 lines (Given/When/Then). No essays.
6. **Accessibility checks are mandatory for UI.** Every `[UI]` test script includes the a11y checklist.

## Compound Integration (Phase 8)

Test script results feed directly into Phase 8 (Compound) learnings:

### What Compound Captures from Test Scripts
- **Pass rate per task type** — Which task types have the most failures?
- **Common failure patterns** — Do the same categories of bugs recur? (e.g., missing error states, broken keyboard nav)
- **Bug discovery timing** — Were bugs caught by test scripts during Forge, or found later?
- **Methodology improvements** — Should certain test cases be added to task acceptance criteria upfront?

### Compound Report Section (auto-generated)
```markdown
## Test Script Analysis

| Metric | Value |
|--------|-------|
| Total scripts generated | [X] |
| Tasks with all tests passing | [X] ([%]) |
| Tasks with partial failures | [X] ([%]) |
| Tasks with full failures | [X] ([%]) |

### Top Failure Patterns
1. [Pattern] — occurred in [X] tasks
2. [Pattern] — occurred in [X] tasks

### Methodology Recommendations
- [Recommendation based on failure patterns]
```

## File Convention

Test scripts are NOT saved as separate files. They are appended to the `rc_forge_task` output so the developer sees them immediately after implementation guidance. Results (pass/fail) are logged in `rc-method/logs/TEST-RESULTS-[project].md` during Compound phase.
