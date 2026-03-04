# RC Engine Knowledge Files

This directory contains the methodology knowledge files that power RC Engine's pipeline.

## Community Mode (Default)

Without knowledge files, RC Engine runs in **community mode**:
- All 31 tools are available
- Tools operate in **passthrough mode** - they assemble structured prompts and return them for your IDE's AI to process
- You get the full pipeline structure, quality gates, and state management
- No API keys or knowledge files required

## Pro Mode

With RC Engine Pro knowledge files installed, you unlock **autonomous mode**:
- 20 AI research personas with specialized prompts and LLM routing
- 9 phase-specific methodology files (architecture patterns, quality gate reasoning, task generation rules)
- 8 UX specialist files (navigation, accessibility, interaction, hierarchy, copy, behavior, code, system design)
- 2 security anti-pattern databases with CWE references
- 2 monitoring/observability templates

### Install Pro Knowledge

```bash
# Option 1: Clone into knowledge directory
git clone git@github.com:originalrashmi/rc-engine-pro.git knowledge-pro
ln -sf knowledge-pro/* knowledge/

# Option 2: Set environment variable
export RC_KNOWLEDGE_PATH=/path/to/rc-engine-pro

# Option 3: Symlink
ln -sf /path/to/rc-engine-pro/pre-rc knowledge/pre-rc
ln -sf /path/to/rc-engine-pro/rc knowledge/rc
ln -sf /path/to/rc-engine-pro/post-rc knowledge/post-rc
```

### Verify

RC Engine logs its mode on startup:
```
[rc-engine] Knowledge: 46 files loaded (pro mode)
```

or

```
[rc-engine] Knowledge: community mode (passthrough only)
```

## License

- RC Engine (this repository): MIT
- RC Engine Pro (knowledge files): Proprietary - see rc-engine-pro LICENSE

For licensing: licensing@toerana.com
