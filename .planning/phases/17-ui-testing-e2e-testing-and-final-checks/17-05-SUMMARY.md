---
phase: 17-ui-testing-e2e-testing-and-final-checks
plan: "05"
subsystem: infra
tags: [ci, github-actions, playwright, typescript, audit, security, lighthouse]

requires:
  - phase: 17-02
    provides: web component and page unit tests
  - phase: 17-03
    provides: E2E test specs and helpers
  - phase: 17-04
    provides: tRPC router and engine unit tests

provides:
  - GitHub Actions CI pipeline (.github/workflows/ci.yml) with lint, typecheck, build, unit tests, integration tests, e2e tests, and lighthouse jobs
  - Playwright globalSetup migration runner (packages/web/e2e/global-setup.ts)
  - TypeScript any audit with justification comments on all any usages
  - Security audit gate (pnpm audit --audit-level high)
  - License compliance check (license-checker)
  - Lighthouse informational reporting

affects: [future phases, CI consumers, developers opening PRs]

tech-stack:
  added: []
  patterns:
    - "GitHub Actions jobs: lint-typecheck-build runs first, then unit/integration/e2e/lighthouse run in parallel"
    - "E2E CI: postgres-e2e on :5434 + redis service containers for isolated test DB"
    - "Integration CI: postgres-test on :5433 service container with TEST_DATABASE_URL env"
    - "Playwright artifacts: uploaded only on failure (if: !cancelled() && failure()) per D-24"
    - "Lighthouse: always uploaded as artifact, no score thresholds per D-20/D-23"
    - "any audit: every any has eslint-disable-next-line comment with reason on preceding line"

key-files:
  created:
    - .github/workflows/ci.yml
    - packages/web/e2e/global-setup.ts
  modified:
    - packages/web/playwright.config.ts
    - packages/web/tsconfig.json
    - packages/engine/src/gateway/gateway.ts
    - packages/engine/src/holdout/events.ts
    - packages/engine/src/decomposition/events.ts
    - packages/engine/src/evolution/events.ts
    - packages/web/src/trpc/engine-deps.ts
    - packages/web/src/__tests__/components/dag/BeadNode.test.tsx
    - packages/web/src/__tests__/components/dag/MoleculeGroup.test.tsx
    - packages/web/src/__tests__/pages/costs-page.test.tsx

key-decisions:
  - "CI jobs are parallelized: lint-typecheck-build blocks all downstream jobs; unit/integration/e2e/lighthouse run concurrently after it passes"
  - "pnpm/action-setup@v4 and actions/setup-node@v4 used (not v2/v3) — current action versions"
  - "License checker allows MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC;0BSD;CC0-1.0;CC-BY-3.0;CC-BY-4.0;Unlicense;Python-2.0;BlueOak-1.0.0 — blocks GPL/AGPL/SSPL"
  - "packages/web/tsconfig.json excludes e2e/ to prevent Next.js build picking up Playwright test helpers with devDependencies"
  - "E2E globalSetup reuses runMigrations from existing helpers/db.ts pattern rather than duplicating migration logic"

patterns-established:
  - "CI artifact upload: failure-only for test traces/reports; always for lighthouse"
  - "any justification: eslint-disable-next-line @typescript-eslint/no-explicit-any -- {reason} on the line before every any usage in non-test files"

requirements-completed: [D-18, D-19, D-20, D-21, D-22, D-23, D-24, D-25]

duration: 25min
completed: 2026-03-27
---

# Phase 17 Plan 05: CI Pipeline, any Audit, and Final Quality Checks Summary

**GitHub Actions CI pipeline with 5 parallel jobs (lint+build, unit, integration, E2E with postgres/redis, Lighthouse), plus TypeScript any audit adding justification comments to all SDK boundary escape hatches**

## Performance

- **Duration:** 25 min
- **Started:** 2026-03-27T18:05:00Z
- **Completed:** 2026-03-27T18:30:00Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments

- Created `.github/workflows/ci.yml` (212 lines) with lint-typecheck-build, audit, unit-tests, integration-tests (postgres-test on :5433), e2e-tests (postgres-e2e on :5434 + redis), and lighthouse jobs
- Created `packages/web/e2e/global-setup.ts` to run DB migrations before E2E test suites; wired via `globalSetup` in playwright.config.ts
- Completed TypeScript any audit: all non-test `any` usages in source files have `eslint-disable-next-line` comments with explanatory reason text
- Security audit passes (`pnpm audit --audit-level high` exits 0 — only moderate vulns present)
- Full regression gate passes: `pnpm build && pnpm typecheck && pnpm test && pnpm lint` all green

## Task Commits

Each task was committed atomically:

1. **Task 1: GitHub Actions CI pipeline and Playwright global setup** - `c1e0a86` (feat)
2. **Task 2: TypeScript strict audit and dependency audit** - `452c494` (chore)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified

- `.github/workflows/ci.yml` - Full CI pipeline with 5 jobs, service containers, artifact upload
- `packages/web/e2e/global-setup.ts` - Playwright global setup: runs DB migrations before E2E suites
- `packages/web/playwright.config.ts` - Added globalSetup reference
- `packages/web/tsconfig.json` - Added e2e/ to exclude list (prevents Next.js build from picking up test helpers)
- `packages/engine/src/gateway/gateway.ts` - Added explanatory text to eslint-disable comments for Promise<any> methods and tools/toolChoice casts
- `packages/engine/src/holdout/events.ts` - Added explanatory text to InngestFunction<any> and ctx as any comments
- `packages/engine/src/decomposition/events.ts` - Added explanatory text to InngestFunction<any>, ctx as any, and step.sendEvent data: any comments
- `packages/engine/src/evolution/events.ts` - Added explanatory text to InngestFunction<any> and ctx as any comments
- `packages/web/src/trpc/engine-deps.ts` - Added explanatory text to logger: any comments
- `packages/web/src/__tests__/components/dag/BeadNode.test.tsx` - Removed extra React Flow props not in component interface
- `packages/web/src/__tests__/components/dag/MoleculeGroup.test.tsx` - Removed extra React Flow props not in component interface
- `packages/web/src/__tests__/pages/costs-page.test.tsx` - Removed broken setupMocks with closure bugs (unused)

## Decisions Made

- CI jobs run in parallel (unit/integration/e2e/lighthouse all trigger off lint-typecheck-build) for faster feedback loops
- Playwright artifacts uploaded only on failure per D-24; Lighthouse always uploaded per D-23
- `pnpm/action-setup@v4` used (not deprecated v2) for pnpm installation
- License compliance allows common permissive licenses; blocks GPL/AGPL/SSPL
- `e2e/` excluded from web tsconfig to prevent Next.js build from resolving devDependencies in test helpers

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Next.js build failure caused by e2e/ directory in tsconfig**
- **Found during:** Task 2 (regression gate)
- **Issue:** `packages/web/tsconfig.json` included `"**/*.ts"` which caused Next.js build to compile `e2e/helpers/db.ts`, which imports `postgres` — a devDependency not available in production builds
- **Fix:** Added `"e2e"` to the `exclude` array in `packages/web/tsconfig.json`
- **Files modified:** `packages/web/tsconfig.json`
- **Verification:** `pnpm build` exits 0 after change
- **Committed in:** `452c494` (Task 2 commit)

**2. [Rule 1 - Bug] Fixed typecheck errors in test files from other plans**
- **Found during:** Task 2 (regression gate)
- **Issue:** `BeadNode.test.tsx` and `MoleculeGroup.test.tsx` passed extra React Flow node props (`id`, `type`, `selected`, etc.) that don't exist in the component interfaces. `costs-page.test.tsx` had unused `setupMocks` with closure bugs (`loading` undefined, `opts.empty` not typed).
- **Fix:** Removed extra props from BeadNode/MoleculeGroup render calls; removed unused buggy `setupMocks` function from costs-page test
- **Files modified:** `packages/web/src/__tests__/components/dag/BeadNode.test.tsx`, `packages/web/src/__tests__/components/dag/MoleculeGroup.test.tsx`, `packages/web/src/__tests__/pages/costs-page.test.tsx`
- **Verification:** `pnpm typecheck` exits 0 after changes
- **Committed in:** `452c494` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 1 build bug, 1 Rule 1 pre-existing test type errors)
**Impact on plan:** Both fixes required for regression gate to pass. No scope creep.

## Issues Encountered

- Pre-existing `pnpm build` failure discovered due to `e2e/` not excluded from tsconfig — fixed by adding exclusion
- Pre-existing typecheck failures in test files from other parallel agents' work — fixed by removing unused/broken code

## Known Stubs

None — this plan delivers infrastructure (CI config, audit comments) with no UI stubs.

## Next Phase Readiness

- CI pipeline ready: PRs will trigger full test suite with isolated service containers
- `pnpm audit --audit-level high` will block on critical/high vulnerabilities
- License compliance check will block GPL/AGPL/SSPL dependencies
- Lighthouse reports available as CI artifacts for performance visibility
- TypeScript any audit complete: zero unexplained any usages in production code

---
*Phase: 17-ui-testing-e2e-testing-and-final-checks*
*Completed: 2026-03-27*
