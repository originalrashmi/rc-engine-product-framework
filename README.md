# RC Engine

[![CI](https://github.com/originalrashmi/rc-engine-product-framework/actions/workflows/ci.yml/badge.svg)](https://github.com/originalrashmi/rc-engine-product-framework/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue.svg)](https://modelcontextprotocol.io)

**Results through Clarity** - an AI-native product development pipeline.

Take a one-line product idea through structured research, architecture, build, validation, and traceability - with 52 tools across 4 domains. Free and open source.

Built for developers, technical founders, and product teams who want structured methodology instead of ad-hoc AI coding.

---

## The Problem

AI coding tools are great at generating code - but they skip the work that makes code worth shipping: market research, requirements, architecture, security, and traceability. Projects built with ad-hoc AI prompting end up with gaps in business viability, user experience, and production readiness.

RC Engine adds a **structured methodology layer** on top of your AI IDE. Instead of jumping straight to code, it researches your idea with up to 20 specialists (3-20 based on complexity), writes a complete requirements document, designs the architecture, builds task by task, then scans for security and legal issues - all before you ship. Every step requires your approval, so you stay in control.

---

## How It Works

RC Engine is a **Model Context Protocol (MCP) server** that runs inside your IDE. Describe your product idea, and the AI walks you through a phase-gated pipeline - researching, designing, building, and validating - with human approval at every checkpoint.

```
Idea --> Research (up to 20 specialists) --> PRD --> Architecture --> Build --> Security + Legal Scan --> Ship
```

You never call tools directly. Open your IDE, describe what you want to build, and the AI handles the rest.

**BYOK model:** RC Engine uses your own API keys (Anthropic, Perplexity, etc.) - you pay providers directly at their rates. Typical total: $3-20 per project depending on complexity.

---

## Key Benefits

| Benefit | What It Means |
|---------|---------------|
| **Structured Research** | Up to 20 AI research specialists (3-20 based on complexity) analyze your idea before code is written |
| **Web-Grounded Intelligence** | Market research uses real-time web data with citations - not hallucinated competitors |
| **Quality Gates** | Up to 12 human-approval gates. Nothing ships without passing security, UX, and coverage audits |
| **Traceability** | Every requirement gets a deterministic ID. Tasks map to requirements. Findings map back to source |
| **Multi-LLM Orchestration** | 4 providers available - search models for research, fast models for extraction, powerful models for architecture |
| **Design + Copy** | Brand-aware visual design options and research-backed copy generation |
| **Security + Legal Review** | Post-build OWASP pattern scanning, monitoring readiness, and legal compliance review. Design-time analysis - not a replacement for professional auditing |

---

## The Pipeline

| Domain | Tools | What It Does |
|--------|-------|-------------|
| **Pre-RC Research** | 7 | Up to 20 AI specialists analyze your idea across market, users, security, UX, and business |
| **RC Method Build** | 33 | 8-phase gated pipeline with design, copy, UX, and export tools |
| **Post-RC Validation** | 7 | Security scanning, monitoring readiness, override tracking, ship/no-ship gate |
| **Traceability** | 3 | Requirements-to-code audit trail with coverage reporting |
| **Pipeline** | 2 | Cross-domain overview + unified entry point |
| **Total** | **52** | |

All 52 tools are available with no restrictions.

---

## Getting Started

**Prerequisites:** Node.js >= 18, an MCP-compatible IDE (Claude Code, Cursor, Windsurf, VS Code)

### Path A: Web UI

```bash
git clone https://github.com/originalrashmi/rc-engine-product-framework.git rc-engine
cd rc-engine
npm install && npm run build
npm run web
```

Open **http://localhost:3100** in your browser.

### Path B: MCP Server (IDE)

```bash
git clone https://github.com/originalrashmi/rc-engine-product-framework.git rc-engine
cd rc-engine
npm install && npm run build
```

Configure API keys in `.env`:
```bash
cp .env.example .env
# Edit .env with your API keys (at minimum, ANTHROPIC_API_KEY)
```

Add to your IDE config:

**Claude Code** (`.mcp.json`):
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

### Start building

Open your IDE and describe your product idea. The AI handles the rest.

---

## Quick Start

1. **Describe your idea** - "I want to build a SaaS tool for freelancer invoicing"
2. **The AI runs research** - 12-15 specialists analyze market, users, tech, UX, and security
3. **Approve checkpoints** - review findings at each gate, then the AI builds your project
4. **Get deliverables** - PRD, architecture, task list, code, security scan, traceability report

> For the full walkthrough, see [Starter Guide](docs/STARTER-GUIDE.md) or [Getting Started](docs/GETTING-STARTED.md).

---

## What You Get

Every pipeline run produces these deliverables:

| Deliverable | Description |
|-------------|-------------|
| **Product Requirements Document (PRD)** | 19-section research-backed document covering problem, users, features, architecture, risks, and GTM strategy |
| **Go-to-Market Strategy** | Launch plan with distribution channels, competitive positioning, and growth tactics (PRD section 12) |
| **Technical Architecture** | Stack selection, data model, API design, infrastructure plan |
| **Prioritized Task List** | Dependency-ordered tasks across 4 layers (Foundation, Core, Integration, Polish) |
| **Architecture Diagrams** | Dependency graph, Gantt chart, and layer views (Mermaid) |
| **Design Options** | Wireframes, brand identity, visual design directions with design challenge review |
| **Copy System** | Research-backed copy for headlines, CTAs, onboarding flows |
| **Implementation Guidance** | Per-task build instructions with file structure and code patterns |
| **Playbook** | Step-by-step implementation guide (architecture decision record) |
| **Security Scan Report** | OWASP-mapped findings with CWE references and plain-language remediation |
| **Legal Compliance Review** | Regulatory gap analysis (GDPR, HIPAA, PCI-DSS, COPPA, and more) |
| **Edge Case Analysis** | Boundary conditions and failure mode detection |
| **Traceability Matrix** | Requirements-to-code coverage showing what was specified, built, and verified |
| **Value Report** | Cost and time savings vs. a human consulting team |

All deliverables are saved as markdown and HTML files in your project directory.

---

## Documentation

| Document | Description |
|----------|-------------|
| [Starter Guide](docs/STARTER-GUIDE.md) | Visual guide - what RC Engine is, both paths, pipeline overview |
| [Quickstart Guide](docs/QUICKSTART-GUIDE.md) | 5-minute setup, first run walkthrough, what you get, troubleshooting |
| [Architecture](docs/ARCHITECTURE.md) | Technical deep dive - domains, phases, personas, LLM routing, state management |
| [Getting Started](docs/GETTING-STARTED.md) | Setup, API keys, IDE configuration, first project walkthrough |
| [Usage & Cost Guide](docs/USAGE-AND-COST-GUIDE.md) | Token estimates, cost optimization |

---

## Important Disclaimers

**RC Engine is a development tool, not a substitute for professional services.** By using RC Engine you acknowledge the following:

- **No guarantee of product quality.** All outputs (PRD, architecture, code, tasks, scan results) are AI-generated guidance. Toerana is not responsible for the quality, correctness, security, or fitness of any product built using this pipeline. Human review is required before acting on any output.
- **Not legal advice.** The legal review module performs automated pattern matching and AI-based analysis. It does not constitute legal counsel, certification, or professional legal services. Findings are informational. Consult a qualified attorney for legal advice specific to your product and jurisdiction.
- **Not a security audit.** Security scanning uses static pattern analysis and LLM heuristics. It does not replace professional penetration testing, SAST/DAST tools, or security audits. Toerana is not responsible for vulnerabilities not detected by the scanner.
- **Not regulatory certification.** Regulatory checks (HIPAA, PCI-DSS, COPPA, GDPR, FERPA, etc.) identify potential gaps. They do not certify compliance. Compliance requires professional assessment specific to your product and jurisdiction.
- **AI-generated content.** All pipeline outputs are generated with AI assistance and may contain errors, hallucinations, or omissions. Outputs should be reviewed by qualified professionals before use in production, regulatory submissions, or business decisions.
- **User assumes all deployment risk.** RC Engine's pipeline ends at validation. Deployment decisions, production operations, and business outcomes are entirely the user's responsibility. A "PASS" gate decision means no blocking findings were detected - it is not a guarantee of production readiness.
- **Third-party services.** RC Engine uses third-party AI services (Anthropic, OpenAI, Google, Perplexity). Toerana is not responsible for the accuracy, availability, or security of third-party services or their outputs.
- **No indemnification.** The software is provided "AS IS" under the MIT License. Toerana accepts no liability for losses, damages, or claims arising from use of the framework, its outputs, or reliance on its findings.

For the full license terms, see [LICENSE](LICENSE).

---

## License

**RC Engine** (this repository): [MIT](LICENSE) - free to use, modify, and distribute

### Commercial Use Notice

The source code is MIT-licensed, which permits use, modification, and distribution. However:

- **"RC Engine", "RC Method", and "Toerana"** are trademarks of Toerana. You may not use these names, logos, or branding to market, sell, or distribute a competing product or service without written permission from Toerana.
- **You may not** clone or fork this repository and offer it (or a derivative) as a hosted commercial service, SaaS product, or paid offering under any name without written permission from Toerana.
- **You may** use RC Engine to build your own products, integrate it into your internal workflows, and modify it for your own use.

For commercial licensing inquiries: licensing@toerana.com

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and pull request guidelines.

## Security

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities and security considerations.

## Feedback

Try it out and let us know what you think. [Open an issue](https://github.com/originalrashmi/rc-engine-product-framework/issues) with your experience, feature requests, or questions. Stars help others find this project.

---

Built by [Toerana](https://toerana.com)
