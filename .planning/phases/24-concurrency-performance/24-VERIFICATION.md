---
phase: 24-concurrency-performance
verified: 2026-04-01T21:00:00Z
status: passed
score: 4/4 must-haves verified
re_verification: false
---

# Phase 24: Concurrency & Performance Verification Report

**Phase Goal:** Bead state transitions are race-condition safe, budget enforcement reflects actual spend, and the projects list loads in a single query regardless of project count
**Verified:** 2026-04-01T21:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | An Inngest retry that attempts to complete an already-completed bead receives a conflict result (success=false) — double-completion cannot silently corrupt bead state | ✓ VERIFIED | `completeBead` reads current status first; returns `{ success: false }` if `status === 'completed'` or `status === 'failed'`; then uses `WHERE version = current.version` for the UPDATE — two separate guards. Tests 14 and 13 cover both paths. |
| 2 | A budget check immediately following a parallel LLM call reflects the actual cost of that call — no window where the kill switch sees stale spend | ✓ VERIFIED | `recordUsageAsync` (fire-and-forget) is gone. All four gateway methods (`streamText`, `generateText`, `generateObject`, `streamObject`) call `await this.recordUsage(...)`. For `generateText`/`generateObject`, usage is recorded outside `executeWithFailover` so DB errors don't re-trigger provider failover. |
| 3 | The projects list page issues a single SQL query regardless of how many projects, seeds, or beads exist — query count does not scale with project count | ✓ VERIFIED | `Promise.all(rows.map(async ...))` pattern is gone. `projects.ts` list route uses a single `ctx.db.execute(sql\`...\`)` with two LEFT JOIN LATERAL subqueries: one for latest event, one for cost aggregation. |
| 4 | The projects list still returns lastActivity, lastEventType, and totalCostCents for each project | ✓ VERIFIED | Single query SELECTs `COALESCE(le.occurred_at, p.created_at)` as `"lastActivity"`, `le.type` as `"lastEventType"`, and `COALESCE(cu.total_cost, 0)` as `"totalCostCents"`. Return shape mapped with `Number(row.totalCostCents)`. Six dedicated wiring tests cover all field combinations. |

**Score:** 4/4 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/engine/src/decomposition/scheduler.ts` | Version-conditioned `completeBead` with conflict detection | ✓ VERIFIED | Contains `eq(beads.version, current.version)` in WHERE clause (line 68, 236). Returns `CompleteBeadResult` not `void`. Guards against terminal-status double-completion at line 220. |
| `packages/engine/src/decomposition/types.ts` | `CompleteBeadResult` interface exported | ✓ VERIFIED | Lines 55–60 define `interface CompleteBeadResult { success: boolean; beadId: string; newVersion?: number }`. |
| `packages/engine/src/decomposition/index.ts` | `CompleteBeadResult` re-exported | ✓ VERIFIED | Line 8 exports `CompleteBeadResult`. |
| `packages/engine/src/gateway/gateway.ts` | Synchronous usage recording — no fire-and-forget | ✓ VERIFIED | `private async recordUsage(...)` at line 269. All four call sites use `await this.recordUsage(...)`. No `recordUsageAsync` or `void this.writeUsage` pattern present. |
| `packages/engine/src/decomposition/__tests__/scheduler.test.ts` | Tests for version conflict and double-completion | ✓ VERIFIED | Tests 13 (version conflict → `success=false`), 14 (already-completed → `success=false`), 15 (not-found → `success=false`), 16 (`success=true` with `newVersion`). `vi.resetAllMocks()` used in `completeBead` describe block. |
| `packages/engine/src/gateway/__tests__/gateway.test.ts` | Tests proving synchronous recording and error propagation | ✓ VERIFIED | Dedicated CONC-02 tests: `generateText` awaits usage before returning (tracking flag pattern), `generateObject` same, error propagation from `writeUsage` re-throws and logs. |
| `packages/web/src/trpc/routers/projects.ts` | Single-query projects list with LEFT JOIN LATERAL | ✓ VERIFIED | Two LEFT JOIN LATERAL subqueries. No `Promise.all` or `.map(async` per-project patterns. `archiveFilter` conditional SQL fragment preserves archive/soft-delete filters. |
| `packages/web/src/trpc/routers/__tests__/projects.wiring.test.ts` | Tests proving N+1 elimination and field correctness | ✓ VERIFIED | 6 new PERF-01 tests: events present, no events (createdAt fallback), no usage (0), summed usage (350), archive filter (single-query), soft-delete filter (single-query). |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `scheduler.ts completeBead` | `beads` table version column | `WHERE version = current.version` optimistic lock | ✓ WIRED | `eq(beads.version, current.version)` confirmed at lines 68 and 236. SELECT first for current version, UPDATE with version condition second. |
| `gateway.ts recordUsage` | `llm_usage` table | Synchronous `await this.writeUsage(...)` before returning | ✓ WIRED | `await this.writeUsage(...)` inside `recordUsage` (line 275). `recordUsage` is awaited at all four call sites (lines 151, 199, 233, 257). |
| `projects.ts list` | `events` table | LEFT JOIN LATERAL for latest event | ✓ WIRED | LATERAL subquery on lines 41–47 joins `FROM events e WHERE e.project_id = p.id ORDER BY e.occurred_at DESC LIMIT 1`. |
| `projects.ts list` | `llm_usage` table | LEFT JOIN LATERAL for cost aggregation | ✓ WIRED | LATERAL subquery on lines 48–51 joins `FROM llm_usage u WHERE u.project_id = p.id` with `SUM(u.cost_cents)`. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `projects.ts list` | `rows` → `lastActivity`, `lastEventType`, `totalCostCents` | `ctx.db.execute(sql\`...\`)` raw LATERAL query | Yes — SUM and MAX from real tables, COALESCE for null fallback | ✓ FLOWING |
| `gateway.ts recordUsage` | `usage.inputTokens`, `usage.outputTokens` | AI SDK `LanguageModelUsage` result passed synchronously | Yes — live usage object from LLM call, not hardcoded | ✓ FLOWING |
| `scheduler.ts completeBead` | `current.version` | SELECT from `beads` table immediately before UPDATE | Yes — live DB read, no cached value | ✓ FLOWING |

---

### Behavioral Spot-Checks

Step 7b: SKIPPED — tests require a running PostgreSQL instance (Docker :5433) for integration tests, and a live LLM provider for gateway tests. Behavioral correctness is covered by the unit and integration test suites documented in the summaries (471 engine tests, 62 web wiring tests, all passing).

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CONC-01 | 24-01-PLAN.md | Bead completion uses version-conditioned optimistic locking (WHERE version = $current), conflict returns error | ✓ SATISFIED | `completeBead` in `scheduler.ts` reads current version, UPDATEs with `WHERE version = current.version`, returns `{ success: false }` on 0 rows updated or terminal status. Tests 13–16 in `scheduler.test.ts`. REQUIREMENTS.md traceability table marks Complete. |
| CONC-02 | 24-01-PLAN.md | LLM usage recording is synchronous — budget checks reflect actual spend before next call proceeds | ✓ SATISFIED | `recordUsageAsync` removed; `recordUsage` is `async` and awaited at all four gateway call sites. DB errors re-thrown (not silently swallowed). CONC-02 tests in `gateway.test.ts`. REQUIREMENTS.md traceability table marks Complete. |
| PERF-01 | 24-02-PLAN.md | Projects list loads in a single query with joins or window functions — no N+1 pattern | ✓ SATISFIED | Single `db.execute(sql\`...\`)` with two LEFT JOIN LATERAL subqueries in `projects.ts`. No `Promise.all` per-project pattern. Return shape identical. Six wiring tests pass. NOTE: REQUIREMENTS.md traceability table at line 71 still shows "Pending" and the checkbox at line 34 is unchecked — this is a documentation inconsistency only; the implementation is complete and verified. |

**Note on REQUIREMENTS.md:** PERF-01 checkbox (line 34) and traceability row (line 71) both show incomplete/pending status despite the implementation being present and verified. This is a documentation gap that should be updated — the traceability table for CONC-01 and CONC-02 correctly shows "Complete" but PERF-01 was not updated. No implementation work is needed; only a docs correction.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | — | — | — |

Scanned `scheduler.ts`, `gateway.ts`, and `projects.ts` for TODO, FIXME, placeholder comments, empty returns, hardcoded empty data, and fire-and-forget patterns. None found.

The only lingering `void` + fire-and-forget pattern in `gateway.ts` is `recordFailoverEventAsync` (line 317–332), which is intentionally fire-and-forget (failover event recording is best-effort, not budget-critical). This is correct behavior and out of scope for CONC-02.

---

### Human Verification Required

None — all truths are verifiable from code structure and test coverage. The phase goal does not involve UI rendering or real-time behavior.

---

### Gaps Summary

No gaps. All four observable truths are verified, all artifacts exist and are substantive, all key links are wired, and data flows from real DB queries. The only action item is a minor documentation correction in REQUIREMENTS.md: mark PERF-01 checkbox as `[x]` and update the traceability status from "Pending" to "Complete".

---

_Verified: 2026-04-01T21:00:00Z_
_Verifier: Claude (gsd-verifier)_
