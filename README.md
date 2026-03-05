# RC Engine

[![CI](https://github.com/originalrashmi/rc-engine-product-framework/actions/workflows/ci.yml/badge.svg)](https://github.com/originalrashmi/rc-engine-product-framework/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue.svg)](https://modelcontextprotocol.io)

**Results through Clarity** -- an AI-native product development pipeline.

Take a one-line product idea through structured research, architecture, build, validation, and traceability -- with 33 orchestrated tools across 4 domains.

Built for developers, technical founders, and product teams who want structured methodology instead of ad-hoc AI coding.

---

## The Problem

AI coding tools are great at generating code -- but they skip the work that makes code worth shipping: market research, requirements, architecture, security, and traceability. Projects built with ad-hoc AI prompting end up with gaps in business viability, user experience, and production readiness.

RC Engine adds a **structured methodology layer** on top of your AI IDE. Instead of jumping straight to code, it researches your idea with up to 20 specialists (3-20 based on complexity), writes a complete requirements document, designs the architecture, builds task by task, then scans for security and legal issues -- all before you ship. Every step requires your approval, so you stay in control.

---

## How It Works

RC Engine is a **Model Context Protocol (MCP) server** that runs inside your IDE. Describe your product idea, and the AI walks you through a phase-gated pipeline -- researching, designing, building, and validating -- with human approval at every checkpoint.

```
Idea --> Research (up to 20 specialists) --> PRD --> Architecture --> Build --> Security + Legal Scan --> Ship
```

You never call tools directly. Open your IDE, describe what you want to build, and the AI handles the rest.

### Two Editions

| Edition | What You Get | License |
|---------|-------------|---------|
| **RC Engine (this repo)** | Full MCP server, 33 tools, pipeline structure, state management, quality gates | MIT (free) |
| **[RC Engine Pro](https://github.com/originalrashmi/rc-engine-pro)** | 46 methodology knowledge files -- research personas, build skills, UX specialists, security databases | Proprietary |

**Community mode** (without Pro): Tools assemble structured prompts for your IDE's AI to process. Full pipeline discipline at zero cost.

**Pro mode** (with Pro knowledge): Autonomous execution -- the engine calls LLMs directly with methodology-enriched prompts.

### Free vs Paid

| Capability | Free | Starter ($29/mo) | Pro ($79/mo) |
|------------|------|-------------------|--------------|
| **Pre-RC Research** (20 AI specialists, 6 stages, 3 gates) | 1 project/mo | 5 projects/mo | Unlimited |
| **RC Method Build** (8 phases, architecture, forge, gates) | -- | Included | Included |
| **Post-RC Validation** (security scan, monitoring, ship gate) | -- | Included | Included |
| **Traceability** (requirement IDs, coverage matrix, HTML report) | -- | -- | Included |
| **Design Options** (lo-fi/hi-fi wireframes) | -- | 1 per project | 3 per project |
| **Stress Test** (GO/NO-GO challenge before build) | -- | -- | Included |
| **PDF Export** | -- | Included | Included |
| **Architecture Diagrams** | -- | Included | Included |
| **Playbook / ARD Export** | -- | -- | Included |
| **Priority AI Routing** | -- | -- | Included |
| **Custom Knowledge Files** | -- | -- | Included |
| **API Access** | -- | -- | Included |
| **Web UI** | Included (research only) | Full pipeline | Full pipeline |
| **MCP / CLI** | Included (research only) | Full pipeline | Full pipeline |

Free users get full access to the Pre-RC research pipeline (1 project/month). Building, validation, and traceability require a paid tier.

---

## Key Benefits

| Benefit | What It Means |
|---------|---------------|
| **Structured Research** | Up to 20 AI research specialists (3-20 based on complexity) analyze your idea before code is written |
| **Web-Grounded Intelligence** | Market research uses real-time web data with citations -- not hallucinated competitors |
| **Quality Gates** | Up to 11 human-approval gates. Nothing ships without passing security, UX, and coverage audits |
| **Traceability** | Every requirement gets a deterministic ID. Tasks map to requirements. Findings map back to source |
| **Multi-LLM Orchestration** | 4 providers available -- search models for research, fast models for extraction, powerful models for architecture |
| **Security + Legal Review** | Post-build OWASP pattern scanning, monitoring readiness, and legal compliance review (Pro). Design-time analysis -- not a replacement for professional auditing |

---

## The Pipeline

| Domain | Tools | What It Does |
|--------|-------|-------------|
| **Gateway** | 1 | `rc_init` -- unified entry point. Detects project state and routes you to the right tool. Start here |
| **Pre-RC Research** | 6 | Up to 20 AI specialists analyze your idea across market, users, security, UX, and business |
| **RC Method Build** | 14 | 8-phase gated pipeline: discover, define, architect, sequence, validate, build, integrate, harden |
| **Post-RC Validation** | 7 | Security scanning, monitoring readiness, legal compliance review (Pro), override tracking, ship/no-ship gate |
| **Traceability** | 3 | Requirements-to-code audit trail with coverage reporting |
| **Pipeline Status** | 1 | Cross-domain overview with token usage totals |

---

## Getting Started

**Prerequisites:** Node.js >= 18, an MCP-compatible IDE (Claude Code, Cursor, Windsurf, VS Code)

### 1. Get your own copy

```bash
# Clone the repo
git clone https://github.com/originalrashmi/rc-engine-product-framework.git rc-engine
cd rc-engine

# Install and build
npm install && npm run build
```

### 2. Configure API keys

```bash
cp .env.example .env
# Edit .env with your API keys (at minimum, ANTHROPIC_API_KEY)
```

### 3. Connect to your IDE

**Claude Code** -- add to `.mcp.json` in your project:
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

> For Cursor, Windsurf, and VS Code setup, see [Getting Started](docs/GETTING-STARTED.md).

### 4. Start building

Open your IDE and describe your product idea. The AI will call `rc_init` to detect your project state and route you to the right starting point -- Pre-RC research by default.

---

## Quick Start

1. **Describe your idea** -- "I want to build a SaaS tool for freelancer invoicing"
2. **The AI runs research** -- 12-15 specialists analyze market, users, tech, UX, and security
3. **Approve checkpoints** -- review findings at each gate, then the AI builds your project
4. **Get deliverables** -- PRD, architecture, task list, code, security scan, traceability report

> For the full walkthrough, see [Getting Started](docs/GETTING-STARTED.md).

---

## What You Get

Every pipeline run produces these deliverables:

| Deliverable | Description |
|-------------|-------------|
| **Product Requirements Document (PRD)** | 19-section research-backed document covering problem, users, features, architecture, risks, and GTM |
| **Technical Architecture** | Stack selection, data model, API design, infrastructure plan |
| **Prioritized Task List** | Dependency-ordered tasks across 4 layers (Foundation, Core, Integration, Polish) |
| **Implementation Guidance** | Per-task build instructions with file structure and code patterns |
| **Security Scan Report** | OWASP-mapped findings with CWE references and plain-language remediation |
| **Traceability Matrix** | Requirements-to-code coverage showing what was specified, built, and verified |

All deliverables are saved as markdown and HTML files in your project directory.

---

## Documentation

| Document | Description |
|----------|-------------|
| [Quickstart Guide](docs/QUICKSTART-GUIDE.md) | 5-minute setup, first run walkthrough, what you get, troubleshooting |
| [Architecture](docs/ARCHITECTURE.md) | Technical deep dive -- domains, phases, personas, LLM routing, state management |
| [Getting Started](docs/GETTING-STARTED.md) | Setup, API keys, IDE configuration, first project walkthrough |
| [Usage & Cost Guide](docs/USAGE-AND-COST-GUIDE.md) | Plan recommendations, token estimates, cost optimization |

---

## Roadmap

| Phase | Status | What |
|-------|--------|------|
| **CLI/MCP Pipeline** | Available now | Full 33-tool pipeline via Claude Code, Cursor, Windsurf, VS Code |
| **Parallel Synthesis** | Available now | PRD generation runs 8 section groups concurrently for faster output |
| **Web Dashboard** | Planned | Browser-based project management with real-time pipeline visualization |
| **Pro Knowledge Marketplace** | Planned | Enhanced research personas, build skills, and security databases |
| **Team Collaboration** | Planned | Multi-user projects with shared gates and approval workflows |

See the [product backlog](docs/BACKLOG-versioning-deployment.md) for the full list.

---

## Important Disclaimers

**RC Engine is a development tool, not a substitute for professional services.** By using RC Engine you acknowledge the following:

- **No guarantee of product quality.** All outputs (PRD, architecture, code, tasks, scan results) are AI-generated guidance. Toerana is not responsible for the quality, correctness, security, or fitness of any product built using this pipeline. Human review is required before acting on any output.
- **Not legal advice.** The legal review module performs automated pattern matching and AI-based analysis. It does not constitute legal counsel, certification, or professional legal services. Findings are informational. Consult a qualified attorney for legal advice specific to your product and jurisdiction.
- **Not a security audit.** Security scanning uses static pattern analysis and LLM heuristics. It does not replace professional penetration testing, SAST/DAST tools, or security audits. Toerana is not responsible for vulnerabilities not detected by the scanner.
- **Not regulatory certification.** Regulatory checks (HIPAA, PCI-DSS, COPPA, GDPR, FERPA, etc.) identify potential gaps. They do not certify compliance. Compliance requires professional assessment specific to your product and jurisdiction.
- **AI-generated content.** All pipeline outputs are generated with AI assistance and may contain errors, hallucinations, or omissions. Outputs should be reviewed by qualified professionals before use in production, regulatory submissions, or business decisions.
- **User assumes all deployment risk.** RC Engine's pipeline ends at validation. Deployment decisions, production operations, and business outcomes are entirely the user's responsibility. A "PASS" gate decision means no blocking findings were detected -- it is not a guarantee of production readiness.
- **Third-party services.** RC Engine uses third-party AI services (Anthropic, OpenAI, Google, Perplexity). Toerana is not responsible for the accuracy, availability, or security of third-party services or their outputs.
- **No indemnification.** The software is provided "AS IS" under the MIT License. Toerana accepts no liability for losses, damages, or claims arising from use of the framework, its outputs, or reliance on its findings.

For the full license terms, see [LICENSE](LICENSE).

---

## License

- **RC Engine** (this repository): [MIT](LICENSE) -- free to use, modify, and distribute
- **RC Engine Pro** (knowledge files): [Proprietary](https://github.com/originalrashmi/rc-engine-pro/blob/main/LICENSE) -- requires subscription

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and pull request guidelines.

## Security

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities and security considerations.

## Feedback

Try it out and let us know what you think. [Open an issue](https://github.com/originalrashmi/rc-engine-product-framework/issues) with your experience, feature requests, or questions. Stars help others find this project.

---

Built by [Toerana](https://toerana.com)
