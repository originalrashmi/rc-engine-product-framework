# RC Engine Starter Guide

**Results through Clarity** - an AI-native product development pipeline

> **Version:** 1.0.0 | **Tools:** 52 | **Domains:** 4 | **Gates:** 12 | **License:** MIT

---

## 01 - What is RC Engine?

RC Engine takes a product idea - even a single sentence - and walks it through a structured development pipeline: research, architecture, build, validation, and traceability. It uses 52 orchestrated AI tools behind the scenes so you can focus on your product, not the process.

Up to 20 specialized AI analysts research your idea before a single line of code is written. They cover market fit, user needs, technical feasibility, security, UX, and more. Then the engine designs the architecture, builds task by task, and scans for security and legal issues before shipping.

You approve every step. Nothing moves forward without your sign-off.

---

## 02 - Choose Your Path

Pick the way that fits how you work. Both paths use the same pipeline and produce the same deliverables.

### Path A: Web UI

**Setup time:** 2 minutes

Run `npm run web:dev` locally. Open the dashboard in your browser. Describe your idea. Follow the guided steps.

- Visual pipeline with progress tracking
- Download deliverables from the dashboard
- Runs locally on your machine
- Works on any device with a browser

### Path B: MCP Server

**Setup time:** 10 minutes

Install RC Engine locally and connect it to your IDE. Chat naturally - the AI calls the right tools for you.

- Runs inside Claude Code, Cursor, or any MCP IDE
- Conversational interface
- Full control over every tool call
- Everything stays on your machine

---

## 03 - Path A: Web UI

### 1. Start the Web UI

Run `npm run web:dev` from your RC Engine directory, then open **http://localhost:3100** in your browser.

### 2. Sign In

1. Enter your email address
2. Click Continue
3. You land on the dashboard

### 3. Start Your First Project

1. Click **New Project**
2. Describe your product idea in plain language - a single sentence is enough
3. Choose how much of the pipeline to run:
   - **Full Pipeline** - Research, Design, Architecture, Build, Validate, Ship
   - **Research Only** - Market analysis and a complete requirements document
   - **Build Only** - Skip research, jump to architecture and build
4. Follow the guided steps. At each checkpoint, review what was produced and approve before moving on.

### 4. Download Your Deliverables

When the pipeline completes (or at any stage), download your deliverables directly from the dashboard - requirements document, architecture plan, task breakdown, security report, and more.

That's it. No terminal, no configuration, no API keys to manage.

---

## 04 - Path B: MCP Server (IDE Integration)

### 1. Prerequisites

- **Node.js 18+** - download from [nodejs.org](https://nodejs.org). Check with `node --version`.
- **Claude Code, Cursor, or another MCP-compatible IDE**
- **An Anthropic API key** - sign up at [console.anthropic.com](https://console.anthropic.com)

### 2. Install

```bash
git clone https://github.com/originalrashmi/rc-engine-product-framework.git rc-engine
cd rc-engine
npm install && npm run build
```

### 3. Add Your API Keys

Create a file called `.env` in the rc-engine folder:

```
# Required - powers core reasoning and architecture
# Get yours at https://console.anthropic.com
ANTHROPIC_API_KEY=sk-ant-paste_your_key_here

# Recommended - enables live market and competitor research
# Get yours at https://perplexity.ai/settings/api
PERPLEXITY_API_KEY=pplx-paste_your_key_here

# Optional - fast classification (free tier)
GOOGLE_GEMINI_API_KEY=paste_your_key_here

# Optional - UX and content analysis
OPENAI_API_KEY=sk-paste_your_key_here
```

| Service | What It Powers | Required? | Typical Cost |
|---------|---------------|-----------|-------------|
| **Anthropic (Claude)** | Core reasoning, architecture, code generation | Yes | $1-5 per project |
| **Perplexity** | Live market research and competitor data | Recommended | $0.50-2 per project |
| **Google Gemini** | Fast classification tasks | Optional | Free tier |
| **OpenAI** | UX and content analysis | Optional | Minimal |

**No API keys?** RC Engine works in manual mode - it generates structured prompts you copy into any AI tool (ChatGPT, Claude.ai, Gemini) and paste the results back. Same methodology, more hands-on.

This `.env` file is private - it is listed in `.gitignore` and will never be shared or uploaded.

### 4. Connect to Your IDE

**Claude Code**

Add to `~/.claude/settings.json`:

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

**Cursor**

Add to `.cursor/mcp.json` in your project:

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

Replace the path with the actual location where you cloned the repo. To find it, open your terminal in the rc-engine folder and run:

```bash
# Mac/Linux
echo "$(pwd)/dist/index.js"

# Windows
echo %cd%\dist\index.js
```

Copy the output and paste it into the `args` array.

### 5. Start Building

Open your IDE and describe what you want to build:

> *"I want to build a SaaS dashboard for tracking marketing spend across channels."*

The AI orchestrates the full pipeline - calling tools, presenting results, and pausing at checkpoints for your approval. You never need to call tools directly.

---

## 05 - The Pipeline

Whichever path you choose, RC Engine runs your idea through this structured process:

```
IDEA
 |
 v
Pre-RC Research (7 tools)
 |  Up to 20 AI specialists: market, users, security, UX, legal, technical
 |  CHECKPOINT 1: Approve research scope
 |  CHECKPOINT 2: Approve mid-research findings
 |  CHECKPOINT 3: Approve final research
 v
Requirements Document (19-section PRD)
 |
 v
Idea Stress Test (optional)
 |  VC-level viability challenge: GO / NO-GO / CONDITIONAL
 v
RC Method Build (33 tools across 8 phases)
 |  Phase 1: Illuminate (discovery questions)
 |  Phase 2: Define (requirements + UX scoring)
 |    --> Design Intelligence: wireframes, brand, design challenge
 |    --> Copy Engine: content strategy, generation, critique
 |  Phase 3: Architect (tech stack, data model, APIs)
 |  Phase 4: Sequence (task ordering with dependencies)
 |  Phase 5: Validate (quality checks before building)
 |  Phase 6: Forge (build task by task with code generation)
 |  Phase 7: Connect (integration verification)
 |  Phase 8: Compound (production hardening assessment)
 |  CHECKPOINTS 4-11: One gate between each phase
 v
Post-RC Validation (7 tools)
 |  Security scan (OWASP patterns)
 |  Application security audit
 |  Monitoring readiness check
 |  Edge case analysis
 |  Legal compliance review
 |  CHECKPOINT 12: Ship / Fix / Accept Risk
 v
Traceability (3 tools)
 |  Requirements-to-code coverage mapping
 |  Orphan detection
 v
SHIP (production-ready, full audit trail)
```

**12 checkpoints total.** You are in control at every one. Nothing moves forward without your approval.

---

## 06 - Complete Tool Inventory

### Pre-RC Research (7 tools)

| Tool | Purpose |
|------|---------|
| `prc_start` | Initialize a new research project |
| `prc_classify` | Assess product complexity (Cynefin framework) |
| `prc_run_stage` | Run a research stage with activated specialists |
| `prc_gate` | Research quality checkpoints (Gates 1-3) |
| `prc_status` | View research progress and findings |
| `prc_synthesize` | Combine all research into 19-section PRD |
| `prc_stress_test` | VC-level idea viability challenge (GO/NO-GO) |

### RC Method Build (33 tools)

**Phase Tools (12)**

| Tool | Phase | Purpose |
|------|-------|---------|
| `rc_start` | -- | Start build pipeline directly (skip Pre-RC) |
| `rc_import_prerc` | -- | Import Pre-RC research into build pipeline |
| `rc_illuminate` | 1 | Deep discovery questions about the problem space |
| `rc_define` | 2 | Generate requirements document with UX scoring |
| `rc_architect` | 3 | Design technical architecture |
| `rc_sequence` | 4 | Create prioritized task plan with dependencies |
| `rc_validate` | 5 | Run quality checks before building |
| `rc_forge_task` | 6 | Build a single task (generates code files) |
| `rc_forge_all` | 6 | Build all pending tasks in sequence |
| `rc_connect` | 7 | Verify integration across all built components |
| `rc_compound` | 8 | Production hardening assessment |
| `rc_autopilot` | -- | Run remaining phases automatically with gate checks |

**Gate and Status Tools (4)**

| Tool | Purpose |
|------|---------|
| `rc_gate` | Phase approval checkpoint |
| `rc_save` | Save generated artifacts |
| `rc_status` | View build progress |
| `rc_reset` | Reset pipeline state (with confirmation) |

**UX Tools (5)**

| Tool | Purpose |
|------|---------|
| `ux_score` | Score UX complexity of features |
| `ux_audit` | Audit interface against UX best practices (42 rules) |
| `ux_generate` | Generate detailed UX specifications |
| `ux_design` | Generate visual design options with HTML wireframes |
| `design_challenge` | Stress-test designs against edge cases (5-lens review) |

**Design Intelligence (6)**

| Tool | Purpose |
|------|---------|
| `design_research_brief` | Research design patterns for your product |
| `design_intake` | Capture design preferences and constraints |
| `brand_import` | Import existing brand assets (colors, fonts, logos) |
| `design_iterate` | Refine designs with feedback |
| `design_select` | Select from generated design options |
| `design_pipeline` | Run the full design flow end-to-end |

**Copy Engine (4)**

| Tool | Purpose |
|------|---------|
| `copy_research_brief` | Research brand voice and content direction |
| `copy_generate` | Generate copy (headlines, CTAs, onboarding) |
| `copy_iterate` | Refine copy based on feedback |
| `copy_critique` | Review copy for clarity and effectiveness |

**Export Tools (2)**

| Tool | Purpose |
|------|---------|
| `playbook_generate` | Create consolidated implementation guide |
| `pdf_export` | Export deliverables as formatted HTML/PDF |

### Post-RC Validation (7 tools)

| Tool | Purpose |
|------|---------|
| `postrc_scan` | Run security, monitoring, and legal scans |
| `postrc_configure` | Adjust scan policy (enable/disable modules) |
| `postrc_override` | Accept a finding with recorded justification |
| `postrc_report` | Generate validation report |
| `postrc_gate` | Ship/no-ship decision checkpoint |
| `postrc_status` | View scan results |
| `postrc_generate_observability_spec` | Generate monitoring requirements from PRD |

### Traceability (3 tools)

| Tool | Purpose |
|------|---------|
| `trace_enhance_prd` | Assign tracking IDs to all requirements |
| `trace_map_findings` | Map scan results back to requirements |
| `trace_status` | View requirements coverage report |

### Pipeline (2 tools)

| Tool | Purpose |
|------|---------|
| `rc_pipeline_status` | Cross-domain status overview with token usage |
| `rc_init` | Detect project state and route to correct entry point |

---

## 07 - What You Get

| Deliverable | Description |
|-------------|-------------|
| **Requirements Document** | 19-section PRD covering market, users, technical, security, UX |
| **Technical Architecture** | Stack, data model, API design, infrastructure plan |
| **Task Breakdown** | Prioritized tasks with effort estimates and dependencies |
| **Architecture Diagrams** | Dependency, Gantt, and layer views |
| **Design Options** | Wireframes with brand identity and visual design directions |
| **Copy System** | Research-backed copy for headlines, CTAs, onboarding flows |
| **Security Report** | Vulnerability scan with plain-language findings (OWASP/CWE) |
| **Legal Review** | Regulatory compliance check (GDPR, HIPAA, PCI-DSS, COPPA, etc.) |
| **Traceability Matrix** | Requirements-to-code coverage with orphan detection |
| **Implementation Playbook** | Consolidated architecture decision record |
| **Value Report** | Cost and time savings vs. a human consulting team |

All deliverables are saved as markdown and HTML - readable in any browser or text editor.

---

## 08 - Architecture Overview

```
RC Engine MCP Server (52 tools)
    |
    +--> Pre-RC Research (7 tools) --> 20 AI specialists
    |         |
    |         v
    +--> RC Method Build (33 tools) --> 8-phase gated pipeline
    |         |
    |         +--> Design Intelligence (6 tools) --> wireframes, brand, critique
    |         +--> Copy Engine (4 tools) --> content strategy, generation
    |         +--> UX System (5 tools) --> scoring, audit, design generation
    |         +--> Export (2 tools) --> playbook, PDF
    |         |
    |         v
    +--> Post-RC Validation (7 tools) --> Security + monitoring + legal scan
    |         |
    |         v
    +--> Traceability (3 tools) --> Requirements-to-code audit
    |
    v
Deliverables (PRD, architecture, tasks, code, designs, copy, scan report)
```

### Core Infrastructure

| Component | What It Does |
|-----------|-------------|
| **Graph Engine** | Topological sort, gate interrupts, fan-out/fan-in execution |
| **Checkpoint Store** | SQLite with WAL mode, atomic writes, time-travel |
| **Multi-LLM Router** | Routes tasks to optimal provider (Claude, Gemini, Perplexity, OpenAI) |
| **Token Tracker** | Per-domain, per-provider token usage with persistent reporting |
| **Sandbox** | Input validation, path safety, size limits on all tool inputs |
| **Audit Trail** | Append-only log of every gate decision and state change |
| **Budget Circuit Breaker** | Automatic pause when token usage exceeds thresholds |

### State Management

All project state is managed through Zod-validated schemas with corruption detection:

```
your-project/
  pre-rc-research/       # Research outputs (PRDs, decks, tasks)
  rc-method/             # Build outputs (architecture, tasks, code)
    design/              # Design specs and wireframes
    copy/                # Generated copy content
    diagrams/            # Mermaid architecture diagrams
    artifacts/           # Generated code and configs
  post-rc/               # Security scan results
  rc-traceability/       # Requirements coverage mapping
  .rc-engine/            # Runtime state (audit logs, checkpoints)
    audit/               # Append-only audit trail
    PIPELINE.md          # Cross-domain token usage summary
```

---

## 09 - Pricing

**RC Engine is free and open source.** All 52 tools, all features, no restrictions.

**BYOK model:** RC Engine uses your own API keys (Anthropic, Perplexity, etc.) - you pay providers directly at their rates.

| Pipeline Phase | Typical AI Cost | What Happens |
|---------------|----------------|--------------|
| Pre-RC Research | $1-5 | 20 specialists across 6 stages |
| RC Method Build | $2-10 | Architecture, task planning, code generation |
| Post-RC Validation | $0.50-2 | Security scanning, monitoring, legal review |
| **Total** | **$3-20** | **Varies by project complexity** |

*Cost estimates are approximate, based on typical token usage and published API rates. Actual costs vary by project complexity, provider pricing changes, and usage patterns.*

---

## 10 - Version History

### v1.0.0 (2026-03-02) - Initial Release

**Pipeline**
- Complete 4-domain pipeline: Pre-RC, RC Method, Post-RC, Traceability
- 52 MCP tools across all domains
- Graph engine with topological sort, gate interrupts, fan-out/fan-in
- 12 quality gates with human-in-the-loop approval
- Cross-domain bridge: Pre-RC research imports into RC build pipeline

**Pre-RC Research**
- 20 AI research personas with per-persona LLM routing
- Cynefin complexity classification (Clear, Complicated, Complex, Chaotic)
- 6 research stages with 3 quality gates
- Web-grounded market research via Perplexity (cited sources)
- 19-section PRD synthesis with HTML deck export
- Idea Stress Test with GO/NO-GO/CONDITIONAL verdict

**RC Method Build**
- 8-phase gated pipeline: Illuminate, Define, Architect, Sequence, Validate, Forge, Connect, Compound
- Phase 6 (Forge): generates actual code files with test scaffolding
- Phase 7 (Connect): integration verification across forge outputs
- Phase 8 (Compound): production hardening assessment
- UX sub-agent with 42 core rules and 8 specialist modules

**Design Intelligence**
- Design generation with HTML wireframes (lo-fi + hi-fi)
- Brand asset import and validation (colors, fonts, logos)
- Design Challenger: brutal 5-lens review protocol
- Design intake assessment for user preference capture
- Design research and pattern analysis
- Full design pipeline orchestration

**Copy Engine**
- Content strategy research and brief generation
- Copy generation for headlines, CTAs, onboarding flows
- Copy iteration with feedback refinement
- Copy critique for clarity and effectiveness

**Post-RC Validation**
- Security scanning against OWASP anti-patterns (CWE-referenced)
- Application security auditor (OWASP scanning)
- 7-check monitoring readiness assessment
- Edge case analysis
- Legal compliance review (GDPR, HIPAA, PCI-DSS, COPPA, and more)
- Finding override with permanent audit trail
- Ship/no-ship gate with severity-based blocking

**Traceability**
- NASA/DO-178C-inspired requirements traceability
- Deterministic requirement IDs (PRD-FUNC-001, PRD-SEC-001)
- Task-to-requirement and finding-to-requirement mapping
- Coverage matrix with orphan detection

**Infrastructure**
- Multi-LLM orchestration: Claude, OpenAI, Gemini, Perplexity
- Dual-mode execution: autonomous (API keys) and passthrough (structured prompts)
- SQLite checkpoint store with WAL mode and atomic writes
- Token tracking with persistent PIPELINE.md summary
- Zod-validated state management with corruption detection
- Web UI with guided wizard, magic link auth, and real-time updates
- Security headers, CORS, rate limiting, CSRF protection

---

## 11 - Common Questions

**Do I need to be technical to use RC Engine?**

No. The Web UI is designed for non-technical users. Describe your idea in plain language and the engine handles everything. The MCP path is for developers who prefer working in their IDE.

**What happens to my data?**

Your project data stays private. Both paths keep everything on your local machine. AI API calls go to the providers you configure (Anthropic, Perplexity, etc.) - RC Engine does not store or train on your data.

**Can I switch between Web UI and MCP?**

Both paths store data locally. The Web UI and MCP server share the same project state files.

**What if I only need the research phase?**

Choose "Research Only" when starting a project. You get the full 20-analyst research pipeline and a complete requirements document without entering the build phase.

**How long does a full pipeline run take?**

A typical full pipeline run takes 30-60 minutes of AI processing time. You can step away and come back - your progress is saved at every checkpoint.

**Can I use RC Engine to build commercial products?**

Yes. RC Engine is MIT-licensed. You can use it to build any product for personal or commercial use. You may not offer RC Engine itself (or a derivative) as a competing commercial service without written permission from Toerana.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `npm run build` fails | Make sure you have Node.js 18+ (`node --version`) |
| Tools not showing in IDE | Verify the path in your MCP config points to `dist/index.js` (not `src/`) |
| "No LLM provider" error | Check your `.env` file has at least `ANTHROPIC_API_KEY` set |
| Research phase is slow | This is normal - each specialist makes multiple AI calls. Typical: 15-30 min |
| Cost seems high | Check [Usage & Cost Guide](USAGE-AND-COST-GUIDE.md) for optimization tips |
| Magic links not sending | Configure `RESEND_API_KEY` or SMTP vars. Without email config, links print to server console |
| Design/copy tools not responding | These require at least one LLM API key configured |

---

## Links

- [GitHub Repository](https://github.com/originalrashmi/rc-engine-product-framework)
- [Getting Started (detailed)](GETTING-STARTED.md)
- [Architecture Reference](ARCHITECTURE.md)
- [Usage & Cost Guide](USAGE-AND-COST-GUIDE.md)
- [Contributing](../CONTRIBUTING.md)
- [Security Policy](../SECURITY.md)
- [Changelog](../CHANGELOG.md)

---

RC Engine by [Toerana](https://toerana.com) - MIT License
