# Pitfalls Research

**Domain:** Architectural hardening of existing TypeScript/PostgreSQL AI orchestration platform (Cauldron v1.2)
**Researched:** 2026-04-01
**Confidence:** HIGH — grounded in actual Cauldron codebase inspection

## Critical Pitfalls

### Pitfall 1: Adding UNIQUE Constraint to Events Table With Existing Duplicate Sequence Numbers

**What goes wrong:**
`ALTER TABLE events ADD CONSTRAINT events_project_sequence_unique UNIQUE (project_id, sequence_number)` fails immediately if any project has duplicate sequence numbers already in the database. The migration aborts with a constraint violation. If Drizzle regenerates the migration from schema and runs it against a dev or test database that has accumulated data from prior integration test runs, the migration fails and leaves the DB in a partially-applied state.

**Why it happens:**
The `appendEvent` function uses `MAX(sequence_number) + 1` to assign sequence numbers. Under concurrent inserts — two parallel Inngest steps appending events for the same project simultaneously — both reads can see the same MAX value before either write commits, producing duplicate sequence numbers. The UNIQUE constraint is being added *because* this race exists, but the race may have already fired and left duplicates in dev/test databases. The integration test suite (`event-sourcing.integration.test.ts`) only inserts events sequentially, so it would never catch this.

**How to avoid:**
Run a deduplication audit query before writing the migration:
```sql
SELECT project_id, sequence_number, COUNT(*)
FROM events
GROUP BY project_id, sequence_number
HAVING COUNT(*) > 1;
```
If duplicates exist, fix them in a data-cleanup migration that runs *before* the constraint migration. Keep them as separate numbered files: `0015_cleanup_event_sequences.sql` → `0016_add_event_sequence_unique.sql`. Never combine data fixup and constraint addition in one file — if the constraint migration fails for an unrelated reason, a rollback loses the data fix.

**Warning signs:**
- Migration failure with `duplicate key value violates unique constraint`
- Integration test suite passes (it inserts sequentially) but migration fails against a populated dev DB

**Phase to address:**
Event sequence uniqueness phase — run data audit before writing migration SQL.

---

### Pitfall 2: CASCADE DELETE Wipes More Than Intended Across the Deep FK Graph

**What goes wrong:**
All FK constraints currently use `ON DELETE no action` (confirmed in migration 0013). If `ON DELETE CASCADE` is added naively to `seeds → projects`, it cascades to beads (via `beads.seed_id → seeds.id`), which cascades to `bead_edges` (both `from_bead_id` and `to_bead_id` → `beads.id`), `holdout_vault` (via `seed_id`), and `llm_usage` (via `seed_id` and `bead_id`). Deleting one project wipes the entire cost history and event log with no application-level visibility.

**Why it happens:**
A developer adds CASCADE to one FK in isolation without mapping the full graph. The full graph is:
```
projects
  → interviews        (CASCADE — no meaning without project)
  → seeds             (CASCADE — no meaning without project)
      → beads         (CASCADE — no meaning without seed)
          → bead_edges (CASCADE — orphan edges are invalid)
      → holdout_vault (CASCADE — holdout tests tied to seed)
  → llm_usage         (SET NULL — audit trail, keep rows)
  → events            (SET NULL — append-only log, keep rows)
  → asset_jobs        (CASCADE — job has no purpose without project)
```
The mistake is treating `llm_usage` and `events` the same as structural tables when they are audit logs.

**How to avoid:**
Map the complete FK graph before writing any migration. Use `SET NULL` for audit/logging tables (`llm_usage`, `events`) so cost history survives project deletion. Write an integration test that deletes a project and asserts row counts per table — verifying `llm_usage` and `events` rows survived with null foreign keys.

**Warning signs:**
- FK constraint error when deleting a project (means the graph is inconsistent — some FKs cascade, some block)
- `llm_usage` rows disappearing after project deletion (CASCADE was used where SET NULL was intended)

**Phase to address:**
Cascading FK cleanup phase — requires explicit graph mapping before writing migration SQL.

---

### Pitfall 3: Synchronous Usage Recording Adds Latency to Every LLM Call and Still Loses Records on DB Failure

**What goes wrong:**
The current `recordUsageAsync` is fire-and-forget (confirmed in `gateway.ts`: `void this.writeUsage(...).catch(err => logger.error(...))`). The v1.2 goal is budget accuracy, which requires the write to succeed before the next budget check. If `writeUsage` is awaited in the hot path, it adds 10–50ms DB round-trip latency to every LLM call. More critically, if the DB insert fails (connection pool exhaustion, transient network error) and the error is only logged, the budget check will allow more spend than the actual limit — the opposite of the hardening goal.

**Why it happens:**
"Make it synchronous" is implemented as `await writeUsage()` without considering what happens when the await throws. The existing error handling logs the failure and moves on — the same outcome as fire-and-forget, but now with blocking latency added.

**How to avoid:**
Await the write AND propagate the error. If `writeUsage` throws, the LLM call result should be considered unrecorded and the gateway should throw or return an error to the caller. Add 1–2 retries with exponential backoff inside `writeUsage` to handle transient DB errors before giving up. For streaming responses (`streamText`, `streamObject`), the `onFinish` callback fires after the stream is consumed, so awaiting there does not block the stream itself — only the final control return to the caller.

**Warning signs:**
- LLM calls taking 40–100ms longer than baseline after the change (DB write latency showing up)
- Budget allowing calls past the limit (indicates write is still fire-and-forget despite the change)

**Phase to address:**
Synchronous usage recording phase — decide retry policy and error propagation contract before implementation.

---

### Pitfall 4: Adding Auth Middleware Breaks All Existing Tests That Do Not Provide Authorization Headers

**What goes wrong:**
`authenticatedProcedure` already exists in `packages/web/src/trpc/init.ts` and enforces the API key when `CAULDRON_API_KEY` is set. Switching routers from `publicProcedure` to `authenticatedProcedure` silently breaks every test that calls tRPC procedures without setting the env var or providing an auth header. The integration tests (`schema-invariants.integration.test.ts`, `event-sourcing.integration.test.ts`) call Drizzle directly and are unaffected. But any test that goes through the tRPC caller — web component tests, E2E tests — gets `UNAUTHORIZED` errors at runtime, which look like test infrastructure failures, not auth failures.

**Why it happens:**
The procedure type change is invisible at build time. tRPC procedure types do not change the TypeScript call signature for callers. Developers switch from `publicProcedure` to `authenticatedProcedure`, all types compile cleanly, and tests fail at runtime with opaque errors.

**How to avoid:**
The existing `validateApiKey` function already has a dev-mode bypass: if `CAULDRON_API_KEY` is not set in the environment, all requests are allowed (`return true`). Verify this bypass is active in the test environment. In CI, ensure `CAULDRON_API_KEY` is either unset or set to a known test value that all tests provide. Do not add auth headers to every existing test — rely on the bypass. Add exactly one new test that sets `CAULDRON_API_KEY` to a known value, makes a request without a matching header, and asserts `UNAUTHORIZED`.

**Warning signs:**
- Web component tests or E2E tests failing with `UNAUTHORIZED` after procedure type change
- `CAULDRON_API_KEY` set in CI environment but not provided in test requests

**Phase to address:**
tRPC auth middleware phase — verify the dev-mode bypass works in test env before switching any procedure.

---

### Pitfall 5: IPC Between MCP Process and Inngest Engine Creates a Silent Failure Mode With No User Visibility

**What goes wrong:**
The current MCP push notification uses an internal API cast hack (`(server as unknown as {...}).server?.sendResourceUpdated?.(...)`) that works only when the MCP server and the Inngest job runner are in the same process. The v1.2 fix moves this to proper IPC. If IPC fails silently — Redis `PUBLISH` to a channel with no subscribers, or the MCP process not running — the Inngest job completes successfully, writes to the DB, but the MCP client never receives a push notification and believes the job is still pending.

**Why it happens:**
IPC failures are asynchronous and invisible to the original caller (the `generate-image` MCP tool returns immediately with a job ID). Redis `PUBLISH` does not wait for subscribers and returns the number of receivers (0 if none) without throwing. Optional chaining (`?.`) in the current notification code eats failures entirely.

**How to avoid:**
Design the MCP client as pull-first, push-as-optimization. The `check-job-status` tool already does a direct DB query and is the reliable path. Push notifications are best-effort acceleration, not a correctness requirement. For the IPC transport, use Redis pub/sub with a namespaced channel (`cauldron:mcp:job-status:{jobId}`) to avoid colliding with Inngest's internal Redis usage. If `PUBLISH` returns 0 receivers, log a warning but do not fail the job. Add a test that verifies job status is correctly returned by `check-job-status` even when push notification is suppressed.

**Warning signs:**
- MCP client blocking indefinitely waiting for push that was silently dropped
- `notifyJobStatusChanged` swallowing errors via optional chaining with no log entry

**Phase to address:**
MCP IPC architecture phase — document pull-first contract before writing IPC code.

---

### Pitfall 6: Optimistic Locking Version Check Implemented With Two Separate Queries Instead of One Atomic UPDATE

**What goes wrong:**
The `beads` table has a `version` column for optimistic concurrency (confirmed in schema — version 1 default, `version` column present). Correct optimistic locking requires a single atomic `UPDATE beads SET status = 'completed', version = version + 1 WHERE id = $1 AND version = $expected_version`. If the implementation reads the bead first, checks the version in application code, then issues a separate UPDATE, the check is not atomic — two concurrent completion attempts can both read the same version, pass the application-level check, and both update the row. The second write silently overwrites the first.

**Why it happens:**
Drizzle ORM does not enforce version conditions automatically. The natural Drizzle pattern is `.update(beads).set({status: 'completed'}).where(eq(beads.id, id))` — there is nothing in the API that reminds the developer to add the version condition. The existing `concurrent-claim.integration.test.ts` tests atomic claiming, not completion — the completion path is untested for concurrency today.

**How to avoid:**
The UPDATE must include `AND version = $current_version` in the WHERE clause via `and(eq(beads.id, id), eq(beads.version, expectedVersion))`. Use `.returning()` and check if the returned array is empty — if no row was returned, the version was stale. Throw a `StaleVersionError` and let Inngest retry the step. Add an integration test that fires two concurrent completion attempts for the same bead and asserts exactly one succeeds and one receives a stale version error.

**Warning signs:**
- No test for concurrent bead completion (the concurrent-claim test does not cover this)
- Update statement in code that does not include version condition in WHERE clause

**Phase to address:**
Optimistic locking on bead completion phase — requires integration test, not just unit test.

---

### Pitfall 7: N+1 Fix Changes the Inferred Return Type and Breaks Web Components at Runtime

**What goes wrong:**
The current `projects.list` tRPC procedure issues `1 + N + N` queries (confirmed in `projects.ts`: one for projects, one per project for latest event, one per project for total cost). The fix uses a JOIN or CTE to collapse to 1 query. However, changing the query changes the column set and nullability inferred by Drizzle. If `latestEvent.occurredAt` becomes `Date | null` instead of `Date`, components that call `.toLocaleDateString()` on it crash at runtime with `Cannot read properties of null`.

**Why it happens:**
The response type of the `list` procedure is inferred from the Drizzle query shape. The current code uses a `Promise.all` with multiple queries and manually constructs the return object — the types are whatever the developer writes. A JOIN query changes the inferred types and introduces nullability. TypeScript may catch it at compile time if the component is typed, but if the component uses the tRPC inferred type it may drift silently.

**How to avoid:**
Keep the return shape stable and explicit. The existing return shape has `lastActivity`, `lastEventType`, and `totalCostCents`. Use a subquery approach that returns the same shape with the same nullability. Add a Zod output validator to the procedure so the return type is validated at the boundary regardless of how the query is written. Write a component test that renders the project list with a project that has no events and verify it does not crash (this is the zero-event edge case already present in test data).

**Warning signs:**
- TypeScript errors in web components after changing the query (good — fix before merging)
- Runtime crash on `project.lastActivity.toLocaleDateString()` when `lastActivity` is `null`

**Phase to address:**
N+1 query elimination phase — pin return type with Zod output schema before changing query.

---

### Pitfall 8: Seed Version UNIQUE Constraint Violates Root Seeds Due to NULL Semantics

**What goes wrong:**
A naive `UNIQUE (parent_seed_id, version)` table-level constraint does not prevent duplicate root seeds (where `parent_seed_id IS NULL`) because PostgreSQL treats two NULLs as not equal in UNIQUE constraints — `(NULL, 1)` does not conflict with another `(NULL, 1)`. The constraint silently allows multiple root seeds per project with the same version. The actual uniqueness requirement is scoped to evolution seeds only (where a parent exists), so a partial index is the correct construct.

**Why it happens:**
Developers add a UNIQUE constraint thinking it covers all cases. PostgreSQL's NULL-in-UNIQUE behavior is a known footgun that is easy to miss unless you have worked with it before. The migration passes, data is inserted, and the constraint appears to work — until someone writes a test expecting two root seeds to conflict and is surprised when they don't.

**How to avoid:**
Use a partial unique index, not a table-level constraint:
```sql
CREATE UNIQUE INDEX seeds_parent_version_unique
  ON seeds (parent_seed_id, version)
  WHERE parent_seed_id IS NOT NULL;
```
Write this in raw SQL in the migration file — Drizzle schema definitions do not support partial indexes natively. Add a comment in the schema file pointing to the manual migration. Add integration tests: one that inserts two root seeds and asserts no constraint violation, and one that inserts two evolution seeds with the same `parent_seed_id` and `version` and asserts rejection.

**Warning signs:**
- Root seed creation failing unexpectedly with unique constraint violation (indicates a naive non-partial constraint was added)
- Tests expecting root seed conflicts that pass when they should be testing something else

**Phase to address:**
Seed version uniqueness phase — use partial index explicitly; document Drizzle limitation.

---

### Pitfall 9: New Indexes on Write-Path Tables Lock Rows During Creation

**What goes wrong:**
`CREATE INDEX` acquires a `ShareLock` on the table, blocking all concurrent writes for the duration of index creation. In dev with few rows this is instant. In a populated environment where Inngest workers are appending events or inserting bead edges during a pipeline run, the lock causes a full pipeline stall — Inngest steps waiting for DB writes time out and are retried, potentially causing duplicate side effects. Migration 0013 uses `CREATE INDEX IF NOT EXISTS` but not `CONCURRENTLY` (confirmed in migration history).

**Why it happens:**
Drizzle generates standard `CREATE INDEX` SQL from schema index definitions. There is no Drizzle API for `CONCURRENTLY`. Developers use Drizzle's migration generation without reviewing the generated SQL for index operations.

**How to avoid:**
For any new index on write-path tables (`events`, `beads`, `bead_edges`, `llm_usage`, `asset_jobs`), write the migration SQL manually using `CREATE INDEX CONCURRENTLY IF NOT EXISTS`. Note that `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block — it must be the only DDL statement in its migration file, or the migration runner must not wrap it in a transaction. Verify by running the migration against a populated database (the test DB seeded with integration test data is sufficient).

**Warning signs:**
- Migration taking unexpectedly long on a populated DB
- Inngest step timeouts during migration window

**Phase to address:**
Events and bead_edges index phases — write migration SQL manually; use CONCURRENTLY; verify against populated DB.

---

### Pitfall 10: KEK Rotation Breaks In-Flight Holdout Decryption

**What goes wrong:**
KEK rotation generates a new Key Encryption Key and re-encrypts all DEK rows. If holdout evaluation is in progress — reading the DEK to decrypt the ciphertext — when the rotation runs, the in-memory DEK copy is encrypted under the old KEK. If the old KEK is removed from the environment before the evaluation completes, the decryption fails with a generic crypto error, not a diagnostic "key not found" error. The holdout vault is left in an inconsistent state.

**Why it happens:**
KEK rotation is treated as a pure database operation: update the `encrypted_dek` column, swap the env var. The application-level implication — in-flight evaluations hold an old DEK reference — is overlooked. Cauldron uses envelope encryption (AES-256-GCM, DEK per record, DEK encrypted by KEK), which means rotation must be atomic across all DEK rows before the old key is removed.

**How to avoid:**
Use a two-phase rotation: (1) re-encrypt all DEKs under the new KEK while keeping old-KEK-encrypted copies accessible; (2) verify all decryptions succeed under the new KEK; (3) remove old-KEK copies and retire the old key only after all in-flight evaluations have completed. The audit trail must record rotation start, completion of all DEK re-encryptions, and old-key retirement as distinct events. Never remove the old key in the same deployment as adding the new one.

**Warning signs:**
- Crypto errors during holdout evaluation following a KEK rotation
- Audit trail showing "rotation started" but missing "old key retired" entry

**Phase to address:**
KEK rotation phase — design dual-encrypt window before writing code.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Fire-and-forget usage recording | LLM calls return faster | Budget check allows overspend after record loss | Never for budget enforcement; acceptable for analytics-only logging |
| `publicProcedure` everywhere | No auth friction in dev | All routes exposed when `CAULDRON_API_KEY` is set | Only in local dev with no env key configured |
| `ON DELETE no action` on all FKs | Safe default, no accidental deletes | Manual orphan cleanup required for project deletion | Acceptable during greenfield development; must be resolved before deletion is a product feature |
| Manual sequence assignment (MAX+1) | Simple application code | Race condition produces duplicates under concurrency | Never for event sourcing where sequence ordering is a correctness invariant |
| Internal API cast for MCP notifications | Works in same-process scenario | Silent no-op when SDK internals change; undetectable failure | Acceptable as a temporary scaffold; not in production |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Inngest webhook + tRPC auth | Switching tRPC procedures to `authenticatedProcedure` and assuming Inngest webhook is covered | Inngest webhook is a Route Handler at `/api/inngest`, not a tRPC procedure — auth middleware does not apply; it uses `INNGEST_SIGNING_KEY` independently |
| Drizzle + partial UNIQUE index | Using Drizzle schema `unique()` for a partial index (not supported) | Write the `CREATE UNIQUE INDEX ... WHERE` statement in raw SQL in the migration file; add a comment in the schema file |
| Redis pub/sub + Inngest | Publishing to a channel that collides with Inngest's internal Redis key namespace | Use a dedicated channel prefix (`cauldron:mcp:job-status:{jobId}`) — Inngest uses its own prefixed keys |
| PostgreSQL LISTEN/NOTIFY + index migration | Running `CREATE INDEX` (no CONCURRENTLY) blocks `NOTIFY` delivery during lock window, breaking SSE stream continuity | Use `CONCURRENTLY` for all write-path indexes |
| Drizzle `.returning()` + optimistic lock | Treating a zero-row result from `.returning()` as success | Explicitly check `rows.length === 0` and throw `StaleVersionError` — Drizzle does not throw on zero-row updates |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| N+1 in projects list | Dashboard load time grows linearly with project count | Single query using subquery or CTE; keep return type stable | Noticeable at ~20 projects; severe at 100+ |
| Budget check full table scan | Each gateway call does `SUM(cost_cents)` scan | Existing `llm_usage_project_created_idx` covers this; verify with `EXPLAIN ANALYZE` after adding synchronous write | Degrades at ~10k usage rows per project |
| Synchronous usage write in LLM hot path | All LLM calls take 10–50ms longer | Accept latency as cost of accuracy; optimize DB connection pool if needed | Constant hit from first use — not scale-dependent, but immediately visible |
| `bead_edges` forward lookup without reverse index | Ready-bead query scans all edges for every status check | Add `to_bead_id` index using `CREATE INDEX CONCURRENTLY` | Noticeable at ~500 edges; severe at 5k+ |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Switching tRPC to `authenticatedProcedure` but not verifying Inngest signing key validation | Inngest webhook can trigger pipeline steps without auth | Verify `INNGEST_SIGNING_KEY` is validated in the Inngest Route Handler — it is separate from tRPC auth |
| Storing KEK in process env and retiring old key by env var swap without restarting | Old KEK stays in memory until restart; newly deployed process may use new key while old process uses old key | Explicitly null the in-memory key reference on rotation; require process restart as part of rotation procedure |
| Logging decryption errors with DEK bytes in context | If log aggregator is compromised, DEKs are exposed | Log only `dekId` or `seedId` in error context — never log raw key material |
| MCP IPC over unauthenicated Redis channel | Any local process can publish fake job status updates | Use Redis AUTH in any non-local environment; or sign IPC messages with a shared HMAC key |

---

## "Looks Done But Isn't" Checklist

- [ ] **Event sequence UNIQUE constraint:** Run the duplicate-check query against the actual dev and test databases before running the migration. The migration succeeds on an empty DB but fails on real accumulated data.
- [ ] **Optimistic locking on bead completion:** Verify the UPDATE SQL includes `AND version = $expected` in the WHERE clause — not just an application-level check before the update. Use `.returning()` and assert `rows.length > 0`.
- [ ] **Auth middleware:** Verify `CAULDRON_API_KEY` is unset in the test runner environment (or all tests provide the correct header). The dev-mode bypass is the correct approach — do not add auth headers to every existing test.
- [ ] **CASCADE DELETE:** After migration, run a test that deletes a project and counts surviving rows in `llm_usage` and `events` — these should survive with null foreign keys, not be deleted.
- [ ] **Seed version partial index:** Confirm the index SQL contains `WHERE parent_seed_id IS NOT NULL`. Confirm two root seeds can be inserted without constraint violation.
- [ ] **Index CONCURRENTLY:** Verify migration SQL files for new indexes use `CREATE INDEX CONCURRENTLY IF NOT EXISTS`. Run `EXPLAIN ANALYZE` on the ready-bead query before and after to confirm the planner uses the new index.
- [ ] **MCP IPC:** Verify `check-job-status` returns the correct final state independently of whether push notification was delivered. The pull path must be reliable without IPC.
- [ ] **KEK rotation audit trail:** Verify three distinct events are logged: rotation started, all DEKs re-encrypted under new key, old key retired. A rotation that stops after "started" is worse than no rotation.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| UNIQUE constraint migration fails (duplicates exist) | LOW | Roll back migration; run deduplication query; re-run migration in next deploy |
| CASCADE DELETE wipes `llm_usage` rows accidentally | HIGH | Restore from backup; add `SET NULL` FK constraint before next delete; no in-place recovery without a backup |
| Synchronous usage write loses a record on DB failure | LOW | Recompute cost from the `gateway_call_completed` events (payload contains `costCents`) |
| Auth middleware breaks all tests | LOW | Unset `CAULDRON_API_KEY` in test runner config; no code changes needed |
| IPC message dropped, job status not delivered | LOW | MCP client re-polls via `check-job-status`; no data loss, only additional latency |
| Bead completion optimistic lock conflict | LOW | Inngest retries the step; read current version and re-attempt; idempotent by design |
| KEK rotation mid-evaluation decryption failure | MEDIUM | Re-run holdout evaluation after rotation completes; vault is idempotent |
| Index creation locks write-path table | MEDIUM | Cancel migration; re-run with CONCURRENTLY; Inngest steps that timed out during the lock auto-retry |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| UNIQUE constraint on events with existing duplicates | Event sequence uniqueness | Data audit query returns zero rows; migration succeeds on populated test DB |
| CASCADE DELETE graph incomplete | Cascading FK cleanup | Integration test: delete project; assert `llm_usage` and `events` rows survived with null FKs |
| Synchronous usage write latency and loss | Synchronous usage recording | Benchmark LLM call latency before and after; verify no lost records when DB throws transiently |
| Auth middleware breaks existing tests | tRPC auth middleware | All existing tests pass with `CAULDRON_API_KEY` unset; one new test correctly fails with wrong key |
| IPC silent message drop | MCP IPC architecture | Test: suppress IPC; verify `check-job-status` still returns correct final state |
| Bead completion version check not atomic | Optimistic locking on bead completion | Integration test: two concurrent completions; exactly one succeeds; one receives stale version error |
| N+1 return type drift | N+1 query elimination | TypeScript compiles with no errors; zero-event project renders without crash in component test |
| Seed version constraint breaks root seeds | Seed version uniqueness | Two root seeds insert without conflict; duplicate evolution seeds are rejected |
| Index migration locks write-path tables | Events and bead_edges index | Migrations use CONCURRENTLY; no Inngest timeouts during migration in integration environment |
| KEK rotation breaks in-flight decryption | KEK rotation | Holdout evaluation survives concurrent KEK rotation; audit trail contains all three events |

---

## Sources

- Cauldron codebase inspection (2026-04-01):
  - `packages/shared/src/db/schema/event.ts` — no UNIQUE constraint on `(project_id, sequence_number)`
  - `packages/shared/src/db/schema/bead.ts` — `version` column present; `bead_edges` has no `to_bead_id` index
  - `packages/shared/src/db/schema/seed.ts` — `version` and `parent_id` present; no UNIQUE constraint
  - `packages/engine/src/gateway/gateway.ts` — `recordUsageAsync` is fire-and-forget (`void ... .catch(...)`)
  - `packages/web/src/trpc/init.ts` — `authenticatedProcedure` exists but all routers use `publicProcedure`
  - `packages/mcp/src/resources/job-status.ts` — cast hack for `sendResourceUpdated`, optional chaining hides failures
  - `packages/shared/src/db/migrations/0013_whole_daimon_hellstrom.sql` — all FKs use `ON DELETE no action`
  - `packages/shared/src/db/__tests__/event-sourcing.integration.test.ts` — sequential-only sequence tests, no concurrent coverage
  - `packages/engine/src/execution/timeout-supervisor.ts` — timer-based, not yet wired to agent process kill
- PostgreSQL documentation: NULL semantics in UNIQUE constraints (NULLs are not equal — two NULL rows do not violate a UNIQUE constraint)
- PostgreSQL documentation: `CREATE INDEX CONCURRENTLY` — cannot run inside a transaction block; requires a dedicated migration file

---
*Pitfalls research for: Cauldron v1.2 architectural hardening*
*Researched: 2026-04-01*
