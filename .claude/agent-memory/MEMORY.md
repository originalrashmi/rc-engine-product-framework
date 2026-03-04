# RC Engine -- Agent Memory

This file is loaded at the start of every Claude Code session (first 200 lines).
It contains stable patterns, conventions, and lessons learned across sessions.

## Project Identity

- **Name:** RC Engine
- **Author:** Toerana
- **Purpose:** AI-native structured software development pipeline
- **Architecture:** MCP server with 32 tools across 4 domains
- **Language:** TypeScript (strict mode)
- **Build:** `tsc` -> `dist/`

## Repository Structure

```
src/
  core/         -> v2 infrastructure (graph, checkpoint, sandbox, llm, budget, observability, value, plugins, learning, deployment, docs, benchmark, pricing)
  domains/
    pre-rc/     -> 6 tools (prc_*) -- 20-persona research pipeline
    rc/         -> 14 tools (rc_*, ux_*) -- 8-phase build method
    post-rc/    -> 7 tools (postrc_*) -- security scan + ship gate
    traceability/ -> 3 tools (trace_*) -- requirement coverage
  shared/
    llm/        -> 4 LLM clients (Claude, OpenAI, Gemini, Perplexity)
    config.ts   -> API keys from env
    token-tracker.ts -> Usage tracking
    tool-guard.ts -> Path validation + input size limits for all tools
tests/
  agent-eval/   -> 33 tool-selection tests
  core/         -> graph (31), checkpoint (31), sandbox (51), budget (43), observability (33), pricing (19), + more
  domains/      -> design-types (16), design-agent-parsing (8), diagrams (15), pdf-export (19), playbook (12)
knowledge/      -> Pro methodology files (installed separately via rc-engine-pro)
web/
  server/       -> Express API + WebSocket (MCP bridge via InMemoryTransport) + auth.ts
  src/          -> React + TailwindCSS v4 frontend (Vite build)
docs/           -> Workshop deck, architecture diagrams, roadmap
.claude/        -> Agent definitions, hooks, rules, memory
.github/        -> CI workflows
.rc-engine/     -> Runtime: audit logs, cache, logs (gitignored)
```

## Key Conventions

- All state persistence goes through domain-specific state managers
- Pre-RC and Post-RC use JSON-in-HTML-comment serialization (async fs)
- RC Method uses regex-parsed markdown (sync fs) -- KNOWN FRAGILE
- Gates require explicit user approval -- never auto-approve
- Each domain writes ONLY to its designated directory
- LLM calls use shared `llmFactory` singleton with provider routing
- All 31 tools guarded: path validation + input size limits (tool-guard.ts)
- **No em-dashes or emojis in UI/UX/docs/agent messages** (user preference)
- Use double-dashes (--) instead of em-dashes everywhere user-facing

## Brand

- **Colors:** Navy `#0D1B2A`, Gold `#C9A962`, Teal `#2D9CDB`
- **Fonts:** Instrument Serif (display), Inter (body), JetBrains Mono (code)

## Git Strategy

- `main` -- stable releases (DO NOT push directly, user may move to new repo)
- `v2` -- active development branch
- All new work goes to `v2` only

## Pricing Model (Hybrid)

4 tiers defined in `src/core/pricing/tiers.ts`:
- Free: $0, 1 project/mo, research only, hard limit
- Starter: $29/mo ($24 annual), 5 projects/mo, full pipeline, $0.50 overage
- Pro: $79/mo ($66 annual), unlimited, 3 design options, playbook, API
- Enterprise: custom, team seats, SSO, webhooks
Users bring their own API keys (no markup on LLM costs).
`UsageMeter` in `src/core/pricing/meter.ts` tracks per-user consumption.

## Auth Layer

- `web/server/auth.ts` -- magic link auth (email + token), SQLite-backed
- Dev bypass: `RC_AUTH_BYPASS=true` ONLY (NODE_ENV check removed for security)
- Session cookie: `rc_session` (30-day expiry, secure flag in production)
- Middleware: `authMiddleware` (attaches user), `requireAuth` (blocks 401)
- Organization/team seats: `organizations` + `org_invites` tables
- User roles: owner, admin, member

## Billing

- `web/server/billing.ts` -- Stripe integration
- Checkout sessions for tier upgrades (Starter/Pro)
- Webhook handler for subscription lifecycle events
- Env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`

## Email

- `web/server/email.ts` -- magic link email transport
- Providers: Resend (RESEND_API_KEY), SMTP (SMTP_HOST), console fallback
- Branded HTML template matching navy/gold design

## Web UI Architecture

- 6 pages: Landing, Dashboard, Pipeline, Wizard, ValueReport, Settings
- 13 components: Layout, DesignOptionCard, DesignPreview, DiagramTabs, ValueDisplay, etc.
- 9-step wizard: Idea -> Team -> Research -> Results -> Design -> Architecture -> Building -> Security -> Complete
- Session persistence via sessionStorage (4-hour expiry, auto-save on step change)
- Back navigation between wizard steps
- First-time users see Landing page; returning users go to Dashboard

## Design System (ux_design tool)

- Generates 1 or 3 design options with ICP-based recommendation
- Each option: DesignSpec JSON + lo-fi/hi-fi HTML wireframes per screen
- Files saved to `rc-method/design/option-{a,b,c}/`
- Design-to-build bridge: selected spec loaded into architect/forge prompts

## Tier Enforcement

- `web/server/index.ts` -- tool-level tier check before MCP call
- TOOL_FEATURE_REQUIREMENTS maps tool names to required TierFeatures
- Free tier: research only (prc_* tools), no build/design/security
- Skipped in dev bypass mode

## Docker

- `Dockerfile` -- multi-stage (build + production), non-root user, healthcheck
- `docker-compose.yml` -- single service, `./data` volume for persistence
- `.dockerignore` -- excludes node_modules, .git, secrets

## Wizard Bug Fixes Applied

- Stage names: `stage-2-user-intelligence`, `stage-3-business-market` (match ResearchStage enum)
- Build Only mode: calls `rc_start` with `description`, auto-approves phases 1-2
- Persona IDs match backend PersonaId enum
- Persona toggles wire through to `configurePersonas` API endpoint
- Error retry buttons on all wizard failure states

## Security Hardening (applied)

- `helmet` for security headers (CSP, X-Frame-Options, etc.)
- `express-rate-limit` on /auth/login (10 req/15 min)
- CORS restricted to same-origin + ALLOWED_ORIGINS env var
- `requireAuth` middleware on all sensitive API routes
- WebSocket connections require valid session cookie
- `validateProjectPath()` on all project-scoped endpoints
- Stripe redirect URLs validated as same-origin
- Directory traversal blocked on /api/projects

## Repository

- **GitHub:** `originalrashmi/rc-engine-product-framework` (origin remote)
- `main` -- stable releases
- `v2` -- active development

## Current State

- 536 tests passing, 28 test files, 31 MCP tools
- All 13 shared wrappers fully connected (zero dead code)
- dist/ built and ready for MCP

## Deployment Requirements (for sharing)

Server needs:
- Node.js 18+
- At least ANTHROPIC_API_KEY in .env for autonomous mode
- `npm run web:preview` starts Express on port 3100
- SQLite for auth + state (in-process, auto-created in .rc-engine/)
- Docker: `docker compose up -d` (self-contained)
- Optional: Stripe keys for billing, Resend/SMTP for email

## Topic Files

- See `debugging.md` for recurring issues and fixes
- See `patterns.md` for architectural decisions
