# RC Engine - Agent Delegation Protocol

## Agent Architecture

RC Engine uses a parent-child agent model. The **alpha agent** (defined in `/CLAUDE.md`) orchestrates four specialized child agents. Each child agent owns a specific set of tools and operates within strict boundaries.

## Routing Table

| Tool Prefix | Agent | File | Domain |
|-------------|-------|------|--------|
| `prc_*` | Pre-RC Researcher | `pre-rc-researcher.md` | Research |
| `rc_*` | RC Builder | `rc-builder.md` | Build |
| `ux_*` | RC Builder | `rc-builder.md` | Build (UX) |
| `postrc_*` | Post-RC Validator | `post-rc-validator.md` | Validation |
| `trace_*` | Traceability Auditor | `traceability-auditor.md` | Audit |
| `rc_pipeline_status` | Alpha (direct) | `CLAUDE.md` | Pipeline |

## Delegation Rules

1. The alpha agent decides WHICH domain to invoke based on pipeline stage and user intent
2. Tool calls are routed to the owning agent based on prefix
3. Each agent operates independently within its domain - it does NOT call tools from other domains
4. When an agent completes its work, it returns control to the alpha with a structured summary

## Handoff Protocol

### Alpha to Child
The alpha agent delegates by calling a domain-specific tool. The child agent activates and handles all subsequent tool calls within that domain until the work is complete.

### Child to Alpha (return)
Each child agent returns:
- Summary of work completed
- Paths to generated artifacts
- Cumulative cost for the domain
- Recommendation for next step

### Cross-Domain Triggers
These are initiated by the alpha agent (never by child agents):

| Trigger Event | Alpha Action |
|---------------|-------------|
| After `prc_synthesize` completes | Call `trace_enhance_prd` (auto) |
| After Pre-RC Gate 3 approved | Call `rc_import_prerc` to bridge to build |
| After all `rc_forge_task` complete | Call `postrc_scan` to validate |
| After `postrc_scan` completes | Call `trace_map_findings` (auto) |
| After `postrc_gate` approved | Present pipeline completion summary |

## File System Boundaries

| Agent | Writes To | Reads From |
|-------|-----------|------------|
| Pre-RC Researcher | `pre-rc-research/` | `knowledge/pre-rc/` |
| RC Builder | `rc-method/` | `knowledge/rc/`, `pre-rc-research/` (import only) |
| Post-RC Validator | `post-rc/` | `rc-method/`, `knowledge/post-rc/` |
| Traceability Auditor | `rc-traceability/` | `pre-rc-research/`, `rc-method/`, `post-rc/` |
| Alpha | `.rc-engine/` | All directories (read-only) |

## Error Recovery

| Scenario | Protocol |
|----------|----------|
| Child agent fails mid-phase | Alpha reports error to user, offers retry or skip |
| Gate rejected | Child stays at current phase, incorporates feedback |
| LLM provider unavailable | Fall back to passthrough mode (structured prompts) |
| State corruption detected | Alpha stops, reports to user, offers recovery options |
| Cross-domain trigger fails | Alpha logs the gap and continues - does not block pipeline |

## Tool Count Verification

The pipeline has 31 registered MCP tools:
- Pre-RC: 6 tools (`prc_start`, `prc_classify`, `prc_gate`, `prc_run_stage`, `prc_status`, `prc_synthesize`)
- RC Method: 11 tools (`rc_start`, `rc_import_prerc`, `rc_illuminate`, `rc_define`, `rc_architect`, `rc_sequence`, `rc_validate`, `rc_forge_task`, `rc_gate`, `rc_save`, `rc_status`)
- UX: 4 tools (`ux_score`, `ux_audit`, `ux_generate`, `ux_design`)
- Post-RC: 7 tools (`postrc_scan`, `postrc_override`, `postrc_report`, `postrc_configure`, `postrc_gate`, `postrc_status`, `postrc_generate_observability_spec`)
- Traceability: 3 tools (`trace_enhance_prd`, `trace_map_findings`, `trace_status`)
- Pipeline: 1 tool (`rc_pipeline_status`)
