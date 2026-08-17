# ADR-001: StateManager is the sole writer of rc:state

Date: 2026-08-17. Status: accepted (council ruling; full record in the dogfood report).

## Context

The RC domain had multiple writers to the shared `rc:state` record: the Orchestrator (via StateManager) saved during phase methods, and the GraphCoordinator re-saved whatever state its node handlers returned. Handlers held a pre-run snapshot, so the coordinator's save was the orchestrator's save minus the phase's mutations. Observed: `state.artifacts` wiped within the same second after every phase, hard-blocking Phase 4 ("No PRD found" with the PRD on disk).

## Decision

1. The Orchestrator, through StateManager, is the ONLY writer of `rc:state`. The GraphCoordinator runs with `domainOwnsState: true` and never saves the shared record (its per-node checkpoints and interrupt metadata are unaffected).
2. `CheckpointStore.save` accepts an optional `expectedVersion`; StateManager threads it (load caches the version, save asserts it). A mismatch throws `StaleStateError`. This is a tripwire: after (1), conflicts are exceptional, so any future second writer, in-process or cross-process, fails loudly instead of silently clobbering.
3. Tools never write `rc:state` directly; state mutations go through Orchestrator methods (e.g. `markForgeTaskFailed`).

## Consequences

- The artifact-wipe class of bug is impossible by construction, not patched.
- Markdown state files are on-demand read models (ADR-6 in the council ruling), never save side effects, and never silently re-imported over a live checkpoint store.
- Rejected alternatives: CAS wired into the coordinator (throws on every happy path), merge-on-save patches (institutionalize the second writer), stateless orchestrator rewrite (unnecessary for a solo-maintained engine).
