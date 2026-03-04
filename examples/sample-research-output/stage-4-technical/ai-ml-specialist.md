# AI/ML Systems Specialist

**Stage:** stage-4-technical
**LLM:** claude
**Mode:** autonomous
**Tokens:** 23764
**Generated:** 2026-02-13T03:59:30.141Z

---

# AI/ML Systems Specialist Analysis: Post-RC Security Gate

## 1. AI Component Inventory

| Component | AI Type | Model Requirement | Criticality |
|-----------|---------|------------------|-------------|
| **Pattern Extraction (RAG)** | Retrieval + Generative | Claude Opus / GPT-4 | HIGH |
| **Vulnerability Classification** | Few-shot Classification | Claude Sonnet (cheaper) | MEDIUM |
| **Remediation Generation** | Code Generation | Claude Opus (accuracy critical) | HIGH |
| **False Positive Discrimination** | Binary Classification | Fine-tuned Sonnet | CRITICAL |
| **Exploit Scenario Synthesis** | Generative (1-sentence) | GPT-4 Turbo (cost-optimized) | MEDIUM |

**Critical Insight:** The architecture proposes a **monolithic Claude Opus agent** for all tasks. This violates the multi-agent hierarchy principle — specialized agents will outperform at 40-60% lower cost.

---

## 2. Accuracy Targets (Against Labeled Ground Truth)

### Primary Metrics (Must-Have)

| Task | Target Accuracy | Measurement Method | Baseline |
|------|----------------|-------------------|----------|
| **CWE Classification** | ≥92% precision on Critical findings | Human security expert labels (n=500) | 86% (current AI tools per brief) |
| **False Positive Rate** | <10% on Critical, <20% on High | Developer override logs (implicit signal) | 15-21% (Semgrep benchmark) |
| **Remediation Correctness** | ≥85% fixes resolve vulnerability | Re-scan after applying fix | Unknown (needs baseline) |
| **Exploit Scenario Relevance** | ≥80% rated "helpful" by developers | 5-point Likert survey | N/A (new capability) |

### Secondary Metrics (Nice-to-Have)

- **Severity Calibration:** ±1 severity level agreement with CVSS scoring (≥75%)
- **Context Awareness:** Test code flagged at -1 severity vs. production (≥90% correct downgrade)
- **Polyglot Detection:** Cross-language vulnerabilities caught (≥60% — this is HARD)

**Measurement Infrastructure Required:**
1. **Golden Dataset:** 500 labeled code samples (100 per CWE category) with expert annotations
2. **Shadow Mode:** Run gate on production code for 30 days WITHOUT blocking; compare to human review
3. **A/B Testing:** 50% of scans use RAG, 50% use full context injection — measure accuracy delta

---

## 3. Hallucination Rate Limits

### Acceptable Hallucination Scenarios

| Hallucination Type | Max Rate | Consequence | Mitigation |
|-------------------|----------|-------------|------------|
| **Invented CWE codes** | 0% | CRITICAL — breaks audit trail | Constrained output (enum of valid CWEs) |
| **Fabricated exploit scenarios** | <5% | MEDIUM — confuses developers | Grounding in real CVE database |
| **Incorrect remediation code** | <15% | HIGH — introduces new bugs | Re-scan validation loop |
| **Overstated severity** | <20% | MEDIUM — developer fatigue | Calibration against CVSS |

**Critical Guardrail:** Remediation code MUST be validated via:
1. **Syntax check** (Tree-sitter parse)
2. **Re-scan** (new code should eliminate finding)
3. **Diff safety** (no unrelated changes)

If re-scan shows new Critical findings, remediation is REJECTED and escalated to human.

---

## 4. Bias Audit Criteria

### Bias Dimensions to Test

1. **Language Bias:** Does the gate flag Python less than Java for identical SQL injection patterns?
   - **Test:** Translate 50 vulnerable snippets across 5 languages; measure severity consistency
   - **Threshold:** <10% severity variance for equivalent vulnerabilities

2. **Framework Bias:** Does the gate under-detect vulnerabilities in popular frameworks (React, Django) due to training data skew?
   - **Test:** Inject known CVEs from framework-specific advisories
   - **Threshold:** ≥85% detection rate regardless of framework popularity

3. **Verbosity Bias:** Does longer code get flagged more (false positives) due to surface area?
   - **Test:** Pad safe code with comments/whitespace; measure finding delta
   - **Threshold:** <5% increase in findings for 2x LOC inflation

4. **Recency Bias:** Does the gate miss newly-discovered CWE patterns not in training data?
   - **Test:** Synthetic generation of 2024+ vulnerability patterns
   - **Threshold:** ≥70% detection on patterns <6 months old

**Mitigation Strategy:** Quarterly bias audit with results published in security dashboard.

---

## 5. Agent Architecture (Multi-Agent Decomposition)

**Proposed Hierarchy:**

```
┌─────────────────────────────────────────────────────────┐
│ Orchestrator Agent (Claude Sonnet)                     │
│ - Routes code to specialized agents                    │
│ - Aggregates findings                                  │
│ - Decides block/warn/pass                              │
└────────┬────────────────────────────────────────────────┘
         │
    ┌────┴────┬────────────┬──────────────┬──────────────┐
    ▼         ▼            ▼              ▼              ▼
┌─────────┐ ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌────────┐
│Pattern  │ │Dataflow  │ │Remediation│ │Exploit   │ │False   │
│Matcher  │ │Analyzer  │ │Generator  │ │Scenario  │ │Positive│
│(Sonnet) │ │(Opus)    │ │(Opus)     │ │Writer    │ │Filter  │
│         │ │          │ │           │ │(GPT-4)   │ │(Tuned) │
└─────────┘ └──────────┘ └───────────┘ └──────────┘ └────────┘
```

**Why Multi-Agent?**
- **Dataflow Analyzer** requires deep reasoning (Opus) but only runs on High+ findings (10-20% of scans)
- **Pattern Matcher** handles 80% of cases with cheaper Sonnet
- **False Positive Filter** is fine-tuned on override logs (custom model, not general LLM)

**Cost Reduction:** 40-60% vs. monolithic Opus for all tasks.

---

## 6. Reflection Checkpoints (Self-Critique Loops)

### Where to Insert Reflection

1. **Post-Remediation Re-Scan (Mandatory)**
   ```
   Generate fix → Apply → Re-scan → IF new Critical findings:
     Reflect("Why did my fix introduce vulnerabilities?")
     → Retry with constraint("Do not modify unrelated code")
   ```

2. **Severity Calibration (On Override)**
   ```
   IF developer overrides High finding 3+ times:
     Reflect("Am I over-flagging this pattern?")
     → Downgrade severity to Medium for this project
   ```

3. **Exploit Scenario Validation (Sampling)**
   ```
   Generate exploit scenario → Self-critique:
     "Is this scenario realistic given the codebase context?"
     → IF confidence <70%, escalate to human
   ```

**Reflection Budget:** Max 1 reflection loop per finding (prevents infinite recursion). If 2nd reflection fails, escalate to human.

---

## 7. Human-in-the-Loop Gates

| Decision Point | Requires Human Approval | Timeout Behavior |
|----------------|------------------------|------------------|
| **Critical finding override** | YES (Security Champion) | Block after 4 hours → auto-escalate to Security Team |
| **Remediation introduces new Critical** | YES (immediate) | Cannot proceed without human fix |
| **Polyglot cross-boundary vulnerability** | YES (complex reasoning) | Warn + log, do not block |
| **sec-context pattern conflict** | YES (if 2+ patterns contradict) | Use most conservative (highest severity) |
| **Override rate >30% in 7 days** | YES (Security Team review) | Auto-disable gate, require manual re-enable |

**Critical Design:** Human approval MUST be **async** (non-blocking). Developer can continue working; approval happens in parallel. If denied, rollback is required.

---

## 8. Graceful Degradation Strategy

| Failure Mode | Degraded Behavior | User Experience |
|--------------|------------------|-----------------|
| **Claude API timeout (>30s)** | Fall back to cached top-10 CWE patterns (regex-based) | Warning: "Partial scan — full analysis unavailable" |
| **RAG vector store down** | Inject full 165K context (slow + expensive) | Latency spike to 30-45s; cost alert triggered |
| **False Positive Filter unavailable** | Skip FP filtering; accept higher FP rate | Developer sees more warnings (tolerable) |
| **All AI systems down** | Fail-open + log incident | "Security gate offline — manual review required" |

**Recovery SLA:** 
- **Transient failures (<5min):** Auto-retry with exponential backoff
- **Sustained failures (>5min):** Switch to degraded mode + alert on-call
- **Catastrophic (>30min):** Disable gate, require manual investigation

---

## 9. Model Selection & Reasoning

| Task | Recommended Model | Rationale | Fallback |
|------|------------------|-----------|----------|
| **Pattern Extraction (RAG)** | Claude Opus 3.5 | Best instruction-following for structured output | GPT-4 Turbo |
| **Dataflow Analysis** | Claude Opus 3.5 | Superior reasoning for taint propagation | GPT-4 (acceptable) |
| **Remediation Generation** | Claude Opus 3.5 | Lowest hallucination rate on code fixes | GPT-4 Turbo |
| **Exploit Scenarios** | GPT-4 Turbo | 60% cheaper, sufficient quality for 1-sentence output | Claude Sonnet |
| **False Positive Filter** | Fine-tuned Sonnet | Custom model trained on override logs (proprietary data) | Sonnet base (degraded) |

**Fine-Tuning Strategy:**
- Collect 10K override logs (5K true positives, 5K false positives)
- Fine-tune Sonnet on binary classification task
- Target: ≥90% precision on FP detection (reduces developer friction)

**Cost Optimization:**
- Use Sonnet for initial triage (80% of scans)
- Escalate to Opus only for High+ findings (20% of scans)
- Expected cost: **$0.06/scan** (vs. $0.15 for monolithic Opus)

---

## 10. Failure Modes to Avoid (Anti-Patterns)

### ❌ Monolithic Agent for All Tasks
**Why Fatal:** Exponential complexity; single point of failure; no cost optimization.  
**Mitigation:** Multi-agent architecture (see Section 5).

### ❌ No Accuracy Baseline
**Why Fatal:** Cannot measure improvement; "stochastic parrot" behavior undetected.  
**Mitigation:** Golden dataset + shadow mode testing (see Section 2).

### ❌ Unconstrained Remediation Output
**Why Fatal:** AI generates arbitrary code changes; introduces new bugs.  
**Mitigation:** Syntax validation + re-scan loop + diff safety check (see Section 3).

### ❌ No Reflection on Override Patterns
**Why Fatal:** Gate never learns from developer feedback; FP rate stays high.  
**Mitigation:** Severity downgrade on 3+ overrides (see Section 6).

### ❌ Synchronous Human Approval
**Why Fatal:** Blocks developer velocity; gate becomes bottleneck.  
**Mitigation:** Async approval with timeout escalation (see Section 7).

---

## Summary: AI Systems Risk Profile

**Highest Risks:**
1. **Hallucinated Remediation** — Could introduce worse vulnerabilities than original code
2. **False Positive Cascade** — Bad sec-context update flags 50% of scans incorrectly
3. **Cost Explosion** — Full context injection at scale bankrupts unit economics

**Mitigations:**
1. **Re-scan validation loop** (catches bad fixes)
2. **Blue-green deployment** (rollback within 1 hour)
3. **RAG mandatory** (caps token cost at $0.06/scan)

**Success Metrics:**
- ≥92% precision on Critical findings
- <10% FP rate (measured via override logs)
- <$0.10/scan average cost
- ≥85% remediation correctness (re-scan validation)