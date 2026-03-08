# RC Engine - Quickstart Guide

Get from product idea to production-ready deliverables in one session.

---

## What You Need Before Starting

| Requirement | Why | Where to Get It |
|-------------|-----|-----------------|
| **Node.js 18+** | Runs the RC Engine server | [nodejs.org](https://nodejs.org) |
| **An MCP-compatible IDE** | Your interface to the pipeline | See IDE options below |
| **Anthropic API key** (required) | Powers the core AI reasoning | [console.anthropic.com](https://console.anthropic.com) |
| **Perplexity API key** (recommended) | Provides live market research with web data | [perplexity.ai/settings/api](https://www.perplexity.ai/settings/api) |
| **Google Gemini API key** (optional) | Handles fast classification at low cost | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| **OpenAI API key** (optional) | Enhances UX and content analysis | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |

**Supported IDEs** (pick one):

| IDE | Type | Best For |
|-----|------|----------|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | Terminal-based (CLI) | Developers comfortable with the command line |
| [Cursor](https://cursor.com) | Desktop app (VS Code fork) | Visual Studio Code users who want AI built in |
| [Windsurf](https://windsurf.ai) | Desktop app (VS Code fork) | Similar to Cursor, alternative option |
| VS Code + [Copilot Chat](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot-chat) | Desktop app + extension | Existing VS Code users |

**Cost estimate:** A full pipeline run (research through validation) typically costs $3-20 in API usage depending on project complexity.

---

## Setup (5 minutes)

### Step 1: Clone and build

> **Where:** Open a **terminal** (Terminal app on Mac, Command Prompt or PowerShell on Windows, or the built-in terminal in VS Code/Cursor/Windsurf).

```bash
git clone https://github.com/originalrashmi/rc-engine-product-framework.git rc-engine
cd rc-engine
npm install && npm run build
```

If `npm` is not found, install Node.js first from [nodejs.org](https://nodejs.org) (LTS version recommended).

### Step 2: Configure API keys

> **Where:** Still in your **terminal**, in the `rc-engine` folder.

```bash
cp .env.example .env
```

Now open the `.env` file in any text editor (VS Code, Notepad, nano, etc.) and paste your keys:

```
ANTHROPIC_API_KEY=your-key-here
PERPLEXITY_API_KEY=your-key-here        # recommended
GOOGLE_GEMINI_API_KEY=your-key-here     # optional
OPENAI_API_KEY=your-key-here            # optional
```

This file is private - it is already in `.gitignore` so it will never be committed or shared.

### Step 3: Connect RC Engine to your IDE

RC Engine runs as a background server that your IDE talks to. You need to tell your IDE where to find it.

**Option A: Claude Code (terminal-based)**

Claude Code is a CLI tool - you run it from your terminal. To connect RC Engine:

1. Open the project folder where you want to build your product (not the rc-engine folder):
   ```bash
   mkdir ~/my-product && cd ~/my-product
   ```

2. Create a `.mcp.json` file in that project folder:
   ```bash
   cat > .mcp.json << 'EOF'
   {
     "mcpServers": {
       "rc-engine": {
         "command": "node",
         "args": ["/full/path/to/rc-engine/dist/index.js"]
       }
     }
   }
   EOF
   ```
   Replace `/full/path/to/rc-engine` with the actual absolute path where you cloned the repo (e.g., `/Users/you/rc-engine`).

3. Start Claude Code in that folder:
   ```bash
   claude
   ```

**Option B: Cursor / Windsurf / VS Code (desktop apps)**

1. Open your product project folder in the IDE (File > Open Folder)
2. Create a `.mcp.json` file in the project root with the same content as above
3. Restart the IDE or reload the window (Cmd+Shift+P > "Reload Window")

For detailed IDE-specific setup, see [Getting Started](GETTING-STARTED.md).

### Step 4: Verify it works

> **Where:** Inside your IDE (Claude Code terminal, or the AI chat panel in Cursor/Windsurf/VS Code).

Type a message like: "What tools are available?" You should see RC Engine tools listed (14 on Free tier, up to 35 on Pro).

If tools don't appear, check that:
- The path in `.mcp.json` points to `dist/index.js` (not `src/`)
- You ran `npm run build` in the rc-engine folder
- You restarted your IDE after creating `.mcp.json`

---

## Your First Run

> **Where:** Everything from here happens inside your IDE's AI chat. Just type naturally - you never need to call tools by name.

### 1. Describe your idea

Tell the AI what you want to build. Examples:

- "I want to build a SaaS tool for freelancer invoicing"
- "Build me a mobile app for pet owners to find nearby vets"
- "I need an internal tool for managing client onboarding"

### 2. Research phase (15-30 minutes)

The AI activates up to 20 research specialists that analyze your idea:

- **Market Landscape Analyst** - competitive landscape, market gaps
- **Primary User Archetype** - user personas, pain points, behaviors
- **Systems Architect** - technical feasibility, stack recommendations
- **Security Compliance Analyst** - threat modeling, regulatory requirements
- **UX Systems Designer** - interaction patterns, cognitive load analysis
- ...and up to 15 more specialists

You approve at **3 checkpoints** during research:
1. After complexity assessment (which specialists to activate)
2. After market/user research (findings review)
3. After technical/validation research (final review)

### 3. Build phase

After research, the AI creates:
- A **requirements document** (19-section PRD)
- A **technical architecture** (stack, data model, APIs)
- A **task list** (prioritized, dependency-ordered)
- **Implementation guidance** for each task

You approve at **8 checkpoints** during build (one per phase).

### 4. Validation phase

The AI scans everything for:
- Security vulnerabilities (OWASP-mapped)
- Monitoring readiness
- Requirements coverage

You make the final **ship/no-ship decision**.

---

## What You Get at the End

| Deliverable | File Location |
|-------------|---------------|
| Product Requirements Document (PRD) | `pre-rc-research/prd-*.md` and `.html` |
| Research artifacts (per specialist) | `pre-rc-research/stage-{1-6}/` |
| Task list with estimates | `pre-rc-research/tasks-*.md` and `.html` |
| Technical architecture | `rc-method/prds/` |
| Build outputs per task | `rc-method/forge/` |
| Security scan report | `post-rc/reports/` |
| Traceability matrix | `rc-traceability/` |

All deliverables are markdown and HTML - readable in any browser or text editor.

---

## No API Keys? No Problem

RC Engine works in **manual mode** without API keys. The AI generates structured prompts that you copy into any AI tool (ChatGPT, Claude.ai, Gemini) and paste the results back. Same quality output, more hands-on work.

---

## Tips for Best Results

1. **Be specific about your users** - "freelancers who bill hourly" is better than "users"
2. **Mention scale** - "100 users" vs "100,000 users" changes the architecture
3. **State constraints** - "must work offline" or "budget under $500/month" helps focus research
4. **Read the checkpoints** - the research findings are the most valuable part; don't skip them

---

## What's Next

- **Give feedback** - [Open an issue](https://github.com/originalrashmi/rc-engine-product-framework/issues) with your experience
- **Star the repo** - helps others find RC Engine
- **Join the community** - contribute improvements via [pull requests](https://github.com/originalrashmi/rc-engine-product-framework/blob/main/CONTRIBUTING.md)
- **Get Pro knowledge files** - enhanced research personas and build skills for autonomous execution

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

## Architecture Overview

```
Your IDE (Claude Code / Cursor / Windsurf / VS Code)
    |
    v
RC Engine MCP Server (35 tools, Free + Pro tiers)
    |
    +--> Pre-RC Research (7 tools, 6 free) --> 20 AI specialists
    |         |
    |         v
    +--> RC Method Build (17 tools, 5 free) --> 8-phase gated pipeline
    |         |
    |         v
    +--> Post-RC Validation (7 tools, 2 free) --> Security + monitoring scan
    |         |
    |         v
    +--> Traceability (3 tools, Pro only) --> Requirements-to-code audit
    |
    v
Deliverables (PRD, architecture, tasks, code, scan report)
```

For the full technical deep dive, see [Architecture](ARCHITECTURE.md).
