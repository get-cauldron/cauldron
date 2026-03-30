# Architecture

**Analysis Date:** 2026-03-29

## System Overview

Cauldron is a multi-agent AI software factory orchestrated through a structured pipeline. The system has four packages in a monorepo, with a clear dependency graph:

```
                    ┌─────────────┐
                    │   shared     │  (DB schema, event store, types)
                    └──────┬──────┘
                           │
                    ┌──────┴──────┐
                    │   engine    │  (7 AI submodules, LLM gateway)
                    └──┬──────┬──┘
                       │      │
              ┌────────┘      └────────┐
        ┌─────┴─────┐          ┌──────┴──────┐
        │    cli     │          │     web     │
        │ (Hono:3001)│          │ (Next.js:3000)│
        └────────────┘          └─────────────┘
                    ↕               ↕
              ┌─────────────────────────┐
              │    Inngest (Redis:6379)  │
              │    Dev Server (:8288)    │
              └─────────────────────────┘
                           ↕
              ┌─────────────────────────┐
              │   PostgreSQL (:5432)     │
              └─────────────────────────┘
```

**Two Inngest clients exist:**
- `cauldron-engine` (`packages/engine/src/holdout/events.ts`) — serves 5 durable functions via CLI's Hono server on :3001
- `cauldron-web` (`packages/web/src/inngest/client.ts`) — serves pipeline trigger function via Next.js on :3000

## Core Domain Model

### Entity Relationships

```
Project (1) ──→ (N) Interview ──→ (1) Seed
Project (1) ──→ (N) Seed (via evolution lineage)
Seed    (1) ──→ (N) Bead (via seedId)
Seed    (1) ──→ (N) HoldoutVault (via seedId)
Seed    (1) ──→ (1) Seed.parentId (self-referencing for evolution)
Bead    (N) ──→ (N) BeadEdge (DAG adjacency rows)
Project (1) ──→ (N) Event (append-only event sourcing)
```

### Lifecycle States

**Interview FSM** (`packages/engine/src/interview/fsm.ts`):
```
gathering → reviewing → approved → crystallized
              ↓ (reject)
           gathering
```

**Bead Status** (`packages/shared/src/db/schema/bead.ts`):
```
pending → claimed → active → completed
                          → failed
```

**Holdout Vault Status** (`packages/shared/src/db/schema/holdout.ts`):
```
pending_review → approved → sealed → unsealed → evaluated
```

**Seed Status** (`packages/shared/src/db/schema/seed.ts`):
```
draft → crystallized (immutable after crystallization — no updatedAt column)
```

**Evolution FSM** (`packages/engine/src/evolution/events.ts`):
```
idle → evaluating → scoring → evolving → decomposing
                              ↓ (stagnation)
                         lateral_thinking → evolving (with proposal)
                                         → halted/escalated (null result)
Terminal states: converged (goal_met), halted (budget/escalated/convergence_signal)
```

## Data Flow

### Pipeline: Interview to Execution

```
User input (CLI or Web UI)
  → tRPC mutation: interview.startInterview
    → InterviewFSM.startOrResume() creates/resumes interview row
  → tRPC mutation: interview.sendAnswer (repeats until ambiguity threshold met)
    → InterviewFSM.submitAnswer() → scorer → perspectives → ranker → next question
    → When threshold met (overall >= 0.8), phase transitions to 'reviewing'
  → tRPC mutation: interview.approveSummary
    → crystallizeSeed() → immutable seed row
    → generateHoldoutScenarios() → createVault() → holdout rows (pending_review)
  → tRPC mutation: interview.approveHoldout + sealHoldouts
    → sealVault() → AES-256-GCM encryption of scenarios
  → tRPC mutation: execution.triggerDecomposition
    → runDecomposition() → 2-pass LLM breakdown → beads + bead_edges persisted
  → tRPC mutation: execution.triggerExecution
    → findReadyBeads() → Inngest events: bead.dispatch_requested per ready bead
```

### Bead Execution Lifecycle (Inngest durable steps)

Handled by `handleBeadDispatchRequested` in `packages/engine/src/decomposition/events.ts`:

```
bead.dispatch_requested event
  → Step 1: check-upstream-waits (fan-in via step.waitForEvent)
  → Step 2: check-conditional (skip if upstream failed)
  → Step 3: claim-bead (optimistic concurrency with version column)
  → Step 4: emit-dispatched (audit event)
  → Step 5: create-worktree (isolated git worktree)
  → Step 5b: index-knowledge-graph
  → Step 6: assemble-context (knowledge graph + token budget)
  → Step 7: execute-tdd-loop (up to 5 iterations: generate tests → implement → verify)
  → Step 8: on success → enqueue merge (bead.merge_requested) + complete
            on failure → cleanup worktree + mark failed
```

### Bead Completion Fan-Out

Handled by `handleBeadCompleted` in `packages/engine/src/decomposition/events.ts`:

```
bead.completed event
  → Re-index knowledge graph (downstream beads see new code)
  → findReadyBeads() → dispatch newly-unblocked beads
```

### Merge Queue

Handled by `handleMergeRequested` in `packages/engine/src/decomposition/events.ts`:
- Serialized per project (concurrency limit 1, keyed by projectId)
- Uses `MergeQueue` class with LLM conflict resolution
- Prevents concurrent merges from corrupting main branch

### Evolution Loop

```
evolution_converged event (from convergence handler)
  → unseal vault → evaluate holdouts against code
  → If failed: emit evolution_started → evolution FSM cycle
    → evaluate goal attainment → check convergence → check stagnation
    → mutate seed → dispatch decomposition of new seed
    → Repeat until converged/halted/budget exceeded
```

### SSE Real-Time Updates

`packages/web/src/app/api/events/[projectId]/route.ts`:
- Polling-based (every 2s) against events table by sequenceNumber
- Replays missed events on connect via Last-Event-ID header
- Keepalive comments every 30s to prevent proxy timeouts
- Auth via Bearer token header or `?token=` query param

## Key Patterns

### Event Sourcing

All state changes emit events to `packages/shared/src/db/schema/event.ts` (append-only, never UPDATE). The event store (`packages/shared/src/db/event-store.ts`) provides:

- `appendEvent()` — append-only insert with auto-incrementing sequence per project
- `deriveProjectState()` — replay all events through `applyEvent()` reducer
- `replayFromSnapshot()` — replay from latest snapshot for performance
- `upsertSnapshot()` — snapshot current derived state

35 event types defined in `eventTypeEnum` covering the full pipeline lifecycle.

### Dependency Injection via Module-Level Singletons

Engine submodules use a pattern of module-level dependency holders configured at startup:

- `configureSchedulerDeps()` in `packages/engine/src/decomposition/events.ts`
- `configureVaultDeps()` in `packages/engine/src/holdout/events.ts`
- `configureEvolutionDeps()` in `packages/engine/src/evolution/events.ts`

All three are wired in `packages/cli/src/bootstrap.ts` during application startup. The web layer uses a separate lazy factory (`packages/web/src/trpc/engine-deps.ts`) cached at module level.

### Optimistic Concurrency

Bead claiming uses a `version` column for optimistic concurrency control. `claimBead()` in `packages/engine/src/decomposition/scheduler.ts` atomically claims beads to prevent double-dispatch.

### Immutability

Seeds are immutable after crystallization — the schema has no `updatedAt` column. Events are append-only. These invariants are enforced at the application layer.

### LLM Gateway with Failover

`packages/engine/src/gateway/gateway.ts` wraps Vercel AI SDK calls with:
- **Model chains**: primary + fallback models per pipeline stage
- **Circuit breaker**: per-model (`packages/engine/src/gateway/circuit-breaker.ts`)
- **Diversity enforcement**: holdout/evaluation models must differ from implementation model family
- **Budget checking**: per-project cost tracking before each call
- **Usage recording**: async write to `llm_usage` table + event emission
- **Failover callbacks**: logged as events for observability

### Error Handling Strategy

- **tRPC layer**: throws `TRPCError` with appropriate codes (CONFLICT, BAD_REQUEST, UNAUTHORIZED)
- **Inngest functions**: use `step.run()` for retryable steps; failures captured in events
- **Gateway**: `GatewayExhaustedError`, `BudgetExceededError`, `DiversityViolationError` — all in `packages/engine/src/gateway/errors.ts`
- **Agent execution**: TDD self-healing loop (up to 5 iterations) before marking bead as failed
- **Merge conflicts**: LLM-based resolution with confidence scoring; low-confidence escalates to human

### Concurrency Model

- **Bead execution**: Inngest concurrency limit of 5 per project (configurable per-project via `maxConcurrentBeads` setting)
- **Merges**: Serialized per project (concurrency limit 1) to prevent branch corruption
- **SSE polling**: 2-second interval per subscriber against shared connection pool
- **DB access**: Lazy-initialized singleton `postgres` connection via Drizzle proxy

## Module Boundaries

### `@get-cauldron/shared` (zero external deps beyond Drizzle/Zod)
- **Owns**: DB schema, client, event store, types, migrations
- **No dependencies** on engine, cli, or web
- **Used by**: engine, cli, web, test-harness

### `@get-cauldron/engine` (depends on shared)
- **Owns**: All AI logic — interview FSM, decomposition, holdout crypto, execution, evolution, gateway, intelligence
- **7 submodules**, each with its own `index.ts` barrel export
- **Inngest client**: `cauldron-engine` defined in `packages/engine/src/holdout/events.ts`
- **Used by**: cli, web

### `@get-cauldron/cli` (depends on shared + engine)
- **Owns**: CLI commands, Hono engine server, bootstrap, tRPC client
- **Serves**: 5 engine Inngest functions on port 3001 via Hono
- **Entry points**: `src/cli.ts` (CLI commands), `src/engine-server.ts` (Inngest server)

### `@get-cauldron/web` (depends on shared + engine)
- **Owns**: Next.js app, tRPC routers, SSE streaming, DAG visualization, Inngest pipeline trigger
- **Serves**: Web dashboard on port 3000, tRPC API, SSE endpoint, webhook endpoint
- **Entry point**: Next.js app router at `src/app/`

### `@get-cauldron/test-harness` (depends on shared + engine)
- **Owns**: Shared test utilities for E2E/integration testing
- **Used by**: web (devDependency)

### Coupling Analysis

- **shared↔engine**: Clean separation. Engine imports schema tables and event store functions.
- **engine↔cli**: CLI bootstraps engine deps and serves Inngest functions. Engine has no knowledge of CLI.
- **engine↔web**: Web imports engine functions directly in tRPC routers (InterviewFSM, crystallizeSeed, runDecomposition, findReadyBeads). Engine has no knowledge of web.
- **Tight coupling risk**: tRPC routers in web directly instantiate engine classes (InterviewFSM, LLMGateway). No service layer abstraction between web and engine.

## Scalability Considerations

### Current Bottlenecks

1. **SSE polling**: Each subscriber polls the events table every 2 seconds. Comment in source acknowledges this: "LISTEN/NOTIFY upgrade is a future optimization when concurrent SSE subscribers warrant dedicated DB connections."

2. **Single Inngest engine server**: All 5 engine functions run on a single Hono server (:3001). Scaling requires running multiple instances behind a load balancer (supported by Inngest's event-driven model).

3. **Module-level singletons**: `configureSchedulerDeps()`, `configureVaultDeps()`, `configureEvolutionDeps()` use module-level `let` variables. This works for single-process but complicates multi-instance deployment.

4. **DB connection pooling**: Single lazy `postgres` connection. No explicit pool sizing or connection management visible.

### Horizontal Scaling Points

- **Inngest functions**: Stateless, event-driven — can scale by running multiple engine servers
- **Web layer**: Stateless Next.js — standard horizontal scaling
- **Bead execution**: Already parallelized via Inngest with per-project concurrency limits
- **Merge queue**: Correctly serialized per project — safe across multiple instances via Inngest's concurrency controls

---

*Architecture analysis: 2026-03-29*
