# Data & Telemetry Strategist

**Stage:** stage-4-technical
**LLM:** claude
**Mode:** autonomous
**Tokens:** 26836
**Generated:** 2026-02-13T04:00:31.079Z

---

# Data & Telemetry Strategist Analysis: Post-RC Security Gate

## 1. Tracking Plan (Event Schema)

### Critical Events (snake_case, past-tense)

```typescript
// Core scanning events
security_scan_requested {
  scan_id: UUID,
  developer_id: string,
  commit_sha: string,
  file_path: string,
  language: Language,
  code_hash: string, // For cache hit tracking
  scan_mode: 'fast' | 'deep',
  triggered_by: 'manual' | 'pre_commit' | 'ci_cd',
  timestamp: ISO8601
}

security_scan_completed {
  scan_id: UUID,
  duration_ms: number,
  findings_count: number,
  findings_by_severity: { CRITICAL: n, HIGH: n, MEDIUM: n, LOW: n },
  cache_hit: boolean,
  token_cost: number, // Claude API cost in USD
  sec_context_version: string,
  gate_decision: 'block' | 'warn' | 'pass',
  timestamp: ISO8601
}

security_scan_failed {
  scan_id: UUID,
  error_type: 'timeout' | 'api_error' | 'context_overflow' | 'parse_error',
  error_message: string,
  fallback_triggered: boolean,
  timestamp: ISO8601
}

// Override tracking (audit-critical)
security_finding_overridden {
  finding_id: UUID,
  scan_id: UUID,
  developer_id: string,
  cwe_id: string,
  severity: Severity,
  reason: string, // PII-redacted
  approver_id?: string,
  approval_duration_sec?: number, // Time to get approval
  override_type: 'permanent' | 'temporary',
  expires_at?: ISO8601,
  timestamp: ISO8601
}

// Developer interaction signals
security_report_viewed {
  scan_id: UUID,
  developer_id: string,
  findings_expanded: number, // How many findings clicked
  time_spent_sec: number,
  timestamp: ISO8601
}

remediation_applied {
  finding_id: UUID,
  scan_id: UUID,
  developer_id: string,
  remediation_source: 'ai_suggested' | 'manual',
  rescan_passed: boolean,
  new_findings_introduced: number,
  timestamp: ISO8601
}

// System health events
pattern_matcher_latency_recorded {
  language: Language,
  code_size_bytes: number,
  latency_ms: number,
  cache_hit: boolean,
  timestamp: ISO8601
}

false_positive_reported {
  finding_id: UUID,
  cwe_id: string,
  reporter_id: string,
  evidence: string,
  timestamp: ISO8601
}
```

---

## 2. Health Dashboard Requirements

### Widget 1: Scan Performance (P50/P95/P99 Latency)
**Metric:** `security_scan_completed.duration_ms`  
**Dimensions:** By `scan_mode`, `language`, `cache_hit`  
**SLO Threshold:** P90 <10s (fast), P90 <30s (deep)  
**Alert:** P95 >15s for 5 consecutive minutes

### Widget 2: Gate Decision Distribution
**Metric:** `security_scan_completed.gate_decision`  
**Visualization:** Stacked bar (block/warn/pass) over time  
**Target:** <5% block rate (indicates low Critical finding rate)

### Widget 3: Override Rate by Severity
**Metric:** `COUNT(security_finding_overridden) / COUNT(findings)` grouped by severity  
**Critical Threshold:** >30% override rate = product failure signal  
**Alert:** >40% override rate on High findings in 7-day window

### Widget 4: Token Cost per Scan
**Metric:** `AVG(security_scan_completed.token_cost)`  
**Dimensions:** By `scan_mode`, `cache_hit`  
**Target:** <$0.10 average  
**Alert:** Daily cost >$50 (indicates cache failure or context explosion)

### Widget 5: False Positive Rate (Derived)
**Calculation:** `COUNT(overridden AND severity=CRITICAL) / COUNT(findings WHERE severity=CRITICAL)`  
**Target:** <10% for Critical, <20% for High  
**Data Source:** Override logs with manual audit sampling (100 overrides/month reviewed by Security Team)

### Widget 6: Error Rate & Fallback Frequency
**Metrics:**  
- `security_scan_failed` rate (target <2%)  
- `fallback_triggered=true` rate (target <5%)  
**Alert:** >10% failure rate for 10 minutes = circuit breaker investigation

---

## 3. SLO Definitions

| Service | SLI | SLO Target | Measurement Window | Consequences |
|---------|-----|------------|-------------------|--------------|
| **Fast Scan Latency** | P90(duration_ms) for scan_mode=fast | <10,000ms | Rolling 7 days | >10s triggers async mode investigation |
| **Deep Scan Latency** | P90(duration_ms) for scan_mode=deep | <30,000ms | Rolling 7 days | >30s triggers token optimization review |
| **Scan Availability** | (successful scans) / (total scan requests) | >98% | Rolling 24 hours | <98% triggers fail-open mode |
| **False Positive Rate** | (overridden Critical findings) / (total Critical findings) | <10% | Rolling 30 days | >15% triggers pattern review |
| **Override Approval Latency** | P90(approval_duration_sec) for Critical overrides | <14,400s (4hr) | Rolling 7 days | >4hr triggers auto-escalation |
| **Token Cost Efficiency** | AVG(token_cost) per scan | <$0.10 | Rolling 7 days | >$0.15 triggers RAG optimization |

**Error Budget:** 2% scan failures per month = ~600 failed scans at 1000 scans/day scale.

---

## 4. Alerting Rules

### Critical Alerts (PagerDuty)
```yaml
- name: "Security Gate Failure Spike"
  condition: security_scan_failed rate >10% for 10min
  action: Page on-call engineer
  
- name: "Override Rate Threshold Breach"
  condition: override_rate >40% on High findings in 7d window
  action: Alert Security Team + auto-disable gate pending review

- name: "Token Cost Runaway"
  condition: Daily token cost >$100
  action: Page platform engineer + trigger RAG investigation
```

### Warning Alerts (Slack)
```yaml
- name: "Latency Degradation"
  condition: P95 scan latency >15s for fast mode
  action: Notify #security-gate channel

- name: "Cache Hit Rate Drop"
  condition: cache_hit_rate <70% for 1 hour
  action: Investigate Redis cluster health

- name: "False Positive Trend"
  condition: FP rate increases >5% week-over-week
  action: Trigger sec-context pattern review
```

---

## 5. Data Pipeline Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Event Sources (MCP Server)                              │
├─────────────────────────────────────────────────────────┤
│ security_scan_* → stdout (structured JSON logs)         │
│ security_finding_overridden → PostgreSQL + stdout       │
└────────────┬────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────┐
│ Collection Layer (Vector.dev)                           │
├─────────────────────────────────────────────────────────┤
│ - Parse JSON logs                                       │
│ - Enrich with metadata (region, version)                │
│ - Route to sinks                                        │
└────┬────────────────────────────────────────────────────┘
     │
     ├──────> ClickHouse (hot analytics, 90-day retention)
     ├──────> S3 (cold storage, infinite retention)
     └──────> Prometheus (real-time metrics, 7-day retention)
                    │
                    ▼
            ┌─────────────────┐
            │ Grafana         │
            │ (dashboards)    │
            └─────────────────┘
```

**Why ClickHouse?** Columnar storage optimized for time-series analytics; 10-100x faster than PostgreSQL for aggregation queries.

**Why Vector.dev?** Rust-based log router; 10x lower memory footprint than Logstash; native JSON parsing.

---

## 6. PII Handling Strategy

### PII Surfaces
1. **Override reason field** — May contain credentials ("API key is sk-abc123")
2. **Code snippets in logs** — May contain email addresses, tokens
3. **Developer IDs** — Pseudonymize in analytics; retain mapping in secure vault

### Mitigation
```typescript
// PII redaction pipeline (Vector.dev transform)
.transform = """
  .reason = redact_patterns(.reason, [
    r'sk-[a-zA-Z0-9]{48}',  // OpenAI keys
    r'ghp_[a-zA-Z0-9]{36}',  // GitHub tokens
    r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'  // Emails
  ])
  .developer_id = sha256(.developer_id)  // Pseudonymize
"""
```

**Compliance:** GDPR Article 32 (pseudonymization), SOC2 CC6.1 (logical access controls).

---

## 7. Dual-Write Strategy (sec-context Migrations)

**Scenario:** Upgrading sec-context from v1.0 to v2.0 (new CWE patterns).

**Phase 1: Dual-Write (7 days)**
- All scans write results tagged with `sec_context_version`
- 50% traffic uses v1.0, 50% uses v2.0 (A/B test)
- Metrics: Compare FP rate, override rate, latency

**Phase 2: Reconciliation**
```sql
-- Identify findings that differ between versions
SELECT scan_id, cwe_id, severity_v1, severity_v2
FROM scans_v1 JOIN scans_v2 USING (code_hash)
WHERE severity_v1 != severity_v2
  AND override_count_v2 < override_count_v1;  -- v2 is better
```

**Phase 3: Cutover**
- If v2.0 FP rate <v1.0 by ≥5%, promote to 100% traffic
- Else, rollback and investigate pattern quality

---

## 8. Feedback Loops

### Loop 1: Override Data → Pattern Tuning
**Frequency:** Weekly  
**Process:**  
1. Query overrides with `reason LIKE '%false positive%'`
2. Extract common CWE patterns (e.g., CWE-327 in test code)
3. Adjust severity thresholds or add context rules
4. Deploy via blue-green sec-context update

### Loop 2: Latency Metrics → RAG Optimization
**Trigger:** P95 latency >12s for 3 consecutive days  
**Process:**  
1. Analyze `pattern_matcher_latency_recorded` by language
2. Identify slow CWE patterns (e.g., dataflow analysis)
3. Pre-compute top-10 patterns per language (cache warming)

### Loop 3: Developer NPS → UX Iteration
**Frequency:** Quarterly survey  
**Metric:** "How likely are you to recommend security gate?" (0-10)  
**Action:** NPS <40 triggers UX audit (finding descriptions, override flow)

---

## Summary: Telemetry Success Criteria

**Leading Indicators (Week 1):**
- P90 scan latency <10s ✓
- Cache hit rate >