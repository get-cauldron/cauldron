# Live Pipeline E2E Test Design

A single Playwright test that boots the full Cauldron stack, creates a project via the UI, and drives it through the entire pipeline to delivery using real LLM calls with an LLM-simulated user at human interaction points.

## Architecture

**File:** `packages/web/e2e/pipeline-live.spec.ts`

One test, linear flow. No mocks. Real LLM calls, real DB, real Inngest, real everything.

```
globalSetup:
  1. Check API keys (OPENAI, GOOGLE, ANTHROPIC) → skip if missing
  2. Start Docker containers (Postgres :5435, Redis :6380, Inngest :8289)
  3. Run DB migrations
  4. Start Next.js dev server (:3000) + Hono engine server (:3001)

Test:
  1. CREATE PROJECT → /projects/new, "URL Shortener Library"
  2. INTERVIEW → LLM (Haiku) answers each question adaptively
  3. CRYSTALLIZE → click banner when clarity threshold met
  4. APPROVE SEED → review summary card, click approve
  5. HOLDOUT REVIEW → approve each scenario, seal vault
  6. DECOMPOSE → trigger on execution page
  7. EXECUTE → watch bead DAG, wait for completion
  8. EVALUATE → holdout evaluation runs
  9. EVOLVE → evolution cycle or convergence
  10. ASSERT TERMINAL STATE

globalTeardown:
  - Stop servers, stop Docker containers, optionally preserve DB on failure
```

## Config Object

All tunable parameters live in a config object at the top of the test file.

```typescript
const LIVE_CONFIG = {
  project: {
    name: 'URL Shortener Library',
    description: 'A TypeScript library with shorten(url) and expand(code) functions using an in-memory store',
  },

  simulatedUser: {
    model: 'claude-haiku-4-5',
    persona: `You are a developer who wants a URL shortener library in TypeScript.
      Key requirements: shorten(url) returns a short code, expand(code) returns original URL,
      in-memory Map storage, collision-resistant codes (nanoid or similar), input validation.
      Answer concisely (1-3 sentences). If asked about constraints, mention: no external DB,
      no HTTP server, just a pure library. If asked about success criteria, mention: unit tests
      should cover round-trip shorten→expand, duplicate URLs, and invalid input.`,
  },

  models: {
    interview:           ['gpt-4.1-mini'],
    scoring:             ['gemini-2.5-flash'],
    holdout:             ['gemini-2.5-flash'],
    decomposition:       ['gpt-4.1-mini'],
    implementation:      ['gpt-4.1-mini'],
    evaluation:          ['gemini-2.5-flash'],
    context_assembly:    ['gpt-4.1-mini'],
    conflict_resolution: ['gpt-4.1-mini'],
  },

  timeouts: {
    interview:     5 * 60_000,
    crystallize:   2 * 60_000,
    holdouts:      3 * 60_000,
    decomposition: 3 * 60_000,
    execution:    15 * 60_000,
    evaluation:    5 * 60_000,
    evolution:    10 * 60_000,
  },

  budget: { limitCents: 1500 },
  maxInterviewTurns: 15,
  testTimeout: 45 * 60_000,
};
```

## Cross-Provider Diversity

The simulated user never shares a provider with the pipeline stage it's responding to:

| Role | Model | Provider |
|---|---|---|
| Simulated User | claude-haiku-4-5 | Anthropic |
| Interview | gpt-4.1-mini | OpenAI |
| Scoring | gemini-2.5-flash | Google |
| Holdout Generation | gemini-2.5-flash | Google |
| Decomposition | gpt-4.1-mini | OpenAI |
| Implementation | gpt-4.1-mini | OpenAI |
| Evaluation | gemini-2.5-flash | Google |

Holdout/evaluation (Google) uses a different provider than implementation (OpenAI), satisfying the existing diversity constraint.

## Interview Loop

The interview is driven by an LLM playing the user role:

```
while (phase === 'gathering' && turn < maxInterviewTurns):
  1. Wait for new AI message bubble in chat
  2. Extract question text from last system message
  3. Call Haiku directly via Vercel AI SDK:
     generateText({ model: anthropic('claude-haiku-4-5'), prompt: persona + question })
  4. If MC chips visible and one matches Haiku's intent → click chip
     Otherwise → type into freeform input, click Send
  5. Wait for "Thinking..." indicator to appear then disappear
  6. Assert turn count incremented
  7. If clarity banner appears → click "Crystallize Seed"
```

The Haiku call is the only direct LLM call in the test code. Everything else flows through the real pipeline.

## Infrastructure Setup

Fully self-contained. The test starts everything it needs.

**Dedicated ports** avoid conflict with dev environment:

| Service | Dev Port | Live Test Port |
|---|---|---|
| Postgres | 5432 | 5435 |
| Redis | 6379 | 6380 |
| Inngest | 8288 | 8289 |

**Setup flow:**
1. Pre-flight: check all 3 API keys exist, skip suite if missing
2. Docker: start Postgres, Redis, Inngest containers on dedicated ports
3. Database: run Drizzle migrations
4. Config: override model config to use cheap models from LIVE_CONFIG
5. Servers: start Next.js (:3000) + Hono engine (:3001) pointed at live-test services

**Teardown:**
1. Stop dev + engine servers
2. Stop and remove Docker containers
3. Optionally preserve DB on failure for post-mortem

## Stage-Gate Assertions

Every stage asserts correctness before proceeding:

| Stage | Assertions |
|---|---|
| Project created | URL is `/projects/{uuid}/interview`, name visible |
| Interview active | AI message rendered, ambiguity meter visible |
| Each turn | Turn count increments, new bubble appears, no error toasts |
| Clarity reached | Banner visible (fail if max turns without threshold) |
| Seed crystallized | Approval card shows goal, constraints, acceptance criteria |
| Seed approved | Phase shows "crystallized", holdout cards appear |
| Holdouts sealed | All cards "approved", seal complete |
| Decomposition | DAG renders with ≥1 bead |
| Bead execution | Beads transition through statuses to completion |
| All beads done | No pending/executing beads |
| Evaluation | Results visible on evolution page |
| Terminal state | goal_met, converged, or budget_exceeded |

## Error Handling

- **LLM failures:** Gateway failover handles transient errors. Stage timeouts catch hangs.
- **Pipeline bugs:** Diagnosed and fixed inline. The test is a debugging driver.
- **UI waits:** `expect().toBeVisible({ timeout })` with generous timeouts. No sleeps.
- **Screenshots:** Playwright captures on failure (existing config).
- **DB post-mortem:** Teardown optionally skips container removal on failure.

## What "Passing" Means

The test passes when the pipeline reaches any terminal state without unhandled errors. The first run is expected to surface pipeline bugs — we fix them inline and re-run until the full pipeline executes cleanly.

## Future Upgrades

The config object makes it easy to:
- Swap to stronger models once plumbing is proven
- Change the project concept to something harder
- Adjust timeouts and budget as we learn real execution profiles
