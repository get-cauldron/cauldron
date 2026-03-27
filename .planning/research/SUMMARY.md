# Project Research Summary

**Project:** Cauldron — AI-powered autonomous software factory
**Domain:** Multi-agent software development platform with evolutionary loops and DAG orchestration
**Researched:** 2026-03-25
**Confidence:** HIGH

## Executive Summary

Cauldron is a novel class of software product: an L3→L4 autonomous software factory built around spec-as-truth, fresh context per task, adversarial cross-model validation, and evolutionary loops — none of which exist fully assembled in any commercial competitor. The field has a clear table-stakes baseline (natural language to full-stack code, sandboxed execution, real-time progress visibility, self-healing error correction), but every current platform — Devin, Cursor 2.0, Replit Agent 3, AWS Kiro — stops short of the full pipeline Cauldron is building. The recommended approach is a TypeScript monorepo using Next.js 16, Vercel AI SDK, Inngest for durable orchestration, Drizzle + PostgreSQL for persistence, and BullMQ + Redis for atomic bead scheduling. All versions are confirmed against npm as of 2026-03-25.

The critical architectural insight is that Cauldron's pipeline is a strict dependency chain: an immutable seed cannot exist without a completed Socratic interview; a bead DAG cannot exist without a seed; parallel execution cannot be safe without atomic claiming, git worktrees, and DAG cycle detection; and the evolutionary loop cannot be trusted without cross-model encrypted holdout tests. This dependency ordering must directly govern phase sequencing — building the persistence foundation first, then LLM gateway, then interview/seed, then decomposition/scheduling, then execution, then evaluation/evolution. The web dashboard and CLI are the final surfaces and can be developed in parallel with later pipeline phases.

The two highest-risk areas are the holdout test security boundary (key leakage to agents would silently void the adversarial guarantee) and evolutionary loop runaway (without hard caps and multi-signal convergence detection, the loop will burn tokens without converging). Both are architectural issues that are expensive to retrofit — they must be designed correctly in their respective phases or the core value proposition of Cauldron collapses. Every other pitfall (context rot, vibe testing, race conditions, DAG deadlock, index staleness) has a clear mitigation strategy and is contained to a specific phase.

---

## Key Findings

### Recommended Stack

The stack is a tight, AI-first TypeScript monorepo. Next.js 16 + Vercel AI SDK 6 is the recommended dashboard/interview layer because their integration is first-class and native SSE streaming is built in. Inngest 4 replaces BullMQ as the durable job orchestration layer for agent workflows because it provides step-level retry, `step.waitForEvent()` fan-in gates, and durable execution out of the box — BullMQ alone would require building those durability primitives manually. Drizzle ORM wins over Prisma for its 90% smaller bundle and SQL-transparent query model, which is important for the complex DAG edge queries the scheduler will make. PostgreSQL is required over SQLite because concurrent agent workers need row-level locking and JSONB edge metadata. Hono serves the agent worker API as a separate process from Next.js to allow independent scaling.

For testing, Vitest is the clear choice for unit and integration tests in a TypeScript monorepo (10-20x faster than Jest in watch mode, native ESM), and Playwright for E2E. The testing cube (unit + integration + E2E with equal depth) is mandated as an architectural constraint, not a nice-to-have. Integration tests must use real PostgreSQL via Docker Compose — not mocked databases — to avoid the exact failure mode documented in project memory (92 passing tests, 3 real bugs found in 2 minutes of manual testing).

**Core technologies:**
- **Next.js 16.2.1**: Web dashboard, Socratic interview chat, SSE streaming — tightest Vercel AI SDK integration
- **Vercel AI SDK 6.0.138**: Multi-provider LLM interface — `streamText`, `generateText`, provider unification
- **Hono 4.12.9**: Standalone agent worker API — 3x Express throughput, edge-compatible, first-class TS
- **Inngest 4.1.0**: Durable job orchestration — step-level retry, fan-in gates, AI-workflow-native
- **Drizzle ORM 0.45.1 + PostgreSQL**: Persistence layer — 90% smaller than Prisma, SQL-transparent DAG queries
- **Redis + ioredis 5.10.1**: Inngest backing store, pub/sub streaming, distributed bead claim locks
- **BullMQ (via Inngest) + FlowProducer**: DAG-aware atomic job dispatch — parent-child dependency semantics
- **@xyflow/react 12.10.1 + @dagrejs/dagre 3.0.0**: Live DAG visualization in dashboard
- **Vitest 4.1.1 + Playwright 1.58.2**: Testing cube — unit/integration + E2E
- **Turborepo + pnpm workspaces**: Monorepo task runner — ~5 packages is its sweet spot
- **node:crypto (built-in)**: Holdout vault AES-256-GCM envelope encryption — no external dep surface

### Expected Features

See `/Users/zakkeown/Code/cauldron/.planning/research/FEATURES.md` for full competitor analysis and dependency graph.

**Must have (table stakes — users expect these from any AI dev platform):**
- Natural language to full-stack code generation (end-to-end, not snippet)
- Self-healing autonomous error correction (read logs, iterate, rerun tests)
- Sandboxed execution environment (per-bead agent isolation)
- Real-time progress visibility (streaming logs + diffs)
- Git integration (branch isolation per parallel execution track)
- Multi-provider model selection (Vercel AI SDK abstraction)
- Project persistence across sessions (event-store or persistent checkpointing)
- Test generation (all three levels)
- CLI interface (parallel surface to web dashboard)

**Should have (Cauldron's defining differentiators — no competitor has these):**
- Socratic interview with deterministic ambiguity scoring (≤ 0.2 gate before crystallization)
- Immutable seed spec with full lineage tracking (cryptographic foundation, never mutate)
- Cross-model holdout tests encrypted at rest, inaccessible to implementation agents
- DAG-based bead decomposition with explicit dependency types (blocks, parent-child, conditional-blocks, waits-for)
- Fresh context window per bead — structural context rot prevention, not after-the-fact workaround
- Evolutionary loop with convergence detection and lateral thinking personas on stagnation
- Testing cube at equal depth across unit + integration + E2E (not the pyramid)
- Live DAG visualization as first-class UI surface (HZD Cauldron aesthetic)
- Structured autonomy with human escalation gates (not full autonomy, not copilot — the middle path)
- Brownfield codebase knowledge graph with sub-ms queries (v1.x, after greenfield pipeline validated)

**Defer to v2+:**
- Digital twins / mock servers for third-party integrations (Clerk, Stripe, AWS)
- Deployment pipeline integration
- Real-time multi-user collaboration
- Multi-tenant SaaS hosting

**Explicit anti-features (do not build):**
- Mutable specs (use evolution to create new seeds instead)
- Credit-burn model charging for AI error correction loops
- Fully autonomous no-human mode (adversarial holdouts require human review)
- Drag-and-drop visual workflow builder (visual output, not visual input)
- Streaming vibe-coding token output (stream execution status and diff summaries instead)

### Architecture Approach

Cauldron's architecture is a layered pipeline with strict component responsibilities and no shared state between agent runners. The persistence foundation is append-only event sourcing — seeds are immutable, evolution produces new seeds with lineage pointers, all state transitions are event log entries, and current state is derived from event replay or materialized snapshots. Agent runners are stateless: they receive a `beadId`, assemble context from the database and Code Intel MCP, execute in an isolated git worktree, and write outputs back. They hold no cross-bead state. This stateless design makes parallel execution safe and crash recovery trivial (re-claiming a bead from its checkpoint is idempotent).

The monorepo structure separates `apps/` (deployable surfaces: Next.js web dashboard, CLI) from `packages/` (domain logic with no framework deps: `core/`, `db/`, `llm/`, `api/`). The `packages/core/` package contains all domain state machines (interview FSM, evolution loop, ambiguity scoring) as pure TypeScript — testable without mocking HTTP. The tRPC router lives in `packages/api/` so both the web dashboard and CLI share the same type-safe contract without schema drift.

**Major components:**
1. **Pipeline Orchestrator (Interview FSM + Evolution FSM)** — multi-perspective question generation, ambiguity scoring matrix, seed crystallization, convergence detection, lateral thinking activation
2. **Bead Scheduler (Inngest + BullMQ FlowProducer)** — DAG dependency resolution, atomic bead claiming, fan-out/fan-in synchronization gates
3. **Agent Runner (stateless, per-bead)** — context assembly from DB + Code Intel MCP, git worktree lifecycle, LLM call via Vercel AI SDK, output persistence
4. **LLM Gateway (Vercel AI SDK)** — multi-provider routing, per-stage model assignments, provider failover on 429/5xx
5. **Holdout Vault (AES-256-GCM, node:crypto)** — envelope encryption at generation time, decryption key isolated from agent process scope
6. **Code Intelligence MCP (codebase-memory-mcp)** — knowledge graph with sub-ms queries, incremental re-index on bead file writes
7. **Event Bus (Redis pub/sub)** — routes agent progress events to SSE handler in API server
8. **Git Merge Service** — sequential merge queue for completed bead worktrees, conflict detection and escalation
9. **Web Dashboard (Next.js + @xyflow/react)** — interview chat UI, live DAG visualization, log streaming via SSE, human approval gates via WebSocket
10. **CLI (tsx/commander)** — all pipeline operations via the same tRPC API

### Critical Pitfalls

1. **Agents marking incomplete work as done** — cross-model holdout tests (different LLM family, encrypted, inaccessible to implementers) are the primary defense. A post-execution evaluator must ask "did we meet the goal?" separately from "did the tests pass?" The completion signal must come from an independent verifier, not the worker itself. Build gate (not just typecheck + test) must be included in the regression gate.

2. **Evolutionary loop infinite recursion** — implement a hard cap (5 iterations maximum), multi-signal convergence detection (ontology stability + stagnation + oscillation + repetitive feedback), token budget per evolutionary run, and human escalation when convergence looks unlikely. These mechanisms must be built before the loop is made autonomous — never add them as a retrofit.

3. **Holdout key leakage to agents** — the decryption master key must never appear in any env var accessible to agent processes. The unsealing operation must run in a separate process/service with restricted env scope. Test this explicitly post-build: verify that an agent cannot read holdout test content from within a tool call.

4. **Agent race conditions on shared state** — atomic bead claiming is a day-one invariant. The "read available beads + mark one as in-progress" operation must be a single atomic database transaction. Git worktree per bead enforces filesystem isolation. DAG dependency edges ensure two beads that touch the same file are sequenced, not parallelized.

5. **Vibe testing (tests that always pass)** — the testing cube mandates unit + integration + E2E at equal depth. Integration tests must use real wiring (real database, real filesystem) — no mocking. Heavy mocking in unit tests requires explicit justification. The cross-model holdout tests provide a fourth adversarial layer that the implementation agents cannot game.

6. **DAG cycles causing silent deadlock** — Kahn's algorithm (topological sort with cycle detection) must run on every DAG modification, not just at construction. LLM-generated dependency edges must pass cycle validation before they are committed. This is a blocking safety requirement before any parallel execution is possible.

---

## Implications for Roadmap

The research converges on a clear 8-phase critical path with strong justification for each ordering decision. The pipeline has hard sequential dependencies that cannot be reordered without breaking downstream phases.

### Phase 1: Persistence Foundation
**Rationale:** Everything else reads and writes the database. The schema must be defined before any domain logic can be implemented. The append-only event log design must be correct from the start — retrofitting immutability later is extremely expensive.
**Delivers:** PostgreSQL schema (Project, Seed, Bead, BeadEdge, Event, HoldoutVault, EvolutionLineage), Redis infrastructure, Drizzle ORM, Inngest + BullMQ wiring (basic job dispatch), Docker Compose dev environment.
**Addresses:** Project persistence across sessions, immutable seed lineage (table stakes + differentiator)
**Avoids:** In-memory DAG state (technical debt trap), DAG deadlock risk (schema enforces edge types), race conditions on shared state (row-level locking from day one)
**Research flag:** Standard patterns — event-sourced PostgreSQL is well-documented. Skip phase research.

### Phase 2: LLM Gateway + Agent Runner Shell
**Rationale:** Every pipeline stage (interview, decomposition, execution, evaluation) makes LLM calls. The provider routing, per-stage model assignments, and provider failover must exist before any stage is built. Git worktree lifecycle is required before any agent can write code safely.
**Delivers:** Vercel AI SDK provider routing (Anthropic, OpenAI, Google), stage-to-model assignment config, basic stateless agent runner (receives beadId, calls LLM, writes output), git worktree create/use/teardown, provider failover on 429/5xx.
**Uses:** `ai@6.0.138`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, `simple-git`
**Avoids:** Single LLM provider for all stages (correlated blind spot pitfall), provider outage cascade (failover built before parallel execution)
**Research flag:** Standard patterns. Vercel AI SDK official docs are HIGH confidence. Skip phase research.

### Phase 3: Interview + Seed Pipeline
**Rationale:** The seed is the cryptographic foundation for the entire execution tree. The interview FSM (ambiguity scoring) and seed crystallization must exist before decomposition can begin. Critically, holdout test encryption must be designed in this phase — it requires the holdout key security model to be established before any agent execution infrastructure is built. Key leakage cannot be retrofitted.
**Delivers:** Interview FSM with multi-perspective question generation, ambiguity scoring matrix (goal clarity 40%, constraint clarity 30%, success criteria 30%), ≤ 0.2 gate, seed crystallization and immutable storage (YAML format), cross-model holdout test generation, AES-256-GCM envelope encryption, holdout vault with isolated decryption scope, human approval gates for seed and holdout.
**Addresses:** Socratic interview (primary differentiator), immutable seed with lineage (primary differentiator), cross-model adversarial holdouts (defining differentiator)
**Avoids:** Holdout key leakage (security design established before any agent env is built), mutable spec anti-feature, premature crystallization
**Research flag:** Needs phase research. Ouroboros ambiguity scoring algorithm and Beads/GSD seed schema need concrete API verification before implementation. The multi-perspective question generation FSM has sparse implementation documentation.

### Phase 4: Decomposition + Bead Scheduler
**Rationale:** The DAG and scheduler are the structural backbone for all parallel execution. Atomic bead claiming and DAG cycle detection are safety invariants that must be correct before any agent runs. Inngest FlowProducer parent-child job wiring requires the DAG edge types to be finalized.
**Delivers:** Molecule/bead decomposition agent (LLM-generated DAG from seed), all 4 dependency edge types (blocks, parent-child, conditional-blocks, waits-for), Kahn's algorithm cycle detection on every DAG mutation, Inngest FlowProducer job tree construction from DAG, atomic bead claiming (single atomic transaction), fan-out dispatch for parallel-ready beads.
**Addresses:** DAG-based bead decomposition with parallel-by-default execution (differentiator), fresh context window per bead (structural prerequisite)
**Avoids:** DAG cycle and deadlock (cycle detection built before execution), race conditions (atomic claim day-one invariant), DB polling anti-pattern (Inngest FlowProducer replaces polling)
**Research flag:** Needs phase research. Inngest FlowProducer fan-in `step.waitForEvent()` semantics need verification against the v4 SDK. The LLM-generated decomposition prompt structure requires research into effective decomposition patterns.

### Phase 5: Parallel Execution
**Rationale:** This is the core runtime that all previous phases have been building toward. Context assembly from Code Intel MCP, git worktree-isolated execution, and event streaming are all prerequisites for the evolutionary loop to evaluate meaningful output.
**Delivers:** Full agent runner (Code Intel MCP context assembly, surgical context loading, worktree-isolated LLM execution, unit test run per bead), codebase-memory-mcp integration with incremental re-index on file writes, git merge service with sequential merge queue and conflict escalation, fan-in synchronization gates, Redis pub/sub event streaming to SSE handler, testing cube enforcement (unit tests per bead; integration + E2E at evaluator).
**Addresses:** Fresh context per bead (structural prevention), parallel execution engine, self-healing error correction, sandboxed execution, brownfield knowledge graph
**Avoids:** Full codebase in every agent context (surgical loading), context rot (fresh context enforced), brownfield index staleness (incremental invalidation built alongside initial index), unbounded parallel workers (worker pool tied to rate limit budget)
**Research flag:** Needs phase research. codebase-memory-mcp API (DeusData) needs direct verification — incremental re-index behavior is not well-documented in public sources. Worker concurrency limits and Inngest job timeout configuration need verification against v4 SDK.

### Phase 6: Evaluation + Evolutionary Loop
**Rationale:** The evaluation and evolutionary loop close the pipeline. Convergence detection, hard caps, lateral thinking personas, and human escalation must all be built before the loop is made autonomous — this phase is the highest risk for runaway behavior if implemented incorrectly.
**Delivers:** Evaluator (integration + E2E test runner against merged codebase, acceptance criteria scoring vs. seed), Evolution FSM (new seed crystallization with lineage pointer, convergence detection: ontology stability + stagnation + oscillation + repetitive feedback), hard cap (5 iterations maximum), token budget enforcement per evolutionary run, lateral thinking persona activation on stagnation (contrarian, hacker, simplifier, researcher, architect), human escalation on convergence failure, holdout unsealing (post-convergence only, restricted env), final holdout test suite execution and pass/fail report.
**Addresses:** Evolutionary loop (defining differentiator), spec-as-truth with escalation (differentiator), testing cube at equal depth, holdout unsealing and final validation
**Avoids:** Evolutionary loop infinite recursion (hard cap + multi-signal convergence built first), vibe testing (holdout tests run post-convergence provide the adversarial layer), convergence stagnation without escape (lateral personas)
**Research flag:** Needs phase research. Convergence detection algorithm (ontology stability metric, stagnation signal detection) is Cauldron-novel — no external documentation exists. Lateral thinking persona prompt design needs research into adversarial prompting patterns.

### Phase 7: Web Dashboard
**Rationale:** The dashboard makes the pipeline observable and provides the human approval gate UX. It can be developed in parallel with Phases 4-6 because the tRPC API contract can be designed from the persistence schema. The @xyflow/react DAG visualization requires the DAG data model to be finalized (Phase 4).
**Delivers:** Next.js 16 App Router web dashboard, Socratic interview chat UI (Vercel AI SDK `useChat`), live DAG visualization (@xyflow/react 12 + dagre auto-layout, bead status colors, blocking edge visualization), log streaming via SSE (text/event-stream from Redis pub/sub), human approval gate UX (seed crystallization review, holdout test review, escalation notification with call-to-action), pre-run token cost estimate, tRPC procedures for all pipeline operations, WebSocket subscriptions for bidirectional human gates.
**Addresses:** Real-time progress visibility (table stakes), DAG visualization (differentiator), structured autonomy with escalation gates (differentiator), HZD Cauldron visual aesthetic
**Avoids:** Raw agent output as "progress" UX pitfall, DAG without blocking reason explanation, Socratic interview that never converges UX problem (ambiguity score progress bar)
**Research flag:** Standard patterns for Next.js + tRPC + @xyflow/react. Skip phase research for the dashboard shell. The streaming architecture (SSE vs. WebSocket split) is well-documented.

### Phase 8: CLI
**Rationale:** The CLI is the final surface, unblocked after the tRPC API is stable. It imports the same `@get-cauldron/api` types directly — no new contract is needed. Git-push trigger is a sub-feature of the CLI.
**Delivers:** CLI entry point (tsx + commander), `cauldron interview`, `cauldron run`, `cauldron status`, `cauldron logs` commands via the same tRPC API as the web dashboard, git-push trigger hook.
**Addresses:** CLI interface (table stakes for professional developers), git-push triggered runs (v1.x)
**Avoids:** CLI as a separate API contract (shares tRPC types, no drift possible)
**Research flag:** Standard patterns. commander + tRPC HTTP client is well-documented. Skip phase research.

---

### Phase Ordering Rationale

The 8-phase order is driven by three hard constraints from the architecture research:

1. **Data-first ordering (Phases 1-2):** Nothing runs without the database schema and LLM gateway. Both have zero meaningful alternatives — skip either and every subsequent phase is blocked.

2. **Security invariants before execution (Phase 3 before Phase 5):** Holdout key isolation must be designed before any agent execution environment is built. Retrofitting a security boundary after the fact requires re-architecting the execution environment. This is the lesson from the Replit incident and the holdout key leakage pitfall.

3. **Safety invariants before parallelism (Phase 4 before Phase 5):** Atomic claiming, DAG cycle detection, and worktree isolation must all be correct before parallel execution is enabled. The race condition pitfall and DAG deadlock pitfall are both preventable only if their respective mitigations are built before the first parallel run.

Phase 7 (Dashboard) can safely run in parallel with Phases 5-6 because the tRPC API contract is established by Phase 4. This is an acceleration opportunity: UI and pipeline execution can converge at the end.

---

### Research Flags

**Needs deeper research before planning (run `/gsd:research-phase`):**
- **Phase 3 (Interview + Seed):** Ouroboros ambiguity scoring algorithm parameters, Beads seed YAML schema, multi-perspective question generation FSM — sparse implementation documentation
- **Phase 4 (Decomposition + Scheduler):** Inngest FlowProducer `step.waitForEvent()` fan-in semantics for v4 SDK, effective LLM decomposition prompt patterns for DAG generation
- **Phase 5 (Parallel Execution):** codebase-memory-mcp incremental re-index API, Inngest worker concurrency + timeout configuration in v4
- **Phase 6 (Evolution Loop):** Cauldron-novel convergence detection algorithm (no external documentation), adversarial prompting patterns for lateral thinking personas

**Standard patterns (skip phase research):**
- **Phase 1 (Persistence):** Event-sourced PostgreSQL + Drizzle schema — HIGH confidence, official docs sufficient
- **Phase 2 (LLM Gateway):** Vercel AI SDK provider routing + failover — HIGH confidence, official docs
- **Phase 7 (Dashboard):** Next.js 16 + tRPC + @xyflow/react — well-documented integration patterns
- **Phase 8 (CLI):** commander + tRPC HTTP client — standard patterns

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified against npm registry 2026-03-25. Vercel AI SDK, Inngest, Drizzle, @xyflow/react all confirmed current. Key architectural choices (Inngest over BullMQ, Drizzle over Prisma, Hono over Express) corroborated by multiple sources. |
| Features | HIGH | Competitor feature matrix grounded in current product docs (Devin 2025 review, Cursor 2.0, Replit Agent 3, AWS Kiro). Cauldron's differentiators are structurally novel — no competitor implements the full pipeline. Anti-features are well-reasoned based on observed competitor failure modes. |
| Architecture | HIGH (component patterns) / MEDIUM (Cauldron integration) | OpenHands ICLR 2025 paper, BullMQ official docs, Vercel AI Gateway docs are HIGH confidence. Cauldron-specific integration choices (Inngest FlowProducer for DAG, codebase-memory-mcp incremental re-index) are MEDIUM — patterns are verified but specific API semantics need Phase research. |
| Pitfalls | HIGH | Pitfalls grounded in real post-mortems: BMAD 9-hour auth failure, Replit July 2025 database deletion, Devin hallucination analysis, Chroma context rot research, IEEE vibe testing study. Not theoretical — documented real-world failures. |

**Overall confidence: HIGH**

### Gaps to Address

- **Ambiguity scoring matrix weights (40/30/30):** These weights come from the Ouroboros project but are not validated empirically for Cauldron's specific interview structure. Flag for calibration during Phase 3 implementation — the weights may need tuning based on observed interview quality.

- **Bead size target (≤ 200k tokens total):** The target is well-justified (context rot research), but the practical decomposition granularity needs validation against real LLM performance. The Phase 4 decomposition agent should be tested against the v1 test case (CLI bulk file renaming tool) before production use.

- **Inngest vs. BullMQ for DAG fan-in:** The STACK.md recommendation is Inngest 4 over raw BullMQ. ARCHITECTURE.md uses BullMQ FlowProducer patterns directly. This mismatch needs resolution: Inngest wraps BullMQ internally, but the `step.waitForEvent()` fan-in semantics need verification that they map correctly to the `waits-for` edge type. Resolve in Phase 4 research.

- **codebase-memory-mcp production maturity:** The library is directly referenced in Cauldron's spec, but public documentation on incremental re-indexing behavior under concurrent writes is sparse. Phase 5 research must verify this before integration.

- **Convergence detection algorithm:** Cauldron-novel. No external documentation exists for the specific multi-signal convergence algorithm (ontology stability + stagnation + oscillation + repetitive feedback). Phase 6 must develop this algorithm internally, likely through iteration on the v1 test case.

---

## Sources

### Primary (HIGH confidence)
- npm registry (2026-03-25) — all package versions verified
- Next.js 16 AI Agents Guide (nextjs.org/docs) — AI capabilities and streaming patterns
- Vercel AI SDK 6 Docs (ai-sdk.dev) — streamText, multi-provider patterns
- BullMQ FlowProducer Docs (docs.bullmq.io) — DAG parent-child job patterns
- Vercel AI Gateway Docs (vercel.com) — provider routing architecture
- codebase-memory-mcp (github.com/DeusData) — knowledge graph integration
- OpenHands ICLR 2025 paper (arxiv.org/2511.03690) — stateless agent runner patterns
- React Flow / @xyflow/react official docs — DAG visualization, dagre integration
- Node.js built-in crypto docs — AES-256-GCM envelope encryption

### Secondary (MEDIUM confidence)
- Inngest TypeScript SDK v4 Docs — durable execution, fan-in patterns
- Chroma research "Context Rot" — 50k token degradation threshold
- Devin 2025 Annual Performance Review (cognition.ai) — agent failure modes
- AWS Kiro spec-driven IDE (InfoQ) — closest competitor to Cauldron's spec-first approach
- Cursor 2.0 parallel agents (InfoQ) — 8-agent parallel execution without DAG
- Replit Agent 3 introduction — 200-minute session, streaming architecture
- Ouroboros GitHub (Q00) — Socratic interview, ambiguity scoring, evolutionary loop
- Steve Yegge Beads articles — molecule/bead hierarchy, fresh context per task
- Drizzle vs. Prisma 2026 (makerkit.dev) — ORM comparison with current versions
- Git worktrees for parallel AI agents (Upsun devcenter) — worktree isolation patterns
- Event sourcing with PostgreSQL — append-only event store patterns

### Tertiary (LOW confidence)
- Vitest vs. Jest 2025 benchmarks — 10-20x speed claim (single source, needs validation)
- GSD token explosion GitHub Issue #120 — anecdotal, but pattern is consistent with broader findings
- Vibe testing DEV Community audit (275 tests) — small sample, methodology unreviewed

---
*Research completed: 2026-03-25*
*Ready for roadmap: yes*
