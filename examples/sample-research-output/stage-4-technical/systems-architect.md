# Systems Architect

**Stage:** stage-4-technical
**LLM:** claude
**Mode:** autonomous
**Tokens:** 20480
**Generated:** 2026-02-13T03:58:13.070Z

---

# Systems Architect Analysis: Post-RC Security Gate

## 1. System Architecture Overview

**Architecture Pattern:** Async Actor Model with Fail-Open Semantics

```
┌─────────────────────────────────────────────────────────────┐
│ RC Method MCP Server (Node.js/TypeScript)                   │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────┐    ┌──────────────────┐                │
│ │ rc_forge_task   │───>│ Security Gate    │                │
│ │ (code gen)      │    │ Orchestrator     │                │
│ └─────────────────┘    └────────┬─────────┘                │
│                                  │                           │
│         ┌────────────────────────┼────────────────────┐     │
│         ▼                        ▼                    ▼     │
│  ┌─────────────┐      ┌──────────────┐    ┌──────────────┐│
│  │ Pattern     │      │ Scan Queue   │    │ Result Cache ││
│  │ Matcher     │      │ (async)      │    │ (Redis)      ││
│  │ (stateless) │      └──────────────┘    └──────────────┘│
│  └─────────────┘                                            │
└─────────────────────────────────────────────────────────────┘
         │                                           │
         ▼                                           ▼
┌─────────────────┐                       ┌──────────────────┐
│ sec-context     │                       │ Override Log     │
│ Vector Store    │                       │ (PostgreSQL)     │
│ (Pinecone/local)│                       └──────────────────┘
└─────────────────┘                                │
         │                                         ▼
         ▼                                ┌──────────────────┐
┌─────────────────┐                      │ Audit Trail API  │
│ Claude API      │                      │ (read-only)      │
│ (primary LLM)   │                      └──────────────────┘
└─────────────────┘
```

**Key Architectural Decisions:**

1. **Separate MCP Server Initially** — Decouple from RC Method core to isolate failure modes; consolidate in Phase 2 if operational burden justifies
2. **Async Scanning with Synchronous Fast Path** — <5s heuristic scan (pattern matching) returns immediately; deep analysis (dataflow) runs async with notification
3. **Stateless Pattern Matcher** — Horizontal scaling via worker pool; no shared memory between scan processes
4. **Vector Store for sec-context** — RAG eliminates 165K token full injection; target 10-15K tokens per scan

---

## 2. State Management Strategy

**State Distribution:**

| State Type | Location | Consistency Model | TTL |
|------------|----------|-------------------|-----|
| Scan results | Redis (cache) | Eventually consistent | 7 days |
| Override logs | PostgreSQL | Strongly consistent | Infinite (audit) |
| sec-context embeddings | Pinecone/local | Read-only | Updated weekly |
| Active scan jobs | In-memory queue | Best-effort | 60s timeout |
| Developer session | MCP server memory | Session-scoped | Until disconnect |

**Critical Constraint:** Override logs MUST be immutable append-only (audit compliance). No UPDATE/DELETE operations allowed.

**Synchronization Strategy:**
- Scan results cached by `hash(code_content + sec_context_version)` — identical code reuses cached result
- Override logs replicated to S3 for long-term retention (PostgreSQL for hot queries)
- sec-context updates trigger cache invalidation (all cached results expire)

---

## 3. Data Model

### Core Entities

```typescript
// Scan Result (Redis + PostgreSQL archive)
interface ScanResult {
  id: UUID;
  commit_sha: string;
  file_path: string;
  language: Language;
  findings: Finding[];
  scan_duration_ms: number;
  sec_context_version: string;
  created_at: timestamp;
}

// Finding (embedded in ScanResult)
interface Finding {
  id: UUID;
  cwe_id: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  line_start: number;
  line_end: number;
  pattern_matched: string;
  confidence: 0.0-1.0;
  remediation_guidance: string; // Max 500 chars
  exploitability_score: 0.0-1.0;
}

// Override Log (PostgreSQL only)
interface Override {
  id: UUID;
  finding_id: UUID; // References Finding.id
  developer_id: string;
  reason: string; // Max 2000 chars, PII-redacted
  approver_id?: string; // Required for CRITICAL
  created_at: timestamp;
  expires_at?: timestamp; // Optional temporary override
}

// sec-context Vector (Pinecone)
interface PatternEmbedding {
  id: string; // CWE-XXX-context-YYY
  cwe_id: string;
  language: Language;
  vector: float[1536]; // OpenAI embedding dimension
  metadata: {
    severity: Severity;
    category: string; // "Injection", "XSS", etc.
    example_code: string;
  }
}
```

**Database Schema Recommendations:**
- **PostgreSQL** for override logs (ACID compliance, audit queries)
- **Redis** for scan result cache (sub-10ms reads, auto-expiration)
- **Pinecone** for sec-context vectors (managed similarity search) OR **pgvector** (self-hosted, lower latency)

---

## 4. API Design

### MCP Tools (extend RC Method server)

```typescript
// Tool 1: Execute security scan
rc_security_scan(
  code: string,
  language: Language,
  file_path: string,
  scan_mode: 'fast' | 'deep' = 'fast'
) -> ScanResult

// Tool 2: Override finding
rc_security_override(
  finding_id: UUID,
  reason: string,
  approver_id?: string // Required if severity=CRITICAL
) -> Override

// Tool 3: Query scan history
rc_security_report(
  commit_sha?: string,
  since?: timestamp,
  severity_filter?: Severity[]
) -> ScanResult[]

// Tool 4: Configure gate policy
rc_security_configure(
  project_id: string,
  policy: GatePolicy
) -> void

interface GatePolicy {
  block_on_critical: boolean;
  warn_on_high: boolean;
  ignored_cwes: string[]; // ["CWE-327"] for MD5 suppression
  test_code_severity_reduction: number; // -1 severity level
}
```

**Authentication:** Bearer token (JWT) with RBAC claims; rate limit 100 scans/hour per team

**Rate Limiting Strategy:**
- **Fast scan:** 10 req/min per developer (prevents abuse)
- **Deep scan:** 2 req/min per team (token cost protection)
- **Override:** 20 req/hour per developer (prevents bypass spam)

---

## 5. Data Flow Map

```
┌──────────────┐
│ rc_forge_task│ generates code
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│ PHASE 1: Fast Scan (synchronous, <5s)                   │
├──────────────────────────────────────────────────────────┤
│ 1. Hash code + sec_context_version                       │
│ 2. Check Redis cache → HIT? Return cached result         │
│ 3. MISS? Extract language, file context                  │
│ 4. RAG query: Retrieve top 10 CWE patterns for language  │
│ 5. Regex + AST pattern matching (stateless)              │
│ 6. Generate Finding[] with confidence scores             │
│ 7. Cache result in Redis (7 day TTL)                     │
│ 8. Return to developer (<5s elapsed)                     │
└──────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│ DECISION GATE                                            │
├──────────────────────────────────────────────────────────┤
│ IF findings.any(severity=CRITICAL) AND NOT overridden    │
│   THEN block=true, message="Critical findings require    │
│         remediation or override"                         │
│ ELIF findings.any(severity=HIGH)                         │
│   THEN warn=true, message="High severity findings"       │
│ ELSE pass=true                                           │
└──────────────────────────────────────────────────────────┘
       │
       ├─────> (if block=true) Developer overrides OR fixes code
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│ PHASE 2: Deep Scan (async, optional, <30s)              │
├──────────────────────────────────────────────────────────┤
│ 1. Enqueue scan job (RabbitMQ/Redis queue)              │
│ 2. Worker: Full context injection (15K tokens)           │
│ 3. Claude API: Dataflow taint analysis                   │
│ 4. Detect obfuscated patterns (eval(atob(...)))          │
│ 5. Cross-language boundary checks (SQL in JS string)     │
│ 6. Update ScanResult with deep findings                  │
│ 7. Notify developer via MCP event stream                 │
└──────────────────────────────────────────────────────────┘
```

**Critical Latency Targets:**
- Fast scan P90: <5s (pattern matching only)
- Deep scan P90: <30s (full LLM analysis)
- Cache hit latency: <100ms

---

## 6. Scalability Plan

**Horizontal Scaling Strategy:**

1. **Pattern Matcher Workers:** Stateless Node.js processes behind load balancer; scale to N workers based on queue depth
2. **Redis Cache Cluster:** 3-node cluster with replication; cache hit ratio target >80%
3. **PostgreSQL Read Replicas:** 2 read replicas for audit queries; primary for writes only
4. **Vector Store Sharding:** Partition sec-context by language (Python patterns on shard 1, JavaScript on shard 2)

**Bottleneck Identification:**

| Component | Bottleneck Risk | Mitigation |
|-----------|----------------|------------|
| Claude API | Rate limits (100 req/min) | Queue + batch processing; fallback to GPT-4 |
| Redis cache | Memory exhaustion | LRU eviction; 7-day TTL; compress large results |
| PostgreSQL | Write contention on override logs | Append-only table; partition by month |
| Vector similarity search | Query latency >500ms | Pre-compute top 10 patterns per language; cache in Redis |

**Caching Strategy:**
- **L1 (In-Memory):** Top 100 CWE patterns per language (99% hit rate)
- **L2 (Redis):** Scan results by code hash (80% hit rate)
- **L3 (Vector Store):** Full sec-context embeddings (100% coverage)

---

## 7. Fault Tolerance

**Circuit Breaker Patterns:**

```typescript
// Claude API circuit breaker
const claudeCircuit = new CircuitBreaker(claudeAPI, {
  timeout: 30000, // 30s
  errorThresholdPercentage: 50,
  resetTimeout: 60000 // 1min
});

claudeCircuit.fallback(() => {
  // Fallback to cached lightweight ruleset
  return runLocalPatternMatch(code);
});

claudeCircuit.on('open', () => {
  logger.alert('Claude API circuit open - using local fallback');
});
```

**Retry Policies:**
- **Claude API:** Exponential backoff (1s, 2s, 4s); max 3 retries
- **Redis:** Immediate retry once; fail-open if unavailable
- **PostgreSQL:** No retries on write (fail-fast); queue for async retry

**Fallback Mechanisms:**
- **Claude timeout:** Use cached top-10 CWE patterns (degraded accuracy)
- **Redis unavailable:** Skip cache, run fresh scan (higher latency)
- **Vector store down:** Inject full 165K sec-context (token cost spike)
- **All systems down:** Fail-open with warning (log incident, don't block)

**Data Migration Paths:**
- **sec-context version upgrade:** Blue-green deployment (old + new embeddings coexist for 7 days)
- **Schema migration:** Zero-downtime via PostgreSQL partitions + dual writes
- **Override log retention:** Archive to S3 after 90 days; keep PostgreSQL for hot queries

---

## 8. Technology Recommendations

**Stack (Matched to Complicated Domain):**

| Layer | Technology | Justification |
|-------|-----------|---------------|
| MCP Server | Node.js 20 + TypeScript | Existing RC Method stack; async I/O for queue processing |
| Pattern Matching | Tree-sitter (AST) + Regex | Language-agnostic parsing; 10x faster than full LLM |
| Vector Store | pgvector (self-hosted) | Lower latency than Pinecone; PostgreSQL co-location |
| Cache | Redis 7 (cluster mode) | Sub-10ms reads; built-in TTL; proven at scale |
| Database | PostgreSQL 16 | ACID for audit logs; JSON support for flexible schema |
| Queue | Redis Streams | Simpler than RabbitMQ; sufficient for <10K scans/day |
| LLM | Claude Opus (primary), GPT-4 (fallback) | Best reasoning for security; GPT-4 for cost optimization |
| Observability | OpenTelemetry + Grafana | Trace scan latency P90/P99; alert on >10s |

**Why NOT Microservices?**
- Scan volume <10K/day doesn't justify distributed system complexity
- Monolithic MCP server with worker pool is sufficient
- Migrate to microservices only if >100K scans/day

**Why pgvector over Pinecone?**
- Latency: 50-100ms vs. 200-300ms (co-located with PostgreSQL)
- Cost: $0 vs. $70/month for 1M vectors
- Trade-off: Manual index tuning vs. managed service

---

## 9. Architectural Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Token cost explosion (full context injection) | HIGH | SEVERE | RAG mandatory; fallback to top-10 patterns |
| False positive cascade (bad sec-context update) | MEDIUM | SEVERE | Blue-green deployment; rollback within 1 hour |
| Claude API outage (>30min) | MEDIUM | MODERATE | Fail-open + local fallback; alert Security Team |
| Redis memory exhaustion | LOW | MODERATE | LRU eviction + monitoring; scale to 3-node cluster |
| Override log data loss | LOW | CRITICAL | PostgreSQL replication + S3 backup; RTO <1 hour |

**Blast Radius Containment:**
- Security gate failure → RC Method continues (fail-open)
- Pattern matcher crash → Queue retries with exponential backoff
- Database corruption → Restore from S3 backup (last 24 hours)

---

## 10. Success Criteria (Architectural)

| Metric | Target | Measurement |
|--------|--------|-------------|
| P90 scan latency | <10s | OpenTelemetry trace |
| Cache hit ratio | >80% | Redis INFO stats |
| Token cost per scan | <$0.10 | Claude API usage log |
| False positive rate | <10% (Critical) | Override logs analysis |
| System uptime |