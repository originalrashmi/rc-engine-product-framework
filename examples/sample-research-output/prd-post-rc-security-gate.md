# PRD: Post-RC Security Gate

## Post-RC Security Gate — AI Code Security Validation Phase

> **Status:** Draft  
> **Owner:** RC Method Product Team  
> **Timeline:** Standard — 12-15 weeks (5 phases)  
> **Created:** 2024-02-15  
> **Last Updated:** 2024-02-15  
> **Pre-RC Status:** Research + Analysis complete  
> **RC Method Phase:** Pre-RC Research → Define  
> **Research Basis:** Pre-RC Research Agent — 15 autonomous personas, ~165K tokens  
> **Cynefin Domain:** Complex (with Complicated sub-components) | **Product Class:** Developer Security Infrastructure (DevSecOps Gate)

---

## 1. Problem Statement & Introduction

Today, 81% of organizations have deployed vulnerable AI-generated code to production. When developers use AI coding assistants like GitHub Copilot or Claude to generate code through the RC Method workflow, there is no security validation layer between code generation (`rc_forge_task`) and deployment. Research shows AI-generated code has an 86% failure rate for XSS prevention, is 2.74x more prone to vulnerabilities than human-written code, and 72% of Java AI code contains security flaws.

Developers face an impossible choice: ship fast with AI assistance but risk security incidents that damage their reputation, or manually review every line of AI-generated code and lose all velocity gains. Current solutions like GitHub Advanced Security provide generic SAST scanning but lack AI-specific pattern detection, while manual security reviews create multi-day bottlenecks that defeat the purpose of AI-assisted development.

The Post-RC Security Gate is a new phase in the RC Method workflow that automatically validates AI-generated code against 25+ documented AI anti-patterns across 7 vulnerability categories (injection, XSS, authentication, cryptography, input validation, secrets management, and file handling). It runs immediately after `rc_forge_task` completes, providing sub-10-second feedback with actionable remediation guidance. Developers get the security confidence they need without sacrificing velocity.

**Jobs-to-be-Done:**

- **Functional Job:** Validate AI-generated code for security vulnerabilities before deployment without manual security review delays
- **Emotional Job:** Feel protected from blame if a vulnerability emerges post-deploy ("I followed the process; the gate validated it")
- **Social Job:** Demonstrate to management and security teams that proper security diligence was performed, maintaining reputation as a competent engineer

**Current Alternatives:**
- **Manual code review:** Thorough but creates 2-5 day bottlenecks; doesn't scale with AI code generation velocity
- **GitHub Advanced Security:** Broad SAST coverage but generic patterns miss AI-specific vulnerabilities; high false positive rate (15-21%) causes tool abandonment
- **"Ship and pray":** Deploy without validation, accept risk; rational choice under deadline pressure but creates anxiety and blame exposure
- **Disable AI code generation:** Conservative approach that eliminates AI risk but loses 40-60% productivity gains

### How It Connects

The Post-RC Security Gate integrates as a new phase between `rc_forge_task` (code generation) and deployment in the RC Method workflow. It extends the existing RC Method MCP server with three new tools (`rc_security_scan`, `rc_security_override`, `rc_security_report`) that developers invoke within their IDE. Results appear inline with generated code, preserving flow state while providing security guardrails.

---

## 2. Target User & ICP (Ideal Customer Profile)

### Ideal Customer Profile

| Attribute | Description |
|-----------|-------------|
| **Industry/Vertical** | Software development companies, SaaS providers, fintech, healthcare tech — any organization building software with AI assistance |
| **Company Size** | 100-5000 employees; sweet spot is 200-1000 (large enough for security concerns, small enough for developer-led tool adoption) |
| **Role/Title** | Engineering Manager, VP Engineering, Security Champion, DevOps Lead (decision-makers); Mid-to-Senior Developers (primary users) |
| **Geography** | US, EU (GDPR compliance required), with expansion to APAC in Phase 2 |
| **Tech Maturity** | High — already using AI code generation tools (Copilot, Claude, GPT-4), CI/CD pipelines, and some form of SAST/security scanning |
| **Budget Range** | $29-99/month per team (10 developers) for security tooling; willing to pay for velocity preservation |
| **Buying Trigger** | Recent security incident from AI-generated code, compliance audit requirement, or executive mandate to "secure AI workflows" |

**Who is NOT the ICP:** 
- Enterprise teams with 6-12 month procurement cycles requiring custom contracts (Phase 1 targets developer-led adoption, not enterprise sales)
- Hobbyists or OSS contributors without budget (free tier exists but not primary focus)
- Teams not using AI code generation (no pain point to solve)
- Organizations with custom-built security scanning infrastructure that can't integrate external tools
- Teams shipping <10 PRs/week (insufficient scan volume to justify tooling overhead)

### Primary Persona

**Name & Context:** Alex Chen, Senior Full-Stack Developer at a 300-person SaaS company, uses Claude and GitHub Copilot daily, ships 3-5 features per sprint under tight deadlines

**Pain Points:**
- **Velocity vs. Security Trade-off:** AI helps ship features 2x faster, but security team found 3 SQL injection vulnerabilities in last quarter's AI-generated code. Now faces scrutiny on every PR.
- **Manual Review Bottleneck:** Security Champion reviews take 2-3 days, blocking sprint commitments. Can't ship fast AND secure.
- **False Positive Fatigue:** Tried GitHub Advanced Security but 20% false positive rate on AI code meant spending 30 minutes per scan explaining overrides. Disabled it after 2 weeks.
- **Blame Exposure:** Worries that next production incident will be traced to AI-generated code with their name on the commit. Needs plausible deniability that "security was checked."

**Behavioral Traits:**
- **Current Solution:** Manually scans AI-generated code for obvious issues (hardcoded secrets, SQL concatenation) but lacks security expertise to catch subtle vulnerabilities. Ships with fingers crossed.
- **Decision-Making Pattern:** Under deadline pressure, evaluates security findings in <30 seconds based on severity label + first sentence. If fix takes >15 minutes, overrides and plans to "fix later" (never happens).
- **Tool Adoption:** Will disable any security tool that blocks deployment >3 times with false positives in a week. Values tools that provide "green checkmark" validation more than exhaustive analysis.

### Secondary Users

**Security Champion (Embedded in Dev Team):**  
Triages High/Critical findings, approves overrides, needs batch review interface to avoid becoming bottleneck. Key difference: Has security expertise but limited time; needs tools that surface only high-confidence findings requiring human judgment.

**DevOps/Platform Engineer:**  
Configures security gate per-project (severity thresholds, language-specific rules), manages MCP server deployment. Key difference: Cares about operational stability and configuration simplicity, not individual scan results.

**Security Team Auditor:**  
Reviews override logs for compliance, investigates production incidents. Key difference: Needs forensic trail showing "who overrode what and why" with tamper-proof audit logs, not real-time scanning.

**CI/CD Pipeline (Non-Human User):**  
Automated agent calling `rc_security_scan` in pre-commit hooks and CI/CD. Key difference: Requires structured JSON output, non-interactive mode, and graceful degradation (fail-open on errors to avoid breaking builds).

### Accessibility Considerations

- **Keyboard Navigation:** All override workflows must be completable without mouse (tab navigation, enter to submit)
- **Screen Reader Support:** Severity labels must have ARIA attributes (`role="alert"` for Critical findings)
- **Color Blindness:** Severity indicators use both color AND icons (red X + "Critical" text, not red alone)
- **Cognitive Load:** Maximum 5 findings displayed at once; expandable details prevent overwhelming users with 20+ warnings

**Success Criteria (from user's perspective):**
- Alex can validate AI-generated code in <10 seconds without leaving IDE
- Security Champion can review team's High findings in 15 minutes/day (not 2 hours)
- DevOps can configure project-specific rules via UI (not editing JSON files)
- Auditor can export 90-day override history for compliance report in 1 click

---

## 3. Solution Overview

The Post-RC Security Gate is a new phase in the RC Method that automatically scans AI-generated code for security vulnerabilities immediately after code generation completes. When a developer runs `rc_forge_task` to generate code, the security gate activates automatically, analyzing the output against a curated knowledge base of 25+ AI-specific vulnerability patterns (SQL injection, XSS, hardcoded secrets, weak crypto, etc.). 

Within 10 seconds, the developer sees results inline in their IDE: a green checkmark if code is safe, yellow warnings for medium-severity issues with quick-fix suggestions, or a red block for critical vulnerabilities that must be addressed before deployment. If the developer believes a finding is a false positive, they can override it with a one-click justification that gets logged for security team review. The system learns from override patterns to reduce false positives over time.

Under the hood, the gate uses a multi-agent AI architecture: a fast pattern-matching agent handles 80% of scans in under 5 seconds, while a deep-analysis agent investigates complex cases (like data flow across multiple functions) asynchronously. This two-tier approach keeps developers in flow state while still catching sophisticated vulnerabilities. The gate integrates with the existing RC Method MCP server, so developers use familiar tools (`rc_security_scan`, `rc_security_override`) without learning new workflows.

---

## 4. Goals

| # | Goal | Measure | Target |
|---|------|---------|--------|
| G1 | **Prevent AI-generated vulnerabilities in production** — Catch Critical/High severity issues before deployment | Zero Critical CVEs traced to AI-generated code in production | 100% prevention rate after 6 months |
| G2 | **Preserve developer velocity** — Security validation doesn't slow down AI-assisted development | P90 scan latency + developer NPS | <10s scan latency AND NPS >40 |
| G3 | **Minimize false positive friction** — Developers trust findings and don't route around the gate | Override rate on Critical findings | <30% (>30% = product failure signal) |
| G4 | **Achieve cost-effective scanning** — Token costs don't make tool economically unsustainable | Average token cost per scan | <$0.10/scan via RAG optimization |
| G5 | **Build security audit trail** — Compliance teams can prove due diligence on AI code | Audit log completeness + query latency | 100% scan/override logging, <500ms query P95 |
| G6 | **Enable self-service configuration** — Teams can customize gate without engineering support | Configuration changes via UI (not code) | 90% of config changes done by DevOps, not platform team |
| G7 | **Maintain high availability** — Gate failures don't block deployments | System uptime + fail-open rate | >98% uptime, fail-open on errors (not findings) |
| G8 | **Demonstrate accuracy superiority** — Outperform generic SAST on AI-specific patterns | False positive rate vs. GitHub Advanced Security baseline | <10% FP rate on Critical (vs. 15-21% baseline) |

---

## 5. User Stories

### Onboarding & Setup

| ID | Story | Acceptance Criteria |
|----|-------|-------------------|
| ON-01 | As a **DevOps Engineer**, I want to install the security gate MCP server in <30 minutes so that I can enable it for my team without multi-day setup. | - Installation via `npm install @rc-method/security-gate` completes in <5 minutes. - Configuration wizard guides through API key setup, project selection, severity thresholds. - Health check validates Claude API connectivity and sec-context availability. - Documentation includes troubleshooting for common errors (API key invalid, network timeout). |
| ON-02 | As a **Developer**, I want the security gate to activate automatically after `rc_forge_task` so that I don't forget to run security scans. | - `rc_forge_task` completion triggers `rc_security_scan` without manual invocation. - Scan results appear in IDE within 10 seconds. - If scan fails (API timeout), warning appears but code generation isn't blocked. - Developer can disable auto-scan via `rc_security_configure --auto-scan=false`. |

### Core Scanning Flow

| ID | Story | Acceptance Criteria |
|----|-------|-------------------|
| SC-01 | As a **Developer**, I want to see scan results in <10 seconds so that I stay in flow state and don't context-switch. | - P90 fast scan latency <10s measured via OpenTelemetry. - Progress indicator shows "Scanning..." with estimated time remaining. - Results render inline in IDE (not external browser tab). - If scan takes >10s, async mode activates with notification when complete. |
| SC-02 | As a **Developer**, I want findings grouped by severity (Critical/High/Medium) so that I know what requires immediate action. | - Findings displayed in severity-sorted list: Critical (red), High (orange), Medium (yellow). - Each finding shows: CWE ID, affected line numbers, 2-sentence description, remediation snippet. - Clicking finding jumps to code location in editor. - Zero findings shows green checkmark with "No security issues detected" message. |
| SC-03 | As a **Developer**, I want remediation guidance that I can apply in <5 minutes so that fixing vulnerabilities doesn't require security expertise. | - Each finding includes code snippet showing secure alternative (max 10 lines). - "Apply fix" button auto-applies remediation and re-scans. - If re-scan passes, finding marked as resolved. - If re-scan fails or introduces new Critical findings, escalates to human review. |
| SC-04 | As a **Security Champion**, I want to review only High/Critical findings so that I'm not overwhelmed by 20+ Medium warnings. | - Batch review interface shows High+ findings across team (last 7 days). - Findings grouped by CWE pattern (e.g., "5 SQL injection findings in auth module"). - One-click approve/reject for entire pattern group. - Rejected findings auto-downgrade severity for that project. |

### Override & Audit

| ID | Story | Acceptance Criteria |
|----|-------|-------------------|
| OV-01 | As a **Developer**, I want to override Medium findings with 1 click so that false positives don't block my work. | - "Override" button appears on Medium findings. - Clicking opens lightweight modal with pre-filled reason templates ("False positive", "Test code", "Accepted risk"). - Submit = 1 additional click, reason field optional. - Override logged with developer ID, timestamp, reason (PII-redacted). |
| OV-02 | As a **Developer**, I want to override High findings with justification so that I can proceed when I know the code is safe. | - "Override" button on High findings requires reason field (min 20 chars). - Reason cannot contain secrets (regex filter blocks API keys, passwords). - Override logged and notifies Security Champion for async review. - If Champion rejects within 4 hours, developer gets notification to fix or escalate. |
| OV-03 | As a **Security Champion**, I want to approve Critical overrides with 2FA so that high-risk decisions require strong authentication. | - Critical findings show "Request Override" button (not direct override). - Request triggers 2FA prompt (TOTP/WebAuthn) for Security Champion. - Champion sees finding details + developer's justification. - Approve/Deny decision logged with Champion's ID and timestamp. - Denied requests block deployment until fixed. |
| OV-04 | As a **Security Team Auditor**, I want to query override logs by date/developer/CWE so that I can investigate patterns for compliance reports. | - Audit API endpoint: `GET /api/overrides?since=2024-01-01&developer=alex@company.com&cwe=CWE-89`. - Returns JSON with override ID, finding details, reason, approver, timestamp. - Query completes in <500ms P95. - Export to CSV for compliance reports. - Logs are immutable (no UPDATE/DELETE operations). |

### Configuration & Customization

| ID | Story | Acceptance Criteria |
|----|-------|-------------------|
| CF-01 | As a **DevOps Engineer**, I want to configure severity thresholds per project so that test code isn't over-flagged. | - Configuration UI shows project list with current policy. - Per-project settings: block_on_critical (bool), warn_on_high (bool), test_code_severity_reduction (int). - Example: "Reduce severity by 1 level for files in `__tests__/` directory". - Changes apply immediately (no server restart). - Configuration changes logged for audit. |
| CF-02 | As a **DevOps Engineer**, I want to suppress specific CWE patterns so that known false positives don't spam developers. | - Suppression UI shows CWE list with toggle switches. - Suppressing CWE-327 (weak crypto) downgrades findings to INFO level. - Suppression requires reason field (e.g., "MD5 used for ETags only, not security"). - Suppressions expire after 90 days unless renewed. - Security Team gets notification when suppression is added. |

### Error Handling & Degradation

| ID | Story | Acceptance Criteria |
|----|-------|-------------------|
| ER-01 | As a **Developer**, I want the gate to fail-open on errors so that infrastructure issues don't block my deployment. | - If Claude API times out (>30s), scan returns WARN (not BLOCK). - Warning message: "Security scan incomplete — manual review recommended". - Error logged to monitoring system (Prometheus alert if >10% failure rate). - Developer can proceed with deployment; incident logged for Security Team review. |
| ER-02 | As a **Platform Engineer**, I want circuit breakers on external dependencies so that cascading failures don't take down the gate. | - Claude API circuit breaker opens after 50% error rate. - Fallback: Use cached top-10 CWE patterns (regex-based, no LLM). - Circuit breaker resets after 1 minute of successful requests. - Dashboard shows circuit breaker status (open/closed/half-open). |

---

## 6. Features (MoSCoW Prioritized)

#### Feature 1: Fast Pattern-Matching Scan
- **What it does:** Analyzes code using regex + AST parsing against top 10 CWE patterns for detected language, returns results in <5 seconds
- **Why it matters:** 80% of vulnerabilities are caught by simple pattern matching; fast feedback keeps developers in flow state
- **Priority:** Must Have
- **Complexity:** Medium
- **Module:** Module A (Core Scanning Engine)
- **Child PRD Required:** No

#### Feature 2: RAG-Based Context Injection
- **What it does:** Retrieves relevant CWE patterns from 165K-token sec-context knowledge base using vector similarity search, reducing token cost from $0.15 to $0.06 per scan
- **Why it matters:** Full context injection is economically unsustainable at scale; RAG enables cost-effective deep analysis
- **Priority:** Must Have
- **Complexity:** High
- **Module:** Module A (Core Scanning Engine)
- **Child PRD Required:** Yes — "sec-context RAG Pipeline"

#### Feature 3: Multi-Agent LLM Orchestration
- **What it does:** Routes scans through specialized agents (Sonnet for triage, Opus for deep analysis) based on finding severity, reducing cost 40% vs. monolithic Opus
- **Why it matters:** Not all scans need expensive deep reasoning; tiered approach optimizes cost and latency
- **Priority:** Must Have
- **Complexity:** High
- **Module:** Module A (Core Scanning Engine)
- **Child PRD Required:** Yes — "Multi-Agent LLM Orchestrator"

#### Feature 4: Override Workflow with Audit Logging
- **What it does:** Developers can override findings with justification (1-click for Medium, reason required for High, 2FA approval for Critical); all overrides logged immutably
- **Priority:** Must Have
- **Complexity:** Low
- **Module:** Module B (Override & Audit)
- **Child PRD Required:** No

#### Feature 5: Async Deep Scan
- **What it does:** For scans taking >10s (dataflow analysis, polyglot code), runs asynchronously and notifies developer when complete
- **Why it matters:** Preserves flow state while still enabling thorough analysis for complex cases
- **Priority:** Must Have
- **Complexity:** Medium
- **Module:** Module A (Core Scanning Engine)
- **Child PRD Required:** No

#### Feature 6: AI Remediation Generation
- **What it does:** Generates secure code alternatives for findings, applies via "Fix" button, automatically re-scans to validate fix didn't introduce new issues
- **Why it matters:** Developers lack security expertise; AI-generated fixes reduce time-to-resolution from hours to minutes
- **Priority:** Must Have (promoted from Should Have based on JTBD analysis)
- **Complexity:** High
- **Module:** Module C (Remediation)
- **Child PRD Required:** No

#### Feature 7: Remediation Validation Loop
- **What it does:** After applying AI-generated fix, automatically re-scans code; if new Critical findings emerge, rejects fix and escalates to human
- **Why it matters:** 15% of AI fixes introduce new vulnerabilities; validation loop prevents "fixing" one issue by creating another
- **Priority:** Must Have
- **Complexity:** Medium
- **Module:** Module C (Remediation)
- **Child PRD Required:** No

#### Feature 8: Per-Project Configuration UI
- **What it does:** DevOps engineers configure severity thresholds, CWE suppressions, test code rules via web UI (not JSON editing)
- **Why it matters:** Self-service configuration reduces platform team bottleneck; teams can customize gate without engineering support
- **Priority:** Should Have
- **Complexity:** Medium
- **Module:** Module D (Configuration)
- **Child PRD Required:** No

#### Feature 9: Security Champion Batch Review
- **What it does:** Interface showing High+ findings across team, grouped by CWE pattern, with one-click approve/reject for pattern groups
- **Why it matters:** Security Champions can't review every finding individually; batch operations prevent bottleneck
- **Priority:** Should Have
- **Complexity:** Low
- **Module:** Module B (Override & Audit)
- **Child PRD Required:** No

#### Feature 10: Exploit Scenario Synthesis
- **What it does:** Generates 1-sentence exploit scenario for each finding (e.g., "Attacker can dump user table via search box")
- **Why it matters:** Developers dismiss findings as "theoretical"; concrete exploit scenarios increase urgency
- **Priority:** Should Have
- **Complexity:** Low
- **Module:** Module A (Core Scanning Engine)
- **Child PRD Required:** No

#### Feature 11: False Positive Learning
- **What it does:** Tracks override patterns (e.g., "CWE-79 overridden 3x in auth module"); after 3 overrides, auto-downgrades severity for that project
- **Why it matters:** Gate learns from developer feedback, reducing false positive rate over time
- **Priority:** Should Have
- **Complexity:** Medium
- **Module:** Module B (Override & Audit)
- **Child PRD Required:** No

#### Feature 12: Compliance Dashboard
- **What it does:** Security Team sees org-wide metrics: scan volume, override rate by severity, top CWEs, developer NPS
- **Why it matters:** Executives need visibility into "Are we securing AI code?" for board reporting
- **Priority:** Nice to Have
- **Complexity:** Low
- **Module:** Module E (Observability)
- **Child PRD Required:** No

#### Feature 13: Polyglot Dataflow Analysis
- **What it does:** Tracks taint propagation across language boundaries (e.g., SQL injection via JS template literal)
- **Why it matters:** 40% of polyglot vulnerabilities missed by pattern matching; dataflow analysis catches cross-boundary issues
- **Priority:** Nice to Have (Phase 2)
- **Complexity:** High
- **Module:** Module A (Core Scanning Engine)
- **Child PRD Required:** Yes — "Cross-Language Dataflow Analyzer"

---

## 7. Functional Requirements

### Module A: Core Scanning Engine

| # | Requirement |
|---|-------------|
| FR-A1 | The system must accept code input (string), language (enum), file path (string), and scan mode ('fast' or 'deep') as parameters to `rc_security_scan`. |
| FR-A2 | The system must hash code content + sec-context version and check Redis cache; if cache hit, return cached result in <100ms. |
| FR-A3 | The system must parse code using Tree-sitter AST parser for detected language (Python, JavaScript, TypeScript, Java, Go). |
| FR-A4 | The system must extract function calls, variable assignments, string concatenations, and import statements from AST. |
| FR-A5 | The system must query RAG vector store (pgvector or Pinecone) for top 10 CWE patterns matching detected language, returning results in <200ms. |
| FR-A6 | The system must execute regex + AST pattern matching against retrieved CWE patterns, generating findings with confidence scores (0.0-1.0). |
| FR-A7 | The system must complete fast scan in <5s P90 for files up to 500 LOC. |
| FR-A8 | The system must cache scan results in Redis with 7-day TTL, keyed by code hash + sec-context version. |
| FR-A9 | The system must return findings as JSON array with fields: `finding_id`, `cwe_id`, `severity`, `line_start`, `line_end`, `confidence`, `description` (max 100 chars), `remediation_guidance` (max 500 chars). |
| FR-A10 | The system must trigger async deep scan if fast scan finds High+ findings OR scan mode='deep' explicitly requested. |
| FR-A11 | The system must enqueue deep scan jobs in Redis Streams with 60s timeout. |
| FR-A12 | The system must execute deep scan using Claude Opus with 15K-token context (RAG-retrieved patterns + full code). |
| FR-A13 | The system must perform dataflow taint analysis for High+ findings, tracking variable propagation across functions. |
| FR-A14 | The system must complete deep scan in <30s P90. |
| FR-A15 | The system must notify developer via MCP event stream when async deep scan completes. |
| FR-A16 | The system must generate exploit scenario (1 sentence, <100 chars) for each Critical finding using GPT-4 Turbo. |
| FR-A17 | The system must apply context-aware severity adjustment: reduce severity by 1 level for files in `__tests__/`, `*.spec.*`, `*.test.*` directories. |
| FR-A18 | The system must detect polyglot code (multiple languages in single file) and flag for manual review if cross-boundary data flow detected. |

### Module B: Override & Audit

| # | Requirement |
|---|-------------|
| FR-B1 | The system must provide `rc_security_override` tool accepting `finding_id`, `reason` (string, max 2000 chars), and optional `approver_id`. |
| FR-B2 | The system must allow 1-click override for Medium findings with optional reason field. |
| FR-B3 | The system must require reason field (min 20 chars) for High finding overrides. |
| FR-B4 | The system must require Security Champion approval (2FA via TOTP/WebAuthn) for Critical finding overrides. |
| FR-B5 | The system must redact secrets from override reason field using regex patterns: `sk-[a-zA-Z0-9]{48}`, `ghp_[a-zA-Z0-9]{36}`, email addresses. |
| FR-B6 | The system must store override logs in PostgreSQL with fields: `override_id`, `finding_id`, `developer_id`, `reason` (PII-redacted), `approver_id`, `created_at`, `expires_at`. |
| FR-B7 | The system must make override logs immutable (no UPDATE/DELETE operations allowed). |
| FR-B8 | The system must replicate override logs to S3 for long-term retention (2 years hot, infinite cold). |
| FR-B9 | The system must provide audit API endpoint: `GET /api/overrides?since={date}&developer={id}&cwe={id}` returning JSON. |
| FR-B10 | The system must complete audit queries in <500ms P95. |
| FR-B11 | The system must track override rate by severity: `(overridden findings / total findings)` per 7-day rolling window. |
| FR-B12 | The system must alert Security Team if override rate >30% on High findings in 7-day window. |
| FR-B13 | The system must auto-disable gate if override rate >40% on Critical findings, requiring manual re-enable with postmortem. |
| FR-B14 | The system must provide batch review interface for Security Champions showing High+ findings grouped by CWE pattern. |
| FR-B15 | The system must allow one-click approve/reject for entire CWE pattern group in batch review. |
| FR-B16 | The system must auto-downgrade severity by 1 level for CWE pattern if overridden 3+ times in same project. |

### Module C: Remediation

| # | Requirement |
|---|-------------|
| FR-C1 | The system must generate remediation code snippet (max 10 lines) for each finding using Claude Opus. |
| FR-C2 | The system must include in remediation guidance: secure code alternative, explanation (2 sentences), OWASP reference link. |
| FR-C3 | The system must provide "Apply Fix" button that auto-applies remediation to code in IDE. |
| FR-C4 | The system must automatically re-scan code after remediation applied. |
| FR-C5 | The system must validate remediation via re-scan: if new Critical findings introduced, reject fix and escalate to human. |
| FR-C6 | The system must mark finding as resolved if re-scan passes (zero findings at same location). |
| FR-C7 | The system must track remediation correctness: `(re-scans passed / total remediations applied)` targeting 85% success rate. |
| FR-C8 | The system must limit remediation to affected code block (no unrelated changes allowed). |
| FR-C9 | The system must validate remediation syntax using Tree-sitter before applying. |
| FR-C10 | The system must provide "Undo Fix" button that reverts to original code if developer rejects remediation. |

### Module D: Configuration

| # | Requirement |
|---|-------------|
| FR-D1 | The system must provide `rc_security_configure` tool accepting `project_id` and `policy` object. |
| FR-D2 | The system must support per-project policy settings: `block_on_critical` (bool), `warn_on_high` (bool), `ignored_cwes` (array), `test_code_severity_reduction` (int). |
| FR-D3 | The system must provide web UI for DevOps engineers to configure policies (no JSON editing required). |
| FR-D4 | The system must apply configuration changes immediately without server restart. |
| FR-D5 | The system must log all configuration changes with `actor_id`, `timestamp`, `old_value`, `new_value` for audit. |
| FR-D6 | The system must allow CWE pattern suppression with reason field (e.g., "CWE-327 suppressed: MD5 for ETags only"). |
| FR-D7 | The system must expire suppressions after 90 days unless renewed. |
| FR-D8 | The system must notify Security Team when new suppression is added. |
| FR-D9 | The system must provide configuration templates for common scenarios: "Frontend-only project", "Compliance-regulated code", "Internal tools". |

### Module E: Observability

| # | Requirement |
|---|-------------|
| FR-E1 | The system must emit structured JSON logs to stdout for all events: `security_scan_requested`, `security_scan_completed`, `security_scan_failed`, `security_finding_overridden`, `remediation_applied`. |
| FR-E2 | The system must track scan latency (P50/P90/P95/P99) by scan mode, language, cache hit status. |
| FR-E3 | The system must track token cost per scan, aggregated by day/week/month. |
| FR-E4 | The system must track false positive rate: `(overridden Critical findings / total Critical findings)` per 30-day rolling window. |
| FR-E5 | The system must provide Grafana dashboard with widgets: scan performance, gate decision distribution, override rate by severity, token cost per scan, false positive rate, error rate. |
| FR-E6 | The system must alert (PagerDuty) if scan failure rate >10% for 10 minutes. |
| FR-E7 | The system must alert (Slack) if P95 scan latency >15s for fast mode. |
| FR-E8 | The system must alert (Slack) if cache hit rate <70% for 1 hour. |
| FR-E9 | The system must alert (Slack) if daily token cost >$100. |
| FR-E10 | The system must provide SLO dashboard showing 4