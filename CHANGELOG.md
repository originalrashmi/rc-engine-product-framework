# Changelog

All notable changes to RC Engine are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-03-25

### Added
- `rc_forge_all` tool: batch-build all pending tasks in Phase 6 in one call
- `rc_autopilot` tool: run remaining phases 3-8 automatically with auto-approved gates
- Design Intelligence gate blocking: checkpoints 2-5 require design work for high-UX projects (uxScore >= 4)
- `force` parameter on `rc_gate` to bypass design checks when needed (logged to audit trail)
- Haiku 4.5 and Opus 4.6 cost rates in CostTracker for accurate cost reporting
- `gate.design-bypass` audit action for tracking forced gate approvals

### Improved
- ConnectAgent and CompoundAgent now filter artifacts to relevant files only (15-30% token reduction)
- PRDs over 5000 characters are truncated in agent context to reduce token waste
- All LLM clients (Claude, OpenAI, Gemini) now report inputTokens and outputTokens separately
- UX specialist knowledge modules load conditionally based on uxMode (standard mode skips specialists)
- Base agent reports actual input/output token values instead of hardcoded zeros

### Fixed
- Starter tier fully removed from code, UI, billing, tests, and documentation (Free/Pro/Enterprise only)
- rc_connect and rc_compound were callable on free tier, now correctly gated behind Pro
- Tool count corrected to 14 free, 52 total across all documentation
- Gate count corrected to 12 (3 Pre-RC + 8 RC + 1 Post-RC)

---

## [1.0.0] - 2026-03-02

### Added

#### Pipeline
- Complete 4-domain pipeline: Pre-RC (Research), RC (Build), Post-RC (Validation), Traceability (Audit)
- 52 MCP tools across all domains (all available, community edition)
- Graph engine with topological sort, gate interrupts, and fan-out/fan-in execution
- Domain coordinators wrapping graph execution for Pre-RC, RC, and Post-RC
- Cross-domain bridge: Pre-RC research imports into RC build pipeline
- Pipeline status tool with cross-domain token usage summary

#### Pre-RC Research
- 20 AI research personas with per-persona LLM routing
- Cynefin complexity classification (Clear, Complicated, Complex, Chaotic)
- 6 research stages with 3 quality gates
- Web-grounded market research via Perplexity (cited sources)
- 19-section PRD synthesis with HTML deck and DOCX export
- Persona activation rules based on complexity domain

#### RC Build
- 8-phase gated build pipeline: Illuminate, Define, Architect, Sequence, Validate, Forge, Connect, Compound
- Phase 6 (Forge): generates actual code files with test scaffolding
- Phase 7 (Connect): integration verification across forge outputs
- Phase 8 (Compound): production hardening assessment
- UX sub-agent with 42 core rules and 8 specialist modules
- Design generation with HTML wireframes (lo-fi + hi-fi)
- Pre-RC bridge agent for 19-section to 11-section PRD conversion

#### Post-RC Validation
- Security scanning against OWASP anti-patterns (CWE-referenced)
- 7-check monitoring readiness assessment
- Observability spec generation from PRD
- Finding override with permanent audit trail
- Ship/no-ship gate with severity-based blocking

#### Traceability
- NASA/DO-178C-inspired requirements traceability
- Deterministic requirement IDs (PRD-FUNC-001, PRD-SEC-001)
- Task-to-requirement and finding-to-requirement mapping
- Consulting-grade HTML traceability report
- Coverage matrix with orphan detection

#### Infrastructure
- Multi-LLM orchestration: Claude, OpenAI, Gemini, Perplexity
- Dual-mode execution: autonomous (API keys) and passthrough (structured prompts)
- SQLite checkpoint store with WAL mode and atomic writes
- Per-domain token tracking with persistent PIPELINE.md summary
- Zod-validated state management with corruption detection
- Web UI with guided wizard, magic link auth, and real-time updates

#### Documentation
- Comprehensive README with full pipeline walkthrough
- Getting Started guide (Web UI and MCP modes)
- Usage and Cost Guide with plan recommendations
- Architecture documentation
- Agent delegation protocol
- Conversation UX templates

### Security
- Input validation via Zod on all tool parameters
- Rate limiting on all web API endpoints
- CORS configuration with allowed origins
- Security headers via Helmet
- API keys read from .env (gitignored), never logged or displayed
- Deny rules for sensitive files in .claude/settings.json
