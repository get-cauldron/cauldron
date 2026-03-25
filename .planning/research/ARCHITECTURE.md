# Architecture Research

**Domain:** AI-powered autonomous software development platform
**Researched:** 2026-03-25
**Confidence:** HIGH (component patterns) / MEDIUM (Cauldron-specific integration choices)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Presentation Layer                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │   Next.js Web UI  │  │   CLI (tsx/ink)  │  │  WebSocket Feed  │  │
│  │  (React + tRPC)  │  │  (pipe to API)   │  │  (live streaming)│  │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘  │
└───────────┼────────────────────┼────────────────────┼─────────────┘
            │ tRPC HTTP/WS       │ HTTP REST          │ SSE/WS
┌───────────▼────────────────────▼────────────────────▼─────────────┐
│                         API Server Layer                           │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                 Fastify / Next.js API Routes                  │  │
│  │  - Auth middleware (sessions, API keys)                      │  │
│  │  - tRPC router (type-safe procedures)                        │  │
│  │  - WebSocket upgrade (real-time push)                        │  │
│  │  - SSE endpoints (agent log streaming)                       │  │
│  └────────┬────────────────────────────────────────┬────────────┘  │
└───────────┼────────────────────────────────────────┼───────────────┘
            │                                        │
┌───────────▼────────────────────┐  ┌───────────────▼───────────────┐
│      Orchestration Layer       │  │       Streaming Layer          │
│  ┌────────────────────────┐   │  │  ┌────────────────────────┐   │
│  │   Pipeline Orchestrator │   │  │  │   Event Bus (Redis      │   │
│  │   - Interview FSM       │   │  │  │   pub/sub or in-proc)   │   │
│  │   - Seed crystallizer   │   │  │  │   - Agent logs          │   │
│  │   - DAG builder         │   │  │  │   - Progress events     │   │
│  │   - Evolution loop FSM  │   │  │  │   - Diff streaming      │   │
│  └────────────────────────┘   │  │  └────────────────────────┘   │
│  ┌────────────────────────┐   │  └───────────────────────────────┘
│  │  Bead Scheduler (BullMQ)│   │
│  │  - DAG dependency check │   │
│  │  - Atomic bead claim    │   │
│  │  - Fan-out / fan-in     │   │
│  │  - Retry & dead-letter  │   │
│  └────────────────────────┘   │
└───────────┬────────────────────┘
            │ job dispatch
┌───────────▼────────────────────────────────────────────────────────┐
│                         Execution Layer                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │  Agent Runner #1  │  │  Agent Runner #2  │  │  Agent Runner #N │  │
│  │  - Fresh context  │  │  - Fresh context  │  │  - Fresh context │  │
│  │  - Git worktree   │  │  - Git worktree   │  │  - Git worktree  │  │
│  │  - Scoped MCP     │  │  - Scoped MCP     │  │  - Scoped MCP    │  │
│  └────────┬──────────┘  └────────┬──────────┘  └────────┬─────────┘  │
│           │                     │                      │            │
│  ┌────────▼─────────────────────▼──────────────────────▼─────────┐  │
│  │                    LLM Gateway (Vercel AI SDK)                  │  │
│  │  - Provider routing (Anthropic, OpenAI, Google, etc.)          │  │
│  │  - Streaming abstraction (streamText)                          │  │
│  │  - Per-stage model assignments                                 │  │
│  │  - Retry, fallback, rate-limit handling                        │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
            │                     │                      │
┌───────────▼─────────────────────▼──────────────────────▼──────────┐
│                        Support Services                             │
│  ┌────────────────┐  ┌─────────────────┐  ┌───────────────────┐   │
│  │ Code Intel MCP │  │ Holdout Vault   │  │ Git Merge Service │   │
│  │ (codebase-mem) │  │ (AES-256-GCM    │  │ (worktree → main) │   │
│  │ - Knowledge    │  │  encrypted at   │  │ - Conflict detect │   │
│  │   graph        │  │  rest, unsealed │  │ - Sequential merge│   │
│  │ - Sub-ms query │  │  post-eval)     │  │   gate            │   │
│  │ - Incremental  │  └─────────────────┘  └───────────────────┘   │
│  │   re-index     │                                                │
│  └────────────────┘                                                │
└─────────────────────────────────────────────────────────────────────┘
            │
┌───────────▼─────────────────────────────────────────────────────────┐
│                          Persistence Layer                           │
│  ┌──────────────────────┐  ┌──────────────────────┐                 │
│  │  PostgreSQL           │  │  Redis               │                 │
│  │  - Seeds (immutable)  │  │  - BullMQ queues     │                 │
│  │  - Beads + DAG edges  │  │  - Pub/sub channels  │                 │
│  │  - Agent sessions     │  │  - Bead claim locks  │                 │
│  │  - Event log          │  │  - Session cache     │                 │
│  │  - Holdout vault      │  │                      │                 │
│  │  - Evolution lineage  │  └──────────────────────┘                 │
│  └──────────────────────┘                                            │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Web UI** | Socratic interview chat, DAG visualization, real-time agent log tailing, project management | Next.js 15 App Router, React, tRPC client |
| **CLI** | All pipeline operations accessible from terminal, git-push trigger | Node.js with `commander` or `ink`, calls same API |
| **API Server** | HTTP/WebSocket gateway, auth, tRPC procedures, SSE stream multiplexer | Fastify or Next.js Route Handlers + tRPC |
| **Pipeline Orchestrator** | Interview FSM, seed crystallization, decomposition dispatch, evolution loop FSM | TypeScript state machine, stateless orchestrator reading DB state |
| **Bead Scheduler** | DAG-aware job dispatch, dependency resolution, atomic bead claiming, fan-out/fan-in gates | BullMQ on Redis — parent-child job flows |
| **Agent Runner** | Executes one bead end-to-end: context assembly → LLM call → file edits → test run | Stateless worker process, receives bead ID, reads full context from DB |
| **LLM Gateway** | Multi-provider routing, streaming, model assignment per pipeline stage | Vercel AI SDK (`streamText`, `generateText`) |
| **Code Intelligence MCP** | Codebase knowledge graph, sub-ms queries for agent context loading, incremental re-index | `codebase-memory-mcp` (DeusData) or `codegraph` |
| **Holdout Vault** | Encrypt holdout tests at generation time, gate unsealing until post-evolution evaluation | AES-256-GCM via Node `crypto`, key in separate env scope |
| **Git Merge Service** | Merge completed worktree branches back to project main, detect conflicts, sequence merges | Node.js `simple-git`, ordered merge queue |
| **Event Bus** | Route agent progress events (logs, diffs, status) to subscribed SSE/WebSocket connections | Redis pub/sub or in-process EventEmitter for single-node v1 |
| **PostgreSQL** | Immutable seeds, bead DAGs, agent sessions, event logs, evolution lineage | Prisma ORM, event-sourced append-only tables |
| **Redis** | BullMQ backing store, pub/sub for streaming, atomic bead claim locks | Redis 7+, managed via `ioredis` |

## Recommended Project Structure

```
cauldron/
├── apps/
│   ├── web/                    # Next.js web dashboard
│   │   ├── app/                # App Router pages
│   │   │   ├── projects/       # Project list and detail
│   │   │   ├── interview/      # Socratic interview chat UI
│   │   │   └── execution/      # DAG visualization + live logs
│   │   └── components/         # React components
│   └── cli/                    # CLI application
│       ├── commands/           # Command handlers (interview, run, status)
│       └── index.ts            # Entry point
├── packages/
│   ├── api/                    # tRPC router (shared type-safe contract)
│   │   ├── routers/            # Per-domain routers
│   │   └── index.ts            # Root router export
│   ├── core/                   # Domain logic (no framework deps)
│   │   ├── interview/          # Ambiguity scoring, FSM
│   │   ├── seed/               # Seed schema, crystallization
│   │   ├── decomposition/      # Molecule/bead decomposition
│   │   ├── scheduler/          # DAG builder, BullMQ wiring
│   │   ├── runner/             # Agent runner, context assembly
│   │   ├── evolution/          # Evaluation, convergence detection
│   │   └── holdout/            # Encrypt/decrypt holdout vault
│   ├── db/                     # Prisma schema + generated client
│   │   ├── schema.prisma       # All models
│   │   └── migrations/         # Migration history
│   ├── llm/                    # Vercel AI SDK wrappers
│   │   ├── gateway.ts          # Provider routing, model config
│   │   └── models.ts           # Stage-to-model assignments
│   └── shared/                 # Types shared across packages
│       ├── types/              # Seed, Bead, Agent session types
│       └── constants.ts        # Pipeline stage names, status enums
├── services/
│   ├── scheduler/              # BullMQ worker process (bead execution)
│   │   └── worker.ts           # Worker entry, job processors
│   └── code-intel/             # codebase-memory-mcp process wrapper
├── turbo.json                  # Turborepo build graph
└── package.json                # pnpm workspace root
```

### Structure Rationale

- **apps/ vs packages/:** Apps are deployable surfaces (Next.js, CLI). Packages are reusable logic with no deployment concern. The `core/` package has zero framework dependencies, enabling unit testing without mocking HTTP.
- **packages/api/:** tRPC router lives here — not inside `apps/web/` — so the CLI can import the same types and call procedures. Single contract, no drift.
- **packages/core/:** All domain state machines (interview FSM, evolution loop) are pure TypeScript with no framework deps. This is the most testable code in the system.
- **services/:** Long-running worker processes that are not HTTP servers. The scheduler worker runs BullMQ job processing independently of the web server.

## Architectural Patterns

### Pattern 1: Event-Sourced Agent State

**What:** All agent actions, observations, and pipeline state transitions are appended to an immutable event log. No state is updated in-place — only new events are written. Current state is derived by replaying events or from a materialized snapshot.

**When to use:** Required for Cauldron because seeds are immutable by spec, evolution produces new seeds (not mutations), and agent sessions must be resumable after crashes.

**Trade-offs:** More complex reads (need projections or snapshots), but enables full lineage tracking, deterministic replay, and clean rollback by simply not applying events forward.

```typescript
// Append-only event log — never update rows
interface PipelineEvent {
  id: string;
  projectId: string;
  seedId: string;
  type: 'seed.crystallized' | 'bead.claimed' | 'bead.completed' | 'agent.output' | 'evolution.triggered';
  payload: Record<string, unknown>;
  occurredAt: Date;
}

// State derived from events, never stored directly
function deriveBeadStatus(events: PipelineEvent[], beadId: string): BeadStatus {
  // replay events for this bead in order
}
```

### Pattern 2: Git Worktree per Bead

**What:** Each agent runner checks out an isolated git worktree before executing a bead. The worktree is a separate directory linked to the same `.git` repo but with its own working tree and branch. Multiple agents write to independent worktrees simultaneously with zero filesystem conflict.

**When to use:** Any time two beads could touch overlapping files. This is the primary isolation mechanism for parallel execution in Cauldron.

**Trade-offs:** Worktrees solve filesystem isolation cleanly. They do NOT solve database isolation (shared local DB, docker daemon, caches). For v1, non-filesystem side effects must be avoided or sequenced. Merge conflicts must be resolved after worktrees complete — use a sequential merge queue.

```typescript
import simpleGit from 'simple-git';

async function createBeadWorktree(projectPath: string, beadId: string): Promise<string> {
  const git = simpleGit(projectPath);
  const branchName = `bead/${beadId}`;
  const worktreePath = `/tmp/cauldron-worktrees/${beadId}`;
  await git.raw(['worktree', 'add', '-b', branchName, worktreePath, 'HEAD']);
  return worktreePath;
}

async function teardownBeadWorktree(projectPath: string, beadId: string): Promise<void> {
  const git = simpleGit(projectPath);
  await git.raw(['worktree', 'remove', `/tmp/cauldron-worktrees/${beadId}`]);
}
```

### Pattern 3: Atomic Bead Claiming with BullMQ

**What:** Beads are represented as BullMQ jobs. A bead is only dispatched when all its `blocks` dependencies are in `completed` state. Claiming is atomic — BullMQ's Redis-backed lock prevents two workers from processing the same bead. Fan-out (parallel beads) and fan-in (synchronization gates via `waits-for`) map directly to BullMQ's parent-child flow model.

**When to use:** All bead scheduling in Cauldron. BullMQ's `FlowProducer` supports parent-child DAGs natively, where a parent job only becomes active when all children complete.

**Trade-offs:** BullMQ requires Redis. This is acceptable — Redis is already needed for pub/sub streaming. The alternative (custom DB-level locking) is significantly more fragile.

```typescript
import { FlowProducer } from 'bullmq';

const flow = new FlowProducer({ connection: redisConnection });

// Fan-out: all children execute in parallel; parent waits for all
await flow.add({
  name: 'molecule:auth-system',
  queueName: 'molecules',
  children: [
    { name: 'bead:login-route', queueName: 'beads', data: { beadId: 'b1' } },
    { name: 'bead:session-middleware', queueName: 'beads', data: { beadId: 'b2' } },
    { name: 'bead:user-model', queueName: 'beads', data: { beadId: 'b3' } },
  ],
});
```

### Pattern 4: Stateless Agent Runners with Context Assembly

**What:** An agent runner receives only a `beadId`. It queries all context it needs at startup (bead spec, relevant code from Code Intel MCP, dependent bead outputs, seed constraints). The LLM call is made with this assembled context in a single fresh context window. The runner writes outputs back to the worktree and DB, then exits. No state lives in the runner process.

**When to use:** All bead execution. This is the "fresh context per bead" requirement from the spec.

**Trade-offs:** Requires fast context assembly (hence sub-ms Code Intel MCP queries). The runner must be idempotent — if it crashes mid-run, re-claiming the bead from its last checkpoint should produce the same result.

```typescript
async function runBead(beadId: string): Promise<void> {
  // 1. Load bead spec
  const bead = await db.bead.findUnique({ where: { id: beadId }, include: { seed: true, dependencies: true } });

  // 2. Assemble context from Code Intel MCP (sub-ms queries)
  const codeContext = await codeIntelMCP.query({ symbols: bead.requiredSymbols, files: bead.touchedFiles });

  // 3. Build single prompt with full context — no multi-turn state from prior beads
  const prompt = buildBeadPrompt(bead, codeContext);

  // 4. Execute in isolated worktree
  const worktreePath = await createBeadWorktree(projectPath, beadId);
  const result = await streamText({ model: assignedModel(bead), prompt, maxTokens: 100_000 });

  // 5. Write outputs, run tests, record completion event
  await applyResultToWorktree(result, worktreePath);
  await appendEvent({ type: 'bead.completed', beadId, output: result.summary });
}
```

### Pattern 5: Holdout Vault with Envelope Encryption

**What:** Holdout tests are encrypted immediately after human approval, before any implementation agent runs. Encryption uses AES-256-GCM (envelope encryption: data key encrypted by a master key). The master key lives in a separate environment variable scope that agent runner processes cannot read. Decryption only occurs post-evolution when the holdout seal evaluator runs.

**When to use:** Required by spec. Prevents the same LLM family that implements the code from reading tests that could expose blind spots.

**Trade-offs:** Adds unsealing ceremony to evaluation step. Key management in v1 can be a simple env-var split (e.g., `HOLDOUT_MASTER_KEY` not set in agent runner env). Production v2 would use a KMS.

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

function encryptHoldout(tests: string, masterKey: Buffer): { ciphertext: string; encryptedDek: string; iv: string } {
  const dek = randomBytes(32);                            // data encryption key
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', dek, iv);
  const ciphertext = Buffer.concat([cipher.update(tests, 'utf8'), cipher.final()]).toString('base64');
  // Encrypt DEK with master key (envelope encryption)
  const dekIv = randomBytes(12);
  const dekCipher = createCipheriv('aes-256-gcm', masterKey, dekIv);
  const encryptedDek = Buffer.concat([dekCipher.update(dek), dekCipher.final()]).toString('base64');
  return { ciphertext, encryptedDek, iv: iv.toString('base64') };
}
```

## Data Flow

### Full Pipeline: User Input → Tested Software

```
User describes goal (Web UI / CLI)
    ↓
Interview Orchestrator (FSM)
    - Multi-perspective question generation (researcher, architect, simplifier, breadth-keeper, seed-closer)
    - Ambiguity scoring matrix: goal clarity 40%, constraint clarity 30%, success criteria 30%
    - Loop until ambiguity score ≤ 0.2
    ↓
Seed Crystallizer
    - Structured summary → human approval
    - Immutable Seed created in DB (YAML: goal, constraints, acceptance criteria, ontology)
    ↓
Holdout Generator (cross-model: different LLM family than implementer)
    - Generate adversarial test suite
    - Human review + approval
    - Encrypt with AES-256-GCM → store ciphertext in Holdout Vault
    ↓
Decomposition Agent
    - Seed → molecules (non-atomic parent tasks) + beads (atomic leaf tasks)
    - Dependency edges: blocks, parent-child, conditional-blocks, waits-for
    - DAG stored in DB (Bead + BeadEdge tables)
    ↓
Bead Scheduler (BullMQ)
    - Build FlowProducer job tree from DAG
    - Dispatch ready beads (no unresolved `blocks` deps)
    - Fan-out: parallel beads dispatched concurrently
    ↓ (per bead, in parallel)
Agent Runner (one per bead)
    - Claim bead atomically
    - Create git worktree (branch: bead/<id>)
    - Assemble context: bead spec + Code Intel MCP queries + dep outputs
    - LLM call via Vercel AI SDK (streamText)
    - Apply edits to worktree
    - Run unit tests in worktree
    - Emit progress events to Event Bus (Redis pub/sub)
    - On success: append bead.completed event, release worktree
    ↓ (fan-in: waits-for gates)
Git Merge Service
    - Merge completed bead worktrees sequentially into project branch
    - Detect and surface conflicts (escalate to human if unresolvable)
    ↓
Evaluator
    - Run integration + E2E tests against merged codebase
    - Score against seed acceptance criteria (not just spec pass/fail)
    ↓ (if criteria not met)
Evolution Orchestrator
    - Crystallize new immutable Seed (evolution lineage: seed N+1 → parent seed N)
    - Convergence check: ontology stability, stagnation, oscillation, hard cap
    - If stagnated: activate lateral thinking persona (contrarian, hacker, simplifier)
    - If convergence unlikely: escalate to human
    - Loop back to Decomposition
    ↓ (if criteria met)
Holdout Unsealer
    - Decrypt holdout tests (master key injected by operator)
    - Run adversarial test suite against final build
    - Final pass/fail report
```

### Real-Time Streaming: Agent Output → Web Dashboard

```
Agent Runner
    ↓ emits per-token / per-action events
Event Bus (Redis pub/sub channel: project:<id>:events)
    ↓ subscriber in API Server
SSE handler (GET /api/projects/:id/stream)
    ↓ HTTP chunked transfer, text/event-stream
Web UI (React EventSource or SWR with streaming)
    ↓ renders
DAG visualization updates bead status
Log panel tails agent output tokens
Diff panel shows file changes as they happen
```

**Protocol choice:** Use SSE for server-to-client streaming (agent logs, DAG status updates). SSE is unidirectional but simpler than WebSockets, sufficient for dashboard log tailing. Use WebSockets (or tRPC subscriptions) for bidirectional flows that require client signals mid-session (e.g., human approval gates during interview, agent escalation confirmations). This two-protocol split maps to actual communication needs rather than over-engineering a full WebSocket everywhere.

### Context Assembly: Agent Runner → LLM

```
Bead spec (from DB)
    + Seed constraints (goal, acceptance criteria, ontology)
    + Dependency outputs (completed beads: their summaries/outputs)
    + Code context (Code Intel MCP: relevant symbols, call graphs, file snippets — ~3,400 tokens vs ~412,000 for full codebase)
    + Tool definitions (file edit, run tests, read file)
    ──────────────────────────────────────
    Target: ≤ 150k tokens total (leaves room in 200k window for generation)
```

## Build Order (Critical Path)

This is the dependency chain that determines phase sequencing:

```
Phase 1: Persistence Foundation
  - Prisma schema (all models: Project, Seed, Bead, BeadEdge, Event, HoldoutVault)
  - PostgreSQL + Redis infrastructure
  - BullMQ wiring (basic job dispatch)
  [Required by: everything]

Phase 2: LLM Gateway + Agent Runner Shell
  - Vercel AI SDK provider routing
  - Stage-to-model assignment config
  - Basic stateless agent runner (receives beadId, calls LLM, writes output)
  - Git worktree lifecycle (create, use, teardown)
  [Required by: interview, decomposition, execution]

Phase 3: Interview + Seed Pipeline
  - Ambiguity scoring matrix
  - Interview FSM (multi-perspective question generation)
  - Seed crystallization + immutable storage
  - Holdout generation + encryption (envelope encryption in vault)
  [Required by: decomposition, evolution]

Phase 4: Decomposition + Scheduler
  - Molecule/bead decomposition agent
  - DAG builder (4 dependency types)
  - BullMQ FlowProducer wiring (parent-child)
  - Atomic bead claiming
  [Required by: execution]

Phase 5: Parallel Execution
  - Full agent runner (context assembly, Code Intel MCP integration, worktree execution)
  - Git merge service (sequential merge queue)
  - Fan-out/fan-in synchronization
  - Event streaming to Event Bus
  [Required by: evaluation, UI streaming]

Phase 6: Evaluation + Evolution Loop
  - Evaluator (test runner, acceptance criteria scoring)
  - Evolution FSM (convergence detection, lateral personas, escalation)
  - Holdout unsealing
  [Required by: full pipeline demo]

Phase 7: Web Dashboard
  - Next.js UI (interview chat, DAG visualization, log streaming)
  - tRPC API contract
  - SSE stream endpoint
  [Can be built in parallel with Phases 4-6, unblocked after Phase 2]

Phase 8: CLI
  - CLI interface calling same tRPC API
  - Git-push trigger
  [Unblocked after Phase 7 API is stable]
```

**Critical path:** Phases 1 → 2 → 3 → 4 → 5 → 6. The Web UI (Phase 7) can be developed in parallel starting at Phase 4 because the API contract can be designed ahead of implementation. The CLI (Phase 8) is the last dependency.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-5 concurrent projects | Monolith is fine. Single Next.js process handles API + web. Single BullMQ worker. In-process EventEmitter for streaming. |
| 5-50 concurrent projects | Split API server from worker process. Upgrade EventEmitter to Redis pub/sub. Add BullMQ worker concurrency (multiple jobs per worker). |
| 50+ concurrent projects | Horizontal scaling of worker processes. Consider dedicated Code Intel MCP service. Add connection pooling (PgBouncer). Consider separate streaming service (Soketi). |

### Scaling Priorities

1. **First bottleneck: Agent workers** — each agent runner holds an LLM request open for minutes. With many parallel beads, this exhausts worker slots. Fix: horizontal BullMQ worker scaling with fine-grained concurrency limits per queue.
2. **Second bottleneck: Git operations** — worktree creation and merge operations block on disk I/O. Fix: dedicated Git service with pooled repo mounts, or move to ephemeral cloud VMs per bead.

## Anti-Patterns

### Anti-Pattern 1: Sharing a Single Working Directory Across Agents

**What people do:** Run multiple agents against the same checked-out repo without isolation.
**Why it's wrong:** Agents writing to the same files simultaneously causes non-deterministic corruption. Lost updates, merge conflicts hidden in the execution loop, and non-reproducible runs.
**Do this instead:** Git worktree per bead, always. The worktree overhead (~50ms create/teardown) is negligible compared to LLM execution time.

### Anti-Pattern 2: Passing Full Codebase to Each Agent

**What people do:** Include the entire repo content in every agent's context window.
**Why it's wrong:** At scale, a large codebase easily exceeds the context window. Even within limits, token costs and latency explode. Research shows ~412,000 tokens for a mid-size codebase vs ~3,400 tokens with a knowledge graph — 99% token reduction.
**Do this instead:** Code Intelligence MCP queries for relevant symbols, call graphs, and file snippets. Agents receive only what the bead actually touches.

### Anti-Pattern 3: Mutating Seeds

**What people do:** Update the seed spec when new requirements emerge during execution.
**Why it's wrong:** Loses lineage, makes rollback ambiguous, and mixes "what was planned" with "what was discovered." Agents executing against a mutating target produce inconsistent outputs.
**Do this instead:** Create a new seed (seed N+1) with evolution lineage pointer. Seeds are immutable once crystallized — this is a core invariant.

### Anti-Pattern 4: Implementing Bead Scheduling with DB Polling

**What people do:** A loop that polls a `beads` table every N seconds to find ready beads.
**Why it's wrong:** Race conditions on claim, high DB load, sluggish fan-in detection, no retry semantics. Custom locking code is fragile.
**Do this instead:** BullMQ with Redis-backed atomic job claiming. FlowProducer handles parent-child dependencies natively. The operational overhead of Redis is well worth it vs. reinventing a job queue.

### Anti-Pattern 5: Single LLM Provider for All Pipeline Stages

**What people do:** Use the same model for interview, decomposition, implementation, holdout generation, and evaluation.
**Why it's wrong:** Correlated blind spots. If the implementer model generated the holdout tests, it will have the same reasoning gaps in both. The adversarial test value is lost.
**Do this instead:** Enforce cross-model diversity for holdout generation. Different LLM family (e.g., Anthropic for implementation, OpenAI for holdout) or at minimum different model series.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Anthropic API | Vercel AI SDK `anthropic()` provider | Primary implementation model |
| OpenAI API | Vercel AI SDK `openai()` provider | Holdout generation (cross-model diversity) |
| Google Gemini | Vercel AI SDK `google()` provider | Evaluation agent alternative |
| codebase-memory-mcp | MCP client (stdio or HTTP) spawned per project | Sub-ms queries; must be scoped to project path |
| Redis | `ioredis` client | BullMQ + pub/sub from same instance |
| PostgreSQL | Prisma client | Connection pooling needed for parallel agents |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Web UI ↔ API Server | tRPC HTTP + WebSocket subscriptions | Type-safe, no manual schema maintenance |
| CLI ↔ API Server | tRPC HTTP (same router as web UI) | CLI imports `@cauldron/api` types directly |
| API Server ↔ Bead Scheduler | BullMQ job enqueue via Redis | Fire-and-forget enqueue; progress via Event Bus |
| Bead Scheduler ↔ Agent Runner | BullMQ job processor (same process or separate worker) | Worker process separation for v1 scaling |
| Agent Runner ↔ Code Intel MCP | MCP client protocol (stdio JSON-RPC) | Spawn one MCP server per project, reuse across beads |
| Agent Runner ↔ LLM Gateway | Vercel AI SDK in-process call | No HTTP hop; gateway is a library, not a service |
| Agent Runner ↔ Event Bus | Redis `PUBLISH` | One-way; runner publishes, API Server subscribes |
| API Server ↔ Web UI (streaming) | SSE (`text/event-stream`) for logs/DAG; WS for human gates | Split by directionality requirement |

## Sources

- OpenHands Software Agent SDK paper (ICLR 2025): https://arxiv.org/html/2511.03690v1 [HIGH confidence — peer-reviewed, current]
- OpenHands Docker Sandbox docs: https://docs.openhands.dev/sdk/guides/agent-server/docker-sandbox [HIGH confidence — official docs]
- Git Worktrees for Parallel AI Agents (Upsun): https://devcenter.upsun.com/posts/git-worktrees-for-parallel-ai-agents/ [MEDIUM confidence — practitioner article, patterns verified against multiple sources]
- Claude Code built-in worktree support announcement: https://www.threads.com/@boris_cherny/post/DVAAnexgRUj [MEDIUM confidence — product announcement, verifies pattern adoption]
- BullMQ DAG scheduling docs: https://docs.bullmq.io/guide/parallelism-and-concurrency [HIGH confidence — official docs]
- Vercel AI Gateway architecture: https://vercel.com/i/llm-gateway [HIGH confidence — official Vercel docs]
- AI SDK docs: https://ai-sdk.dev/docs/introduction [HIGH confidence — official docs]
- Replit Agent 4 parallel agents: https://blog.replit.com/introducing-agent-4-built-for-creativity [MEDIUM confidence — product blog, validates parallel agent pattern]
- codebase-memory-mcp: https://github.com/DeusData/codebase-memory-mcp [HIGH confidence — project directly referenced in Cauldron spec]
- WebSockets vs SSE for AI agents (2025): https://dev.to/polliog/server-sent-events-beat-websockets-for-95-of-real-time-apps-heres-why-a4l [MEDIUM confidence — practitioner analysis]
- Event sourcing with PostgreSQL: https://ricofritzsche.me/how-i-built-an-aggregateless-event-store-with-typescript-and-postgresql/ [MEDIUM confidence — verified against multiple PostgreSQL event sourcing sources]

---
*Architecture research for: AI-powered autonomous software development platform (Cauldron)*
*Researched: 2026-03-25*
