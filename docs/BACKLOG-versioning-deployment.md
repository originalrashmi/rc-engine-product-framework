# RC Engine Product Framework - Product Backlog

Items identified during product framework consolidation (2026-03-01).
These are NOT yet built - they are backlog items for future implementation.

## P0: First-Run Setup Experience (LAUNCH BLOCKER)

Found during self-validation: a non-technical user cannot get the engine running.

### 0.1 Guided API Key Setup
- [ ] Create `.env.example` with all keys, descriptions, and where to get them
- [ ] Add startup validation that checks for required keys and prints plain-language guidance
- [ ] Add `rc-engine setup` CLI command or interactive wizard that walks through key creation
- [ ] Web UI: add a setup/onboarding page that detects missing keys and guides configuration
- [ ] Error messages must be non-technical: "I need access to an AI service to run research. Let me help you set that up." - not "No LLM provider available. gemini and Claude fallback both unconfigured."

### 0.2 Secrets Guard vs Setup Paradox
- [ ] The secrets guard blocks the agent from helping users create or check their `.env` file
- [ ] Add an exception path: agent can CREATE a `.env` template (without values) but never READ one
- [ ] Or: move setup guidance entirely to web UI where the guard doesn't apply

### 0.3 Passthrough Mode UX
- [ ] When no keys are configured, passthrough mode should be clearly explained in non-technical terms
- [ ] Passthrough prompts should be formatted for easy copy-paste into ChatGPT/Claude.ai
- [ ] Add a "run this prompt" button in the web UI for passthrough mode

### 0.4 Onboarding Flow Fix
- [ ] Onboarding must check for API keys BEFORE attempting any tool call - not after failure
- [ ] Onboarding must explain what each key does in plain language (not provider names)
- [ ] Onboarding must offer a "no keys" path that works without friction

## Priority 1: Versioning Infrastructure

### 1.1 Semantic Versioning
- [ ] Configure semantic versioning in package.json (currently hardcoded at 1.0.0)
- [ ] Implement automated version bumping (release-please or semantic-release)
- [ ] Add git tagging strategy (vX.Y.Z on every release)
- [ ] Create CHANGELOG.md with automated generation

### 1.2 Release Automation
- [ ] Add GitHub Actions release workflow (trigger on merge to main)
- [ ] Auto-generate release notes from conventional commits
- [ ] Tag Docker images with version numbers (not just latest)
- [ ] Create GitHub Releases with download artifacts
- [ ] Enforce conventional commits via commitlint

## Priority 2: Deployment Pipeline

### 2.1 CI/CD Enhancement
- [ ] Add Docker image build and push to CI workflow
- [ ] Add security scanning (SAST, dependency audit) to CI
- [ ] Add code coverage reporting to CI
- [ ] Add deployment steps (staging then production)
- [ ] Add smoke test after deployment

### 2.2 Environment Management
- [ ] Create environment-specific configs (dev, staging, production)
- [ ] Add environment validation on startup (required vars checked)
- [ ] Document all environment variables in .env.example with descriptions
- [ ] Add config for different deployment targets

### 2.3 Infrastructure-as-Code
- [ ] Evaluate deployment targets (self-hosted Docker, cloud PaaS, Kubernetes)
- [ ] Create deployment documentation (DEPLOYMENT.md)
- [ ] Create production runbook (monitoring, scaling, disaster recovery)
- [ ] Add health check and readiness probe endpoints

## Priority 3: Repository Governance

### 3.1 Branch Protection
- [ ] Configure branch protection rules on main (require reviews, CI pass)
- [ ] Add PR template (.github/pull_request_template.md)
- [ ] Add CODEOWNERS file
- [ ] Document merge strategy (squash vs merge commit)

### 3.2 Contributing Guidelines
- [ ] Create CONTRIBUTING.md with PR process and commit conventions
- [ ] Add issue templates (.github/ISSUE_TEMPLATE/)
- [ ] Document branching strategy and naming conventions

## Priority 4: Monitoring & Observability

### 4.1 Production Monitoring
- [ ] Evaluate monitoring stack (self-hosted vs SaaS: Datadog, Grafana, etc.)
- [ ] Add application metrics endpoint
- [ ] Configure alerting for critical failures
- [ ] Add structured logging for production

## Priority 5: Research Output Quality (GTM Self-Analysis Findings)

Found during RC Engine self-analysis (2026-03-02). The Pre-RC research pipeline
produces solid market data but lacks actionable depth for non-technical founders.

### 5.1 Revenue Path Modeling
- [ ] Research output must include step-by-step revenue path (not just a TAM number)
- [ ] Show: "If you price at $29, and acquire X users/month at Y conversion, you reach $Z revenue by month N"
- [ ] Include multiple pricing scenarios (freemium, credit-based, flat subscription) with projected outcomes
- [ ] Include specific actions the founder must take at each stage (not just "community seeding" - what communities, what message, what frequency)
- [ ] Revenue projections must show assumptions clearly and let the founder adjust inputs

### 5.2 Cost of Goods / Margin Analysis
- [ ] Research must estimate hosting infrastructure costs for SaaS delivery
- [ ] Include LLM API cost per user per month (based on average usage patterns)
- [ ] Calculate gross margin at each pricing tier
- [ ] Flag if a pricing tier is unprofitable (e.g., low-tier plan with hosted infra may lose money)
- [ ] Compare self-hosted vs managed hosting cost structures

### 5.3 Growth Playbook with Actions
- [ ] Research output must include a concrete growth playbook, not just "growth flywheel" theory
- [ ] Each channel (Product Hunt, communities, content, partnerships) needs: specific actions, timeline, expected outcomes, cost
- [ ] Include a 90-day launch plan with week-by-week milestones
- [ ] Identify specific communities and forums where target users gather (not just "Reddit")
- [ ] Include template messaging for each channel

### 5.4 Founder-Friendly Presentation
- [ ] Research findings must be understandable by non-technical founders
- [ ] Avoid requiring the founder to "validate" technical research accuracy they cannot assess
- [ ] Gate 2 checkpoint should present findings as actionable recommendations, not raw analysis
- [ ] Include a "what this means for you" summary after each specialist's output
- [ ] Financial projections should be interactive or scenario-based, not single-point estimates

### 5.5 Amazon PR/FAQ Working-Backwards Framework
- [ ] Add a "Working Backwards" output mode to research synthesis
- [ ] Generate a press release for the product as if launched (forces clarity on value proposition)
- [ ] Generate FAQ addressing every founder/investor/user objection
- [ ] Include customer letter describing the problem and how the product solves it

### 5.6 New Business Execution Personas (Missing from Current 20)
The current 20 research personas are product/technical-weighted. Non-technical founders need operational planning personas:
- [ ] **CFO / Financial Analyst**: Burn rate modeling, unit economics per pricing tier, break-even analysis, runway projections, cost-per-user (hosting + LLM API + support), margin analysis
- [ ] **Growth Strategist**: Channel-by-channel predictive model ("post in X community 3x/week for 12 weeks = Y signups at Z% conversion = $W MRR"), acquisition cost per channel, viral coefficient estimation
- [ ] **CEO / Operations Lead**: 90-day GTM action plan with week-by-week tasks, owners, budgets, KPIs. Synthesis of all specialist outputs into executable plan
- [ ] **Sales Strategist**: ICP definition, outreach templates, demo scripts, objection handling playbook, pipeline metrics
- [ ] **Marketing Director**: Content calendar, SEO keyword strategy, paid acquisition budget allocation, partnership outreach plan, brand positioning
- [ ] **Infrastructure Cost Analyst**: Per-user hosting costs, LLM API costs per pipeline run, scaling curves, break-even on self-hosted vs managed

### 5.7 Plain-Language Error Handling for API Failures
- [ ] Detect "out of credits" vs "rate limited" vs "key revoked" specifically
- [ ] Show plain-language messages: "Your Anthropic account needs more credits. Add funds at console.anthropic.com"
- [ ] Explain fallback behavior: "I'll continue using a different AI service"
- [ ] Proactive warning before expensive operations if credit balance is low

## Priority 6: GTM Ship Blockers (from Pipeline Self-Test)

Found by running RC Engine through its own pipeline (2026-03-04). These are issues
in the generated web UI code that must be resolved before web deployment.

### 6.1 Security Fixes
- [ ] Fix SQL injection vulnerabilities - parameterize all queries (5 instances in forge outputs)
- [ ] Add authorization middleware to project, gate, and state endpoints (SEC-003, SEC-004, SEC-005)
- [ ] Replace Math.random() with crypto.randomUUID() for token generation (SEC-002)
- [ ] Sanitize error messages to prevent internal detail leakage (SEC-006, SEC-007)
- [ ] Add client-side security event logging for failed auth attempts (SEC-008)

### 6.2 Monitoring & Observability
- [ ] Add error tracking integration (Sentry free tier or equivalent) (MON-002 - critical)
- [ ] Define observability requirements in PRD template (MON-001)
- [ ] Add observability tasks to default task generation (MON-003)
- [ ] Define SLO targets for pipeline operations (MON-004)
- [ ] Add structured logging (Pino or Winston)
- [ ] Add health check endpoint

### 6.3 Integration Gaps
- [ ] Create missing database migration: `magic_link_tokens` table
- [ ] Create missing database migration: `email_deliveries` table
- [ ] Create missing database migration: `gate_metrics_snapshots` table
- [ ] Consolidate `magic_tokens` vs `magic_link_tokens` table naming
- [ ] Wire SendGrid webhook route to app router

### 6.4 Pipeline Improvements (Self-Test Findings)
- [x] Fix forge artifact tracking in state (Bug #1 - fixed)
- [x] Fix lineRange parsing in Post-RC scanner (Bug #2 - fixed)
- [ ] Investigate Connect/Compound tool discovery after MCP server restart (Bug #3)
- [x] Fix streaming timeout on large synthesis calls (Bug #4 - fixed)
- [ ] Add guided decision cards for operational choices in Validate phase
- [ ] Improve Post-RC scan to handle large codebases (currently scans ~15%)

## Priority 7: Community Seeding (GTM Phase 1)

Target: 1,000 GitHub stars, 500 MCP installs, 50 Pro knowledge file sales.

### 7.1 Content & Examples
- [ ] Create `/examples` directory with 3-5 complete project walkthroughs
- [ ] Create 3-minute video demo: Claude Code + RC Engine building an app from idea to Docker
- [ ] Publish 4 technical blog posts (bi-weekly):
  1. "Why AI code editors fail on large projects"
  2. "Multi-LLM orchestration: Routing to Claude, GPT-4, Gemini, Perplexity"
  3. "Building an MCP server: 35 tools and 578 tests"
  4. "Requirements traceability in AI-generated code"

### 7.2 Distribution
- [ ] Submit to Anthropic MCP marketplace
- [ ] Submit to Cursor/Windsurf plugin directories
- [ ] Monitor GitHub issues daily, respond within 24 hours
- [ ] Launch "Methodology Council" (10 core contributors) at week 9
- [ ] First monthly "Office Hours" live stream at week 9

## Priority 8: Web UI & SaaS (GTM Phase 2)

Target: 2,000 Free signups, 120 paying customers, $14,400 MRR.
These are the 9 forge tasks from the pipeline self-test.

### 8.1 Infrastructure
- [ ] Database schema (T-F01): users, sessions, projects, project_state, gates
- [ ] Magic link auth (T-F02): SendGrid email, token validation, session creation
- [ ] Session management (T-F03): middleware, cleanup job, multi-device
- [ ] GDPR deletion (T-F04): 30-day grace period, hard deletion at 90 days
- [ ] Gate state machine (T-F05): evaluation, approval, phase advancement

### 8.2 UI Components
- [ ] Gate failure dialog (T-C01): user-facing error explanation
- [ ] Metrics service (T-C02): PostHog export, gate approval rates
- [ ] Project wizard (T-C03): one-click project creation
- [ ] Email integration (T-I01): SendGrid client, webhook handler

### 8.3 Growth Execution
- [ ] Create 12 SEO landing pages targeting founder search intent
- [ ] Stripe payment integration for Pro ($79/mo) tier
- [ ] Free tier onboarding: email signup -> survey -> project wizard -> research phase

---

## Status

| Category | Current State | Target State |
|----------|--------------|--------------|
| **First-run setup** | **No guidance, fails silently** | **Guided wizard, plain-language errors** |
| Versioning | Hardcoded 1.0.0, no tags | Automated semver with CHANGELOG |
| CI/CD | Basic (test + lint) | Full pipeline with deploy |
| Docker | Ready but unversioned | Tagged images, registry push |
| IaC | None | Deployment docs + scripts |
| Branch protection | None | Required reviews + CI checks |
| Monitoring | Health endpoint only | Full observability |
| **Security** | **5 SQL injection, 3 missing auth** | **All parameterized, all endpoints protected** |
| **GTM** | **CLI/MCP only** | **GitHub seeding -> Web UI -> Product Hunt** |
| **Pipeline bugs** | **3 of 4 fixed** | **All fixed** |
