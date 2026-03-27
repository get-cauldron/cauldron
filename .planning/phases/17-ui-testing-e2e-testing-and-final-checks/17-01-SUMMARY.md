---
phase: 17-ui-testing-e2e-testing-and-final-checks
plan: "01"
subsystem: web-testing-infrastructure
tags:
  - build-fix
  - e2e-testing
  - playwright
  - accessibility
  - component-testing
dependency_graph:
  requires:
    - packages/shared/src/db/schema
    - packages/web (all existing source)
  provides:
    - Green build (pnpm build exits 0)
    - E2E test infrastructure (docker-compose postgres-e2e, playwright config)
    - E2E factory helpers (db.ts, accessibility.ts, routes.ts)
    - Component test helpers (sse-mock.ts, trpc-wrapper.tsx)
  affects:
    - Phase 17-02, 17-03, 17-04, 17-05 (downstream tests)
tech_stack:
  added:
    - "@axe-core/playwright ^4.11.1 (devDep in web package)"
    - "postgres ^3.4.8 (devDep in web package, for E2E DB helpers)"
  patterns:
    - "Lazy DB proxy initialization in shared/client.ts — no throw at module import time"
    - "Webpack extensionAlias (.js → .ts) for Node16 moduleResolution in Next.js build"
    - "export const dynamic = 'force-dynamic' to prevent SSG of data-fetching pages"
    - "postgres-e2e docker service on port 5434 isolated from dev/test databases"
    - "AxeBuilder (not injectAxe/checkA11y) for axe-core/playwright integration"
key_files:
  created:
    - packages/web/e2e/helpers/db.ts
    - packages/web/e2e/helpers/accessibility.ts
    - packages/web/e2e/helpers/routes.ts
    - packages/web/src/__tests__/helpers/sse-mock.ts
    - packages/web/src/__tests__/helpers/trpc-wrapper.tsx
  modified:
    - packages/shared/src/db/client.ts
    - packages/web/next.config.ts
    - packages/web/package.json
    - packages/web/playwright.config.ts
    - packages/web/src/app/api/events/[projectId]/route.ts
    - packages/web/src/app/api/webhook/git/route.ts
    - packages/web/src/app/projects/page.tsx
    - packages/web/src/app/projects/[id]/layout.tsx
    - docker-compose.yml
decisions:
  - "Lazy Proxy for db in shared/client.ts: Next.js build evaluates route modules for static analysis; top-level DATABASE_URL throw breaks next build. Proxy defers db creation to first property access, keeping the error at runtime where DATABASE_URL is available."
  - "Webpack flag (--webpack) for next build/dev: Next.js 16 defaults to Turbopack which lacks extensionAlias support. Node16 moduleResolution requires .js extensions in imports; webpack extensionAlias maps .js → .ts for source resolution."
  - "export const dynamic = 'force-dynamic' on projects pages: tRPC prefetchQuery calls during SSG fail because there is no base URL and no DATABASE_URL at build time. Force-dynamic defers rendering to request time."
  - "AxeBuilder API (not injectAxe/checkA11y): @axe-core/playwright exports AxeBuilder class, not the injectAxe/checkA11y functions from the older axe-playwright package."
  - "postgres as devDependency in web: E2E DB helpers need direct postgres driver access for createE2EDb() and truncateE2EDb(); added as devDep to avoid polluting production bundle."
metrics:
  duration: "~40 minutes"
  completed_date: "2026-03-27"
  tasks: 2
  files: 14
---

# Phase 17 Plan 01: Build Fix + E2E and Component Test Infrastructure Summary

**One-liner:** Fixed Next.js 16 production build (lazy db proxy + webpack extensionAlias), installed axe-core, and created full E2E and component test infrastructure.

## What Was Built

### Task 1: Regression Gate + Build Fix + Install Dependencies

The build had two root causes of failure:

**Root cause 1 — DATABASE_URL at import time:** `packages/shared/src/db/client.ts` threw `DATABASE_URL environment variable is required` at module level. Next.js's static analysis phase evaluates route modules, which triggered this error for every route that imported from `@get-cauldron/shared`. Fixed by replacing the top-level `postgres()` call with a `Proxy` that lazily initializes the connection on first property access.

**Root cause 2 — Turbopack + extensionAlias:** Next.js 16 defaults to Turbopack, which does not support webpack's `extensionAlias` option. The workspace packages use Node16 `moduleResolution` (explicit `.js` extensions in relative imports), which Turbopack cannot resolve without extensionAlias. Fixed by adding `--webpack` flag to `build` and `dev` scripts in `packages/web/package.json` and adding a `webpack` config with `extensionAlias` to `next.config.ts`.

**Root cause 3 — SSG tRPC calls:** The `/projects` page and `/projects/[id]` layout called `prefetchQuery` and `fetchQuery` at render time. During `next build`, Next.js pre-renders pages statically, which fails because there is no base URL or database available. Fixed by adding `export const dynamic = 'force-dynamic'` to both files.

Also fixed:
- SSE route (`/api/events/[projectId]/route.ts`) and webhook route (`/api/webhook/git/route.ts`) migrated from top-level `import { db }` to lazy `getDb()` / `getShared()` async functions.
- Installed `@axe-core/playwright` as devDependency.

**Final gate:** `pnpm build` (exit 0), `pnpm test` (all 371 engine + 34 web tests pass), `pnpm typecheck` (exit 0).

### Task 2: E2E and Component Test Infrastructure

Created all test helper files:

- **`packages/web/e2e/helpers/db.ts`**: `createE2EDb()` (postgres client on port 5434), `createTestProject()`, `createTestInterview()`, `createTestSeed()`, `createTestBead()`, `createTestEvent()`, `truncateE2EDb()`, `runMigrations()` — all factory functions backed by drizzle-orm with shared schema.

- **`packages/web/e2e/helpers/accessibility.ts`**: `assertNoA11yViolations(page)` using `AxeBuilder` from `@axe-core/playwright` — checks WCAG 2.0 A/AA for critical and serious violations.

- **`packages/web/e2e/helpers/routes.ts`**: `ROUTES` object with 7 page paths: `projects`, `newProject`, `interview(id)`, `execution(id)`, `evolution(id)`, `costs(id)`, `settings(id)`.

- **`packages/web/src/__tests__/helpers/sse-mock.ts`**: `createEventSourceMock()` and `installEventSourceMock()` — event-listener-based mock supporting `emit(type, data)` for testing SSE-driven components.

- **`packages/web/src/__tests__/helpers/trpc-wrapper.tsx`**: `createMockTRPC(overrides)` (mock client for `projects`, `interview`, `execution`, `evolution`, `costs`, `health` namespaces) and `TestProviders` (QueryClientProvider with retry:false).

- **`docker-compose.yml`**: Added `postgres-e2e` service on port `5434:5432` with `cauldron_e2e` database.

- **`packages/web/playwright.config.ts`**: Added `webServer.env.DATABASE_URL` pointing to E2E DB, `workers: 1` in CI.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Lazy shared package import insufficient for Next.js build**
- **Found during:** Task 1
- **Issue:** The plan specified making only the `events` and `db` imports lazy in the SSE route. But `@get-cauldron/shared` re-exports `client.ts` from its index — any import of anything from the shared package triggered the DATABASE_URL throw because the entire module (including `client.ts`) is evaluated when the package is first loaded.
- **Fix:** Made `client.ts` itself use a Proxy for lazy initialization so importing the package doesn't throw. Also made both routes (`events` and `webhook/git`) use lazy imports for safety.
- **Files modified:** `packages/shared/src/db/client.ts`, `packages/web/src/app/api/events/[projectId]/route.ts`, `packages/web/src/app/api/webhook/git/route.ts`
- **Commits:** df96339

**2. [Rule 1 - Bug] Turbopack extensionAlias not supported — build uses wrong bundler**
- **Found during:** Task 1
- **Issue:** After the DATABASE_URL fix, the build failed with 67 Turbopack module-not-found errors because `.js` imports couldn't resolve to `.ts` files. Turbopack (Next.js 16 default) lacks webpack's `extensionAlias` feature. The main cauldron project already had `--webpack` in its build scripts; the worktree didn't.
- **Fix:** Added `--webpack` flag to build/dev scripts; added webpack `extensionAlias` config to `next.config.ts`.
- **Files modified:** `packages/web/package.json`, `packages/web/next.config.ts`
- **Commit:** df96339

**3. [Rule 1 - Bug] Static site generation fails for data-fetching pages**
- **Found during:** Task 1
- **Issue:** `/projects` page and `/projects/[id]` layout both call tRPC during render, which Next.js attempted to execute at build time during SSG. No database is available at build time.
- **Fix:** Added `export const dynamic = 'force-dynamic'` to both files.
- **Files modified:** `packages/web/src/app/projects/page.tsx`, `packages/web/src/app/projects/[id]/layout.tsx`
- **Commit:** df96339

**4. [Rule 2 - Missing Functionality] @axe-core/playwright uses AxeBuilder, not injectAxe/checkA11y**
- **Found during:** Task 2
- **Issue:** The plan's accessibility.ts code used `import { injectAxe, checkA11y } from '@axe-core/playwright'` — but that's from the deprecated `axe-playwright` package. `@axe-core/playwright` exports `AxeBuilder` class only.
- **Fix:** Rewrote `accessibility.ts` to use `AxeBuilder` from `@axe-core/playwright` with `.withTags(['wcag2a', 'wcag2aa']).analyze()`.
- **Files modified:** `packages/web/e2e/helpers/accessibility.ts`
- **Commit:** 69f9185

**5. [Rule 3 - Blocking] postgres module missing from web package**
- **Found during:** Task 2
- **Issue:** `e2e/helpers/db.ts` imports `postgres` directly (needed for `truncateE2EDb` raw SQL). The `postgres` package is a dependency of `@get-cauldron/shared` but not of `@get-cauldron/web`.
- **Fix:** Added `postgres` as devDependency to web package.
- **Files modified:** `packages/web/package.json`, `pnpm-lock.yaml`
- **Commit:** 69f9185

## Known Stubs

None — all infrastructure files are functional with real implementations. The test factory functions create real database rows; the mock helpers are proper vi.fn() implementations.

## Self-Check

Verified:
- `packages/web/e2e/helpers/db.ts` — exists, exports `createE2EDb`, `createTestProject`, `createTestInterview`, `truncateE2EDb`
- `packages/web/e2e/helpers/accessibility.ts` — exists, exports `assertNoA11yViolations`
- `packages/web/e2e/helpers/routes.ts` — exists, exports `ROUTES` with 7 paths
- `packages/web/src/__tests__/helpers/sse-mock.ts` — exists, exports `createEventSourceMock`, `installEventSourceMock`
- `packages/web/src/__tests__/helpers/trpc-wrapper.tsx` — exists, exports `createMockTRPC`, `TestProviders`
- `docker-compose.yml` — contains `postgres-e2e` with `5434:5432`
- `packages/web/playwright.config.ts` — contains `E2E_DATABASE_URL`
- `pnpm build` exits 0 (4/4 tasks successful)
- `pnpm test` exits 0 (6/6 tasks, 34 web + 371 engine tests pass)
- `pnpm typecheck` exits 0 (6/6 tasks)

## Self-Check: PASSED
