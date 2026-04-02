# Phase 23: FK Cascade Strategy - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Assign CASCADE or SET NULL to every foreign key relationship based on structural vs. audit table classification. Deleting a project removes structural child rows (beads, bead_edges, holdout_vault, asset_jobs) and nullifies audit references (llm_usage, events). Requires a Drizzle migration altering FK constraints.

Requirements: DATA-05.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Key guidelines from research:

- **CASCADE** for structural rows: beads, bead_edges, holdout_vault, asset_jobs — these have no value without their parent project
- **SET NULL** for audit tables: llm_usage, events — cost history and event logs must survive project deletion for reporting
- FK cascade graph runs 4 levels deep: projects → seeds → beads → bead_edges. Map the full graph before writing SQL.
- seeds.parentId (self-referencing FK) should use SET NULL — evolution lineage should not cascade-delete child seeds when a parent is deleted
- interviews table FK to projects should CASCADE (interviews have no value without project)
- snapshots table FK to projects should CASCADE (derived state, regenerable)
- Use a single migration for all FK changes (ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT pattern)
- Integration tests must verify: (1) structural rows deleted, (2) audit rows preserved with NULL project_id, (3) row counts unchanged for audit tables

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Schema files (modify these)
- `packages/shared/src/db/schema/project.ts` — Projects table (cascade source)
- `packages/shared/src/db/schema/seed.ts` — Seeds table (FK to projects, self-ref FK)
- `packages/shared/src/db/schema/bead.ts` — Beads + bead_edges (FK to seeds, FK to beads)
- `packages/shared/src/db/schema/event.ts` — Events table (FK to projects — SET NULL)
- `packages/shared/src/db/schema/llm-usage.ts` — LLM usage (FK to projects — SET NULL)
- `packages/shared/src/db/schema/holdout.ts` — Holdout vault (FK to seeds — CASCADE)
- `packages/shared/src/db/schema/asset-job.ts` — Asset jobs (FK to projects — CASCADE)
- `packages/shared/src/db/schema/interview.ts` — Interviews (FK to projects — CASCADE)
- `packages/shared/src/db/schema/snapshot.ts` — Snapshots (FK to projects — CASCADE)

### Research
- `.planning/research/PITFALLS.md` — FK cascade graph depth warning, SET NULL for audit tables
- `.planning/research/ARCHITECTURE.md` — Two-migration strategy (Phase 22 additive, Phase 23 behavioral)

### Existing migrations
- `packages/shared/src/db/migrations/0000_mixed_blue_shield.sql` — Original FK definitions (all ON DELETE NO ACTION)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Drizzle `.references(() => table.id, { onDelete: 'cascade' })` syntax for FK declarations
- Phase 22 established the migration generation pattern: modify schema files, run `pnpm db:generate`

### Established Patterns
- All FKs currently use ON DELETE NO ACTION (the Drizzle default)
- projects table has soft-delete via `deletedAt` column (migration 0012)

### Integration Points
- Soft-delete at application level (project.deletedAt) vs hard-delete at DB level — the CASCADE/SET NULL rules apply to hard deletes
- Event store `appendEvent` references project_id — must handle NULL after SET NULL

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 23-fk-cascade-strategy*
*Context gathered: 2026-04-02*
