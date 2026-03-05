# Changelog

All notable changes to RC Engine are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-03-04

### Added

#### Gateway
- **`rc_init` unified entry point** -- new cross-domain gateway tool that detects project state across all 4 domains (Pre-RC, RC, Post-RC, Traceability) and routes to the correct next tool
- Defaults to Pre-RC research (`prc_start`) for new projects -- research before building, always
- `skip_research` opt-out parameter for users who explicitly want to bypass Pre-RC
- State detection cascade: Post-RC → RC (phase-aware) → Pre-RC complete → Pre-RC in progress → new project
- Total tool count: 32 → 33

#### npm Distribution
- **Published to npm** -- install with `npm install -g rc-engine` or run with `npx rc-engine`
- `files` array in package.json ensures only `dist/`, README, LICENSE, CHANGELOG are published
- `prepublishOnly` script runs full check suite + build before every publish

#### Startup Banner + Update Check
- Startup log now shows version: `Connected v1.1.0 - 33 tools - ...`
- Non-blocking version check against npm registry (3s timeout, 24h cache)
- Shows update notice in stderr when a newer version is available

#### Opt-in Telemetry
- Anonymous usage data collection (OFF by default -- opt-in via `.rc-engine/preferences.json`)
- Collects: tool name, tier, OS, Node version, rc-engine version, random session ID
- Never collects: project paths, brief content, API keys, any user data
- Events buffered in memory, flushed once at process exit

#### Edge Case Analysis Module (Pro)
- **New Post-RC scan module:** automated edge case detection across 7 categories
- Categories: `input-boundary`, `error-state`, `concurrency`, `data-integrity`, `integration`, `state-transition`, `performance-edge`
- 3-layer analysis: static pattern matching (15 rules), structural PRD/task gap analysis, LLM edge case matrix
- Finding ID prefix: `ECX-` (e.g., ECX-001)
- Pro tier: full matrix with severity, category, reproduction scenario, and remediation
- Free/Starter tier: summary count teaser ("12 edge cases found -- upgrade for details")
- Runs in parallel with existing security, monitoring, and legal modules (fan-out/fan-in graph)
- Auto-generates `[EDGE-CASE]` tagged remediation tasks for `rc_forge_task`
- Configurable via `postrc_configure` with `edge_case_enabled`, `edge_case_block_on_critical`, `edge_case_categories`
- `edgeCaseAnalysis` feature flag in tier definitions (Pro + Enterprise)

#### Security & Stability Fixes
- **Fix:** Windows paths (`C:\...`) now accepted in MCP tools (previously rejected)
- **Fix:** Tier enforcement now fail-closed (unknown tiers default to free, not full access)
- **Fix:** Gated tools without `project_path` are blocked instead of bypassing tier checks
- **Fix:** `prc_stress_test` correctly mapped to `stressTest` feature (was `playbook` in web server)
- **New:** Single source of truth for tool-tier mapping (`src/core/pricing/tool-requirements.ts`)
- **New:** Activity audit log at `.rc-engine/audit/activity.jsonl` (JSONL, append-only)
- **New:** Web server writes `.rc-engine/tier.json` on tier change (bridges web-MCP enforcement)

#### Demo
- FreelanceFlow demo app: full RC Method lifecycle (all 8 phases) with SQLite local dev setup
- Seed data: 5 clients, 5 invoices (all statuses), 15 line items, 10 time entries, 2 templates

---

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
- Web UI with guided wizard, magic link auth, and real-time updates (free tier: research only; paid tiers: full pipeline access)

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
