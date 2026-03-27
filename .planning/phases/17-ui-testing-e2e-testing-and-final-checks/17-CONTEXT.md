# Phase 17: UI Testing, E2E Testing, and Final Checks - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Comprehensive test coverage and pre-release quality validation for Cauldron v1. This phase adds Playwright E2E tests covering all web dashboard surfaces, expands React component test coverage, establishes a GitHub Actions CI pipeline, and performs final quality audits (TypeScript strictness, dependency vulnerabilities, license compliance, Lighthouse reports).

</domain>

<decisions>
## Implementation Decisions

### E2E Test Scope
- **D-01:** Full surface coverage — E2E tests for every page and major interaction (projects, interview, DAG, evolution, costs, settings)
- **D-02:** Functional assertions + Playwright visual snapshot comparisons for key pages
- **D-03:** axe-core accessibility checks run on every page during E2E
- **D-04:** Chromium only — no Firefox/WebKit for v1
- **D-05:** LLM-dependent flows (interview questions) mocked by intercepting AI SDK calls with fixed responses

### Test Data Strategy
- **D-06:** Seed script per test suite — each test file runs setup inserting known data via direct DB calls, with TRUNCATE CASCADE between suites
- **D-07:** Separate Docker Postgres instance for E2E on port :5434 (not shared with integration test DB :5433)
- **D-08:** Shared test factories (createTestProject(), createTestInterview(), etc.) for consistent data creation across E2E and component tests
- **D-09:** LLM mock responses stored as centralized fixture files (e.g., e2e/fixtures/interview-responses.json)

### Component Test Coverage
- **D-10:** All pages and key components get React component tests — not just complex interactive ones
- **D-11:** Full interaction testing via Testing Library (clicks, form submissions, keyboard events), not just render verification
- **D-12:** SSE streaming tested in component tests by mocking EventSource constructor in jsdom

### Test Organization
- **D-13:** E2E tests organized by user flow (e2e/interview.spec.ts, e2e/project-management.spec.ts), not by page
- **D-14:** Component tests follow existing __tests__/ directory pattern (not collocated)

### SSE/Streaming Strategy
- **D-15:** E2E SSE tests trigger real events via Postgres inserts, verify they appear in UI. Tests the full LISTEN/NOTIFY pipeline.

### Final Checks
- **D-16:** Regression gate first — run full existing test suite + build + typecheck before adding new tests. Fix any failures.
- **D-17:** Build verification — clean pnpm build with zero errors/warnings across all packages
- **D-18:** Full TypeScript strict audit — zero `any` anywhere, including internal SDK boundary workarounds
- **D-19:** Dependency audit — pnpm audit for vulnerabilities + license compliance check (flag GPL/AGPL/SSPL)
- **D-20:** Lighthouse reports generated (informational, no score thresholds for v1)

### CI Pipeline
- **D-21:** GitHub Actions CI pipeline: lint + typecheck + unit tests + integration tests (Postgres service) + E2E tests (Playwright) on every PR
- **D-22:** pnpm audit in CI — fail on critical/high vulnerabilities
- **D-23:** Lighthouse report generated in CI, uploaded as informational artifact
- **D-24:** Playwright traces + screenshot diffs uploaded as CI artifacts only on failure
- **D-25:** E2E tests run sequentially in CI (single Playwright worker)

### Claude's Discretion
None — all areas had explicit decisions.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Test Infrastructure
- `packages/web/playwright.config.ts` — Existing Playwright config (Chromium only, webServer on :3000)
- `packages/web/vitest.config.ts` — Vitest config with jsdom, React plugin, @/ alias
- `packages/web/src/__tests__/setup.ts` — Vitest setup file for web component tests

### Existing Test Patterns
- `packages/shared/src/db/__tests__/` — Integration test patterns against real Postgres
- `packages/web/src/__tests__/smoke.test.ts` — Existing web smoke test
- `packages/web/src/trpc/routers/__tests__/` — tRPC router test patterns
- `packages/web/src/app/api/events/__tests__/route.test.ts` — SSE route test pattern

### SSE Infrastructure
- `packages/web/src/app/api/events/[projectId]/route.ts` — SSE endpoint via Postgres LISTEN/NOTIFY

### Docker Infrastructure
- `docker-compose.yml` — Current Postgres (:5432), Postgres-test (:5433), Redis (:6379), Inngest (:8288)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Playwright already configured with Chromium, webServer, and trace-on-retry
- Vitest + jsdom + React Testing Library already set up for web package
- Docker Compose has Postgres test instance pattern (can extend for E2E :5434)
- Integration tests in shared/ demonstrate real-Postgres test patterns with migrations

### Established Patterns
- Tests use `__tests__/` directory convention (not collocated)
- Integration tests use separate vitest config with DATABASE_URL env
- Web tests mock engine dependencies via vi.mock
- Playwright config uses `reuseExistingServer` for local dev

### Integration Points
- E2E tests will need a running Next.js dev server (already in Playwright webServer config)
- E2E tests need Postgres :5434 + Redis + Inngest for full-stack flows
- CI needs Docker services for Postgres instances and Redis
- axe-core integrates via @axe-core/playwright package
- Visual snapshots use Playwright's built-in toHaveScreenshot()

</code_context>

<specifics>
## Specific Ideas

No specific references — open to standard approaches for all decisions.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 17-ui-testing-e2e-testing-and-final-checks*
*Context gathered: 2026-03-27*
