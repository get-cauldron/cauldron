---
phase: 13-re-scope-to-get-cauldron-already-have-the-github-and-npm-orgs
verified: 2026-03-27T19:31:46Z
status: passed
score: 6/6 must-haves verified
re_verification: false
---

# Phase 13: Re-scope to @get-cauldron/* Verification Report

**Phase Goal:** Rename npm scope from @cauldron/* to @get-cauldron/*, consolidate trpc-types into shared, rename packages/api to packages/cli, and update all references project-wide.
**Verified:** 2026-03-27T19:31:46Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                     | Status     | Evidence                                                                 |
| --- | ------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------ |
| 1   | All package.json name fields use @get-cauldron/* scope                    | VERIFIED | cli/engine/shared/web all show @get-cauldron/* in name field             |
| 2   | @cauldron/trpc-types package no longer exists; exports live in shared     | VERIFIED | packages/trpc-types absent; shared has ./trpc-types subpath export       |
| 3   | packages/api directory renamed to packages/cli                            | VERIFIED | packages/cli/ exists with full source; packages/api has no source/pkg   |
| 4   | Zero occurrences of @cauldron/ in source files, imports, or workspace deps | VERIFIED | grep across packages/, scripts/, .claude/, .planning/ active docs: 0 hits |
| 5   | All tests pass, typecheck passes, build succeeds after rename             | VERIFIED | 514 tests pass; pnpm -r typecheck exits 0; shared/engine/cli build clean |
| 6   | CLAUDE.md and planning docs updated to reference new scope                | VERIFIED | CLAUDE.md, ROADMAP.md, STATE.md, research/*, skills/*.md: zero @cauldron/ |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact                               | Expected                                   | Status     | Details                                                                       |
| -------------------------------------- | ------------------------------------------ | ---------- | ----------------------------------------------------------------------------- |
| `packages/cli/package.json`            | name: @get-cauldron/cli                    | VERIFIED | name field confirmed; no @cauldron/ workspace deps                           |
| `packages/engine/package.json`         | name: @get-cauldron/engine                 | VERIFIED | name field confirmed                                                          |
| `packages/shared/package.json`         | name: @get-cauldron/shared with exports    | VERIFIED | exports field has "." and "./trpc-types" subpath                             |
| `packages/web/package.json`            | name: @get-cauldron/web                    | VERIFIED | name field confirmed                                                          |
| `packages/shared/src/trpc-types.ts`    | Re-export AppRouter from web router        | VERIFIED | File exists: `export type { AppRouter } from '../../web/src/trpc/router.js'` |
| `packages/trpc-types/`                 | Must NOT exist                             | VERIFIED | Directory absent                                                              |
| `packages/api/` (source + package.json)| Must NOT contain source files              | VERIFIED | No package.json, no source files; only gitignored build artifacts (dist/, node_modules/, .turbo/) |

### Key Link Verification

| From                                  | To                                     | Via                          | Status   | Details                                                          |
| ------------------------------------- | -------------------------------------- | ---------------------------- | -------- | ---------------------------------------------------------------- |
| packages/shared exports               | ./trpc-types subpath                   | package.json exports field   | WIRED    | `"./trpc-types": "./src/trpc-types.ts"` in exports              |
| packages/shared/src/trpc-types.ts     | web's AppRouter type                   | cross-package re-export      | WIRED    | `export type { AppRouter } from '../../web/src/trpc/router.js'` |
| packages/cli/src/trpc-client.ts       | @get-cauldron/shared/trpc-types        | explicit TRPCClient<AppRouter>| WIRED    | TS2883 fix applied; explicit return type annotation present      |
| pnpm workspace                        | packages/cli (not packages/api)        | pnpm-workspace.yaml packages/*| WIRED   | pnpm resolves 4 packages; packages/api has no package.json      |

### Data-Flow Trace (Level 4)

Not applicable — this phase is a pure refactor (package scope rename, directory rename, import rewriting). No new UI components or data-rendering artifacts were introduced.

### Behavioral Spot-Checks

| Behavior                          | Command                                          | Result                              | Status |
| --------------------------------- | ------------------------------------------------ | ----------------------------------- | ------ |
| shared package exports trpc-types | pnpm --filter @get-cauldron/shared build         | tsc exits 0                         | PASS   |
| engine package builds clean       | pnpm --filter @get-cauldron/engine build         | tsc exits 0                         | PASS   |
| cli package builds clean          | pnpm --filter @get-cauldron/cli build            | tsc exits 0                         | PASS   |
| typecheck passes all packages     | pnpm -r typecheck                                | all 4 packages: Done                | PASS   |
| all 514 unit tests pass           | pnpm -r test                                     | 30+371+87+26 = 514 tests passing    | PASS   |
| zero @cauldron/ in active files   | grep -r "@cauldron/" packages/ scripts/ .claude/ | 0 matches                           | PASS   |

**Note on packages/web build:** Next.js Turbopack build fails with "Module not found" errors on relative `.js` extension imports (e.g., `../../../../inngest/client.js`). This is a pre-existing issue unrelated to the scope rename — the failure occurs on the base commit before any phase 13 changes. The web package typechecks correctly with `tsc --noEmit`.

### Requirements Coverage

| Requirement | Source Plan | Description                                                            | Status    | Evidence                                                   |
| ----------- | ----------- | ---------------------------------------------------------------------- | --------- | ---------------------------------------------------------- |
| SC-1        | 13-01       | All package.json name fields use @get-cauldron/* scope                 | SATISFIED | All 4 packages confirmed @get-cauldron/* names             |
| SC-2        | 13-01       | @cauldron/trpc-types no longer exists; exports in @get-cauldron/shared | SATISFIED | trpc-types dir gone; shared has trpc-types.ts + subpath    |
| SC-3        | 13-01       | packages/api renamed to packages/cli                                   | SATISFIED | packages/cli exists with source; packages/api has no source |
| SC-4        | 13-01/02    | Zero occurrences of @cauldron/ in source, imports, workspace deps      | SATISFIED | grep returns 0 matches across all active project files     |
| SC-5        | 13-02       | All tests pass, typecheck passes, build succeeds                       | SATISFIED | 514 tests pass; typecheck green; shared/engine/cli build   |
| SC-6        | 13-02       | CLAUDE.md and planning docs updated to reference new scope             | SATISFIED | CLAUDE.md, active planning docs, skills: zero @cauldron/   |

### Anti-Patterns Found

None. No TODO/FIXME/placeholder comments, empty implementations, or hardcoded stubs introduced by this phase. The phase was a pure mechanical rename.

**Note on packages/api leftover:** The `packages/api/` directory still exists on disk but contains only gitignored build artifacts (168 compiled files in `dist/`, plus `node_modules/` and `.turbo/`). There is no `package.json` and no source files. pnpm does not recognize it as a workspace member. Git reports a clean working tree — the directory is fully gitignored. This is a cosmetic leftover, not a functional gap.

Historical planning documents in `.planning/phases/01-*` through `.planning/phases/12-*` retain `@cauldron/` references because they document past state. These are read-only historical artifacts and SC-6 covers active planning docs (ROADMAP.md, STATE.md, research/, etc.) — all of which were updated.

### Human Verification Required

None — all success criteria are mechanically verifiable and confirmed programmatically.

### Gaps Summary

No gaps. All 6 success criteria verified against the actual codebase.

The one cosmetic item worth noting is the orphaned `packages/api/dist/` build artifact directory. It has no functional impact (not a workspace member, not tracked by git, not referenced anywhere) but could be cleaned up with `rm -rf packages/api` at any point.

---

_Verified: 2026-03-27T19:31:46Z_
_Verifier: Claude (gsd-verifier)_
