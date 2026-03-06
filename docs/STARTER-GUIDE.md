# RC Engine -- Starter Guide

## What is RC Engine?

RC Engine takes a product idea -- even a single sentence -- and walks it through a structured development pipeline: research, architecture, build, validation, and traceability. It uses 38 orchestrated AI tools behind the scenes so you can focus on your product, not the process.

Up to 20 specialized AI analysts research your idea before a single line of code is written. They cover market fit, user needs, technical feasibility, security, UX, and more. Then the engine designs the architecture, builds task by task, and scans for security and legal issues before shipping.

You approve every step. Nothing moves forward without your sign-off.

---

## Choose Your Path

Pick the way that fits how you work. Both paths use the same pipeline and produce the same deliverables.

| | Path A: Web UI | Path B: MCP Server |
|---|---|---|
| **How it works** | Open in your browser. Guided wizard. | Runs inside your IDE. Conversational. |
| **Setup time** | 2 minutes | 10 minutes |
| **Best for** | Founders, product managers, visual thinkers | Developers, technical founders |
| **Installation** | None | Clone repo + configure IDE |

---

## Path A: Web UI

### 1. Go to RC Engine

Run `npm run web` from your RC Engine directory, then open **http://localhost:3000** in your browser.

### 2. Sign In

1. Enter your email address
2. Click **Continue**
3. Check your inbox for the sign-in email from RC Engine
4. Click the link -- you land on the dashboard

> **Tip:** If you don't see the email within a minute, check your spam folder.

### 3. Start Your First Project

1. Click **New Project**
2. Describe your product idea in plain language -- a single sentence is enough
3. Choose how much of the pipeline to run:
   - **Full Pipeline** -- Research, Design, Architecture, Build, Validate, Ship
   - **Research Only** -- Market analysis and a complete requirements document
   - **Build Only** -- Skip research, jump to architecture and build
4. Follow the guided steps. At each checkpoint, review what was produced and approve before moving on.

### 4. Download Your Deliverables

When the pipeline completes (or at any stage), download your deliverables directly from the dashboard.

That's it. No terminal, no configuration, no API keys to manage.

---

## Path B: MCP Server (IDE Integration)

### 1. Prerequisites

- **Node.js 18+** -- download from https://nodejs.org. Check with `node --version`.
- **Claude Code, Cursor, or another MCP-compatible IDE**
- **An Anthropic API key** -- sign up at https://console.anthropic.com

### 2. Install

```bash
git clone https://github.com/originalrashmi/rc-engine-product-framework.git rc-engine
cd rc-engine
npm install && npm run build
```

### 3. Add Your API Keys

Create a file called `.env` in the rc-engine folder:

```
# Required -- powers core reasoning and architecture
ANTHROPIC_API_KEY=sk-ant-paste_your_key_here

# Recommended -- enables live market and competitor research
PERPLEXITY_API_KEY=pplx-paste_your_key_here

# Optional
GOOGLE_GEMINI_API_KEY=paste_your_key_here
OPENAI_API_KEY=sk-paste_your_key_here
```

| Service | What It Powers | Required? | Typical Cost |
|---------|---------------|-----------|-------------|
| Anthropic (Claude) | Core reasoning, architecture, code generation | Yes | $1-5 per project |
| Perplexity | Live market research and competitor data | Recommended | $0.50-2 per project |
| Google Gemini | Fast classification tasks | Optional | Free tier |
| OpenAI | UX and content analysis | Optional | Minimal |

> **No API keys?** RC Engine works in manual mode -- it generates structured prompts you copy into any AI tool and paste the results back.

### 4. Connect to Your IDE

**Claude Code** (`~/.claude/settings.json`):

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

**Cursor** (`.cursor/mcp.json`):

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

Replace the path with the actual location where you cloned the repo. To find it, run this in your terminal from the rc-engine folder:

```bash
# Mac/Linux
echo "$(pwd)/dist/index.js"

# Windows
echo %cd%\dist\index.js
```

Copy the output and paste it into the `args` array.

### 5. Start Building

Open your IDE and describe what you want to build:

> "I want to build a SaaS dashboard for tracking marketing spend across channels."

The AI orchestrates the full pipeline -- calling tools, presenting results, and pausing at checkpoints for your approval.

---

## The Pipeline

Whichever path you choose, RC Engine runs your idea through this process:

```
Idea
 |  Checkpoint: approve research scope
 v
Research (up to 20 AI specialists)
 |  Checkpoint: approve requirements
 v
Requirements Document (19-section PRD)
 |  Checkpoint: approve architecture
 v
Architecture (tech stack, data model, APIs)
 |  Checkpoint: approve build plan
 v
Task Plan (prioritized, with dependencies)
 |
 v
Build (task by task, with quality checks)
 |  Checkpoint: ship / fix / accept risk
 v
Security + Legal Scan
 |
 v
Ship (production-ready, full audit trail)
```

You are in control at every checkpoint. Nothing moves forward without your approval.

---

## What You Get

- **Requirements Document** -- 19-section PRD covering market, users, technical, security, UX
- **Technical Architecture** -- Stack, data model, API design, infrastructure plan
- **Task Breakdown** -- Prioritized tasks with effort estimates and dependencies
- **Architecture Diagrams** -- Dependency, Gantt, and layer views
- **Security Report** -- Vulnerability scan with plain-language findings
- **Value Report** -- Cost and time savings vs. a human consulting team

---

## Pricing

**Free tier** includes the Pre-RC research pipeline (1 project/month). Paid tiers unlock the full build pipeline, security scanning, traceability, and Pro knowledge files. See the [RC Engine website](https://toerana.com) for current pricing.

**BYOK model:** RC Engine uses your own API keys (Anthropic, Perplexity, etc.) -- you pay providers directly at their rates. Typical total: $3-10 per project.

---

## Common Questions

**Do I need to be technical to use RC Engine?**
No. The Web UI is designed for non-technical users. Describe your idea in plain language and the engine handles everything.

**What happens to my data?**
Your project data stays private. Both paths keep everything on your local machine.

**Can I switch between Web UI and MCP?**
Both paths store data locally. The Web UI and MCP server share the same project state files.

**What if I only need the research phase?**
Choose "Research Only" when starting a project. Available on all plans including Free.

**How long does a full pipeline run take?**
30-60 minutes of AI processing time. You can step away and come back -- progress is saved at every checkpoint.
