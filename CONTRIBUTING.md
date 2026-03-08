# Contributing to RC Engine

Thank you for your interest in contributing to RC Engine.

## Getting Started

### Prerequisites

- Node.js 18+
- npm (included with Node.js)

### Development Setup

```bash
git clone -b v2 https://github.com/originalrashmi/rc-engine.git
cd rc-engine
npm install
```

### Running Checks

```bash
npm run check        # Full suite: typecheck + lint + format + test
npm run lint         # ESLint only
npm run lint:fix     # ESLint with auto-fix
npm run format       # Prettier format
npm run format:check # Prettier check
npm test             # Vitest
npm run test:watch   # Vitest in watch mode
npm run build        # TypeScript compilation
```

All checks must pass before submitting a PR.

## Code Conventions

### TypeScript

- Strict mode, ES2022 target, Node16 modules
- `import type` for type-only imports (enforced by ESLint)
- Prefix unused params with `_`
- Async/await for all I/O (no sync fs in new code)
- Zod schemas for all external input validation
- Explicit error types -- no catch-all with silent defaults

### Architecture

RC Engine uses domain-driven design:

```
src/
  domains/
    pre-rc/    # Research pipeline (7 tools)
    rc/        # Build pipeline (17 tools)
    post-rc/   # Validation pipeline (7 tools)
    traceability/  # Audit pipeline (3 tools)
  shared/      # LLM clients, config, types, token tracking
  core/        # Graph engine, state management, plugins
```

Each domain owns its tools, agents, state management, and types. Domains communicate only through the alpha agent orchestration layer.

### State Management

- All state goes through the checkpoint store (SQLite, WAL mode)
- State is Zod-validated on read -- corruption throws, never silently resets
- Atomic writes prevent half-written state
- Every state change creates a checkpoint

### Testing

- Vitest for unit and integration tests
- Test files co-located: `*.test.ts` next to source
- Coverage target: 80% overall, 100% for state management and sandbox

### Error Handling

- Tool errors return user-friendly messages, not stack traces
- LLM failures fall back gracefully: preferred provider -> Claude -> passthrough
- State errors are loud -- never swallow, always report

## Pull Request Process

1. **Branch from `v2`** -- this is the active development branch
2. **Run `npm run check`** before submitting -- all checks must pass
3. **Write tests** for new functionality
4. **Keep PRs focused** -- one feature or fix per PR
5. **Write clear commit messages** that describe why, not just what

### PR Title Format

```
feat: add new research persona for regulatory analysis
fix: handle empty PRD in traceability mapper
docs: update getting started guide for MCP mode
refactor: extract shared LLM retry logic
test: add integration tests for graph coordinator
```

## Reporting Issues

- **Bugs**: Use the [bug report template](https://github.com/originalrashmi/rc-engine/issues/new?template=bug_report.md)
- **Features**: Use the [feature request template](https://github.com/originalrashmi/rc-engine/issues/new?template=feature_request.md)
- **Security**: See [SECURITY.md](SECURITY.md) -- do not open public issues for vulnerabilities

## Git Workflow

- `main` -- stable releases
- `v2` -- active development (branch from here)
- Feature branches from `v2`, PR back to `v2`
- Merge `v2` -> `main` at milestone completions

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
