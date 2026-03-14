# Claims Audit Knowledge Base

LLM context for the Claims Auditor module. This file is loaded during Layer 2
(LLM-based analysis) to help identify marketing claims that do not match reality.

## Claim Categories

### Quantity Claims
Claims about specific numbers (tools, specialists, gates, phases).

**Red flags:**
- Exact number without qualifier ("20 specialists" vs "up to 20")
- Number that does not match code (count actual enum values, tool registrations, graph nodes)
- Conditional activation presented as universal ("20 specialists" when 3-20 activate)

**Cross-reference methodology:**
- Tool count: count `server.tool()` and `server.registerTool()` calls across all domain tools.ts files
- Specialist count: count persona definitions in Pre-RC persona registry
- Gate count: count graph nodes with `type: 'gate'` across all graph definitions
- Phase count: count distinct phases in RC Method pipeline

### Performance Claims
Claims about speed, cost savings, or equivalent value.

**Red flags:**
- "X times faster" without baseline comparison or methodology
- "Y% cost reduction" without cost model or data source
- "$Z equivalent value" without consulting rate justification
- Superlative language: "fastest", "cheapest", "most comprehensive"

**Requirements for defensibility:**
- Comparison baseline must be stated
- Methodology must be documented or linked
- Sample size or data source must be cited
- Time period must be specified

### Capability Claims
Claims about what the tool can do.

**Red flags:**
- "Full" or "complete" coverage when gaps are documented
- "Production-ready" when output goes to staging directory
- "OWASP scanning" when only partial pattern coverage exists
- "Enterprise-grade" without defining what that means
- "Automated" when human steps are required

**Cross-reference methodology:**
- Check ARCHITECTURE.md "Known Gaps" section for documented limitations
- Check if claimed features are in "dormant" infrastructure (built but not wired)
- Verify output paths (staging vs source tree)

### Value Claims
Claims about ROI, cost savings, or consulting equivalence.

**Red flags:**
- Dollar values without methodology
- Percentage claims without baseline
- Comparison to human teams without scope definition
- "Equivalent to X hours of consulting" without rate justification

### Completeness Claims
Claims using absolute language.

**Red flags:**
- "Every requirement" (verify all are actually tracked)
- "All findings" (verify none are dropped)
- "Full traceability" (verify end-to-end chain exists)
- "Comprehensive" (verify coverage percentage)

## Disclaimer Requirements

### Required Disclaimers (by claim type)

| Claim Type | Required Disclaimer |
|------------|-------------------|
| AI-generated output | "AI-generated content should be reviewed by a qualified professional" |
| Security scanning | "Design-time analysis tool, not a replacement for professional security auditing" |
| Legal review | "Automated compliance checking, not legal counsel. Consult a qualified attorney" |
| Cost estimates | "Estimates based on typical usage; actual costs vary by complexity and provider rates" |
| Specialist count | "Number of active specialists depends on product complexity classification" |
| Production readiness | "Provides readiness assessment and guidance; final production deployment requires human review" |

### Missing Disclaimer Severity

| Context | Missing Disclaimer Severity |
|---------|---------------------------|
| Security/legal claims | High |
| Cost/value claims | Medium |
| Quantity claims | Low |
| Capability qualifiers | Medium |
