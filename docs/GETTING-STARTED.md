# Getting Started with RC Engine

This guide covers two ways to use RC Engine:
1. **Web UI** (recommended for most users) - guided wizard, visual interface
2. **MCP Server** (for developers) - integrate with Claude Code, Cursor, etc.

---

## Prerequisites

- **Node.js 18+** - download from https://nodejs.org (LTS recommended). Verify with `node --version`.
- **npm** - included with Node.js. Verify with `npm --version`.
- **2GB+ free disk space** - for dependencies and project outputs.
- **Internet connection** - required for API calls, market research, and `npm install`.

---

## Quick Start: Web UI (5 minutes)

### 1. Install

```bash
git clone https://github.com/originalrashmi/rc-engine-product-framework.git rc-engine
cd rc-engine
npm install
```

> `npm install` downloads dependencies (~1GB). If it fails, check your Node.js version (`node --version` must be 18+) and available disk space.

### 2. Configure API Keys

Create a `.env` file in the project root:

```bash
# Required (at least one):
ANTHROPIC_API_KEY=sk-ant-...

# Optional (enhances specific capabilities):
OPENAI_API_KEY=sk-...
GOOGLE_GEMINI_API_KEY=...
PERPLEXITY_API_KEY=pplx-...

# Web server config (optional):
RC_WEB_PORT=3100
```

| Provider | Used For | Required? |
|----------|----------|-----------|
| Anthropic (Claude) | Architecture, code generation, reasoning | **Required** for autonomous mode |
| Perplexity | Real-time market research (web search) | Recommended |
| Gemini | Fast classification, extraction (free tier) | Optional (saves cost) |
| OpenAI | UX analysis, content generation | Optional |

**Passthrough mode (zero API cost):** Skip all API keys and RC Engine generates structured prompts that you copy into any AI tool (ChatGPT, Claude.ai, Gemini, etc.) and paste the results back. Same methodology, more manual work.

### Cost & Plan Selection

If you're using RC Engine through Claude Code, your Claude subscription (Pro/Max) covers the interactive conversation, while your API keys cover the pipeline's automated work. See the [Usage & Cost Guide](USAGE-AND-COST-GUIDE.md) for detailed plan recommendations and cost estimates. Quick summary: Max 5x ($100/month) is the recommended minimum for regular use.

### 3. Start the Web UI

```bash
npm run web:preview
```

This builds the frontend and starts the server. Open **http://localhost:3100** in your browser.

### 4. Create Your First Project

1. You'll see the landing page - click **Get Started Free**
2. Describe your product idea in plain language
3. Choose **Full Pipeline** (recommended) or **Research Only** or **Build Only**
4. Click **Start Building**
5. The wizard guides you through 9 steps with checkpoints along the way

### 5. What You Get

At the end of the pipeline, you'll have:
- **Requirements Document (PRD)** - 19-section comprehensive spec
- **Visual Designs** - lo-fi/hi-fi wireframes with design tokens
- **Architecture Plan** - tech stack, data model, API design
- **Task Breakdown** - prioritized tasks with dependencies
- **Architecture Diagrams** - dependency, Gantt, and layer views
- **Security Report** - vulnerability scan with plain-language explanations
- **Value Report** - cost/time savings vs. human team
- **Playbook** - consolidated architecture decision record

All files are saved to your projects directory (defaults to `$HOME`, override with `RC_PROJECTS_DIR` in `.env`).

---

## Sharing with Testers

### Option A: Run Locally (Each Tester)

Each tester clones and runs locally:

```bash
git clone https://github.com/originalrashmi/rc-engine-product-framework.git rc-engine
cd rc-engine
npm install
# Add .env with API keys
npm run web:preview
# Open http://localhost:3100
```

### Option B: Deploy to a Server

Deploy to any Node.js host (Render, Railway, Fly.io, AWS, etc.):

```bash
# Build
npm install
npm run web:build

# Run (production)
NODE_ENV=production node --import tsx web/server/index.ts
```

Environment variables to set on your host:
- `ANTHROPIC_API_KEY` (required for autonomous mode)
- `RC_WEB_PORT` (default: 3100)
- `ALLOWED_ORIGINS` (comma-separated list of allowed CORS origins, e.g. `https://your-domain.com`)
- `RC_PROJECTS_DIR` (base directory for project files, defaults to `$HOME`)
- `RC_AUTH_BYPASS=true` (for testing only - bypasses login. Do NOT use in production)

**Authentication:** By default, the web UI uses magic link email auth. Configure email with either:
- `RESEND_API_KEY` (recommended - sign up at https://resend.com)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (any SMTP provider)
- If neither is set, magic links are logged to the server console (development only)

The server is self-contained - no external database, no Redis, no separate services.

### Option C: Docker (Coming Soon)

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install && npm run web:build
ENV RC_WEB_PORT=3100
EXPOSE 3100
CMD ["node", "--import", "tsx", "web/server/index.ts"]
```

---

## Development Mode

For live-reload during development:

```bash
npm run web:dev
```

This runs Vite (frontend) and tsx (server) concurrently with hot reload.

---

## MCP Server Mode (for IDE Integration)

If you want to use RC Engine as an MCP server in Claude Code, Cursor, or another IDE:

### 1. Build

```bash
npm run build
```

### 2. Configure API Keys

Create a `.env` file in the rc-engine directory with your API keys (same format as the Web UI setup above). The MCP server reads `.env` from the project root on startup.

### 3. Configure MCP

Add to your MCP configuration:

```json
{
  "mcpServers": {
    "rc-engine": {
      "command": "node",
      "args": ["/absolute/path/to/rc-engine/dist/index.js"]
    }
  }
}
```

### 4. Available Tools

35 tools across 4 domains -- all available, no restrictions:

| Domain | Tools | Count | Purpose |
|--------|-------|-------|---------|
| Pre-RC | prc_start, prc_classify, prc_run_stage, prc_gate, prc_status, prc_synthesize, prc_stress_test | 7 | 20-persona research pipeline |
| RC Method | rc_start, rc_import_prerc, rc_illuminate, rc_define, rc_architect, rc_sequence, rc_validate, rc_forge_task, rc_connect, rc_compound, rc_gate, rc_save, rc_status | 13 | 8-phase structured build |
| UX | ux_score, ux_audit, ux_generate, ux_design | 4 | UX scoring and design generation |
| Post-RC | postrc_scan, postrc_override, postrc_report, postrc_configure, postrc_gate, postrc_status, postrc_generate_observability_spec | 7 | Security + quality validation |
| Traceability | trace_enhance_prd, trace_map_findings, trace_status | 3 | Requirements coverage |
| Pipeline | rc_pipeline_status | 1 | Cross-domain status |

---

## Pipeline Modes

### Full Pipeline (Default)
Research -> Design -> Architecture -> Build -> Validate -> Ship

Best for: New product ideas where you want comprehensive analysis before building.

### Research Only
Research -> PRD -> Done

Best for: Market research, competitive analysis, or requirements documentation.

### Build Only
Design -> Architecture -> Build -> Validate -> Ship

Best for: When you already have requirements and want to go straight to architecture/build.

---

## Project Structure

Projects are created in your projects directory (see `RC_PROJECTS_DIR`) with this structure:

```
your-project/
  pre-rc-research/       # Research outputs (PRDs, decks, tasks)
  rc-method/             # Build outputs (architecture, tasks, code)
    design/              # Design specs and wireframes
    diagrams/            # Mermaid architecture diagrams
    artifacts/           # Generated code and configs
  post-rc/               # Security scan results
  rc-traceability/       # Requirements coverage mapping
  .rc-engine/            # Runtime state (audit logs, checkpoints)
```

---

## Tips

1. **Start with Research.** Even if you're eager to build, the research phase catches problems that would cost days to fix later.

2. **Use passthrough mode first.** Before committing API spend, try without API keys to see the methodology prompts.

3. **Check the value report.** After each run, see exactly how much time and money RC Engine saved vs. hiring consultants.

4. **Review deliverables.** The PRD, architecture doc, and task list are standalone documents you can share with stakeholders.

5. **Iterate on design.** Try 3 design options instead of 1 - the AI recommendation based on your target users is often insightful.

---

## Advanced Configuration

### Model Overrides

RC Engine selects default models for each provider. Override them via environment variables:

```bash
CLAUDE_MODEL=claude-sonnet-4-5-20250929    # Default
OPENAI_MODEL=gpt-4o                        # Default
GEMINI_MODEL=gemini-2.0-flash              # Default
PERPLEXITY_MODEL=sonar-pro                 # Default
MAX_TOKENS=16384                           # Max response tokens
```

### Token Usage Tracking

RC Engine tracks token usage across every pipeline phase. Check usage anytime:
- **Per-domain:** Each status tool (`prc_status`, `rc_status`, `postrc_status`, `trace_status`) shows AI usage for that domain
- **Cross-domain:** `rc_pipeline_status` shows cumulative usage by domain and provider
- **Persistent:** Usage is written to `.rc-engine/PIPELINE.md` in your project directory after every API call

See the [Usage & Cost Guide](USAGE-AND-COST-GUIDE.md) for cost estimates by pipeline phase.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `npm install` fails | Verify Node.js 18+ (`node --version`). Check disk space (need 2GB+). |
| Gemini key not working | Use `GOOGLE_GEMINI_API_KEY` in `.env` (not `GOOGLE_API_KEY`). |
| "No API key" errors | Verify `.env` is in the rc-engine root directory and restart the session. |
| MCP tools not appearing | Run `npm run build` first. Verify the path in your MCP config is absolute. |
| Rate limited on Claude Code | Switch to `/effort low` for checkpoint approvals. See [Usage & Cost Guide](USAGE-AND-COST-GUIDE.md). |
| Magic links not sending | Configure `RESEND_API_KEY` or SMTP vars. Without email config, links print to server console. |
| Project files not found | Check `RC_PROJECTS_DIR` in `.env`. Default is `$HOME`. |
