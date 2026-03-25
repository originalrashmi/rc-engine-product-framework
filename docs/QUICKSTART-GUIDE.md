# RC Engine Starter Guide

**Results through Clarity** - an AI-native product development pipeline

---

## 01 - What is RC Engine?

RC Engine takes a product idea - even a single sentence - and walks it through a structured development pipeline: research, architecture, build, validation, and traceability. It uses 35 orchestrated AI tools behind the scenes so you can focus on your product, not the process.

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

| Domain | What It Does |
|--------|-------------|
| Pre-RC (Research) | Up to 20 AI specialists analyze your idea from every angle |
| RC Method (Build) | 8-phase structured development: discovery through production hardening |
| Post-RC (Validation) | Security scanning, monitoring readiness, and ship/no-ship gate |
| Traceability (Audit) | Tracks which requirements were built and verified |

---

## 05 - The Pipeline

Whichever path you choose, RC Engine runs your idea through this structured process:

1. **Research** - Up to 20 AI specialists analyze your idea - market, users, security, UX, and more
   - CHECKPOINT: APPROVE RESEARCH SCOPE

2. **Requirements Document** - 19-section PRD synthesized from all research findings
   - CHECKPOINT: APPROVE REQUIREMENTS

3. **Architecture** - Tech stack, data model, API design, infrastructure plan
   - CHECKPOINT: APPROVE ARCHITECTURE

4. **Task Plan** - Prioritized tasks with effort estimates and dependencies
   - CHECKPOINT: APPROVE BUILD PLAN

5. **Build** - Task by task with quality checks at each layer

6. **Security + Legal Scan** - Vulnerability detection with plain-language explanations
   - CHECKPOINT: SHIP / FIX / ACCEPT RISK

7. **Ship** - Production-ready with full audit trail

**You are in control at every checkpoint.** Nothing moves forward without your approval.

---

## 06 - What You Get

| Deliverable | Description |
|-------------|-------------|
| **Requirements Document** | 19-section PRD covering market, users, technical, security, UX |
| **Technical Architecture** | Stack, data model, API design, infrastructure plan |
| **Task Breakdown** | Prioritized tasks with effort estimates and dependencies |
| **Architecture Diagrams** | Dependency, Gantt, and layer views |
| **Security Report** | Vulnerability scan with plain-language findings |
| **Value Report** | Cost and time savings vs. a human consulting team |

All deliverables are markdown and HTML - readable in any browser or text editor.

---

## 07 - Pricing

**RC Engine is free and open source.** All 35 tools, all features, no limits.

**BYOK model:** RC Engine uses your own API keys (Anthropic, Perplexity, etc.) - you pay providers directly at their rates. Typical total: $3-20 per project depending on complexity.

*Cost estimates are approximate, based on typical token usage and published API rates. Actual costs vary by project complexity, provider pricing changes, and usage patterns.*

---

## 08 - Common Questions

**Do I need to be technical to use RC Engine?**

No. The Web UI is designed for non-technical users. Describe your idea in plain language and the engine handles everything. The MCP path is for developers who prefer working in their IDE.

**What happens to my data?**

Your project data stays private. Both paths keep everything on your local machine. AI API calls go to the providers you configure (Anthropic, Perplexity, etc.) - RC Engine does not store or train on your data.

**Can I switch between Web UI and MCP?**

Both paths store data locally. The Web UI and MCP server share the same project state files.

**What if I only need the research phase?**

Choose "Research Only" when starting a project. You get the full 20-analyst research pipeline and a complete requirements document without entering the build phase. This is available on all plans including Free.

**How long does a full pipeline run take?**

A typical full pipeline run takes 30-60 minutes of AI processing time. You can step away and come back - your progress is saved at every checkpoint.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `npm run build` fails | Make sure you have Node.js 18+ (`node --version`) |
| Tools not showing in IDE | Verify the path in `.mcp.json` points to `dist/index.js` (not `src/`) |
| "No LLM provider" error | Check your `.env` file has at least `ANTHROPIC_API_KEY` set |
| Research phase is slow | This is normal - each specialist makes multiple AI calls. Typical: 15-30 min |
| Cost seems high | Check [Usage & Cost Guide](USAGE-AND-COST-GUIDE.md) for optimization tips |

---

RC Engine by Toerana - MIT License - [GitHub](https://github.com/originalrashmi/rc-engine-product-framework)
