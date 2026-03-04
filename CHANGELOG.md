# Changelog

All notable changes to RC Engine are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-03-02

### Added

#### Pipeline
- Complete 4-domain pipeline: Pre-RC (Research), RC (Build), Post-RC (Validation), Traceability (Audit)
- 31 MCP tools across all domains
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
