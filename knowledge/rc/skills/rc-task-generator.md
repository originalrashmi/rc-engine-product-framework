# RC Method: Task Generator

> **Skill Type:** Phase 4 (Sequence)
> **Activates:** After Architect gate approval, or when operator requests tasks from a PRD
> **Output:** `rc-method/tasks/TASKS-[project]-[feature].md`

## Purpose

Transform approved PRDs into actionable, sequenced task lists that a developer (human or AI) can execute without ambiguity. Tasks include dependencies, file paths, acceptance tests, and parallel execution markers.

## Pre-Generation Checks

Before generating tasks, VERIFY:
1. ✅ The source PRD has passed its owner gate (status: Approved)
2. ✅ If child PRDs exist, confirm which child this task list maps to
3. ✅ Architecture decisions are documented (tech stack, data model)
4. ✅ Anti-pattern check has NOT yet run (that happens in Validate phase, after tasks)
5. ✅ **UX Spec Check:** If tasks will include `[UI]` type, verify one of:
   - `PRD-[project]-ux.md` exists (required if UX Trigger Score ≥ 7), OR
   - UX Requirements section exists in the main PRD (sufficient for scores < 7), OR
   - Operator has explicitly opted out via "skip ux prd" (logged in decisions)
   If no UX spec exists and `[UI]` tasks are needed, STOP and recommend generating UX spec first.

If any check fails, STOP and route back to the appropriate phase.

## Task Generation Process

### Step 1: Parse PRD Features

For each feature in the source PRD:
- Extract all acceptance criteria
- Identify data requirements (inputs, outputs, storage)
- Map dependencies (what must exist before this can be built)
- Note the priority (Must Have → Should Have → Nice to Have)

### Step 2: Decompose into Tasks

Each acceptance criterion becomes one or more tasks. Apply these rules:

**Task Sizing:**
- Each task should be completable in 1-4 hours of AI-assisted dev time
- If a task would take longer, break it into subtasks
- If a task takes less than 30 minutes, merge it with related work

**Task Types:**
- `[SETUP]` — Environment, dependencies, configuration
- `[DATA]` — Database schema, models, migrations
- `[API]` — Backend endpoints, services, business logic
- `[UI]` — Frontend components, pages, interactions
- `[INTEGRATION]` — External API connections, webhooks
- `[TEST]` — Test creation and validation
- `[CONFIG]` — Environment variables, deployment config

**`[UI]` Task Requirements (enforced by `rc-ux-core.md`):**
Every `[UI]` task MUST include in its acceptance criteria:
- **State coverage:** loading, empty, error, and success states for the screen/component
- **Interaction states:** hover, focus, active, disabled for all interactive elements
- **Keyboard basics:** Tab navigation works, Enter/Space activates, Esc dismisses
- **Accessibility minimum:** visible labels on form fields, 4.5:1 contrast, 44×44px tap targets
- **UX spec reference:** Link to the relevant section in `PRD-[project]-ux.md` or cite the applicable core rule number from `rc-ux-core.md`

If a `[UI]` task lacks any of these, flag it during Validate (Quality Check #4).

**Test Script Scoping (enforced by `rc-test-scripts.md`):**
The following task types MUST include a `[TEST-CRITERIA]` section in their definition. This section provides the inputs that `rc_forge_task` uses to generate a user test script after implementation:

| Task Type | Test Script Required | Test Focus |
|-----------|---------------------|------------|
| `[UI]` | Yes | Happy path, empty/error/loading states, a11y, responsive |
| `[API]` | Yes | Happy path, validation errors, auth guards, not found |
| `[INTEGRATION]` | Yes | Happy path, service down, timeout, data mismatch |
| `[SETUP]` | No | Verified by pipeline |
| `[DATA]` | No | Verified by migration success |
| `[CONFIG]` | No | Verified by deployment |
| `[TEST]` | No | Is itself a test |

For each `[UI]`, `[API]`, or `[INTEGRATION]` task, include:
```
- **Test criteria:**
  - Happy path: [describe the primary success scenario]
  - Error path: [describe what should happen on failure]
  - Edge case: [describe boundary or unusual input]
```

### Step 3: Sequence and Mark Parallelism

- Resolve dependencies: tasks that depend on other tasks come after them
- Mark parallel-safe tasks with `[P]` — these can be built simultaneously
- Group by feature, then order by dependency within each group
- `[SETUP]` tasks always come first
- `[TEST]` tasks follow their corresponding implementation task

### Step 4: Generate Task List

```markdown
# Task List: [Feature/Project Name]
## RC Method — Generated from [PRD filename]

**Generated:** [Date]
**Source PRD:** [filename] (Status: Approved)
**Total Tasks:** [count]
**Estimated Sessions:** [count based on 8-10 tasks per session]
**Build Order:** [Sequential / Partial Parallel]

---

## Pre-Build Setup

### TASK-001 [SETUP] Project initialization
- **Description:** [What to create/configure]
- **Files:** [Exact file paths to create or modify]
- **Depends on:** None (first task)
- **Acceptance test:** [How to verify this is done correctly]

---

## Feature: [Feature Name from PRD]

### TASK-002 [DATA] Create [model/table name]
- **Description:** [Specific schema or model to create]
- **Files:**
  - Create: `src/models/[name].ts`
  - Modify: `src/db/schema.ts`
- **Depends on:** TASK-001
- **Parallel:** [P] Can run alongside TASK-003
- **Acceptance test:** Model creates/reads/updates without error
- **PRD Criteria:** Maps to acceptance criterion [#]

### TASK-003 [API] Build [endpoint name] endpoint
- **Description:** [What the endpoint does, inputs, outputs]
- **Files:**
  - Create: `src/routes/[name].ts`
  - Create: `src/services/[name]-service.ts`
- **Depends on:** TASK-002 (needs data model)
- **Acceptance test:** [Specific request → expected response]
- **PRD Criteria:** Maps to acceptance criterion [#]
- **Test criteria:**
  - Happy path: [valid request returns expected response with correct status code]
  - Error path: [invalid input returns 400 with clear message]
  - Edge case: [empty body, missing auth, boundary values]

### TASK-004 [UI] Build [component/page name]
- **Description:** [What the component renders and user interactions]
- **Files:**
  - Create: `src/components/[name].tsx`
- **Depends on:** TASK-003 (needs API data)
- **Acceptance test:** [Component renders with correct states]
- **PRD Criteria:** Maps to acceptance criterion [#]
- **Test criteria:**
  - Happy path: [user completes primary flow successfully]
  - Error path: [error state renders with clear message when API fails]
  - Edge case: [empty data shows empty state, long text doesn't overflow]

[Continue pattern for TEST, INTEGRATION tasks...]

---

## Summary

| Feature | Tasks | Can Parallel | Depends On | Est. Sessions |
|---------|-------|-------------|------------|---------------|
| [Name] | [X] | [Y] | [list] | [Z] |
| **Total** | **[X]** | | | **[Z]** |

### Session Plan
- **Session 1:** TASK-001 through TASK-005 (Setup + Data layer)
- **Session 2:** TASK-006 through TASK-010 (API layer)
- **Session 3:** TASK-011 through TASK-015 (UI + Integration)
```

## Task Quality Rules

1. **Every task maps to a PRD criterion.** No task exists without a business reason.
2. **Every task has an acceptance test.** "Done" must be verifiable.
3. **File paths are explicit.** Don't say "create a model file" — say `Create: src/models/user.ts`.
4. **Dependencies are explicit.** Don't assume build order — state it.
5. **Token awareness.** Each session should load only the relevant child PRD + task subset.
6. **No mega-tasks.** If a task description exceeds 200 words, it's too big — split it.

## Session Packaging

When the operator is ready to start a build session, package the context:

```
═══════════════════════════════════════════════════
📦 BUILD SESSION PACKAGE
═══════════════════════════════════════════════════

Session [X] of [Total]

📄 Load these files:
   • rc-method/prds/PRD-[project]-[feature].md (child PRD)
   • rc-method/tasks/TASKS-[project]-[feature].md (this session's tasks)
   • rc-method/prds/PRD-[project]-ux.md (if exists and session has [UI] tasks)
   • rc-method/skills/rc-ux-core.md (if session has [UI] tasks — core rules)

📋 Tasks for this session:
   • TASK-006: [Description]
   • TASK-007: [Description] [P]
   • TASK-008: [Description] [P]
   • TASK-009: [Description]

⚡ Estimated token load: ~[X] tokens
📊 Progress: [X] of [Total] tasks complete

→ Type "begin session" to start
→ Type "skip to [task#]" to resume
═══════════════════════════════════════════════════
```

## Post-Generation

After task list is generated:
1. Save to `rc-method/tasks/TASKS-[project]-[feature].md`
2. Present task summary to operator via `rc-owner-gate.md` (Sequence gate)
3. Route to Phase 5 (Validate) for quality checks before build begins
