# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x (v2 branch) | Yes |
| < 1.0 | No |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, report vulnerabilities privately:

1. Email **security@toerana.com** with:
   - Description of the vulnerability
   - Steps to reproduce
   - Affected versions
   - Potential impact

2. You will receive an acknowledgment within 48 hours.

3. We will work with you to understand and resolve the issue before any public disclosure.

## Security Considerations

### API Key Handling

RC Engine requires API keys for LLM providers. These keys are handled securely:

- Keys are read from `.env` files at the project root
- `.env` files are included in `.gitignore` and will never be committed
- Keys are never logged, displayed in output, or included in generated artifacts
- The `.claude/settings.json` explicitly denies read/write access to `.env`, `*.pem`, `*.key`, and `credentials.json` files

### Data Handling

- All project data stays on your local machine (or your server if self-hosted)
- LLM API calls send project context to the configured providers (Anthropic, OpenAI, Google, Perplexity)
- No telemetry or analytics data is collected by RC Engine
- Generated artifacts (PRDs, code, reports) are stored in your project directory

### Authentication (Web UI)

- The Web UI uses magic link email authentication by default
- `RC_AUTH_BYPASS=true` disables auth entirely -- use only for local development
- Rate limiting is applied to all API endpoints via `express-rate-limit`
- CORS is configurable via `ALLOWED_ORIGINS`
- Security headers are applied via `helmet`

### Post-RC Security Scanning

RC Engine includes built-in security scanning (Post-RC domain) that checks generated code against OWASP anti-patterns with CWE references. This is a design-time tool, not a replacement for production security auditing.

## Dependencies

We monitor dependencies for known vulnerabilities. If you discover a vulnerability in one of our dependencies, please report it to us so we can assess the impact.
