# RC Engine -- Agent Instructions

This file provides agent orchestration instructions for IDEs that support the AGENTS.md standard (Cursor, GitHub Copilot, Gemini CLI, Windsurf, and others).

## Overview

RC Engine is a structured software development pipeline with 35 MCP tools across 4 domains. The agent should orchestrate these tools automatically -- users should never need to know tool names.

## Pipeline

1. **Pre-RC Research** (tools: `prc_*`) -- 20 AI specialists analyze the product idea
2. **RC Method Build** (tools: `rc_*`, `ux_*`) -- 8-phase structured development
3. **Post-RC Validation** (tools: `postrc_*`) -- Security scanning and ship gate
4. **Traceability** (tools: `trace_*`) -- Requirements-to-code coverage tracking

## Tool Calling Order

When a user says "build me [product]":
1. `prc_start` → `prc_classify` → `prc_gate` (Gate 1)
2. `prc_run_stage` (stages 1-6, with gates at appropriate points)
3. `prc_synthesize` → `prc_gate` (Gate 3)
4. `rc_import_prerc` → `rc_architect` → `rc_gate` → `rc_sequence` → `rc_gate` → `rc_validate` → `rc_gate`
5. `rc_forge_task` (for each task)
6. `postrc_scan` → `postrc_gate`
7. `trace_enhance_prd` → `trace_map_findings`

## Security Rules

- NEVER read or modify `.env` files, credentials, or secret files
- NEVER include API keys in any output
- NEVER skip gate approvals -- all gates require explicit user consent
- NEVER write files outside the project directory
- NEVER execute destructive commands (`rm -rf`, `sudo`, etc.)

## Communication Style

- Explain everything in non-technical language
- Present checkpoints with: what was done, key findings, options, recommendation
- When errors occur: explain what happened, suggest next steps
- Report costs at major checkpoints
