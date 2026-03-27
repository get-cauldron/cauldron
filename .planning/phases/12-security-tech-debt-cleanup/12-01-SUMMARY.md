---
phase: 12-security-tech-debt-cleanup
plan: 01
subsystem: security, cli, docs
tags: [auth, sse, cli-flags, verification, tech-debt]
dependency_graph:
  requires: []
  provides:
    - SSE endpoint with auth gate (SC-1)
    - CLI --project-id flag (SC-2)
    - Phase 09 VERIFICATION.md status consistency (SC-3)
  affects:
    - packages/web/src/app/api/events/[projectId]/route.ts
    - packages/api/src/cli.ts
tech_stack:
  added: []
  patterns:
    - Bearer token auth gate before ReadableStream construction
    - parseArgs project-id precedence chain
key_files:
  created:
    - packages/web/src/app/api/events/__tests__/route.test.ts
    - packages/api/src/__tests__/kill-project-id-flag.test.ts
  modified:
    - packages/web/src/app/api/events/[projectId]/route.ts
    - packages/api/src/cli.ts
    - .planning/phases/09-cli/09-VERIFICATION.md
decisions:
  - Auth gate inlined in SSE route (not extracted to shared function) — 7-line pattern, no shared module needed, SSE route has no access to createTRPCContext
  - project-id resolves via project-id ?? project ?? CAULDRON_PROJECT_ID chain — backward compatible
metrics:
  duration: 8min
  completed: 2026-03-27
  tasks_completed: 3
  files_modified: 5
---

# Phase 12 Plan 01: Security Tech Debt Cleanup Summary

**One-liner:** Bearer token auth gate added to SSE endpoint before stream construction, `--project-id` flag added to CLI with three-tier precedence, and Phase 09 verification doc status corrected from gaps_found to passed.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | SSE auth gate tests | 6e7cd46 | packages/web/src/app/api/events/__tests__/route.test.ts |
| 1 (GREEN) | SSE auth gate implementation | 5724df4 | packages/web/src/app/api/events/[projectId]/route.ts |
| 2 (RED) | kill --project-id tests | bc137c2 | packages/api/src/__tests__/kill-project-id-flag.test.ts |
| 2 (GREEN) | --project-id flag in cli.ts | 6590467 | packages/api/src/cli.ts |
| 3 | Phase 09 VERIFICATION.md correction | df37a24 | .planning/phases/09-cli/09-VERIFICATION.md |

## Verification Results

1. `pnpm --filter @cauldron/web exec vitest run src/app/api/events` — 4/4 tests pass
2. `pnpm --filter @cauldron/cli exec vitest run src/__tests__/kill-project-id-flag` — 4/4 tests pass
3. `grep "Status.*passed" .planning/phases/09-cli/09-VERIFICATION.md` — matches in both frontmatter and body
4. Full suites: @cauldron/web 26/26 pass, @cauldron/cli 85/85 pass — no regressions

## Changes Made

### Task 1: SSE Auth Gate (SC-1)

Added auth check in `packages/web/src/app/api/events/[projectId]/route.ts` BEFORE `new ReadableStream(...)`:

```typescript
// Auth gate — must come before stream construction (SC-1)
const expectedKey = process.env['CAULDRON_API_KEY'];
if (expectedKey) {
  const authHeader = request.headers.get('Authorization');
  const providedKey = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : null;
  if (providedKey !== expectedKey) {
    return new Response('Unauthorized', { status: 401 });
  }
}
```

Pattern matches `validateApiKey` from `packages/web/src/trpc/init.ts`. Auth check before stream prevents 200+headers being sent before auth evaluated.

### Task 2: --project-id Flag (SC-2)

Three changes to `packages/api/src/cli.ts`:
1. Added `'project-id': { type: 'string' }` to parseArgs options
2. Updated flags.projectId to `project-id ?? project ?? CAULDRON_PROJECT_ID`
3. Added help text line for `--project-id` in printUsage()

`kill.ts` unchanged — it already reads `flags.projectId`.

### Task 3: Phase 09 VERIFICATION.md (SC-3)

Three line changes in body:
- Line 29: `gaps_found` → `passed`
- Line 30: `No — initial verification` → `Yes — gaps resolved inline (see frontmatter)`
- Line 46: `5/7 truths verified...` → `7/7 truths verified (2 gaps resolved — see frontmatter gaps section)`

Historical FAILED table entries preserved as accurate record of initial verification state.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

Files exist:
- packages/web/src/app/api/events/__tests__/route.test.ts — FOUND
- packages/web/src/app/api/events/[projectId]/route.ts (modified) — FOUND
- packages/api/src/__tests__/kill-project-id-flag.test.ts — FOUND
- packages/api/src/cli.ts (modified) — FOUND
- .planning/phases/09-cli/09-VERIFICATION.md (modified) — FOUND

Commits exist:
- 6e7cd46 — FOUND (test(12-01): add failing tests for SSE auth gate)
- 5724df4 — FOUND (feat(12-01): add auth gate to SSE endpoint)
- bc137c2 — FOUND (test(12-01): add tests for --project-id flag)
- 6590467 — FOUND (feat(12-01): add --project-id flag to CLI)
- df37a24 — FOUND (docs(12-01): correct Phase 09 VERIFICATION.md)
