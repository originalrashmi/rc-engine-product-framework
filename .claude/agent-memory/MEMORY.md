# RC Engine - Agent Memory

This file is loaded at the start of every Claude Code session (first 200 lines).
It contains stable patterns, conventions, and lessons learned across sessions.

## Project Identity

- **Name:** RC Engine
- **Author:** Toerana
- **Purpose:** AI-native structured software development pipeline
- **Architecture:** MCP server with 52 tools across 4 domains
- **Language:** TypeScript (strict mode)
- **Build:** `tsc` -> `dist/`
- **Edition:** Community (all features, no tier gating, open source)

## Repository Structure

```
src/
  core/         -> Infrastructure (graph, checkpoint, sandbox, llm, budget, observability, value, plugins, learning, deployment, docs, benchmark, pricing)
  domains/
    pre-rc/     -> 7 tools (prc_*) - 20-persona research pipeline
    rc/         -> 33 tools (rc_*, ux_*, copy_*, design_*, playbook_*, pdf_*) - 8-phase build + design + copy + export
    post-rc/    -> 7 tools (postrc_*) - security scan + ship gate
    traceability/ -> 3 tools (trace_*) - requirement coverage
  shared/
    llm/        -> 4 LLM clients (Claude, OpenAI, Gemini, Perplexity)
    config.ts   -> API keys from env
    token-tracker.ts -> Usage tracking
    tool-guard.ts -> Path validation + input size limits for all tools
    tier-capabilities.ts -> Always returns full capabilities (community edition)
  tools/
    rc-init.ts  -> Unified entry point (1 tool)
tests/
  agent-eval/   -> 33 tool-selection tests
  core/         -> graph (31), checkpoint (31), sandbox (51), budget (43), observability (33), pricing (12), + more
  domains/      -> design-types (16), design-agent-parsing (8), diagrams (15), pdf-export (19), playbook (12)
knowledge/      -> Methodology files (personas, phase skills, security databases)
web/
  server/       -> Express API + WebSocket (MCP bridge via InMemoryTransport) + auth.ts
  src/          -> React + TailwindCSS v4 frontend (Vite build)
docs/           -> Starter guide, architecture, quickstart, getting started
.claude/        -> Agent definitions, hooks, rules, memory
.github/        -> CI workflows
.rc-engine/     -> Runtime: audit logs, cache, logs (gitignored)
```

## Key Conventions

- All state persistence goes through domain-specific state managers
- Pre-RC and Post-RC use JSON-in-HTML-comment serialization (async fs)
- RC Method uses regex-parsed markdown (sync fs) - KNOWN FRAGILE
- Gates require explicit user approval - never auto-approve
- Each domain writes ONLY to its designated directory
- LLM calls use shared `llmFactory` singleton with provider routing
- All 52 tools guarded: path validation + input size limits (tool-guard.ts)
- **No em-dashes or emojis in UI/UX/docs/agent messages** (user preference)
- Use double-dashes (--) instead of em-dashes everywhere user-facing

## Brand

- **Colors:** Navy `#0D1B2A`, Gold `#C9A962`, Teal `#2D9CDB`
- **Fonts:** Instrument Serif (display), Inter (body), JetBrains Mono (code)

## Git Strategy

- `main` - active development (single branch)
- All work on `main`

## Auth Layer

- `web/server/auth.ts` - magic link auth (email + token), SQLite-backed
- Dev bypass: `RC_AUTH_BYPASS=true` ONLY (NODE_ENV check removed for security)
- Session cookie: `rc_session` (30-day expiry, secure flag in production)
- Middleware: `authMiddleware` (attaches user), `requireAuth` (blocks 401)
- Organization/team seats: `organizations` + `org_invites` tables
- User roles: owner, admin, member

## Email

- `web/server/email.ts` - magic link email transport
- Providers: Resend (RESEND_API_KEY), SMTP (SMTP_HOST), console fallback
- Branded HTML template matching navy/gold design

## Web UI Architecture

- 6 pages: Landing, Dashboard, Pipeline, Wizard, ValueReport, Settings
- 13 components: Layout, DesignOptionCard, DesignPreview, DiagramTabs, ValueDisplay, etc.
- 9-step wizard: Idea -> Team -> Research -> Results -> Design -> Architecture -> Building -> Security -> Complete
- Session persistence via sessionStorage (4-hour expiry, auto-save on step change)
- `npm run web` starts dev server on port 3100

## Design System (ux_design tool)

- Generates 1 or 3 design options with ICP-based recommendation
- Each option: DesignSpec JSON + lo-fi/hi-fi HTML wireframes per screen
- Files saved to `rc-method/design/option-{a,b,c}/`
- Design-to-build bridge: selected spec loaded into architect/forge prompts

## Docker

- `Dockerfile` - multi-stage (build + production), non-root user, healthcheck
- `docker-compose.yml` - single service, `./data` volume for persistence
- `.dockerignore` - excludes node_modules, .git, secrets

## Security Hardening (applied)

- `helmet` for security headers (CSP, X-Frame-Options, etc.)
- `express-rate-limit` on /auth/login (10 req/15 min)
- CORS restricted to same-origin + ALLOWED_ORIGINS env var
- `requireAuth` middleware on all sensitive API routes
- WebSocket connections require valid session cookie
- `validateProjectPath()` on all project-scoped endpoints
- Directory traversal blocked on /api/projects

## Repository

- **GitHub:** `originalrashmi/rc-engine-product-framework` (origin remote)
- `main` - active development

## Current State

- 587 tests passing, 32 test files, 52 MCP tools
- All shared wrappers fully connected (zero dead code)
- dist/ built and ready for MCP

## Deployment Requirements

Server needs:
- Node.js 18+
- At least ANTHROPIC_API_KEY in .env for autonomous mode
- `npm run web` starts Express on port 3100
- SQLite for auth + state (in-process, auto-created in .rc-engine/)
- Docker: `docker compose up -d` (self-contained)
- Optional: Resend/SMTP for email

## Topic Files

- See `debugging.md` for recurring issues and fixes
- See `patterns.md` for architectural decisions
