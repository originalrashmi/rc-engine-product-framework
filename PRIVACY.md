# Privacy Policy

**RC Engine** — AI-Native Product Development Pipeline
**Effective Date:** March 5, 2026
**Last Updated:** March 5, 2026

## Overview

RC Engine is an MCP (Model Context Protocol) server that runs locally on your machine. This policy explains how your data is handled.

## Data Processing

### What stays local (never leaves your machine)

- All project files, source code, and generated artifacts
- Pipeline state and checkpoint data (stored in `.rc-engine/` within your project)
- License keys and API keys (stored in your project's `.rc-engine/` directory)
- Audit logs and activity records

### What is sent to external services

- **LLM API calls:** When RC Engine operates in automatic mode, it sends project context (descriptions, requirements, code snippets you provide as input) to the LLM provider you have configured (Claude, OpenAI, Gemini, or Perplexity). These calls use your own API keys and are governed by each provider's privacy policy.
- **No user code is sent without your action.** LLM calls only occur when you invoke a tool that requires AI analysis. Read-only tools (status checks, pipeline overview) make no external calls.

### What is never collected

- Personal information (name, email, address)
- Browsing history or tracking cookies
- Project source code (beyond what you explicitly pass to AI-powered tools)
- Your API keys (these are read locally and passed directly to providers)

## Telemetry

RC Engine includes optional, anonymous telemetry that tracks:

- Tool name invoked (e.g., `rc_start`, `postrc_scan`)
- Tier level (free, starter, pro)
- Timestamp
- Operating system and Node.js version

Telemetry does **not** include:

- Project paths, file contents, or code
- API keys or credentials
- Personal or identifying information
- Any data from your project

Telemetry helps us understand which tools are used most and on which platforms. It can be disabled by setting the `RC_ENGINE_TELEMETRY=false` environment variable.

## Third-Party Services

RC Engine integrates with the following third-party LLM providers when you provide their API keys:

| Provider | Privacy Policy |
|----------|---------------|
| Anthropic (Claude) | https://www.anthropic.com/privacy |
| OpenAI | https://openai.com/privacy |
| Google (Gemini) | https://ai.google.dev/terms |
| Perplexity | https://www.perplexity.ai/privacy |

Your interactions with these services are governed by their respective privacy policies. RC Engine does not store or log the responses from these providers beyond the generated artifacts saved to your project directory.

## Data Retention

- **Local data:** Retained on your machine until you delete it. Uninstalling RC Engine does not automatically delete project artifacts.
- **Telemetry data:** Retained for up to 12 months, then aggregated or deleted.

## Children's Privacy

RC Engine is not directed at children under 13 and does not knowingly collect information from children.

## Changes to This Policy

We may update this policy from time to time. Changes will be noted by updating the "Last Updated" date above and included in release notes.

## Contact

For privacy-related questions or concerns:

- **GitHub Issues:** https://github.com/originalrashmi/rc-engine-product-framework/issues
- **Email:** privacy@toerana.com
