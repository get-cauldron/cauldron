# Phase 17: UI Testing, E2E Testing, and Final Checks - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-27
**Phase:** 17-ui-testing-e2e-testing-and-final-checks
**Areas discussed:** E2E test scope, Test data strategy, Final checks definition, CI pipeline, Component test gaps, Test organization, SSE/streaming test strategy

---

## E2E Test Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Critical paths only | Cover 3-4 core user journeys | |
| Full surface coverage | E2E tests for every page and major interaction | ✓ |
| Happy + error paths | Critical paths plus error states | |

**User's choice:** Full surface coverage
**Notes:** User wants comprehensive E2E coverage across all dashboard surfaces.

### Visual vs Functional

| Option | Description | Selected |
|--------|-------------|----------|
| Functional only | Assert DOM state, navigation, data rendering | |
| Functional + visual snapshots | Add Playwright screenshot comparisons | ✓ |
| Functional + accessibility | Functional plus axe-core checks | |

**User's choice:** Functional + visual snapshots
**Notes:** Follow-up: User also chose to add axe-core accessibility checks on top of visual snapshots.

### Browser Coverage

| Option | Description | Selected |
|--------|-------------|----------|
| Chromium only | Fastest suite, matches 70%+ of users | ✓ |
| Chromium + Firefox | Catches Gecko-specific rendering bugs | |
| All three | Maximum coverage, 3x CI time | |

**User's choice:** Chromium only

### LLM Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Mock LLM responses | Intercept AI SDK calls with fixed responses | ✓ |
| Record/replay fixtures | Record real LLM responses once, replay in tests | |
| Stub at tRPC layer | Mock tRPC responses so E2E never calls engine | |

**User's choice:** Mock LLM responses

---

## Test Data Strategy

### DB State Setup

| Option | Description | Selected |
|--------|-------------|----------|
| Seed script per suite | Each test file runs setup, clean between suites | ✓ |
| Shared fixture database | One pre-seeded DB snapshot loaded before all tests | |
| API-driven setup | Tests create state through actual UI/API | |
| Hybrid | API for happy path, seed for edge cases | |

**User's choice:** Seed script per suite

### DB Instance

| Option | Description | Selected |
|--------|-------------|----------|
| Same test instance :5433 | Reuse existing Docker Compose test DB | |
| Separate E2E instance :5434 | Dedicated Postgres for E2E | ✓ |

**User's choice:** Separate E2E instance :5434

### Cleanup Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Truncate all tables before each suite | Fast, clean slate per test file | ✓ |
| Transaction rollback per test | Each test in a rollback transaction | |
| Drop and recreate schema | Nuclear option, slowest | |

**User's choice:** Truncate all tables before each suite

### Test Factories

| Option | Description | Selected |
|--------|-------------|----------|
| Shared factories | Centralized factory functions | ✓ |
| Inline per test file | Each test creates its own data | |

**User's choice:** Shared factories

### LLM Fixture Location

| Option | Description | Selected |
|--------|-------------|----------|
| Centralized fixture files | e.g., e2e/fixtures/interview-responses.json | ✓ |
| Inline per test | Each test defines its own mock responses | |
| Claude's discretion | Let planner decide | |

**User's choice:** Centralized fixture files

---

## Final Checks Definition

### Checks Selected (multi-select)

| Option | Description | Selected |
|--------|-------------|----------|
| Build verification | Clean build passes with zero errors/warnings | ✓ |
| TypeScript strict audit | No ts-ignore, no any leaks, strict mode | ✓ |
| Dependency audit | Vulnerable deps, unused deps, version mismatches | ✓ |
| Manual smoke test checklist | Written checklist of manual verification steps | |

**User's choice:** Build verification, TypeScript strict audit, Dependency audit

### Lighthouse

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, with thresholds | Minimum score thresholds, fail if below | |
| Run but no thresholds | Generate reports for visibility | ✓ |
| Skip for v1 | Performance optimization deferred | |

**User's choice:** Run but no thresholds

### TypeScript Strictness

| Option | Description | Selected |
|--------|-------------|----------|
| Zero any in public APIs | No any in exports, internal SDK boundary any OK | |
| Full strict: zero any anywhere | Eliminate every any including internal workarounds | ✓ |
| Audit and document | Find all any, document intentional vs accidental | |

**User's choice:** Full strict: zero any anywhere

### Regression Gate

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, regression first | Run full suite + build + typecheck as first step | ✓ |
| Fix as encountered | Fix failures as they come up | |

**User's choice:** Regression first

### License Compliance

| Option | Description | Selected |
|--------|-------------|----------|
| Flag non-permissive licenses | Check all deps for GPL/AGPL/SSPL | ✓ |
| Skip license check | Trust mainstream npm packages | |

**User's choice:** Flag non-permissive licenses

---

## CI Pipeline

### CI Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Full CI | lint + typecheck + unit + integration + E2E on every PR | ✓ |
| Minimal CI | Just lint + typecheck + unit tests | |
| No CI yet | Tests stay local only | |

**User's choice:** Full CI

### CI Lighthouse

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, as informational artifact | Run in CI, upload report | ✓ |
| Skip in CI | Lighthouse stays local-only | |

**User's choice:** Yes, as informational artifact

### CI Artifacts

| Option | Description | Selected |
|--------|-------------|----------|
| Upload on failure | Traces + screenshots only when tests fail | ✓ |
| Always upload | All traces on every run | |
| No artifacts | Just pass/fail status | |

**User's choice:** Upload on failure

### CI E2E Parallelism

| Option | Description | Selected |
|--------|-------------|----------|
| Sequential | Single Playwright worker in CI | ✓ |
| Parallel with sharding | Playwright sharding across jobs | |

**User's choice:** Sequential

### CI Dependency Audit

| Option | Description | Selected |
|--------|-------------|----------|
| Fail on critical/high | pnpm audit --audit-level=high | ✓ |
| Informational only | Run but don't fail | |
| Skip in CI | Manual/local only | |

**User's choice:** Fail on critical/high

### CI Platform

| Option | Description | Selected |
|--------|-------------|----------|
| GitHub Actions | Standard choice | ✓ |
| Claude's discretion | Use whatever makes sense | |

**User's choice:** GitHub Actions

---

## Component Test Gaps

### Coverage Scope

| Option | Description | Selected |
|--------|-------------|----------|
| All pages and key components | Every page plus shared UI components | ✓ |
| Complex interactive only | Interview chat, DAG canvas, evolution panel | |
| Claude's discretion | Let planner assess | |

**User's choice:** All pages and key components

### Interaction Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Full interaction | Simulate clicks, form submissions, keyboard events | ✓ |
| Render + snapshot | Verify render + snapshot tests | |

**User's choice:** Full interaction

---

## Test Organization

### E2E File Organization

| Option | Description | Selected |
|--------|-------------|----------|
| By user flow | interview.spec.ts, project-management.spec.ts | ✓ |
| By page/route | Mirrors app router structure | |
| Claude's discretion | Let planner pick | |

**User's choice:** By user flow

### Component Test Location

| Option | Description | Selected |
|--------|-------------|----------|
| Keep __tests__/ dirs | Consistent with existing pattern | ✓ |
| Collocated | *.test.tsx next to component | |
| Claude's discretion | Match existing web/ pattern | |

**User's choice:** Keep __tests__/ dirs

---

## SSE/Streaming Test Strategy

### Component Test SSE

| Option | Description | Selected |
|--------|-------------|----------|
| Mock EventSource | Mock constructor in jsdom | ✓ |
| Mock at tRPC/fetch layer | Intercept fetch, return readable stream | |
| Skip SSE in component tests | Test SSE only in E2E | |

**User's choice:** Mock EventSource

### E2E SSE

| Option | Description | Selected |
|--------|-------------|----------|
| Trigger real events via DB | Insert events into Postgres, verify in UI | ✓ |
| Mock SSE endpoint | Intercept route, serve canned events | |
| Claude's discretion | Let planner choose | |

**User's choice:** Trigger real events via DB

---

## Claude's Discretion

None — all areas had explicit user decisions.

## Deferred Ideas

None — discussion stayed within phase scope.
