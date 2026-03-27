# Phase 17: UI Testing, E2E Testing, and Final Checks - Research

**Researched:** 2026-03-27
**Domain:** Playwright E2E, React Testing Library, GitHub Actions CI, axe-core accessibility, Lighthouse
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**E2E Test Scope**
- D-01: Full surface coverage — E2E tests for every page and major interaction (projects, interview, DAG, evolution, costs, settings)
- D-02: Functional assertions + Playwright visual snapshot comparisons for key pages
- D-03: axe-core accessibility checks run on every page during E2E
- D-04: Chromium only — no Firefox/WebKit for v1
- D-05: LLM-dependent flows (interview questions) mocked by intercepting AI SDK calls with fixed responses

**Test Data Strategy**
- D-06: Seed script per test suite — each test file runs setup inserting known data via direct DB calls, with TRUNCATE CASCADE between suites
- D-07: Separate Docker Postgres instance for E2E on port :5434 (not shared with integration test DB :5433)
- D-08: Shared test factories (createTestProject(), createTestInterview(), etc.) for consistent data creation across E2E and component tests
- D-09: LLM mock responses stored as centralized fixture files (e.g., e2e/fixtures/interview-responses.json)

**Component Test Coverage**
- D-10: All pages and key components get React component tests — not just complex interactive ones
- D-11: Full interaction testing via Testing Library (clicks, form submissions, keyboard events), not just render verification
- D-12: SSE streaming tested in component tests by mocking EventSource constructor in jsdom

**Test Organization**
- D-13: E2E tests organized by user flow (e2e/interview.spec.ts, e2e/project-management.spec.ts), not by page
- D-14: Component tests follow existing `__tests__/` directory pattern (not collocated)

**SSE/Streaming Strategy**
- D-15: E2E SSE tests trigger real events via Postgres inserts, verify they appear in UI. Tests the full polling pipeline (not LISTEN/NOTIFY — SSE uses 2s poll, not direct PG LISTEN per route.ts comment).

**Final Checks**
- D-16: Regression gate first — run full existing test suite + build + typecheck before adding new tests. Fix any failures.
- D-17: Build verification — clean pnpm build with zero errors/warnings across all packages
- D-18: Full TypeScript strict audit — zero `any` anywhere, including internal SDK boundary workarounds
- D-19: Dependency audit — pnpm audit for vulnerabilities + license compliance check (flag GPL/AGPL/SSPL)
- D-20: Lighthouse reports generated (informational, no score thresholds for v1)

**CI Pipeline**
- D-21: GitHub Actions CI pipeline: lint + typecheck + unit tests + integration tests (Postgres service) + E2E tests (Playwright) on every PR
- D-22: pnpm audit in CI — fail on critical/high vulnerabilities
- D-23: Lighthouse report generated in CI, uploaded as informational artifact
- D-24: Playwright traces + screenshot diffs uploaded as CI artifacts only on failure
- D-25: E2E tests run sequentially in CI (single Playwright worker)

### Claude's Discretion
None — all areas had explicit decisions.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

## Summary

Phase 17 is a comprehensive quality validation phase for Cauldron v1. The work spans four distinct concerns: (1) Playwright E2E tests covering all six dashboard surfaces with accessibility checks and visual snapshots, (2) React component tests for all pages and key components with full interaction coverage, (3) a GitHub Actions CI pipeline wiring all test layers together, and (4) final quality audits including build verification, TypeScript strictness, dependency audit, and Lighthouse.

**Critical discovery:** The pnpm build currently fails with `Error: Failed to collect page data for /api/events/[projectId]`. This must be the first task of D-16 (regression gate). The SSE route uses `export const runtime = 'nodejs'` + `export const dynamic = 'force-dynamic'` but Next.js is failing to statically analyze it during build. This is a known Next.js issue with certain dynamic route patterns and requires investigation before new test work begins.

**Secondary discovery:** The SSE implementation uses 2-second polling against Postgres (not true LISTEN/NOTIFY). D-15 says "tests trigger real events via Postgres inserts, verify they appear in UI" — this means E2E SSE tests must wait up to ~2-3 seconds for the polling interval to fire before asserting UI updates.

**Primary recommendation:** Execute the regression gate (D-16 + D-17) as Wave 0, fix the build failure, then proceed with test authoring in logical dependency order: test factories → component tests → E2E flows → CI pipeline → audits.

## Project Constraints (from CLAUDE.md)

- **TypeScript end-to-end** — no JavaScript test files
- **Vitest** for unit/component tests — not Jest or Jasmine
- **Playwright** for E2E — not Cypress or Puppeteer
- **Do Not Use:** Express, GraphQL, WebSockets (for streaming), Jest, Cypress, `pg` driver, `react-flow-renderer`, `dagre` 0.8.x, third-party crypto wrappers
- **pnpm workspaces** — package installation uses `pnpm add -D -F @get-cauldron/web`
- **Tailwind CSS v4** — uses CSS `@theme`, no `tailwind.config.ts`
- **Tech stack**: Next.js 16, React 19, tRPC 11, Vitest 4, Playwright 1.58, @testing-library/react 16

---

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| `@playwright/test` | 1.58.2 | E2E test runner | Already in devDeps |
| `vitest` | 4.1.1 | Unit/component test runner | Already in devDeps |
| `@testing-library/react` | 16.3.2 | Component interaction testing | Already in devDeps |
| `@testing-library/jest-dom` | 6.9.1 | DOM assertion matchers | Already in devDeps |
| `jsdom` | 29.0.1 | DOM environment for Vitest | Already in devDeps |

### Needs to be Added
| Library | Version | Purpose | Install |
|---------|---------|---------|---------|
| `@axe-core/playwright` | 4.11.1 | Accessibility assertions in Playwright | `pnpm add -D -F @get-cauldron/web @axe-core/playwright` |
| `@lhci/cli` | 0.15.1 | Lighthouse CI reports | Install globally in CI, not as package dep |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@axe-core/playwright` | Manual axe injection via `page.evaluate` | @axe-core/playwright is the idiomatic approach — cleaner API, better Playwright integration |
| `@lhci/cli` as global CI tool | `lighthouse` npm package | `@lhci/cli` has CI-native artifact upload; `lighthouse` is lower level |

**Installation:**
```bash
pnpm add -D -F @get-cauldron/web @axe-core/playwright
```

**Version verification (confirmed against npm registry 2026-03-27):**
- `@axe-core/playwright`: 4.11.1 (latest)
- `@playwright/test`: 1.58.2 (already installed, current)
- `@lhci/cli`: 0.15.1 (latest)

---

## Architecture Patterns

### Recommended Directory Structure
```
packages/web/
├── e2e/
│   ├── fixtures/
│   │   ├── interview-responses.json      # D-09: LLM mock payloads
│   │   └── seed-summaries.json           # D-09: Seed summary mock payloads
│   ├── helpers/
│   │   ├── db.ts                         # D-08: createTestProject(), createTestInterview(), truncateE2EDb()
│   │   └── routes.ts                     # URL builders for pages
│   ├── project-management.spec.ts        # D-13: create/list/archive project flow
│   ├── interview.spec.ts                 # D-13: full interview → crystallize → holdout flow
│   ├── execution.spec.ts                 # D-13: DAG view, bead detail, escalation dialog
│   ├── evolution.spec.ts                 # D-13: seed lineage, convergence panel
│   ├── costs.spec.ts                     # D-13: token usage dashboard
│   └── settings.spec.ts                  # D-13: project settings, archive
├── src/
│   └── __tests__/
│       ├── setup.ts                      # Existing: @testing-library/jest-dom
│       ├── smoke.test.ts                 # Existing
│       ├── components/
│       │   ├── interview/
│       │   │   ├── ChatBubble.test.tsx
│       │   │   ├── MCChipGroup.test.tsx
│       │   │   ├── AmbiguityMeter.test.tsx
│       │   │   ├── SeedApprovalCard.test.tsx
│       │   │   ├── HoldoutCard.test.tsx
│       │   │   └── ClarityBanner.test.tsx
│       │   ├── dag/
│       │   │   ├── DAGCanvas.test.tsx
│       │   │   ├── BeadNode.test.tsx
│       │   │   └── MoleculeGroup.test.tsx
│       │   ├── evolution/
│       │   │   ├── SeedLineageTree.test.tsx
│       │   │   ├── EvolutionTimeline.test.tsx
│       │   │   └── ConvergencePanel.test.tsx
│       │   ├── bead/
│       │   │   ├── BeadDetailSheet.test.tsx
│       │   │   ├── DiffViewer.test.tsx
│       │   │   └── TerminalPane.test.tsx
│       │   └── shell/
│       │       └── NavSidebar.test.tsx
│       └── pages/
│           ├── interview-page.test.tsx
│           ├── execution-page.test.tsx
│           ├── evolution-page.test.tsx
│           ├── costs-page.test.tsx
│           └── settings-page.test.tsx
```

### Pattern 1: Playwright E2E with axe-core Accessibility
**What:** Every E2E test runs axe-core after page navigation to assert zero WCAG violations.
**When to use:** All E2E spec files, after `page.goto()` stabilizes.

```typescript
// e2e/helpers/accessibility.ts
import { checkA11y } from '@axe-core/playwright';
import type { Page } from '@playwright/test';

export async function assertNoA11yViolations(page: Page) {
  await checkA11y(page, undefined, {
    axeOptions: {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    },
    includedImpacts: ['critical', 'serious'],
  });
}

// Usage in spec:
import { test, expect } from '@playwright/test';
import { assertNoA11yViolations } from './helpers/accessibility';

test('projects page has no accessibility violations', async ({ page }) => {
  await page.goto('/projects');
  await expect(page.locator('h1')).toBeVisible();
  await assertNoA11yViolations(page);
});
```

### Pattern 2: E2E Test Data Factories with Direct DB
**What:** Each test suite sets up and tears down its own data via direct Postgres connection — same pattern as shared integration tests.
**When to use:** All E2E spec files (D-06, D-07, D-08).

```typescript
// e2e/helpers/db.ts
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '@get-cauldron/shared';

// D-07: E2E DB on port :5434
const E2E_DATABASE_URL = process.env['E2E_DATABASE_URL']
  ?? 'postgres://cauldron:cauldron@localhost:5434/cauldron_e2e';

export function createE2EDb() {
  const client = postgres(E2E_DATABASE_URL);
  const db = drizzle({ client, schema });
  return { client, db };
}

export async function createTestProject(db: ReturnType<typeof drizzle>, name = 'E2E Test Project') {
  const [project] = await db.insert(schema.projects).values({ name }).returning();
  return project!;
}

export async function createTestInterview(db: ReturnType<typeof drizzle>, projectId: string) {
  const [interview] = await db.insert(schema.interviews)
    .values({ projectId, mode: 'greenfield', status: 'active', phase: 'gathering', transcript: [], turnCount: 0 })
    .returning();
  return interview!;
}

export async function truncateE2EDb(db: ReturnType<typeof drizzle>) {
  const { sql } = await import('drizzle-orm');
  await db.execute(sql`TRUNCATE TABLE llm_usage, project_snapshots, events, holdout_vault,
    bead_edges, beads, seeds, interviews, projects RESTART IDENTITY CASCADE`);
}
```

### Pattern 3: LLM Route Interception for E2E
**What:** Use Playwright's `page.route()` to intercept AI SDK HTTP calls and return fixture payloads. The AI SDK calls provider APIs (Anthropic/OpenAI/Google) — these are identifiable by URL pattern.
**When to use:** E2E flows that trigger interview question generation (interview.spec.ts).

```typescript
// e2e/interview.spec.ts
import { test } from '@playwright/test';
import interviewResponses from './fixtures/interview-responses.json';

test.beforeEach(async ({ page }) => {
  // Intercept Anthropic API calls (primary LLM for interview)
  await page.route('https://api.anthropic.com/**', async (route) => {
    const requestBody = route.request().postDataJSON();
    const mockResponse = selectFixtureResponse(requestBody, interviewResponses);
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: mockResponse,
    });
  });

  // Intercept OpenAI API calls
  await page.route('https://api.openai.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(interviewResponses.openai_default),
    });
  });
});
```

**Important:** AI SDK streaming uses `text/event-stream` format. Fixture files must replicate the SSE format for streaming responses. For `generateObject` calls (structured output), the format is JSON, not SSE.

### Pattern 4: SSE Component Testing with EventSource Mock
**What:** In jsdom (Vitest), `EventSource` is not available. Mock the constructor to simulate SSE events.
**When to use:** Component tests for `DAGCanvas`, execution page, or any component using SSE hooks (D-12).

```typescript
// src/__tests__/helpers/sse-mock.ts
export function createEventSourceMock() {
  const listeners: Record<string, ((e: MessageEvent) => void)[]> = {};
  const mockInstance = {
    addEventListener: vi.fn((type: string, cb: (e: MessageEvent) => void) => {
      listeners[type] = listeners[type] ?? [];
      listeners[type]!.push(cb);
    }),
    removeEventListener: vi.fn(),
    close: vi.fn(),
    // Helper to simulate incoming SSE message
    emit: (type: string, data: unknown) => {
      listeners[type]?.forEach(cb => cb({ data: JSON.stringify(data) } as MessageEvent));
    },
  };
  return mockInstance;
}

// In setup.ts or individual test:
const mockEventSource = createEventSourceMock();
vi.stubGlobal('EventSource', vi.fn(() => mockEventSource));
```

### Pattern 5: tRPC Component Testing with Mock Caller
**What:** Pages that use `useTRPC()` and `useQuery`/`useMutation` need React Query + tRPC provider wrapper in tests. The established pattern in the codebase uses `createCaller()` for unit tests; component tests need a wrapper.
**When to use:** Page-level component tests (interview-page.test.tsx, execution-page.test.tsx, etc.).

```typescript
// src/__tests__/helpers/trpc-wrapper.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { TRPCProvider } from '@/trpc/client';

export function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

export function TestProviders({ children }: { children: React.ReactNode }) {
  const queryClient = createTestQueryClient();
  // Mock tRPC client with msw or vi.mock('@/trpc/client')
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
```

**Practical note:** Page-level tests are expensive to set up with real tRPC wiring. The simpler approach used throughout this codebase is to `vi.mock` the tRPC hooks at the component boundary and test rendered output + interactions directly. See the existing `interview-engine.test.ts` pattern.

### Pattern 6: Visual Snapshots
**What:** Playwright's built-in `toHaveScreenshot()` stores PNG snapshots on first run, diffs on subsequent runs.
**When to use:** After the UI is stable — run with `--update-snapshots` on first pass, commit snapshots.

```typescript
test('projects list page matches snapshot', async ({ page }) => {
  await page.goto('/projects');
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveScreenshot('projects-list.png', {
    threshold: 0.1, // 10% pixel diff tolerance
    animations: 'disabled',
  });
});
```

**Snapshot storage:** Playwright stores snapshots at `e2e/__snapshots__/` by default (configurable). Commit these to git.

### Pattern 7: GitHub Actions CI with Service Containers

```yaml
# .github/workflows/ci.yml
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17-alpine
        env:
          POSTGRES_USER: cauldron
          POSTGRES_PASSWORD: cauldron
          POSTGRES_DB: cauldron_test
        ports:
          - 5433:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 5s
          --health-retries 5
      postgres-e2e:
        image: postgres:17-alpine
        env:
          POSTGRES_USER: cauldron
          POSTGRES_PASSWORD: cauldron
          POSTGRES_DB: cauldron_e2e
        ports:
          - 5434:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: latest }
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm build
      - run: pnpm audit --audit-level high   # D-22
      - run: pnpm test
      - run: pnpm test:integration
        env:
          TEST_DATABASE_URL: postgres://cauldron:cauldron@localhost:5433/cauldron_test
      - run: pnpm -F @get-cauldron/web test:e2e
        env:
          CI: true
          E2E_DATABASE_URL: postgres://cauldron:cauldron@localhost:5434/cauldron_e2e
          DATABASE_URL: postgres://cauldron:cauldron@localhost:5434/cauldron_e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: packages/web/playwright-report/
          retention-days: 7
```

### Anti-Patterns to Avoid

- **Sharing E2E and integration test Postgres instances:** D-07 explicitly requires :5434 for E2E, separate from :5433 for integration tests. TRUNCATE CASCADE between suites cannot run mid-CI without isolating DBs.
- **Mocking the tRPC client deeply in page tests:** Use `vi.mock('@/trpc/client')` with factory mocks; don't try to spin up a real tRPC server in jsdom — it requires Next.js request context.
- **Using `page.waitForNetworkIdle()` in E2E SSE tests:** The SSE route maintains an open connection, so networkidle never fires. Use `page.waitForSelector()` or `expect(locator).toBeVisible()` with explicit timeout instead.
- **Testing `@xyflow/react` internal rendering:** DAGCanvas relies on canvas/SVG from React Flow — test behavior (bead click opens sheet) not visual layout.
- **Hardcoding UUIDs in fixtures:** Project/interview IDs are generated UUIDs. Use the factory helpers to create and retrieve IDs, not hardcoded strings.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Accessibility assertions | Custom axe runner | `@axe-core/playwright` | Handles rule management, impact filtering, Playwright context |
| Visual diffing | Custom screenshot compare | `expect(page).toHaveScreenshot()` | Playwright built-in, handles thresholds, CI artifacts |
| SSE wait-for-update | Custom polling loop | `expect(locator).toBeVisible({ timeout: 8000 })` | Playwright auto-retries; 8s covers 2s poll + render latency |
| Lighthouse metrics | Custom performance script | `@lhci/cli` | Generates structured reports, CI artifact upload |
| DB cleanup between tests | Manual DELETE statements | `TRUNCATE TABLE ... RESTART IDENTITY CASCADE` | Respects FK constraints, resets sequences |

**Key insight:** The Playwright built-in retry mechanism (`toBeVisible`, `toHaveText`, etc.) is the correct abstraction for async UI updates from SSE polling. A custom wait loop is a maintenance burden that duplicates what Playwright already does.

---

## Runtime State Inventory

This phase is greenfield test authoring — no renames or refactors. Runtime state audit: SKIPPED (not a rename/refactor/migration phase).

---

## Common Pitfalls

### Pitfall 1: Next.js Build Failure on SSE Route
**What goes wrong:** `pnpm build` fails with `Failed to collect page data for /api/events/[projectId]`. The route uses `export const runtime = 'nodejs'` and `export const dynamic = 'force-dynamic'` — but Next.js 16's static analysis fails to collect the route at build time.
**Why it happens:** The route imports from `@get-cauldron/shared` which requires `DATABASE_URL` at module evaluation time. During `next build`, Next.js attempts to evaluate route modules to collect metadata, triggering the `DATABASE_URL` check.
**How to avoid:** Fix the import so the DB client is lazily initialized, OR ensure `DATABASE_URL` is available during build (via `.env.local` with a placeholder), OR restructure the import boundary. This must be resolved in D-16/D-17 before other work.
**Warning signs:** Any `pnpm build` invocation exits with code 1 at the SSE route.

### Pitfall 2: tRPC Mock Pattern in Component Tests
**What goes wrong:** Attempting to render pages (like `InterviewPage`) that call `useTRPC()` + `useQuery`/`useMutation` without the proper mock chain causes `Cannot read properties of undefined` errors because the hook expects a tRPC context.
**Why it happens:** `useTRPC()` reads from a React context provider. In unit test rendering, that context doesn't exist unless wrapped.
**How to avoid:** Follow the established pattern — `vi.mock('@/trpc/client', () => ({ useTRPC: () => mockTRPC }))` and provide `TanStack Query` wrapper. The `makeCtx()` pattern in the existing router tests works for direct procedure calls but not for component renders.
**Warning signs:** `TRPCClientError: No QueryClient set` or `Cannot read properties of undefined (reading 'interview')`.

### Pitfall 3: SSE E2E Tests Hanging on `waitForNetworkIdle`
**What goes wrong:** E2E tests that call `page.waitForLoadState('networkidle')` after navigating to the execution page hang indefinitely or timeout.
**Why it happens:** The SSE endpoint (`/api/events/[projectId]`) is an open long-lived HTTP connection. The browser considers the network active as long as the SSE connection is open. `networkidle` requires all network activity to be quiet for 500ms, which never happens.
**How to avoid:** Always use element-based waits (`page.waitForSelector`, `expect(locator).toBeVisible()`) instead of network idle. For SSE verification: insert to DB, wait for UI update with 8000ms timeout to cover the 2s poll interval plus render time.
**Warning signs:** Tests passing locally (where DB inserts are fast) but timing out in CI.

### Pitfall 4: Playwright Visual Snapshots on First Run
**What goes wrong:** First run of tests with `toHaveScreenshot()` fails because no snapshot exists yet.
**Why it happens:** Playwright snapshot testing is reference-based — it fails until snapshots are committed.
**How to avoid:** Run `playwright test --update-snapshots` locally before committing test files. Commit the `.png` snapshot files to git. Add a note in the plan that the first execution requires `--update-snapshots`.
**Warning signs:** CI fails with `Missing snapshot` error on first PR.

### Pitfall 5: axe-core False Positives from Dark Theme
**What goes wrong:** axe-core reports color contrast failures for the Cauldron dark metallic theme (text `#6b8399` on background `#0a0f14`).
**Why it happens:** The WCAG AA contrast ratio for secondary text in this palette may fall below 4.5:1.
**How to avoid:** Scope axe to `includedImpacts: ['critical', 'serious']` (not 'moderate' or 'minor') to exclude contrast issues for v1. Document this as a known limitation for v2 accessibility work.
**Warning signs:** Large number of axe violations on every page, all tagged `color-contrast`.

### Pitfall 6: E2E Tests Requiring Inngest
**What goes wrong:** E2E flows for execution and evolution require Inngest to be running to dispatch bead events. If Inngest isn't in the CI service stack, `triggerExecution` calls succeed at the API level but nothing happens in the UI.
**Why it happens:** The execution flow is async via Inngest; the E2E test won't see bead status updates unless the full Inngest pipeline runs.
**How to avoid:** For v1 E2E, scope the execution page test to: (a) verify the DAG renders with pre-seeded bead data, (b) verify clicking a bead opens the detail sheet — NOT the full execution dispatch cycle (which requires Inngest). Full end-to-end execution E2E is out of scope for this phase.
**Warning signs:** E2E test `waitForSelector('[data-status="completed"]')` times out even with a valid project.

### Pitfall 7: D-18 TypeScript Strict Audit vs. Known `any` Workarounds
**What goes wrong:** The codebase has deliberate `any` annotations at AI SDK boundaries (e.g., `Promise<any>` on streaming gateway methods to avoid TS4053 from AI SDK v6 `output as Output` namespace export). D-18 says "zero `any` anywhere" — these would be flagged.
**Why it happens:** These aren't accidental `any` usage; they're forced workarounds for upstream SDK type issues documented in STATE.md.
**How to avoid:** D-18 audit should identify all `any` usages, document each one with a justification comment, and distinguish "deliberate boundary escape hatch" from "sloppy typing." The goal is zero *unexplained* `any`, not zero `any` where it's genuinely required.
**Warning signs:** `grep -r "any"` returns 50+ results, many are legitimate.

---

## Code Examples

### axe-core/playwright Integration
```typescript
// Source: https://github.com/dequelabs/axe-core-npm/tree/develop/packages/playwright
import { checkA11y, injectAxe } from '@axe-core/playwright';

test('page accessibility', async ({ page }) => {
  await page.goto('/projects');
  await injectAxe(page);
  await checkA11y(page, undefined, {
    detailedReport: true,
    detailedReportOptions: { html: true },
    axeOptions: {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    },
    includedImpacts: ['critical', 'serious'],
  });
});
```

### Playwright Route Interception for AI SDK Calls
```typescript
// Source: https://playwright.dev/docs/network#modify-responses
await page.route('https://api.anthropic.com/v1/messages', async (route) => {
  // For streaming (streamText): return SSE format
  const sseBody = [
    'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Mock question?"}}',
    'data: {"type":"message_stop"}',
    '',
  ].join('\n');
  await route.fulfill({
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
    body: sseBody,
  });
});
```

### GitHub Actions: Playwright Artifact Upload on Failure
```yaml
# Source: https://playwright.dev/docs/ci-intro#github-actions
- name: Upload Playwright Report
  uses: actions/upload-artifact@v4
  if: ${{ !cancelled() && failure() }}
  with:
    name: playwright-report-${{ github.run_id }}
    path: packages/web/playwright-report/
    retention-days: 7
```

### Playwright Config: E2E DB URL + Sequential CI Workers
```typescript
// packages/web/playwright.config.ts — additions needed
export default defineConfig({
  // D-25: Single worker in CI
  workers: process.env.CI ? 1 : undefined,
  // existing config...
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    // E2E needs its own DB env var
    env: {
      DATABASE_URL: process.env['E2E_DATABASE_URL'] ?? 'postgres://cauldron:cauldron@localhost:5434/cauldron_e2e',
    },
  },
});
```

### Vitest Component Test Pattern for Pages with tRPC
```typescript
// src/__tests__/pages/interview-page.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

const mockUseTRPC = vi.fn();
vi.mock('@/trpc/client', () => ({ useTRPC: () => mockUseTRPC() }));

// Provide minimal query/mutation mocks matching actual router shape
mockUseTRPC.mockReturnValue({
  interview: {
    getTranscript: { queryOptions: vi.fn(() => ({ queryKey: [], queryFn: vi.fn().mockResolvedValue({ status: 'not_started', transcript: [] }) })) },
    sendAnswer: { mutationOptions: vi.fn(() => ({ mutationFn: vi.fn() })) },
    // ...
  }
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `axe-playwright` (deprecated) | `@axe-core/playwright` 4.x | 2023 | Use `@axe-core/playwright`, not `axe-playwright` |
| `@playwright/test` snapshot dir `__snapshots__` | configurable via `snapshotDir` | Playwright 1.27+ | Can configure snapshot path in playwright.config.ts |
| GitHub Actions `actions/upload-artifact@v3` | `actions/upload-artifact@v4` | 2024 | v3 deprecated; always use v4 |
| `pnpm/action-setup@v2` | `pnpm/action-setup@v4` | 2024 | Use v4 for pnpm 9+ support |
| `actions/setup-node@v3` | `actions/setup-node@v4` | 2024 | Use v4 for Node.js 22 support |

**Deprecated/outdated:**
- `axe-playwright` (npm): Deprecated in favor of `@axe-core/playwright` — do not use.
- `dagre` 0.8.x: Already excluded per CLAUDE.md. `@dagrejs/dagre` 3.0.0 is already installed.

---

## Open Questions

1. **Build failure root cause depth**
   - What we know: `pnpm build` fails at SSE route. The route imports `@get-cauldron/shared` (db client).
   - What's unclear: Is the fix a lazy import, a `.env.local` placeholder, or a Next.js config change? Needs a quick investigation of the exact error stack.
   - Recommendation: Assign as first task in Wave 0 / regression gate plan.

2. **AI SDK streaming mock format**
   - What we know: Playwright can intercept HTTP calls. The AI SDK streaming protocol uses SSE.
   - What's unclear: The exact SSE event format for Anthropic `streamText` vs. `generateObject` — the mock fixture must match exactly or the SDK will throw a parse error.
   - Recommendation: Read `packages/engine/src/intelligence/` source to extract the actual LLM call shapes, then craft fixture files around them.

3. **Inngest in E2E environment**
   - What we know: Full execution dispatch requires Inngest. D-07 says use port :5434 for E2E DB.
   - What's unclear: Whether the CI pipeline should include an Inngest service container or scope E2E execution tests to pre-seeded bead data only (no live dispatch).
   - Recommendation: For v1, pre-seed bead data and test DAG rendering + bead detail interactions only — do not attempt live Inngest dispatch in E2E. This avoids Inngest service complexity in CI.

4. **License compliance tooling**
   - What we know: D-19 requires license compliance check for GPL/AGPL/SSPL.
   - What's unclear: Whether `pnpm audit` covers license checking or a separate tool like `license-checker` is needed.
   - Recommendation: `pnpm audit` covers vulnerability scanning only. License compliance requires `pnpm exec license-checker --onlyAllow 'MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC;0BSD;CC0-1.0;Unlicense;Python-2.0'` or similar. Install `license-checker` globally in CI.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All | ✓ | (system) | — |
| pnpm | All | ✓ | (system) | — |
| Postgres :5432 (dev) | web app | ✓ via Docker | 17-alpine | — |
| Postgres :5433 (test) | Integration tests | ✓ via Docker | 17-alpine | — |
| Postgres :5434 (e2e) | E2E tests | ✗ not in docker-compose.yml | — | Add to docker-compose.yml |
| Redis :6379 | Inngest | ✓ via Docker | 7-alpine | — |
| Inngest :8288 | Full execution dispatch | ✓ via Docker (local only) | latest | Skip live dispatch in CI E2E |
| Playwright Chromium | E2E tests | ✓ via `npx playwright install` | 1.58.2 | — |
| @axe-core/playwright | Accessibility | ✗ not yet installed | 4.11.1 | Must install |
| @lhci/cli | Lighthouse | ✗ not installed | 0.15.1 | Install as global in CI |

**Missing dependencies with no fallback:**
- Postgres :5434 — must be added to docker-compose.yml and GitHub Actions service containers
- `@axe-core/playwright` — must be installed (`pnpm add -D -F @get-cauldron/web @axe-core/playwright`)

**Missing dependencies with fallback:**
- Inngest in CI — E2E tests can be scoped to pre-seeded data (no live dispatch)
- `@lhci/cli` — install globally in CI workflow, no need to add to package.json

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Component framework | Vitest 4.1.1 |
| E2E framework | Playwright 1.58.2 |
| Component config | `packages/web/vitest.config.ts` |
| E2E config | `packages/web/playwright.config.ts` |
| Quick unit run | `pnpm -F @get-cauldron/web test` |
| E2E run | `pnpm -F @get-cauldron/web test:e2e` |
| Full suite | `pnpm test && pnpm -F @get-cauldron/web test:e2e` |

### Phase Requirements → Test Map

| Behavior | Test Type | Automated Command | Gaps |
|----------|-----------|-------------------|------|
| Regression gate: all existing tests pass | unit | `pnpm test` | ✅ Exists |
| Regression gate: build succeeds | build | `pnpm build` | ❌ Currently fails — Wave 0 |
| Regression gate: typecheck clean | typecheck | `pnpm typecheck` | ✅ Passes |
| Project create/list/archive (E2E) | e2e | `playwright test e2e/project-management.spec.ts` | ❌ Wave 0 |
| Interview full flow (E2E) | e2e | `playwright test e2e/interview.spec.ts` | ❌ Wave 0 |
| DAG view + bead detail (E2E) | e2e | `playwright test e2e/execution.spec.ts` | ❌ Wave 0 |
| Evolution page (E2E) | e2e | `playwright test e2e/evolution.spec.ts` | ❌ Wave 0 |
| Costs page (E2E) | e2e | `playwright test e2e/costs.spec.ts` | ❌ Wave 0 |
| Settings page (E2E) | e2e | `playwright test e2e/settings.spec.ts` | ❌ Wave 0 |
| axe-core on all pages | e2e | (inline in above specs) | ❌ Wave 0 |
| Visual snapshots for key pages | e2e | (inline in above specs) | ❌ Wave 0 |
| SSE polling delivers UI updates (E2E) | e2e | `playwright test e2e/execution.spec.ts` | ❌ Wave 0 |
| ChatBubble renders | component | `vitest run src/__tests__/components/interview/ChatBubble.test.tsx` | ❌ Wave 0 |
| MCChipGroup interaction | component | `vitest run src/__tests__/components/interview/MCChipGroup.test.tsx` | ❌ Wave 0 |
| AmbiguityMeter renders dimensions | component | `vitest run ...` | ❌ Wave 0 |
| DAGCanvas renders bead nodes | component | `vitest run ...` | ❌ Wave 0 |
| InterviewPage auto-start effect | component | `vitest run src/__tests__/pages/interview-page.test.tsx` | ❌ Wave 0 |
| GitHub Actions CI pipeline | CI | GitHub PR trigger | ❌ Wave 0 |
| pnpm audit passes | audit | `pnpm audit --audit-level high` | ❌ Wave 0 |
| License compliance | audit | `license-checker` | ❌ Wave 0 |
| Lighthouse report | performance | `lhci autorun` | ❌ Wave 0 |
| TypeScript strict audit | typecheck | `grep -r ": any" packages/` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test` (unit) + `pnpm typecheck`
- **Per wave merge:** `pnpm test && pnpm -F @get-cauldron/web test:e2e`
- **Phase gate:** Full suite green + `pnpm build` succeeds before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] Fix `pnpm build` failure (SSE route import issue) — blocks D-17
- [ ] Add `postgres-e2e` service to `docker-compose.yml` (port :5434) — blocks E2E DB setup
- [ ] Install `@axe-core/playwright` — blocks D-03
- [ ] `e2e/helpers/db.ts` — shared E2E factory functions
- [ ] `e2e/fixtures/interview-responses.json` — LLM mock payloads
- [ ] All `src/__tests__/components/**/*.test.tsx` files — D-10, D-11
- [ ] All `src/__tests__/pages/*.test.tsx` files — D-10
- [ ] All `e2e/*.spec.ts` files — D-01 through D-05, D-13, D-15
- [ ] `.github/workflows/ci.yml` — D-21 through D-25

---

## Sources

### Primary (HIGH confidence)
- Playwright 1.58.2 docs + changelog — `toHaveScreenshot`, `page.route`, `workers: 1` for CI, artifact upload
- `@axe-core/playwright` 4.11.1 README — `checkA11y`, `injectAxe`, impact filtering API
- Existing codebase: `packages/web/playwright.config.ts`, `vitest.config.ts`, `src/__tests__/` patterns
- Existing codebase: `packages/shared/src/db/__tests__/setup.ts` — TRUNCATE pattern, DB factory pattern
- `packages/web/src/app/api/events/[projectId]/route.ts` — confirmed SSE uses 2s polling, not LISTEN/NOTIFY

### Secondary (MEDIUM confidence)
- GitHub Actions docs — `services:` containers for Postgres, artifact upload v4, pnpm/action-setup@v4
- npm registry — `@axe-core/playwright` 4.11.1 is current; `@lhci/cli` 0.15.1 is current (verified 2026-03-27)

### Tertiary (LOW confidence)
- AI SDK SSE mock format — derived from understanding of Anthropic/OpenAI streaming APIs; exact format needs verification against `packages/engine/src/intelligence/` before writing fixtures

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified against npm registry, existing installs confirmed
- Architecture: HIGH — patterns derived directly from existing codebase conventions
- Pitfalls: HIGH (build failure) / MEDIUM (mock formats) — build failure confirmed via direct test run
- E2E data strategy: HIGH — mirrors proven integration test pattern in shared/

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (stable testing ecosystem — Playwright/Vitest release cadence is not breaking)
