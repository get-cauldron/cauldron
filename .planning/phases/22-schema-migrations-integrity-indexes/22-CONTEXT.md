# Phase 22: Schema Migrations — Integrity Indexes - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Add uniqueness constraints and composite indexes to existing tables as pure additive DB migrations. No application logic changes — this phase is schema-only. The constraints and indexes must be in place before any Phase 23+ code changes rely on them.

Requirements: DATA-01 (event sequence uniqueness), DATA-02 (events indexes), DATA-03 (seed version uniqueness), DATA-04 (bead_edges reverse index).

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

All implementation decisions are delegated to Claude. The user confirmed this is pure infrastructure work. Key design choices:

- **D-01: Data cleanup before constraints.** Use a two-phase migration approach: Migration A fixes any existing duplicate data (dedup event sequences per project, dedup seed versions per parent). Migration B adds the UNIQUE constraints. This prevents migration failure on populated dev/test DBs.

- **D-02: appendEvent sequence strategy.** Keep the existing `MAX()+1` pattern but now protected by the UNIQUE constraint. On constraint violation, retry with a fresh MAX query. This is simpler than switching to a serial/identity column and doesn't require changing the `sequenceNumber` column type. The UNIQUE constraint makes the race condition detectable rather than silent.

- **D-03: Migration granularity.** Two migrations total: (1) data cleanup + constraint additions (events unique, seed version partial unique, bead_edges index), (2) events composite indexes. Grouping constraints together is safe because they're all additive — none change existing behavior. Indexes are separate because they're purely read-path optimization and have zero rollback risk.

- **D-04: Seed version partial unique index.** Must use `WHERE parent_seed_id IS NOT NULL` because PostgreSQL treats `(NULL, 1)` as non-conflicting. Root seeds (parentId = NULL) are exempt from the version uniqueness constraint.

- **D-05: Schema declarations.** Add constraints/indexes to the Drizzle schema files (`event.ts`, `seed.ts`, `bead.ts`) using the established `(table) => ({})` callback pattern (same as `llm-usage.ts` and `asset-job.ts`). Then run `pnpm db:generate` to produce migration SQL.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Schema files (modify these)
- `packages/shared/src/db/schema/event.ts` — Events table, needs UNIQUE + indexes added
- `packages/shared/src/db/schema/seed.ts` — Seeds table, needs partial UNIQUE on (parentId, version)
- `packages/shared/src/db/schema/bead.ts` — bead_edges table, needs index on toBeadId

### Existing patterns (follow these)
- `packages/shared/src/db/schema/llm-usage.ts` — Established index pattern using `(table) => ({})` callback
- `packages/shared/src/db/schema/asset-job.ts` — Established unique constraint pattern

### Event store (affected by constraints)
- `packages/shared/src/db/event-store.ts` — `appendEvent()` uses MAX()+1 pattern (lines 85-93), needs retry-on-conflict after UNIQUE constraint is added

### Existing tests (must still pass)
- `packages/shared/src/db/__tests__/event-sourcing.integration.test.ts` — 7 tests covering appendEvent, sequence numbering, replay

### Migration infrastructure
- `packages/shared/src/db/migrations/` — 15 existing migrations (0000-0014), next is 0015

### Research
- `.planning/research/PITFALLS.md` — Pitfall about UNIQUE constraints failing on existing duplicates
- `.planning/research/STACK.md` — Drizzle constraint/index API patterns

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Drizzle `index()` and `unique()` API already used in `llm-usage.ts` and `asset-job.ts`
- `pnpm db:generate` produces migration SQL from schema changes
- `pnpm db:migrate` applies migrations

### Established Patterns
- Table callback pattern: `(table) => ({ indexName: index('name').on(table.col1, table.col2) })`
- Unique constraint pattern: `unique('name').on(table.col1, table.col2)`
- Integration tests run against real PostgreSQL on :5433 (Docker)

### Integration Points
- `appendEvent()` in `event-store.ts` must handle UNIQUE violation retries after constraint is added
- Seed data in `seed-data.ts` must not violate new constraints
- All existing integration tests must pass with new constraints in place

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. User delegated all implementation decisions to Claude.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 22-schema-migrations-integrity-indexes*
*Context gathered: 2026-04-01*
