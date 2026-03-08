# RC Engine - Architecture Reference Document (ARD)

> **Last updated:** 2026-03-02 | **Version:** v2 branch | **Tools:** 32 | **Tests:** 485

---

## Table of Contents

1. [System Overview](#system-overview)
2. [High-Level Architecture](#high-level-architecture)
3. [Module Inventory](#module-inventory)
4. [Domain Architecture](#domain-architecture)
5. [Core Infrastructure](#core-infrastructure)
6. [Shared Layer](#shared-layer)
7. [Web UI and Commercial Layer](#web-ui-and-commercial-layer)
8. [Cross-Domain Data Flow](#cross-domain-data-flow)
9. [State Management](#state-management)
10. [Quality Gate System](#quality-gate-system)
11. [Multi-LLM Strategy](#multi-llm-strategy)
12. [Security Architecture](#security-architecture)
13. [Knowledge System](#knowledge-system)
14. [Claude Code Configuration](#claude-code-configuration)
15. [Deployment](#deployment)
16. [Known Gaps and Disconnects](#known-gaps-and-disconnects)
17. [Test Coverage Map](#test-coverage-map)
18. [File Output Map](#file-output-map)

---

## System Overview

RC Engine is a **Model Context Protocol (MCP) server** that implements a structured product development pipeline. It exposes 35 tools across 4 domains, backed by a core infrastructure layer and a shared services layer.

```mermaid
graph TB
    subgraph "MCP Host (IDE)"
        IDE[Claude Code / Cursor / VS Code]
    end

    subgraph "RC Engine (MCP Server)"
        Entry["index.ts<br/>Tool Guard Middleware"]

        subgraph "Domains (35 tools)"
            PRC["Pre-RC Research<br/>6 tools"]
            RC["RC Method Build<br/>15 tools"]
            POSTRC["Post-RC Validation<br/>7 tools"]
            TRACE["Traceability<br/>3 tools"]
            PIPE["Pipeline Status<br/>1 tool"]
        end

        subgraph "Core Infrastructure"
            GRAPH["Graph Engine"]
            CKPT["Checkpoint Store"]
            SANDBOX["Sandbox"]
            OBS["Observability"]
            BUDGET["Budget"]
            LEARN["Learning Store"]
            PLUGIN["Plugin Registry"]
            AUDIT["Audit Trail"]
            VALUE["Value Calculator"]
            DEPLOY["Deployment"]
            DOCS["Doc Generator"]
            BENCH["Benchmark Store"]
            PRICE["Pricing"]
        end

        subgraph "Shared Services"
            LLM["LLM Factory + Router"]
            TOKENS["Token Tracker"]
            CONFIG["Config (.env)"]
            GUARD["Tool Guard"]
            KNOWLEDGE["Knowledge Loader"]
        end
    end

    IDE <-->|stdio| Entry
    Entry --> PRC
    Entry --> RC
    Entry --> POSTRC
    Entry --> TRACE
    Entry --> PIPE

    PRC --> LLM
    RC --> LLM
    POSTRC --> LLM
    TRACE --> LLM

    LLM --> CONFIG
    LLM --> TOKENS
    LLM --> BUDGET
    LLM --> LEARN
```

---

## High-Level Architecture

### Pipeline Flow

```mermaid
graph LR
    subgraph "Pre-RC (Research)"
        S1[prc_start] --> S2[prc_classify]
        S2 --> G1{Gate 1}
        G1 -->|approve| S3[prc_run_stage x6]
        S3 --> G2{Gate 2}
        G2 -->|approve| S3
        S3 --> G3{Gate 3}
        G3 -->|approve| S4[prc_synthesize]
    end

    subgraph "RC Method (Build)"
        S4 --> B1[rc_import_prerc]
        B1 --> B3[rc_architect]
        B3 --> G5{Gate}
        G5 -->|approve| B4[rc_sequence]
        B4 --> G6{Gate}
        G6 -->|approve| B5[rc_validate]
        B5 --> G7{Gate}
        G7 -->|approve| B6[rc_forge_task x N]
    end

    subgraph "Post-RC (Validation)"
        B6 --> P1[postrc_scan]
        P1 --> G8{Ship Gate}
        G8 -->|ship| P2[postrc_report]
    end

    subgraph "Traceability (Audit)"
        S4 -.-> T1[trace_enhance_prd]
        P1 -.-> T2[trace_map_findings]
    end
```

### Entry Point Wiring (`src/index.ts`)

```mermaid
graph TD
    INDEX["index.ts"] --> PATCH["Monkey-patch server.tool()<br/>with guardedTool()"]

    PATCH --> REG_PRC["registerPreRcTools(server)<br/>Uses: server.tool() - GUARDED"]
    PATCH --> REG_RC_P["registerRcPhaseTools(server)<br/>Uses: server.registerTool() - UNGUARDED"]
    PATCH --> REG_RC_G["registerRcGateTools(server)<br/>Uses: server.registerTool() - UNGUARDED"]
    PATCH --> REG_RC_U["registerRcUxTools(server)<br/>Uses: server.registerTool() - UNGUARDED"]
    PATCH --> REG_POST["registerPostRcTools(server)<br/>Uses: server.tool() - GUARDED"]
    PATCH --> REG_TRACE["registerTraceabilityTools(server)<br/>Uses: server.tool() - GUARDED"]
    PATCH --> REG_PIPE["rc_pipeline_status<br/>Inline, server.tool() - GUARDED"]

    style REG_RC_P fill:#ff6b6b,color:#fff
    style REG_RC_G fill:#ff6b6b,color:#fff
    style REG_RC_U fill:#ff6b6b,color:#fff
```

> **RESOLVED.** Both `server.tool()` and `server.registerTool()` are now wrapped with `guardedTool`. All 35 tools receive path validation and input size checks.

---

## Module Inventory

### Connection Status Legend

- CONNECTED: Imported and actively used by domain code
- DORMANT: Built, tested, but not imported by any domain
- INDIRECT: Used only by shared/llm layer, not by domains directly

### `src/core/` Modules

| Module               | Directory             | Status    | Used By                | Purpose                                                                          |
| -------------------- | --------------------- | --------- | ---------------------- | -------------------------------------------------------------------------------- |
| **Graph Engine**     | `core/graph/`         | DORMANT   | Tests only             | LangGraph-inspired execution engine (nodes, edges, gates, fan-out/fan-in, retry) |
| **Checkpoint Store** | `core/checkpoint/`    | DORMANT   | Tests only             | SQLite + WAL mode state persistence with Zod validation and time-travel          |
| **Sandbox**          | `core/sandbox/`       | CONNECTED | `shared/tool-guard.ts` | Path validation + input size limits                                              |
| **Budget**           | `core/budget/`        | INDIRECT  | `shared/llm/router.ts` | Cost tracking per model + circuit breaker                                        |
| **Observability**    | `core/observability/` | DORMANT   | Tests only             | EventBus + Tracer for pipeline events (has `graphId` fields ready)               |
| **Learning Store**   | `core/learning/`      | INDIRECT  | `shared/llm/router.ts` | Cross-project model performance tracking                                         |
| **Plugin Registry**  | `core/plugins/`       | DORMANT   | Tests only             | Plugin registration with capability declarations                                 |
| **Audit Trail**      | `core/collaboration/` | DORMANT   | Tests only             | Append-only SQLite audit log with 18 action types                                |
| **Value Calculator** | `core/value/`         | DORMANT   | Tests only             | Maps personas to roles/hourly rates for ROI calculation                          |
| **Benchmark Store**  | `core/benchmark/`     | DORMANT   | Tests only             | Performance metric recording and querying                                        |
| **Pricing**          | `core/pricing/`       | DORMANT   | Tests only             | 4-tier pricing, feature flags, usage metering                                    |
| **Deployment**       | `core/deployment/`    | DORMANT   | Tests only             | Readiness checks, profile detection, config generation                           |
| **Docs**             | `core/docs/`          | DORMANT   | Tests only             | Changelog parsing, project doc generation                                        |
| **LLM (core)**       | `core/llm/`           | INDIRECT  | `shared/llm/router.ts` | ModelRouter (task-type routing with budget awareness)                            |

### `src/shared/` Modules

| Module               | File                                                     | Status    | Used By                                                |
| -------------------- | -------------------------------------------------------- | --------- | ------------------------------------------------------ |
| **Config**           | `shared/config.ts`                                       | CONNECTED | All domains, all LLM clients                           |
| **Types**            | `shared/types.ts`                                        | CONNECTED | All domains                                            |
| **LLM Factory**      | `shared/llm/factory.ts`                                  | CONNECTED | Pre-RC, RC, Post-RC, Traceability                      |
| **LLM Clients**      | `shared/llm/{claude,openai,gemini,perplexity}-client.ts` | CONNECTED | Via factory                                            |
| **LLM Router**       | `shared/llm/router.ts`                                   | DORMANT   | Not used by any domain (domains call factory directly) |
| **Token Tracker**    | `shared/token-tracker.ts`                                | CONNECTED | Pre-RC, RC, Post-RC, Traceability                      |
| **Tool Guard**       | `shared/tool-guard.ts`                                   | CONNECTED | `index.ts` (but only for `server.tool()`)              |
| **Knowledge Loader** | `shared/knowledge-loader.ts`                             | CONNECTED | Pre-RC, RC                                             |

### `src/domains/` Modules

| Domain           | Tools | Registration                        | State Format                               | LLM Usage                                                   |
| ---------------- | ----- | ----------------------------------- | ------------------------------------------ | ----------------------------------------------------------- |
| **Pre-RC**       | 6     | `server.tool()` (guarded)           | Markdown + JSON comment (`PRC_STATE_JSON`) | Gemini (classify), Per-persona (stages), Claude (synthesis) |
| **RC Method**    | 15    | `server.registerTool()` (UNGUARDED) | Markdown + JSON comment (`RC_STATE_JSON`)  | Claude (all phases)                                         |
| **Post-RC**      | 7     | `server.tool()` (guarded)           | Markdown + JSON comment (`STATE_JSON`)     | Claude (Layer 3 scan)                                       |
| **Traceability** | 3     | `server.tool()` (guarded)           | Pure JSON file                             | Claude (optional, for acceptance criteria)                  |
| **Pipeline**     | 1     | `server.tool()` (guarded)           | Reads all domain states                    | None                                                        |

---

## Domain Architecture

### Domain 1: Pre-RC (Research)

```mermaid
graph TD
    subgraph "Pre-RC Domain"
        START[prc_start] --> CLASSIFY[prc_classify]
        CLASSIFY --> |Cynefin framework| SELECTOR[PersonaSelector<br/>20 personas available]
        SELECTOR --> GATE1{Gate 1<br/>Research scope OK?}

        GATE1 -->|approve| STAGE[prc_run_stage]
        STAGE --> |Promise.allSettled| P1[Persona 1]
        STAGE --> P2[Persona 2]
        STAGE --> PN[Persona N]

        P1 --> ARTIFACTS[Stage Artifacts]
        P2 --> ARTIFACTS
        PN --> ARTIFACTS

        ARTIFACTS --> GATE23{Gates 2 & 3}
        GATE23 -->|approve| SYNTH[prc_synthesize]

        SYNTH --> PRD["prd-{slug}.md<br/>19-section PRD"]
        SYNTH --> TASKS["tasks-{slug}.md"]
        SYNTH --> HTML["prd-{slug}.html<br/>Consulting deck"]
        SYNTH --> DOCX["{Name}_PRD.docx<br/>McKinsey format"]
    end

    subgraph "LLM Routing"
        CLASSIFY -.-> GEMINI[Gemini<br/>Cheap tier]
        P1 -.-> PERPLEXITY[Perplexity<br/>Market personas]
        P2 -.-> CLAUDE[Claude<br/>Architecture personas]
        PN -.-> OPENAI[OpenAI<br/>UX personas]
        SYNTH -.-> CLAUDE2[Claude<br/>32K tokens]
    end

    subgraph "State"
        STATE["PRC-STATE.md<br/>JSON-in-HTML-comment<br/>Async fs, atomic writes"]
    end
```

**Key files:**

- `tools.ts` - registers 6 tools via `server.tool()`
- `complexity-classifier.ts` - Cynefin framework (Clear/Complicated/Complex/Chaotic)
- `persona-selector.ts` - full registry of 20 personas with activation conditions
- `agents/persona-agent.ts` - single class reused for all 20 personas
- `state/state-persistence.ts` - Markdown + JSON serialization

**20 Personas** (in `knowledge/pre-rc/personas/`):
accessibility-advocate, ai-ml-specialist, business-model-strategist, cognitive-load-analyst, content-language-strategist, data-telemetry-strategist, demand-side-theorist, gtm-strategist, market-landscape-analyst, meta-product-architect, persona-coverage-auditor, prd-translation-specialist, primary-user-archetype, research-program-director, research-synthesis-specialist, secondary-edge-user, security-compliance-analyst, systems-architect, token-economics-optimizer, ux-systems-designer

---

### Domain 2: RC Method (Build)

```mermaid
graph TD
    subgraph "RC Method Domain"
        IMPORT[rc_import_prerc] --> |PreRcBridgeAgent<br/>19-section to 11-section| ARCH
        START2[rc_start] --> ILLUM[rc_illuminate]
        ILLUM --> DEF[rc_define]
        DEF --> ARCH[rc_architect]
        ARCH --> GA{Gate}
        GA -->|approve| SEQ[rc_sequence]
        SEQ --> |TaskAgent| GS{Gate}
        GS -->|approve| VAL[rc_validate]
        VAL --> |QualityAgent<br/>4 checks| GV{Gate}
        GV -->|approve| FORGE[rc_forge_task]
        FORGE --> |extractAndWriteFiles| FILES["rc-method/forge/{taskId}/"]
    end

    subgraph "UX Sub-Pipeline"
        SCORE[ux_score] --> |UX-TRIGGERS.md| MODE{UX Mode}
        MODE -->|standard| UGEN[ux_generate]
        MODE -->|enhanced| UAUD[ux_audit]
        UAUD --> UGEN
        DESIGN[ux_design] --> |1 or 3 options| DSPEC[Design Spec + Wireframes]
    end

    subgraph "Quality Checks (rc_validate)"
        Q1[Anti-Pattern Scan]
        Q2[Token Budget Audit]
        Q3[Scope Drift Detection]
        Q4[UX Quality Scan]
    end

    subgraph "Cross-Domain Reads"
        PRC_DATA["pre-rc-research/<br/>PRD, tasks, state"] -.-> IMPORT
        PRC_DATA -.-> SEQ
    end

    subgraph "State"
        RCSTATE["RC-STATE.md<br/>JSON-in-HTML-comment<br/>Sync fs - KNOWN FRAGILE"]
    end
```

**Key files:**

- `orchestrator.ts` - central orchestrator, handles all phases, file extraction, state
- `tools/phase-tools.ts` - 8 tools via `server.registerTool()` (UNGUARDED)
- `tools/gate-tools.ts` - 3 tools via `server.registerTool()` (UNGUARDED)
- `tools/ux-tools.ts` - 4 tools via `server.registerTool()` (UNGUARDED)
- `agents/prerc-bridge-agent.ts` - 19-to-11 section PRD converter
- `agents/quality-agent.ts` - 4 quality checks
- `generators/diagram-generator.ts` - Mermaid dependency/Gantt/layer diagrams
- `generators/playbook-generator.ts` - reads ALL 4 domain dirs to produce master playbook

**8 Phases:** Illuminate, Define, Architect, Sequence, Validate, Forge, Connect, Compound

---

### Domain 3: Post-RC (Validation)

```mermaid
graph TD
    subgraph "Post-RC Domain"
        OBS_SPEC["postrc_generate_observability_spec<br/>(Pre-flight, before build)"]

        SCAN[postrc_scan] --> SEC[SecurityScanner]
        SCAN --> MON[MonitoringChecker]

        SEC --> |Layer 1| STATIC["11 Static Regex Rules<br/>CWE-mapped"]
        SEC --> |Layer 2| NPM["npm audit --json"]
        SEC --> |Layer 3| LLM_SCAN["LLM Analysis<br/>OWASP anti-patterns"]

        MON --> |7 checks| MON_OUT["Error tracking, analytics,<br/>observability, dashboard,<br/>alerts, SLOs, PRD Section 6a"]

        STATIC --> FINDINGS[Findings + Severity]
        NPM --> FINDINGS
        LLM_SCAN --> FINDINGS
        MON_OUT --> FINDINGS

        FINDINGS --> OVERRIDE[postrc_override<br/>Justification + audit trail]
        FINDINGS --> REPORT[postrc_report]
        FINDINGS --> GATE{postrc_gate<br/>Ship / No-Ship}

        GATE -->|PASS| SHIP[Ship]
        GATE -->|WARN| SHIP_WARN[Ship with warnings]
        GATE -->|BLOCK| NOSHIP[Blocked - fix required]
    end

    subgraph "Code Source Priority"
        F1["Priority 1: rc-method/forge/"]
        F2["Priority 2: src/, app/, lib/, pages/"]
        F3["Priority 3: Root-level source files"]
    end

    subgraph "Cross-Domain Reads"
        RC_PRD["rc-method/prds/"] -.-> MON
        RC_PRD -.-> OBS_SPEC
        RC_TASKS["rc-method/tasks/"] -.-> MON
        PRC_PRD["pre-rc-research/prd-*"] -.-> OBS_SPEC
    end
```

**Key files:**

- `modules/security/security-scanner.ts` - 3-layer scanner (static + npm audit + LLM)
- `modules/monitoring/monitoring-checker.ts` - 7 monitoring readiness checks
- `state/state-manager.ts` - Markdown + JSON state, atomic writes

**Static Security Rules (11):**
CWE-798 (hardcoded secrets), CWE-89 (SQL injection), CWE-95 (eval), CWE-79 (XSS/innerHTML), CWE-942 (CORS \*), CWE-78 (command injection), CWE-338 (Math.random), CWE-209 (error disclosure), CWE-347 (JWT without verify), CWE-22 (path traversal), plus `console.log` detection

**Knowledge base:** ANTI_PATTERNS_BREADTH.md (40KB) + ANTI_PATTERNS_DEPTH.md (257KB)

---

### Domain 4: Traceability

```mermaid
graph TD
    subgraph "Traceability Domain"
        ENHANCE[trace_enhance_prd] --> PARSER[PRD Parser<br/>3 extraction strategies]
        PARSER --> IDGEN[ID Generator<br/>Deterministic: PRD-{CAT}-{NNN}]
        IDGEN --> MATRIX[Traceability Matrix]

        MAP[trace_map_findings] --> TPARSER[RC Tasks Parser]
        MAP --> FPARSER[PostRC State Parser]
        TPARSER --> MAPPER[Finding Mapper<br/>Keyword overlap + module mapping]
        FPARSER --> MAPPER
        MAPPER --> COVERAGE[Coverage Matrix<br/>Implemented / Verified / Orphans]

        STATUS[trace_status] --> DISPLAY[ASCII Coverage Display]

        COVERAGE --> HTML_RPT[Consulting-grade HTML Report<br/>Playfair Display + Navy/Gold]
    end

    subgraph "Requirement Categories"
        CAT1[FUNC - Functional]
        CAT2[SEC - Security]
        CAT3[PERF - Performance]
        CAT4[UX - User Experience]
        CAT5[DATA - Data]
        CAT6[INT - Integration]
        CAT7[OBS - Observability]
        CAT8[BIZ - Business]
    end

    subgraph "Cross-Domain Reads"
        PRC2["pre-rc-research/prd-*"] -.-> ENHANCE
        RC_PRD2["rc-method/prds/PRD-*"] -.-> ENHANCE
        RC_TASKS2["rc-method/tasks/TASKS-*"] -.-> MAP
        POST_STATE["post-rc/state/POSTRC-STATE.md"] -.-> MAP
    end

    subgraph "State"
        TSTATE["TRACEABILITY.json<br/>Pure JSON file<br/>Different from all other domains"]
    end
```

---

## Core Infrastructure

### Graph Engine (DORMANT - not wired to any domain)

```mermaid
graph TD
    subgraph "Graph Engine (src/core/graph/)"
        BUILDER["GraphBuilder&lt;S&gt;<br/>Fluent API"] --> |build + validate| DEF["GraphDefinition&lt;S&gt;"]
        DEF --> RUNNER["GraphRunner&lt;S&gt;"]

        RUNNER --> SEQ_EXEC["Sequential Execution<br/>Kahn's topological sort"]
        RUNNER --> PAR_EXEC["Fan-out / Fan-in<br/>Promise.allSettled"]
        RUNNER --> GATE_INT["Gate Interrupts<br/>Pause + Resume"]
        RUNNER --> RETRY["Retry + Backoff<br/>Per-node policies"]
        RUNNER --> EVENTS["Event Emission<br/>6 event types"]
        RUNNER --> COND["Conditional Edges<br/>Runtime routing"]
    end

    subgraph "What Exists"
        TYPES["types.ts (218 lines)<br/>Nodes, Edges, Gates, Events"]
        RUN["runner.ts (467 lines)<br/>Full execution engine"]
        BUILD["builder.ts (115 lines)<br/>Fluent builder + validation"]
        IDX["index.ts (32 lines)<br/>Barrel exports"]
    end

    subgraph "What's Missing"
        NO_DEFS["No domain graph definitions<br/>(e.g. 'pre-rc-pipeline')"]
        NO_CKPT["Not wired to CheckpointStore<br/>(no state persistence between sessions)"]
        NO_SUB["No subgraph support<br/>(cannot nest graphs)"]
        NO_DYN["No dynamic fan-out<br/>(fan-out is static, not Send API)"]
    end

    style NO_DEFS fill:#ff6b6b,color:#fff
    style NO_CKPT fill:#ff6b6b,color:#fff
    style NO_SUB fill:#ff6b6b,color:#fff
    style NO_DYN fill:#ff6b6b,color:#fff
```

**Status:** Fully implemented, 31 tests passing, zero domain usage. The observability layer has `graphId` fields ready for integration.

**LangGraph mapping:**
| LangGraph | RC Engine Graph | Status |
|-----------|----------------|--------|
| Nodes | `GraphNode<S>` | Implemented |
| Edges | `GraphEdge<S>` with conditions | Implemented |
| State | Generic `<S>` threaded through | Implemented |
| Interrupts | `gate` node type + `GateResume` | Implemented |
| Fan-out | `fan-out` node + `Promise.allSettled` | Implemented |
| Fan-in | `fan-in` node + `MergeFn<S>` | Implemented |
| Checkpointing | Separate `CheckpointStore` exists | NOT wired |
| Streaming | `GraphEventListener<S>` | Implemented |
| Subgraphs | - | NOT implemented |
| Send API | - | NOT implemented |

---

### Other Core Modules (all DORMANT)

```mermaid
graph TD
    subgraph "DORMANT Core Modules"
        direction TB
        CKPT2["CheckpointStore<br/>SQLite + WAL + Zod validation<br/>Time-travel via versions"]
        AUDIT2["AuditTrail<br/>Append-only SQLite<br/>18 action types + threading"]
        PLUGIN2["PluginRegistry<br/>Capability-based registration"]
        VALUE2["ValueCalculator + RoleRegistry<br/>Persona-to-role mapping + ROI"]
        BENCH2["BenchmarkStore<br/>Performance metric recording"]
        PRICE2["Pricing<br/>4 tiers + feature flags + UsageMeter"]
        DEPLOY2["Deployment<br/>Readiness checks + config gen"]
        DOCS2["Doc Generator<br/>Changelog parsing + project docs"]
        OBS2["EventBus + Tracer<br/>Pipeline event streaming"]
    end

    subgraph "INDIRECT Core Modules (used by shared/llm only)"
        BUDGET2["CostTracker<br/>Per-model rate tables<br/>Budget warnings at 50%/80%"]
        CB2["CircuitBreaker<br/>3 failures to open<br/>30s cooloff to half-open"]
        LEARN2["LearningStore<br/>Global SQLite at ~/.rc-engine/learning.db<br/>Model ranking + project insights"]
        ROUTER2["ModelRouter<br/>cheap/standard/premium tiers<br/>Budget-aware downgrading"]
    end

    ROUTER2 --> BUDGET2
    ROUTER2 --> CB2
    ROUTER2 --> LEARN2

    style CKPT2 fill:#ffa500,color:#fff
    style AUDIT2 fill:#ffa500,color:#fff
    style PLUGIN2 fill:#ffa500,color:#fff
    style VALUE2 fill:#ffa500,color:#fff
    style BENCH2 fill:#ffa500,color:#fff
    style PRICE2 fill:#ffa500,color:#fff
    style DEPLOY2 fill:#ffa500,color:#fff
    style DOCS2 fill:#ffa500,color:#fff
    style OBS2 fill:#ffa500,color:#fff
```

> **Orange = DORMANT.** Built and tested but not imported by any domain code. The INDIRECT modules (Budget, CircuitBreaker, LearningStore, ModelRouter) are wired into the `shared/llm/router.ts` - but the router itself is also not used by domains (they call `llmFactory.getClient()` directly).

---

## Shared Layer

```mermaid
graph TD
    subgraph "Shared Services (src/shared/)"
        CONFIG["config.ts<br/>API key detection<br/>Model IDs<br/>resolveFromRoot()"]
        TYPES2["types.ts<br/>LLMProvider enum<br/>GateStatus enum<br/>LLM request/response"]
        FACTORY["llm/factory.ts<br/>4 clients<br/>Fallback: any to Claude"]
        TRACKER["token-tracker.ts<br/>Singleton<br/>Writes to .rc-engine/PIPELINE.md"]
        GUARD2["tool-guard.ts<br/>Wraps handlers with<br/>path validation + input limits"]
        KLOADER["knowledge-loader.ts<br/>Pro vs Community detection"]
    end

    subgraph "LLM Clients"
        CLAUDE_C["claude-client.ts<br/>Official SDK"]
        OPENAI_C["openai-client.ts<br/>Raw fetch"]
        GEMINI_C["gemini-client.ts<br/>Raw fetch"]
        PERP_C["perplexity-client.ts<br/>Raw fetch + search"]
    end

    subgraph "NOT USED by domains"
        ROUTER3["llm/router.ts<br/>ModelRouter<br/>Task-type routing<br/>Budget-aware selection"]
    end

    FACTORY --> CLAUDE_C
    FACTORY --> OPENAI_C
    FACTORY --> GEMINI_C
    FACTORY --> PERP_C

    ROUTER3 -.->|exists but domains<br/>call factory directly| FACTORY

    style ROUTER3 fill:#ffa500,color:#fff
```

> **The ModelRouter is not used.** Domains call `llmFactory.getClient(provider)` with hardcoded provider choices. The router's sophisticated task-type routing, budget-aware downgrading, and learning-based selection are bypassed.

---

## Web UI and Commercial Layer

The web UI is a **full-stack Express + React application** that serves as the commercial product surface. It is separate from the MCP stdio server but calls the same 35 tools via an in-process bridge.

### Architecture

```mermaid
graph TD
    subgraph "Browser"
        SPA["React 19 SPA<br/>Vite 7 + Tailwind 4"]
    end

    subgraph "Express Server (web/server/)"
        SERVER["index.ts (891 lines)<br/>Express v5"]

        subgraph "Middleware"
            HELMET[Helmet]
            CORS_MW[CORS]
            RATE[Rate Limiting]
            AUTH_MW[Auth Middleware]
        end

        subgraph "Route Groups"
            AUTH_R["/auth/*<br/>login, verify, logout, me"]
            API_R["/api/tools/:name<br/>Execute MCP tools"]
            ORG_R["/api/org/*<br/>Organizations + invites"]
            BILL_R["/api/billing/*<br/>Stripe checkout + webhooks"]
            PROJ_R["/api/project/*<br/>State, artifacts, export"]
            HEALTH["/api/health"]
        end

        subgraph "Business Logic"
            MCP_BRIDGE["mcp-bridge.ts<br/>In-process MCP server+client<br/>via InMemoryTransport"]
            AUTH_SYS["auth.ts (474 lines)<br/>Magic link + SQLite<br/>Users, sessions, orgs"]
            BILLING["billing.ts (257 lines)<br/>Stripe subscriptions"]
            EMAIL["email.ts (167 lines)<br/>Console / SMTP / Resend"]
            STATE_P["state-parser.ts<br/>Tool output to JSON"]
            PDF["pdf-export.ts<br/>Print-ready HTML"]
        end

        WS["WebSocket<br/>Real-time tool events"]
    end

    subgraph "Data Stores"
        AUTH_DB[".rc-engine/auth.db<br/>SQLite: users, sessions,<br/>orgs, tokens, invites"]
        STRIPE_API["Stripe API"]
    end

    SPA <-->|REST + WS| SERVER
    SERVER --> MCP_BRIDGE
    MCP_BRIDGE -->|"Same 35 tools<br/>Same guardedTool wrapper"| DOMAINS["All 4 Pipeline Domains"]
    AUTH_SYS --> AUTH_DB
    BILLING --> STRIPE_API
    AUTH_SYS --> EMAIL
```

### MCP Bridge Pattern

The bridge (`web/server/mcp-bridge.ts`) is architecturally significant. It creates an **in-process MCP server and client** connected via `InMemoryTransport`:

```
Web Server  -->  MCP Client  <--InMemoryTransport-->  MCP Server  -->  Domain Tools
(Express)        (in-process)                          (in-process)     (same as CLI)
```

This means the web UI calls exactly the same tools with the same guards as the CLI. No code duplication. No API drift.

### Tier Enforcement

Tool access is gated by subscription tier:

| Tier       | Price  | Access                                    |
| ---------- | ------ | ----------------------------------------- |
| Free       | $0     | Pre-RC research only                      |
| Pro        | $79/mo | Full pipeline + security scan + UX design |
| Enterprise | Custom | All features + team seats + SLA           |

The server maps each tool to a required feature flag and checks the user's tier before execution.

### React Frontend Pages

```mermaid
graph LR
    LANDING["Landing<br/>Marketing + pricing"] --> LOGIN["Auth<br/>Magic link"]
    LOGIN --> DASH["Dashboard<br/>Project list"]
    DASH --> WIZARD["Wizard (1600 lines)<br/>9-step guided flow"]
    DASH --> PIPELINE["Pipeline<br/>12-phase status view"]
    DASH --> SETTINGS["Settings<br/>Health + API keys"]
    WIZARD --> VALUE["Value Report<br/>ROI calculation"]
```

**9-step Wizard Flow:**

1. Idea input
2. Persona team view (select/deselect researchers)
3. Research execution with real-time status
4. Gate approvals
5. Design option cards (A/B/C)
6. Architecture review
7. Security scan results
8. Value report (human-equivalent cost savings)
9. Completion + download artifacts

**13 React Components:** Layout, ErrorBoundary, GateApproval, PhaseCard, ToolOutput, TokenDisplay, ConfirmDialog, TeamMemberCard, DesignOptionCard, DesignPreview, DiagramTabs, ValueChart, ValueDisplay

### Auth System

- **Magic link login** - email a one-time token (15-min expiry), verify via GET
- **Sessions** - 30-day HttpOnly secure cookies, SQLite-backed
- **Organizations** - create org, invite members, seat limits per tier
- **Dev bypass** - `RC_AUTH_BYPASS=true` returns a dev user with `pro` tier
- **Tables:** `users`, `sessions`, `organizations`, `magic_tokens`, `org_invites`

### Stripe Billing

- Checkout session creation for Pro (monthly + annual)
- Webhook handlers: `checkout.session.completed`, `customer.subscription.deleted`, `invoice.payment_failed`
- Same-origin URL validation to prevent open redirects
- Optional - system works without Stripe configured

### Email Providers

| Provider | When        | Config                                             |
| -------- | ----------- | -------------------------------------------------- |
| Console  | Development | Default, logs to stdout                            |
| SMTP     | Self-hosted | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` |
| Resend   | Production  | `RESEND_API_KEY`                                   |

---

## Cross-Domain Data Flow

```mermaid
graph LR
    subgraph "pre-rc-research/"
        PRC_PRD3["prd-{slug}.md"]
        PRC_TASKS3["tasks-{slug}.md"]
        PRC_STATE3["state/PRC-STATE.md"]
        PRC_STAGES["stage-{1-6}/*.md"]
    end

    subgraph "rc-method/"
        RC_PRD3["prds/PRD-{name}-master.md"]
        RC_TASKS3["tasks/TASKS-{name}-master.md"]
        RC_STATE3["state/RC-STATE.md"]
        RC_FORGE["forge/{taskId}/*"]
        RC_DESIGN["design/*"]
        RC_GATES["gates/*"]
    end

    subgraph "post-rc/"
        POST_STATE3["state/POSTRC-STATE.md"]
        POST_REPORTS["reports/REPORT-*.md"]
        POST_SPECS["specs/OBSERVABILITY-SPEC.md"]
    end

    subgraph "rc-traceability/"
        TRACE_JSON["TRACEABILITY.json"]
        TRACE_ENH["enhanced/PRD-ENHANCED-*.md"]
        TRACE_RPT["reports/*.html"]
    end

    PRC_PRD3 -->|rc_import_prerc<br/>prerc-bridge-agent| RC_PRD3
    PRC_TASKS3 -->|rc_sequence<br/>task-agent| RC_TASKS3
    PRC_STATE3 -->|rc_import_prerc<br/>context-loader| RC_PRD3
    PRC_STAGES -->|rc_import_prerc<br/>context-loader| RC_PRD3

    RC_FORGE -->|postrc_scan<br/>Priority 1| POST_STATE3
    RC_PRD3 -->|monitoring-checker<br/>observability-spec| POST_STATE3
    RC_TASKS3 -->|monitoring-checker| POST_STATE3

    PRC_PRD3 -->|trace_enhance_prd<br/>PRD discovery| TRACE_JSON
    RC_PRD3 -->|trace_enhance_prd<br/>PRD discovery| TRACE_JSON
    RC_TASKS3 -->|trace_map_findings<br/>task parser| TRACE_JSON
    POST_STATE3 -->|trace_map_findings<br/>finding parser| TRACE_JSON

    PRC_PRD3 -->|postrc_generate_observability_spec<br/>PRD fallback| POST_SPECS
```

---

## State Management

### Four Different Approaches (inconsistency)

```mermaid
graph TD
    subgraph "Pre-RC State"
        PRC_S["PRC-STATE.md<br/>Format: Markdown + &lt;!-- PRC_STATE_JSON ... PRC_STATE_JSON_END --&gt;<br/>I/O: Async fs<br/>Atomic: tmp file + rename"]
    end

    subgraph "RC State"
        RC_S["RC-STATE.md<br/>Format: Markdown + &lt;!-- RC_STATE_JSON ... --&gt;<br/>I/O: Sync fs (FRAGILE)<br/>Atomic: tmp file + rename"]
    end

    subgraph "Post-RC State"
        POST_S["POSTRC-STATE.md<br/>Format: Markdown + &lt;!-- STATE_JSON ... STATE_JSON --&gt;<br/>I/O: Async fs<br/>Atomic: tmp file + rename"]
    end

    subgraph "Traceability State"
        TRACE_S["TRACEABILITY.json<br/>Format: Pure JSON<br/>I/O: Async fs<br/>Atomic: .tmp + rename"]
    end

    subgraph "DORMANT (not used by any domain)"
        CKPT_S["CheckpointStore<br/>Format: SQLite + WAL<br/>Zod validation on read<br/>Version history (time-travel)<br/>Crash-safe"]
    end

    style RC_S fill:#ff6b6b,color:#fff
    style CKPT_S fill:#ffa500,color:#fff
```

> **Red = fragile.** RC Method uses synchronous fs with regex parsing. Known corruption risk.
> **Orange = dormant.** The CheckpointStore provides all the properties the domains need (crash safety, validation, versioning) but none of them use it.

---

## Quality Gate System

```mermaid
graph TD
    subgraph "Pre-RC Gates (3)"
        G1_2["Gate 1: After prc_classify<br/>Is research scope correct?"]
        G2_2["Gate 2: After stage 4<br/>Is research accurate?"]
        G3_2["Gate 3: After stage 6<br/>Ready to build?"]
    end

    subgraph "RC Gates (5+)"
        G4["Gate: After rc_illuminate"]
        G5_2["Gate: After rc_define"]
        G6_2["Gate: After rc_architect"]
        G7_2["Gate: After rc_sequence"]
        G8_2["Gate: After rc_validate"]
    end

    subgraph "Post-RC Gate (1)"
        G9["Ship Gate: After postrc_scan<br/>PASS / WARN / BLOCK"]
    end

    subgraph "Gate Pattern"
        PRODUCE["Phase produces artifacts"] --> PRESENT["Gate presents summary"]
        PRESENT --> DECIDE{Human decides}
        DECIDE -->|approve| ADVANCE[Advance to next phase]
        DECIDE -->|reject| REDO[Re-run with feedback]
        DECIDE -->|question| CLARIFY[Clarify, then re-present]
    end

    G1_2 --> G2_2 --> G3_2 --> G6_2
    G4 --> G5_2 --> G6_2
    G6_2 --> G7_2 --> G8_2 --> G9
```

**Total: 9-11 gates** across the full pipeline (varies by path: import vs fresh start).
All gates require explicit human approval. Never auto-approved (except Gates 1-2 on Pre-RC import).

---

## Multi-LLM Strategy

```mermaid
graph TD
    subgraph "Provider Selection"
        DOMAIN_CODE["Domain Code"] -->|hardcoded provider| FACTORY2["LLM Factory"]
        FACTORY2 --> CLAUDE_P["Claude (Anthropic SDK)<br/>Primary: reasoning, architecture,<br/>code gen, security analysis"]
        FACTORY2 --> GEMINI_P["Gemini (raw fetch)<br/>Cheap: classification, extraction"]
        FACTORY2 --> PERP_P["Perplexity (raw fetch)<br/>Search: market research,<br/>competitive analysis"]
        FACTORY2 --> OPENAI_P["OpenAI (raw fetch)<br/>UX: design system analysis"]
    end

    subgraph "NOT USED - ModelRouter"
        ROUTER4["ModelRouter"] -->|cheap tier| GEMINI_P
        ROUTER4 -->|standard tier| CLAUDE_P
        ROUTER4 -->|premium tier| CLAUDE_P
        ROUTER4 -.->|budget low| DOWNGRADE["Auto-downgrade tier"]
        ROUTER4 -.->|learning data| BEST["Use historically best model"]
    end

    subgraph "Resilience"
        CB3["CircuitBreaker<br/>3 failures to open<br/>30s to half-open"]
        RETRY2["Exponential Backoff<br/>2000ms * 2^attempt"]
        FALLBACK["Factory Fallback<br/>Any provider to Claude"]
        PASSTHROUGH["Passthrough Mode<br/>Return prompts to IDE"]
    end

    style ROUTER4 fill:#ffa500,color:#fff
```

| Task Type                 | Provider            | Model Tier           | Used By                         |
| ------------------------- | ------------------- | -------------------- | ------------------------------- |
| Complexity classification | Gemini              | Cheap (~$0.0001)     | `prc_classify`                  |
| Market research           | Perplexity          | Standard             | Market-focused personas         |
| Architecture reasoning    | Claude              | Premium (~$0.015)    | `rc_architect`, `rc_forge_task` |
| PRD synthesis             | Claude              | Premium (32K tokens) | `prc_synthesize`                |
| Security analysis         | Claude              | Standard             | `postrc_scan` Layer 3           |
| UX audit                  | Claude/OpenAI       | Standard             | `ux_audit`, `ux_score`          |
| General research          | Per-persona routing | Varied               | `prc_run_stage`                 |

---

## Security Architecture

```mermaid
graph TD
    subgraph "Layer 1: Tool Guard (server.tool only)"
        GUARD3["guardedTool() wrapper"] --> PATH["PathValidator<br/>Domain-restricted writes<br/>System path blocklist<br/>Traversal prevention"]
        GUARD3 --> INPUT["Input Size Limits<br/>brief: 10K chars<br/>requirements: 50K<br/>code_context: 100K"]
    end

    subgraph "Layer 2: Claude Code Hooks"
        SECRETS["secrets-guard.sh (PreToolUse)<br/>Blocks: .env, credentials,<br/>SSH keys, .pem, .key"]
        COST["cost-guard.sh (PostToolUse)<br/>Atomic call counting<br/>Warn at 50/100/150"]
        AUDIT3["audit-logger.sh (PostToolUse)<br/>Append-only JSONL<br/>Never logs tool content"]
    end

    subgraph "Layer 3: Domain Boundaries"
        PRC_BOUND["Pre-RC writes to:<br/>pre-rc-research/ ONLY"]
        RC_BOUND["RC writes to:<br/>rc-method/ ONLY"]
        POST_BOUND["Post-RC writes to:<br/>post-rc/ ONLY"]
        TRACE_BOUND["Traceability writes to:<br/>rc-traceability/ ONLY"]
    end

    subgraph "GAP: RC Domain"
        RC_GAP["15 RC tools use server.registerTool()<br/>BYPASS Layer 1 entirely<br/>No path validation<br/>No input size checks"]
    end

    style RC_GAP fill:#ff6b6b,color:#fff
```

---

## Knowledge System

46 markdown files in `knowledge/` provide domain expertise to every pipeline tool.

```mermaid
graph TD
    subgraph "knowledge/pre-rc/ (23 files)"
        PERSONAS["personas/ (20 files)<br/>One per research specialist"]
        FRAMEWORK["complexity-framework.md<br/>Cynefin classification rules"]
        TEMPLATES["templates/ (3 files)<br/>prd-template, task-list-template,<br/>synthesis-instructions"]
    end

    subgraph "knowledge/rc/ (18 files)"
        SKILLS["skills/ (10 files)<br/>rc-master, rc-prd-master, rc-prd-child,<br/>rc-task-generator, rc-quality-gate,<br/>rc-owner-gate, rc-test-scripts,<br/>rc-design-generation, rc-ux-core,<br/>rc-prerc-bridge"]
        UX_SPEC["ux/specialists/ (8 files)<br/>ux-a11y, ux-behavior, ux-code,<br/>ux-copy, ux-hierarchy, ux-interaction,<br/>ux-navigation, ux-system"]
        UX_TRIG["ux/UX-TRIGGERS.md<br/>When to activate UX sub-pipeline"]
    end

    subgraph "knowledge/post-rc/ (4 files)"
        SEC_KB["sec-context/<br/>ANTI_PATTERNS_BREADTH.md (40KB)<br/>ANTI_PATTERNS_DEPTH.md (257KB)"]
        MON_KB["monitoring/<br/>monitoring-readiness.md<br/>observability-spec-template.md"]
    end

    PERSONAS -->|loaded by| PRC_AGENT["PersonaAgent"]
    FRAMEWORK -->|loaded by| CLASSIFIER["ComplexityClassifier"]
    TEMPLATES -->|loaded by| SYNTH2["prc_synthesize"]
    SKILLS -->|loaded by| ORCH["RC Orchestrator"]
    UX_SPEC -->|loaded by| UX_AGENT["UxAgent"]
    UX_TRIG -->|loaded by| UX_AGENT
    SEC_KB -->|loaded by| SEC_SCAN["SecurityScanner"]
    MON_KB -->|loaded by| MON_CHECK["MonitoringChecker"]
```

**Knowledge Loader** (`src/shared/knowledge-loader.ts`) detects Pro vs Community mode based on which files are present. Missing files degrade gracefully - the tool proceeds without that knowledge.

---

## Claude Code Configuration

The `.claude/` directory contains operational configuration that defines how AI assistants interact with the project.

### Directory Structure

```
.claude/
  settings.json          # Security deny/allow lists
  settings.local.json    # User-specific (gitignored)
  agent-memory/MEMORY.md # Persistent session memory

  rules/                 # Pipeline behavior rules
    onboarding.md        # First-time user flow
    conversation-ux.md   # Message templates + vocabulary mapping

  agents/                # Pipeline agent definitions (4)
    pre-rc-researcher.md
    rc-builder.md
    post-rc-validator.md
    traceability-auditor.md

  agents/agents/         # Compound Engineering agents (31)
    design/   (1)        # design-iterator
    docs/     (1)        # ankane-readme-writer
    research/ (5)        # repo-research-analyst, learnings-researcher, etc.
    review/  (14)        # security-sentinel, performance-oracle, etc.
    workflow/ (5)        # pr-comment-resolver, lint, etc.

  commands/              # Slash commands (22)
    workflows/           # Core workflow loop (5)
      plan.md, work.md, review.md, compound.md, brainstorm.md
    lfg.md, slfg.md, triage.md, changelog.md, deepen-plan.md, ...

  skills/                # Reusable skill definitions (20 directories)
    orchestrating-swarms/ (57KB), git-worktree/, brainstorming/,
    agent-native-architecture/, create-agent-skills/, ...

  hooks/                 # Runtime bash hooks (3)
    secrets-guard.sh     # PreToolUse: blocks access to secret files
    cost-guard.sh        # PostToolUse: warns at 50/100/150 calls
    audit-logger.sh      # PostToolUse: append-only JSONL audit log
```

### Hook Scripts

| Hook               | Event       | Action                                                                                              | Blocking?         |
| ------------------ | ----------- | --------------------------------------------------------------------------------------------------- | ----------------- |
| `secrets-guard.sh` | PreToolUse  | Blocks Read/Edit/Write/Bash on `.env`, `.ssh/`, `credentials`, `*.pem`, `*.key`, `*secret*`         | Yes (exit 2)      |
| `cost-guard.sh`    | PostToolUse | Counts tool calls per session using `flock` for atomicity. Warns at 50/100/150.                     | No (warning only) |
| `audit-logger.sh`  | PostToolUse | Appends `{tool, session_id, timestamp}` to `.rc-engine/audit/YYYY-MM-DD.jsonl`. Never logs content. | No                |

### Security Settings (`settings.json`)

**Deny list:** `.env*`, `.ssh/`, `.aws/`, `.config/gcloud/`, `.docker/config.json`, `.kube/config`, `.npmrc`, `*.pem`, `*.key`, `credentials.json`, `secrets/`, `rm -rf *`, `sudo *`, `chmod 777 *`

**Allow list:** `src/**`, `knowledge/**`, `docs/**`, `CLAUDE.md`, `package.json`, `npm test`, `npm run build`, `git status/diff/log`

---

## Deployment

### Docker

```mermaid
graph LR
    subgraph "Multi-Stage Build"
        BUILDER["Stage 1: node:20-slim<br/>npm ci<br/>tsc (TypeScript compile)<br/>vite build (React SPA)"]
        PROD["Stage 2: node:20-slim<br/>npm ci --production<br/>Non-root user: rcengine"]
    end

    BUILDER --> PROD

    subgraph "Runtime"
        ENTRY["CMD: node web/server/index.js<br/>Port 3100"]
        HEALTH["Healthcheck: /auth/me"]
        VOL["Volume: ./data:/app/.rc-engine<br/>SQLite DBs + audit logs"]
    end

    PROD --> ENTRY
```

**Note:** The Docker image runs the **web server**, not the MCP stdio server. The MCP tools are accessed via the in-process bridge.

### Environment Variables

| Category   | Variables                                                 | Required?                               |
| ---------- | --------------------------------------------------------- | --------------------------------------- |
| AI Keys    | `ANTHROPIC_API_KEY`                                       | Yes (or passthrough mode)               |
| AI Keys    | `PERPLEXITY_API_KEY`                                      | Recommended                             |
| AI Keys    | `GOOGLE_GEMINI_API_KEY`, `OPENAI_API_KEY`                 | Optional                                |
| Web Server | `RC_WEB_PORT`, `ALLOWED_ORIGINS`                          | Optional (defaults: 3100, localhost)    |
| Auth       | `RC_AUTH_BYPASS`                                          | Dev only                                |
| Email      | `RESEND_API_KEY` or `SMTP_HOST/PORT/USER/PASS`            | Optional                                |
| Stripe     | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, 4 price IDs | Optional                                |
| Projects   | `RC_PROJECTS_DIR`                                         | Optional (default: `/tmp/rc-projects/`) |

### CI/CD

Single GitHub Actions workflow (`.github/workflows/ci.yml`):

- Triggers: push/PR to `v2` and `main`
- Matrix: Node 18, 20, 22
- Steps: `npm ci`, `tsc --noEmit`, `npm run lint`, `npm run format:check`, `npm test`
- Lint and format coverage: `src/`, `tests/`, `web/server/` (React frontend `web/src/` excluded)
- Does NOT: type-check web server, build web UI, run integration tests, deploy

---

## Known Gaps and Disconnects

### Critical

| #   | Gap                                 | Impact       | Details                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ----------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | ~~**RC tools bypass guardedTool**~~ | **RESOLVED** | The monkey-patch in `index.ts` now wraps both `server.tool()` and `server.registerTool()`. All 35 tools (Pre-RC, RC, Post-RC, Traceability, pipeline status) receive path validation and input size checks. 5 new `guardedTool` unit tests added to `sandbox.test.ts`.                                                                                                                                                                                                                                                                                                        |
| 2   | ~~**Graph Engine not wired**~~      | **RESOLVED** | `GraphCoordinator<S>` base class bridges `GraphRunner` + `CheckpointStore` with persistent gate interrupts. 3 domain graph definitions built: Pre-RC (11 nodes, 3 gates, fan-out research), RC Method (12 nodes, 6 gates, sequential phases), Post-RC (5 nodes, fan-out/fan-in parallel scans, ship gate). Domain coordinators (`PreRcCoordinator`, `RcCoordinator`, `PostRcCoordinator`) wire graph topologies to injectable handlers. 31 new tests (12 coordinator + 19 graph topology).                                                                                    |
| 3   | ~~**CheckpointStore not used**~~    | **RESOLVED** | All 4 domain state managers now use CheckpointStore (SQLite + WAL + Zod validation) as primary storage. Shared `store-factory.ts` provides singleton per-project instances at `{projectPath}/.rc-engine/state.db`. `pipeline-id.ts` derives deterministic 22-char pipeline IDs from project paths. 4 domain Zod schemas validate state on read. Legacy markdown/JSON files kept as write-only exports for human readability. Transparent migration on first load. Cross-domain reads (traceability -> post-rc) now typed CheckpointStore calls instead of regex file parsing. |

### High

| #   | Gap                                | Impact             | Details                                                                                                                                                                                                                                                                             |
| --- | ---------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4   | **ModelRouter not used**           | No smart routing   | Sophisticated task-type routing with budget-aware downgrading and learning-based selection exists but domains call `llmFactory.getClient()` directly with hardcoded providers.                                                                                                      |
| 5   | **AuditTrail not used**            | No audit logging   | Enterprise-grade append-only SQLite audit trail with 18 action types, comment threading, and query API exists but no domain writes to it. Gate decisions are logged to markdown files instead.                                                                                      |
| 6   | **Observability not used**         | No pipeline events | EventBus + Tracer with `graphId`-aware pipeline events exist but are dormant. No real-time visibility into pipeline execution.                                                                                                                                                      |
| 7   | ~~**State format inconsistency**~~ | **RESOLVED**       | All 4 domains now use CheckpointStore as primary (SQLite), with consistent save/load patterns and Zod validation on read. Markdown/JSON files are write-only exports. Bugs fixed: Post-RC silent-default-on-error (now throws), Traceability race condition (randomized tmp names). |

### Medium

| #   | Gap                                       | Impact                       | Details                                                                                                                                                                                                                                                                                                                                           |
| --- | ----------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8   | **PluginRegistry not used**               | No extensibility             | Plugin system with capability declarations exists but no plugins are registered.                                                                                                                                                                                                                                                                  |
| 9   | **ValueCalculator not used**              | No ROI reporting             | Persona-to-role mapping with hourly rates exists but isn't called.                                                                                                                                                                                                                                                                                |
| 10  | **PricingTier not used**                  | No tier enforcement via core | 4-tier pricing with feature flags and usage metering exists in core but isn't wired to tool execution. Agent memory mentions tier enforcement but it's not in the domain code path.                                                                                                                                                               |
| 11  | **Deployment tools not used**             | No deploy pipeline           | Readiness checks, profile detection, and config generation exist but aren't connected.                                                                                                                                                                                                                                                            |
| 12  | **3 of 4 LLM clients use raw fetch**      | Missing SDK features         | OpenAI, Gemini, and Perplexity clients use raw `fetch` instead of official SDKs. Missing: automatic retries, streaming, type safety.                                                                                                                                                                                                              |
| 13  | **No end-to-end integration tests**       | Pipeline untested as whole   | 421 unit tests across 20 files but zero tests running the full Pre-RC to Post-RC pipeline.                                                                                                                                                                                                                                                        |
| 14  | **Forge writes to staging, not source**   | Dead-end output              | `rc_forge_task` writes to `rc-method/forge/{taskId}/` - not the project source tree. No automated integration step.                                                                                                                                                                                                                              |
| 15  | **Web UI deps in devDependencies**        | Broken prod install          | React, Vite, Tailwind are in `devDependencies` but the web UI is a production feature. `npm install --production` breaks the web UI.                                                                                                                                                                                                              |
| 16  | ~~**Web UI not linted**~~                 | **RESOLVED**                 | Web server (`web/server/`) is now linted (ESLint) and formatted (Prettier) alongside `src/` and `tests/`. React frontend (`web/src/`) still excluded (needs JSX/React ESLint config).                                                                                                                                                             |
| 17  | ~~**Web server not type-checked in CI**~~ | **RESOLVED**                 | TypeScript project references implemented: root `tsconfig.json` has `composite: true`, `web/tsconfig.json` has `references: [{ "path": ".." }]`. Cross-boundary imports fixed (`../../src/` changed to `../../dist/`). CI runs `tsc --noEmit -p web/tsconfig.json` as a separate step. `stripe` and `@types/nodemailer` added as devDependencies. |
| 18  | **Two separate MCP server instances**     | Potential drift              | `src/index.ts` (stdio) and `web/server/mcp-bridge.ts` (in-process) both register tools independently. A tool added to one but not the other would cause divergence.                                                                                                                                                                               |
| 19  | **Auth DB has no migrations**             | Schema fragility             | `web/server/auth.ts` creates tables via `CREATE TABLE IF NOT EXISTS`. No versioned migrations. Schema changes require manual intervention.                                                                                                                                                                                                        |
| 20  | **Only 11 static security rules**         | Coverage gaps                | Missing: SSRF, prototype pollution, open redirects, XXE, insecure deserialization, clickjacking, session fixation. LLM Layer 3 compensates but static rules should catch the obvious patterns.                                                                                                                                                    |

---

## Test Coverage Map

| Test File                                    | Module Tested                  | Tests | Status                                           |
| -------------------------------------------- | ------------------------------ | ----- | ------------------------------------------------ |
| `tests/core/graph-runner.test.ts`            | Graph Engine                   | 31    | All pass (CONNECTED)                             |
| `tests/core/graph-coordinator.test.ts`       | Graph Coordinator              | 12    | All pass (CONNECTED)                             |
| `tests/core/checkpoint-store.test.ts`        | Checkpoint Store               | 31    | All pass (CONNECTED)                             |
| `tests/core/store-factory.test.ts`           | Store Factory + Pipeline ID    | 13    | All pass (CONNECTED)                             |
| `tests/core/state-schemas.test.ts`           | Domain State Schemas           | 15    | All pass (CONNECTED)                             |
| `tests/core/sandbox.test.ts`                 | Path Validator + Input Limits  | 56    | All pass (CONNECTED)                             |
| `tests/core/budget.test.ts`                  | Cost Tracker + Circuit Breaker | ~15   | All pass (INDIRECT)                              |
| `tests/core/observability.test.ts`           | EventBus + Tracer              | ~10   | All pass (dormant)                               |
| `tests/core/pricing.test.ts`                 | Pricing Tiers + UsageMeter     | ~15   | All pass (dormant)                               |
| `tests/core/audit-trail.test.ts`             | Audit Trail                    | ~10   | All pass (dormant)                               |
| `tests/core/benchmark.test.ts`               | Benchmark Store                | ~10   | All pass (dormant)                               |
| `tests/core/docs.test.ts`                    | Changelog + Doc Gen            | ~10   | All pass (dormant)                               |
| `tests/core/deployment.test.ts`              | Deploy Readiness               | ~10   | All pass (dormant)                               |
| `tests/core/learning-store.test.ts`          | Learning Store                 | ~15   | All pass (INDIRECT)                              |
| `tests/core/model-router.test.ts`            | Model Router                   | ~10   | All pass (dormant - router not used by domains) |
| `tests/core/plugin-registry.test.ts`         | Plugin Registry                | ~10   | All pass (dormant)                               |
| `tests/core/value-calculator.test.ts`        | Value + Roles                  | ~10   | All pass (dormant)                               |
| `tests/agent-eval/tool-selection.test.ts`    | Tool Descriptions              | 33    | All pass (CONNECTED)                             |
| `tests/domains/design-types.test.ts`         | Design Schemas                 | ~5    | All pass                                         |
| `tests/domains/design-agent-parsing.test.ts` | Wireframe Parsing              | ~5    | All pass                                         |
| `tests/domains/pdf-export.test.ts`           | HTML Export                    | ~5    | All pass                                         |
| `tests/domains/diagram-generator.test.ts`    | Mermaid Diagrams               | ~5    | All pass                                         |
| `tests/domains/playbook-generator.test.ts`   | Playbook Gen                   | ~5    | All pass                                         |
| `tests/domains/graph-definitions.test.ts`    | Domain Graph Topologies        | 19    | All pass (CONNECTED)                             |

**485 total tests.** Core infrastructure (Graph Engine, CheckpointStore, State Schemas) now wired to domains. Zero integration tests for the actual pipeline.

---

## File Output Map

### What gets produced per domain

```
project-root/
  pre-rc-research/               # Pre-RC domain output
    brief.md                     # Original product brief
    classification.md            # Cynefin complexity result
    persona-selection.md         # Which personas were activated
    prd-{slug}.md                # 19-section PRD (master output)
    prd-{slug}.html              # Consulting deck (HTML)
    {Name}_PRD.docx              # McKinsey-format Word doc
    tasks-{slug}.md              # Task breakdown
    RESEARCH-INDEX.md            # Token usage by persona
    state/PRC-STATE.md           # Pipeline state
    gates/gate-{1,2,3}.md        # Gate decision records
    stage-{1-6}/{persona-id}.md  # Per-persona research artifacts

  rc-method/                     # RC Method domain output
    prds/PRD-{name}-master.md    # 11-section PRD (converted or generated)
    prds/PRD-{name}-ux.md        # UX child PRD (optional)
    tasks/TASKS-{name}-master.md # Formal task list with T-IDs
    gates/{phase}-{num}.md       # Gate decision records
    forge/{taskId}/*             # Generated code (staging dir)
    design/*                     # Design specs + wireframes
    diagrams/*                   # Mermaid + HTML diagrams
    state/RC-STATE.md            # Pipeline state
    PLAYBOOK-{name}.md           # Master architecture playbook

  post-rc/                       # Post-RC domain output
    state/POSTRC-STATE.md        # Scan results + findings
    reports/REPORT-{scanId}.md   # Validation report
    remediation/REMEDIATION-TASKS-{scanId}.md
    specs/OBSERVABILITY-SPEC.md  # Pre-flight monitoring spec
    overrides/*                  # Override records (immutable)

  rc-traceability/               # Traceability domain output
    TRACEABILITY.json            # Coverage matrix state
    enhanced/PRD-ENHANCED-*.md   # PRD with requirement IDs
    reports/*.md                 # Coverage reports
    reports/*.html               # Consulting-grade HTML reports

  .rc-engine/                    # Runtime metadata
    state.db                     # CheckpointStore (SQLite + WAL, all domain state)
    PIPELINE.md                  # Token usage summary
```
