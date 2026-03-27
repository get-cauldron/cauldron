---
phase: 08-web-dashboard
plan: "00"
subsystem: testing
tags: [vitest, playwright, testing-library, jsdom, react]

# Dependency graph
requires: []
provides:
  - Vitest 4.x config with jsdom environment and React plugin for packages/web
  - Playwright E2E config targeting localhost:3000 with chromium
  - Test setup file with @testing-library/jest-dom matchers
  - Smoke test proving vitest runs
  - test, test:watch, test:e2e scripts in packages/web package.json
affects:
  - 08-web-dashboard
  - all subsequent plans in phase 08

# Tech tracking
tech-stack:
  added:
    - vitest@4.1.1
    - "@vitejs/plugin-react@6.0.1"
    - "@testing-library/react@16.3.2"
    - "@testing-library/jest-dom@6.9.1"
    - jsdom@29.0.1
    - "@playwright/test@1.58.2"
  patterns:
    - "Vitest with jsdom environment for React component testing"
    - "@/ alias mapping to packages/web/src"
    - "setupFiles pattern for global test matchers"

key-files:
  created:
    - packages/web/vitest.config.ts
    - packages/web/playwright.config.ts
    - packages/web/src/__tests__/setup.ts
    - packages/web/src/__tests__/smoke.test.ts
  modified:
    - packages/web/package.json

key-decisions:
  - "Playwright webServer config uses pnpm dev + reuseExistingServer for local development"
  - "Vitest globals:true enables describe/it/expect without imports in test files"

patterns-established:
  - "Test files live in src/**/*.test.{ts,tsx}"
  - "E2E tests go in packages/web/e2e/ (separate from unit tests)"

requirements-completed:
  - WEB-09

# Metrics
duration: 3min
completed: "2026-03-27"
---

# Phase 08 Plan 00: Web Test Infrastructure Summary

**Vitest 4 + Playwright config for packages/web with jsdom environment, React plugin, @testing-library matchers, and a passing smoke test**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-27T02:17:07Z
- **Completed:** 2026-03-27T02:19:46Z
- **Tasks:** 1
- **Files modified:** 5

## Accomplishments

- Installed and configured Vitest 4 with jsdom environment, @vitejs/plugin-react, and @testing-library/jest-dom for packages/web
- Created Playwright config targeting localhost:3000 with chromium browser and webServer auto-start
- Added smoke test proving vitest runs (1 test, 1 passing)
- Added test, test:watch, and test:e2e scripts to package.json

## Task Commits

Each task was committed atomically:

1. **Task 1: Vitest config, Playwright config, test setup, and smoke test** - `149d138` (chore)

**Plan metadata:** (this commit)

## Files Created/Modified

- `packages/web/vitest.config.ts` - Vitest config with jsdom env, React plugin, @/src alias
- `packages/web/playwright.config.ts` - Playwright E2E config for localhost:3000
- `packages/web/src/__tests__/setup.ts` - Global test setup importing jest-dom matchers
- `packages/web/src/__tests__/smoke.test.ts` - Smoke test: 1+1=2
- `packages/web/package.json` - Added test/test:watch/test:e2e scripts

## Decisions Made

- Vitest `globals: true` set so test files don't need explicit imports for describe/it/expect
- Playwright `reuseExistingServer: !process.env.CI` allows local dev without killing existing server

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Parallel execution agents were concurrently modifying packages/web/package.json; used node script to atomically add test scripts to avoid file-write races.
- Typecheck passes for packages/web's own source (index.ts, setup.ts, smoke.test.ts, vitest.config.ts). A separate parallel agent created src/app/layout.tsx referencing @/trpc/client which is not yet resolved — that is out-of-scope for this plan (introduced by another plan's work).

## Known Stubs

None — this plan only establishes test infrastructure.

## Next Phase Readiness

- Test infrastructure ready; pnpm --filter @cauldron/web test runs with 1 passing smoke test
- All subsequent plans in phase 08 can use `vitest run` for automated verification
- Playwright is configured but requires e2e/ directory with test files (future plans)

---
*Phase: 08-web-dashboard*
*Completed: 2026-03-27*
