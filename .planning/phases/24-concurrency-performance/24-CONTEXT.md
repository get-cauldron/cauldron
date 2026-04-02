# Phase 24: Concurrency & Performance - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Three independent fixes: (1) optimistic locking on bead completion with version-conditioned WHERE, (2) synchronous LLM usage recording so budget checks see actual spend, (3) N+1 query elimination in the projects list tRPC route. No user-facing UI changes.

Requirements: CONC-01, CONC-02, PERF-01.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — infrastructure phase. Key guidelines from research:

- **CONC-01 (bead completion locking):** Add `WHERE version = $current` to completeBead() in scheduler.ts. Check rowsAffected === 0 as conflict signal. No schema migration needed — version column already exists.
- **CONC-02 (sync usage recording):** Change recordUsageAsync() from fire-and-forget to awaited. Ensure errors propagate (not just `await` with swallowed catch). The latency cost is acceptable — budget accuracy matters more.
- **PERF-01 (N+1 projects list):** Replace the per-project queries in projects.ts with a single query using joins or subqueries. The events table now has indexes from Phase 22 that make this efficient.

</decisions>

<canonical_refs>
## Canonical References

### Engine files (modify)
- `packages/engine/src/decomposition/scheduler.ts` — completeBead() needs version-conditioned WHERE (CONC-01)
- `packages/engine/src/gateway/gateway.ts` — recordUsageAsync() needs to become synchronous (CONC-02)

### Web files (modify)
- `packages/web/src/trpc/routers/projects.ts` — N+1 query pattern (PERF-01)

### Research
- `.planning/research/FEATURES.md` — Optimistic locking pattern, sync recording approach
- `.planning/research/ARCHITECTURE.md` — N+1 query count analysis (41 queries for 20 projects)

</canonical_refs>

<code_context>
## Existing Code Insights

### Established Patterns
- claimBead() already uses version-conditioned optimistic locking — follow the same pattern for completeBead()
- Phase 22 events indexes enable efficient single-query projects list

### Integration Points
- Budget enforcement in gateway depends on accurate usage records
- projects.ts list route feeds the web dashboard project list

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase.

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>

---

*Phase: 24-concurrency-performance*
*Context gathered: 2026-04-02*
