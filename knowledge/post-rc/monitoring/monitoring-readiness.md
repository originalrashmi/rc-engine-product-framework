# Post-RC Method: Monitoring Readiness Gate

> **Module:** Monitoring (Module 2)
> **Purpose:** Validate that observability instrumentation is in place before shipping

## What This Module Checks

Before any AI-generated code ships to production, verify these monitoring requirements are met:

### 1. Error Tracking (CRITICAL)
- Error monitoring SDK is integrated (Sentry, Datadog, Bugsnag, Rollbar)
- Critical error paths have structured error boundaries
- Error context includes: user ID, request ID, stack trace, environment
- Source maps are configured for frontend error tracking

### 2. User Behavior Analytics (MEDIUM)
- Product analytics tool is wired (PostHog, Amplitude, Mixpanel)
- Key user flows have event instrumentation:
  - Entry → feature discovery → core action → completion
- Session recording is configured for UX-critical flows (Hotjar, FullStory, LogRocket)
- Heatmap/click tracking on landing pages and key conversion points

### 3. System Health (HIGH)
- Structured logging with correlation IDs
- API endpoint latency tracking
- Database query performance monitoring
- Memory/CPU utilization visibility

### 4. SLOs & Dashboards (HIGH)
- Service Level Objectives defined (availability, latency, error rate)
- At least one operational dashboard exists showing golden signals
- Error budget tracking configured

### 5. Alerting (HIGH)
- Critical alerts route to PagerDuty/Opsgenie (or equivalent)
- Warning alerts route to Slack/Teams channel
- Alert thresholds based on SLO targets
- Escalation path documented

### 6. AI-Specific Monitoring (MEDIUM)
For products with AI-generated code, additionally check:
- Defect density tracking by code authorship (AI vs human)
- Hallucination artifact detection (phantom imports, unreachable branches)
- AI revert percentage tracking (code that ships then gets rolled back)
- Token cost monitoring for LLM-powered features

## Severity Mapping

| Check | Missing = Severity | Why |
|-------|-------------------|-----|
| Error tracking | CRITICAL | Production errors invisible |
| [OBSERVABILITY] tasks | HIGH | No build plan for monitoring |
| Alerting | HIGH | Incidents discovered by users |
| SLOs | MEDIUM | No objective health measurement |
| Analytics | MEDIUM | User behavior unobservable |
| Dashboards | MEDIUM | Ops team blind |
| AI-specific | LOW | Nice-to-have for v1 |

## Integration with RC Method

This module reads:
- `rc-method/prds/PRD-*-master.md` → checks for Section 6a (Observability Requirements)
- `rc-method/tasks/TASKS-*.md` → checks for [OBSERVABILITY] task type coverage
- Code context (if provided) → checks for SDK imports and instrumentation patterns

The monitoring readiness gate works alongside the security gate (Module 1).
Both must pass for the Post-RC gate to approve shipping.
