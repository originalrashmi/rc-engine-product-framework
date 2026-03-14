# RC Method: PRD Master Generator

> **Skill Type:** Phase 2 (Define)
> **Activates:** When operator requests a PRD, or rc-master routes to Define phase
> **Output:** `rc-method/prds/PRD-[project]-master.md`

## Purpose

Generate comprehensive main PRDs that serve as the single source of truth for any project. The PRD is written in plain language for non-technical product owners while containing enough technical specificity to be directly buildable.

## When This Skill Activates

- Operator requests a new PRD or product spec
- `rc-master.md` routes to Phase 2 (Define)
- Operator says "create PRD", "write requirements", "define what we're building"

## PRD Generation Process

### Step 1: Discovery Interview

Before writing anything, gather these inputs from the operator. Ask conversationally, not as a form:

**Required Inputs:**
1. **What problem are you solving?** (The pain point in plain language)
2. **Who is this for?** (Primary user persona — be specific)
3. **What does success look like?** (Measurable outcome the operator cares about)
4. **What already exists?** (Current tools, systems, manual processes)
5. **What are the boundaries?** (Budget, timeline, regulatory constraints)
6. **What's the first thing a user does?** (Entry point to the experience)

**Optional Inputs (ask if not volunteered):**
7. Target platform (web, mobile, desktop, API)
8. Known integrations (CRMs, databases, APIs)
9. Compliance requirements (HIPAA, GDPR, SOC2, industry-specific)

### Step 2: Generate Main PRD

Use this template structure. Every section is REQUIRED.

```markdown
# PRD: [Project Name]
## RC Method — Main PRD

**Status:** Draft | In Review | Approved
**Owner:** [Operator Name]
**Created:** [Date]
**Last Updated:** [Date]
**RC Method Phase:** Define
**Token Budget:** [estimated tokens for this document]

---

### 1. Problem Statement
[2-3 sentences in plain language. What pain exists today?]

### 2. Target User
**Primary Persona:** [Name, role, context]
**Pain Points:**
- [Pain 1 — specific, observable behavior]
- [Pain 2]
- [Pain 3]

**Success Criteria (from user's perspective):**
- [What the user can do after this is built that they couldn't before]

### 3. Solution Overview
[3-5 sentences describing what gets built. NO technical jargon. Written as if explaining to the operator over coffee.]

### 4. Features

#### Feature 1: [Name]
- **What it does:** [Plain language description]
- **Why it matters:** [Business value]
- **User story:** As a [persona], I want to [action] so that [outcome]
- **Acceptance criteria:**
  - [ ] [Observable, testable behavior 1]
  - [ ] [Observable, testable behavior 2]
  - [ ] [Edge case or error handling]
- **Priority:** Must Have | Should Have | Nice to Have
- **Complexity:** Low | Medium | High
- **Child PRD Required:** Yes/No (auto-detected — see Split Detection below)

[Repeat for each feature]

### 5. UX Requirements (Required if features include UI)
- **UX Trigger Score:** [Score from `UX-TRIGGERS.md` — determines UX depth]
- **UX Mode:** Standard (core rules) | Selective (1-2 specialists) | Deep Dive (UX child PRD)
- **Key UI Surfaces:** [List the primary screens/views this product needs]
- **Critical User Flows:** [List the 2-3 most important user journeys]
- **State Requirements:** [Note any screens needing loading/empty/error/success states]
- **UX Child PRD:** Required (score ≥ 7) | Recommended | Not needed (score < 4)

### 6. Non-Functional Requirements
- **Performance:** [What "fast" means for this product — specific numbers]
- **Security:** [Data handling, auth requirements, compliance]
- **Scalability:** [Expected usage volume]
- **Accessibility:** [WCAG level, if applicable]

### 7. Out of Scope
[Explicitly list what this project does NOT include. This prevents scope creep.]
- [Item 1 — and why it's out of scope]
- [Item 2]

### 8. Dependencies & Integrations
- [External system 1 — what data flows where]
- [External system 2]

### 9. Risks & Assumptions
**Assumptions:**
- [Assumption 1 — what we're taking as true without proof]

**Risks:**
- [Risk 1 — what could go wrong and business impact]

### 10. Timeline & Milestones
- [Milestone 1: Date — What's deliverable]
- [Milestone 2: Date — What's deliverable]

### 11. RC Method Metadata
- **Parent PRD:** None (this is the master)
- **Child PRDs:** [List or "None yet"]
- **Phase:** Define
- **Gate Status:** Pending owner approval
- **Token Count:** [Approximate]
- **Anti-Pattern Check:** Not yet run
```

### Step 3: Child PRD Split Detection

After generating the main PRD, analyze it for split candidates:

**Auto-suggest a child PRD split when:**
- A feature has 5+ acceptance criteria
- A feature touches 3+ independent systems/APIs
- A feature's description exceeds 500 words
- Two features have zero shared dependencies
- The main PRD exceeds 3,000 tokens
- A feature requires its own data model

**Split Detection Output:**
```
═══════════════════════════════════════════════════
📦 CHILD PRD SPLIT RECOMMENDATION
═══════════════════════════════════════════════════

The main PRD contains [X] features. Based on complexity
and token optimization, I recommend splitting:

  Feature 2: [Name] → Child PRD (5+ criteria, independent system)
  Feature 4: [Name] → Child PRD (own data model required)

Features 1, 3, 5 remain in the main PRD.

Benefits of splitting:
  • Each build session loads only the relevant child PRD
  • Estimated token savings: ~[X]% per session
  • Reduces context window pollution

→ Type "split" to generate child PRDs
→ Type "keep" to maintain single PRD
→ Type "split [feature numbers]" to split specific features
═══════════════════════════════════════════════════
```

### Step 3b: UX Child PRD Recommendation

After split detection, if the PRD includes UI features, evaluate UX depth:

**Auto-recommend a UX child PRD (`PRD-[project]-ux.md`) when:**
- UX Trigger Score (from `rc-method/ux/UX-TRIGGERS.md`) is ≥ 7
- Product has 3+ distinct UI screens
- Any high-stakes user flow exists (payment, deletion, publishing)
- Dashboard or analytics visualization is required

**UX Child PRD Recommendation Output:**
```
═══════════════════════════════════════════════════
🎨 UX CHILD PRD RECOMMENDATION
═══════════════════════════════════════════════════

This project includes [X] UI surfaces. UX Trigger Score: [Y]

  Mode: [Standard / Selective / Deep Dive]
  Specialists recommended: [list from routing table]

  Recommendation:
  [Score < 4]  → Core UX rules sufficient. No UX child PRD needed.
  [Score 4-6]  → Load 1-2 specialists during Forge. Optional UX child PRD.
  [Score ≥ 7]  → Generate PRD-[project]-ux.md before UI tasks begin.

→ Type "generate ux prd" to create UX child PRD
→ Type "skip ux prd" to proceed with core rules only
═══════════════════════════════════════════════════
```

The UX child PRD template is defined in `rc-ux-core.md`. It includes screen inventory, state contracts, component inventory, copy samples, and accessibility checklist.

### Step 4: Generate PRD Index

After any PRD is created or split, update `rc-method/prds/PRD-INDEX.md`:

```markdown
# PRD Index: [Project Name]
## RC Method — Parent ↔ Child Mapping

**Last Updated:** [Date]

| PRD | Type | Status | Features | Token Est | Gate |
|-----|------|--------|----------|-----------|------|
| PRD-[project]-master.md | Parent | [status] | All | [tokens] | [status] |
| PRD-[project]-auth.md | Child | [status] | Auth, Login | [tokens] | [status] |
| PRD-[project]-dashboard.md | Child | [status] | Dashboard | [tokens] | [status] |
| PRD-[project]-ux.md | UX Child | [status] | UX Spec | [tokens] | [status] |

### Dependency Map
- `auth` → blocks → `dashboard` (requires auth system)
- `dashboard` → independent of → `notifications`

### Token Budget
- Total across all PRDs: [X] tokens
- Largest single PRD: [X] tokens
- Recommended max per session: 4,000 tokens
```

## Quality Rules

1. **No technical jargon in problem statement or solution overview.** If a non-technical person can't understand it, rewrite it.
2. **Every feature needs a user story.** No exceptions.
3. **Acceptance criteria must be testable.** "Works well" is not acceptable. "User sees confirmation message within 2 seconds" is.
4. **Out of Scope is mandatory.** An empty Out of Scope section means scope will creep.
5. **Token awareness.** Include token count estimates. Flag when a PRD exceeds 3,000 tokens.
6. **Priority must use MoSCoW.** Must Have / Should Have / Nice to Have. No "High/Medium/Low" — that's developer language, not business language.
