# RC Engine Knowledge Files

This directory contains the methodology knowledge files that power RC Engine's pipeline.

## How It Works

RC Engine loads knowledge files from this directory at startup:
- 52 tools are registered across 4 domains - all available with no restrictions
- With knowledge files present, tools run in **autonomous mode** - calling LLMs directly with methodology-enriched prompts
- Without knowledge files, tools run in **passthrough mode** - assembling structured prompts for your IDE's AI to process

## Knowledge Structure

- **pre-rc/** - 20 AI research personas with specialized prompts and LLM routing
- **rc/** - Phase-specific methodology files (architecture patterns, quality gate reasoning, task generation rules)
- **post-rc/** - Security anti-pattern databases with CWE references, monitoring/observability templates

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

RC Engine (this repository): MIT
