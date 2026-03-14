# Observability Spec Template

> This is a companion document to the PRD. It specifies what must be observable
> in production. Feed this into RC Method alongside the PRD during rc_define.

## 1. Error Tracking

### Tool Selection
- **Primary:** [Sentry / Datadog / Bugsnag]
- **Why:** [1-sentence justification]

### Error Boundaries
| Feature/Endpoint | Error Types to Capture | Context Required | Severity |
|---|---|---|---|
| [Feature 1] | [e.g., API 5xx, validation failures] | [user_id, request_id, payload] | [Critical/High] |

### Source Map Configuration
- Frontend source maps: [Required / Not needed]
- Upload to error tracking service on deploy: [Yes / No]

## 2. User Behavior Analytics

### Tool Selection
- **Primary:** [PostHog / Amplitude / Mixpanel]
- **Session Recording:** [Hotjar / FullStory / LogRocket / Not needed]
- **Why:** [1-sentence justification]

### Event Schema
| Event Name | Trigger | Properties | Funnel Position |
|---|---|---|---|
| [e.g., user.signup.started] | [User clicks signup] | [source, referrer] | [Entry] |
| [e.g., user.signup.completed] | [Account created] | [method, time_to_complete] | [Completion] |

### Funnels to Track
| Funnel Name | Steps | Target Conversion |
|---|---|---|
| [e.g., Onboarding] | [signup → profile → first_action] | [>60%] |

### Session Recording Triggers
- [Record all sessions on: signup flow, payment flow]
- [Sample rate for general sessions: 10%]

## 3. System Health (Golden Signals)

### SLO Targets
| Signal | Target | Measurement | Alert Threshold |
|---|---|---|---|
| Availability | [99.9%] | [Successful responses / total] | [<99.5% over 5min] |
| Latency P95 | [<500ms] | [Response time percentile] | [>1000ms over 5min] |
| Error Rate | [<1%] | [5xx / total requests] | [>5% over 5min] |
| Saturation | [<80% CPU] | [Resource utilization] | [>90% over 10min] |

### Per-Endpoint Latency Budgets
| Endpoint | P50 Target | P95 Target | P99 Target |
|---|---|---|---|
| [GET /api/...] | [<100ms] | [<300ms] | [<1000ms] |

## 4. Dashboards

### Operations Dashboard
- Golden signals overview (latency, traffic, errors, saturation)
- Recent deployments + error rate correlation
- Top errors by frequency
- Infrastructure utilization

### Product Dashboard
- Feature adoption rates (DAU/MAU per feature)
- Funnel conversion rates
- Session duration and depth
- Retention cohort analysis

## 5. Alerts

### Critical (Page On-Call)
| Condition | Threshold | Window | Action |
|---|---|---|---|
| [Error rate spike] | [>5% 5xx] | [5 min] | [PagerDuty → on-call engineer] |
| [Service down] | [0 successful responses] | [2 min] | [PagerDuty → on-call + engineering lead] |

### Warning (Slack Notification)
| Condition | Threshold | Window | Action |
|---|---|---|---|
| [Latency degradation] | [P95 >1s] | [10 min] | [Slack #alerts channel] |
| [Low adoption] | [Feature usage <10% of MAU] | [7 days] | [Slack #product channel] |

## 6. Instrumentation Tasks (for RC Method)

These are concrete tasks the RC Method should include during the build:

1. **[OBSERVABILITY] Install error tracking SDK** — Integrate [tool] with error boundaries on all API routes
2. **[OBSERVABILITY] Add analytics events** — Instrument key user flows with event tracking
3. **[OBSERVABILITY] Configure dashboards** — Create ops + product dashboards in [tool]
4. **[OBSERVABILITY] Set up alerts** — Configure critical and warning alert rules
5. **[OBSERVABILITY] Add structured logging** — JSON logging with correlation IDs on all API endpoints
6. **[OBSERVABILITY] Configure session recording** — Set up [tool] with sampling rules for key flows
