# Primary User Archetype Researcher

**Stage:** stage-2-user-intelligence
**LLM:** claude
**Mode:** autonomous
**Tokens:** 8025
**Generated:** 2026-02-13T03:54:00.748Z

---

# Primary User Archetype Researcher — Analysis

## 1. User Behavioral Model

**Primary Archetype:** The Velocity-Constrained Security Skeptic

### Core Identity
- **Role:** Mid-to-senior developer using AI code generation tools (GitHub Copilot, Claude, GPT-4) within the RC Method workflow
- **Primary Goal:** Ship features quickly while maintaining plausible deniability on security ("the tool said it was safe")
- **Secondary Goal:** Avoid being blamed for vulnerabilities in production
- **Constraint:** Operates under sprint deadlines where security friction = missed commitments

### Decision-Making Pattern (RPD Model)
This user does NOT compare security tools rationally. They recognize **situation-action patterns**:

1. **Pattern 1: "Green Light" → Deploy**  
   Cue: Security scan passes with no warnings  
   Action: Merge PR immediately, no second thought  
   Mental Model: "The gate validated it; I'm covered"

2. **Pattern 2: "Yellow Light" → Triage Heuristic**  
   Cue: Medium/High warnings appear  
   Action: Scan warning text for keywords ("SQL injection" = pause, "insecure random" = ignore)  
   Mental Model: "Is this a real threat or tool noise?"  
   **Critical:** Decision made in <30 seconds based on severity label + first sentence of description

3. **Pattern 3: "Red Light" → Bypass Calculation**  
   Cue: Critical blocking error  
   Action: Evaluate `time_to_fix` vs. `time_to_override + political_cost`  
   Mental Model: "Can I justify overriding this in standup?"  
   **Threshold:** If fix takes >15 minutes OR requires architectural change, override probability >60%

4. **Pattern 4: "Tool is Broken" → Permanent Disable**  
   Cue: 3+ false positives in a week  
   Action: Disable security gate, tell team "it's unusable"  
   Mental Model: "This tool doesn't understand our codebase"

### Cognitive Load Distribution

**Intrinsic Load (Task Difficulty):**
- Interpreting CWE codes: HIGH (most developers don't know CWE-79 = XSS)
- Evaluating remediation guidance: MEDIUM (if code snippets provided)
- Assessing false positive likelihood: HIGH (requires security expertise they lack)

**Extraneous Load (Design-Induced):**
- Reading 500-word security reports: EXTREME (will skip)
- Context-switching from IDE to external docs: HIGH (breaks flow)
- Navigating multi-step override processes: MEDIUM-HIGH

**Germane Load (Productive Learning):**
- Understanding why specific code is vulnerable: LOW (not prioritized under deadline)
- Building mental models of AI-generated vulnerability patterns: NEAR-ZERO (unless repeated exposure)

### Working Memory Constraints Under Stress

**Normal State (Low Pressure):**
- Can hold 3-4 security findings in working memory
- Willing to read 2-3 sentence descriptions
- Capable of basic risk assessment

**Sprint Deadline State (High Pressure):**
- Working memory collapses to 1-2 items
- Scans only severity labels + first 5 words
- Reverts to heuristic: "Does this sound scary?" (yes/no binary)
- **Optimization ability degrades:** Cannot evaluate trade-offs between multiple Medium findings vs. one High finding

---

## 2. Cognitive Load Assessment

### Highest Intrinsic Load Zones
1. **Vulnerability Classification:** Mapping "CWE-89" → "SQL Injection" → "Why this matters in my context" requires 3 translation steps
2. **Remediation Evaluation:** Determining if fix is trivial (change one line) vs. architectural (rewrite auth flow)
3. **False Positive Discrimination:** Distinguishing real XSS risk from overly cautious pattern matching

### Extraneous Load Elimination Targets
- **Remove:** CWE codes in primary UI (move to expandable detail)
- **Remove:** Multi-paragraph explanations (max 2 sentences)
- **Remove:** External link navigation (inline all guidance)
- **Remove:** Manual categorization (auto-group by affected file/function)

### Germane Load Opportunities (Low Priority)
- Showing "why AI generated this vulnerability" could build long-term pattern recognition, BUT only if <10 second read time
- Tracking "you've seen this pattern 3 times" could trigger learning, BUT only if non-intrusive

---

## 3. RPD Triggers (Expert User Shortcuts)

### Recognizable Patterns That Bypass Analysis

**Trigger 1: "I've Seen This Before"**
- Cue: Vulnerability type matches previous override
- Shortcut: Auto-apply same justification, skip reading description
- **Design Implication:** Track override history; surface "You marked CWE-79 as false positive last week — same pattern?"

**Trigger 2: "This File is Auto-Generated"**
- Cue: Vulnerability in `/generated/` or `node_modules/`
- Shortcut: Immediate override (not my code)
- **Design Implication:** Auto-suppress findings in dependency code unless Critical

**Trigger 3: "This is Test Code"**
- Cue: Vulnerability in `__tests__/` or `*.spec.ts`
- Shortcut: Ignore unless it's credential leakage
- **Design Implication:** Different severity thresholds for test vs. production code

**Trigger 4: "The Variable Name is Safe"**
- Cue: SQL injection warning but variable is `userId` (sounds safe)
- Shortcut: Override based on naming convention
- **Design Implication:** Context-aware severity (parameterized query with `userId` = Low, raw `userInput` = Critical)

---

## 4. Bias Inventory

### Automation Bias (CRITICAL RISK)
**Manifestation:** User trusts AI-generated code is secure because "AI should know better"  
**Interaction with Gate:** If gate shows 0 findings, user assumes code is bulletproof (false negative risk)  
**Mitigation:** Always show "Scanned X patterns, found Y issues" to signal active analysis

### Conservatism Bias
**Manifestation:** User resists changing code that "works" even if vulnerable  
**Interaction with Gate:** High findings on functional code → "Why break what works?"  
**Mitigation:** Show exploit scenario in 1 sentence ("Attacker can dump user table via search box")

### Confirmation Bias
**Manifestation:** User seeks evidence that override is justified, ignores contrary signals  
**Interaction with Gate:** Reads only the parts of security report that support "this is a false positive"  
**Mitigation:** Force confrontation with worst-case scenario before override button enables

### Optimism Bias
**Manifestation:** "This vulnerability won't be exploited in our use case"  
**Interaction with Gate:** Dismisses findings as theoretical  
**Mitigation:** Show real CVEs from similar patterns (e.g., "CWE-89 caused Equifax breach")

### Present Bias (HIGHEST IMPACT)
**Manifestation:** Immediate sprint deadline > future security incident  
**Interaction with Gate:** Override to ship now, plan to "fix later" (never happens)  
**Mitigation:** Make override require manager approval for Critical findings (social cost)

---

## 5. Performance Budgets

### Latency Thresholds (Based on Flow State Research)
- **<3 seconds:** Perceived as instant; no cognitive disruption
- **3-10 seconds:** Tolerable if progress indicator present; user remains in task context
- **10-30 seconds:** Context switch likely; user opens Slack/email
- **>30 seconds:** Abandonment; user disables tool

**Gate Requirement:** P95 scan latency <10s OR async with non-blocking notification

### Cognitive Throughput Limits
- **Maximum findings per scan:** 5 (beyond this, user skips to bottom)
- **Maximum description length:** 2 sentences (longer = unread)
- **Maximum remediation steps:** 3 bullets (more = overwhelming)

### Decision Latency Budget
- **Time to interpret severity:** <5 seconds (color + icon must be instant signal)
- **Time to decide override:** <30 seconds (longer = analysis paralysis)
- **Time to apply fix:** <15 minutes (longer = override becomes rational choice)

---

## 6. Recovery Paths (No Dead Ends Principle)

### Scenario 1: False Positive on Critical Finding
**Dead End:** Gate blocks deploy, user cannot override, fix is impossible  
**Recovery Path:** `rc_security_override --reason="False positive: user input is sanitized at API gateway" --approver=@security-team`

### Scenario 2: Scan Timeout/Error
**Dead End:** Gate fails, blocks deploy, no error message  
**Recovery Path:** Auto-fail-open with warning + log to security team for manual review

### Scenario 3: Remediation Guidance is Wrong
**Dead End:** User applies suggested fix, scan still fails  
**Recovery Path:** "Remediation didn't resolve issue? Override with explanation" button appears after 2nd scan

### Scenario 4: Legitimate Vulnerability, No Time to Fix
**Dead End:** Critical finding, sprint ends tomorrow, no override allowed  
**Recovery Path:** Temporary override with auto-expire (7 days) + JIRA ticket auto-created

### Scenario 5: Tool Doesn't Understand Codebase
**Dead End:** 10 false positives, user rage-disables tool  
**Recovery Path:** "Report false positive" button → feeds into model tuning → user gets notification when pattern is refined

---

## 7. Design Implications Summary

1. **Severity Must Be Instant Recognition:** Color + icon + 3-word label (no CWE codes in primary UI)
2. **Descriptions Must Be Scannable:** Severity + Impact + Exploit Scenario in <50 words
3. **Override Must Be Friction-Matched to Risk:** Medium = 1-click, High = justification required, Critical = manager approval
4. **False Positive Handling is Make-or-Break:** <10% FP rate on Critical OR tool gets disabled
5. **Async Scanning for >10s Operations:** Non-blocking notification, not gate
6. **Context-Aware Severity:** Test code vs. production code, auto-generated vs. hand-written
7. **Override History Tracking:** Surface patterns ("You've overridden XSS 3 times — pattern?")

**Success Metric:** Override rate <30% AND P90 scan latency <10s AND developer NPS >40