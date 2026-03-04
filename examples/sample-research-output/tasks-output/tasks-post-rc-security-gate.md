# Tasks: Post-RC Security Gate

> Generated from: `prd-post-rc-security-gate.md`
> **Created:** 2024-02-15

---

## Relevant Files

### Core Scanning Engine (Module A)
- `src/mcp/tools/rc_security_scan.ts` - Main security scan tool implementation
- `src/mcp/tools/rc_security_scan.test.ts` - Tests for security scan tool
- `src/scanning/fast-scanner.ts` - Fast pattern-matching scan engine
- `src/scanning/deep-scanner.ts` - Async deep scan with LLM analysis
- `src/scanning/ast-parser.ts` - Tree-sitter AST parsing for multiple languages
- `src/scanning/pattern-matcher.ts` - Regex and AST pattern matching against CWE patterns
- `src/scanning/rag-retriever.ts` - Vector similarity search for CWE patterns
- `src/scanning/cache-manager.ts` - Redis caching for scan results
- `src/scanning/exploit-generator.ts` - GPT-4 exploit scenario synthesis
- `src/scanning/types.ts` - TypeScript types for findings, scan modes, etc.

### Override & Audit (Module B)
- `src/mcp/tools/rc_security_override.ts` - Override tool implementation
- `src/mcp/tools/rc_security_override.test.ts` - Tests for override tool
- `src/override/override-handler.ts` - Override workflow logic by severity
- `src/override/audit-logger.ts` - Immutable audit log storage
- `src/override/batch-review.ts` - Security Champion batch review interface
- `src/override/false-positive-learner.ts` - Pattern learning from overrides
- `src/override/secret-redactor.ts` - PII/secret redaction from override reasons
- `src/override/models/override.model.ts` - PostgreSQL override log schema

### Remediation (Module C)
- `src/remediation/remediation-generator.ts` - Claude Opus remediation code generation
- `src/remediation/remediation-validator.ts` - Re-scan validation loop
- `src/remediation/remediation-applier.ts` - IDE code application logic
- `src/remediation/remediation.test.ts` - Tests for remediation flow

### Configuration (Module D)
- `src/mcp/tools/rc_security_configure.ts` - Configuration tool implementation
- `src/config/policy-manager.ts` - Per-project policy storage and retrieval
- `src/config/suppression-manager.ts` - CWE suppression with expiration
- `src/config/config-ui/` - Web UI components for DevOps configuration
- `src/config/templates/` - Configuration templates for common scenarios

### Observability (Module E)
- `src/observability/logger.ts` - Structured JSON logging
- `src/observability/metrics.ts` - OpenTelemetry metrics collection
- `src/observability/alerts.ts` - PagerDuty and Slack alert integration
- `src/observability/dashboards/grafana-config.json` - Grafana dashboard definition

### Infrastructure
- `src/db/migrations/001_create_override_logs.sql` - PostgreSQL schema for audit logs
- `src/db/migrations/002_create_policy_config.sql` - PostgreSQL schema for policies
- `src/redis/streams.ts` - Redis Streams for async deep scan queue
- `src/vector-store/pgvector-setup.sql` - pgvector extension setup for RAG
- `docker-compose.yml` - Local development environment (PostgreSQL, Redis, pgvector)
- `.env.example` - Environment variable template

### Documentation
- `docs/installation.md` - Installation and setup guide
- `docs/configuration.md` - Configuration reference
- `docs/api.md` - API documentation for MCP tools
- `docs/troubleshooting.md` - Common errors and solutions

---

## Instructions for Completing Tasks

**IMPORTANT:** As you complete each task, check it off by changing `- [ ]` to `- [x]`. This tracks progress and ensures no steps are skipped.

Example:
- `- [ ] 1.1 Create database model` → `- [x] 1.1 Create database model` (after completing)

Update this file after completing each sub-task, not just after completing an entire parent task.

---

## Tasks

- [ ] 0.0 Project setup
  - [ ] 0.1 Create and checkout a new feature branch (`git checkout -b feature/post-rc-security-gate`)
  - [ ] 0.2 Install dependencies: Tree-sitter parsers for Python/JS/TS/Java/Go, Redis client, PostgreSQL client, pgvector client
  - [ ] 0.3 Set up local development environment using Docker Compose (PostgreSQL with pgvector, Redis)
  - [ ] 0.4 Create `.env` file from `.env.example` with Claude API key and database credentials
  - [ ] 0.5 Verify development environment starts without errors (`npm run dev`)
  - [ ] 0.6 Run database migrations to create initial schema

- [ ] 1.0 Core Scanning Engine — Fast Pattern Matching (Module A - Part 1)
  - [ ] 1.1 Create TypeScript types for findings, scan modes, severity levels, and CWE patterns in `src/scanning/types.ts`
  - [ ] 1.2 Implement Tree-sitter AST parser wrapper that accepts code string and language enum, returns parsed AST
  - [ ] 1.3 Build AST feature extractor that pulls function calls, variable assignments, string concatenations, and imports from AST
  - [ ] 1.4 Create regex pattern matcher that checks code against CWE patterns and returns findings with confidence scores
  - [ ] 1.5 Implement Redis cache manager with 7-day TTL, keyed by code hash + sec-context version
  - [ ] 1.6 Build fast scanner orchestrator that runs AST parsing → feature extraction → pattern matching → caching in <5s
  - [ ] 1.7 Add context-aware severity adjustment logic (reduce severity for test files)
  - [ ] 1.8 Write unit tests for fast scanner covering all supported languages and top 10 CWE patterns

- [ ] 2.0 Core Scanning Engine — RAG Integration (Module A - Part 2)
  - [ ] 2.1 Set up pgvector database schema with embeddings table for CWE patterns
  - [ ] 2.2 Create embedding generation script that converts 165K-token sec-context into vector embeddings using OpenAI embeddings API
  - [ ] 2.3 Load CWE pattern embeddings into pgvector database
  - [ ] 2.4 Implement RAG retriever that accepts language + code features, queries pgvector for top 10 relevant CWE patterns in <200ms
  - [ ] 2.5 Integrate RAG retriever into fast scanner to replace hardcoded pattern list
  - [ ] 2.6 Measure and validate token cost reduction (target: <$0.10 per scan)
  - [ ] 2.7 Write tests for RAG retriever with mock vector store

- [ ] 3.0 Core Scanning Engine — Async Deep Scan (Module A - Part 3)
  - [ ] 3.1 Create Redis Streams queue for deep scan jobs with 60s timeout
  - [ ] 3.2 Implement deep scanner that uses Claude Opus with 15K-token context (RAG patterns + full code)
  - [ ] 3.3 Build dataflow taint analysis for High+ findings that tracks variable propagation across functions
  - [ ] 3.4 Add async job enqueuer that triggers when fast scan finds High+ findings or scan mode is 'deep'
  - [ ] 3.5 Implement MCP event stream notification that alerts developer when async scan completes
  - [ ] 3.6 Add polyglot code detection that flags cross-language data flow for manual review
  - [ ] 3.7 Write integration tests for deep scanner with sample vulnerable code snippets

- [ ] 4.0 Core Scanning Engine — Exploit Scenario Generation (Module A - Part 4)
  - [ ] 4.1 Implement exploit scenario generator using GPT-4 Turbo that creates 1-sentence exploit descriptions
  - [ ] 4.2 Integrate exploit generator into finding output for Critical findings only
  - [ ] 4.3 Add caching for exploit scenarios to avoid regenerating for identical findings
  - [ ] 4.4 Write tests for exploit generator with sample CWE patterns

- [ ] 5.0 MCP Tool — rc_security_scan (Module A - Integration)
  - [ ] 5.1 Create `rc_security_scan` MCP tool that accepts code, language, file path, and scan mode parameters
  - [ ] 5.2 Wire tool to fast scanner for initial scan, with automatic async deep scan trigger
  - [ ] 5.3 Format findings as JSON array with all required fields (finding_id, cwe_id, severity, line numbers, confidence, description, remediation_guidance)
  - [ ] 5.4 Add error handling with fail-open behavior (return WARN on API timeout, not BLOCK)
  - [ ] 5.5 Implement circuit breaker for Claude API with 50% error rate threshold
  - [ ] 5.6 Add auto-trigger logic so `rc_forge_task` completion automatically invokes `rc_security_scan`
  - [ ] 5.7 Write end-to-end tests for `rc_security_scan` tool covering fast scan, deep scan, and error scenarios

- [ ] 6.0 Override & Audit — Override Workflow (Module B - Part 1)
  - [ ] 6.1 Create PostgreSQL schema for override logs with immutable constraints (no UPDATE/DELETE)
  - [ ] 6.2 Implement secret redactor that strips API keys, passwords, and emails from override reasons using regex
  - [ ] 6.3 Build override handler with severity-based logic: 1-click for Medium, reason required for High, 2FA for Critical
  - [ ] 6.4 Add 2FA integration (TOTP/WebAuthn) for Critical override approval by Security Champion
  - [ ] 6.5 Implement override log storage in PostgreSQL with S3 replication for long-term retention
  - [ ] 6.6 Add notification system that alerts Security Champion when High override is requested
  - [ ] 6.7 Write tests for override workflow covering all severity levels and 2FA flow

- [ ] 7.0 Override & Audit — Audit API (Module B - Part 2)
  - [ ] 7.1 Create REST API endpoint `GET /api/overrides` with query parameters for date, developer, and CWE filtering
  - [ ] 7.2 Implement query optimization to achieve <500ms P95 latency
  - [ ] 7.3 Add CSV export functionality for compliance reports
  - [ ] 7.4 Build override rate tracking that calculates `(overridden findings / total findings)` per 7-day rolling window
  - [ ] 7.5 Add alerting logic that notifies Security Team if override rate >30% on High findings
  - [ ] 7.6 Implement auto-disable gate if override rate >40% on Critical findings
  - [ ] 7.7 Write tests for audit API with various query combinations

- [ ] 8.0 Override & Audit — Batch Review & Learning (Module B - Part 3)
  - [ ] 8.1 Build batch review interface that groups High+ findings by CWE pattern across team
  - [ ] 8.2 Add one-click approve/reject for entire CWE pattern groups
  - [ ] 8.3 Implement false positive learning that tracks override patterns per project
  - [ ] 8.4 Add auto-downgrade logic that reduces severity by 1 level after 3+ overrides of same CWE in same project
  - [ ] 8.5 Write tests for batch review and learning system

- [ ] 9.0 MCP Tool — rc_security_override (Module B - Integration)
  - [ ] 9.1 Create `rc_security_override` MCP tool that accepts finding_id, reason, and optional approver_id
  - [ ] 9.2 Wire tool to override handler with severity-based validation
  - [ ] 9.3 Add UI components for override modal with reason templates
  - [ ] 9.4 Implement override confirmation flow with 2FA for Critical findings
  - [ ] 9.5 Write end-to-end tests for `rc_security_override` tool

- [ ] 10.0 Remediation — AI Fix Generation (Module C - Part 1)
  - [ ] 10.1 Implement remediation generator using Claude Opus that creates secure code alternatives (max 10 lines)
  - [ ] 10.2 Add remediation guidance formatter that includes explanation, OWASP reference link
  - [ ] 10.3 Build syntax validator using Tree-sitter to verify remediation is valid code before applying
  - [ ] 10.4 Add remediation limiter that ensures fix only affects the vulnerable code block
  - [ ] 10.5 Write tests for remediation generator with sample vulnerable code

- [ ] 11.0 Remediation — Validation Loop (Module C - Part 2)
  - [ ] 11.1 Create remediation applier that integrates with IDE to apply code changes
  - [ ] 11.2 Implement automatic re-scan after remediation is applied
  - [ ] 11.3 Build validation logic that rejects fix if new Critical findings are introduced
  - [ ] 11.4 Add "Undo Fix" functionality that reverts to original code
  - [ ] 11.5 Track remediation correctness metric: `(re-scans passed / total remediations applied)`
  - [ ] 11.6 Write integration tests for full remediation validation loop

- [ ] 12.0 Configuration — Policy Management (Module D - Part 1)
  - [ ] 12.1 Create PostgreSQL schema for per-project policy configuration
  - [ ] 12.2 Implement policy manager that stores and retrieves project-specific settings (block_on_critical, warn_on_high, ignored_cwes, test_code_severity_reduction)
  - [ ] 12.3 Add configuration change logging with actor_id, timestamp, old_value, new_value
  - [ ] 12.4 Build hot-reload mechanism so configuration changes apply immediately without server restart
  - [ ] 12.5 Write tests for policy manager covering CRUD operations

- [ ] 13.0 Configuration — Suppression & Templates (Module D - Part 2)
  - [ ] 13.1 Implement CWE suppression manager with 90-day expiration and renewal logic
  - [ ] 13.2 Add notification system that alerts Security Team when new suppression is added
  - [ ] 13.3 Create configuration templates for common scenarios (Frontend-only, Compliance-regulated, Internal tools)
  - [ ] 13.4 Write tests for suppression manager including expiration logic

- [ ] 14.0 Configuration — Web UI (Module D - Part 3)
  - [ ] 14.1 Build web UI for DevOps engineers to configure policies without JSON editing
  - [ ] 14.2 Add project list view with current policy display
  - [ ] 14.3 Create policy editor form with validation
  - [ ] 14.4 Implement CWE suppression UI with toggle switches and reason field
  - [ ] 14.5 Add configuration template selector
  - [ ] 14.6 Write UI tests for configuration workflows

- [ ] 15.0 MCP Tool — rc_security_configure (Module D - Integration)
  - [ ] 15.1 Create `rc_security_configure` MCP tool that accepts project_id and policy object
  - [ ] 15.2 Wire tool to policy manager for storage and retrieval
  - [ ] 15.3 Add validation for policy settings
  - [ ] 15.4 Write end-to-end tests for `rc_security_configure` tool

- [ ] 16.0 Observability — Logging & Metrics (Module E - Part 1)
  - [ ] 16.1 Implement structured JSON logger that emits events to stdout (security_scan_requested, security_scan_completed, security_scan_failed, security_finding_overridden, remediation_applied)
  - [ ] 16.2 Add OpenTelemetry instrumentation for scan latency (P50/P90/P95/P99) by scan mode, language, cache hit status
  - [ ] 16.3 Track token cost per scan with daily/weekly/monthly aggregation
  - [ ] 16.4 Calculate false positive rate: `(overridden Critical