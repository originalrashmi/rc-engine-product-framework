# RC Engine — Prompt Examples

Three complete scenarios showing how to use RC Engine from idea to shipped product.

---

## Example 1: Free Tier Research (Pre-RC Only)

**Scenario:** You have an idea and want to validate it with market research before building anything.

### Prompt

> I want to build a habit tracking app for college students. Can you research this idea and create a PRD?

### What happens

1. **`prc_start`** — Starts the Pre-RC research pipeline with your brief
2. **`prc_classify`** — Analyzes complexity (likely: "Complicated" domain — established market, clear patterns)
3. **`prc_run_stage`** (x6) — Runs 6 research stages with specialized AI analysts:
   - Market landscape and competitor analysis
   - User persona and ICP development
   - Technical feasibility assessment
   - Business model exploration
   - Risk analysis
   - Feature prioritization
4. **`prc_synthesize`** — Combines all research into a 19-section PRD

### Output

A complete requirements document in `pre-rc-research/` containing:
- Target user personas (college students aged 18-22)
- Competitive analysis (Habitica, Streaks, Loop, etc.)
- Feature priority matrix
- Technical recommendations
- Business model options
- Risk assessment

**Cost:** Free (uses your configured LLM provider, no RC Engine subscription needed)

---

## Example 2: Full Build (Starter Tier)

**Scenario:** You want to go from idea to shipped product with the full pipeline.

### Prompt

> Build me a SaaS invoicing tool for freelancers using Next.js and Supabase. Start with research and go all the way through to security validation.

### What happens

**Phase A — Research (Pre-RC)**
1. `prc_start` → `prc_classify` → `prc_run_stage` (x6) → `prc_synthesize`
2. Produces a comprehensive PRD with market research, personas, and feature specs

**Phase B — Build (RC Method)**
3. `rc_import_prerc` — Bridges research into the build pipeline
4. `rc_architect` — Generates technical architecture (Next.js App Router + Supabase schema + Stripe integration)
5. `rc_sequence` — Creates an ordered task list with dependencies
6. `rc_validate` — Quality gate: checks for anti-patterns, scope drift, and budget
7. `rc_forge_task` (per task) — Generates implementation guidance for each task
8. `rc_connect` — Verifies all components integrate correctly
9. `rc_compound` — Production hardening review

**Phase C — Validate (Post-RC)**
10. `postrc_scan` — Security vulnerability scan (CWE patterns) + monitoring readiness check
11. `postrc_gate` — Ship/no-ship decision based on findings

### Output

Complete project artifacts in your directory:
- `pre-rc-research/` — Market research and initial PRD
- `rc-method/prds/` — Formatted requirements document
- `rc-method/architecture/` — Technical architecture document
- `rc-method/tasks/` — Ordered task list with implementation guidance
- `post-rc/` — Security scan results and validation report

**Cost:** Starter tier ($29/month) + your LLM API usage

---

## Example 3: Skip Research, Start Building (Starter Tier)

**Scenario:** You already know what you want. Skip the research phase and go straight to building.

### Prompt

> I already know what I want — a REST API for a pet adoption marketplace. I want to use Python with FastAPI and PostgreSQL. Skip research and start the build process.

### What happens

1. **`rc_start`** — Creates a new RC Method project, asks discovery questions
2. **`rc_illuminate`** — You provide answers about scope, users, and constraints
3. **`rc_define`** — Generates a PRD from your answers (no Pre-RC research needed)
4. **`rc_architect`** — Designs FastAPI project structure, database schema, API endpoints
5. **`rc_sequence`** — Creates task list: models → CRUD routes → auth → search → adoption flow
6. **`rc_validate`** — Quality checks before building
7. **`rc_forge_task`** (per task) — Implementation guidance for each task
8. **`postrc_scan`** — Security scan of the implementation
9. **`postrc_gate`** — Ship decision

### Key checkpoint interactions

At each checkpoint, RC Engine pauses and asks for your approval:

> **Step 1: Discovery complete.** Here's what I understood about your pet adoption marketplace. [Summary]. Do you approve this and want to proceed to requirements?

You respond: "Approve" or "I want to change X" → the pipeline adapts.

### Output

Same artifact structure as Example 2, minus the `pre-rc-research/` directory since research was skipped.

**Cost:** Starter tier ($29/month) + your LLM API usage

---

## Quick Reference

| What you want | Tools used | Tier needed |
|--------------|-----------|-------------|
| Research an idea | `prc_*` tools | Free |
| Check pipeline status | `rc_pipeline_status`, `*_status` | Free |
| Score UX complexity | `ux_score`, `ux_audit` | Free |
| Full build pipeline | `rc_*` tools | Starter ($29/mo) |
| Security validation | `postrc_*` tools | Starter ($29/mo) |
| Design options with wireframes | `ux_design` | Starter ($29/mo) |
| Requirements traceability | `trace_*` tools | Pro ($79/mo) |
| Stress test research | `prc_stress_test` | Pro ($79/mo) |
