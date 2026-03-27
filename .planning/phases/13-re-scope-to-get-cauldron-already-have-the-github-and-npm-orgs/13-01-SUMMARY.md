---
phase: 13-re-scope-to-get-cauldron-already-have-the-github-and-npm-orgs
plan: 01
subsystem: infra
tags: [pnpm, monorepo, package-scope, npm-org, trpc-types, workspace]

# Dependency graph
requires: []
provides:
  - All packages renamed to @get-cauldron/* scope
  - packages/api renamed to packages/cli
  - packages/trpc-types deleted, AppRouter re-export merged into @get-cauldron/shared
  - @get-cauldron/shared gains ./trpc-types subpath export
affects: [14-update-all-imports, all-packages]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "@get-cauldron/* npm scope for all workspace packages"
    - "AppRouter type available via @get-cauldron/shared/trpc-types subpath export"
    - "packages/cli is the renamed packages/api directory"

key-files:
  created:
    - packages/shared/src/trpc-types.ts
  modified:
    - packages/shared/package.json
    - packages/engine/package.json
    - packages/web/package.json
    - packages/cli/package.json
    - pnpm-lock.yaml

key-decisions:
  - "packages/trpc-types eliminated: AppRouter re-export moved into @get-cauldron/shared as ./trpc-types subpath"
  - "packages/api renamed to packages/cli via git mv to preserve git history"
  - "All workspace deps updated from @cauldron/* to @get-cauldron/* scope in same commit"

patterns-established:
  - "Subpath exports pattern: packages/shared/package.json exports field with ./trpc-types pointing to src/trpc-types.ts"

requirements-completed: [SC-1, SC-2, SC-3, SC-4]

# Metrics
duration: 2min
completed: 2026-03-27
---

# Phase 13 Plan 01: Re-scope Package Names Summary

**All monorepo packages renamed from @cauldron/* to @get-cauldron/* scope, packages/api renamed to packages/cli, and packages/trpc-types eliminated by merging AppRouter re-export into @get-cauldron/shared subpath**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-27T18:52:21Z
- **Completed:** 2026-03-27T18:54:00Z
- **Tasks:** 1
- **Files modified:** 55 (48 renames + 5 package.json updates + pnpm-lock.yaml + new trpc-types.ts)

## Accomplishments

- Renamed all 4 package names from @cauldron/* to @get-cauldron/* scope (shared, engine, web, cli)
- Renamed packages/api directory to packages/cli via git mv (preserving full git history)
- Deleted packages/trpc-types package entirely
- Created packages/shared/src/trpc-types.ts with AppRouter re-export from web router
- Added ./trpc-types subpath export to packages/shared/package.json exports field
- Updated all workspace dependency references to @get-cauldron/* scope
- Ran pnpm install to regenerate lockfile with new package names

## Task Commits

Each task was committed atomically:

1. **Task 1: Merge trpc-types into shared, rename packages/api to packages/cli, update all package.json scopes** - `1b88532` (chore)

## Files Created/Modified

- `packages/shared/src/trpc-types.ts` - New file: re-exports AppRouter from web router (replaces packages/trpc-types)
- `packages/shared/package.json` - Renamed to @get-cauldron/shared, added exports field with ./trpc-types subpath
- `packages/engine/package.json` - Renamed to @get-cauldron/engine, @cauldron/shared dep updated
- `packages/web/package.json` - Renamed to @get-cauldron/web, @cauldron/engine and @cauldron/shared deps updated
- `packages/cli/package.json` - Renamed from packages/api to @get-cauldron/cli, removed @cauldron/trpc-types dep
- `pnpm-lock.yaml` - Regenerated with @get-cauldron/* package names
- `packages/cli/src/**` - All 47 source files renamed from packages/api (git rename, content unchanged)

## Decisions Made

- packages/trpc-types eliminated: the package existed only to export AppRouter. This is now a subpath export of @get-cauldron/shared, reducing the package count from 5 to 4 and eliminating an unnecessary indirection.
- packages/api renamed to packages/cli: the directory name already contained CLI-specific code. Renaming aligns the directory with the package name and removes the confusing "api" label.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None - this plan only reorganizes package manifests and directory structure. No UI or data-wiring code was added.

## Next Phase Readiness

- Package structure is ready for Plan 02, which updates all source file imports from @cauldron/* to @get-cauldron/*
- The repo will NOT typecheck or build after this plan because source files still import from @cauldron/*. That is expected and by design per the plan spec.
- pnpm install succeeds confirming workspace resolution works with new names

## Self-Check: PASSED

- FOUND: packages/shared/src/trpc-types.ts
- FOUND: packages/shared/package.json
- FOUND: packages/engine/package.json
- FOUND: packages/web/package.json
- FOUND: packages/cli/package.json
- FOUND: packages/cli/
- CONFIRMED: packages/api/ removed
- CONFIRMED: packages/trpc-types/ removed
- FOUND: commit 1b88532

---
*Phase: 13-re-scope-to-get-cauldron-already-have-the-github-and-npm-orgs*
*Completed: 2026-03-27*
