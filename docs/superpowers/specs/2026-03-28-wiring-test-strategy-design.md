# Wiring Test Strategy Design

**Date:** 2026-03-28
**Status:** Approved
**Problem:** Manual testing of the interview flow (Web UI) revealed a mix of hard errors and soft failures. The existing test suite (~87 files) passes but doesn't catch real integration bugs because unit tests mock every boundary. The critical "wiring" between layers — React component to tRPC router to engine to database — has never been verified with real implementations.

**Prior art:** `fsm-sendAnswer.integration.test.ts` already proves the pattern — real DB + mocked LLM gateway — and has caught real bugs. This design scales that pattern to every boundary in the pipeline.

---

## 1. Three-Tier Testing Architecture

### Tier 1: Unit Tests (existing, unchanged)

- Pure logic: scoring math, FSM transition rules, schema validation, crypto operations
- Full mocking is appropriate — these test algorithms, not wiring
- Convention: `*.test.ts`
- Runner: `vitest run`

### Tier 2: Wiring Tests (new — this is the gap)

- **Real PostgreSQL** (test DB on :5433, same Docker instance used by integration tests)
- **Real engine code** (FSM, crystallizer, synthesizer, event store, etc.)
- **Real tRPC routers** (called programmatically via `createCaller`, no HTTP server)
- **Mocked only at the LLM boundary** (`gateway.generateObject` returns scripted responses)
- Tests the full chain: tRPC procedure -> engine -> database -> response
- Convention: `*.wiring.test.ts`
- Runner: `vitest run --config vitest.wiring.config.ts`

### Tier 3: E2E Tests (existing, expand later)

- Playwright against running app (localhost:3000)
- Real everything except LLM
- Validates UI rendering, navigation, SSE delivery, accessibility
- Convention: `*.spec.ts` in `e2e/`
- Runner: `playwright test`

### Why Wiring Tests Are the Missing Tier

Unit tests mock the layers they depend on, so each layer "passes" in isolation. E2E tests are slow and hard to debug — you know *something* is broken but not *where*. Wiring tests are fast (no browser, no HTTP), precise (test one boundary at a time), and catch the exact class of bugs that manual testing found: real code that doesn't connect properly.

---

## 2. Shared Test Harnesses

All harnesses live in a new `packages/test-harness/` internal workspace package (not published). This gives every package's wiring tests access to the same setup utilities.

### Harness A: `createTestContext()` — tRPC Test Client

Returns a real tRPC caller wired to a real test database and a mock gateway:

```typescript
createTestContext(options?: {
  gatewayScript?: MockGatewayCall[];
}): Promise<{
  caller: ReturnType<typeof appRouter.createCaller>;
  db: DrizzleClient;
  cleanup: () => Promise<void>;
}>
```

**Implementation details:**
- Reuses the existing `createTestDb()` + `runMigrations()` from `packages/shared/src/db/__tests__/setup.ts`
- Injects a mock `getEngineDeps()` into the tRPC context that returns real engine classes but with a scripted mock gateway
- Returns a tRPC `createCaller` instance — tests call `caller.interview.sendAnswer(...)` directly (no HTTP)
- `cleanup()` runs `truncateAll(db)` then closes the client

**Usage pattern:**
```typescript
let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext({
    gatewayScript: [
      { stage: 'interview', schema: 'scores', returns: mockScores },
      { stage: 'interview', schema: 'perspective', returns: mockQuestion },
    ],
  });
});

afterEach(() => ctx.truncate());
afterAll(() => ctx.cleanup());

it('sendAnswer appends to transcript', async () => {
  const project = await ctx.fixtures.project();
  const interview = await ctx.fixtures.interview({ projectId: project.id });
  const result = await ctx.caller.interview.sendAnswer({
    projectId: project.id,
    answer: 'Build a task manager',
  });
  expect(result.turn.turnNumber).toBe(1);
});
```

### Harness B: `MockGatewayScript` — Scripted LLM Responses

Generalizes the existing `buildMockGateway()` pattern from `fsm-sendAnswer.integration.test.ts` into a reusable, scriptable mock:

```typescript
interface MockGatewayCall {
  stage: string;          // e.g., 'interview', 'holdout', 'decomposition'
  schema?: string;        // optional filter by schemaName
  returns: unknown;       // the response object
}

createScriptedGateway(script: MockGatewayCall[]): LLMGateway
```

**Behavior:**
- **Ordered:** Returns responses in sequence, matching the real call pattern
- **Validating:** Fails the test with a clear error if an unexpected `generateObject` call is made
- **Exhaustion check:** Provides `gateway.assertAllConsumed()` to verify no scripted responses were left unused
- **Flexible:** Same mock works for interview scoring, perspective generation, crystallization, holdout generation — just different scripts

### Harness C: `TestFixtures` — Data Factories

Extends the existing `createTestProject()` / `createTestInterview()` helpers into a fluent fixture builder:

```typescript
interface Fixtures {
  project(overrides?: Partial<Project>): Promise<Project>;
  interview(opts: {
    projectId: string;
    phase?: InterviewPhase;
    turnCount?: number;
    transcript?: InterviewTurn[];
    scores?: AmbiguityScores;
  }): Promise<Interview>;
  seed(opts: {
    projectId: string;
    interviewId: string;
    summary?: SeedSummary;
  }): Promise<Seed>;
  beadDAG(opts: {
    seedId: string;
    beads: BeadSpec[];
    edges: EdgeSpec[];
  }): Promise<{ beads: Bead[]; edges: BeadEdge[] }>;
}

fixtures(db: DrizzleClient): Fixtures
```

This lets tests start from any point in the pipeline without replaying the entire flow. Want to test crystallization? Start with a fixture that has `phase: 'reviewing'` and a populated transcript.

### Package Structure

```
packages/test-harness/
  package.json          # @get-cauldron/test-harness, workspace dependency
  tsconfig.json
  src/
    index.ts            # Re-exports all harnesses
    context.ts          # createTestContext()
    gateway.ts          # createScriptedGateway()
    fixtures.ts         # fixtures()
    scripts/            # Pre-built gateway scripts for common flows
      interview-flow.ts # Score + 3 perspectives + ranker for one turn
      crystallize-flow.ts
      holdout-flow.ts
```

---

## 3. Wiring Test Coverage Map

### Priority 1: Interview Stage (what's broken now)

| Test | Chain Verified |
|------|---------------|
| `startInterview` creates DB row and returns valid state | tRPC -> FSM -> DB INSERT -> response |
| `sendAnswer` appends to transcript and updates scores | tRPC -> FSM -> scoring (mocked LLM) -> DB UPDATE -> response |
| `sendAnswer` auto-transitions to `reviewing` at clarity >= 0.8 | Phase FSM transition triggered by score data |
| `sendAnswer` rejects when `phase !== 'gathering'` | Guard clause checked against real DB state |
| Multiple `sendAnswer` calls build coherent transcript | Accumulation across turns, score history growth |
| `getTranscript` returns data matching what `sendAnswer` wrote | Read-after-write consistency |
| `getSummary` returns null during `gathering`, data during `reviewing` | Phase-gated query behavior |

### Priority 2: Crystallization Stage

| Test | Chain Verified |
|------|---------------|
| `approveSummary` creates seed record and transitions phase | tRPC -> crystallizer -> DB INSERT (seed) + UPDATE (interview) |
| `approveSummary` rejects if not in `reviewing` phase | Guard checked against real DB state |
| Double-crystallize throws `ImmutableSeedError` | Idempotency guard with real unique constraints |
| `rejectSummary` transitions back to `gathering` | Phase rollback through real DB |

### Priority 3: Holdout Stage

| Test | Chain Verified |
|------|---------------|
| `approveSummary` triggers holdout scenario generation | Crystallize -> holdout pipeline wiring |
| `getHoldouts` returns flattened scenarios matching generated data | Read-after-write through vault table |
| `approveHoldout` / `rejectHoldout` update vault status | Status transitions with real DB constraints |
| `sealHoldouts` encrypts and seals all approved entries | Full AES-256-GCM crypto pipeline against real vault rows |

### Priority 4: Downstream Stages

| Test | Chain Verified |
|------|---------------|
| Decomposition: seed -> bead DAG creation | Engine creates beads + bead_edges from seed spec |
| Execution: bead claiming with concurrent contention | Row-level locking under concurrent claims |
| Evolution: seed lineage recursive CTE | `getSeedLineage` returns correct ancestor chain |

### Priority 5: Web-Specific Wiring

| Test | Chain Verified |
|------|---------------|
| SSE endpoint delivers events after DB NOTIFY | Real event insertion -> SSE stream output |
| Interview page data flow (component-level) | Component mount -> tRPC call -> rendered state |

**Total: ~25 wiring tests** across 5 priority levels.

---

## 4. Test Runner Configuration

### New Vitest Config: `vitest.wiring.config.ts`

Each package with wiring tests gets this config:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.wiring.test.ts'],
    pool: 'forks',
    poolOptions: { forks: { maxForks: 1 } },
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      DATABASE_URL:
        process.env['TEST_DATABASE_URL'] ??
        'postgres://cauldron:cauldron@localhost:5433/cauldron_test',
    },
  },
});
```

### Package Scripts

Each package adds:
```json
"test:wiring": "vitest run --config vitest.wiring.config.ts"
```

Root `package.json` adds:
```json
"test:wiring": "turbo test:wiring"
```

### File Naming Convention

```
*.test.ts           -> unit tests (existing)
*.wiring.test.ts    -> wiring tests (new)
*.integration.test.ts -> integration tests (existing)
*.spec.ts           -> E2E / Playwright (existing)
```

---

## 5. CI Pipeline Update

Current pipeline:
```
lint-typecheck-build -> unit-tests -> integration-tests -> e2e-tests
```

Updated pipeline:
```
lint-typecheck-build
  -> unit-tests
  -> wiring-tests (new, needs: unit-tests, Docker Postgres :5433)
  -> integration-tests
  -> e2e-tests
```

The `wiring-tests` job uses the same Docker Postgres service as `integration-tests` (port 5433, same credentials). No new infrastructure.

### CI Job Definition (GitHub Actions)

```yaml
wiring-tests:
  needs: lint-typecheck-build
  runs-on: ubuntu-latest
  services:
    postgres:
      image: postgres:16
      env:
        POSTGRES_USER: cauldron
        POSTGRES_PASSWORD: cauldron
        POSTGRES_DB: cauldron_test
      ports:
        - 5433:5432
      options: >-
        --health-cmd pg_isready
        --health-interval 10s
        --health-timeout 5s
        --health-retries 5
  env:
    TEST_DATABASE_URL: postgres://cauldron:cauldron@localhost:5433/cauldron_test
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 22
        cache: pnpm
    - run: pnpm install --frozen-lockfile
    - run: pnpm build
    - run: pnpm test:wiring
```

---

## 6. Local Development Workflow

```bash
# Existing infrastructure — no changes needed
docker compose up -d          # Postgres :5432 (dev), :5433 (test), Redis :6379

# Run wiring tests
pnpm test:wiring              # All packages
pnpm -F @get-cauldron/web test:wiring    # Single package

# Full regression (what CI runs)
pnpm typecheck && pnpm build && pnpm test && pnpm test:wiring && pnpm test:integration
```

---

## 7. Acknowledged Out-of-Scope

- **Real LLM smoke tests** — The gateway mock is the LLM boundary. A future "integration with real API keys" suite could be added but is not part of this design.
- **Performance / load testing** — This strategy is about correctness, not throughput.
- **CLI wiring tests** — Deferred. The CLI calls the same engine code tested here. Once engine wiring is solid, CLI is a thin layer on top.
- **Visual regression** — Playwright screenshots exist and are not being expanded here.
- **Component-level integration** (React + real tRPC) — Listed as Priority 5. Deferred until Priority 1-3 are stable.
