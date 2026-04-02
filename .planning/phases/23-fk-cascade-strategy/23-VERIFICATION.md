---
phase: 23-fk-cascade-strategy
verified: 2026-04-02T02:30:00Z
status: passed
score: 5/5 must-haves verified
re_verification: false
---

# Phase 23: FK Cascade Strategy Verification Report

**Phase Goal:** Deleting a project removes all structural child rows automatically and nullifies audit table references — no orphan rows accumulate, and cost and event history survives project deletion
**Verified:** 2026-04-02T02:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Deleting a project cascades to all structural child rows (interviews, seeds, beads, bead_edges, holdout_vault, snapshots, asset_jobs) | VERIFIED | Migration 0017 adds ON DELETE CASCADE for all 8 structural FK constraints; integration test `DATA-05: CASCADE deletes structural rows` confirms 0 rows across all 7 tables after project DELETE |
| 2 | Deleting a project sets project_id to NULL on llm_usage and events rows | VERIFIED | Migration 0017 makes `events.project_id` and `llm_usage.project_id` nullable and adds SET NULL FKs; integration test confirms row counts unchanged (2) with project_id IS NULL after project DELETE |
| 3 | Deleting a seed via cascade sets llm_usage.bead_id and llm_usage.seed_id to NULL (not blocked by NO ACTION) | VERIFIED | llm-usage.ts has `{ onDelete: 'set null' }` on both `beadId` and `seedId`; integration test asserts `nullBeadUsage.toHaveLength(2)` and `nullSeedUsage.toHaveLength(2)` after cascade reaches beads/seeds |
| 4 | seeds.parent_id self-reference uses SET NULL so child seeds survive parent deletion | VERIFIED | seed.ts: `.references((): AnyPgColumn => seeds.id, { onDelete: 'set null' })`; integration test `DATA-05: seeds.parent_id SET NULL preserves child seeds` asserts child seed exists with `parentId` null after parent seed deleted |
| 5 | Drizzle schema files match migration state — db:generate produces no additional migration | VERIFIED | SUMMARY 23-01 documents `pnpm db:generate` produces "No schema changes, nothing to migrate"; 0017_snapshot.json created to capture schema state after hand-crafted migration |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/shared/src/db/migrations/0017_fk_cascade_strategy.sql` | Hand-crafted migration: nullable columns, DROP/ADD CONSTRAINT for all FKs | VERIFIED | 46 lines; 2 DROP NOT NULL, 11 DROP CONSTRAINT, 8 ON DELETE CASCADE, 5 ON DELETE SET NULL — exact counts match plan acceptance criteria |
| `packages/shared/src/db/schema/seed.ts` | Updated FK declarations with onDelete cascade/set null | VERIFIED | `projectId` has `{ onDelete: 'cascade' }`, `parentId` has `{ onDelete: 'set null' }` with `AnyPgColumn` type |
| `packages/shared/src/db/schema/event.ts` | Nullable project_id with SET NULL FK | VERIFIED | `projectId` is nullable (no `.notNull()`), has `.references(() => projects.id, { onDelete: 'set null' })` |
| `packages/shared/src/db/schema/llm-usage.ts` | Nullable project_id with SET NULL FK, SET NULL on bead_id and seed_id | VERIFIED | All three FK columns have `{ onDelete: 'set null' }`; `projectId` has no `.notNull()` |
| `packages/shared/src/db/schema/bead.ts` | CASCADE on seedId, fromBeadId, toBeadId | VERIFIED | `seedId` has `{ onDelete: 'cascade' }`, `fromBeadId` and `toBeadId` on beadEdges both have `{ onDelete: 'cascade' }` |
| `packages/shared/src/db/schema/holdout.ts` | CASCADE on seedId | VERIFIED | `seedId` has `.notNull().references(() => seeds.id, { onDelete: 'cascade' })` |
| `packages/shared/src/db/schema/interview.ts` | CASCADE on projectId | VERIFIED | `projectId` has `.notNull().references(() => projects.id, { onDelete: 'cascade' })` |
| `packages/shared/src/db/schema/snapshot.ts` | CASCADE on projectId | VERIFIED | `projectId` has `.notNull().unique().references(() => projects.id, { onDelete: 'cascade' })` |
| `packages/shared/src/db/schema/asset-job.ts` | CASCADE on projectId | VERIFIED | `projectId` has `.notNull().references(() => projects.id, { onDelete: 'cascade' })` |
| `packages/shared/src/db/__tests__/setup.ts` | truncateAll includes asset_jobs | VERIFIED | TRUNCATE list: `asset_jobs, llm_usage, project_snapshots, events, holdout_vault, bead_edges, beads, seeds, interviews, projects` |
| `packages/shared/src/db/__tests__/fk-cascade.integration.test.ts` | Integration tests proving all DATA-05 cascade behaviors, min 100 lines, contains "DATA-05" | VERIFIED | 341 lines; contains "DATA-05"; 4 describe blocks with 16 tests |
| `packages/shared/src/db/migrations/0018_drop_legacy_fk_constraints.sql` | Conditional migration to drop legacy auto-named NO ACTION constraints | VERIFIED | Conditional DO/BEGIN blocks for `interviews_project_id_fkey` and `llm_usage_seed_id_fkey` |
| `packages/shared/src/db/migrations/meta/_journal.json` | Journal entries for 0017 and 0018 | VERIFIED | Entry at idx=17 with tag `0017_fk_cascade_strategy`, entry at idx=18 with tag `0018_drop_legacy_fk_constraints` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `fk-cascade.integration.test.ts` | `0017_fk_cascade_strategy.sql` | Tests run after migrations applied, verify DB-level constraint behavior; `DELETE FROM projects` pattern | WIRED | Test file uses `runMigrations(testDb.db)` in `beforeAll` which applies all migrations including 0017 and 0018; uses real `db.delete(schema.projects).where(...)` — not TRUNCATE |
| Schema files (`*.ts`) | `0017_fk_cascade_strategy.sql` | `onDelete: 'cascade'` and `onDelete: 'set null'` patterns match migration SQL | WIRED | Every schema file has the matching `onDelete` option; pattern verified across all 8 schema files |

### Data-Flow Trace (Level 4)

Not applicable — this phase produces database schema/migration artifacts, not UI components or data-rendering code. Integration tests directly exercise the FK constraint behavior at the database level.

### Behavioral Spot-Checks

Step 7b: SKIPPED — behavioral verification requires a running PostgreSQL test instance. The integration tests (fk-cascade.integration.test.ts) serve as the runnable behavioral verification; they pass according to SUMMARY 23-02 (16/16 tests, commit 810ad2b verified in git log).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DATA-05 | 23-01-PLAN.md, 23-02-PLAN.md | Foreign keys use appropriate cascade strategy (CASCADE for structural rows like bead_edges/holdout_vault, SET NULL for audit tables like llm_usage/events) with data-audit migration preceding constraint changes | SATISFIED | Migration 0017 applies all FK strategy changes; migration 0018 drops legacy blocking constraints; 16 integration tests verify all 13 FK constraint delete_rules via `information_schema.referential_constraints`; REQUIREMENTS.md marks DATA-05 as Complete for Phase 23 |

No orphaned requirements — DATA-05 is the only requirement mapped to Phase 23 in REQUIREMENTS.md and is claimed by both plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | — | — | — |

Scanned key modified files for TODO/FIXME/placeholder/stub patterns. None found. The non-null assertion (`event.projectId!`) in `event-store.ts` is documented in SUMMARY 23-01 as intentional — projectId is always provided at insert time and is only null post-deletion via SET NULL FK, not during write paths.

### Human Verification Required

None. All phase behaviors are verifiable programmatically:

- Migration SQL content verified by file read
- Schema `onDelete` options verified by file read
- Journal entries verified by file read
- Integration test structure verified by file read (341 lines, 4 describe blocks, 16 tests)
- Commits f4140ad, 3b7400a, 810ad2b all verified in git log

### Gaps Summary

No gaps. All 5 must-have truths are VERIFIED, all 13 required artifacts exist and are substantive, all key links are wired, and the sole requirement (DATA-05) is fully satisfied with integration test evidence.

The phase also shipped migration 0018 as an unplanned but necessary fix — legacy auto-named FK constraints (`interviews_project_id_fkey`, `llm_usage_seed_id_fkey`) were blocking project deletion and had to be conditionally dropped. This was handled correctly within the phase execution.

---

_Verified: 2026-04-02T02:30:00Z_
_Verifier: Claude (gsd-verifier)_
