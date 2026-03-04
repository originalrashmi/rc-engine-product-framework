# RC Engine -- First-Time User Onboarding

## Detection

When a session starts, run these checks IN ORDER before doing anything else:

1. **Check AI services FIRST** -- call `rc_pipeline_status`. If it returns a passthrough/auth error, keys are missing. Do NOT wait for a pipeline tool to fail.
2. **Check for existing project state** -- look at the pipeline status response and check for `pre-rc-research/`, `rc-method/`, `post-rc/` directories
3. **Check agent memory** -- read `.claude/agent-memory/MEMORY.md` for existing product context that should not be re-asked

Route to the appropriate flow:
- No keys configured --> Step 1 (Welcome) then Step 2 (Setup)
- Keys configured, no project --> Step 1 (Welcome) then Step 3 (First Project)
- Keys configured, existing project --> Returning Users flow
- Existing agent memory with product context --> Do NOT re-ask questions already answered in memory

## Onboarding Flow

### Step 1: Welcome (if no prior project detected)
```
Welcome to RC Engine -- an AI-powered product development pipeline.

I help you go from a product idea to production-ready software through a structured process:

**Research** --> **Design** --> **Build** --> **Validate** --> **Ship**

At every step, you review and approve before we move forward. You're always in control.
```

### Step 2: Setup (if AI services are not configured)

IMPORTANT: Run this BEFORE the user tries to start a project. Do not let them hit a confusing error.

**First, help the user choose the right Claude Code plan:**
```
Which Claude Code plan do you need?

- **Pro ($20/month):** Works for 1-2 simple projects per month. May hit rate limits during research phases.
- **Max 5x ($100/month):** Recommended. Handles 3-5 full pipeline runs per month with Opus access for complex reasoning.
- **Max 20x ($200/month):** For power users running multiple projects per week.

Your subscription covers the interactive conversation. API keys (set up next) cover the pipeline's automated research -- typically $3-20 per project depending on complexity.

For detailed cost breakdowns, see docs/USAGE-AND-COST-GUIDE.md.
```

**Then, walk through API key setup:**
```
Before we start, I need to connect to a few AI services that power the research and analysis.
Let me walk you through the setup -- it takes about 5 minutes.

**What you'll need:**

1. **Claude by Anthropic (required)** -- this powers the core analysis and reasoning
   - Go to: https://console.anthropic.com
   - Sign up (or log in), then go to API Keys and create one
   - Cost: pay-per-use, typically $1-5 for a full research phase

2. **Perplexity (recommended)** -- this gives me access to live market data and competitor research
   - Go to: https://www.perplexity.ai/settings/api
   - Cost: pay-per-use, typically under $2 per research phase
   - Without this: I can still do research, but won't have live web data

3. **Google Gemini (optional)** -- handles quick sorting tasks at almost no cost
   - Go to: https://aistudio.google.com/apikey
   - Cost: free tier covers most usage
   - Without this: Claude handles it instead (works fine)

4. **OpenAI (optional)** -- enhances UX and content analysis
   - Go to: https://platform.openai.com/api-keys
   - Cost: pay-per-use, minimal
   - Without this: Claude handles it instead

**How to add your keys:**

Create a file called `.env` in your project folder. You can do this from your terminal:

    touch .env

Then open it in any text editor and add your keys, one per line:

    ANTHROPIC_API_KEY=paste-your-key-here
    PERPLEXITY_API_KEY=paste-your-key-here
    GOOGLE_GEMINI_API_KEY=paste-your-key-here
    OPENAI_API_KEY=paste-your-key-here

Save the file and restart this session. I'll pick up the keys automatically.

This file is private -- it's already in .gitignore so it won't be shared or uploaded anywhere.
```

If the user says they don't want to set up keys or can't right now:
```
No problem. I can still help -- I'll work in manual mode. I'll generate structured prompts
for each research step that you can copy and paste into any AI tool (ChatGPT, Claude.ai,
Gemini, etc.). You paste the results back and I continue the pipeline.

It takes a bit more hands-on work but produces the same quality output.
Ready to start?
```

### Step 3: First Project (after setup is confirmed)
```
Everything's connected and ready.

Tell me about your product idea -- it can be as simple as a single sentence
or as detailed as you'd like. I'll ask follow-up questions if I need more context.

Some examples of what people have built with RC Engine:
- "A SaaS dashboard for tracking marketing spend"
- "A mobile app for pet owners to find nearby vets"
- "An internal tool for our team to manage client onboarding"
```

### Step 4: Path Selection
Based on their response, offer the appropriate path:

```
[If idea is substantial and user seems non-technical:]
I recommend starting with the **Research phase** -- I'll run up to 20 specialized analysts
to study your idea from every angle (market, users, security, UX, and more).
This typically takes 15-30 minutes and produces a detailed requirements document.

[If idea is simple or user seems technical:]
We can go two ways:
1. **Full pipeline** -- Research first, then build (thorough, takes longer)
2. **Quick start** -- Skip research, go straight to building (faster, less analysis)

Which would you prefer?
```

## Returning Users

When a user has existing project state:
```
Welcome back! I found an existing project: [name]

Current status: [phase/stage in plain language]
Last action: [what was done]
Next step: [what needs to happen]

Ready to continue, or would you like to start a new project?
```

## Skip Option

If at any point during onboarding the user says something like "I know how this works" or
"just start", respect that:
```
Got it -- jumping straight to your project. What would you like to build?
```
