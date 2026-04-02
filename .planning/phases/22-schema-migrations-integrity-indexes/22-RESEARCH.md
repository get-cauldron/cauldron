# Phase 22: Schema Migrations — Integrity Indexes - Research

**Researched:** 2026-04-01
**Domain:** PostgreSQL schema migrations via Drizzle ORM — uniqueness constraints, partial unique indexes, composite indexes
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01: Data cleanup before constraints.** Two-phase migration approach: Migration A fixes any existing duplicate data (dedup event sequences per project, dedup seed versions per parent). Migration B adds the UNIQUE constraints. This prevents migration failure on populated dev/test DBs.
- **D-02: appendEvent sequence strategy.** Keep the existing MAX()+1 pattern but now protected by the UNIQUE constraint. On constraint violation, retry with a fresh MAX query. This is simpler than switching to a serial/identity column and doesn't require changing the `sequenceNumber` column type. The UNIQUE constraint makes the race condition detectable rather than silent.
- **D-03: Migration granularity.** Two migrations total: (1) data cleanup + constraint additions (events unique, seed version partial unique, bead_edges index), (2) events composite indexes. Grouping constraints together is safe because they're all additive. Indexes are separate because they're purely read-path optimization and have zero rollback risk.
- **D-04: Seed version partial unique index.** Must use `WHERE parent_seed_id IS NOT NULL` because PostgreSQL treats `(NULL, 1)` as non-conflicting. Root seeds (parentId = NULL) are exempt from the version uniqueness constraint.
- **D-05: Schema declarations.** Add constraints/indexes to the Drizzle schema files (`event.ts`, `seed.ts`, `bead.ts`) using the established `(table) => ({})` callback pattern. Then run `pnpm db:generate` to produce migration SQL.

### Claude's Discretion

All implementation decisions not explicitly listed above are delegated to Claude. The user confirmed this is pure infrastructure work.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DATA-01 | Event sequence numbers are unique per project, enforced by DB constraint (UNIQUE on project_id + sequence_number) | `unique()` in Drizzle schema + two-phase migration approach; `appendEvent` retry on PostgreSQL error code `23505` |
| DATA-02 | Events table has composite indexes on (project_id, sequence_number) and (project_id, occurred_at) | `index()` in Drizzle schema callback; planner generates migration 0016 for read-path indexes |
| DATA-03 | Seed versions are unique per parent seed, enforced by partial unique index (WHERE parent_seed_id IS NOT NULL) | `uniqueIndex().on().where(isNotNull(...))` — only `uniqueIndex()` supports `.where()`, not `unique()`; confirmed in Drizzle 0.45.1 type definitions |
| DATA-04 | bead_edges table has reverse-lookup index on (target_bead_id) | `index().on(table.toBeadId)` in `beadEdges` table callback; simple non-unique index sufficient |
</phase_requirements>

---

## Summary

Phase 22 adds four pieces of DB infrastructure to the existing schema: a uniqueness constraint on `events(project_id, sequence_number)`, composite lookup indexes on the events table, a partial unique index on `seeds(parent_id, version)`, and a reverse-lookup index on `bead_edges(to_bead_id)`. No application logic changes are in scope — this is additive schema-only work.

The primary risk is migration failure on populated databases due to existing duplicate event sequences. The mitigation is a two-migration strategy: migration 0015 performs a data audit and deduplication before any constraints are added; migration 0016 adds all constraints and indexes. This ensures the migration chain is safe to run against dev and test databases that have accumulated data from integration test runs.

The `appendEvent` function in `event-store.ts` needs a targeted update: after the UNIQUE constraint is added, concurrent inserts can now receive a PostgreSQL error `23505` (unique_violation). The function must catch `PostgresError` with `.code === '23505'`, re-query `MAX(sequence_number)`, and retry the insert. This is the only application-code change in the phase.

**Primary recommendation:** Two-migration strategy (0015 = data cleanup, 0016 = constraints + indexes), Drizzle schema declarations using the established `(table) => [...]` callback pattern, `appendEvent` retry loop on `23505`.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `drizzle-orm` | 0.45.1 (installed) | Schema declarations: `index()`, `uniqueIndex()`, `unique()` | Already the project ORM; `pgTable` callback pattern already established in `llm-usage.ts` and `asset-job.ts` |
| `drizzle-kit` | 0.31.10 (installed) | `pnpm db:generate` — diffs schema vs existing migrations, emits ALTER TABLE SQL | Already the migration generator; no new tooling |
| `postgres` driver | 3.4.8 (installed) | Surfaces unique violations as `PostgresError` with `.code === '23505'` | Already the project DB driver; error handling pattern is driver-specific |

### No New Dependencies

This phase adds zero new packages. All tools are already installed.

**Verified installed versions:**
- `drizzle-orm`: `0.45.1` (from `packages/shared/node_modules` via pnpm)
- `drizzle-kit`: `0.31.10` (from `packages/shared/package.json`)
- `postgres`: `3.4.8` (from pnpm lockfile resolution)

---

## Architecture Patterns

### Recommended Project Structure

No new directories. Changes are confined to:

```
packages/shared/src/db/
├── schema/
│   ├── event.ts          # Add unique() + index() callbacks
│   ├── seed.ts           # Add uniqueIndex().where() callback
│   └── bead.ts           # Add index() callback to beadEdges table
├── migrations/
│   ├── 0015_*.sql        # Generated: data cleanup (dedup events, seeds)
│   └── 0016_*.sql        # Generated: constraints + indexes
└── event-store.ts        # appendEvent() retry on 23505
```

### Pattern 1: Drizzle Table Callback (index and unique constraint declarations)

**What:** The `pgTable` third argument accepts a callback `(table) => [...]` returning an array of index/constraint builders. This is the established pattern in `llm-usage.ts`.

**When to use:** Every time you need composite indexes or table-level unique constraints that span multiple columns.

**Example (from `llm-usage.ts` — live production code):**
```typescript
// Source: packages/shared/src/db/schema/llm-usage.ts
import { pgTable, uuid, text, integer, timestamp, index } from 'drizzle-orm/pg-core';

export const llmUsage = pgTable('llm_usage', {
  // ... columns ...
}, (table) => [
  index('llm_usage_project_created_idx').on(table.projectId, table.createdAt),
  index('llm_usage_bead_idx').on(table.beadId),
]);
```

**Example (from `asset-job.ts` — unique constraint pattern):**
```typescript
// Source: packages/shared/src/db/schema/asset-job.ts
import { pgTable, unique } from 'drizzle-orm/pg-core';

export const assetJobs = pgTable('asset_jobs', {
  // ... columns ...
}, (table) => [
  unique('asset_jobs_idempotency_key_unique').on(table.projectId, table.idempotencyKey),
]);
```

### Pattern 2: Partial Unique Index (DATA-03 — seed version uniqueness)

**What:** `uniqueIndex()` (not `unique()`) supports a `.where()` clause. `unique()` is a table constraint and has no `.where()` method — this is verified in Drizzle 0.45.1 type definitions. Use `uniqueIndex().on(...).where(isNotNull(table.parentId))` for the partial unique index.

**When to use:** When a uniqueness rule must exempt certain rows (rows where parentId IS NULL are root seeds exempt from version uniqueness).

**Example:**
```typescript
// Source: Drizzle 0.45.1 pg-core/indexes.d.ts — IndexBuilder.where() confirmed
import { pgTable, uniqueIndex, isNotNull } from 'drizzle-orm/pg-core';

export const seeds = pgTable('seeds', {
  // ... existing columns ...
}, (table) => [
  uniqueIndex('seeds_parent_version_unique_idx')
    .on(table.parentId, table.version)
    .where(isNotNull(table.parentId)),
]);
```

**Critical distinction:** `unique()` generates `ADD CONSTRAINT ... UNIQUE (col1, col2)` — a table constraint with no WHERE clause. `uniqueIndex()` generates `CREATE UNIQUE INDEX ... ON ... WHERE condition` — a partial unique index. For DATA-03, you MUST use `uniqueIndex()`.

### Pattern 3: appendEvent Retry on Unique Violation

**What:** The `postgres` driver wraps PostgreSQL server errors as `PostgresError` instances with a `.code` string property. PostgreSQL unique_violation is error code `'23505'`. The retry pattern catches this specific error, re-reads MAX, and retries the insert once.

**When to use:** After the UNIQUE constraint is added to `events(project_id, sequence_number)`, the concurrent MAX+1 race becomes detectable rather than silent.

**Example:**
```typescript
// Source: postgres@3.4.8 src/errors.js — PostgresError.code confirmed
import { PostgresError } from 'postgres';

export async function appendEvent(
  db: DbClient,
  event: Omit<typeof schema.events.$inferInsert, 'id' | 'occurredAt' | 'sequenceNumber'>
): Promise<typeof schema.events.$inferSelect> {
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const [maxSeq] = await db
      .select({ max: sql<number>`COALESCE(MAX(${schema.events.sequenceNumber}), 0)` })
      .from(schema.events)
      .where(eq(schema.events.projectId, event.projectId));

    const sequenceNumber = (maxSeq?.max ?? 0) + 1;

    try {
      const [row] = await db
        .insert(schema.events)
        .values({ ...event, sequenceNumber })
        .returning();
      return row!;
    } catch (err) {
      const isUniqueViolation =
        err instanceof PostgresError && err.code === '23505';
      if (isUniqueViolation && attempt < MAX_RETRIES - 1) {
        continue; // retry with fresh MAX
      }
      throw err;
    }
  }
  throw new Error('appendEvent: exhausted retries on sequence conflict');
}
```

### Pattern 4: Two-Phase Migration (data cleanup before constraint)

**What:** Separate the data deduplication SQL (safe to retry) from the constraint addition SQL (fails if duplicates exist). Run them as distinct migration files so rollback is granular.

**Migration 0015 — data cleanup (hand-authored SQL):**
```sql
-- Dedup event sequences: keep the row with the earliest ID per (project_id, sequence_number)
DELETE FROM events
WHERE id NOT IN (
  SELECT DISTINCT ON (project_id, sequence_number)
    id
  FROM events
  ORDER BY project_id, sequence_number, id
);

-- Dedup seed versions: keep the row with the earliest ID per (parent_id, version) where parent_id IS NOT NULL
DELETE FROM seeds
WHERE parent_id IS NOT NULL
  AND id NOT IN (
    SELECT DISTINCT ON (parent_id, version)
      id
    FROM seeds
    WHERE parent_id IS NOT NULL
    ORDER BY parent_id, version, id
  );
```

**Migration 0016 — constraints + indexes (generated by `pnpm db:generate`):**
Generated from schema changes. Expected output:
```sql
ALTER TABLE "events" ADD CONSTRAINT "events_project_sequence_unique" UNIQUE ("project_id","sequence_number");
CREATE UNIQUE INDEX "seeds_parent_version_unique_idx" ON "seeds" ("parent_id","version") WHERE parent_id IS NOT NULL;
CREATE INDEX "bead_edges_to_bead_id_idx" ON "bead_edges" ("to_bead_id");
CREATE INDEX "events_project_sequence_idx" ON "events" ("project_id","sequence_number");
CREATE INDEX "events_project_occurred_at_idx" ON "events" ("project_id","occurred_at");
```

**Note:** Migration 0015 must be hand-authored and placed in the migrations folder manually before running `pnpm db:generate` (which produces 0016). Drizzle's generator does not produce data-cleanup SQL — only schema-diff SQL.

### Anti-Patterns to Avoid

- **Using `unique()` for DATA-03:** `unique()` creates a table constraint with no WHERE clause support. `uniqueIndex()` must be used for the partial seed version uniqueness. Verified from Drizzle 0.45.1 `unique-constraint.d.ts` — `UniqueConstraintBuilder` has no `.where()` method.
- **Combining data cleanup and constraint addition in one migration file:** If the constraint addition fails for any reason, rolling back also loses the data fix. Keep them separate.
- **Not importing `isNotNull` from drizzle-orm:** The `.where()` on `IndexBuilder` expects `SQL` — use `isNotNull(table.parentId)` from `drizzle-orm`, not a raw SQL string.
- **Skipping the audit query before running migrations:** Any populated dev/test DB may have duplicate sequences from prior concurrent test runs. Run the audit SELECT before applying 0015.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Unique constraint declaration | Manual `ALTER TABLE` SQL in source | `unique()` in Drizzle schema + `pnpm db:generate` | Drizzle tracks schema state in snapshot JSON; hand-rolled SQL bypasses the snapshot and causes drift |
| Partial unique index | Manual `CREATE UNIQUE INDEX ... WHERE` SQL in source | `uniqueIndex().on().where()` in Drizzle schema | Same snapshot drift risk; Drizzle 0.45.1 fully supports partial indexes |
| PostgreSQL error detection | String matching on `err.message` | `err instanceof PostgresError && err.code === '23505'` | Error codes are stable; messages are locale-dependent and version-sensitive |

**Key insight:** Drizzle's schema-as-source-of-truth approach requires all structural declarations to live in schema files. Hand-authored SQL for constraints or indexes (outside of the two-phase data cleanup justification) breaks the migration snapshot and causes `pnpm db:generate` to re-emit already-applied DDL on next run.

---

## Common Pitfalls

### Pitfall 1: Migration Fails on Existing Duplicate Event Sequences
**What goes wrong:** `ALTER TABLE events ADD CONSTRAINT ... UNIQUE (project_id, sequence_number)` aborts if any `(project_id, sequence_number)` pair appears more than once. Integration test DBs accumulate duplicates because `appendEvent`'s MAX+1 is not atomic.
**Why it happens:** The `appendEvent` race (two concurrent reads see the same MAX before either writes) has been firing silently. The constraint reveals pre-existing damage.
**How to avoid:** Run the audit query before writing any migration. Migration 0015 must dedup before migration 0016 adds the constraint.
**Warning signs:** Migration failure with `duplicate key value violates unique constraint`; this never appears in unit test runs because tests insert sequentially.

### Pitfall 2: `unique()` vs `uniqueIndex()` for Partial Indexes
**What goes wrong:** Using `unique()` for the seed version constraint silently ignores the `.where()` call (it doesn't exist on `UniqueConstraintBuilder`) — TypeScript will catch this at compile time, but the developer may reach for the wrong function from `asset-job.ts` pattern and be confused why TypeScript errors.
**Why it happens:** Both `unique()` and `uniqueIndex()` appear in Drizzle imports; `unique()` is more prominent in the existing codebase (`asset-job.ts`).
**How to avoid:** Import `uniqueIndex` from `drizzle-orm/pg-core` for DATA-03. The type error from calling `.where()` on a `UniqueConstraintBuilder` will catch any mistake at compile time.
**Warning signs:** TypeScript error: `Property 'where' does not exist on type 'UniqueConstraintBuilder'`.

### Pitfall 3: Migration 0015 Must Be Hand-Authored Before db:generate
**What goes wrong:** Running `pnpm db:generate` first produces migration 0015 as schema-diff SQL (constraint additions). Then hand-authoring cleanup SQL as 0015 creates a file number collision. Drizzle uses sequential numbering and the meta snapshot — file conflicts cause migration runner errors.
**Why it happens:** `pnpm db:generate` auto-increments the migration number based on the last snapshot.
**How to avoid:** Author the data-cleanup SQL as migration 0015 first (manually create the file, do NOT run `db:generate` yet). Only then modify the schema files and run `pnpm db:generate` to produce 0016 as the constraint/index migration. The Drizzle snapshot will reflect the expected next number.

### Pitfall 4: appendEvent Retry Needs Import from `postgres` Package
**What goes wrong:** Catching `PostgresError` requires importing it from the `postgres` package directly. The `postgres` driver does not re-export `PostgresError` through `drizzle-orm`. Using `error instanceof Error && (error as any).code === '23505'` works but loses type safety.
**Why it happens:** `postgres` (the driver) and `drizzle-orm` are separate packages. Drizzle does not wrap driver errors.
**How to avoid:** `import type { PostgresError } from 'postgres'` — the type is exported from the `postgres` package root. Use `err instanceof PostgresError` for typed access to `.code`.

### Pitfall 5: `isNotNull` Import Path
**What goes wrong:** `isNotNull` is imported from `drizzle-orm` (the root), not from `drizzle-orm/pg-core`. Importing from `pg-core` will fail with a module not found error.
**Why it happens:** SQL expression helpers live in the drizzle-orm core, not the pg dialect.
**How to avoid:** `import { isNotNull } from 'drizzle-orm'` — same module as `eq`, `and`, `sql`.

---

## Code Examples

### events table — after schema modification
```typescript
// packages/shared/src/db/schema/event.ts
import { pgTable, pgEnum, uuid, timestamp, jsonb, integer, unique, index } from 'drizzle-orm/pg-core';

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull(),
  seedId: uuid('seed_id'),
  beadId: uuid('bead_id'),
  type: eventTypeEnum('type').notNull(),
  payload: jsonb('payload').notNull().default({}),
  sequenceNumber: integer('sequence_number').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('events_project_sequence_unique').on(table.projectId, table.sequenceNumber),
  index('events_project_sequence_idx').on(table.projectId, table.sequenceNumber),
  index('events_project_occurred_at_idx').on(table.projectId, table.occurredAt),
]);
```

### seeds table — after schema modification
```typescript
// packages/shared/src/db/schema/seed.ts
import { pgTable, pgEnum, uuid, text, timestamp, jsonb, real, integer, uniqueIndex } from 'drizzle-orm/pg-core';
import { isNotNull } from 'drizzle-orm';

export const seeds = pgTable('seeds', {
  // ... existing columns unchanged ...
}, (table) => [
  uniqueIndex('seeds_parent_version_unique_idx')
    .on(table.parentId, table.version)
    .where(isNotNull(table.parentId)),
]);
```

### bead_edges table — after schema modification
```typescript
// packages/shared/src/db/schema/bead.ts — beadEdges table
import { pgTable, pgEnum, uuid, text, timestamp, integer, jsonb, index } from 'drizzle-orm/pg-core';

export const beadEdges = pgTable('bead_edges', {
  id: uuid('id').primaryKey().defaultRandom(),
  fromBeadId: uuid('from_bead_id').notNull().references(() => beads.id),
  toBeadId: uuid('to_bead_id').notNull().references(() => beads.id),
  edgeType: beadEdgeTypeEnum('edge_type').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('bead_edges_to_bead_id_idx').on(table.toBeadId),
]);
```

### Duplicate audit query (run before migration 0015)
```sql
-- Must return 0 rows before migration 0015 is safe to skip dedup
SELECT project_id, sequence_number, COUNT(*)
FROM events
GROUP BY project_id, sequence_number
HAVING COUNT(*) > 1;

-- Seed version audit
SELECT parent_id, version, COUNT(*)
FROM seeds
WHERE parent_id IS NOT NULL
GROUP BY parent_id, version
HAVING COUNT(*) > 1;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Drizzle `(table) => ({})` object return | `(table) => [...]` array return | Drizzle v0.30+ | Array syntax is the current standard; older object syntax still works but new code uses array |
| `pg` driver error handling | `postgres` driver `PostgresError` with `.code` | Project inception | `postgres` driver (not `pg`) is used throughout; error code `23505` is standard PostgreSQL SQLSTATE |

**Deprecated/outdated:**
- `dagre` 0.8.x: Not relevant to this phase; mentioned in CLAUDE.md as forbidden.
- Object-returning table callback `(table) => ({})`: Still valid but array `(table) => [...]` is the current pattern used in `llm-usage.ts` (confirmed in live code).

---

## Open Questions

1. **Migration 0015 hand-authoring vs db:generate ordering**
   - What we know: `pnpm db:generate` auto-numbers migrations by reading the meta snapshot. The cleanup SQL cannot be generated by Drizzle.
   - What's unclear: Whether placing a hand-authored `0015_data_cleanup.sql` in the migrations folder before running `db:generate` causes Drizzle to correctly increment to `0016` for the schema-diff output.
   - Recommendation: Test `pnpm db:generate` output numbering after manually creating `0015_data_cleanup.sql`. The Drizzle migrator reads the meta `_journal.json` for the last migration number, not the filesystem. The planner should include a task to verify this flow.

2. **Whether the test suite has accumulated duplicate event sequences**
   - What we know: `truncateAll()` in test setup resets all tables between tests — this prevents accumulation within a test session. But a dev DB (`:5432`) used for manual testing may have duplicates.
   - What's unclear: State of the dev DB at planning time.
   - Recommendation: The execution plan should include a pre-migration audit step that runs the duplicate-check queries against both `:5432` (dev) and `:5433` (test) before applying migration 0015.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL (dev) | Migration apply + manual test | ✓ (Docker) | Postgres via docker compose :5432 | — |
| PostgreSQL (test) | Integration tests | ✓ (Docker) | Postgres via docker compose :5433 | — |
| Node.js | `pnpm db:generate`, `pnpm db:migrate` | ✓ | v22.22.1 | — |
| pnpm | Build and test commands | ✓ | Available in project | — |

**Missing dependencies with no fallback:** None — all dependencies are present.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4 |
| Config file | `packages/shared/vitest.config.ts` |
| Quick run command | `pnpm -F @get-cauldron/shared test -- src/__tests__/event-sourcing.integration.test.ts` |
| Full suite command | `pnpm test:integration` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-01 | Second insert with same project_id + sequence_number raises constraint violation | integration | `pnpm -F @get-cauldron/shared test -- src/__tests__/event-sourcing.integration.test.ts` (new test needed) | ❌ Wave 0 |
| DATA-01 | appendEvent retry recovers from 23505 and succeeds with next sequence | integration | `pnpm -F @get-cauldron/shared test -- src/__tests__/event-sourcing.integration.test.ts` (new test needed) | ❌ Wave 0 |
| DATA-02 | Events queries by project + sequence and project + occurred_at use index scans | integration/manual | `EXPLAIN (ANALYZE) SELECT ... FROM events WHERE project_id = $1 ORDER BY sequence_number` — verify "Index Scan" in plan | ❌ Wave 0 (manual verify acceptable) |
| DATA-03 | Second seed with same parent_id + version raises constraint violation | integration | `pnpm -F @get-cauldron/shared test -- src/__tests__/seeds.integration.test.ts` (new file needed) | ❌ Wave 0 |
| DATA-03 | Root seeds (parentId = NULL) can share version numbers without violation | integration | same new seeds integration test file | ❌ Wave 0 |
| DATA-04 | bead_edges reverse-lookup index exists on to_bead_id | integration | `pnpm -F @get-cauldron/shared test -- src/__tests__/bead-edges.integration.test.ts` (new file or pg_indexes query) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm -F @get-cauldron/shared test -- src/__tests__/event-sourcing.integration.test.ts`
- **Per wave merge:** `pnpm test:integration`
- **Phase gate:** Full integration suite green + build passes (`pnpm build`) before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `packages/shared/src/db/__tests__/event-sourcing.integration.test.ts` — add Test 8: unique violation test and Test 9: retry recovery test (file exists, tests must be added)
- [ ] `packages/shared/src/db/__tests__/seeds-integrity.integration.test.ts` — new file covering DATA-03 partial unique constraint behavior
- [ ] `packages/shared/src/db/__tests__/bead-edges-integrity.integration.test.ts` — new file or inline assertion confirming `bead_edges_to_bead_id_idx` exists in `pg_indexes`
- [ ] No framework install needed — Vitest 4 and test infrastructure already operational

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on This Phase |
|-----------|---------------------|
| TypeScript end-to-end | Schema files and `appendEvent` changes must compile without errors (`pnpm typecheck`) |
| `postgres` driver (not `pg`) | Error handling uses `PostgresError` from `postgres` package, not `pg.DatabaseError` |
| Do not use `pg` driver | Confirmed — project uses `postgres` 3.4.8 throughout |
| Drizzle ORM 0.45 | Use `index()`, `unique()`, `uniqueIndex()` from `drizzle-orm/pg-core`; `isNotNull` from `drizzle-orm` root |
| Vitest 4 (not Jest) | New integration tests use Vitest syntax |
| `pnpm build` in regression gate | Build step must pass after all schema and application changes (per `feedback_run_build.md`) |
| Integration tests: real PostgreSQL, no mocks | New tests for DATA-01 through DATA-04 must use the real test DB at `:5433` |

---

## Sources

### Primary (HIGH confidence)
- Drizzle ORM 0.45.1 type definitions (`pg-core/indexes.d.ts`, `pg-core/unique-constraint.d.ts`) — verified `uniqueIndex().where()` exists; `unique()` has no `.where()`
- `postgres` 3.4.8 source (`src/errors.js`) — confirmed `PostgresError` with `.code` property
- Live project schema files (`llm-usage.ts`, `asset-job.ts`) — confirmed `(table) => [...]` array callback pattern with `index()` and `unique()`
- Live `event-store.ts` — confirmed MAX()+1 pattern at lines 84-95
- Live `event-sourcing.integration.test.ts` — confirmed 7 existing tests, sequential-only insertion
- Migration folder — confirmed 15 migrations (0000-0014), next is 0015

### Secondary (MEDIUM confidence)
- `.planning/research/PITFALLS.md` — Pitfall 1 (duplicate sequence dedup strategy) and Pitfall 2 (CASCADE FK graph) — generated during v1.2 research phase
- `.planning/research/STACK.md` — Drizzle unique/index API patterns and migration workflow

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified from installed packages and live schema files
- Architecture: HIGH — all patterns confirmed from live code in the repository
- Pitfalls: HIGH — data cleanup pitfall documented in PITFALLS.md and confirmed by reading appendEvent source
- Drizzle partial index API: HIGH — verified directly from installed drizzle-orm 0.45.1 type definitions

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (Drizzle API is stable; PostgreSQL error codes are stable)
