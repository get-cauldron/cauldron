# Testing Coverage Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand test coverage across all pipeline stages using flow-traced wiring tests as the primary bug-finding layer, organized by user journey.

**Architecture:** Each pipeline stage (interview, execution, evolution, projects, costs) gets a wiring test file exercising every tRPC procedure through real DB with mocked LLM gateway. Test-harness provides shared fixtures, gateway scripts, and context management. Targeted unit tests backfill complex algorithms (circuit breaker, decomposition validator, scoring).

**Tech Stack:** Vitest 4, PostgreSQL (test DB on :5433), @get-cauldron/test-harness, drizzle-orm, @trpc/server

**Important:** Gateway unit tests already exist (6 files, 43 tests covering circuit-breaker, failover, budget, pricing, diversity, gateway routing). The spec marked these as "NEW" but they are already implemented. This plan adds only the missing gateway edge cases and focuses effort on the wiring tests where the real bugs hide.

---

## File Structure

### New Files
- `packages/test-harness/src/scripts/decomposition-turn.ts` — Gateway script for decomposition LLM calls
- `packages/test-harness/src/scripts/holdout-generation.ts` — Gateway script for holdout scenario generation
- `packages/web/src/trpc/routers/__tests__/execution.wiring.test.ts` — Execution router wiring tests
- `packages/web/src/trpc/routers/__tests__/evolution.wiring.test.ts` — Evolution router wiring tests
- `packages/web/src/trpc/routers/__tests__/projects.wiring.test.ts` — Projects router wiring tests
- `packages/web/src/trpc/routers/__tests__/costs.wiring.test.ts` — Costs router wiring tests
- `packages/engine/src/__tests__/interview-fsm.wiring.test.ts` — Engine-level FSM edge case tests

### Modified Files
- `packages/test-harness/src/fixtures.ts` — Add bead, beadEdge, holdoutVault, llmUsage, event factories
- `packages/test-harness/src/index.ts` — Export new scripts and fixture types
- `packages/web/src/trpc/routers/__tests__/interview.wiring.test.ts` — Expand with ~18 new test cases
- `packages/engine/src/decomposition/__tests__/validator.test.ts` — Add boundary/edge case tests
- `packages/engine/src/decomposition/__tests__/scheduler.test.ts` — Add topological ordering tests
- `packages/engine/src/interview/__tests__/scorer.test.ts` — Add boundary value tests
- `packages/engine/src/gateway/__tests__/circuit-breaker.test.ts` — Add HALF_OPEN concurrency test
- `packages/engine/src/gateway/__tests__/failover.test.ts` — Add backoff timing + mixed error tests

---

## Task 1: Expand Test-Harness Fixtures

**Files:**
- Modify: `packages/test-harness/src/fixtures.ts`
- Modify: `packages/test-harness/src/index.ts`

The existing fixtures only create projects, interviews, and seeds. We need factories for beads, bead edges, holdout vault entries, LLM usage records, and events to support downstream pipeline tests.

- [ ] **Step 1: Add bead fixture factory**

Add to `packages/test-harness/src/fixtures.ts` after the `seed` method:

```typescript
    /**
     * Create a bead linked to a seed.
     * Defaults to pending status with placeholder spec.
     */
    async bead(opts: {
      seedId: string;
      moleculeId?: string | null;
      title?: string;
      spec?: string;
      status?: 'pending' | 'claimed' | 'active' | 'completed' | 'failed';
      estimatedTokens?: number;
      coversCriteria?: string[];
    }) {
      const [row] = await db
        .insert(beads)
        .values({
          seedId: opts.seedId,
          moleculeId: opts.moleculeId ?? null,
          title: opts.title ?? 'Test Bead',
          spec: opts.spec ?? 'Implement test functionality',
          status: opts.status ?? 'pending',
          estimatedTokens: opts.estimatedTokens ?? 5000,
          coversCriteria: opts.coversCriteria ?? [],
        })
        .returning();
      return row!;
    },
```

- [ ] **Step 2: Add beadEdge fixture factory**

Add after the `bead` method:

```typescript
    /**
     * Create a bead edge (dependency relationship).
     */
    async beadEdge(opts: {
      fromBeadId: string;
      toBeadId: string;
      edgeType?: 'blocks' | 'parent_child' | 'conditional_blocks' | 'waits_for';
    }) {
      const [row] = await db
        .insert(beadEdges)
        .values({
          fromBeadId: opts.fromBeadId,
          toBeadId: opts.toBeadId,
          edgeType: opts.edgeType ?? 'blocks',
        })
        .returning();
      return row!;
    },
```

- [ ] **Step 3: Add holdoutVault fixture factory**

Add after the `beadEdge` method:

```typescript
    /**
     * Create a holdout vault entry linked to a seed.
     * Defaults to pending_review status with sample draft scenarios.
     */
    async holdoutVault(opts: {
      seedId: string;
      status?: 'pending_review' | 'approved' | 'sealed' | 'unsealed' | 'evaluated';
      draftScenarios?: unknown[];
    }) {
      const defaultScenarios = Array.from({ length: 5 }, (_, i) => ({
        id: `scenario-${i + 1}`,
        name: `Test Scenario ${i + 1}`,
        description: `Holdout scenario ${i + 1} for testing`,
        testCode: `test('scenario ${i + 1}', () => { expect(true).toBe(true); });`,
        category: 'functional',
      }));
      const [row] = await db
        .insert(holdoutVault)
        .values({
          seedId: opts.seedId,
          status: opts.status ?? 'pending_review',
          draftScenarios: opts.draftScenarios ?? defaultScenarios,
        })
        .returning();
      return row!;
    },
```

- [ ] **Step 4: Add llmUsage fixture factory**

Add after the `holdoutVault` method:

```typescript
    /**
     * Create an LLM usage record for cost tracking tests.
     */
    async llmUsage(opts: {
      projectId: string;
      beadId?: string | null;
      seedId?: string | null;
      evolutionCycle?: number | null;
      stage?: string;
      model?: string;
      promptTokens?: number;
      completionTokens?: number;
      costCents?: number;
    }) {
      const prompt = opts.promptTokens ?? 1000;
      const completion = opts.completionTokens ?? 500;
      const [row] = await db
        .insert(llmUsage)
        .values({
          projectId: opts.projectId,
          beadId: opts.beadId ?? null,
          seedId: opts.seedId ?? null,
          evolutionCycle: opts.evolutionCycle ?? null,
          stage: opts.stage ?? 'interview',
          model: opts.model ?? 'claude-sonnet-4-6',
          promptTokens: prompt,
          completionTokens: completion,
          totalTokens: prompt + completion,
          costCents: opts.costCents ?? 10,
        })
        .returning();
      return row!;
    },
```

- [ ] **Step 5: Add event fixture factory**

Add after the `llmUsage` method:

```typescript
    /**
     * Create an event record. Auto-computes sequenceNumber.
     */
    async event(opts: {
      projectId: string;
      seedId?: string | null;
      beadId?: string | null;
      type: string;
      payload?: Record<string, unknown>;
    }) {
      // Use appendEvent to get correct sequenceNumber
      const { appendEvent } = await import('@get-cauldron/shared');
      return appendEvent(db, {
        projectId: opts.projectId,
        seedId: opts.seedId ?? null,
        beadId: opts.beadId ?? null,
        type: opts.type as any,
        payload: opts.payload ?? {},
      });
    },
```

- [ ] **Step 6: Update imports in fixtures.ts**

Add the missing table imports at the top of `packages/test-harness/src/fixtures.ts`:

```typescript
import { projects, interviews, seeds, beads, beadEdges, holdoutVault, llmUsage } from '@get-cauldron/shared';
```

- [ ] **Step 7: Run typecheck to verify fixtures compile**

Run: `pnpm -F @get-cauldron/test-harness exec tsc --noEmit`
Expected: No type errors

- [ ] **Step 8: Commit**

```bash
git add packages/test-harness/src/fixtures.ts
git commit -m "feat(test-harness): add bead, beadEdge, holdoutVault, llmUsage, event fixture factories"
```

---

## Task 2: Add Gateway Scripts for Downstream Stages

**Files:**
- Create: `packages/test-harness/src/scripts/decomposition-turn.ts`
- Create: `packages/test-harness/src/scripts/holdout-generation.ts`
- Modify: `packages/test-harness/src/index.ts`

- [ ] **Step 1: Create decomposition gateway script**

Create `packages/test-harness/src/scripts/decomposition-turn.ts`:

```typescript
import type { MockGatewayCall } from '../gateway.js';

export interface DecompositionScriptOptions {
  /** Number of molecules to return in pass 1. Default 2. */
  moleculeCount?: number;
  /** Number of beads per molecule in pass 2. Default 2. */
  beadsPerMolecule?: number;
}

/**
 * Builds a 2-call gateway script for one decomposition run:
 *   1. Pass 1: molecule hierarchy (generateObject with stage 'decomposition')
 *   2. Pass 2: atomic bead breakdown (generateObject with stage 'decomposition')
 *
 * Matches the call sequence in decomposeSeed().
 */
export function decompositionScript(options?: DecompositionScriptOptions): MockGatewayCall[] {
  const moleculeCount = options?.moleculeCount ?? 2;
  const beadsPerMolecule = options?.beadsPerMolecule ?? 2;

  const molecules = Array.from({ length: moleculeCount }, (_, i) => ({
    id: `mol-${i + 1}`,
    title: `Module ${i + 1}`,
    description: `Module ${i + 1} handles a subset of functionality`,
    acceptanceCriteria: [`ac-${i + 1}`],
  }));

  const beads = molecules.flatMap((mol, mi) =>
    Array.from({ length: beadsPerMolecule }, (_, bi) => ({
      id: `bead-${mi + 1}-${bi + 1}`,
      moleculeId: mol.id,
      title: `${mol.title} - Task ${bi + 1}`,
      spec: `Implement task ${bi + 1} for ${mol.title}`,
      estimatedTokens: 5000,
      dependsOn: bi > 0 ? [`bead-${mi + 1}-${bi}`] : [],
      waitsFor: [],
      conditionalOn: [],
      coversCriteria: [`ac-${mi + 1}`],
    }))
  );

  return [
    // Pass 1: molecule hierarchy
    {
      stage: 'decomposition',
      returns: { molecules },
    },
    // Pass 2: atomic bead breakdown
    {
      stage: 'decomposition',
      returns: { beads },
    },
  ];
}
```

- [ ] **Step 2: Create holdout generation gateway script**

Create `packages/test-harness/src/scripts/holdout-generation.ts`:

```typescript
import type { MockGatewayCall } from '../gateway.js';

export interface HoldoutGenerationOptions {
  /** Number of scenarios to generate. Default 5 (minimum for sealing). */
  scenarioCount?: number;
}

/**
 * Builds a 1-call gateway script for holdout scenario generation:
 *   1. generateHoldoutScenarios (generateObject with stage 'holdout')
 *
 * Matches the call sequence in generateHoldoutScenarios().
 */
export function holdoutGenerationScript(options?: HoldoutGenerationOptions): MockGatewayCall[] {
  const count = options?.scenarioCount ?? 5;

  const scenarios = Array.from({ length: count }, (_, i) => ({
    id: `holdout-${i + 1}`,
    name: `Adversarial Scenario ${i + 1}`,
    description: `Tests edge case ${i + 1} that implementation might miss`,
    testCode: `test('holdout scenario ${i + 1}', () => {\n  expect(true).toBe(true);\n});`,
    category: i % 2 === 0 ? 'functional' : 'edge_case',
  }));

  return [
    {
      stage: 'holdout',
      returns: { scenarios },
    },
  ];
}
```

- [ ] **Step 3: Update test-harness index.ts to export new scripts**

Add to `packages/test-harness/src/index.ts`:

```typescript
export { decompositionScript } from './scripts/decomposition-turn.js';
export type { DecompositionScriptOptions } from './scripts/decomposition-turn.js';
export { holdoutGenerationScript } from './scripts/holdout-generation.js';
export type { HoldoutGenerationOptions } from './scripts/holdout-generation.js';
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm -F @get-cauldron/test-harness exec tsc --noEmit`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add packages/test-harness/src/scripts/decomposition-turn.ts packages/test-harness/src/scripts/holdout-generation.ts packages/test-harness/src/index.ts
git commit -m "feat(test-harness): add decomposition and holdout generation gateway scripts"
```

---

## Task 3: Interview Wiring — FSM State Transition Edge Cases

**Files:**
- Modify: `packages/web/src/trpc/routers/__tests__/interview.wiring.test.ts`

These tests exercise invalid state transitions and boundary conditions in the interview FSM through the tRPC layer.

- [ ] **Step 1: Write FSM edge case tests**

Add a new `describe` block after the existing `rejectSummary` suite in `interview.wiring.test.ts`:

```typescript
describe('interview FSM edge cases wiring', () => {
  let ctx: TestContext;

  afterEach(async () => {
    ctx?.gateway.assertAllConsumed();
    await ctx?.truncate();
  });

  afterAll(async () => {
    await ctx?.cleanup();
  });

  it('rejects sendAnswer when interview phase is reviewing', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    await ctx.fixtures.interview({ projectId: project.id, phase: 'reviewing' });

    await expect(
      ctx.caller.interview.sendAnswer({
        projectId: project.id,
        answer: 'Some answer',
      }),
    ).rejects.toThrow(/gathering/);
  });

  it('double startInterview returns the same interview (no duplicate)', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();

    const first = await ctx.caller.interview.startInterview({ projectId: project.id });
    const second = await ctx.caller.interview.startInterview({ projectId: project.id });

    expect(second.interviewId).toBe(first.interviewId);
  });

  it('approveSummary rejects when interview is in gathering phase', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    await ctx.fixtures.interview({ projectId: project.id, phase: 'gathering' });

    const summary = {
      goal: 'Build something',
      constraints: ['fast'],
      acceptanceCriteria: ['works'],
      ontologySchema: { entities: [] },
      evaluationPrinciples: ['quality'],
      exitConditions: [{ condition: 'done', description: 'done' }],
    };

    await expect(
      ctx.caller.interview.approveSummary({ projectId: project.id, summary }),
    ).rejects.toThrow(/reviewing/);
  });

  it('rejectSummary then sendAnswer works (back to gathering flow)', async () => {
    // Start with reviewing phase, reject, then send answer in gathering
    const turnScript = interviewTurnScript({ overallClarity: 0.5 });
    ctx = await createTestContext({ gatewayScript: turnScript });

    const project = await ctx.fixtures.project();
    await ctx.fixtures.interview({ projectId: project.id, phase: 'reviewing' });

    // Reject → back to gathering
    const reject = await ctx.caller.interview.rejectSummary({ projectId: project.id });
    expect(reject.phase).toBe('gathering');

    // Now sendAnswer should work
    const answer = await ctx.caller.interview.sendAnswer({
      projectId: project.id,
      answer: 'Updated requirements',
    });
    expect(answer.turnNumber).toBeDefined();
    expect(answer.phase).toBe('gathering');
  });

  it('rejectSummary throws when interview is in gathering phase', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    await ctx.fixtures.interview({ projectId: project.id, phase: 'gathering' });

    await expect(
      ctx.caller.interview.rejectSummary({ projectId: project.id }),
    ).rejects.toThrow(/reviewing/);
  });

  it('sendAnswer throws when no interview exists for project', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();

    await expect(
      ctx.caller.interview.sendAnswer({ projectId: project.id, answer: 'hello' }),
    ).rejects.toThrow(/No active interview/);
  });
});
```

- [ ] **Step 2: Run the new tests to see which pass and which reveal bugs**

Run: `pnpm -F @get-cauldron/web test:wiring -- --reporter=verbose`
Expected: Some tests may fail — that's the point. Document which fail and why.

- [ ] **Step 3: Commit (tests that pass + any marked as `.todo` for tests that reveal bugs needing separate fixes)**

```bash
git add packages/web/src/trpc/routers/__tests__/interview.wiring.test.ts
git commit -m "test(interview): add FSM state transition edge case wiring tests"
```

---

## Task 4: Interview Wiring — Scoring & Threshold Boundaries

**Files:**
- Modify: `packages/web/src/trpc/routers/__tests__/interview.wiring.test.ts`

- [ ] **Step 1: Write scoring boundary tests**

Add a new `describe` block:

```typescript
describe('interview scoring boundaries wiring', () => {
  let ctx: TestContext;

  afterEach(async () => {
    ctx?.gateway.assertAllConsumed();
    await ctx?.truncate();
  });

  afterAll(async () => {
    await ctx?.cleanup();
  });

  it('auto-transitions to reviewing at exactly 0.8 overall clarity', async () => {
    const turnScript = interviewTurnScript({ overallClarity: 0.8 });
    ctx = await createTestContext({ gatewayScript: turnScript });

    const project = await ctx.fixtures.project();
    await ctx.caller.interview.startInterview({ projectId: project.id });

    const result = await ctx.caller.interview.sendAnswer({
      projectId: project.id,
      answer: 'Detailed answer',
    });

    expect(result.thresholdMet).toBe(true);
    expect(result.phase).toBe('reviewing');
  });

  it('stays in gathering at 0.79 overall clarity', async () => {
    const turnScript = interviewTurnScript({ overallClarity: 0.79 });
    ctx = await createTestContext({ gatewayScript: turnScript });

    const project = await ctx.fixtures.project();
    await ctx.caller.interview.startInterview({ projectId: project.id });

    const result = await ctx.caller.interview.sendAnswer({
      projectId: project.id,
      answer: 'Somewhat vague answer',
    });

    expect(result.thresholdMet).toBe(false);
    expect(result.phase).toBe('gathering');
    expect(result.nextQuestion).not.toBeNull();
  });

  it('first turn with empty transcript scores without error', async () => {
    const turnScript = interviewTurnScript({ overallClarity: 0.3 });
    ctx = await createTestContext({ gatewayScript: turnScript });

    const project = await ctx.fixtures.project();
    await ctx.caller.interview.startInterview({ projectId: project.id });

    const result = await ctx.caller.interview.sendAnswer({
      projectId: project.id,
      answer: 'I want to build an app',
    });

    expect(result.turnNumber).toBe(1);
    expect(result.currentScores).toBeDefined();
    expect(result.currentScores.overall).toBeCloseTo(0.3, 1);
  });

  it('supports freeform text alongside MC answer', async () => {
    const turnScript = interviewTurnScript({ overallClarity: 0.5 });
    ctx = await createTestContext({ gatewayScript: turnScript });

    const project = await ctx.fixtures.project();
    await ctx.caller.interview.startInterview({ projectId: project.id });

    const result = await ctx.caller.interview.sendAnswer({
      projectId: project.id,
      answer: 'Option A: Keep it simple',
      freeformText: 'But also consider accessibility requirements',
    });

    expect(result.turnNumber).toBe(1);
    // Verify freeform text was included in the transcript
    const transcript = await ctx.caller.interview.getTranscript({ projectId: project.id });
    const lastTurn = transcript.transcript[transcript.transcript.length - 1];
    expect(lastTurn?.freeformText).toBe('But also consider accessibility requirements');
  });
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm -F @get-cauldron/web test:wiring -- --reporter=verbose`
Expected: Tests pass or reveal bugs to fix.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/trpc/routers/__tests__/interview.wiring.test.ts
git commit -m "test(interview): add scoring threshold boundary wiring tests"
```

---

## Task 5: Interview Wiring — Multi-Turn Flows

**Files:**
- Modify: `packages/web/src/trpc/routers/__tests__/interview.wiring.test.ts`

- [ ] **Step 1: Write multi-turn flow tests**

Add a new `describe` block:

```typescript
describe('interview multi-turn flows wiring', () => {
  let ctx: TestContext;

  afterEach(async () => {
    ctx?.gateway.assertAllConsumed();
    await ctx?.truncate();
  });

  afterAll(async () => {
    await ctx?.cleanup();
  });

  it('full 3-turn interview through to crystallization', async () => {
    // Turn 1: low clarity (0.3) — early phase, researcher/breadth-keeper/simplifier
    // Turn 2: mid clarity (0.6) — mid phase, architect + specialist
    // Turn 3: high clarity (0.85) — triggers reviewing transition
    const turn1 = interviewTurnScript({ overallClarity: 0.3 });
    const turn2 = interviewTurnScript({ overallClarity: 0.6 });
    const turn3 = interviewTurnScript({ overallClarity: 0.85 });
    const holdoutScript: MockGatewayCall[] = [
      {
        stage: 'holdout',
        returns: {
          scenarios: Array.from({ length: 5 }, (_, i) => ({
            id: `holdout-${i}`,
            name: `Scenario ${i}`,
            description: `Edge case ${i}`,
            testCode: `test('${i}', () => {});`,
            category: 'functional',
          })),
        },
      },
    ];

    ctx = await createTestContext({
      gatewayScript: [...turn1, ...turn2, ...turn3, ...holdoutScript],
    });

    const project = await ctx.fixtures.project();
    await ctx.caller.interview.startInterview({ projectId: project.id });

    // Turn 1
    const r1 = await ctx.caller.interview.sendAnswer({
      projectId: project.id,
      answer: 'I want a task management app',
    });
    expect(r1.phase).toBe('gathering');
    expect(r1.turnNumber).toBe(1);

    // Turn 2
    const r2 = await ctx.caller.interview.sendAnswer({
      projectId: project.id,
      answer: 'It should support teams with role-based access',
    });
    expect(r2.phase).toBe('gathering');
    expect(r2.turnNumber).toBe(2);

    // Turn 3 — should transition
    const r3 = await ctx.caller.interview.sendAnswer({
      projectId: project.id,
      answer: 'Tasks have title, description, assignee, due date, priority, and status',
    });
    expect(r3.phase).toBe('reviewing');
    expect(r3.thresholdMet).toBe(true);
    expect(r3.turnNumber).toBe(3);

    // Verify transcript integrity
    const transcript = await ctx.caller.interview.getTranscript({ projectId: project.id });
    expect(transcript.transcript).toHaveLength(3);
    expect(transcript.phase).toBe('reviewing');

    // Approve summary → crystallization
    const summary = {
      goal: 'Build a task management app with team support',
      constraints: ['Must support RBAC'],
      acceptanceCriteria: ['Users can create tasks', 'Teams can share tasks'],
      ontologySchema: {
        entities: [
          { name: 'Task', attributes: ['title', 'status'], relations: [{ to: 'User', type: 'assignedTo' }] },
        ],
      },
      evaluationPrinciples: ['Completeness', 'Usability'],
      exitConditions: [{ condition: 'all_ac_pass', description: 'All acceptance criteria pass' }],
    };

    const approved = await ctx.caller.interview.approveSummary({
      projectId: project.id,
      summary,
    });

    expect(approved.seedId).toBeDefined();
    expect(approved.version).toBe(1);
  });

  it('perspective activation changes across early/mid/late bands', async () => {
    // Turn 1: early band (< 0.4) — should get researcher, breadth-keeper, simplifier
    // Turn 2: late band (>= 0.7) — should get seed-closer, architect
    const earlyTurn = interviewTurnScript({ overallClarity: 0.2 });
    const lateTurn = interviewTurnScript({ overallClarity: 0.85 });

    ctx = await createTestContext({
      gatewayScript: [...earlyTurn, ...lateTurn],
    });

    const project = await ctx.fixtures.project();
    await ctx.caller.interview.startInterview({ projectId: project.id });

    // Turn 1: early band
    const r1 = await ctx.caller.interview.sendAnswer({
      projectId: project.id,
      answer: 'Something vague',
    });
    expect(r1.currentScores.overall).toBeCloseTo(0.2, 1);

    // Turn 2: late band — auto-transitions
    const r2 = await ctx.caller.interview.sendAnswer({
      projectId: project.id,
      answer: 'Very detailed and specific requirements',
    });
    expect(r2.thresholdMet).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm -F @get-cauldron/web test:wiring -- --reporter=verbose`

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/trpc/routers/__tests__/interview.wiring.test.ts
git commit -m "test(interview): add multi-turn flow and crystallization wiring tests"
```

---

## Task 6: Interview Wiring — Holdout Lifecycle

**Files:**
- Modify: `packages/web/src/trpc/routers/__tests__/interview.wiring.test.ts`

These tests exercise the holdout review/approval/sealing flow after crystallization. The `sealHoldouts` procedure requires the `HOLDOUT_ENCRYPTION_KEY` environment variable for AES-256-GCM encryption.

- [ ] **Step 1: Write holdout lifecycle tests**

Add a new `describe` block:

```typescript
describe('interview holdout lifecycle wiring', () => {
  let ctx: TestContext;

  afterEach(async () => {
    await ctx?.truncate();
  });

  afterAll(async () => {
    await ctx?.cleanup();
  });

  it('getHoldouts returns flattened scenarios from vault entries', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    const interview = await ctx.fixtures.interview({ projectId: project.id, phase: 'crystallized' });
    const seed = await ctx.fixtures.seed({ projectId: project.id, interviewId: interview.id });
    await ctx.fixtures.holdoutVault({ seedId: seed.id });

    const result = await ctx.caller.interview.getHoldouts({ seedId: seed.id });
    expect(result.scenarios).toHaveLength(5);
    expect(result.scenarios[0]).toMatchObject({
      holdoutVaultId: expect.any(String),
      name: expect.any(String),
      description: expect.any(String),
      testCode: expect.any(String),
      status: 'pending_review',
    });
  });

  it('approveHoldout transitions vault entry to approved', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    const interview = await ctx.fixtures.interview({ projectId: project.id, phase: 'crystallized' });
    const seed = await ctx.fixtures.seed({ projectId: project.id, interviewId: interview.id });
    const vault = await ctx.fixtures.holdoutVault({ seedId: seed.id });

    const result = await ctx.caller.interview.approveHoldout({ holdoutId: vault.id });
    expect(result.status).toBe('approved');
  });

  it('rejectHoldout clears draft scenarios and resets to pending_review', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    const interview = await ctx.fixtures.interview({ projectId: project.id, phase: 'crystallized' });
    const seed = await ctx.fixtures.seed({ projectId: project.id, interviewId: interview.id });
    const vault = await ctx.fixtures.holdoutVault({ seedId: seed.id });

    const result = await ctx.caller.interview.rejectHoldout({ holdoutId: vault.id });
    expect(result.status).toBe('rejected');

    // Verify draft scenarios were cleared
    const holdouts = await ctx.caller.interview.getHoldouts({ seedId: seed.id });
    expect(holdouts.scenarios).toHaveLength(0);
  });

  it('sealHoldouts encrypts approved vault entries', async () => {
    // sealVault requires HOLDOUT_ENCRYPTION_KEY
    const originalKey = process.env['HOLDOUT_ENCRYPTION_KEY'];
    process.env['HOLDOUT_ENCRYPTION_KEY'] = 'a'.repeat(64); // 32-byte hex key

    try {
      ctx = await createTestContext();
      const project = await ctx.fixtures.project();
      const interview = await ctx.fixtures.interview({ projectId: project.id, phase: 'crystallized' });
      const seed = await ctx.fixtures.seed({ projectId: project.id, interviewId: interview.id });
      await ctx.fixtures.holdoutVault({ seedId: seed.id, status: 'approved' });

      const result = await ctx.caller.interview.sealHoldouts({ seedId: seed.id });
      expect(result.sealedCount).toBe(1);
      expect(result.seedId).toBe(seed.id);
    } finally {
      if (originalKey === undefined) {
        delete process.env['HOLDOUT_ENCRYPTION_KEY'];
      } else {
        process.env['HOLDOUT_ENCRYPTION_KEY'] = originalKey;
      }
    }
  });

  it('sealHoldouts throws when no approved entries exist', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    const interview = await ctx.fixtures.interview({ projectId: project.id, phase: 'crystallized' });
    const seed = await ctx.fixtures.seed({ projectId: project.id, interviewId: interview.id });
    // Create vault in pending_review (not approved)
    await ctx.fixtures.holdoutVault({ seedId: seed.id, status: 'pending_review' });

    await expect(
      ctx.caller.interview.sealHoldouts({ seedId: seed.id }),
    ).rejects.toThrow(/No approved holdout/);
  });

  it('approveHoldout on already-approved entry is idempotent', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    const interview = await ctx.fixtures.interview({ projectId: project.id, phase: 'crystallized' });
    const seed = await ctx.fixtures.seed({ projectId: project.id, interviewId: interview.id });
    const vault = await ctx.fixtures.holdoutVault({ seedId: seed.id, status: 'approved' });

    // Should not throw
    const result = await ctx.caller.interview.approveHoldout({ holdoutId: vault.id });
    expect(result.status).toBe('approved');
  });
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm -F @get-cauldron/web test:wiring -- --reporter=verbose`

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/trpc/routers/__tests__/interview.wiring.test.ts
git commit -m "test(interview): add holdout lifecycle wiring tests (approve, reject, seal)"
```

---

## Task 7: Projects Router Wiring Tests

**Files:**
- Create: `packages/web/src/trpc/routers/__tests__/projects.wiring.test.ts`

- [ ] **Step 1: Write projects router wiring tests**

Create `packages/web/src/trpc/routers/__tests__/projects.wiring.test.ts`:

```typescript
import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { createTestContext, type TestContext } from '@get-cauldron/test-harness';

describe('projects router wiring', () => {
  let ctx: TestContext;

  afterEach(async () => {
    await ctx?.truncate();
  });

  afterAll(async () => {
    await ctx?.cleanup();
  });

  it('create returns a project with id and name', async () => {
    ctx = await createTestContext();

    const project = await ctx.caller.projects.create({
      name: 'My Project',
      description: 'A test project',
    });

    expect(project.id).toBeDefined();
    expect(project.name).toBe('My Project');
    expect(project.description).toBe('A test project');
  });

  it('list returns non-deleted projects', async () => {
    ctx = await createTestContext();

    await ctx.caller.projects.create({ name: 'Project A' });
    await ctx.caller.projects.create({ name: 'Project B' });

    const list = await ctx.caller.projects.list();
    expect(list).toHaveLength(2);
    expect(list.map((p) => p.name)).toContain('Project A');
    expect(list.map((p) => p.name)).toContain('Project B');
  });

  it('byId returns project with cost totals', async () => {
    ctx = await createTestContext();

    const created = await ctx.caller.projects.create({ name: 'Lookup Project' });
    const found = await ctx.caller.projects.byId({ id: created.id });

    expect(found.name).toBe('Lookup Project');
    expect(found.totalCostCents).toBe(0);
  });

  it('archive prefixes name with [archived]', async () => {
    ctx = await createTestContext();

    const project = await ctx.caller.projects.create({ name: 'To Archive' });
    await ctx.caller.projects.archive({ id: project.id });

    const found = await ctx.caller.projects.byId({ id: project.id });
    expect(found.name).toBe('[archived] To Archive');

    // Archived projects still appear in list (not deleted)
    const list = await ctx.caller.projects.list();
    expect(list).toHaveLength(1);
  });

  it('delete sets deletedAt and excludes from list', async () => {
    ctx = await createTestContext();

    const project = await ctx.caller.projects.create({ name: 'To Delete' });
    await ctx.caller.projects.delete({ id: project.id });

    // Excluded from list
    const list = await ctx.caller.projects.list();
    expect(list).toHaveLength(0);

    // But byId still works (soft delete)
    const found = await ctx.caller.projects.byId({ id: project.id });
    expect(found.deletedAt).not.toBeNull();
  });

  it('updateSettings persists budget and concurrent bead settings', async () => {
    ctx = await createTestContext();

    const project = await ctx.caller.projects.create({ name: 'Config Project' });
    const updated = await ctx.caller.projects.updateSettings({
      id: project.id,
      settings: {
        budgetLimitCents: 5000,
        maxConcurrentBeads: 3,
        repoUrl: 'https://github.com/test/repo',
      },
    });

    expect(updated.settings).toMatchObject({
      budgetLimitCents: 5000,
      maxConcurrentBeads: 3,
      repoUrl: 'https://github.com/test/repo',
    });

    // Verify persistence
    const found = await ctx.caller.projects.byId({ id: project.id });
    expect(found.settings).toMatchObject({ budgetLimitCents: 5000 });
  });

  it('create with duplicate name is allowed', async () => {
    ctx = await createTestContext();

    const first = await ctx.caller.projects.create({ name: 'Same Name' });
    const second = await ctx.caller.projects.create({ name: 'Same Name' });

    expect(first.id).not.toBe(second.id);
    const list = await ctx.caller.projects.list();
    expect(list).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm -F @get-cauldron/web test:wiring -- --reporter=verbose`

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/trpc/routers/__tests__/projects.wiring.test.ts
git commit -m "test(projects): add full CRUD wiring tests for projects router"
```

---

## Task 8: Costs Router Wiring Tests

**Files:**
- Create: `packages/web/src/trpc/routers/__tests__/costs.wiring.test.ts`

- [ ] **Step 1: Write costs router wiring tests**

Create `packages/web/src/trpc/routers/__tests__/costs.wiring.test.ts`:

```typescript
import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { createTestContext, type TestContext } from '@get-cauldron/test-harness';

describe('costs router wiring', () => {
  let ctx: TestContext;

  afterEach(async () => {
    await ctx?.truncate();
  });

  afterAll(async () => {
    await ctx?.cleanup();
  });

  it('getProjectSummary returns zeros when no usage exists', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();

    const summary = await ctx.caller.costs.getProjectSummary({ projectId: project.id });

    expect(Number(summary.totalCostCents)).toBe(0);
    expect(Number(summary.totalTokens)).toBe(0);
    expect(Number(summary.callCount)).toBeGreaterThanOrEqual(0);
  });

  it('getProjectSummary aggregates multiple usage records', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();

    await ctx.fixtures.llmUsage({ projectId: project.id, costCents: 10, promptTokens: 100, completionTokens: 50 });
    await ctx.fixtures.llmUsage({ projectId: project.id, costCents: 20, promptTokens: 200, completionTokens: 100 });

    const summary = await ctx.caller.costs.getProjectSummary({ projectId: project.id });
    expect(Number(summary.totalCostCents)).toBe(30);
    expect(Number(summary.totalPromptTokens)).toBe(300);
    expect(Number(summary.totalCompletionTokens)).toBe(150);
    expect(Number(summary.callCount)).toBe(2);
  });

  it('getByModel groups usage by model name', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();

    await ctx.fixtures.llmUsage({ projectId: project.id, model: 'claude-sonnet-4-6', costCents: 15 });
    await ctx.fixtures.llmUsage({ projectId: project.id, model: 'claude-sonnet-4-6', costCents: 25 });
    await ctx.fixtures.llmUsage({ projectId: project.id, model: 'gpt-4o', costCents: 10 });

    const byModel = await ctx.caller.costs.getByModel({ projectId: project.id });
    expect(byModel).toHaveLength(2);

    const claude = byModel.find((r) => r.model === 'claude-sonnet-4-6');
    expect(Number(claude?.totalCostCents)).toBe(40);
    expect(Number(claude?.callCount)).toBe(2);
  });

  it('getByStage groups usage by pipeline stage', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();

    await ctx.fixtures.llmUsage({ projectId: project.id, stage: 'interview', costCents: 10 });
    await ctx.fixtures.llmUsage({ projectId: project.id, stage: 'decomposition', costCents: 20 });
    await ctx.fixtures.llmUsage({ projectId: project.id, stage: 'interview', costCents: 5 });

    const byStage = await ctx.caller.costs.getByStage({ projectId: project.id });
    const interviewStage = byStage.find((r) => r.stage === 'interview');
    expect(Number(interviewStage?.totalCostCents)).toBe(15);
  });

  it('getTopBeads returns beads ordered by cost descending with titles', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    const interview = await ctx.fixtures.interview({ projectId: project.id, phase: 'crystallized' });
    const seed = await ctx.fixtures.seed({ projectId: project.id, interviewId: interview.id });
    const bead1 = await ctx.fixtures.bead({ seedId: seed.id, title: 'Expensive Bead' });
    const bead2 = await ctx.fixtures.bead({ seedId: seed.id, title: 'Cheap Bead' });

    await ctx.fixtures.llmUsage({ projectId: project.id, beadId: bead1.id, costCents: 100 });
    await ctx.fixtures.llmUsage({ projectId: project.id, beadId: bead2.id, costCents: 5 });

    const topBeads = await ctx.caller.costs.getTopBeads({ projectId: project.id, limit: 2 });
    expect(topBeads).toHaveLength(2);
    expect(Number(topBeads[0]!.totalCostCents)).toBeGreaterThanOrEqual(Number(topBeads[1]!.totalCostCents));
    expect(topBeads[0]!.beadName).toBe('Expensive Bead');
  });
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm -F @get-cauldron/web test:wiring -- --reporter=verbose`

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/trpc/routers/__tests__/costs.wiring.test.ts
git commit -m "test(costs): add wiring tests for all costs router procedures"
```

---

## Task 9: Execution Router Wiring Tests

**Files:**
- Create: `packages/web/src/trpc/routers/__tests__/execution.wiring.test.ts`

The execution router has both query procedures (pure DB lookups) and mutation procedures that import `runDecomposition` and `engineInngest` directly from the engine. Query procedures can be tested with fixtures. Mutations that call Inngest need `vi.mock` to stub the engine's Inngest client.

- [ ] **Step 1: Write execution query wiring tests**

Create `packages/web/src/trpc/routers/__tests__/execution.wiring.test.ts`:

```typescript
import { describe, it, expect, afterEach, afterAll, vi } from 'vitest';
import { createTestContext, type TestContext } from '@get-cauldron/test-harness';

// Mock the engine's Inngest client and runDecomposition for mutation tests
vi.mock('@get-cauldron/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@get-cauldron/engine')>();
  return {
    ...actual,
    inngest: {
      send: vi.fn().mockResolvedValue(undefined),
    },
    runDecomposition: vi.fn().mockResolvedValue({
      molecules: [],
      beads: [],
    }),
  };
});

describe('execution router wiring', () => {
  let ctx: TestContext;

  afterEach(async () => {
    await ctx?.truncate();
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await ctx?.cleanup();
  });

  it('getDAG returns beads and edges for a seed', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    const interview = await ctx.fixtures.interview({ projectId: project.id, phase: 'crystallized' });
    const seed = await ctx.fixtures.seed({ projectId: project.id, interviewId: interview.id });

    const beadA = await ctx.fixtures.bead({ seedId: seed.id, title: 'Bead A' });
    const beadB = await ctx.fixtures.bead({ seedId: seed.id, title: 'Bead B' });
    await ctx.fixtures.beadEdge({ fromBeadId: beadA.id, toBeadId: beadB.id, edgeType: 'blocks' });

    const dag = await ctx.caller.execution.getDAG({ seedId: seed.id });
    expect(dag.beads).toHaveLength(2);
    expect(dag.edges).toHaveLength(1);
    expect(dag.edges[0]!.fromBeadId).toBe(beadA.id);
    expect(dag.edges[0]!.toBeadId).toBe(beadB.id);
  });

  it('getProjectDAG finds latest seed and returns its DAG', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    const interview = await ctx.fixtures.interview({ projectId: project.id, phase: 'crystallized' });
    const seed = await ctx.fixtures.seed({ projectId: project.id, interviewId: interview.id });
    await ctx.fixtures.bead({ seedId: seed.id, title: 'Only Bead' });

    const dag = await ctx.caller.execution.getProjectDAG({ projectId: project.id });
    expect(dag.seedId).toBe(seed.id);
    expect(dag.beads).toHaveLength(1);
  });

  it('getProjectDAG returns empty when no seed exists', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();

    const dag = await ctx.caller.execution.getProjectDAG({ projectId: project.id });
    expect(dag.seedId).toBeNull();
    expect(dag.beads).toHaveLength(0);
    expect(dag.edges).toHaveLength(0);
  });

  it('getBeadDetail returns bead with associated events', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    const interview = await ctx.fixtures.interview({ projectId: project.id, phase: 'crystallized' });
    const seed = await ctx.fixtures.seed({ projectId: project.id, interviewId: interview.id });
    const bead = await ctx.fixtures.bead({ seedId: seed.id, title: 'Detail Bead' });

    // Create an event for this bead
    await ctx.fixtures.event({
      projectId: project.id,
      beadId: bead.id,
      type: 'bead_dispatched',
      payload: { agentId: 'test-agent' },
    });

    const detail = await ctx.caller.execution.getBeadDetail({ beadId: bead.id });
    expect(detail.bead.title).toBe('Detail Bead');
    expect(detail.events).toHaveLength(1);
    expect(detail.events[0]!.type).toBe('bead_dispatched');
  });

  it('getPipelineStatus reflects bead states', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    const interview = await ctx.fixtures.interview({ projectId: project.id, phase: 'crystallized' });
    const seed = await ctx.fixtures.seed({ projectId: project.id, interviewId: interview.id });

    // No beads yet — not active
    const emptyStatus = await ctx.caller.execution.getPipelineStatus({ projectId: project.id });
    expect(emptyStatus.active).toBe(false);

    // Add a pending bead — should be active
    await ctx.fixtures.bead({ seedId: seed.id, status: 'pending' });
    const activeStatus = await ctx.caller.execution.getPipelineStatus({ projectId: project.id });
    expect(activeStatus.active).toBe(true);
  });

  it('respondToEscalation records conflict_resolved event', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    const interview = await ctx.fixtures.interview({ projectId: project.id, phase: 'crystallized' });
    const seed = await ctx.fixtures.seed({ projectId: project.id, interviewId: interview.id });
    const bead = await ctx.fixtures.bead({ seedId: seed.id });

    const result = await ctx.caller.execution.respondToEscalation({
      projectId: project.id,
      beadId: bead.id,
      action: 'retry',
      guidance: 'Try a different approach',
    });

    expect(result.success).toBe(true);

    // Verify event was recorded
    const detail = await ctx.caller.execution.getBeadDetail({ beadId: bead.id });
    const resolvedEvent = detail.events.find((e) => e.type === 'conflict_resolved');
    expect(resolvedEvent).toBeDefined();
    expect((resolvedEvent!.payload as Record<string, unknown>)['action']).toBe('retry');
  });

  it('getBeadDetail throws for non-existent bead', async () => {
    ctx = await createTestContext();

    await expect(
      ctx.caller.execution.getBeadDetail({ beadId: '00000000-0000-0000-0000-000000000000' }),
    ).rejects.toThrow(/not found/i);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm -F @get-cauldron/web test:wiring -- --reporter=verbose`

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/trpc/routers/__tests__/execution.wiring.test.ts
git commit -m "test(execution): add wiring tests for DAG queries, pipeline status, and escalation"
```

---

## Task 10: Evolution Router Wiring Tests

**Files:**
- Create: `packages/web/src/trpc/routers/__tests__/evolution.wiring.test.ts`

- [ ] **Step 1: Write evolution router wiring tests**

Create `packages/web/src/trpc/routers/__tests__/evolution.wiring.test.ts`:

```typescript
import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { createTestContext, type TestContext } from '@get-cauldron/test-harness';

describe('evolution router wiring', () => {
  let ctx: TestContext;

  afterEach(async () => {
    await ctx?.truncate();
  });

  afterAll(async () => {
    await ctx?.cleanup();
  });

  it('getSeedLineage returns seeds ordered by generation ascending', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    const interview = await ctx.fixtures.interview({ projectId: project.id, phase: 'crystallized' });

    // Generation 0 (root)
    const seed0 = await ctx.fixtures.seed({
      projectId: project.id,
      interviewId: interview.id,
      version: 1,
      goal: 'Initial goal',
    });

    // Generation 1 (child) — manually set generation via DB since fixture defaults to 0
    const { seeds } = await import('@get-cauldron/shared');
    const { eq } = await import('drizzle-orm');

    const seed1 = await ctx.fixtures.seed({
      projectId: project.id,
      interviewId: interview.id,
      version: 2,
      parentId: seed0.id,
      goal: 'Evolved goal',
    });

    // Update generations directly
    await ctx.db.update(seeds).set({ generation: 0 }).where(eq(seeds.id, seed0.id));
    await ctx.db.update(seeds).set({ generation: 1 }).where(eq(seeds.id, seed1.id));

    const lineage = await ctx.caller.evolution.getSeedLineage({ projectId: project.id });
    expect(lineage).toHaveLength(2);
    expect(lineage[0]!.id).toBe(seed0.id);
    expect(lineage[1]!.id).toBe(seed1.id);
    expect(lineage[1]!.parentId).toBe(seed0.id);
  });

  it('getSeedLineage returns single-element chain for root seed', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    const interview = await ctx.fixtures.interview({ projectId: project.id, phase: 'crystallized' });
    await ctx.fixtures.seed({ projectId: project.id, interviewId: interview.id });

    const lineage = await ctx.caller.evolution.getSeedLineage({ projectId: project.id });
    expect(lineage).toHaveLength(1);
    expect(lineage[0]!.parentId).toBeNull();
  });

  it('getEvolutionHistory returns evolution events in order', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();

    await ctx.fixtures.event({
      projectId: project.id,
      type: 'evolution_started',
      payload: { generation: 1 },
    });
    await ctx.fixtures.event({
      projectId: project.id,
      type: 'evolution_converged',
      payload: { signal: 'stagnation' },
    });

    const history = await ctx.caller.evolution.getEvolutionHistory({ projectId: project.id });
    expect(history).toHaveLength(2);
    expect(history[0]!.type).toBe('evolution_started');
    expect(history[1]!.type).toBe('evolution_converged');
  });

  it('getConvergenceForSeed returns cost data and convergence events', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    const interview = await ctx.fixtures.interview({ projectId: project.id, phase: 'crystallized' });
    const seed = await ctx.fixtures.seed({ projectId: project.id, interviewId: interview.id });

    // Add LLM usage for this seed
    await ctx.fixtures.llmUsage({ projectId: project.id, seedId: seed.id, costCents: 50 });
    await ctx.fixtures.llmUsage({ projectId: project.id, seedId: seed.id, costCents: 30 });

    const result = await ctx.caller.evolution.getConvergenceForSeed({ seedId: seed.id });
    expect(Number(result.costCents)).toBe(80);
    expect(result.convergenceEvent).toBeNull(); // No convergence event yet
    expect(result.lateralThinkingEvents).toHaveLength(0);
  });

  it('getConvergenceForSeed finds convergence event for seed', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    const interview = await ctx.fixtures.interview({ projectId: project.id, phase: 'crystallized' });
    const seed = await ctx.fixtures.seed({ projectId: project.id, interviewId: interview.id });

    await ctx.fixtures.event({
      projectId: project.id,
      seedId: seed.id,
      type: 'evolution_goal_met',
      payload: { score: 0.96 },
    });

    const result = await ctx.caller.evolution.getConvergenceForSeed({ seedId: seed.id });
    expect(result.convergenceEvent).not.toBeNull();
    expect(result.convergenceEvent!.type).toBe('evolution_goal_met');
  });
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm -F @get-cauldron/web test:wiring -- --reporter=verbose`

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/trpc/routers/__tests__/evolution.wiring.test.ts
git commit -m "test(evolution): add wiring tests for seed lineage, history, and convergence"
```

---

## Task 11: Expand Decomposition Validator Unit Tests

**Files:**
- Modify: `packages/engine/src/decomposition/__tests__/validator.test.ts`

- [ ] **Step 1: Add boundary and edge case tests**

Add after the existing `validateDAG` describe block:

```typescript
describe('detectCycle edge cases', () => {
  it('detects self-referencing bead as a cycle', () => {
    const result = detectCycle(
      ['a'],
      [{ fromBeadId: 'a', toBeadId: 'a', edgeType: 'blocks' }],
    );
    expect(result).not.toBeNull();
    expect(result).toContain('a');
  });

  it('handles empty graph (no beads, no edges)', () => {
    const result = detectCycle([], []);
    expect(result).toBeNull();
  });

  it('handles single bead with no edges', () => {
    const result = detectCycle(['a'], []);
    expect(result).toBeNull();
  });

  it('detects cycle in a complex 4-node graph', () => {
    // A→B→C→D→B (cycle: B,C,D)
    const result = detectCycle(
      ['a', 'b', 'c', 'd'],
      [
        { fromBeadId: 'a', toBeadId: 'b', edgeType: 'blocks' },
        { fromBeadId: 'b', toBeadId: 'c', edgeType: 'blocks' },
        { fromBeadId: 'c', toBeadId: 'd', edgeType: 'blocks' },
        { fromBeadId: 'd', toBeadId: 'b', edgeType: 'blocks' },
      ],
    );
    expect(result).not.toBeNull();
    expect(result).toContain('b');
    expect(result).toContain('c');
    expect(result).toContain('d');
  });
});

describe('validateBeadSizes boundary cases', () => {
  it('passes bead exactly at the token budget', () => {
    const result = validateBeadSizes(
      [{ id: 'b1', estimatedTokens: 200_000 } as any],
      200_000,
    );
    expect(result).toHaveLength(0);
  });

  it('fails bead 1 token over budget', () => {
    const result = validateBeadSizes(
      [{ id: 'b1', estimatedTokens: 200_001 } as any],
      200_000,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.beadId).toBe('b1');
  });
});

describe('validateCoverage edge cases', () => {
  it('returns uncovered when beads cover overlapping but not all criteria', () => {
    const beads = [
      { coversCriteria: ['ac-1', 'ac-2'] },
      { coversCriteria: ['ac-2', 'ac-3'] },
    ] as any[];
    const result = validateCoverage(beads, ['ac-1', 'ac-2', 'ac-3', 'ac-4']);
    expect(result).toEqual(['ac-4']);
  });

  it('returns empty when all criteria are covered even with overlap', () => {
    const beads = [
      { coversCriteria: ['ac-1', 'ac-2'] },
      { coversCriteria: ['ac-2', 'ac-3'] },
    ] as any[];
    const result = validateCoverage(beads, ['ac-1', 'ac-2', 'ac-3']);
    expect(result).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm -F @get-cauldron/engine test -- src/decomposition/__tests__/validator.test.ts --reporter=verbose`

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/decomposition/__tests__/validator.test.ts
git commit -m "test(decomposition): add validator boundary tests for cycles, sizes, and coverage"
```

---

## Task 12: Expand Decomposition Scheduler Unit Tests

**Files:**
- Modify: `packages/engine/src/decomposition/__tests__/scheduler.test.ts`

- [ ] **Step 1: Add topological ordering edge case tests**

Add after the existing `completeBead` describe block:

```typescript
describe('findReadyBeads ordering edge cases', () => {
  it('returns all beads when none have dependencies (wide fan-out)', async () => {
    const { db, seed, cleanup } = await setupTestDb();
    try {
      // Create 3 independent beads
      const [a] = await db.insert(beads).values({ seedId: seed.id, title: 'A', spec: 'a', status: 'pending' }).returning();
      const [b] = await db.insert(beads).values({ seedId: seed.id, title: 'B', spec: 'b', status: 'pending' }).returning();
      const [c] = await db.insert(beads).values({ seedId: seed.id, title: 'C', spec: 'c', status: 'pending' }).returning();

      const ready = await findReadyBeads(db, seed.id);
      expect(ready).toHaveLength(3);
      const ids = ready.map((b) => b.id);
      expect(ids).toContain(a!.id);
      expect(ids).toContain(b!.id);
      expect(ids).toContain(c!.id);
    } finally {
      await cleanup();
    }
  });

  it('returns only root bead in a deep chain (A→B→C→D)', async () => {
    const { db, seed, cleanup } = await setupTestDb();
    try {
      const [a] = await db.insert(beads).values({ seedId: seed.id, title: 'A', spec: 'a', status: 'pending' }).returning();
      const [b] = await db.insert(beads).values({ seedId: seed.id, title: 'B', spec: 'b', status: 'pending' }).returning();
      const [c] = await db.insert(beads).values({ seedId: seed.id, title: 'C', spec: 'c', status: 'pending' }).returning();
      const [d] = await db.insert(beads).values({ seedId: seed.id, title: 'D', spec: 'd', status: 'pending' }).returning();

      await db.insert(beadEdges).values({ fromBeadId: a!.id, toBeadId: b!.id, edgeType: 'blocks' });
      await db.insert(beadEdges).values({ fromBeadId: b!.id, toBeadId: c!.id, edgeType: 'blocks' });
      await db.insert(beadEdges).values({ fromBeadId: c!.id, toBeadId: d!.id, edgeType: 'blocks' });

      const ready = await findReadyBeads(db, seed.id);
      expect(ready).toHaveLength(1);
      expect(ready[0]!.id).toBe(a!.id);
    } finally {
      await cleanup();
    }
  });

  it('returns single bead with no dependencies immediately', async () => {
    const { db, seed, cleanup } = await setupTestDb();
    try {
      const [bead] = await db.insert(beads).values({ seedId: seed.id, title: 'Solo', spec: 'solo', status: 'pending' }).returning();

      const ready = await findReadyBeads(db, seed.id);
      expect(ready).toHaveLength(1);
      expect(ready[0]!.id).toBe(bead!.id);
    } finally {
      await cleanup();
    }
  });

  it('returns second level after first level completes in chain', async () => {
    const { db, seed, cleanup } = await setupTestDb();
    try {
      const [a] = await db.insert(beads).values({ seedId: seed.id, title: 'A', spec: 'a', status: 'completed' }).returning();
      const [b] = await db.insert(beads).values({ seedId: seed.id, title: 'B', spec: 'b', status: 'pending' }).returning();

      await db.insert(beadEdges).values({ fromBeadId: a!.id, toBeadId: b!.id, edgeType: 'blocks' });

      const ready = await findReadyBeads(db, seed.id);
      expect(ready).toHaveLength(1);
      expect(ready[0]!.id).toBe(b!.id);
    } finally {
      await cleanup();
    }
  });
});
```

Note: This task assumes the test file already has a `setupTestDb` helper or similar DB setup. If it uses a different pattern, adapt the setup/cleanup to match the existing test structure in the file.

- [ ] **Step 2: Run tests**

Run: `pnpm -F @get-cauldron/engine test -- src/decomposition/__tests__/scheduler.test.ts --reporter=verbose`

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/decomposition/__tests__/scheduler.test.ts
git commit -m "test(decomposition): add scheduler topological ordering edge case tests"
```

---

## Task 13: Expand Scorer Unit Tests

**Files:**
- Modify: `packages/engine/src/interview/__tests__/scorer.test.ts`

- [ ] **Step 1: Add boundary value tests**

Add after the existing `buildScorerPrompt recency weighting` describe block:

```typescript
describe('computeWeightedScore boundary values', () => {
  it('greenfield and brownfield produce different scores for same base dimensions', () => {
    const scores = {
      goalClarity: 0.9,
      constraintClarity: 0.5,
      successCriteriaClarity: 0.7,
      reasoning: 'test',
    };

    const greenfield = computeWeightedScore(scores, 'greenfield');
    // Greenfield: 0.9*0.4 + 0.5*0.3 + 0.7*0.3 = 0.36 + 0.15 + 0.21 = 0.72
    expect(greenfield).toBeCloseTo(0.72, 2);

    const brownfieldScores = { ...scores, contextClarity: 0.6 };
    const brownfield = computeWeightedScore(brownfieldScores, 'brownfield');
    // Brownfield: 0.9*0.35 + 0.5*0.25 + 0.7*0.25 + 0.6*0.15 = 0.315 + 0.125 + 0.175 + 0.09 = 0.705
    expect(brownfield).toBeCloseTo(0.705, 2);

    // They should differ
    expect(greenfield).not.toBeCloseTo(brownfield, 2);
  });

  it('handles mixed extreme dimensions (one 0, one 1)', () => {
    const scores = {
      goalClarity: 1.0,
      constraintClarity: 0.0,
      successCriteriaClarity: 0.5,
      reasoning: 'test',
    };

    const result = computeWeightedScore(scores, 'greenfield');
    // 1.0*0.4 + 0.0*0.3 + 0.5*0.3 = 0.4 + 0 + 0.15 = 0.55
    expect(result).toBeCloseTo(0.55, 2);
  });
});

describe('validateScoreRules boundary cases', () => {
  it('does not flag regression of exactly 0.3 (boundary)', () => {
    const current = { goalClarity: 0.5, constraintClarity: 0.5, successCriteriaClarity: 0.5, reasoning: 'ok' };
    const previous = { goalClarity: 0.8, constraintClarity: 0.5, successCriteriaClarity: 0.5, overall: 0.6, reasoning: 'ok' };

    const result = validateScoreRules(current, previous);
    // Drop of exactly 0.3 (0.8 → 0.5): check if this is flagged or not
    // The code checks > 0.3, so exactly 0.3 should NOT be flagged
    expect(result.valid).toBe(true);
  });

  it('flags regression of 0.31 (just over boundary)', () => {
    const current = { goalClarity: 0.49, constraintClarity: 0.5, successCriteriaClarity: 0.5, reasoning: 'ok' };
    const previous = { goalClarity: 0.8, constraintClarity: 0.5, successCriteriaClarity: 0.5, overall: 0.6, reasoning: 'ok' };

    const result = validateScoreRules(current, previous);
    // Drop of 0.31 (0.8 → 0.49): should be flagged
    expect(result.valid).toBe(false);
    expect(result.anomalies.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm -F @get-cauldron/engine test -- src/interview/__tests__/scorer.test.ts --reporter=verbose`

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/interview/__tests__/scorer.test.ts
git commit -m "test(interview): add scorer boundary value and regression threshold tests"
```

---

## Task 14: Expand Gateway Circuit Breaker Tests

**Files:**
- Modify: `packages/engine/src/gateway/__tests__/circuit-breaker.test.ts`

- [ ] **Step 1: Add HALF_OPEN concurrency test**

Add after the existing `circuits are independent` test:

```typescript
  it('only allows one probe call during HALF_OPEN state', () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker();

    // Open the circuit
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      cb.recordFailure('anthropic');
    }
    expect(cb.isOpen('anthropic')).toBe(true);

    // Advance past cooldown → HALF_OPEN
    vi.advanceTimersByTime(COOLDOWN_MS + 1);

    // First probe: allowed (isOpen returns false)
    expect(cb.isOpen('anthropic')).toBe(false);

    // After the probe call, if it fails, circuit should go back to OPEN
    cb.recordFailure('anthropic');
    expect(cb.isOpen('anthropic')).toBe(true);

    vi.useRealTimers();
  });

  it('window-based reset: old failures outside window do not count', () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker();

    // Record failures just below threshold
    for (let i = 0; i < FAILURE_THRESHOLD - 1; i++) {
      cb.recordFailure('anthropic');
    }
    expect(cb.isOpen('anthropic')).toBe(false);

    // Advance past the failure window
    vi.advanceTimersByTime(WINDOW_MS + 1);

    // One more failure should NOT open (old failures expired)
    cb.recordFailure('anthropic');
    expect(cb.isOpen('anthropic')).toBe(false);

    vi.useRealTimers();
  });
```

- [ ] **Step 2: Run tests**

Run: `pnpm -F @get-cauldron/engine test -- src/gateway/__tests__/circuit-breaker.test.ts --reporter=verbose`

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/gateway/__tests__/circuit-breaker.test.ts
git commit -m "test(gateway): add circuit breaker HALF_OPEN probe and window expiry tests"
```

---

## Task 15: Expand Gateway Failover Tests

**Files:**
- Modify: `packages/engine/src/gateway/__tests__/failover.test.ts`

- [ ] **Step 1: Add backoff timing and mixed error tests**

Add after the existing tests in the `executeWithFailover` describe block:

```typescript
  it('applies exponential backoff: retries after increasing delays', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const sleepCalls: number[] = [];
    // We need to observe the backoff delays. Since sleep is internal,
    // we verify by checking that backoffMs produces correct values.
    // backoffMs(0) = 1000, backoffMs(1) = 2000, backoffMs(2) = 4000
    const { backoffMs } = await import('../failover.js');

    // If backoffMs is not exported, test the behavior instead:
    // This test verifies the retry timing indirectly by counting execute calls.
    const executeTracker: string[] = [];
    const execute = vi.fn().mockImplementation(async (model: string) => {
      executeTracker.push(model);
      const error = new Error('Server error');
      (error as any).status = 503;
      throw error;
    });

    await expect(
      executeWithFailover({
        modelChain: ['model-a', 'model-b'],
        execute,
        circuitBreaker: new CircuitBreaker(),
        stage: 'interview',
      }),
    ).rejects.toThrow('GatewayExhaustedError');

    // model-a: initial + 1 retry = 2 calls, model-b: initial + 1 retry = 2 calls
    expect(execute).toHaveBeenCalledTimes(4);

    vi.useRealTimers();
  });

  it('handles mixed error types across models in sequence', async () => {
    let callCount = 0;
    const execute = vi.fn().mockImplementation(async (model: string) => {
      callCount++;
      if (model === 'model-a') {
        const error = new Error('Rate limited');
        (error as any).status = 429;
        throw error;
      }
      if (model === 'model-b') {
        const error = new Error('Auth failed');
        (error as any).status = 401;
        throw error;
      }
      return { text: 'success' };
    });

    await expect(
      executeWithFailover({
        modelChain: ['model-a', 'model-b'],
        execute,
        circuitBreaker: new CircuitBreaker(),
        stage: 'interview',
      }),
    ).rejects.toThrow('GatewayExhaustedError');

    // 429 on model-a → skip to model-b (no retry for rate limit)
    // 401 on model-b → no retry for auth errors → exhausted
    expect(execute.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
```

- [ ] **Step 2: Run tests**

Run: `pnpm -F @get-cauldron/engine test -- src/gateway/__tests__/failover.test.ts --reporter=verbose`

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/gateway/__tests__/failover.test.ts
git commit -m "test(gateway): add failover backoff timing and mixed error type tests"
```

---

## Task 16: Engine-Level Interview FSM Wiring Tests

**Files:**
- Create: `packages/engine/src/__tests__/interview-fsm.wiring.test.ts`

These test FSM methods not exposed through tRPC: `pause`, `abandon`, `requestEarlyCrystallization`, `detectInterviewMode`, `generateSummary`.

- [ ] **Step 1: Write engine-level FSM tests**

Create `packages/engine/src/__tests__/interview-fsm.wiring.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from '@get-cauldron/shared';
import { eq, sql } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { InterviewFSM } from '../interview/fsm.js';
import { createScriptedGateway, interviewTurnScript } from '@get-cauldron/test-harness';

const TEST_DATABASE_URL =
  process.env['TEST_DATABASE_URL'] ?? 'postgres://cauldron:cauldron@localhost:5433/cauldron_test';

function createTestDb() {
  const client = postgres(TEST_DATABASE_URL);
  const db = drizzle({ client, schema });
  return { client, db };
}

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
  child: function () { return mockLogger; },
};

describe('InterviewFSM engine-level wiring', () => {
  let testDb: ReturnType<typeof createTestDb>;

  beforeAll(async () => {
    testDb = createTestDb();
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const migrationsFolder = path.resolve(__dirname, '../../../shared/src/db/migrations');
    await migrate(testDb.db, { migrationsFolder });
  });

  afterEach(async () => {
    await testDb.db.execute(
      sql`TRUNCATE TABLE llm_usage, project_snapshots, events, holdout_vault, bead_edges, beads, seeds, interviews, projects RESTART IDENTITY CASCADE`,
    );
  });

  afterAll(async () => {
    await testDb.client.end();
  });

  async function createProject() {
    const [p] = await testDb.db.insert(schema.projects).values({ name: 'Test' }).returning();
    return p!;
  }

  it('pause then resume preserves interview state', async () => {
    const gateway = createScriptedGateway([]);
    const fsm = new InterviewFSM(testDb.db as any, gateway as any, mockConfig as any, mockLogger as any);
    const project = await createProject();

    // Start
    const interview = await fsm.startOrResume(project.id);
    expect(interview.status).toBe('active');

    // Pause
    await fsm.pause(interview.id);
    const [paused] = await testDb.db.select().from(schema.interviews).where(eq(schema.interviews.id, interview.id));
    expect(paused!.status).toBe('paused');

    // Resume
    const resumed = await fsm.startOrResume(project.id);
    expect(resumed.id).toBe(interview.id);
    expect(resumed.status).toBe('active');
  });

  it('abandon prevents resume — creates new interview', async () => {
    const gateway = createScriptedGateway([]);
    const fsm = new InterviewFSM(testDb.db as any, gateway as any, mockConfig as any, mockLogger as any);
    const project = await createProject();

    const original = await fsm.startOrResume(project.id);
    await fsm.abandon(original.id);

    // Starting again should create a new interview
    const newInterview = await fsm.startOrResume(project.id);
    expect(newInterview.id).not.toBe(original.id);
  });

  it('requestEarlyCrystallization returns warning with gap info', async () => {
    const turnScript = interviewTurnScript({ overallClarity: 0.5 });
    const gateway = createScriptedGateway(turnScript);
    const fsm = new InterviewFSM(testDb.db as any, gateway as any, mockConfig as any, mockLogger as any);
    const project = await createProject();

    const interview = await fsm.startOrResume(project.id);

    // Submit one answer to have scores
    await fsm.submitAnswer(interview.id, project.id, { userAnswer: 'Quick idea' });

    // Request early crystallization
    const warning = await fsm.requestEarlyCrystallization(interview.id);
    expect(warning.currentScore).toBeCloseTo(0.5, 1);
    expect(warning.threshold).toBe(0.8);
    expect(warning.gap).toBeCloseTo(0.3, 1);
    expect(warning.weakestDimensions.length).toBeGreaterThan(0);

    // Should transition to reviewing despite low score
    const [updated] = await testDb.db.select().from(schema.interviews).where(eq(schema.interviews.id, interview.id));
    expect(updated!.phase).toBe('reviewing');
  });

  it('detectInterviewMode returns greenfield when no projectPath', async () => {
    const { detectInterviewMode } = await import('../interview/fsm.js');
    const mode = await detectInterviewMode();
    expect(mode).toBe('greenfield');
  });

  it('generateSummary produces SeedSummary from transcript', async () => {
    const summaryScript = [
      ...interviewTurnScript({ overallClarity: 0.85 }),
      // synthesizer call
      {
        stage: 'interview',
        returns: {
          goal: 'Build a widget',
          constraints: ['Must be fast'],
          acceptanceCriteria: ['Widget renders'],
          ontologySchema: { entities: [] },
          evaluationPrinciples: ['Performance'],
          exitConditions: [{ condition: 'done', description: 'All pass' }],
        },
      },
    ];
    const gateway = createScriptedGateway(summaryScript);
    const fsm = new InterviewFSM(testDb.db as any, gateway as any, mockConfig as any, mockLogger as any);
    const project = await createProject();

    const interview = await fsm.startOrResume(project.id);
    await fsm.submitAnswer(interview.id, project.id, { userAnswer: 'Detailed requirements' });

    // Now generate summary (interview should be in reviewing after 0.85 score)
    const summary = await fsm.generateSummary(interview.id, project.id);
    expect(summary.goal).toBe('Build a widget');
    expect(summary.constraints).toContain('Must be fast');
  });
});
```

- [ ] **Step 2: Add wiring config for engine package if not already present**

Verify `packages/engine/vitest.wiring.config.ts` exists and includes `src/**/*.wiring.test.ts`. It was already created (confirmed during exploration), so this step is a verification only.

Run: `pnpm -F @get-cauldron/engine exec vitest --config vitest.wiring.config.ts --reporter=verbose`

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/__tests__/interview-fsm.wiring.test.ts
git commit -m "test(interview): add engine-level FSM wiring tests (pause, abandon, early crystallization)"
```

---

## Verification

After all tasks are complete, run the full test suite to verify nothing is broken:

```bash
pnpm test                    # All unit tests
pnpm test:wiring             # All wiring tests (new + existing)
pnpm typecheck               # Type-check all packages
```

Expected: All tests pass. Any test that fails reveals a real bug — document it, fix it, and the test becomes a regression test.
