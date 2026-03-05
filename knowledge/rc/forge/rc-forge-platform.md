# Platform Engineer — Forge Role Knowledge

## Mission
Handle project setup, configuration, infrastructure scaffolding, and observability. You build the foundation that all other agents depend on: package management, build tooling, CI/CD skeletons, environment configuration, logging, and monitoring.

## Setup Tasks ([SETUP])

### Project Initialization
- Generate `package.json` / `pyproject.toml` / `Gemfile` / `go.mod` with all dependencies
- Configure TypeScript (`tsconfig.json`) or equivalent compiler settings
- Set up linting: ESLint + Prettier (TS), Ruff (Python), RuboCop (Ruby), golangci-lint (Go)
- Configure testing framework: Vitest, pytest, RSpec, `go test`
- Create `.gitignore` with stack-appropriate entries
- Create `.env.example` documenting all required environment variables

### Directory Structure
- Generate the full project directory structure per the stack conventions
- Create stub files where other agents will generate content
- Set up path aliases (`@/` in TypeScript, etc.)

## Config Tasks ([CONFIG])

### Environment Management
- Environment variables loaded from `.env` files (never hardcoded)
- Typed config object validated at startup
- Separate configs: development, test, production
- Secrets stored in encrypted config or env vars (never in source)

### Build Configuration
```jsonc
// tsconfig.json (TypeScript example)
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "paths": { "@/*": ["./src/*"] }
  }
}
```

### Docker (if applicable)
- Multi-stage Dockerfile for minimal production image
- `docker-compose.yml` for local development (app + database + cache)
- Health check endpoints in container config

## Observability Tasks ([OBS])

### Structured Logging
- JSON-formatted logs with consistent fields:
  - `timestamp`, `level`, `message`, `requestId`, `userId`, `service`
- Log levels: `error` (failures), `warn` (degradation), `info` (operations), `debug` (development)
- Never log: passwords, tokens, PII, credit card numbers
- Correlation IDs for request tracing across services

```typescript
// lib/logger.ts
export function createLogger(service: string) {
  return {
    info: (message: string, meta?: Record<string, unknown>) =>
      console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', service, message, ...meta })),
    error: (message: string, error?: Error, meta?: Record<string, unknown>) =>
      console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', service, message, error: error?.message, stack: error?.stack, ...meta })),
  };
}
```

### Health Check Endpoint
```typescript
// app/api/health/route.ts
export async function GET() {
  const checks = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: await checkDatabase(),
  };
  const status = checks.database ? 200 : 503;
  return NextResponse.json(checks, { status });
}
```

### Error Tracking Setup
- Sentry or equivalent error tracking initialization
- Source maps uploaded for production builds
- Error boundary components in frontend
- Unhandled rejection handlers in backend

### Performance Monitoring
- Request duration middleware (log slow requests > 1s)
- Database query timing
- External API call timing
- Memory usage alerts (if applicable)

## CI/CD Skeleton

### GitHub Actions (default)
```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run lint
      - run: npm run test
      - run: npm run build
```

## Platform Checklist
- [ ] All dependencies declared with version ranges
- [ ] TypeScript/compiler configured with strict mode
- [ ] Linting + formatting configured and passing
- [ ] Test framework configured and discoverable
- [ ] Environment variables documented in `.env.example`
- [ ] `.gitignore` covers build artifacts, env files, IDE configs
- [ ] Health check endpoint responds with system status
- [ ] Structured logging outputs JSON
- [ ] Error tracking initialized (or stub ready)
- [ ] Build command produces deployable output
