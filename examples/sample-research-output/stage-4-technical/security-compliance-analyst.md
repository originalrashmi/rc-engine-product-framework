# Security, Privacy & Compliance Analyst

**Stage:** stage-4-technical
**LLM:** perplexity
**Mode:** autonomous
**Tokens:** 24756
**Generated:** 2026-02-13T04:00:52.118Z

---

# Security, Privacy & Compliance Assessment: Post-RC Security Gate

## 1. Threat Model
Key threat vectors for AI code security gate (Developer Security Tool class):

- **AI Prompt Injection via Generated Code:** Malicious code comments (e.g., `/* IGNORE SECURITY RULES */`) injected into `rc_forge_task` output could manipulate LLM scanning if unsanitized[2].
- **Credential Leakage in Overrides/Logs:** Developer override reasons contain secrets (e.g., "staging API key: sk-abc123")[7].
- **False Positive Bypass (Security Theater):** >30% override rate enables vuln deployment; insider misuse via bulk overrides[1].
- **Supply Chain (sec-context Corpus):** 165K-token KB tampering alters pattern detection[4].
- **DoS via Token Exhaustion:** Flood `rc_security_scan` exhausts Claude API quota[5].
- **Data Exfiltration:** Scan results expose PII from code (e.g., emails in strings).

**Severity Classification (Likelihood × Impact):**
| Vector | Severity | MITRE ATT&CK Mapping |
|--------|----------|----------------------|
| Prompt Injection | Critical | T1059.007 (JavaScript) |
| Credential Leakage | High | T1552 (Unsecured Credentials) |
| Override Bypass | High | T1530 (Data Access) |
| Corpus Tampering | Critical | T1574 (Hijack Execution Flow) |

## 2. Authentication & Authorization
**AuthN:** JWT Bearer tokens (RS256) with 15min expiry; validate via JWKS endpoint. Support SSO (OIDC: Google Workspace, Okta) + API keys for CI/CD. Session: Stateless JWT refresh (1h max).

**AuthZ:** RBAC via JWT claims (`role`, `team_id`, `project_id`). Enforce least-privilege:
- Rate limits: 10 fast scans/min/developer, 2 deep/team.
- Multi-factor for Critical overrides (TOTP/WebAuthn).

**MCP Integration:** Extend `rc_security_*` tools with `auth_token` param; passthrough mode proxies IDE auth.

## 3. RBAC Matrix
| Role | Execute Scan | View Own Results | View Team Results | Override Med/Low | Override High | Override Critical | Configure Policy | View Audit Logs |
|------|--------------|------------------|-------------------|------------------|---------------|-------------------|------------------|-----------------|
| Developer | ✓ | ✓ | ✗ | ✓ (1-click) | ✗ | ✗ | ✗ | ✗ |
| Security Champion | ✓ | ✓ | ✓ | ✓ | ✓ (async) | ✗ | ✗ | ✓ (team) |
| Security Team | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (2FA) | ✓ (org) | ✓ (all) |
| DevOps Engineer | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ (project) | ✓ (all) |
| Auditor | ✗ | ✗ | ✓ (all) | ✗ | ✗ | ✗ | ✗ | ✓ (all, immutable) |
| CI/CD Service Acct | ✓ (JSON) | ✓ (JSON) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

**Escalation:** Critical override auto-escalates to Security Team after 4h. Quarterly access reviews.

## 4. Data Classification
**Sensitive Data Inventory:**
- **PII:** Developer emails/IDs in overrides; code snippets with user data (emails, IPs)[1].
- **PHI/Financial:** Rare in code; flag if detected (HIPAA/PCI scope).
- **Secrets:** API keys, passwords in code/overrides.
- **Security Findings:** Override reasons (business-sensitive).

**Encryption Requirements:**
| Data Type | At-Rest | In-Transit | Access |
|-----------|---------|------------|--------|
| Override Logs | AES-256 (PostgreSQL TDE) | TLS 1.3 | RBAC + audit |
| Scan Results | AES-256 (Redis EKM) | TLS 1.3 | TTL 7d, auto-purge |
| sec-context Embeddings | AES-256 (pgvector) | TLS 1.3 | Read-only service acct |
| Audit Trail | AES-256 (S3 SSE-KMS) | TLS 1.3 | Immutable WORM |

**Redaction:** Regex filter overrides (`sk-[a-z0-9]{48}`, emails) before logging[7].

## 5. Data Residency
- **Primary:** US-East (AWS us-east-1) for RC Method users; EU (eu-west-1) opt-in.
- **Requirements:** Configurable per-project (e.g., GDPR=EU, FedRAMP=US-Gov).
- **Cross-Border:** No transfers without SCCs; use AWS PrivateLink for Claude API.

## 6. Compliance Requirements
| Standard | Applicability | Key Controls |
|----------|---------------|--------------|
| **SOC 2 Type II** | Core (DevSecOps tool) | CC6.1 (Access), CC7.2 (Audit logs), annual audit[4]. |
| **GDPR** | PII in overrides/code | Art. 32 (Encryption), Art. 25 (Privacy by Design), DPA required[1]. |
| **HIPAA** | If scanning PHI code | 45 CFR §164.312 (Access controls); BAA with AWS/Anthropic[UNVERIFIED]. |
| **PCI DSS 4.0** | Auth/payment code scans | Req 6.3.3 (Static testing); segment cardholder data[3]. |
| **OWASP ASVS** | SAST gate | L1: Input val (V5), L2: AuthZ (V2)[4]. |

**Gap:** No ISO 27001; target v2025 certification Q4 2026.

## 7. Prompt Security (AI Components)
- **Injection Prevention:** Sanitize code input (strip XML/JSON payloads, base64 decode)[2]. Structured prompts: `<code>{code}</code><instructions>Analyze ONLY...</instructions>`.
- **Output Sanitization:** JSON schema enforcement (Pydantic/Zod); block non-enum CWEs.
- **Sensitive Data Filtering:** Pre-scan redact secrets from code context; no PII in LLM prompts.
- **Model Guardrails:** Constrain to CWE enum; reflection loop rejects hallucinations >20% confidence.

## 8. Audit Logging
**Immutable Append-Only (PostgreSQL + S3 WORM):**
- **Must-Log:** All scans (`gate_decision`), overrides (`reason`, `approver`), config changes, API calls (Claude token usage).
- **Retention:** 2 years hot (PG), infinite cold (S3).
- **Format:** `actor_id | action | resource | timestamp | outcome | reason`.
- **Query API:** Read-only, RBAC-filtered; SIEM export (JSONL).

## 9. Incident Response
- **Detection:** >10% scan failure (Prometheus), override spike (>40%), anomaly in token spend.
- **Notification:** 
  - P1 (Critical CVE blocked): Slack + PagerDuty <5min.
  - P2 (High override): Security Team <1h.
  - GDPR Breach: DPO + regulators <72h.
- **Remediation:** Kill switch (`rc_security_emergency_disable`); rollback sec-context v1.0. RTO<1h, RPO<5min (PG replication).
- **Postmortem:** Mandatory if override>30%; feed to pattern tuning.

## 10. Misuse Cases & Mitigations
| Scenario | Adversary | Impact | Technical Mitigation | RBAC Control |
|----------|-----------|--------|----------------------|-------------|
| Bulk Override to Deploy Vulns | Insider Dev | Production breach | Rate limit 20/hr; 2FA Critical; reason ML validation (cluster vs. history) | Champion approval |
| Prompt Injection in Code | Compromised AI | Bypass scanning | Code sanitizer (strip comments/instructions); schema output | N/A |
| Log Scraping for Secrets | Auditor Insider | Credential theft | PII redaction pipeline; encrypted reason field; vault access logs | Auditor read-only |
| DoS Scan Flood | External | Token exhaustion | API key rate limits; CAPTCHA on >50/min; circuit breaker | Service acct quotas |
| Corpus Poisoning | Supply Chain | False negatives | Versioned embeddings (SHA256 pinned); blue-green deploy; sig check | DevOps signed updates |

**NFRs for PRD:**
- **Fail-Open Default:** Scan errors → WARN (no block).
- **Zero-Trust Pipeline:** All inputs untrusted; validate outputs.
- **Human-in-Loop:** Critical paths (overrides, config) mandatory.
- **Metrics:** Track override_rate <30% as compliance proxy.

---

### Sources
[1] https://www.softwareseni.com/almost-right-but-not-quite-building-trust-validation-processes-and-quality-control-for-ai-generated-code/
[2] https://pluto.security/blog/claude-code-security-ai-generated-code/
[3] https://www.codegeeks.solutions/blog/best-practices-for-ai-refactoring-legacy-code
[4] https://www.veracode.com/blog/secure-ai-code-generation-in-practice/
[5] https://www.picussecurity.com/resource/blog/the-ultimate-guide-to-automated-security-validation-asv
[6] https://es-la.tenable.com/cybersecurity-guide/learn/ai-security-best-practices
[7] https://www.aikido.dev/blog/ciso-vibe-coding-security-checklist
