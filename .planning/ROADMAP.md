# Roadmap: Cauldron

## Overview

Cauldron is built in strict dependency order dictated by the pipeline's own architecture. The persistence foundation and LLM gateway come first because nothing else can run without them. The interview, seed, and holdout vault follow because the cryptographic trust boundaries must be established before any agent execution environment is created — retrofitting security is fatal. DAG decomposition and the scheduler come next, embedding atomic-claim and cycle-detection invariants before a single parallel agent runs. The execution engine then assembles all prior layers into a working pipeline. The evolutionary loop closes the feedback cycle. The web dashboard and CLI are the final surfaces, both consuming the same tRPC API.

The v1 test case — a CLI bulk file renaming tool — drives at least one evolutionary cycle through the full pipeline and validates every phase in sequence.

**Scheduling decision:** Inngest 4 is the durable job orchestration layer. It wraps BullMQ internally and adds step-level retry, `step.waitForEvent()` fan-in gates for the `waits-for` dependency type, and durable execution semantics out of the box. Building those primitives on raw BullMQ alone would require reimplementing Inngest. BullMQ FlowProducer is accessible via Inngest's internals for parent-child DAG tree dispatch. This decision is final — Inngest is the scheduler.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Persistence Foundation** - PostgreSQL event store, Redis, Drizzle schema, Docker Compose dev environment (completed 2026-03-25)
- [x] **Phase 2: LLM Gateway** - Vercel AI SDK multi-provider routing, per-stage model assignments, provider failover, token tracking (completed 2026-03-26)
- [x] **Phase 3: Interview & Seed Pipeline** - Socratic interview FSM, ambiguity scoring, seed crystallization, human approval gates (completed 2026-03-26)
- [x] **Phase 4: Holdout Vault** - Cross-model holdout generation, AES-256-GCM encryption, key isolation, unsealing protocol (completed 2026-03-26)
- [x] **Phase 5: DAG Decomposition & Scheduler** - Molecule/bead decomposition, all 4 dependency types, Kahn's cycle detection, Inngest FlowProducer dispatch, atomic claiming (completed 2026-03-26)
- [x] **Phase 6: Parallel Execution Engine** - Agent runner, git worktrees, context assembly via Code Intel, merge queue, testing cube, self-healing error loop (completed 2026-03-26)
- [x] **Phase 6.1: Dogfooding Transition** (INSERTED) - CLI entrypoint, Claude Code skills, GSD context bridging, self-build safety, dry-run validation (completed 2026-03-26)
- [x] **Phase 6.2: Testing & Tuning Dogfood Process** (INSERTED) - Interview convergence fixes, pre-generated seed pipeline validation, end-to-end dry run (completed 2026-03-26)
- [x] **Phase 7: Evolutionary Loop** - Post-execution evaluator, evolution FSM, convergence detection, lateral thinking personas, holdout unsealing (completed 2026-03-27)
- [x] **Phase 8: Web Dashboard** - Interview chat, live DAG visualization, SSE log streaming, human approval UX, HZD aesthetic (completed 2026-03-27)
- [x] **Phase 9: CLI** - Full pipeline CLI, git-push trigger, shared tRPC API (completed 2026-03-27)
- [x] **Phase 10: Wire tRPC Write Mutations to Engine** - Connect stub tRPC mutations to actual engine functions (interview FSM, vault sealing, decomposition) (gap closure) (completed 2026-03-27)
- [x] **Phase 11: Engine Inngest Serve & Evolution Bootstrap** - Add HTTP serve endpoint for engine Inngest functions, wire configureEvolutionDeps in bootstrap (gap closure) (completed 2026-03-27)
- [x] **Phase 12: Security & Tech Debt Cleanup** - SSE auth, kill command UX, minor tech debt items (gap closure) (completed 2026-03-27)
- [x] **Phase 13: Re-scope to @get-cauldron/*** - Rename npm scope from @get-cauldron/* to @get-cauldron/*, consolidate trpc-types into shared, rename packages/cli to packages/cli (completed 2026-03-27)
- [x] **Phase 14: Wire Interview Start & Fix Seed Crystallization Path** - Close P0/P1 integration gaps from v1.0 audit (gap closure) (completed 2026-03-27)
- [ ] **Phase 15: Wire Holdout Generation Pipeline & Fix CLI Run** - Trigger holdout generation after crystallization, fix cauldron run seedId injection (gap closure)
- [ ] **Phase 16: Bridge Evolution Loop & Fix Bead Dispatch** - Bridge evolution event types, fix dispatch payloads, add bead_claimed SSE, fix web SSE auth (gap closure)

## Phase Details

### Phase 1: Persistence Foundation
**Goal**: The data layer exists and enforces Cauldron's core invariants — event immutability, seed lineage, DAG edges — so every subsequent phase writes against a contract that cannot be violated.
**Depends on**: Nothing (first phase)
**Requirements**: INFR-01, INFR-02, INFR-03, INFR-04, INFR-05, INFR-06
**Success Criteria** (what must be TRUE):
  1. Monorepo boots with `pnpm install` and all packages resolve without error
  2. `docker compose up` starts PostgreSQL, Redis, and Inngest dev server; all health checks pass
  3. Drizzle migrations run to completion and produce the full schema (Project, Seed, Bead, BeadEdge, Event, HoldoutVault, EvolutionLineage tables)
  4. A test script can append events to the event log and replay them to derive current state without touching the original rows
  5. Vitest integration tests pass against a real Docker PostgreSQL instance (no mocks)
**Plans**: 3 plans
Plans:
- [x] 01-01-PLAN.md — Monorepo scaffold (Turborepo + pnpm) and Docker Compose dev environment
- [x] 01-02-PLAN.md — Drizzle schema (all 7 tables) and migration infrastructure
- [x] 01-03-PLAN.md — Event sourcing module, schema invariant tests, and dev seed data

### Phase 2: LLM Gateway
**Goal**: Every pipeline stage can call any supported LLM provider through a single typed interface, with automatic failover and full token cost visibility.
**Depends on**: Phase 1
**Requirements**: LLM-01, LLM-02, LLM-03, LLM-04, LLM-05, LLM-06
**Success Criteria** (what must be TRUE):
  1. A single function call routes to the correct provider (Anthropic, OpenAI, or Google) based on pipeline stage configuration
  2. When a provider returns 429 or 5xx, the gateway transparently retries with the configured fallback provider and logs the failover event
  3. Per-project model overrides override defaults and are persisted across restarts
  4. Token usage is recorded per bead, per evolution cycle, and per project and is queryable from the database
  5. Cross-model diversity is enforced: a holdout-stage call with the same provider as the implementer stage is rejected at the gateway level
**Plans**: 3 plans
Plans:
- [x] 02-01-PLAN.md — Schema, types, config, provider factory, and dependencies
- [x] 02-02-PLAN.md — LLMGateway class with failover, circuit breaker, and diversity enforcement
- [x] 02-03-PLAN.md — Budget enforcement, startup validation, and comprehensive test suite

### Phase 3: Interview & Seed Pipeline
**Goal**: A user can describe what they want through a Socratic interview, receive a deterministic clarity score, and crystallize an immutable seed spec that becomes the sole source of truth for all subsequent execution.
**Depends on**: Phase 2
**Requirements**: INTV-01, INTV-02, INTV-03, INTV-04, INTV-05, INTV-06, INTV-07, SEED-01, SEED-02, SEED-03, SEED-04
**Success Criteria** (what must be TRUE):
  1. The interview presents questions from a multi-perspective panel (researcher, simplifier, architect, breadth-keeper, seed-closer) with multiple-choice suggestions and a freeform option on every question
  2. After each response the ambiguity score updates deterministically — the same transcript always produces the same score
  3. The interview refuses to crystallize until the ambiguity score reaches <= 0.2; the current score and gap are visible to the user
  4. The user sees a structured summary and must explicitly approve it before a seed is generated
  5. A crystallized seed is immutable: any attempt to mutate it returns an error; evolution must create a new seed with a parent reference
  6. Given any seed ID, the full lineage (interview → seed → evolved seeds) is traceable in a single query
**Plans**: 3 plans
Plans:
- [x] 03-01-PLAN.md — Interviews table schema, seed immutability trigger, domain types, and gateway config extension
- [x] 03-02-PLAN.md — Ambiguity scoring engine, multi-perspective panel, and question ranker
- [x] 03-03-PLAN.md — InterviewFSM service class, synthesizer, crystallizer, and seed lineage

### Phase 4: Holdout Vault
**Goal**: Cross-model adversarial tests are generated, encrypted at rest with keys inaccessible to agent processes, and remain sealed through all execution until convergence — making it structurally impossible for the implementation agents to see or game the tests they will be evaluated against.
**Depends on**: Phase 3
**Requirements**: HOLD-01, HOLD-02, HOLD-03, HOLD-04, HOLD-05, HOLD-06, HOLD-07, HOLD-08
**Success Criteria** (what must be TRUE):
  1. Holdout tests are generated by a demonstrably different LLM provider/family than the interview model (enforced by the LLM gateway cross-model rule)
  2. The user reviews generated holdout tests and explicitly approves them before encryption; unapproved tests cannot be sealed
  3. After sealing, no agent process environment can read the holdout test content — a test script that simulates an agent env confirms the decryption key is absent
  4. Holdout tests remain encrypted and unreadable throughout all bead execution and evolution cycles
  5. After evolutionary convergence is reached, the vault unseals and the holdout tests run; a failure triggers a new evolution cycle with the failure context attached
**Plans**: 3 plans
Plans:
- [x] 04-01-PLAN.md — Schema migration, extended holdout table, domain types, and AES-256-GCM envelope encryption
- [x] 04-02-PLAN.md — Holdout scenario generator with adversarial LLM call, vault service with review state machine and sealing
- [x] 04-03-PLAN.md — Holdout evaluator, unseal protocol, and Inngest convergence event handler

### Phase 5: DAG Decomposition & Scheduler
**Goal**: A seed's acceptance criteria decompose into a valid, acyclic bead DAG with atomic claiming and durable job dispatch — so parallel execution is safe before the first agent runs.
**Depends on**: Phase 3
**Requirements**: DAG-01, DAG-02, DAG-03, DAG-04, DAG-05, DAG-06, DAG-07, DAG-08, DAG-09
**Success Criteria** (what must be TRUE):
  1. A decomposition agent produces a molecule/bead hierarchy from a seed, and every bead is annotated with its estimated token size at creation time
  2. Beads that exceed the 200k-token target are flagged and rejected at decomposition time, not at execution time
  3. All four dependency types (blocks, parent-child, conditional-blocks, waits-for) are persisted and enforced by the scheduler
  4. Cycle detection runs on every DAG mutation; a graph with a cycle is rejected with a human-readable error before any job is dispatched
  5. Two agents concurrently claiming the same bead results in exactly one claim succeeding — verified by a concurrent-claim stress test
  6. Fan-in synchronization gates fire only after all upstream beads complete, verified against a diamond-shaped test DAG
**Plans**: 3 plans
Plans:
- [x] 05-01-PLAN.md — Schema migration, domain types, and gateway config extension
- [x] 05-02-PLAN.md — Two-pass LLM decomposition agent and DAG validator
- [x] 05-03-PLAN.md — Scheduler (ready-bead query, atomic claiming, Inngest dispatch, fan-in)

### Phase 6: Parallel Execution Engine
**Goal**: Multiple agents execute independent beads concurrently in isolated git worktrees, assembling surgical context from the code knowledge graph, self-healing on errors, and merging back to main through a sequential queue — while generating unit, integration, and E2E tests as a first-class part of every bead.
**Depends on**: Phase 5
**Requirements**: EXEC-01, EXEC-02, EXEC-03, EXEC-04, EXEC-05, EXEC-06, EXEC-07, EXEC-08, EXEC-09, CODE-01, CODE-02, CODE-03, CODE-04, TEST-01, TEST-02, TEST-03, TEST-04, TEST-05, TEST-06

---
**DOGFOOD INFLECTION POINT: After Phase 6, Cauldron can run its own pipeline.**
Phase 6 completes the end-to-end execution path: interview a project, decompose it, run agents, merge results. Phases 7-9 can be planned and partially executed using Cauldron itself as the build tool. Temporary skills bridge any gaps until the evolutionary loop (Phase 7) is available.

---

**Success Criteria** (what must be TRUE):
  1. Two agents execute independent beads concurrently without touching each other's filesystem state — each bead runs in its own git worktree branch
  2. An agent's context contains only the seed excerpt, bead spec, and code symbols relevant to that bead — the full codebase is never loaded into a single context window
  3. When an agent's implementation fails tests or typecheck, it reads the error output and iterates autonomously until the bead passes or hits the timeout
  4. All three test levels (unit, integration, E2E) are generated and pass before a bead is marked complete — a bead with passing unit tests but failing integration tests is not marked complete
  5. The merge queue serializes completed worktrees back to main; a merge conflict triggers LLM-assisted resolution or human escalation, not a silent failure
  6. Code Intelligence indexes the project and answers sub-millisecond graph queries; after a bead modifies files, the index reflects those changes without a full re-index
**Plans**: 5 plans
Plans:
- [x] 06-01-PLAN.md — Code Intelligence adapter (codebase-memory-mcp), execution types, gateway stage extensions
- [x] 06-02-PLAN.md — WorktreeManager (git worktree lifecycle), ContextAssembler (knowledge graph + token budget), TestDetector
- [x] 06-03-PLAN.md — AgentRunner (TDD self-healing loop), TimeoutSupervisor (idle/soft/hard timeouts)
- [x] 06-04-PLAN.md — MergeQueue (topological ordering, LLM conflict resolution, post-merge verification)
- [x] 06-05-PLAN.md — Inngest handler wiring, barrel exports, schema migration, regression gate
**UI hint**: no

### Phase 06.2: Testing and Tuning the Dogfood Process (INSERTED)

**Goal:** The full Cauldron pipeline runs end-to-end on an external CLI renamer project: interview converges with calibrated scoring, seed crystallizes, holdouts are generated, decomposition produces beads, and at least one bead executes -- proving the dogfood process works.
**Requirements**: D-01, D-02, D-03, D-04, D-05, D-06, D-07
**Depends on:** Phase 6
**Plans:** 3/3 plans complete

Plans:
- [x] 06.2-01-PLAN.md — Interview convergence fixes: scorer calibration, recency weighting, dimension-aware perspective activation
- [x] 06.2-02-PLAN.md — Pre-generated seed pipeline: CLI renamer fixture, seed injection, downstream pipeline validation (seal/decompose/execute)
- [x] 06.2-03-PLAN.md — End-to-end validation: full interview-to-execution pipeline run with fixed engine

### Phase 06.1: Dogfooding Transition — Bridge Claude Code to Cauldron for Self-Building (INSERTED)

**Goal:** Claude Code can invoke Cauldron's full pipeline (minus evolutionary loop) through project-local skills, with GSD context bridging, file-based human review gates, and self-build safety guards — enabling Phases 7-9 to be built using Cauldron itself.
**Requirements**: D-01 through D-21 (from CONTEXT.md decisions)
**Depends on:** Phase 6
**Plans:** 5/5 plans complete

Plans:
- [x] 06.1-01-PLAN.md — Package setup, bootstrap, health check, CLI router, selfBuild config
- [x] 06.1-02-PLAN.md — Status command, kill command, file-based review writers
- [x] 06.1-03-PLAN.md — Interview command with GSD context bridging, crystallize command
- [x] 06.1-04-PLAN.md — Decompose, execute (Inngest serve), seal, resolve commands, self-build safety
- [x] 06.1-05-PLAN.md — Claude Code skills (all 8) and dry-run pipeline validation

### Phase 7: Evolutionary Loop
**Goal**: The pipeline evaluates whether the built software actually meets the goal (not just the spec), evolves a new immutable seed when it does not, detects convergence through multiple independent signals, activates lateral thinking on stagnation, escalates to humans when convergence looks unlikely, and unseals holdout tests after convergence — completing the full autonomous loop.
**Depends on**: Phase 6
**Requirements**: EVOL-01, EVOL-02, EVOL-03, EVOL-04, EVOL-05, EVOL-06, EVOL-07, EVOL-08, EVOL-09, EVOL-10, EVOL-11, EVOL-12
**Success Criteria** (what must be TRUE):
  1. The evaluator scores goal attainment separately from spec compliance — a project that passes all tests but misses the goal is flagged for evolution
  2. When evolution is triggered, a new immutable seed is created with a parent reference; the original seed is unchanged and both are queryable
  3. At least one evolutionary cycle is demonstrable with the v1 test case (CLI bulk file renaming tool)
  4. All five convergence signals (ontology stability, stagnation, oscillation, repetitive feedback, hard cap at 30 generations) independently halt the loop when triggered
  5. On stagnation, lateral thinking personas (contrarian, hacker, simplifier, researcher, architect) activate and produce a measurably different evolved seed
  6. The human escalation path is reachable: when convergence looks unlikely, a notification reaches the operator and the loop pauses for input
  7. The token budget circuit breaker halts evolution before the configured cost ceiling is reached
**Plans**: 4 plans

Plans:
- [x] 07-01-PLAN.md — DB migration, domain types, goal evaluator, and seed mutator
- [x] 07-02-PLAN.md — Convergence detector (5 signals) and lineage budget enforcement
- [x] 07-03-PLAN.md — Lateral thinking personas engine and meta-judge
- [x] 07-04-PLAN.md — Evolution FSM Inngest function, barrel exports, and integration wiring

### Phase 8: Web Dashboard
**Goal**: The full Cauldron pipeline is observable and operable through a web interface — from Socratic interview to live DAG execution to evolution cycle review — with the HZD Cauldron visual identity.
**Depends on**: Phase 7 (full pipeline complete; Phase 4 DAG model finalized; can begin in parallel with Phase 6)
**Requirements**: WEB-01, WEB-02, WEB-03, WEB-04, WEB-05, WEB-06, WEB-07, WEB-08, WEB-09
**Success Criteria** (what must be TRUE):
  1. A user can complete the full Socratic interview in the chat UI — viewing the ambiguity score progress and the structured summary — without leaving the browser
  2. The DAG visualization shows bead status (pending, active, completed, failed, blocked) updating in real time as agents execute, with blocking edges rendered distinctly
  3. Agent logs and code diffs stream live into the dashboard via SSE — no polling, no full-page refresh
  4. Human approval gates (seed crystallization review, holdout test review, escalation notifications) are completable in the UI without switching to another tool
  5. The evolution cycle history — seed lineage, convergence signals, lateral thinking activations — is browsable in the dashboard
  6. The visual identity is unmistakably HZD Cauldron: dark metallic palette, teal/blue energy conduit accents, hexagonal geometry motifs, industrial-organic feel
**Plans**: 7 plans

Plans:
- [x] 08-01-PLAN.md — Next.js 16 scaffold, HZD theme, shadcn, tRPC v11 plumbing
- [x] 08-02-PLAN.md — Application shell (nav sidebar, branding, hex background) and project CRUD
- [x] 08-03-PLAN.md — SSE streaming infrastructure (Route Handler, useSSE, useBeadStatus, useEscalation hooks)
- [x] 08-04-PLAN.md — Interview chat UI with MC chips, ambiguity sidebar, and approval gates
- [x] 08-05-PLAN.md — Live DAG execution visualization with React Flow, bead detail panel, terminal logs, code diffs
- [x] 08-06-PLAN.md — Evolution cycle visualization (seed lineage, convergence signals, lateral thinking history)
- [x] 08-07-PLAN.md — Token usage and cost dashboard, project settings page
**UI hint**: yes

### Phase 9: CLI
**Goal**: Every pipeline operation available in the web dashboard is also available via CLI, sharing the same tRPC API contract with zero schema drift, and git-push-triggered runs are supported.
**Depends on**: Phase 8 (tRPC API stable)
**Requirements**: CLI-01, CLI-02, CLI-03
**Success Criteria** (what must be TRUE):
  1. A developer can run `cauldron interview`, `cauldron run`, `cauldron status`, and `cauldron logs` and get the same data as the web dashboard for the same project
  2. A git push to a configured repository triggers a Cauldron pipeline run without manual CLI invocation
  3. The CLI and web dashboard share the same tRPC type definitions — no separate API contract or schema translation layer exists
**Plans**: 4 plans

Plans:
- [x] 09-01-PLAN.md — tRPC type-sharing package, client factory, server auto-start, config-io, output utilities, auth context
- [x] 09-02-PLAN.md — CLI router refactor and all 13 commands (8 refactored + 5 new) using tRPC client
- [x] 09-03-PLAN.md — SSE-backed cauldron logs with per-bead color-coded streaming
- [x] 09-04-PLAN.md — GitHub push webhook handler and CLI webhook setup command

### Phase 10: Wire tRPC Write Mutations to Engine
**Goal**: tRPC write mutations actually invoke the engine functions they represent — interview advances, holdouts encrypt, decomposition triggers — restoring the write path that Phase 9 refactoring broke.
**Depends on**: Phase 9
**Requirements**: INTV-01, INTV-02, INTV-03, INTV-04, INTV-05, INTV-06, INTV-07, HOLD-03, HOLD-04, HOLD-05, DAG-01, DAG-02, DAG-03, DAG-04, DAG-05
**Gap Closure:** Closes audit integration gaps 2 (sendAnswer -> FSM), 3 (sealHoldouts -> vault), 4 (triggerDecomposition -> pipeline). Restores Flow 1 (Interview -> Seal -> Decompose).
**Success Criteria** (what must be TRUE):
  1. `interview.sendAnswer` tRPC mutation invokes `InterviewFSM.submitAnswer()` — interview advances past first turn
  2. `interview.sealHoldouts` tRPC mutation calls `sealVault()` — ciphertext/iv/authTag columns populated after sealing
  3. `execution.triggerDecomposition` tRPC mutation invokes `runDecomposition()` or sends the correct Inngest event
  4. Integration test demonstrates: answer submitted -> FSM scores -> next question generated
**Plans**: 3 plans

Plans:
- [x] 10-01-PLAN.md — Extend tRPC context with engine deps, wire sendAnswer to InterviewFSM
- [x] 10-02-PLAN.md — Wire sealHoldouts to vault encryption, triggerDecomposition to runDecomposition
- [ ] 10-03-PLAN.md — DB-backed integration test for InterviewFSM.submitAnswer (gap closure)


### Phase 11: Engine Inngest Serve & Evolution Bootstrap
**Goal**: Engine Inngest functions are reachable via HTTP so Inngest can deliver events, and evolution dependencies are configured at bootstrap — making bead execution, merge queue, and evolutionary loop operational in production.
**Depends on**: Phase 10
**Requirements**: DAG-06, DAG-07, DAG-08, DAG-09, EXEC-01, EXEC-02, EXEC-03, EXEC-04, EXEC-05, EXEC-06, EXEC-07, EXEC-08, EXEC-09, CODE-01, CODE-02, CODE-03, CODE-04, TEST-01, TEST-02, TEST-03, TEST-04, TEST-05, TEST-06, EVOL-01, EVOL-02, EVOL-03, EVOL-04, EVOL-05, EVOL-06, EVOL-07, EVOL-08, EVOL-09, EVOL-10, EVOL-11, EVOL-12, HOLD-05, HOLD-06, HOLD-07, HOLD-08
**Gap Closure:** Closes audit integration gaps 1 (engine Inngest not served) and 5 (configureEvolutionDeps missing). Restores Flows 2 (Bead Execution), 3 (Evolution), 6 (Git Push -> Pipeline).
**Success Criteria** (what must be TRUE):
  1. An HTTP serve endpoint exists for the `cauldron-engine` Inngest client with all 5 engine functions registered
  2. Inngest dev server can discover and invoke engine functions (handleBeadDispatchRequested, handleBeadCompleted, etc.)
  3. `configureEvolutionDeps()` is called in bootstrap.ts alongside existing dependency configurators
  4. Pipeline trigger webhook reaches downstream bead dispatch through the engine functions
**Plans**: 3 plans

Plans:
- [x] 11-01-PLAN.md — Engine Inngest serve endpoint with lazy dep init, configureEvolutionDeps in bootstrap
- [x] 11-02-PLAN.md — Wire pipeline trigger and execution trigger to send bead.dispatch_requested events
- [ ] 11-03-PLAN.md — Mount createInngestApp on HTTP server (port 3001) so Inngest can reach engine functions (gap closure)

### Phase 12: Security & Tech Debt Cleanup
**Goal**: Address warning-level security issues and minor tech debt items flagged by the milestone audit.
**Depends on**: Phase 11
**Gap Closure:** Closes warning-level audit findings. No requirements affected — all are already satisfied at the code level.
**Success Criteria** (what must be TRUE):
  1. SSE endpoint `/api/events/[projectId]` validates project access before streaming events
  2. `kill` command accepts `--project-id` flag (not just env var)
  3. Phase 09 VERIFICATION.md status field updated to reflect resolved gaps
**Plans**: 1 plan

Plans:
- [ ] 12-01-PLAN.md — SSE auth gate, --project-id flag, VERIFICATION.md correction

### Phase 13: Re-scope to @get-cauldron/* -- already have the github and npm orgs

**Goal:** Rename npm scope from @get-cauldron/* to @get-cauldron/*, consolidate trpc-types into shared, rename packages/cli to packages/cli, and update all references project-wide.
**Requirements**: SC-1, SC-2, SC-3, SC-4, SC-5, SC-6
**Depends on:** Phase 12
**Success Criteria** (what must be TRUE):
  1. All package.json `name` fields use `@get-cauldron/*` scope
  2. `@get-cauldron/trpc-types` package no longer exists — its exports live in `@get-cauldron/shared`
  3. `packages/cli` directory renamed to `packages/cli`
  4. Zero occurrences of `@get-cauldron/` in source files, imports, or workspace deps
  5. All tests pass, typecheck passes, build succeeds after rename
  6. CLAUDE.md and planning docs updated to reference new scope
**Plans**: 2 plans

Plans:
- [x] 13-01-PLAN.md — Package restructure: merge trpc-types into shared, rename packages/cli to packages/cli, update all package.json scopes
- [x] 13-02-PLAN.md — Bulk import rename (@get-cauldron/* to @get-cauldron/*), update skills/docs, full regression gate

### Phase 14: Wire Interview Start & Fix Seed Crystallization Path
**Goal:** Close the two P0/P1 integration gaps: add `startInterview` tRPC procedure so new projects can begin interviews, and replace inline seed insert in `approveSummary` with `crystallizeSeed()` call so event sourcing and SSE work correctly.
**Requirements:** SEED-01, SEED-02, WEB-01, CLI-01
**Depends on:** Phase 13
**Gap Closure:** Closes P0 (missing startInterview tRPC) and P1 (approveSummary bypasses crystallizeSeed) from v1.0 milestone audit.
**Success Criteria** (what must be TRUE):
  1. `startInterview` tRPC mutation exists and calls `InterviewFSM.startOrResume()`
  2. Web interview page calls `startInterview` when interview doesn't exist, creating the DB record
  3. CLI `interview` command calls `startInterview` when interview status is `not_started`
  4. `approveSummary` tRPC mutation calls `crystallizeSeed()` instead of inline raw DB insert
  5. `seed_crystallized` event is written to event store when seed is crystallized via web/CLI
  6. SSE clients receive `seed_crystallized` event after crystallization
**Plans:** 2/2 plans complete

Plans:
- [x] 14-01-PLAN.md — Add startInterview tRPC mutation, fix approveSummary to call crystallizeSeed()
- [x] 14-02-PLAN.md — Wire web page and CLI to call startInterview for new projects

### Phase 15: Wire Holdout Generation Pipeline & Fix CLI Run
**Goal:** Trigger holdout scenario generation after seed crystallization so the vault is populated for review/sealing, and fix `cauldron run` so the full CLI pipeline (interview → crystallize → seal → decompose → execute) completes without manual intervention.
**Requirements:** HOLD-01, HOLD-02, HOLD-03, HOLD-05, LLM-06, WEB-05, CLI-01
**Depends on:** Phase 14
**Gap Closure:** Closes P0 integration gaps from v1.0 milestone audit: holdout generation trigger, CLI run seedId injection. Restores Flow 1 (crystallize → seal → decompose) and CLI full-pipeline flow.
**Success Criteria** (what must be TRUE):
  1. After `approveSummary` crystallizes a seed, holdout scenarios are generated automatically (via Inngest event or direct call)
  2. `getHoldouts` tRPC returns generated scenarios for review — vault is no longer always empty
  3. `sealHoldouts` succeeds after user approves generated holdout scenarios
  4. `cauldron run` passes seedId from crystallize stage to seal stage — full pipeline completes
  5. Cross-model diversity enforcement (LLM-06) is active during holdout generation
  6. Web interview page shows holdout review cards after crystallization
**Plans:** 0/? plans

Plans:
- [ ] (to be planned)

### Phase 16: Bridge Evolution Loop & Fix Bead Dispatch
**Goal:** Make the evolution loop reachable from the pipeline by bridging the DB-event/Inngest-event gap, fix bead dispatch payloads so execution and re-execution work from all trigger paths, and add missing SSE events for live DAG status.
**Requirements:** HOLD-07, HOLD-08, EVOL-01, EVOL-02, EVOL-03, EVOL-04, EVOL-05, EVOL-06, EVOL-07, EVOL-08, EVOL-09, EVOL-10, EVOL-11, EVOL-12, DAG-05, EXEC-03, WEB-03, WEB-04
**Depends on:** Phase 15
**Gap Closure:** Closes P1 integration gaps from v1.0 milestone audit: evolution trigger bridge, dispatch payload format. Also closes P2 items: bead_claimed event emission, web SSE auth. Restores Flow 3 (Evolution Loop) and Flow 5 (Git Push → Pipeline).
**Success Criteria** (what must be TRUE):
  1. `convergenceHandler` sends Inngest `evolution_started` event (not just DB event) after holdout failure
  2. `handleEvolutionStarted` fires and runs the evolution FSM cycle
  3. `triggerExecution` tRPC sends `bead.dispatch_requested` with correct `beadId` for each ready bead
  4. Evolution re-dispatch includes `beadId` for newly decomposed beads
  5. `claimBead` emits `bead_claimed` event — live DAG shows beads in `active` status
  6. Web SSE connections work when `CAULDRON_API_KEY` is set (auth header included)
  7. Git push → pipeline trigger dispatches beads with correct payload
**Plans:** 0/? plans

Plans:
- [ ] (to be planned)

---

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 6.1 -> 6.2 -> 7 -> 8 -> 9 -> 10 -> 11 -> 12 -> 13 -> 14 -> 15 -> 16

Note: Phase 4 (Holdout Vault) can begin as soon as Phase 3 completes. Phase 5 (DAG) depends on Phase 3 but not Phase 4. Phase 8 (Dashboard) can begin in parallel once the Phase 4 DAG data model is stable. Phases 10-12 are gap closure phases from the v1.0 milestone audit.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Persistence Foundation | 3/3 | Complete   | 2026-03-25 |
| 2. LLM Gateway | 3/3 | Complete   | 2026-03-26 |
| 3. Interview & Seed Pipeline | 3/3 | Complete   | 2026-03-26 |
| 4. Holdout Vault | 3/3 | Complete   | 2026-03-26 |
| 5. DAG Decomposition & Scheduler | 3/3 | Complete   | 2026-03-26 |
| 6. Parallel Execution Engine | 5/5 | Complete   | 2026-03-26 |
| 6.1. Dogfooding Transition | 5/5 | Complete   | 2026-03-26 |
| 6.2. Testing & Tuning Dogfood | 3/3 | Complete   | 2026-03-26 |
| 7. Evolutionary Loop | 4/4 | Complete   | 2026-03-27 |
| 8. Web Dashboard | 9/9 | Complete   | 2026-03-27 |
| 9. CLI | 4/4 | Complete   | 2026-03-27 |
| 10. Wire tRPC Write Mutations | 2/3 | Complete    | 2026-03-27 |
| 11. Engine Inngest Serve & Bootstrap | 2/3 | Complete    | 2026-03-27 |
| 12. Security & Tech Debt | 0/? | Complete    | 2026-03-27 |
| 13. Re-scope to @get-cauldron/* | 2/2 | Complete    | 2026-03-27 |
| 14. Wire Interview & Seed Path | 2/2 | Complete    | 2026-03-27 |
| 15. Wire Holdout Pipeline & CLI Run | 0/? | Planned | — |
| 16. Bridge Evolution & Fix Dispatch | 0/? | Planned | — |
