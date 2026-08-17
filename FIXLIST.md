# RC Engine Fix List

Consolidated from the 2026-08-14 dogfood evaluation and the 2026-08-17 architecture council ruling
(full ruling: `C:\tmp\rc-dogfood\RC-ENGINE-COUNCIL-RULING.md`, report: `C:\tmp\rc-dogfood\RC-ENGINE-GAP-REPORT.md`).
Sequencing is binding: test signal first, then state ownership, then the defect family. Do not reorder.

## Phase A: Test signal (do first) - DONE 2026-08-17

- [x] A1. PathValidator reason codes: `ValidationResult` gains machine-readable `reason` ('blocked' | 'outside-root' | 'domain-write'); tests assert outcomes and reason codes, never message phrasing.
- [x] A2. Windows-native blocklist: SystemRoot, System32, ProgramData, AppData credential stores, alongside the existing USERPROFILE set; case-fold `isBlocked` comparisons on win32 (NTFS is case-insensitive).
- [x] A3. Rewrite `tests/core/sandbox.test.ts` with mkdtemp-derived project roots and platform-derived blocked-path fixtures; parameterized pure-string tests for `isBlocked`/`isInsideProject` over `path.win32` and `path.posix`. Kills the 14 permanent Windows reds.
- [x] A4. Tool-guard fix: `tool-guard.ts` builds the validator per call rooted at the supplied `project_path` (today it is constructed once at `/`, which validates nothing).
- [x] A5. npm audit spawn fix in `security-scanner.ts` (`npm.cmd` / shell on win32); stop downgrading a permanent Windows failure to an Info finding.
- [x] A6. CI: add `windows-latest` job (Node 20), trim ubuntu matrix to [18, 22], widen triggers beyond [v2, main] to active dev branches + workflow_dispatch (today the founder's daily branches get zero CI).

## Phase B: State ownership (on a green suite) - DONE 2026-08-17

- [x] B1. Single-writer: `GraphCoordinator` gains `domainOwnsState` flag (default false); when set for RC, `persistResult` stops saving `rc:state` (per-node checkpoints and interrupt metadata untouched). Delete `mergeFreshState` outright. Move `rc_forge_all` failure bookkeeping from phase-tools into `orchestrator.forgeTask`.
- [x] B2. CAS tripwire: optional `expectedVersion` on `CheckpointStore.save` throwing typed `StaleStateError`; threaded through StateManager only (load caches version, save asserts). Unit test proves a deliberate second writer fails loudly. NOT wired into the coordinator (refuted by council skeptic).

## Phase C: Defect family - DONE 2026-08-17

- [x] C1. Gate 6 postcondition: refuse approval unless forge outputs exist (engine-generated files OR host-registered `rc_save` artifacts for passthrough), `force=true` bypass; `forgeTask` stops marking tasks complete with zero extracted files and no registered artifacts.
- [x] C2. rc_start ghost fix: persist state only after `execute()` succeeds (split create into build vs persist, or delete-on-throw); a stale markdown from a failed run must not trigger "Project already exists".
- [x] C3. Markdown export redesign: RC-STATE.md / POSTRC-STATE.md become on-demand exports (via rc_status / explicit export) with version+timestamp stamp and .tmp cleanup; remove fire-and-forget writes from save paths; migration fallback guarded (fires only when no checkpoint exists, logs loudly) so a stale markdown can never silently resurrect old state.
- [x] C4. Pipeline identity: normalize path in `derivePipelineId` (resolve + lowercase on win32) and store-factory cache key; one-time legacy-hash fallback migrates existing databases. Fixes the split-brain where `C:\...` and `c:\...` create two disjoint states for one project.

## Phase D: Docs and freeze - DONE 2026-08-17

- [x] D1. Autonomous mode frozen: README labels it experimental; startup log names active execution mode; passthrough documented as the supported daily driver.
- [x] D2. README note: exclude `.rc-engine` from OneDrive/Dropbox sync (SQLite WAL under file sync is a corruption vector).
- [x] D3. SECURITY note stating honestly that the sandbox is currently advisory (domain write-fences unenforced) until the guardedFs refactor ships.
- [x] D4. One state-ownership ADR shipped inside the Phase B PR. CONTRIBUTING line on platform-neutral test fixtures.

## Backlog (from dogfood report, not superseded by the council plan)

- [ ] E1. rc_forge_task validates task id in code before any LLM call; never renders "Complete" around a failure (also covers the passthrough junk-file bug where the prompt template's `path/to/file.ext` example is parsed as output).
- [ ] E2. Persist token/cost accounting to the same store as the audit log so rc_pipeline_status survives restarts.
- [ ] E3. Truncation guard for the OTHER three provider clients (Claude client done 2026-08-17; OpenAI/Gemini/Perplexity still unguarded).
- [ ] E4. Post-RC monitoring policy reads the PRD's constraints (offline requirement) before demanding SaaS observability.
- [ ] E5. Inject the real date into generation prompts (artifacts carry hallucinated dates).
- [ ] E6. postrc_gate description says "ship/no-ship" but validator accepts approve/reject/question; align.
- [ ] E7. Learning-intelligence project counter counts failed-start ghosts.
- [ ] E8. Capture the Architect phase's chosen tech stack into state (rc_status shows "not set"; markdown export embeds a hardcoded nextjs/postgres default).

## Explicitly killed by the council (do not resurrect without new evidence)

- CAS wiring into GraphCoordinator.persistResult (throws on every happy path).
- Fresh-state reload to protect recoverFromCrash (consumer is test-only dead code).
- POSIX-only test policy / skip-on-Windows (green-by-omission is the pathology).
- Standing ADR program (one ADR ships; the rest is ceremony for a solo repo).
- macOS CI leg, autonomous-mode test parity, stateless-orchestrator rewrite: deferred until a real user needs them.
- Full guardedFs choke-point refactor: real debt, scheduled after a second user exists (D3 documents the honest posture meanwhile).

Fixed already (branch fix/dogfood-critical-findings, 2026-08-17): double-save race tactical patch (superseded by B1), rc_init misroute, dotenv override, alias model id + 404 remediation, Claude-client truncation guard, diagram path display.
