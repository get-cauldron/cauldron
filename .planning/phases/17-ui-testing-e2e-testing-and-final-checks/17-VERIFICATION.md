---
phase: 17-ui-testing-e2e-testing-and-final-checks
verified: 2026-03-27T18:45:00Z
status: gaps_found
score: 24/25 requirements verified
re_verification: false
gaps:
  - truth: "D-09 — LLM mock responses stored as centralized fixture files (e.g., e2e/fixtures/interview-responses.json)"
    status: partial
    reason: "D-09 was claimed by plan 17-01 and specifies fixture data in a separate JSON file. The interview spec instead implements inline helper functions (buildSeedTranscript(), buildAmbiguityScore()) that produce the same data inline. The e2e/fixtures/ directory and interview-responses.json file do not exist. The data is functionally equivalent but violates the architectural decision to centralize LLM mock data for reuse across E2E suites."
    artifacts:
      - path: "packages/web/e2e/fixtures/interview-responses.json"
        issue: "MISSING — file not created despite being specified in CONTEXT.md and 17-01 requirements"
    missing:
      - "Create packages/web/e2e/fixtures/ directory"
      - "Create packages/web/e2e/fixtures/interview-responses.json with the transcript fixture data currently inlined in interview.spec.ts"
      - "Optionally update interview.spec.ts to import from the fixture file"
human_verification:
  - test: "E2E test suite runs against a live stack"
    expected: "All 6 E2E spec files (project-management, settings, interview, execution, evolution, costs) run to completion with no failures. Visual snapshot baselines are generated on first run (--update-snapshots). Accessibility checks pass on all pages."
    why_human: "E2E tests require a running Next.js server, Postgres on :5434, Redis, and optionally Inngest. Cannot run without infrastructure. Visual snapshot baselines do not yet exist (zero .png files in the repo) — first run will always fail on toHaveScreenshot assertions until baselines are captured."
  - test: "CI pipeline runs on a PR"
    expected: "All 6 jobs (lint-typecheck-build, audit, unit-tests, integration-tests, e2e-tests, lighthouse) complete. pnpm audit exits 0. License compliance check passes. Lighthouse report is uploaded as artifact."
    why_human: "Cannot trigger GitHub Actions from this environment. The workflow YAML is syntactically correct but CI execution requires an actual PR against the GitHub repo."
---

# Phase 17: UI Testing, E2E Testing, and Final Checks — Verification Report

**Phase Goal:** Comprehensive test coverage and pre-release quality validation for Cauldron v1 — E2E tests for all web dashboard surfaces, component test expansion, GitHub Actions CI pipeline, and final quality audits (TypeScript strictness, dependency vulnerabilities, license compliance, Lighthouse reports).
**Verified:** 2026-03-27T18:45:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | pnpm build completes with exit code 0 | VERIFIED | Turborepo cache hit — 4/4 tasks successful, all pages compile as dynamic routes |
| 2 | pnpm test passes (all existing unit tests) | VERIFIED | 27 test files, 155 tests, 0 failures — confirmed by live run |
| 3 | pnpm typecheck passes | VERIFIED | 6/6 tasks cached as passing |
| 4 | Docker Compose starts postgres-e2e on port 5434 | VERIFIED | `postgres-e2e` service with `5434:5432` present in docker-compose.yml |
| 5 | @axe-core/playwright is installed in web devDependencies | VERIFIED | `"@axe-core/playwright": "^4.11.1"` in packages/web/package.json |
| 6 | E2E test factory functions exist and insert/truncate data | VERIFIED | db.ts exports createE2EDb, createTestProject, createTestInterview, createTestSeed, createTestBead, createTestEvent, truncateE2EDb (200 lines) |
| 7 | Every page and key component has a React component test | VERIFIED | 16 component test files + 5 page test files under __tests__/ |
| 8 | Component tests verify user interactions (click, type, submit) | VERIFIED | MCChipGroup uses fireEvent.click; interview-page tests sendAnswer mutation; settings-page tests archive button with act() |
| 9 | SSE streaming is tested via mocked EventSource | VERIFIED | DAGCanvas.test.tsx and execution-page.test.tsx both import installEventSourceMock; DAGCanvas.test.tsx installs mock in 3 test cases |
| 10 | All component tests pass via pnpm -F @get-cauldron/web test | VERIFIED | 155/155 tests pass |
| 11 | E2E tests cover all 6 dashboard surfaces | VERIFIED | 6 spec files: project-management.spec.ts (5 tests), settings.spec.ts (3 tests), interview.spec.ts (6 tests), execution.spec.ts (5 tests), evolution.spec.ts (4 tests), costs.spec.ts (4 tests) |
| 12 | axe-core accessibility checks run on every E2E page | VERIFIED | All 6 spec files call assertNoA11yViolations using AxeBuilder from @axe-core/playwright |
| 13 | Visual snapshots captured for key pages | PARTIAL | toHaveScreenshot() calls present in all 6 specs; however zero baseline .png files exist in the repo — first run will fail until baselines are captured with --update-snapshots |
| 14 | E2E tests use pre-seeded DB data, not live LLM calls | VERIFIED | interview.spec.ts uses seedTranscriptData() with DB updates; no page.route() for AI provider URLs |
| 15 | E2E tests use per-suite DB setup/teardown (D-06) | VERIFIED | All 6 specs call truncateE2EDb in test.afterEach |
| 16 | D-09: LLM mock responses stored as centralized fixture files | FAILED | e2e/fixtures/ directory does not exist; interview-responses.json not created; data is inlined as helper functions in interview.spec.ts |
| 17 | SSE delivers real-time events to UI (D-15) | VERIFIED | execution.spec.ts test 4 inserts bead_dispatched event via createTestEvent then waits with toBeVisible({timeout:8000}); interview.spec.ts test 6 inserts interview_started event |
| 18 | GitHub Actions CI pipeline exists with all required jobs | VERIFIED | ci.yml (212 lines) with lint-typecheck-build, audit, unit-tests, integration-tests, e2e-tests, lighthouse jobs |
| 19 | CI has postgres service containers for :5433 (integration) and :5434 (E2E) | VERIFIED | integration-tests job maps 5433:5432; e2e-tests job maps 5434:5432 with redis |
| 20 | pnpm audit runs in CI, fails on critical/high | VERIFIED | `pnpm audit --audit-level high` in audit job |
| 21 | Playwright traces/screenshots uploaded only on failure (D-24) | VERIFIED | `if: ${{ !cancelled() && failure() }}` on both Upload Playwright report and Upload Playwright traces steps |
| 22 | E2E tests run with single worker in CI (D-25) | VERIFIED | `workers: process.env.CI ? 1 : undefined` in playwright.config.ts |
| 23 | TypeScript any audit: all any usages have justification comments (D-18) | VERIFIED | All `as any` and `: any` in engine/holdout/events.ts, engine/decomposition/events.ts, engine/evolution/events.ts, gateway/gateway.ts, web/trpc/engine-deps.ts have eslint-disable-next-line comments with explanatory text |
| 24 | Dependency license compliance check flags GPL/AGPL/SSPL (D-19) | VERIFIED | license-checker step in CI audit job with onlyAllow list blocking GPL/AGPL/SSPL |
| 25 | Lighthouse report generated as informational artifact (D-20, D-23) | VERIFIED | Lighthouse job uses @lhci/cli; artifact uploaded with `if: always()` — no score thresholds |

**Score:** 24/25 truths verified (D-09 fixture files missing)

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `docker-compose.yml` | postgres-e2e service on port 5434 | VERIFIED | Service present with `5434:5432`, cauldron_e2e DB, healthcheck |
| `packages/web/e2e/helpers/db.ts` | createE2EDb, createTestProject, createTestInterview, truncateE2EDb | VERIFIED | All 8 exports present: createE2EDb, E2EDb type, runMigrations, truncateE2EDb, createTestProject, createTestInterview, createTestSeed, createTestBead, createTestEvent |
| `packages/web/e2e/helpers/accessibility.ts` | assertNoA11yViolations | VERIFIED | Uses AxeBuilder (not deprecated injectAxe/checkA11y) |
| `packages/web/e2e/helpers/routes.ts` | ROUTES with 7 paths | VERIFIED | All 7 paths: projects, newProject, interview, execution, evolution, costs, settings |
| `packages/web/e2e/global-setup.ts` | Run migrations before E2E | VERIFIED | Calls runMigrations(createE2EDb()) |
| `packages/web/playwright.config.ts` | E2E_DATABASE_URL, globalSetup, workers:1 in CI | VERIFIED | All three present |
| `packages/web/src/__tests__/helpers/sse-mock.ts` | createEventSourceMock, installEventSourceMock | VERIFIED | Both exports present |
| `packages/web/src/__tests__/helpers/trpc-wrapper.tsx` | createMockTRPC, TestProviders | VERIFIED | Both exports present |
| `packages/web/e2e/project-management.spec.ts` | Project CRUD E2E flow (>=4 tests) | VERIFIED | 5 tests with a11y + snapshots + truncateE2EDb |
| `packages/web/e2e/settings.spec.ts` | Settings page E2E (>=3 tests) | VERIFIED | 3 tests with a11y + snapshots + truncateE2EDb |
| `packages/web/e2e/interview.spec.ts` | Interview E2E with pre-seeded data (>=5 tests) | VERIFIED | 6 tests with a11y + snapshots + SSE test at timeout:8000 |
| `packages/web/e2e/execution.spec.ts` | DAG execution E2E (>=4 tests) | VERIFIED | 5 tests with DAG rendering + bead interaction + SSE test |
| `packages/web/e2e/evolution.spec.ts` | Evolution page E2E (>=3 tests) | VERIFIED | 4 tests with lineage + convergence |
| `packages/web/e2e/costs.spec.ts` | Costs page E2E (>=3 tests) | VERIFIED | 4 tests with usage + breakdown + empty state |
| 16 component test files under `__tests__/components/` | All interview/dag/evolution/bead/shell | VERIFIED | All 16 files present in correct subdirectories |
| 5 page test files under `__tests__/pages/` | interview/execution/evolution/costs/settings | VERIFIED | All 5 files present, 98-172 lines each |
| `.github/workflows/ci.yml` | Full CI pipeline (>=80 lines) | VERIFIED | 212 lines with all 6 jobs |
| `packages/web/e2e/fixtures/interview-responses.json` | Centralized LLM fixture data (D-09) | MISSING | Directory e2e/fixtures/ does not exist |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `e2e/helpers/db.ts` | `@get-cauldron/shared` schema | drizzle insert with schema tables | VERIFIED | Imports from @get-cauldron/shared, uses drizzle-orm for all inserts |
| `playwright.config.ts` | docker-compose postgres-e2e | E2E_DATABASE_URL env var pointing to :5434 | VERIFIED | webServer.env.DATABASE_URL uses E2E_DATABASE_URL defaulting to localhost:5434 |
| `e2e/interview.spec.ts` | `e2e/helpers/db.ts` | createTestInterview with transcript seeding | VERIFIED | Imports createTestInterview + seedTranscriptData helper |
| `e2e/project-management.spec.ts` | `e2e/helpers/db.ts` | createTestProject, truncateE2EDb | VERIFIED | Both imported and used |
| `__tests__/pages/interview-page.test.tsx` | interview page component | vi.mock('@/trpc/client') | VERIFIED | `vi.mock('@/trpc/client', () => ({ useTRPC: vi.fn() }))` |
| `__tests__/components/dag/DAGCanvas.test.tsx` | `__tests__/helpers/sse-mock.ts` | installEventSourceMock | VERIFIED | Import and use in 3 test cases |
| `.github/workflows/ci.yml` | playwright.config.ts | E2E_DATABASE_URL env var | VERIFIED | `E2E_DATABASE_URL: postgres://cauldron:cauldron@localhost:5434/cauldron_e2e` in e2e-tests job |
| `.github/workflows/ci.yml` | docker service postgres-e2e | GitHub Actions service container | VERIFIED | `postgres-e2e` service on port 5434 in e2e-tests job |
| `playwright.config.ts` | `e2e/global-setup.ts` | globalSetup config property | VERIFIED | `globalSetup: './e2e/global-setup.ts'` at line 5 |

---

## Data-Flow Trace (Level 4)

Component tests use mocked tRPC and do not rely on real DB data. E2E specs use real DB data via factory helpers routed through the actual Next.js server. No hollow wiring detected.

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `e2e/interview.spec.ts` | transcript, currentAmbiguityScore | Direct DB insert via createTestInterview + seedTranscriptData | Yes — drizzle insert into interviews table | FLOWING |
| `e2e/execution.spec.ts` | beads, bead_edges | createTestBead + direct db.insert(schema.beadEdges) | Yes — drizzle insert | FLOWING |
| `e2e/evolution.spec.ts` | seeds with parentId | createTestSeed + direct db.insert(schema.seeds) with parentId | Yes — drizzle insert | FLOWING |
| `e2e/costs.spec.ts` | llm_usage rows | Direct db.insert(schema.llmUsage) | Yes — drizzle insert | FLOWING |
| `__tests__/pages/interview-page.test.tsx` | transcript data | vi.fn().mockReturnValue with fixture transcript array | Yes — mock returns non-empty data | FLOWING |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Web component tests pass | `pnpm -F @get-cauldron/web test` | 27 files, 155 tests, 0 failures, 2.25s | PASS |
| TypeScript compiles cleanly | `pnpm typecheck` | 6/6 tasks pass (cached) | PASS |
| Production build succeeds | `pnpm build` | 4/4 tasks pass (cached), all pages as dynamic routes | PASS |
| E2E spec files have required patterns | grep checks on all 6 specs | All 6 have assertNoA11yViolations + toHaveScreenshot + truncateE2EDb | PASS |
| CI workflow has all required jobs | grep on ci.yml | lint-typecheck-build, audit, unit-tests, integration-tests, e2e-tests, lighthouse — all present | PASS |
| Visual snapshot baselines exist | `find packages/web -name "*.png"` | 0 files — no baselines captured yet | FAIL (human action needed) |

---

## Requirements Coverage

All 25 decisions from CONTEXT.md (D-01 through D-25) are cross-referenced against plan requirements fields:

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| D-01 | 17-03, 17-04 | Full surface E2E — all pages | SATISFIED | 6 spec files covering all dashboard pages |
| D-02 | 17-03, 17-04 | Visual snapshots | SATISFIED (baseline gap) | toHaveScreenshot() in all 6 specs; baselines need first-run capture |
| D-03 | 17-03, 17-04 | axe-core on every page | SATISFIED | assertNoA11yViolations in all 6 specs |
| D-04 | 17-03, 17-04 | Chromium only | SATISFIED | Only chromium project in playwright.config.ts |
| D-05 | 17-03 | LLM avoided via pre-seeded DB | SATISFIED | No page.route() for AI provider; seedTranscriptData() inserts DB data directly |
| D-06 | 17-01 | Seed script per suite, TRUNCATE between | SATISFIED | truncateE2EDb in test.afterEach in all 6 specs |
| D-07 | 17-01 | Separate E2E Postgres on :5434 | SATISFIED | postgres-e2e service in docker-compose.yml |
| D-08 | 17-01 | Shared test factories | SATISFIED | createTestProject, createTestInterview, createTestSeed, createTestBead, createTestEvent in db.ts |
| D-09 | 17-01 | LLM fixture files (e.g., interview-responses.json) | NOT SATISFIED | Fixture data inlined as helper functions in interview.spec.ts; fixtures/ directory not created |
| D-10 | 17-02 | All pages and key components tested | SATISFIED | 16 component tests + 5 page tests |
| D-11 | 17-02 | Full interaction testing | SATISFIED | fireEvent.click in MCChipGroup, MCChipGroup, SeedApprovalCard; sendAnswer mutation test in interview-page |
| D-12 | 17-02 | SSE tested via mocked EventSource | SATISFIED | installEventSourceMock used in DAGCanvas.test.tsx and execution-page.test.tsx |
| D-13 | 17-03, 17-04 | E2E organized by user flow | SATISFIED | Specs named by flow: project-management, interview, settings, execution, evolution, costs |
| D-14 | 17-02 | Component tests in __tests__/ | SATISFIED | All tests under src/__tests__/ |
| D-15 | 17-03, 17-04 | SSE real events via Postgres inserts | SATISFIED | execution.spec.ts test 4 + interview.spec.ts test 6 both insert events and await visibility |
| D-16 | 17-01 | Regression gate first | SATISFIED | Confirmed by passing build + typecheck + test |
| D-17 | 17-01 | Clean pnpm build | SATISFIED | Build exits 0, all pages as dynamic/static routes |
| D-18 | 17-05 | Zero unexplained any | SATISFIED | All any usages have eslint-disable-next-line with reason text |
| D-19 | 17-05 | Dependency audit + license compliance | SATISFIED | pnpm audit --audit-level high + license-checker in CI |
| D-20 | 17-05 | Lighthouse reports (informational) | SATISFIED | Lighthouse job in CI using @lhci/cli, no score thresholds |
| D-21 | 17-05 | GitHub Actions CI pipeline | SATISFIED | ci.yml with 6 jobs covering all required test types |
| D-22 | 17-05 | pnpm audit in CI, fail on high/critical | SATISFIED | `pnpm audit --audit-level high` in audit job |
| D-23 | 17-05 | Lighthouse uploaded as artifact | SATISFIED | Upload Lighthouse report with `if: always()` |
| D-24 | 17-05 | Playwright artifacts only on failure | SATISFIED | Both upload steps use `if: ${{ !cancelled() && failure() }}` |
| D-25 | 17-05 | E2E single worker in CI | SATISFIED | `workers: process.env.CI ? 1 : undefined` |

---

## Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `packages/web/e2e/interview.spec.ts` | Transcript fixture data inlined as functions instead of JSON file (D-09) | Warning | Violates D-09 centralization decision; functionally equivalent but makes fixture data harder to discover and reuse across future E2E suites |

No blocker anti-patterns found. No TODO/FIXME/placeholder comments found in new files.

---

## Human Verification Required

### 1. Visual Snapshot Baselines

**Test:** Run `pnpm -F @get-cauldron/web test:e2e -- --update-snapshots` against a live stack (Docker Compose up + Next.js dev server).
**Expected:** All 6 spec files complete, ~15 snapshot .png files generated in `packages/web/e2e/` (one per `toHaveScreenshot()` call). Subsequent runs without `--update-snapshots` should pass.
**Why human:** Requires running infrastructure (Postgres :5434, Redis, Next.js :3000). Zero baseline files exist in the repository — every `toHaveScreenshot` assertion will fail on first run until baselines are captured.

### 2. Full E2E Suite Against Live Stack

**Test:** Start docker compose + Next.js dev server, run `pnpm -F @get-cauldron/web test:e2e` (after baseline capture).
**Expected:** All 27 tests across 6 spec files pass. SSE tests (interview test 6, execution test 4) verify real-time event propagation within their 8-second timeout windows. Accessibility checks report no critical/serious WCAG violations.
**Why human:** Full-stack integration requires live Postgres, Redis, and Next.js — cannot run programmatically in this environment.

### 3. CI Pipeline End-to-End

**Test:** Open a PR against `main` in the cauldron GitHub repository.
**Expected:** All 6 CI jobs trigger. lint-typecheck-build passes first. unit-tests, integration-tests, e2e-tests, audit, and lighthouse run in parallel. pnpm audit exits 0. License checker passes. Lighthouse report uploaded as artifact.
**Why human:** GitHub Actions requires an actual PR push to trigger.

---

## Gaps Summary

One gap blocking full D-09 compliance:

**D-09 fixture files not created.** The CONTEXT.md decision specified "LLM mock responses stored as centralized fixture files (e.g., e2e/fixtures/interview-responses.json)". Plan 17-01 claimed D-09 in its requirements list. The delivered implementation stores transcript fixture data as inline helper functions (`buildSeedTranscript()`, `buildAmbiguityScore()`) within `interview.spec.ts`. The `packages/web/e2e/fixtures/` directory was not created and `interview-responses.json` does not exist. The data is functionally identical — the same transcript structure is available to tests — but the architectural decision for centralized, file-based fixture storage was not followed.

**Impact:** Low — tests work correctly. The gap is architectural rather than functional. A future E2E spec that needs the same interview fixture data must duplicate the inline helper functions rather than importing from a central location.

**Fix:** Create `packages/web/e2e/fixtures/interview-responses.json` containing the transcript array from `buildSeedTranscript()`. Optionally refactor `interview.spec.ts` to import from the fixture file.

One additional human-action item (not a gap):

**Visual snapshot baselines must be captured on first run.** The `toHaveScreenshot()` assertions in all 6 E2E specs will fail on first run until `--update-snapshots` is run against a live stack. This is expected Playwright behavior and not a code defect, but it must be done before CI can pass E2E checks.

---

_Verified: 2026-03-27T18:45:00Z_
_Verifier: Claude (gsd-verifier)_
