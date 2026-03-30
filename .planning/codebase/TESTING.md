# Testing Patterns

**Analysis Date:** 2026-03-29

## Test Framework

**Runner:**
- Vitest 4 for unit, integration, and wiring tests
- Playwright 1.58 for E2E tests

**Assertion Library:**
- Vitest built-in `expect` for all non-E2E tests
- `@testing-library/jest-dom/vitest` matchers for web component tests (setup at `packages/web/src/__tests__/setup.ts`)
- Playwright `expect` for E2E assertions
- `@axe-core/playwright` (AxeBuilder) for accessibility assertions

**Run Commands:**
```bash
# All unit tests across monorepo
pnpm test

# All integration tests (requires Docker Postgres on :5433)
pnpm test:integration

# All wiring tests (requires Docker Postgres on :5433)
pnpm test:wiring

# Per-package unit tests
pnpm -F @get-cauldron/engine test
pnpm -F @get-cauldron/shared test        # Note: shared's "test" runs integration config
pnpm -F @get-cauldron/cli test
pnpm -F @get-cauldron/web test

# Per-package wiring tests
pnpm -F @get-cauldron/web test:wiring
pnpm -F @get-cauldron/engine test:wiring

# Single test file
pnpm -F @get-cauldron/engine test -- src/__tests__/interview.test.ts

# E2E tests (requires dev server on :3000 + Postgres on :5434)
pnpm -F @get-cauldron/web test:e2e

# Live pipeline E2E (real LLM calls, 45-min timeout)
pnpm -F @get-cauldron/web test:live
```

## Test Types

| Type | Framework | File Pattern | Config | Location | DB Required |
|------|-----------|-------------|--------|----------|-------------|
| Unit | Vitest | `*.test.ts` / `*.test.tsx` | `vitest.config.ts` | `__tests__/` dirs | No |
| Integration | Vitest | `*.integration.test.ts` | `vitest.integration.config.ts` | `__tests__/` dirs | Yes (:5433) |
| Wiring | Vitest | `*.wiring.test.ts` | `vitest.wiring.config.ts` | `__tests__/` dirs | Yes (:5433) |
| Component | Vitest + jsdom | `*.test.tsx` | `vitest.config.ts` (web) | `src/__tests__/` | No |
| E2E | Playwright | `*.spec.ts` | `playwright.config.ts` | `e2e/` | Yes (:5434) |
| Live E2E | Playwright | `pipeline-live.spec.ts` | `playwright.live.config.ts` | `e2e/` | Yes (:5435) |

### Test Type Definitions

**Unit tests** (`*.test.ts`): Mock all external dependencies (DB, AI SDK, filesystem). Test pure logic and class behavior. Fast, no infrastructure required.

**Integration tests** (`*.integration.test.ts`): Use real PostgreSQL (Docker on port 5433, database `cauldron_test`). Test database interactions, event sourcing, schema constraints. Run with `pool: 'forks'`, `maxWorkers: 1` to prevent DB state conflicts.

**Wiring tests** (`*.wiring.test.ts`): Real PostgreSQL + real tRPC router + real engine code + mocked LLM gateway. Test the full tRPC-to-database chain without live LLM calls. Use the `@get-cauldron/test-harness` package.

**Component tests** (`*.test.tsx`): Use jsdom environment + React Testing Library. Test rendering, user interactions, accessibility. Setup file imports `@testing-library/jest-dom/vitest` matchers.

**E2E tests** (`*.spec.ts`): Playwright against localhost:3000 with pre-seeded database. Chromium-only. Global setup runs migrations against E2E database (port 5434).

**Live E2E** (`pipeline-live.spec.ts`): Full stack with real LLM calls. 45-minute timeout. Self-contained infrastructure (ports 3000, 3001, 5435, 6380, 8290). No retries.

## Test File Organization

**Location:** Tests are co-located in `__tests__/` subdirectories within each module:
```
packages/engine/src/interview/
  ├── fsm.ts
  ├── scorer.ts
  └── __tests__/
       ├── fsm.test.ts
       ├── scorer.test.ts
       ├── fsm-sendAnswer.integration.test.ts
       └── seed-injection.test.ts

packages/web/src/
  ├── __tests__/
  │    ├── setup.ts                          # jsdom + jest-dom setup
  │    ├── smoke.test.ts
  │    ├── components/
  │    │    ├── interview/ChatBubble.test.tsx
  │    │    ├── dag/DAGCanvas.test.tsx
  │    │    └── evolution/EvolutionTimeline.test.tsx
  │    └── pages/
  │         ├── interview-page.test.tsx
  │         └── execution-page.test.tsx
  └── trpc/routers/__tests__/
       ├── interview-engine.test.ts           # Unit (mocked)
       ├── interview.wiring.test.ts           # Wiring (real DB)
       ├── costs.wiring.test.ts
       └── execution.wiring.test.ts

packages/web/e2e/
  ├── global-setup.ts                        # Runs migrations on E2E DB
  ├── helpers/
  │    ├── db.ts                             # E2E DB factories
  │    ├── accessibility.ts                  # axe-core wrapper
  │    ├── routes.ts                         # URL constants
  │    ├── live-infra.ts                     # Docker/server lifecycle
  │    └── simulated-user.ts                 # LLM-driven test user
  ├── interview.spec.ts
  ├── execution.spec.ts
  ├── evolution.spec.ts
  ├── costs.spec.ts
  ├── project-management.spec.ts
  ├── settings.spec.ts
  └── pipeline-live.spec.ts
```

## Test Structure

**Unit test pattern:**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// 1. Mock @get-cauldron/shared to prevent DATABASE_URL error at import
vi.mock('@get-cauldron/shared', () => ({
  interviews: { projectId: 'project_id' },
  db: {},
  appendEvent: vi.fn().mockResolvedValue({ id: 'event-1' }),
}));

// 2. Import the code under test AFTER mocks
import { SomeClass } from '../some-class.js';

// 3. Mock helpers
function makeMockDb() {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    // ... chain as needed
  };
}

const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

// 4. Tests
describe('SomeClass', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('does the thing', () => {
    // arrange, act, assert
  });
});
```

**Integration test pattern:**
```typescript
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { createTestDb, runMigrations, truncateAll } from './setup.js';

let testDb: ReturnType<typeof createTestDb>;

beforeAll(async () => {
  testDb = createTestDb();
  await runMigrations(testDb.db);
});

afterEach(async () => { await truncateAll(testDb.db); });
afterAll(async () => { await testDb.client.end(); });

describe('feature', () => {
  it('works with real database', async () => {
    // Insert real data, test real queries
  });
});
```

**Wiring test pattern (using test-harness):**
```typescript
import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { createTestContext, type TestContext } from '@get-cauldron/test-harness';

describe('router wiring', () => {
  let ctx: TestContext;

  afterEach(async () => { await ctx?.truncate(); });
  afterAll(async () => { await ctx?.cleanup(); });

  it('procedure works end-to-end', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    const result = await ctx.caller.costs.getProjectSummary({ projectId: project.id });
    expect(Number(result.totalCostCents)).toBe(0);
  });
});
```

**Component test pattern:**
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatBubble } from '@/components/interview/ChatBubble';

describe('ChatBubble', () => {
  it('renders content', () => {
    render(<ChatBubble role="system" content="Hello" />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

**E2E test pattern:**
```typescript
import { test, expect } from '@playwright/test';
import { createE2EDb, createTestProject, truncateE2EDb, runMigrations, type E2EDb } from './helpers/db';
import { assertNoA11yViolations } from './helpers/accessibility';
import { ROUTES } from './helpers/routes';

let db: E2EDb;

test.beforeAll(async () => {
  db = createE2EDb();
  await runMigrations(db);
});

test.afterEach(async () => { await truncateE2EDb(db); });

test('interview page renders transcript', async ({ page }) => {
  const project = await createTestProject(db);
  await page.goto(ROUTES.interview(project.id));
  await assertNoA11yViolations(page);
  // assertions...
});
```

## Mocking

**Framework:** Vitest `vi.mock()` and `vi.fn()`

**Critical mock: `@get-cauldron/shared`:**
Every unit test in engine/cli/web that imports modules depending on `@get-cauldron/shared` MUST mock it to avoid `DATABASE_URL` requirement at import time:
```typescript
vi.mock('@get-cauldron/shared', () => ({
  db: {},
  appendEvent: vi.fn().mockResolvedValue({}),
  // Include only the schema symbols your code actually references
}));
```

**Hoisted mocks with `vi.hoisted()`:**
When mocks need to reference variables before module execution:
```typescript
const { mockExec } = vi.hoisted(() => ({
  mockExec: vi.fn(),
}));
vi.mock('node:child_process', () => ({ exec: mockExec }));
```

**Chainable DB mock factory:**
For unit-testing code that uses Drizzle's fluent API:
```typescript
function makeMockDb() {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([]),
  };
}
```

**Scripted LLM gateway mock:**
For wiring tests, use `@get-cauldron/test-harness`'s `createScriptedGateway()`:
```typescript
import { createScriptedGateway } from '@get-cauldron/test-harness';

const gateway = createScriptedGateway([
  { stage: 'interview', returns: { goalClarity: 0.6, ... } },
  { stage: 'interview', returns: { question: '...' } },
]);
// Responses consumed in order; throws if unexpected call after exhaustion
// Use gateway.assertAllConsumed() to verify all scripts were used
```

**What to mock (unit tests):**
- `@get-cauldron/shared` (database client)
- AI SDK functions (`ai`, `@ai-sdk/*`)
- Node.js modules (`node:child_process`, `node:fs`, `node:crypto`)
- External libraries (`simple-git`, `inngest`)

**What NOT to mock (wiring/integration tests):**
- The database (use real Postgres on :5433)
- tRPC routers (test the real router chain)
- Engine business logic (test real InterviewFSM, decomposer, etc.)
- Only mock: LLM gateway (use scripted gateway)

## Fixtures and Factories

**Test Harness Package (`packages/test-harness/`):**
Shared test infrastructure for wiring tests across web and engine packages.

```typescript
import { createTestContext } from '@get-cauldron/test-harness';

const ctx = await createTestContext({ gatewayScript: [...] });

// Factories — insert real DB rows with sensible defaults:
const project = await ctx.fixtures.project();
const interview = await ctx.fixtures.interview({ projectId: project.id, phase: 'gathering' });
const seed = await ctx.fixtures.seed({ projectId: project.id, interviewId: interview.id });
const bead = await ctx.fixtures.bead({ seedId: seed.id, status: 'pending' });
const edge = await ctx.fixtures.beadEdge({ fromBeadId: bead1.id, toBeadId: bead2.id });
const vault = await ctx.fixtures.holdoutVault({ seedId: seed.id });
const usage = await ctx.fixtures.llmUsage({ projectId: project.id, costCents: 10 });
const event = await ctx.fixtures.event({ projectId: project.id, type: 'interview_started' });
```

Key files:
- `packages/test-harness/src/context.ts`: `createTestContext()` — real DB, real tRPC router, mock gateway
- `packages/test-harness/src/fixtures.ts`: `fixtures(db)` — data factory for all tables
- `packages/test-harness/src/gateway.ts`: `createScriptedGateway()` — ordered mock responses

**Gateway scripts for multi-step flows:**
Pre-built scripts for common multi-call sequences:
- `interviewTurnScript({ overallClarity })`: 5 gateway calls (scorer + 3 perspectives + ranker)
- `decompositionScript()`: Gateway calls for decomposition flow
- `holdoutGenerationScript()`: Gateway calls for holdout generation

Location: `packages/test-harness/src/scripts/`

**Integration test setup (`packages/shared/src/db/__tests__/setup.ts`):**
```typescript
import { createTestDb, runMigrations, truncateAll } from './setup.js';
// createTestDb() → { client, db } connected to localhost:5433/cauldron_test
// runMigrations(db) → apply all Drizzle migrations
// truncateAll(db) → TRUNCATE all tables RESTART IDENTITY CASCADE
```

**E2E test factories (`packages/web/e2e/helpers/db.ts`):**
Separate from test-harness; connects to E2E database on port 5434:
- `createE2EDb()`: Drizzle client for E2E database
- `createTestProject(db)`, `createTestInterview(db, projectId)`, etc.
- `truncateE2EDb(db)`: Clean all tables between E2E tests
- `runMigrations(db)`: Apply migrations (called in `e2e/global-setup.ts`)

## Database Isolation

**Three separate PostgreSQL databases:**
| Database | Port | Purpose | Used By |
|----------|------|---------|---------|
| `cauldron` | 5432 | Development | `pnpm dev` |
| `cauldron_test` | 5433 | Integration + wiring tests | Vitest integration/wiring configs |
| `cauldron_e2e` | 5434 | E2E tests | Playwright config |

**Cleanup strategy:**
- Integration/wiring: `TRUNCATE ... RESTART IDENTITY CASCADE` in `afterEach`
- E2E: `truncateE2EDb()` in `test.afterEach`
- Connection cleanup: `client.end()` in `afterAll`

**Serialization:**
- Integration and wiring configs use `pool: 'forks'`, `maxWorkers: 1` to prevent cross-test DB state conflicts
- E2E: `workers: 1` in CI, parallel locally

## Coverage

**Requirements:** No enforced coverage thresholds currently.

**Test distribution by package:**

| Package | Unit | Integration | Wiring | Component | E2E |
|---------|------|-------------|--------|-----------|-----|
| engine | 25+ | 3 | 1 | - | - |
| shared | - | 4 | - | - | - |
| cli | 16 | - | - | - | - |
| web | 4 (router) | - | 5 | 21 | 7 |

**Well-tested modules:**
- `packages/engine/src/gateway/` — unit tests for routing, pricing, budget, diversity, circuit breaker, failover
- `packages/engine/src/interview/` — unit tests for FSM, perspectives, scorer, synthesizer; integration test for sendAnswer
- `packages/engine/src/holdout/` — unit tests for crypto, generator, evaluator, vault; integration for key isolation
- `packages/engine/src/evolution/` — unit tests for evaluator, fsm, budget, convergence, lateral thinking, mutator, embeddings
- `packages/web/src/__tests__/components/` — 21 component tests across interview, bead, dag, evolution, shell
- `packages/web/e2e/` — 6 feature E2E specs + 1 live pipeline spec

## CI/CD Testing

**Turbo tasks:**
```json
{
  "test": { "dependsOn": ["^build"] },
  "test:integration": { "dependsOn": ["^build"], "cache": false },
  "test:wiring": { "dependsOn": ["^build"], "cache": false }
}
```

Integration and wiring tests are never cached (DB state is external).

**E2E configuration for CI:**
- `retries: 2` when `process.env.CI` is set
- `workers: 1` in CI (sequential to avoid flaky cross-test DB state)
- `forbidOnly: true` in CI (prevents `.only` from being committed)
- `trace: 'on-first-retry'` for debugging failures

**Regression gate (from project memory):**
After phase execution, run: test + typecheck + build (all three required).

**Accessibility in E2E:**
Every E2E page visit should call `assertNoA11yViolations(page)` which runs axe-core WCAG 2.0 A/AA checks and fails on critical/serious violations.

## Common Patterns

**Async testing:**
```typescript
it('handles async operations', async () => {
  const result = await someAsyncFunction();
  expect(result).toBeDefined();
});
```

**Error testing:**
```typescript
it('throws on invalid input', () => {
  expect(() => assertValidTransition('crystallized', 'gathering')).toThrow('Invalid FSM transition');
});

it('throws async error', async () => {
  await expect(asyncFunction()).rejects.toThrow(BudgetExceededError);
});
```

**Mock assertion:**
```typescript
it('calls the dependency', async () => {
  await sut.doThing();
  expect(mockDependency).toHaveBeenCalledWith(expectedArg);
  expect(mockDependency).toHaveBeenCalledTimes(1);
});
```

**Snapshot/object matching:**
```typescript
expect(rubric[0]).toMatchObject({ name: 'goal_alignment', weight: 0.4 });
```

**Numeric precision:**
```typescript
expect(total).toBeCloseTo(1.0);
```

---

*Testing analysis: 2026-03-29*
