# Phase 25: Process Reliability & Transactions - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Three independent reliability fixes: (1) enforced timeout supervisor that kills hung agent processes, (2) holdout failure rollback preventing partial-success after crystallization, (3) React error boundary around DAGCanvas. Mix of engine and web work.

Requirements: CONC-03, CONC-04, SEC-03.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion. Key guidelines from research:

- **CONC-03 (timeout enforcement):** TimeoutSupervisor needs a `setKillTarget(proc: ChildProcess)` method. On hard timeout, send SIGTERM, wait 5s, then SIGKILL. Agent-runner.ts must wire the spawned process to the supervisor. Read agent-runner.ts to understand the spawn mechanism before implementing.
- **CONC-04 (holdout rollback):** If holdout generation fails after crystallization, either delete the seed or mark it as `draft` (un-crystallize). Read the crystallize call site in interview router to understand the transaction boundary. The key is: don't return success with a seedId if holdout generation failed.
- **SEC-03 (error boundary):** Use `react-error-boundary` package (the only new dependency in v1.2). Wrap DAGCanvas in an ErrorBoundary with a fallback UI that shows an error message without crashing the execution page.

</decisions>

<canonical_refs>
## Canonical References

### Engine files (CONC-03)
- `packages/engine/src/execution/timeout-supervisor.ts` — Current timeout implementation (advisory only)
- `packages/engine/src/execution/agent-runner.ts` — Agent process spawn mechanism (MUST READ before planning)

### Web files (CONC-04)
- `packages/web/src/trpc/routers/interview.ts` — Crystallize + holdout generation call site (MUST READ before planning)

### Engine files (CONC-04)
- `packages/engine/src/holdout/vault.ts` — Holdout vault operations

### Web files (SEC-03)
- `packages/web/src/app/projects/[id]/execution/page.tsx` — DAGCanvas rendering location (or similar)

### Research
- `.planning/research/FEATURES.md` — Timeout enforcement pattern (SIGTERM → 5s → SIGKILL)
- `.planning/research/STACK.md` — react-error-boundary ^4.1.2

</canonical_refs>

<code_context>
## Existing Code Insights

### Integration Points
- TimeoutSupervisor is used by agent-runner.ts during bead execution
- Interview router handles crystallize → holdout generation sequence
- DAGCanvas is rendered in the execution page

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>

---

*Phase: 25-process-reliability-transactions*
*Context gathered: 2026-04-02*
