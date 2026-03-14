# RC Method: Child PRD Generator

> **Skill Type:** Phase 2 (Define) — Token Optimization
> **Activates:** When rc-prd-master recommends a split, or operator requests child PRDs
> **Output:** `rc-method/prds/PRD-[project]-[feature].md`

## Purpose

Generate focused, self-contained child PRDs from parent PRD features. Each child PRD carries only the context needed for its build session, keeping token usage lean while maintaining full traceability back to the parent.

## When This Skill Activates

- `rc-prd-master.md` recommends a split
- Operator types "split" or requests child PRDs
- Token budget exceeds 3,000 tokens on main PRD
- A feature is complex enough to warrant isolation

## Child PRD Generation Rules

### Rule 1: Self-Contained Context
Each child PRD MUST contain everything needed to build that feature WITHOUT loading the parent PRD. This means:
- Relevant user persona (copied from parent, not referenced)
- Feature-specific acceptance criteria
- Dependencies ON other features (stated explicitly, not assumed)
- Dependencies FROM other features (what this feature provides to others)
- Relevant non-functional requirements (only those that apply)

### Rule 2: Parent Reference, Not Duplication
Include a metadata link to the parent PRD but do NOT duplicate the full parent content. Only copy what's directly relevant to this child feature.

### Rule 3: Token Budget Per Child
Target: **1,500–2,500 tokens per child PRD.** This leaves room in a typical 8K context window for:
- Child PRD: ~2,000 tokens
- Task list: ~1,500 tokens
- Anti-patterns reference: ~2,000 tokens
- Working space: ~2,500 tokens

## Child PRD Template

```markdown
# Child PRD: [Feature Name]
## RC Method — Child PRD

**Status:** Draft | In Review | Approved
**Parent PRD:** PRD-[project]-master.md
**Feature(s):** [Feature name(s) from parent]
**Owner:** [Operator Name]
**Created:** [Date]
**Token Budget:** [target 1,500–2,500]

---

### 1. Feature Context
[2-3 sentences explaining what this feature does and why it exists.
Written as if the reader has NOT seen the parent PRD.]

### 2. User Persona (Relevant Subset)
**Who uses this feature:** [Name/role]
**Their goal:** [What they're trying to accomplish with THIS feature]
**Entry point:** [How they get to this feature]

### 3. Detailed Requirements

#### 3.1 [Sub-feature or Flow 1]
- **What happens:** [Step-by-step user flow in plain language]
- **Acceptance criteria:**
  - [ ] [Testable behavior]
  - [ ] [Testable behavior]
  - [ ] [Error/edge case handling]

#### 3.2 [Sub-feature or Flow 2]
- **What happens:** [Step-by-step]
- **Acceptance criteria:**
  - [ ] [Testable behavior]

### 4. Data Requirements
- **Inputs:** [What data this feature needs — from user, from other features, from APIs]
- **Outputs:** [What data this feature produces — for display, for storage, for other features]
- **Storage:** [Where data lives — database table, API, file system]

### 5. Dependencies

**This feature NEEDS (inbound):**
- [Dependency 1] — from [source] — [what it provides]

**This feature PROVIDES (outbound):**
- [Output 1] — to [consumer] — [what it enables]

**Can build independently:** Yes / No (if No, which dependency must be built first?)

### 6. Edge Cases & Error Handling
- **What if [thing goes wrong]?** → [What the user sees, what the system does]
- **What if [data is missing]?** → [Fallback behavior]
- **What if [user does unexpected thing]?** → [Graceful handling]

### 7. Non-Functional (Feature-Specific)
- **Performance:** [Only requirements relevant to THIS feature]
- **Security:** [Only security concerns for THIS feature]

### 8. Out of Scope for This Child PRD
- [What's handled by other child PRDs]
- [What's explicitly not in this feature]

### 9. RC Method Metadata
- **Parent:** PRD-[project]-master.md
- **Sibling PRDs:** [List other child PRDs in this project]
- **Phase:** Define
- **Gate Status:** Inherits from parent gate / Separate approval required
- **Token Count:** [Actual]
- **Build Order:** [Where this sits in the sequence — e.g., "After auth, before dashboard"]
```

## Split Execution Process

When the operator approves a split:

1. **Parse the parent PRD** for the designated features
2. **Generate each child PRD** using the template above
3. **Update the parent PRD:**
   - Mark split features with `→ See Child PRD: [filename]`
   - Keep the feature summary in the parent (1-2 lines)
   - Remove detailed acceptance criteria (now in child)
4. **Update PRD-INDEX.md** with new children and dependency map
5. **Validate token budgets** — flag any child exceeding 2,500 tokens
6. **Present summary to operator**

## Validation Checks

Before finalizing any child PRD, verify:
- [ ] Contains user persona context (not just a reference)
- [ ] All acceptance criteria are testable
- [ ] Dependencies explicitly listed (inbound AND outbound)
- [ ] Edge cases defined
- [ ] Token count within 1,500–2,500 range
- [ ] Parent PRD updated with cross-reference
- [ ] PRD-INDEX.md updated
- [ ] No orphaned features (every parent feature either stays in parent or has a child)
