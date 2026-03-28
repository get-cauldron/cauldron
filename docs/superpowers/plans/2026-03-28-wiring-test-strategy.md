# Wiring Test Strategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "wiring test" tier that verifies real tRPC→engine→database integration with only the LLM gateway mocked, catching the class of bugs that unit tests miss.

**Architecture:** New `packages/test-harness/` workspace package provides shared helpers (test DB context, scripted gateway mock, data fixtures). Each package gets a `vitest.wiring.config.ts` that includes `*.wiring.test.ts` files. CI gets a new `wiring-tests` job between unit and integration tests.

**Tech Stack:** Vitest 4, PostgreSQL (test DB :5433), Drizzle ORM, tRPC 11 `createCaller`, existing `@get-cauldron/shared` test setup utilities.

---

## File Structure

```
packages/test-harness/                          # NEW package
  package.json
  tsconfig.json
  src/
    index.ts                                    # Re-exports all harnesses
    gateway.ts                                  # createScriptedGateway()
    fixtures.ts                                 # fixtures() data factory
    context.ts                                  # createTestContext() for tRPC caller
    scripts/
      interview-turn.ts                         # Pre-built gateway script for one interview turn

packages/web/
  vitest.wiring.config.ts                       # NEW vitest config for wiring tests
  src/trpc/routers/__tests__/
    interview.wiring.test.ts                    # NEW — Priority 1 interview wiring tests

packages/engine/
  vitest.wiring.config.ts                       # NEW vitest config for wiring tests

turbo.json                                      # MODIFY — add test:wiring task
package.json                                    # MODIFY — add test:wiring script
packages/web/package.json                       # MODIFY — add test:wiring script
packages/engine/package.json                    # MODIFY — add test:wiring script
.github/workflows/ci.yml                        # MODIFY — add wiring-tests job
```

---

### Task 1: Create `packages/test-harness/` package scaffold

**Files:**
- Create: `packages/test-harness/package.json`
- Create: `packages/test-harness/tsconfig.json`
- Create: `packages/test-harness/src/index.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@get-cauldron/test-harness",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@get-cauldron/shared": "workspace:*",
    "@get-cauldron/engine": "workspace:*",
    "@get-cauldron/web": "workspace:*",
    "@trpc/server": "11.15.1",
    "drizzle-orm": "^0.45.1",
    "postgres": "^3.4.8"
  },
  "devDependencies": {
    "@types/node": "^25.5.0",
    "typescript": "^6.0.2",
    "vitest": "^4.1.1"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["node"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create src/index.ts (empty re-export file)**

```typescript
export { createScriptedGateway } from './gateway.js';
export type { MockGatewayCall } from './gateway.js';
export { fixtures } from './fixtures.js';
export { createTestContext } from './context.js';
export type { TestContext } from './context.js';
export { interviewTurnScript } from './scripts/interview-turn.js';
```

Note: This file will fail to compile until the source files are created in subsequent tasks. That's expected.

- [ ] **Step 4: Install dependencies**

Run: `pnpm install`
Expected: lockfile updates, no errors. The new package is auto-detected by `pnpm-workspace.yaml`'s `packages/*` glob.

- [ ] **Step 5: Commit**

```bash
git add packages/test-harness/package.json packages/test-harness/tsconfig.json packages/test-harness/src/index.ts pnpm-lock.yaml
git commit -m "feat(test-harness): scaffold test-harness package"
```

---

### Task 2: Implement `createScriptedGateway()`

**Files:**
- Create: `packages/test-harness/src/gateway.ts`

This is the core mock that replaces `buildMockGateway()` from `fsm-sendAnswer.integration.test.ts` with a reusable, validating, scriptable version.

- [ ] **Step 1: Write the gateway mock**

```typescript
import type { LLMGateway } from '@get-cauldron/engine';
import { vi } from 'vitest';

/**
 * A single scripted response for gateway.generateObject().
 * Responses are consumed in order — first call gets script[0], second gets script[1], etc.
 */
export interface MockGatewayCall {
  /** Pipeline stage (e.g., 'interview', 'holdout'). Optional filter — if set, the call's stage must match. */
  stage?: string;
  /** Schema name filter. Optional — if set, the call's schemaName must match. */
  schema?: string;
  /** The object to return from generateObject(). Wrapped in { object: ... } automatically. */
  returns: unknown;
}

/**
 * Creates a mock LLMGateway that returns scripted responses in order.
 *
 * Features:
 * - Ordered: responses are consumed sequentially
 * - Validating: throws if an unexpected call is made after all scripts are consumed
 * - Exhaustion check: assertAllConsumed() verifies no responses were left unused
 *
 * Usage:
 *   const gateway = createScriptedGateway([
 *     { stage: 'interview', schema: 'scores', returns: { goalClarity: 0.6, ... } },
 *     { stage: 'interview', returns: { question: '...', rationale: '...' } },
 *   ]);
 */
export function createScriptedGateway(
  script: MockGatewayCall[],
): LLMGateway & { assertAllConsumed: () => void } {
  let callIndex = 0;
  const totalCalls = script.length;

  const generateObject = vi.fn().mockImplementation(async (options: { stage?: string; schemaName?: string }) => {
    if (callIndex >= totalCalls) {
      throw new Error(
        `MockGateway: unexpected call #${callIndex + 1} (only ${totalCalls} scripted). ` +
        `Stage: ${options.stage ?? 'unknown'}, schema: ${options.schemaName ?? 'unknown'}`,
      );
    }

    const entry = script[callIndex]!;

    // Validate stage filter if specified
    if (entry.stage && options.stage && entry.stage !== options.stage) {
      throw new Error(
        `MockGateway call #${callIndex + 1}: expected stage '${entry.stage}', got '${options.stage}'`,
      );
    }

    // Validate schema filter if specified
    if (entry.schema && options.schemaName && entry.schema !== options.schemaName) {
      throw new Error(
        `MockGateway call #${callIndex + 1}: expected schema '${entry.schema}', got '${options.schemaName}'`,
      );
    }

    callIndex++;
    return { object: entry.returns };
  });

  const assertAllConsumed = () => {
    if (callIndex < totalCalls) {
      throw new Error(
        `MockGateway: ${totalCalls - callIndex} scripted responses were not consumed ` +
        `(consumed ${callIndex} of ${totalCalls})`,
      );
    }
  };

  // Return a minimal mock that satisfies the LLMGateway interface for what tRPC routers use.
  // Only generateObject is used by interview/holdout flows.
  return {
    generateObject,
    generateText: vi.fn().mockRejectedValue(new Error('MockGateway: generateText not scripted')),
    streamText: vi.fn().mockRejectedValue(new Error('MockGateway: streamText not scripted')),
    streamObject: vi.fn().mockRejectedValue(new Error('MockGateway: streamObject not scripted')),
    assertAllConsumed,
  } as unknown as LLMGateway & { assertAllConsumed: () => void };
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/test-harness/src/gateway.ts
git commit -m "feat(test-harness): add createScriptedGateway with ordered validation"
```

---

### Task 3: Implement pre-built interview turn script

**Files:**
- Create: `packages/test-harness/src/scripts/interview-turn.ts`

This provides a ready-made gateway script for one complete interview turn (1 scorer + 3 perspectives + 1 ranker = 5 calls).

- [ ] **Step 1: Write the interview turn script factory**

```typescript
import type { MockGatewayCall } from '../gateway.js';

/**
 * Default mock ambiguity scores (below threshold).
 * Override `overallClarity` to control whether threshold is met.
 */
export interface InterviewTurnOptions {
  /** Overall clarity score (0-1). Default 0.5. Set >= 0.8 to trigger phase transition. */
  overallClarity?: number;
  /** Custom per-dimension scores. Defaults to overallClarity for all dimensions. */
  goalClarity?: number;
  constraintClarity?: number;
  successCriteriaClarity?: number;
}

/**
 * Builds a 5-call gateway script for one interview turn:
 *   1. scoreTranscript → ambiguity scores
 *   2-4. runActivePerspectives → 3 perspective candidates (researcher, simplifier, breadth-keeper)
 *   5. rankCandidates → selected index + MC options
 *
 * This matches the real call sequence in InterviewFSM.submitAnswer().
 */
export function interviewTurnScript(options?: InterviewTurnOptions): MockGatewayCall[] {
  const overall = options?.overallClarity ?? 0.5;
  const goalClarity = options?.goalClarity ?? overall;
  const constraintClarity = options?.constraintClarity ?? overall;
  const successCriteriaClarity = options?.successCriteriaClarity ?? overall;

  return [
    // Call 1: scorer
    {
      stage: 'interview',
      returns: {
        goalClarity,
        constraintClarity,
        successCriteriaClarity,
        reasoning: 'Mock scoring result for wiring test',
      },
    },
    // Call 2: researcher perspective
    {
      stage: 'interview',
      returns: {
        question: 'What is the primary goal of this project?',
        rationale: 'Exploring the core objective from a research perspective.',
      },
    },
    // Call 3: simplifier perspective
    {
      stage: 'interview',
      returns: {
        question: 'What is the simplest version of this that would be useful?',
        rationale: 'Identifying the MVP scope.',
      },
    },
    // Call 4: breadth-keeper perspective
    {
      stage: 'interview',
      returns: {
        question: 'What edge cases or error scenarios should we consider?',
        rationale: 'Ensuring breadth of requirement coverage.',
      },
    },
    // Call 5: ranker
    {
      stage: 'interview',
      returns: {
        selectedIndex: 0,
        mcOptions: [
          'Option A: Keep it simple',
          'Option B: Add more detail',
          'Option C: Explore alternatives',
        ],
        selectionRationale: 'This question best reduces ambiguity at this stage.',
      },
    },
  ];
}
```

- [ ] **Step 2: Create the scripts directory and commit**

```bash
git add packages/test-harness/src/scripts/interview-turn.ts
git commit -m "feat(test-harness): add pre-built interview turn gateway script"
```

---

### Task 4: Implement `fixtures()` data factory

**Files:**
- Create: `packages/test-harness/src/fixtures.ts`

- [ ] **Step 1: Write the fixtures factory**

```typescript
import { projects, interviews, seeds } from '@get-cauldron/shared';
import type { DbClient } from '@get-cauldron/shared';

/**
 * Test data factory for wiring tests.
 * Creates real database rows with sensible defaults.
 * Each method returns the inserted row.
 */
export function fixtures(db: DbClient) {
  return {
    /**
     * Create a project. Returns the full row.
     */
    async project(overrides?: { name?: string; description?: string }) {
      const [row] = await db
        .insert(projects)
        .values({
          name: overrides?.name ?? 'Test Project',
          description: overrides?.description ?? 'Created by test-harness fixtures',
        })
        .returning();
      return row!;
    },

    /**
     * Create an interview linked to a project.
     * Defaults to greenfield mode, gathering phase, empty transcript.
     */
    async interview(opts: {
      projectId: string;
      phase?: 'gathering' | 'reviewing' | 'approved' | 'crystallized';
      mode?: 'greenfield' | 'brownfield';
      turnCount?: number;
      transcript?: unknown[];
      currentAmbiguityScore?: unknown;
    }) {
      const [row] = await db
        .insert(interviews)
        .values({
          projectId: opts.projectId,
          mode: opts.mode ?? 'greenfield',
          phase: opts.phase ?? 'gathering',
          turnCount: opts.turnCount ?? 0,
          transcript: opts.transcript ?? [],
          currentAmbiguityScore: opts.currentAmbiguityScore ?? null,
        })
        .returning();
      return row!;
    },

    /**
     * Create a seed linked to a project and interview.
     * Defaults to crystallized status with placeholder summary fields.
     */
    async seed(opts: {
      projectId: string;
      interviewId: string;
      goal?: string;
      constraints?: unknown[];
      acceptanceCriteria?: unknown[];
      ontologySchema?: unknown;
      evaluationPrinciples?: unknown[];
      exitConditions?: unknown;
      ambiguityScore?: number;
      version?: number;
      parentId?: string;
    }) {
      const [row] = await db
        .insert(seeds)
        .values({
          projectId: opts.projectId,
          interviewId: opts.interviewId,
          parentId: opts.parentId ?? null,
          version: opts.version ?? 1,
          status: 'crystallized',
          goal: opts.goal ?? 'Test goal',
          constraints: opts.constraints ?? ['constraint-1'],
          acceptanceCriteria: opts.acceptanceCriteria ?? ['ac-1', 'ac-2'],
          ontologySchema: opts.ontologySchema ?? { entities: [] },
          evaluationPrinciples: opts.evaluationPrinciples ?? ['principle-1'],
          exitConditions: opts.exitConditions ?? [{ condition: 'done', description: 'done' }],
          ambiguityScore: opts.ambiguityScore ?? 0.85,
          crystallizedAt: new Date(),
        })
        .returning();
      return row!;
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/test-harness/src/fixtures.ts
git commit -m "feat(test-harness): add fixtures data factory for projects, interviews, seeds"
```

---

### Task 5: Implement `createTestContext()` — tRPC test caller

**Files:**
- Create: `packages/test-harness/src/context.ts`

This is the key harness that wires a real tRPC caller to a real test DB with a mock gateway.

- [ ] **Step 1: Write the test context factory**

```typescript
import { createTestDb, runMigrations, truncateAll } from '@get-cauldron/shared/../../src/db/__tests__/setup.js';
import { appRouter } from '@get-cauldron/web/src/trpc/router.js';
import { createScriptedGateway } from './gateway.js';
import { fixtures } from './fixtures.js';
import type { MockGatewayCall } from './gateway.js';
import type { LLMGateway } from '@get-cauldron/engine';

// Re-export the shared setup helpers so wiring tests don't need to import from shared internals
export { createTestDb, runMigrations, truncateAll };

export interface TestContext {
  /** tRPC caller — call procedures directly: ctx.caller.interview.sendAnswer(...) */
  caller: ReturnType<typeof appRouter.createCaller>;
  /** Direct DB access for assertions */
  db: ReturnType<typeof createTestDb>['db'];
  /** Data factory */
  fixtures: ReturnType<typeof fixtures>;
  /** The mock gateway instance — use gateway.assertAllConsumed() in afterEach */
  gateway: LLMGateway & { assertAllConsumed: () => void };
  /** Truncate all tables (call in afterEach) */
  truncate: () => Promise<void>;
  /** Close DB connection (call in afterAll) */
  cleanup: () => Promise<void>;
}

export interface TestContextOptions {
  /** Gateway script for this test context. Can be replaced per-test by creating a new context. */
  gatewayScript?: MockGatewayCall[];
}

/**
 * Creates a full tRPC test context with:
 * - Real PostgreSQL test database (port 5433)
 * - Real tRPC router + real engine code
 * - Mocked LLM gateway (scripted responses)
 * - Data fixtures for setup
 *
 * Usage:
 *   let ctx: TestContext;
 *   beforeAll(async () => { ctx = await createTestContext({ gatewayScript: [...] }); });
 *   afterEach(async () => { await ctx.truncate(); });
 *   afterAll(async () => { await ctx.cleanup(); });
 */
export async function createTestContext(
  options?: TestContextOptions,
): Promise<TestContext> {
  const testDb = createTestDb();
  await runMigrations(testDb.db);

  const gateway = createScriptedGateway(options?.gatewayScript ?? []);

  // Mock config matching the pattern from fsm-sendAnswer.integration.test.ts
  const mockConfig = {
    models: {
      interview: ['test-model'],
      holdout: ['test-holdout-model'],
      implementation: ['test-impl-model'],
      evaluation: ['test-eval-model'],
      decomposition: ['test-decomp-model'],
      context_assembly: ['test-model'],
      conflict_resolution: ['test-model'],
    },
    budget: { defaultLimitCents: 1000 },
  };

  const mockLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    trace: () => {},
    fatal: () => {},
    child: () => mockLogger,
  };

  // Create a tRPC caller with real DB but mock engine deps
  const caller = appRouter.createCaller({
    db: testDb.db as any,
    authenticated: true,
    getEngineDeps: async () => ({
      gateway: gateway as unknown as LLMGateway,
      config: mockConfig as any,
      logger: mockLogger as any,
    }),
  });

  const fix = fixtures(testDb.db as any);

  return {
    caller,
    db: testDb.db,
    fixtures: fix,
    gateway,
    truncate: () => truncateAll(testDb.db),
    cleanup: async () => {
      await truncateAll(testDb.db);
      await testDb.client.end();
    },
  };
}
```

- [ ] **Step 2: Verify the index.ts re-exports compile**

Run: `cd /Users/zakkeown/Code/cauldron && pnpm -F @get-cauldron/test-harness build`
Expected: Build succeeds (or acceptable type errors that will resolve once consumers are wired).

Note: If `createTestDb` import path doesn't resolve (since it's importing from `shared`'s internal test setup), you may need to adjust the import. The shared package's `setup.ts` is at `packages/shared/src/db/__tests__/setup.ts`. Since test-harness depends on `@get-cauldron/shared`, the import should use a relative workspace path. If the build fails on this import, change the approach: **copy the three helper functions** (`createTestDb`, `runMigrations`, `truncateAll`) into `context.ts` directly. They're only 20 lines total and this avoids cross-package internal imports.

- [ ] **Step 3: Commit**

```bash
git add packages/test-harness/src/context.ts
git commit -m "feat(test-harness): add createTestContext with real DB + mock gateway tRPC caller"
```

---

### Task 6: Add vitest wiring configs and package scripts

**Files:**
- Create: `packages/web/vitest.wiring.config.ts`
- Create: `packages/engine/vitest.wiring.config.ts`
- Modify: `packages/web/package.json` — add `test:wiring` script
- Modify: `packages/engine/package.json` — add `test:wiring` script
- Modify: `package.json` (root) — add `test:wiring` script
- Modify: `turbo.json` — add `test:wiring` task

- [ ] **Step 1: Create `packages/web/vitest.wiring.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

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
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

- [ ] **Step 2: Create `packages/engine/vitest.wiring.config.ts`**

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

- [ ] **Step 3: Add `test:wiring` script to `packages/web/package.json`**

Add to `scripts` object:
```json
"test:wiring": "vitest run --config vitest.wiring.config.ts"
```

- [ ] **Step 4: Add `test:wiring` script to `packages/engine/package.json`**

Add to `scripts` object:
```json
"test:wiring": "vitest run --config vitest.wiring.config.ts"
```

- [ ] **Step 5: Add `test:wiring` to root `package.json`**

Add to `scripts` object:
```json
"test:wiring": "turbo test:wiring"
```

- [ ] **Step 6: Add `test:wiring` task to `turbo.json`**

Add to the `tasks` object, after the existing `test:integration` entry:
```json
"test:wiring": {
  "dependsOn": ["^build"],
  "cache": false
}
```

- [ ] **Step 7: Verify turbo recognizes the new task**

Run: `pnpm test:wiring`
Expected: Runs vitest for both web and engine packages. Should report 0 tests found (no `*.wiring.test.ts` files exist yet). This confirms the plumbing works.

- [ ] **Step 8: Commit**

```bash
git add packages/web/vitest.wiring.config.ts packages/engine/vitest.wiring.config.ts packages/web/package.json packages/engine/package.json package.json turbo.json
git commit -m "feat: add vitest wiring test configs and turbo task"
```

---

### Task 7: Write Priority 1 interview wiring tests — startInterview + sendAnswer

**Files:**
- Create: `packages/web/src/trpc/routers/__tests__/interview.wiring.test.ts`

This is the most important task — it tests the exact flow that broke during manual testing.

- [ ] **Step 1: Write the wiring test file**

```typescript
/**
 * Interview router wiring tests.
 *
 * Real PostgreSQL (test DB :5433) + real engine code + mocked LLM gateway.
 * Tests the full tRPC → engine → database chain.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { createTestContext, type TestContext } from '@get-cauldron/test-harness';
import { interviewTurnScript } from '@get-cauldron/test-harness';
import { eq } from 'drizzle-orm';
import { interviews } from '@get-cauldron/shared';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Creates a test context with enough gateway script for N interview turns.
 * Each turn consumes 5 gateway calls (1 scorer + 3 perspectives + 1 ranker).
 */
async function contextForTurns(
  turnCount: number,
  options?: { lastTurnClarity?: number },
): Promise<TestContext> {
  const script = [];
  for (let i = 0; i < turnCount; i++) {
    const isLast = i === turnCount - 1;
    const clarity = isLast && options?.lastTurnClarity !== undefined
      ? options.lastTurnClarity
      : 0.5;
    script.push(...interviewTurnScript({ overallClarity: clarity }));
  }
  return createTestContext({ gatewayScript: script });
}

// ─── startInterview ───────────────────────────────────────────────────────────

describe('interview.startInterview wiring', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await ctx.truncate();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('creates a new interview row and returns valid state', async () => {
    const project = await ctx.fixtures.project();

    const result = await ctx.caller.interview.startInterview({
      projectId: project.id,
    });

    expect(result.interviewId).toBeDefined();
    expect(typeof result.interviewId).toBe('string');
    expect(result.status).toBe('active');
    expect(result.phase).toBe('gathering');
    expect(result.mode).toBe('greenfield');

    // Verify DB row exists
    const [dbRow] = await ctx.db
      .select()
      .from(interviews)
      .where(eq(interviews.id, result.interviewId));

    expect(dbRow).toBeDefined();
    expect(dbRow!.projectId).toBe(project.id);
    expect(dbRow!.phase).toBe('gathering');
    expect(dbRow!.turnCount).toBe(0);
  });

  it('resumes an existing active interview', async () => {
    const project = await ctx.fixtures.project();

    const first = await ctx.caller.interview.startInterview({
      projectId: project.id,
    });
    const second = await ctx.caller.interview.startInterview({
      projectId: project.id,
    });

    expect(second.interviewId).toBe(first.interviewId);
  });
});

// ─── sendAnswer ───────────────────────────────────────────────────────────────

describe('interview.sendAnswer wiring', () => {
  let ctx: TestContext;

  afterEach(async () => {
    if (ctx) await ctx.truncate();
  });

  afterAll(async () => {
    if (ctx) await ctx.cleanup();
  });

  it('appends turn to transcript and updates scores', async () => {
    ctx = await contextForTurns(1);
    const project = await ctx.fixtures.project();
    await ctx.caller.interview.startInterview({ projectId: project.id });

    const result = await ctx.caller.interview.sendAnswer({
      projectId: project.id,
      answer: 'Build a task management CLI tool',
    });

    expect(result.turnNumber).toBe(1);
    expect(result.currentScores).toBeDefined();
    expect(typeof result.currentScores.goalClarity).toBe('number');
    expect(typeof result.currentScores.overall).toBe('number');
    expect(result.thresholdMet).toBe(false);
    expect(result.phase).toBe('gathering');
    expect(result.nextQuestion).toBeDefined();
    expect(result.turn).toBeDefined();

    // Verify DB state
    const [dbRow] = await ctx.db
      .select()
      .from(interviews)
      .where(eq(interviews.projectId, project.id));

    expect(dbRow!.turnCount).toBe(1);
    expect((dbRow!.transcript as unknown[]).length).toBe(1);
    expect(dbRow!.currentAmbiguityScore).not.toBeNull();

    ctx.gateway.assertAllConsumed();
  });

  it('auto-transitions to reviewing when clarity >= 0.8', async () => {
    ctx = await contextForTurns(1, { lastTurnClarity: 0.9 });
    const project = await ctx.fixtures.project();
    await ctx.caller.interview.startInterview({ projectId: project.id });

    const result = await ctx.caller.interview.sendAnswer({
      projectId: project.id,
      answer: 'A TypeScript CLI that renames files using regex patterns, runs on macOS/Linux, must handle 10k files in under 5 seconds',
    });

    expect(result.thresholdMet).toBe(true);
    expect(result.phase).toBe('reviewing');
    expect(result.nextQuestion).toBeNull();

    // Verify DB phase transition
    const [dbRow] = await ctx.db
      .select()
      .from(interviews)
      .where(eq(interviews.projectId, project.id));

    expect(dbRow!.phase).toBe('reviewing');
  });

  it('rejects sendAnswer when interview is not in gathering phase', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    // Create interview already in reviewing phase
    await ctx.fixtures.interview({
      projectId: project.id,
      phase: 'reviewing',
    });

    await expect(
      ctx.caller.interview.sendAnswer({
        projectId: project.id,
        answer: 'This should fail',
      }),
    ).rejects.toThrow(/gathering/);
  });

  it('builds coherent transcript across multiple turns', async () => {
    ctx = await contextForTurns(3);
    const project = await ctx.fixtures.project();
    await ctx.caller.interview.startInterview({ projectId: project.id });

    await ctx.caller.interview.sendAnswer({
      projectId: project.id,
      answer: 'Build a file renamer',
    });
    await ctx.caller.interview.sendAnswer({
      projectId: project.id,
      answer: 'It should support regex patterns',
    });
    await ctx.caller.interview.sendAnswer({
      projectId: project.id,
      answer: 'Needs to run on macOS and Linux',
    });

    // Verify accumulated state
    const [dbRow] = await ctx.db
      .select()
      .from(interviews)
      .where(eq(interviews.projectId, project.id));

    expect(dbRow!.turnCount).toBe(3);
    expect((dbRow!.transcript as unknown[]).length).toBe(3);

    ctx.gateway.assertAllConsumed();
  });
});

// ─── getTranscript ────────────────────────────────────────────────────────────

describe('interview.getTranscript wiring', () => {
  let ctx: TestContext;

  afterEach(async () => {
    if (ctx) await ctx.truncate();
  });

  afterAll(async () => {
    if (ctx) await ctx.cleanup();
  });

  it('returns not_started when no interview exists', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();

    const result = await ctx.caller.interview.getTranscript({
      projectId: project.id,
    });

    expect(result.status).toBe('not_started');
    expect(result.transcript).toEqual([]);
    expect(result.currentScores).toBeNull();
  });

  it('returns data consistent with what sendAnswer wrote', async () => {
    ctx = await contextForTurns(1);
    const project = await ctx.fixtures.project();
    await ctx.caller.interview.startInterview({ projectId: project.id });

    const sendResult = await ctx.caller.interview.sendAnswer({
      projectId: project.id,
      answer: 'Build a todo app',
    });

    const transcript = await ctx.caller.interview.getTranscript({
      projectId: project.id,
    });

    expect(transcript.status).toBe('active');
    expect(transcript.phase).toBe('gathering');
    expect(transcript.transcript.length).toBe(1);
    expect(transcript.currentScores).toBeDefined();
    expect(transcript.currentScores!.overall).toBe(sendResult.currentScores.overall);
  });
});

// ─── getSummary ───────────────────────────────────────────────────────────────

describe('interview.getSummary wiring', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await ctx.truncate();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('returns null summary during gathering phase', async () => {
    const project = await ctx.fixtures.project();
    await ctx.fixtures.interview({ projectId: project.id, phase: 'gathering' });

    const result = await ctx.caller.interview.getSummary({
      projectId: project.id,
    });

    expect(result.summary).toBeNull();
    expect(result.phase).toBe('gathering');
  });

  it('returns seed data when interview is in approved phase', async () => {
    const project = await ctx.fixtures.project();
    const interview = await ctx.fixtures.interview({
      projectId: project.id,
      phase: 'approved',
    });
    await ctx.fixtures.seed({
      projectId: project.id,
      interviewId: interview.id,
      goal: 'Build a task manager',
    });

    const result = await ctx.caller.interview.getSummary({
      projectId: project.id,
    });

    expect(result.summary).toBeDefined();
    expect(result.summary!.goal).toBe('Build a task manager');
    expect(result.phase).toBe('approved');
  });
});
```

- [ ] **Step 2: Verify Docker Postgres is running**

Run: `docker compose ps`
Expected: `postgres-test` container is running on port 5433.

If not running, start it: `docker compose up -d postgres-test`

- [ ] **Step 3: Run the wiring tests**

Run: `pnpm -F @get-cauldron/web test:wiring`
Expected: Tests run against real DB. Some may fail — that's the point. These are the bugs that manual testing found.

- [ ] **Step 4: Fix any import resolution issues**

If `@get-cauldron/test-harness` doesn't resolve, check:
1. `pnpm install` was run after creating the package
2. The web package doesn't list `@get-cauldron/test-harness` as a dependency yet

Add to `packages/web/package.json` devDependencies:
```json
"@get-cauldron/test-harness": "workspace:*"
```

Then re-run: `pnpm install && pnpm -F @get-cauldron/web test:wiring`

- [ ] **Step 5: Commit (even if some tests fail — failing tests are the bugs we're finding)**

```bash
git add packages/web/src/trpc/routers/__tests__/interview.wiring.test.ts packages/web/package.json pnpm-lock.yaml
git commit -m "test: add Priority 1 interview wiring tests (startInterview, sendAnswer, getTranscript, getSummary)"
```

---

### Task 8: Write Priority 2 crystallization wiring tests

**Files:**
- Modify: `packages/web/src/trpc/routers/__tests__/interview.wiring.test.ts` — add crystallization tests

- [ ] **Step 1: Add crystallization test block to the wiring test file**

Append to the end of `interview.wiring.test.ts`:

```typescript
// ─── approveSummary (crystallization) ────────────────────────��────────────────

describe('interview.approveSummary wiring', () => {
  let ctx: TestContext;

  afterEach(async () => {
    if (ctx) await ctx.truncate();
  });

  afterAll(async () => {
    if (ctx) await ctx.cleanup();
  });

  const mockSummary = {
    goal: 'Build a task management CLI',
    constraints: ['Must run on Node 22', 'No external DB'],
    acceptanceCriteria: ['Can create tasks', 'Can list tasks', 'Can complete tasks'],
    ontologySchema: {
      entities: [
        { name: 'Task', attributes: ['id', 'title', 'status'], relations: [] },
      ],
    },
    evaluationPrinciples: ['Correctness over performance'],
    exitConditions: [{ condition: 'all_ac_pass', description: 'All acceptance criteria pass' }],
  };

  it('creates seed record and transitions interview to crystallized', async () => {
    // Gateway script: holdout generation needs generateObject calls too
    // approveSummary calls crystallizeSeed (no LLM) then generateHoldoutScenarios (1 LLM call)
    const holdoutScript: MockGatewayCall[] = [
      {
        stage: 'holdout',
        returns: {
          scenarios: Array.from({ length: 5 }, (_, i) => ({
            id: `scenario-${i}`,
            name: `Test scenario ${i + 1}`,
            description: `Given X, when Y, then Z (scenario ${i + 1})`,
            testCode: `expect(true).toBe(true); // scenario ${i + 1}`,
          })),
        },
      },
    ];
    ctx = await createTestContext({ gatewayScript: holdoutScript });

    const project = await ctx.fixtures.project();
    const interview = await ctx.fixtures.interview({
      projectId: project.id,
      phase: 'reviewing',
      currentAmbiguityScore: { goalClarity: 0.9, constraintClarity: 0.85, successCriteriaClarity: 0.88, overall: 0.88, reasoning: 'Clear' },
    });

    const result = await ctx.caller.interview.approveSummary({
      projectId: project.id,
      summary: mockSummary,
    });

    expect(result.seedId).toBeDefined();
    expect(result.version).toBe(1);

    // Verify interview transitioned
    const [dbInterview] = await ctx.db
      .select()
      .from(interviews)
      .where(eq(interviews.id, interview.id));

    expect(dbInterview!.phase).toBe('crystallized');
    expect(dbInterview!.status).toBe('completed');
  });

  it('rejects if interview is not in reviewing phase', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    await ctx.fixtures.interview({
      projectId: project.id,
      phase: 'gathering',
    });

    await expect(
      ctx.caller.interview.approveSummary({
        projectId: project.id,
        summary: mockSummary,
      }),
    ).rejects.toThrow(/reviewing/);
  });

  it('throws CONFLICT on double crystallization', async () => {
    const holdoutScript: MockGatewayCall[] = [
      {
        stage: 'holdout',
        returns: {
          scenarios: Array.from({ length: 5 }, (_, i) => ({
            id: `scenario-${i}`,
            name: `Scenario ${i + 1}`,
            description: `Test ${i + 1}`,
            testCode: `expect(1).toBe(1);`,
          })),
        },
      },
    ];
    ctx = await createTestContext({ gatewayScript: holdoutScript });

    const project = await ctx.fixtures.project();
    await ctx.fixtures.interview({
      projectId: project.id,
      phase: 'reviewing',
      currentAmbiguityScore: { overall: 0.88 },
    });

    // First crystallization succeeds
    await ctx.caller.interview.approveSummary({
      projectId: project.id,
      summary: mockSummary,
    });

    // Second should fail — but interview is now crystallized, so the phase guard catches it
    await expect(
      ctx.caller.interview.approveSummary({
        projectId: project.id,
        summary: mockSummary,
      }),
    ).rejects.toThrow();
  });
});

// ─── rejectSummary ────────────────────────────────────────────────────────────

describe('interview.rejectSummary wiring', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await ctx.truncate();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('transitions interview back to gathering', async () => {
    const project = await ctx.fixtures.project();
    const interview = await ctx.fixtures.interview({
      projectId: project.id,
      phase: 'reviewing',
    });

    const result = await ctx.caller.interview.rejectSummary({
      projectId: project.id,
    });

    expect(result.phase).toBe('gathering');

    // Verify DB
    const [dbRow] = await ctx.db
      .select()
      .from(interviews)
      .where(eq(interviews.id, interview.id));

    expect(dbRow!.phase).toBe('gathering');
  });
});
```

You will also need to add this import at the top of the file:
```typescript
import type { MockGatewayCall } from '@get-cauldron/test-harness';
```

- [ ] **Step 2: Run the tests**

Run: `pnpm -F @get-cauldron/web test:wiring`
Expected: Priority 1 and 2 tests run. Crystallization tests exercise the full approveSummary → crystallizeSeed → holdout generation chain.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/trpc/routers/__tests__/interview.wiring.test.ts
git commit -m "test: add Priority 2 crystallization wiring tests (approveSummary, rejectSummary)"
```

---

### Task 9: Update CI pipeline with wiring-tests job

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add wiring-tests job**

Insert after the `unit-tests` job block and before the `integration-tests` job block:

```yaml
  wiring-tests:
    runs-on: ubuntu-latest
    needs: lint-typecheck-build
    services:
      postgres-test:
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
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: latest
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - name: Wiring tests
        run: pnpm test:wiring
        env:
          TEST_DATABASE_URL: postgres://cauldron:cauldron@localhost:5433/cauldron_test
          DATABASE_URL: postgres://cauldron:cauldron@localhost:5433/cauldron_test
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add wiring-tests job between unit and integration tests"
```

---

### Task 10: Run full regression and fix any failures

**Files:**
- Potentially modify any file from Tasks 1-9

- [ ] **Step 1: Run typecheck**

Run: `pnpm typecheck`
Expected: No new type errors introduced by test-harness or wiring tests.

- [ ] **Step 2: Run existing unit tests**

Run: `pnpm test`
Expected: All existing unit tests still pass.

- [ ] **Step 3: Run wiring tests**

Run: `pnpm test:wiring`
Expected: Wiring tests run. **Failures here are expected** — they are the real bugs. Document which tests fail and with what errors.

- [ ] **Step 4: Run build**

Run: `pnpm build`
Expected: Build succeeds.

- [ ] **Step 5: Triage wiring test failures**

For each failing test, determine:
- Is it a test harness bug (wrong mock setup, bad import)?
- Is it a real application bug (the code path is broken)?

Fix harness bugs immediately. For application bugs: **RCA and fix, do not log and move on.** Each failing wiring test exists because real code is broken — trace the failure to the root cause in the application code, fix it, verify the test passes, and commit.

- [ ] **Step 6: For each application bug found, RCA and fix**

For each failing test:
1. Read the error message and stack trace
2. Trace to the source file causing the failure
3. Fix the root cause in the application code
4. Re-run the specific test to confirm it passes
5. Re-run the full wiring suite to check for regressions
6. Commit the fix with a descriptive message:

```bash
git add <fixed-files>
git commit -m "fix(<package>): <description of root cause and fix>"
```

- [ ] **Step 7: Final regression after all fixes**

Run: `pnpm typecheck && pnpm build && pnpm test && pnpm test:wiring`
Expected: All tests pass — unit, wiring, and build.

- [ ] **Step 8: Commit any remaining harness adjustments**

```bash
git add -A
git commit -m "fix: resolve wiring test harness issues found during regression"
```

---

## Dependency Order

```
Task 1 (scaffold)
  → Task 2 (gateway mock)
  → Task 3 (interview script)
  → Task 4 (fixtures)
  → Task 5 (test context)      ← depends on 2, 3, 4
  → Task 6 (vitest configs)
  → Task 7 (P1 interview tests) ← depends on 5, 6
  → Task 8 (P2 crystallization) ← depends on 7
  → Task 9 (CI update)          ← independent of 7, 8
  → Task 10 (regression)        ← depends on all
```

Tasks 6 and 9 can run in parallel with other tasks once their dependencies are met.
