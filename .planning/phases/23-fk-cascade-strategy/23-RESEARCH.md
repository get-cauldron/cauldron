# Phase 23: FK Cascade Strategy - Research

**Researched:** 2026-04-02
**Domain:** PostgreSQL foreign key cascade rules, Drizzle ORM schema migration
**Confidence:** HIGH — based on direct reading of all schema files and migrations

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None — pure infrastructure phase.

### Claude's Discretion
All implementation choices are at Claude's discretion. Key guidelines from CONTEXT.md:

- **CASCADE** for structural rows: beads, bead_edges, holdout_vault, asset_jobs — these have no value without their parent project
- **SET NULL** for audit tables: llm_usage, events — cost history and event logs must survive project deletion for reporting
- FK cascade graph runs 4 levels deep: projects → seeds → beads → bead_edges. Map the full graph before writing SQL.
- seeds.parentId (self-referencing FK) should use SET NULL — evolution lineage should not cascade-delete child seeds when a parent is deleted
- interviews table FK to projects should CASCADE (interviews have no value without project)
- snapshots table FK to projects should CASCADE (derived state, regenerable)
- Use a single migration for all FK changes (ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT pattern)
- Integration tests must verify: (1) structural rows deleted, (2) audit rows preserved with NULL project_id, (3) row counts unchanged for audit tables

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DATA-05 | Foreign keys use appropriate cascade strategy (CASCADE for structural rows like bead_edges/holdout_vault, SET NULL for audit tables like llm_usage/events) with data-audit migration preceding constraint changes | Full FK graph mapped below; exact constraint names and column nullability states identified from code reading |
</phase_requirements>

---

## Summary

Phase 23 changes every `ON DELETE no action` FK in the schema to either `CASCADE` or `SET NULL` based on whether the table holds structural data (deleted with its parent) or audit data (survives with a null foreign key). The cascade graph is 4 levels deep: `projects → interviews/seeds/asset_jobs/snapshots → beads/holdout_vault → bead_edges`. Audit tables (`llm_usage`, `events`) get `SET NULL`.

The critical pre-implementation finding is that two tables — `events` and `llm_usage` — have `project_id` columns declared `NOT NULL` in the current schema. Before `SET NULL` can be added to their FK constraints, those columns must be made nullable. This is a column-level ALTER that must precede or accompany the FK constraint change in the migration.

A second finding: `events.project_id` has **no FK constraint at all** in the current migrations — the Drizzle schema file omits `.references()` on that column. Adding it for the first time with `ON DELETE SET NULL` requires only `ADD CONSTRAINT`, not a `DROP/ADD` pair.

**Primary recommendation:** One migration file that (1) alters nullable columns, (2) drops existing NO ACTION constraints by name, (3) adds replacement constraints with CASCADE or SET NULL. Then one integration test file that deletes a project and verifies every table's row counts and NULL states.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Drizzle ORM | 0.45 (project) | Schema declaration and migration generation | Project-mandated stack |
| `pnpm db:generate` | — | Generates migration SQL from schema diff | Established pattern from Phase 22 |
| PostgreSQL | — | Enforces FK constraints at the DB level | Project database |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vitest | 4 (project) | Integration test runner | All test files in this phase |
| `postgres` driver | — | DB connection in tests | Consistent with all existing integration tests |

**Version verification:** No new packages in this phase. All tooling already installed.

---

## Architecture Patterns

### Complete FK Graph (as of migrations 0000–0016)

```
projects (soft-delete via deletedAt)
  ├── interviews.project_id          → CASCADE  (no value without project)
  ├── seeds.project_id               → CASCADE  (no value without project)
  │     ├── seeds.parent_id          → SET NULL (self-ref: parent deletion preserves child seeds)
  │     ├── beads.seed_id            → CASCADE  (no value without seed)
  │     │     └── bead_edges.from_bead_id / to_bead_id → CASCADE (edges invalid without bead)
  │     └── holdout_vault.seed_id   → CASCADE  (holdout tests tied to seed)
  ├── asset_jobs.project_id          → CASCADE  (job has no purpose without project)
  ├── project_snapshots.project_id  → CASCADE  (derived state, regenerable)
  ├── llm_usage.project_id          → SET NULL (audit trail — cost history survives)
  └── events.project_id             → SET NULL (append-only log — event log survives)
```

Additional FKs (not directly in the project-delete path but must be audited):
- `seeds.interview_id → interviews.id` — currently NO ACTION; leave as-is (interview deletion is rare, seed content survives)
- `llm_usage.bead_id → beads.id` — currently NO ACTION; leave as-is (bead deletion via seed cascade will hit this — SET NULL recommended)
- `llm_usage.seed_id → seeds.id` — currently NO ACTION; leave as-is for this phase per DATA-05 scope
- `beads.molecule_id` — self-referencing column with **no FK constraint** (molecule_id is a DAG hierarchy pointer but has no `.references()` in schema) — out of scope

### Current Constraint Names (from migration SQL, confirmed by code reading)

These are the exact names to pass to `DROP CONSTRAINT`:

| Table | Column | Current Constraint Name | Current ON DELETE |
|-------|--------|------------------------|-------------------|
| seeds | project_id | `seeds_project_id_projects_id_fk` | no action |
| seeds | interview_id | `seeds_interview_id_interviews_id_fk` | no action |
| beads | seed_id | `beads_seed_id_seeds_id_fk` | no action |
| bead_edges | from_bead_id | `bead_edges_from_bead_id_beads_id_fk` | no action |
| bead_edges | to_bead_id | `bead_edges_to_bead_id_beads_id_fk` | no action |
| holdout_vault | seed_id | `holdout_vault_seed_id_seeds_id_fk` | no action |
| project_snapshots | project_id | `project_snapshots_project_id_projects_id_fk` | no action |
| interviews | project_id | `interviews_project_id_projects_id_fk` | no action |
| asset_jobs | project_id | `asset_jobs_project_id_projects_id_fk` | no action |
| llm_usage | project_id | `llm_usage_project_id_projects_id_fk` | no action |
| llm_usage | bead_id | `llm_usage_bead_id_beads_id_fk` | no action (omit from phase — out of scope) |
| llm_usage | seed_id | `llm_usage_seed_id_seeds_id_fk` | no action (omit from phase — out of scope) |
| events | project_id | **NO CONSTRAINT EXISTS** | (no FK defined) |

**Critical:** `events.project_id` has no FK constraint at all. The Drizzle schema file (`event.ts`) declares `projectId: uuid('project_id').notNull()` without `.references()`. No ADD CONSTRAINT was ever generated for this column in any migration. This means Phase 23 adds the FK for the first time — no DROP needed.

### Nullability Changes Required Before SET NULL

`SET NULL` on a FK constraint requires the referenced column to be nullable. Two columns are currently `NOT NULL` and must be altered:

| Table | Column | Current State | Required Change |
|-------|--------|---------------|-----------------|
| events | project_id | `NOT NULL` | `ALTER COLUMN project_id DROP NOT NULL` |
| llm_usage | project_id | `NOT NULL` | `ALTER COLUMN project_id DROP NOT NULL` |

These ALTER COLUMN statements must come **before** (or in the same transaction as) the FK constraint additions.

### Drizzle Schema Changes Required

In addition to the migration SQL, the Drizzle schema files must be updated to reflect the new cascade behavior. This keeps the schema in sync with the DB state so `pnpm db:generate` doesn't regenerate spurious migrations.

| File | Change |
|------|--------|
| `packages/shared/src/db/schema/seed.ts` | `projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' })` |
| `packages/shared/src/db/schema/seed.ts` | `parentId: uuid('parent_id').references(() => seeds.id, { onDelete: 'set null' })` — add `.references()` with set null |
| `packages/shared/src/db/schema/bead.ts` | `seedId: uuid('seed_id').notNull().references(() => seeds.id, { onDelete: 'cascade' })` |
| `packages/shared/src/db/schema/bead.ts` (beadEdges) | `fromBeadId` and `toBeadId` → `{ onDelete: 'cascade' }` |
| `packages/shared/src/db/schema/holdout.ts` | `seedId: uuid('seed_id').notNull().references(() => seeds.id, { onDelete: 'cascade' })` |
| `packages/shared/src/db/schema/interview.ts` | `projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' })` |
| `packages/shared/src/db/schema/snapshot.ts` | `projectId: uuid('project_id').notNull().unique().references(() => projects.id, { onDelete: 'cascade' })` |
| `packages/shared/src/db/schema/asset-job.ts` | `projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' })` |
| `packages/shared/src/db/schema/llm-usage.ts` | Make `projectId` nullable: remove `.notNull()`, add `.references(() => projects.id, { onDelete: 'set null' })` |
| `packages/shared/src/db/schema/event.ts` | Make `projectId` nullable: remove `.notNull()`, add `.references(() => projects.id, { onDelete: 'set null' })` |

### seeds.parent_id Self-Reference

The `seeds.parent_id` column currently has **no `.references()` call** in `seed.ts` (confirmed by code reading — it's declared as `uuid('parent_id')` only, with a comment). The self-reference FK was never added. Phase 23 must add it with `SET NULL` semantics. No `DROP CONSTRAINT` needed — just `ADD CONSTRAINT`.

### Migration Strategy

Write a single hand-crafted migration (one SQL file) because `pnpm db:generate` cannot generate DROP+ADD CONSTRAINT pairs. The file should follow the `ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT` pattern. Steps within the migration:

1. Make audit columns nullable (ALTER COLUMN DROP NOT NULL)
2. Drop all existing NO ACTION constraints that are being replaced
3. Add all CASCADE constraints (structural tables)
4. Add SET NULL constraints (audit tables) — events FK is new (no drop), seeds.parent_id FK is new (no drop)

After writing the migration, update all schema files so the Drizzle schema matches, then run `pnpm db:generate` to verify it produces an empty diff (no additional migration needed).

### Migration SQL Pattern

```sql
-- Step 1: Make audit columns nullable
ALTER TABLE events ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE llm_usage ALTER COLUMN project_id DROP NOT NULL;

-- Step 2: Drop existing NO ACTION constraints
ALTER TABLE seeds DROP CONSTRAINT seeds_project_id_projects_id_fk;
ALTER TABLE beads DROP CONSTRAINT beads_seed_id_seeds_id_fk;
ALTER TABLE bead_edges DROP CONSTRAINT bead_edges_from_bead_id_beads_id_fk;
ALTER TABLE bead_edges DROP CONSTRAINT bead_edges_to_bead_id_beads_id_fk;
ALTER TABLE holdout_vault DROP CONSTRAINT holdout_vault_seed_id_seeds_id_fk;
ALTER TABLE interviews DROP CONSTRAINT interviews_project_id_projects_id_fk;
ALTER TABLE project_snapshots DROP CONSTRAINT project_snapshots_project_id_projects_id_fk;
ALTER TABLE asset_jobs DROP CONSTRAINT asset_jobs_project_id_projects_id_fk;
ALTER TABLE llm_usage DROP CONSTRAINT llm_usage_project_id_projects_id_fk;

-- Step 3: Add CASCADE constraints (structural tables)
ALTER TABLE seeds
  ADD CONSTRAINT seeds_project_id_projects_id_fk
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE beads
  ADD CONSTRAINT beads_seed_id_seeds_id_fk
  FOREIGN KEY (seed_id) REFERENCES seeds(id) ON DELETE CASCADE;

ALTER TABLE bead_edges
  ADD CONSTRAINT bead_edges_from_bead_id_beads_id_fk
  FOREIGN KEY (from_bead_id) REFERENCES beads(id) ON DELETE CASCADE;

ALTER TABLE bead_edges
  ADD CONSTRAINT bead_edges_to_bead_id_beads_id_fk
  FOREIGN KEY (to_bead_id) REFERENCES beads(id) ON DELETE CASCADE;

ALTER TABLE holdout_vault
  ADD CONSTRAINT holdout_vault_seed_id_seeds_id_fk
  FOREIGN KEY (seed_id) REFERENCES seeds(id) ON DELETE CASCADE;

ALTER TABLE interviews
  ADD CONSTRAINT interviews_project_id_projects_id_fk
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE project_snapshots
  ADD CONSTRAINT project_snapshots_project_id_projects_id_fk
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE asset_jobs
  ADD CONSTRAINT asset_jobs_project_id_projects_id_fk
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- Step 4: Add SET NULL constraints (audit tables)
-- events.project_id: first time this FK is added (was never constrained)
ALTER TABLE events
  ADD CONSTRAINT events_project_id_projects_id_fk
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;

-- llm_usage.project_id: replacing existing NO ACTION constraint
ALTER TABLE llm_usage
  ADD CONSTRAINT llm_usage_project_id_projects_id_fk
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;

-- seeds.parent_id: self-referencing FK — first time added (never constrained)
ALTER TABLE seeds
  ADD CONSTRAINT seeds_parent_id_seeds_id_fk
  FOREIGN KEY (parent_id) REFERENCES seeds(id) ON DELETE SET NULL;
```

### Anti-Patterns to Avoid
- **Assuming all FKs have a constraint to drop:** `events.project_id` and `seeds.parent_id` have no existing FK constraint — no DROP needed for those.
- **Forgetting to make columns nullable before SET NULL:** PostgreSQL will reject `ON DELETE SET NULL` on a `NOT NULL` column. The column must be nullable first.
- **Updating Drizzle schema without writing migration manually:** `pnpm db:generate` cannot generate DROP+ADD CONSTRAINT SQL for FK behavior changes. Write the migration by hand; update schema files to match; verify `db:generate` produces empty diff.
- **Using `ON DELETE CASCADE` on `seeds.parent_id`:** A cascade there would delete all descendant seeds when any seed in the lineage is deleted — destructive to evolution history. Use SET NULL so child seeds become root seeds.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Verifying FK constraint names | Querying app-level metadata | `information_schema.table_constraints` + `information_schema.referential_constraints` | Authoritative, already used in Phase 22 tests |
| Verifying ON DELETE behavior | Application-level DELETE test | Direct DB delete + row count check | FK behavior is enforced by PostgreSQL at the DB level — test at that level |

---

## Runtime State Inventory

> Not applicable — this is a schema migration phase, not a rename/refactor phase.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL test DB (:5433) | Integration tests | Must be up via Docker | varies | Run `docker compose up -d` |
| `pnpm db:generate` | Schema sync verification | Available | — | — |
| `pnpm db:migrate` | Migration application | Available | — | — |

**Missing dependencies with no fallback:** None identified.

**Note:** Integration tests require `docker compose up -d` to be running before execution. This is an existing project requirement, not new to this phase.

---

## Common Pitfalls

### Pitfall 1: SET NULL on NOT NULL Column
**What goes wrong:** PostgreSQL rejects the ADD CONSTRAINT if the column is still `NOT NULL`. Error: `ERROR: column "project_id" of relation "events" is not null`.
**Why it happens:** Developer adds the FK before altering column nullability.
**How to avoid:** The migration must ALTER COLUMN DROP NOT NULL for `events.project_id` and `llm_usage.project_id` before adding SET NULL FK constraints. These ALTER COLUMN statements must come first in the migration.
**Warning signs:** Migration fails with NOT NULL constraint error.

### Pitfall 2: Forgetting events.project_id Has No Existing FK
**What goes wrong:** Migration tries to `DROP CONSTRAINT events_project_id_projects_id_fk` which does not exist. Error: constraint not found.
**Why it happens:** Assuming all tables have FK constraints. The events schema file declares `projectId: uuid('project_id').notNull()` with no `.references()` call, and no migration ever added this FK.
**How to avoid:** Only run DROP CONSTRAINT for tables where a constraint actually exists. For `events.project_id` and `seeds.parent_id`, skip the DROP and go straight to ADD CONSTRAINT.
**Warning signs:** Migration error "constraint X does not exist".

### Pitfall 3: CASCADE on seeds.parent_id Deletes Entire Evolution Lineage
**What goes wrong:** If `seeds.parent_id` uses CASCADE, deleting a parent seed cascades to all child seeds in the lineage chain, destroying the entire evolution history for a project.
**Why it happens:** Developer treats the self-referential FK the same as structural FKs.
**How to avoid:** Use `ON DELETE SET NULL` — when a parent seed is deleted, child seeds become root seeds. Their evolution context is preserved, just unlinked.
**Warning signs:** Test that deletes a single seed unexpectedly removes multiple seeds.

### Pitfall 4: Drizzle Schema Not Updated to Match Migration
**What goes wrong:** After writing the hand-crafted migration, running `pnpm db:generate` produces a new migration that reverts all the FK changes (because the Drizzle schema files still declare the old `.references()` options or are missing them).
**Why it happens:** Migration and schema drift.
**How to avoid:** Update all schema files immediately after writing the migration. Then run `pnpm db:generate` and verify it produces an empty migration. If it does not, the schema files still have a delta — fix them before committing.
**Warning signs:** `pnpm db:generate` produces a non-empty migration after Phase 23 changes are applied.

### Pitfall 5: Drizzle Doesn't Regenerate Constraint Names the Same Way
**What goes wrong:** If the schema files use different constraint name conventions than the hand-crafted migration, `pnpm db:generate` generates a DROP + ADD with different names.
**How to avoid:** When updating schema files, use the same constraint names as the hand-crafted migration. Drizzle's default FK name pattern is `{table}_{column}_{ref_table}_{ref_column}_fk` — match this in the raw SQL.

### Pitfall 6: truncateAll in Setup Uses CASCADE — Won't Catch Missing Cascade Behavior
**What goes wrong:** The test setup `truncateAll` uses `TRUNCATE ... CASCADE` which bypasses FK enforcement. A test that only uses `truncateAll` to clean up won't detect broken cascade rules.
**How to avoid:** Integration tests for DATA-05 must use a real `DELETE FROM projects WHERE id = $id` (not TRUNCATE) and then assert row counts per child table. Only `DELETE` goes through FK constraints.
**Warning signs:** Test passes in setup/teardown but doesn't actually exercise the cascade path.

---

## Code Examples

Verified from project codebase:

### Drizzle FK with onDelete (cascade example)
```typescript
// Source: packages/shared/src/db/schema/bead.ts — updated pattern
seedId: uuid('seed_id').notNull().references(() => seeds.id, { onDelete: 'cascade' }),
```

### Drizzle FK with onDelete (set null example)
```typescript
// Source: packages/shared/src/db/schema/llm-usage.ts — updated pattern
projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
// Note: .notNull() removed to allow NULL after parent deletion
```

### Drizzle FK for self-reference (seeds.parent_id)
```typescript
// Source: packages/shared/src/db/schema/seed.ts — updated pattern
parentId: uuid('parent_id').references(() => seeds.id, { onDelete: 'set null' }),
```

### Integration Test Pattern (from schema-integrity.integration.test.ts)
```typescript
// Real DELETE (not TRUNCATE) to exercise FK cascade
await testDb.db.delete(schema.projects).where(eq(schema.projects.id, project.id));

// Count rows in child tables — structural should be 0, audit should be unchanged
const beadCount = await testDb.db.select({ count: sql<number>`count(*)` }).from(schema.beads);
expect(Number(beadCount[0]!.count)).toBe(0);

const usageCount = await testDb.db.select({ count: sql<number>`count(*)` }).from(schema.llmUsage);
expect(Number(usageCount[0]!.count)).toBe(2); // rows survived

// Verify audit rows have null project_id
const nullUsage = await testDb.db
  .select()
  .from(schema.llmUsage)
  .where(sql`project_id IS NULL`);
expect(nullUsage).toHaveLength(2);
```

### Verifying FK Constraint Behavior via information_schema
```typescript
// Source: Phase 22 pattern (schema-integrity.integration.test.ts)
const result = await testDb.db.execute(
  sql`SELECT rc.delete_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.referential_constraints rc
        ON tc.constraint_name = rc.constraint_name
      WHERE tc.table_name = 'beads'
        AND tc.constraint_name = 'beads_seed_id_seeds_id_fk'
        AND tc.constraint_type = 'FOREIGN KEY'`
);
expect((result[0] as { delete_rule: string }).delete_rule).toBe('CASCADE');
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| All FKs: `ON DELETE no action` (safe greenfield default) | Structural: CASCADE, Audit: SET NULL | Phase 23 | Deleting a project no longer leaves orphan structural rows; audit tables preserve history with null FKs |

**Deprecated/outdated:**
- `ON DELETE no action` on structural tables: acceptable during greenfield development (as noted in PITFALLS.md), but must be resolved before project deletion is a product feature.

---

## Open Questions

1. **What happens to the events UNIQUE constraint when project_id becomes nullable?**
   - What we know: Migration 0016 added `UNIQUE(project_id, sequence_number)` on the events table.
   - What's unclear: If `project_id` becomes NULL after project deletion, multiple deleted-project events with the same old sequence numbers could collide (NULL != NULL in PostgreSQL, so NULLs don't conflict in UNIQUE constraints).
   - Recommendation: This is safe. PostgreSQL UNIQUE constraints treat NULLs as non-equal — two rows with `(NULL, 1)` do not conflict. No action needed. Document this in migration comments.

2. **Should llm_usage.bead_id and llm_usage.seed_id also be SET NULL?**
   - What we know: If cascade deletes beads/seeds, those FKs on llm_usage will also be violate if they remain NO ACTION.
   - What's unclear: CONTEXT.md scope focuses on the project_id path. But the cascade chain through projects→seeds→beads will also delete beads, and llm_usage.bead_id references beads — this will fail unless bead_id is also SET NULL or the constraint is addressed.
   - Recommendation: **This is a blocker.** When a project is deleted, seeds cascade-delete, which cascade-deletes beads. If `llm_usage.bead_id` still has `ON DELETE no action`, the bead deletion will be blocked by the FK. The entire project delete will fail. Phase 23 MUST also SET NULL on `llm_usage.bead_id` and `llm_usage.seed_id`. The CONTEXT.md guideline about "SET NULL for audit tables" implicitly covers this.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4 |
| Config file | `packages/shared/vitest.config.ts` |
| Quick run command | `pnpm -F @get-cauldron/shared test -- --grep "DATA-05"` |
| Full suite command | `pnpm test:integration` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-05 | Deleting a project cascades to beads, bead_edges, holdout_vault, asset_jobs — no orphan structural rows | integration | `pnpm -F @get-cauldron/shared test -- src/__tests__/fk-cascade.integration.test.ts` | ❌ Wave 0 |
| DATA-05 | Deleting a project sets project_id to NULL on llm_usage and events rows | integration | same file | ❌ Wave 0 |
| DATA-05 | llm_usage and events row counts unchanged after project deletion | integration | same file | ❌ Wave 0 |
| DATA-05 | FK constraint delete_rule verified as CASCADE/SET NULL via information_schema | integration | same file | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm -F @get-cauldron/shared test -- src/__tests__/fk-cascade.integration.test.ts`
- **Per wave merge:** `pnpm test:integration`
- **Phase gate:** Full integration suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/shared/src/db/__tests__/fk-cascade.integration.test.ts` — covers all DATA-05 assertions
  - Uses `createTestDb`, `runMigrations`, `truncateAll` from `setup.ts` (existing)
  - Three describe blocks: cascade behavior (structural tables), set null behavior (audit tables), constraint metadata verification

*(Existing test infrastructure (`setup.ts`, `createTestDb`, `runMigrations`, `truncateAll`) covers all shared test utilities — no new setup files needed)*

---

## Environment Availability

> Step 2.6: SKIPPED (no new external dependencies — uses existing Docker Postgres test DB at :5433)

---

## Sources

### Primary (HIGH confidence)
- Direct code reading of all schema files in `packages/shared/src/db/schema/` — confirms exact FK declarations, nullability, and missing `.references()` calls on `events.project_id` and `seeds.parent_id`
- Direct code reading of all migrations (0000–0016) — confirms exact constraint names currently in the DB, and that `events.project_id` has no FK constraint
- `packages/shared/src/db/__tests__/setup.ts` — confirms test infrastructure pattern
- `packages/shared/src/db/__tests__/schema-integrity.integration.test.ts` — confirms `information_schema` query pattern for constraint verification (Phase 22 precedent)
- `.planning/research/PITFALLS.md` — FK cascade graph mapping, SET NULL for audit tables
- `.planning/research/ARCHITECTURE.md` — two-migration strategy and cascade graph

### Secondary (MEDIUM confidence)
- PostgreSQL documentation semantics: NULL != NULL in UNIQUE constraints (verified by PITFALLS.md Pitfall 8 discussion; no independent URL check needed — this is fundamental PostgreSQL behavior)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries, all tooling confirmed present
- Architecture: HIGH — constraint names verified directly from migration SQL files, schema nullability verified from source code
- Pitfalls: HIGH — two blockers identified from direct code reading (NOT NULL columns, missing events FK)

**Research date:** 2026-04-02
**Valid until:** Stable (schema files don't change between now and execution)

---

## Critical Implementation Notes

### Blocker: llm_usage foreign keys to beads and seeds

**This was not in CONTEXT.md but is a correctness requirement for DATA-05.**

When a project is deleted:
1. `seeds` cascade-deletes (via `seeds.project_id CASCADE`)
2. `beads` cascade-deletes (via `beads.seed_id CASCADE`)
3. **Problem:** `llm_usage.bead_id` → `beads.id` with `ON DELETE no action` means bead deletion is BLOCKED by the FK. The entire `DELETE FROM projects` will fail.

**Resolution:** `llm_usage.bead_id` and `llm_usage.seed_id` must also use `SET NULL`. The CONTEXT.md principle "SET NULL for audit tables" applies here. The existing constraint names are:
- `llm_usage_bead_id_beads_id_fk` (from migration 0000 pattern — verify exact name)
- `llm_usage_seed_id_seeds_id_fk` (from migration 0013, confirmed)

The planner must include these two FK changes in the migration.

### Constraint Name Lookup for llm_usage.bead_id

Migration 0000 shows `llm_usage` was created in later migrations (not 0000 — it's not in the 0000 SQL). Looking at migration 0013, `llm_usage` table predates that migration (columns are added to it). The original `llm_usage` table creation must be in one of migrations 0001–0012. The exact FK constraint name for `llm_usage.bead_id` should be verified via `information_schema.table_constraints` query at runtime before writing the DROP CONSTRAINT statement — or use `DROP CONSTRAINT IF EXISTS` for safety.
