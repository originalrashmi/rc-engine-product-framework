# Jobs-to-be-Done Theorist

**Stage:** stage-2-user-intelligence
**LLM:** claude
**Mode:** autonomous
**Tokens:** 12403
**Generated:** 2026-02-13T03:55:48.738Z

---

# Jobs-to-be-Done Analysis: Post-RC Security Gate

## 1. High-Level Job Statement

**"When I'm shipping AI-generated code under deadline pressure, I want to avoid being blamed for security incidents, so I can maintain my reputation as a competent engineer while meeting velocity expectations."**

This is NOT "secure my application" — that's the functional veneer. The real job is **reputation protection through plausible deniability**.

---

## 2. Micro-Jobs Ladder

### Job 1: Prove Due Diligence (Primary)
**Functional:** Generate audit trail showing "security was checked"  
**Social:** Demonstrate to management/peers that process was followed  
**Emotional:** Feel protected from blame if vulnerability emerges post-deploy

### Job 2: Avoid Deadline Slippage (Competing Job)
**Functional:** Ship code within sprint commitment  
**Social:** Maintain reputation as "reliable executor"  
**Emotional:** Avoid stress of explaining delays to PM/stakeholders

### Job 3: Minimize Context Switching (Efficiency Job)
**Functional:** Stay in flow state during coding  
**Social:** Be perceived as "in the zone" not "distracted by tooling"  
**Emotional:** Avoid frustration of broken concentration

### Job 4: Learn Just Enough Security (Aspirational, Low Priority)
**Functional:** Understand why specific code is vulnerable  
**Social:** Not look ignorant when security team asks questions  
**Emotional:** Feel competent, not exposed as "security illiterate"

---

## 3. Three-Dimensional Job Map

| Job Dimension | Critical Requirements | Failure Signals |
|---------------|----------------------|-----------------|
| **Functional** | <10s scan latency; <10% false positive rate; 1-click override for Medium findings | >30s latency = context switch; >15% FP = tool disabled |
| **Social** | Override justifications visible to security team; "I followed the process" defensibility | If overrides are secret, no social protection value |
| **Emotional** | Green checkmark = relief; Red block = anxiety spike (must resolve in <15min or override becomes rational) | Persistent anxiety → tool abandonment |

### The Social Dimension is Underestimated

Developers hire this tool to **perform security consciousness** for their managers and security teams. If the tool runs silently with no visible artifact, it fails the social job even if functionally perfect.

**Design Implication:** Scan results must be **publicly loggable** (Slack notification, PR comment, dashboard). The act of scanning must be **witnessed**.

---

## 4. Switching Costs & Anxieties

### What Prevents "Firing" Current Solution (Manual Review)?

**Switching Cost 1:** Manual security review has **unbounded latency** (hours to days)  
→ Security gate promises bounded latency (<10s) = massive time savings

**Switching Cost 2:** Manual review requires **asking for help** (social cost)  
→ Automated gate preserves autonomy ("I can self-serve security")

**Anxiety 1:** "What if I miss something obvious?"  
→ Gate provides checklist validation (reduces cognitive load)

**Anxiety 2:** "What if security team thinks I'm incompetent?"  
→ Gate shows "I tried to catch issues" (reputation insurance)

### What Prevents Adoption of This Gate?

**Adoption Anxiety 1:** "Will this slow me down?" (Latency fear)  
→ Mitigated by <10s P90 promise + async option

**Adoption Anxiety 2:** "Will this block me with false positives?" (Control loss)  
→ Mitigated by tiered override permissions + historical override tracking

**Adoption Anxiety 3:** "Will this make me look bad?" (Exposure fear)  
→ If gate surfaces 10 Critical findings, developer fears being judged as "wrote terrible code"  
→ **Critical Mitigation:** Frame findings as "AI tool produced these patterns" NOT "you wrote vulnerable code"

---

## 5. Alternative Solutions (Competitive Job Landscape)

| Alternative | Functional Job | Social Job | Emotional Job | Why Users Might Prefer It |
|-------------|----------------|------------|---------------|----------------------------|
| **Manual code review** | Thorough but slow | High social proof ("senior engineer approved") | Anxiety remains until approval | Gold standard for high-stakes code |
| **GitHub Advanced Security** | Broad coverage | Strong brand signal | Overwhelming (100+ findings) | Already integrated in enterprise orgs |
| **"Ship and pray"** | Fastest | Plausible ignorance ("I didn't know") | High anxiety post-deploy | Deadline pressure overrides risk |
| **Disable AI code generation** | Eliminates AI risk | Perceived as "old school" | Loss of productivity gains | Conservative orgs with compliance mandates |

**Key Insight:** The gate competes with **"ship and pray"** more than traditional SAST tools. It must be **faster than ignoring the problem**.

---

## 6. Contextual Variation (How the Job Changes)

### Context 1: Pre-Merge (Low Stakes)
**Job:** Catch obvious issues before embarrassment in code review  
**Tolerance:** High false positive tolerance (can investigate leisurely)  
**Override Threshold:** Low (will fix most findings)

### Context 2: Hotfix Under Incident (Extreme Stakes)
**Job:** Deploy immediately, accept all risk  
**Tolerance:** Zero tolerance for blocking (will disable tool)  
**Override Threshold:** 100% (everything gets overridden)

### Context 3: Compliance-Regulated Code (Audit Stakes)
**Job:** Generate defensible audit trail  
**Tolerance:** Medium false positive tolerance (must document overrides)  
**Override Threshold:** High (only override with security team approval)

### Context 4: Open Source Contribution (Reputation Stakes)
**Job:** Avoid public embarrassment of merged vulnerability  
**Tolerance:** Medium false positive tolerance (maintainer may reject PR)  
**Override Threshold:** Medium (will fix High+ findings)

**Design Implication:** Severity thresholds must be **context-aware** (branch type, file path, incident mode flag).

---

## 7. Emotional Payoff Requirements

### Must Deliver:
1. **Relief:** "I'm covered if this blows up" (blame deflection)
2. **Confidence:** "I can trust this won't embarrass me with obvious FPs" (tool credibility)
3. **Control:** "I can override when I know better" (autonomy preservation)
4. **Speed:** "This didn't slow me down" (flow state maintained)

### Must Avoid:
1. **Shame:** "This tool exposed how bad my code is" (reframe as AI issue)
2. **Frustration:** "This tool is blocking me for no reason" (false positives)
3. **Anxiety:** "Now I have 10 things to fix and no time" (overwhelming findings)
4. **Helplessness:** "I can't override this even though it's wrong" (trapped feeling)

### The "Security Blanket" Paradox

Developers want the gate to **exist** (provides emotional safety) more than they want it to **block** (creates friction). The ideal state is:
- **Frequent green checkmarks** (reinforces "I'm doing security right")
- **Rare yellow warnings** (manageable, builds trust)
- **Almost-never red blocks** (reserved for egregious issues)

If the gate blocks >5% of scans, it shifts from "safety tool" to "obstacle" in the developer's mental model.

---

## 8. JTBD-Driven Success Metrics

| Job Dimension | Leading Indicator | Lagging Indicator |
|---------------|-------------------|-------------------|
| **Functional** | P90 scan latency <10s | Zero production CVEs from AI code after 6mo |
| **Social** | Override rate <30% (proves social acceptability) | Security team references gate in incident postmortems |
| **Emotional** | Developer NPS >40 | Voluntary adoption rate >70% (not mandated) |

**The Ultimate JTBD Validation:** Developers **brag about the gate** in public forums ("Our AI workflow has built-in security") = social job fully satisfied.