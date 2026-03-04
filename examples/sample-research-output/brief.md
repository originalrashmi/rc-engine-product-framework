# Product Brief: Post-RC Security Gate

**Created:** 2026-02-13T03:49:34.736Z

## Description

## Post-RC Security Gate — AI Code Security Validation Phase

## Full Input

## Post-RC Security Gate — AI Code Security Validation Phase

### Context
The RC Method (rc_start → rc_illuminate → rc_define → rc_architect → rc_sequence → rc_validate → rc_forge_task → rc_gate) is our structured approach for building features and products using AI-assisted development. However, after rc_gate passes and code is generated via rc_forge_task, there is NO security validation layer to catch the well-documented vulnerabilities that AI coding tools consistently produce.

Research from 150+ sources (compiled by Arcanum-Sec/sec-context) shows:
- 86% failure rate for XSS prevention in AI-generated code
- 72% of Java AI code contains security flaws
- AI-written code is 2.74x more prone to XSS than human equivalents
- 81% of organizations have deployed vulnerable AI code to production
- 5-21% of AI-suggested packages don't exist (slopsquatting/typosquatting risk)
- Thousands of SQL injection patterns exist in AI training data

### What We Want to Build
A **Post-RC Security Gate** that integrates into the RC Method workflow as a new phase AFTER rc_forge_task completes. This phase will:

1. **Security Scan Phase** — Automatically validate generated code against 25+ documented AI anti-patterns from the sec-context knowledge base, organized in 7 categories:
   - Secrets and Credentials Management (CWE-798, CWE-259)
   - Injection Vulnerabilities (CWE-89, CWE-78, CWE-90, etc.)
   - Cross-Site Scripting XSS (CWE-79, CWE-80)
   - Authentication and Session Management (CWE-287, CWE-384, etc.)
   - Cryptographic Failures (CWE-327, CWE-328, etc.)
   - Input Validation (CWE-20, CWE-1284, etc.)
   - Additional: File uploads (CWE-434), path traversal (CWE-22), CORS (CWE-346), debug mode (CWE-215)

2. **Risk Assessment** — Score each finding by severity (Critical/High/Medium) and provide remediation guidance using the GOOD patterns from sec-context.

3. **Security Gate Decision** — Block deployment if Critical findings exist, warn on High, pass on Medium-only. Produce a security report artifact.

4. **Integration with RC Method MCP** — New MCP tools: `rc_security_scan`, `rc_security_report`, `rc_security_gate` that extend the existing RC Method server.

### Technical Context
- The RC Method MCP server is a Node.js + TypeScript MCP server
- It runs in passthrough mode (assembling context for host IDE) or autonomous mode (calling Claude directly)
- The sec-context knowledge base is two markdown files: ANTI_PATTERNS_BREADTH.md (~65K tokens) and ANTI_PATTERNS_DEPTH.md (~100K tokens)
- The security gate would use these documents as reference context when analyzing code output from rc_forge_task
- Target users: Developers using the RC Method for AI-assisted development who want security guardrails before shipping

### Key Questions to Research
- How should the security scan consume the sec-context documents (full injection vs. RAG vs. targeted extraction)?
- What's the right balance between thoroughness and token cost?
- Should this be a separate MCP server or integrated into the existing RC Method server?
- How to handle false positives without creating friction?
- What existing SAST/DAST tools should complement the AI-based scan?
- How to make the security gate configurable per project (e.g., skip crypto checks for a frontend-only project)?
