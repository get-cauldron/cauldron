# Roadmap: Cauldron

## Milestones

- ✅ **v1.0 End-to-End Autonomous Builder** — Phases 1-17 (shipped 2026-03-28)
- ✅ **v1.1 Local Asset Generation & Style-Aware Seeds** — Phases 18-21 (shipped 2026-04-01)
- 🚧 **v1.2 Architectural Hardening** — Phases 22-30 (in progress)

## Phases

<details>
<summary>✅ v1.0 End-to-End Autonomous Builder (Phases 1-17) — SHIPPED 2026-03-28</summary>

See `.planning/milestones/v1.0-ROADMAP.md` for full details.

- [x] Phase 1: Foundation & Infrastructure
- [x] Phase 2: LLM Gateway & Model Routing
- [x] Phase 3: Socratic Interview & Seed Crystallization
- [x] Phase 4: Cross-Model Holdout Testing
- [x] Phase 5: DAG Decomposition & Dispatch
- [x] Phase 6: Bead Execution Engine
- [x] Phase 6.1: Bead Execution Hardening
- [x] Phase 6.2: Execution Pipeline Wiring
- [x] Phase 7: Evolution Loop
- [x] Phase 8: Web Dashboard — Core Surfaces
- [x] Phase 9: Web Dashboard — Execution & Evolution
- [x] Phase 10: Web Dashboard — Cost & Settings
- [x] Phase 11: CLI & Engine Wiring
- [x] Phase 12: CLI Commands — Project & Interview
- [x] Phase 13: CLI Commands — Seed, Holdout, Pipeline
- [x] Phase 14: Dogfooding
- [x] Phase 15: Release Readiness — CI, Docs, Polish
- [x] Phase 16: Post-Audit Gap Closure
- [x] Phase 17: Release Validation & Hardening

</details>

<details>
<summary>✅ v1.1 Local Asset Generation & Style-Aware Seeds (Phases 18-21) — SHIPPED 2026-04-01</summary>

See `.planning/milestones/v1.1-ROADMAP.md` for full details.

- [x] Phase 18: Async Asset Engine (3 plans) — completed 2026-03-31
- [x] Phase 19: Local Image MCP & App Delivery (3 plans) — completed 2026-04-01
- [x] Phase 20: Operator Controls & E2E Validation (2 plans) — completed 2026-04-01
- [x] Phase 21: v1.1 Polish — Integration Wiring & Type Fixes (1 plan) — completed 2026-04-01

</details>

### 🚧 v1.2 Architectural Hardening (In Progress)

**Milestone Goal:** Close the 15 documented race conditions, silent failures, data integrity gaps, and performance bottlenecks in the v1.1 system before the platform handles parallel agent workloads at scale.

- [x] **Phase 22: Schema Migrations — Integrity Indexes** - Add uniqueness constraints and composite indexes as pure additive migrations (completed 2026-04-02)
- [x] **Phase 23: FK Cascade Strategy** - Assign CASCADE or SET NULL per foreign key relationship based on structural vs. audit table classification (completed 2026-04-02)
- [x] **Phase 24: Concurrency & Performance** - Enforce optimistic locking on bead completion, synchronous usage recording, and N+1 query elimination (completed 2026-04-02)
- [x] **Phase 25: Process Reliability & Transactions** - Enforce two-phase timeout kill, transactional holdout failure rollback, and DAGCanvas error boundary (completed 2026-04-02)
- [x] **Phase 26: Auth Middleware** - Wire authenticatedProcedure to all tRPC mutation routes (completed 2026-04-02)
- [x] **Phase 27: Structured Conflict Resolution** - Replace string-scanning heuristic with Zod-schema-validated AI SDK Output.object() extraction (completed 2026-04-02)
- [x] **Phase 28: KEK Rotation Infrastructure** - Two-phase key rotation with versioned KEK table, bulk re-encryption, and append-only audit log (completed 2026-04-02)
- [x] **Phase 29: MCP Cross-Process IPC** - Bridge Inngest worker push notifications to MCP stdio process via Redis pub/sub (completed 2026-04-02)

## Phase Details

### Phase 22: Schema Migrations — Integrity Indexes
**Goal**: The database enforces event sequence uniqueness, seed version uniqueness, and efficient lookup indexes before any application code relies on them
**Depends on**: Phase 21 (v1.1 complete)
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04
**Success Criteria** (what must be TRUE):
  1. Inserting a second event with the same project_id + sequence_number raises a DB constraint violation — duplicate events cannot be silently created
  2. Event queries by project + sequence and project + occurred_at use index scans — no full-table scans on the events table
  3. Inserting a second seed with the same parent_seed_id + version raises a constraint violation — parallel evolution workers cannot race on version numbers
  4. DAG traversal from target bead back to source uses the reverse-lookup index on bead_edges — reverse direction queries do not scan the full table
**Plans:** 2/2 plans complete
Plans:
- [x] 22-01-PLAN.md — Schema declarations, migrations (0015 cleanup + 0016 constraints), appendEvent retry
- [ ] 22-02-PLAN.md — Integration tests proving all DATA-01 through DATA-04 constraints

### Phase 23: FK Cascade Strategy
**Goal**: Deleting a project removes all structural child rows automatically and nullifies audit table references — no orphan rows accumulate, and cost and event history survives project deletion
**Depends on**: Phase 22
**Requirements**: DATA-05
**Success Criteria** (what must be TRUE):
  1. Deleting a project cascades to beads, bead_edges, holdout_vault, and asset_jobs — no orphan structural rows remain after project deletion
  2. Deleting a project sets project_id to NULL on llm_usage and events rows — cost history and event logs survive and remain queryable
  3. An integration test asserts that llm_usage and events row counts are unchanged after a project is deleted
**Plans:** 2/2 plans complete
Plans:
- [x] 23-01-PLAN.md — Hand-crafted FK migration (0017) + Drizzle schema updates for all 8 tables
- [x] 23-02-PLAN.md — Integration tests proving CASCADE and SET NULL behaviors

### Phase 24: Concurrency & Performance
**Goal**: Bead state transitions are race-condition safe, budget enforcement reflects actual spend, and the projects list loads in a single query regardless of project count
**Depends on**: Phase 22
**Requirements**: CONC-01, CONC-02, PERF-01
**Success Criteria** (what must be TRUE):
  1. An Inngest retry that attempts to complete an already-completed bead receives a conflict error — double-completion cannot silently corrupt bead state
  2. A budget check immediately following a parallel LLM call reflects the actual cost of that call — no window where the kill switch sees stale spend
  3. The projects list page issues a single SQL query regardless of how many projects, seeds, or beads exist — query count does not scale with project count
**Plans:** 2/2 plans complete
Plans:
- [x] 24-01-PLAN.md — Optimistic locking on completeBead + synchronous LLM usage recording
- [ ] 24-02-PLAN.md — N+1 query elimination in projects list route

### Phase 25: Process Reliability & Transactions
**Goal**: Hung agent processes are killed without operator intervention, crystallization with holdout failure leaves no partial state, and a DAGCanvas render crash does not take down the execution page
**Depends on**: Phase 22
**Requirements**: CONC-03, CONC-04, SEC-03
**Success Criteria** (what must be TRUE):
  1. An agent process that exceeds its hard timeout receives SIGTERM followed by SIGKILL after a 5-second grace period — the process does not run past the limit
  2. When holdout sealing fails after crystallization, the seed is rolled back or marked incomplete — the projects list does not show a seed without test coverage as fully crystallized
  3. A runtime error thrown by DAGCanvas renders a fallback UI instead of a blank execution page — the project list, interview, and other surfaces remain fully functional
**Plans**: TBD
**UI hint**: yes

### Phase 26: Auth Middleware
**Goal**: Every tRPC mutation route requires a valid API key — no operation is publicly accessible when CAULDRON_API_KEY is set
**Depends on**: Phase 22
**Requirements**: SEC-02
**Success Criteria** (what must be TRUE):
  1. A tRPC mutation request with a missing or incorrect API key receives an UNAUTHORIZED response — the operation does not proceed
  2. A request with no API key in an environment where CAULDRON_API_KEY is unset succeeds — the dev-mode bypass remains functional for local development
  3. All existing integration tests continue to pass without modification — the dev-mode bypass means tests do not require API key headers
**Plans:** 1/1 plans complete
Plans:
- [ ] 26-01-PLAN.md — Switch 14 mutations to authenticatedProcedure + auth rejection tests

### Phase 27: Structured Conflict Resolution
**Goal**: Merge conflict resolution writes only Zod-schema-validated JSON per file to source — LLM prose can never reach the filesystem
**Depends on**: Phase 22
**Requirements**: CONC-05
**Success Criteria** (what must be TRUE):
  1. A conflict resolution response that fails Zod validation throws AI_NoObjectGeneratedError — the merge operation fails explicitly rather than writing malformed content
  2. The confidence field on each resolved file is a typed enum value (high or low) — string-scanning for "confidence" substrings is eliminated
  3. Resolved file contents are structured objects with path and resolved_content fields — no raw LLM prose is written directly to source files
**Plans:** 1/1 plans complete
Plans:
- [x] 27-01-PLAN.md — Replace generateText with generateObject + Zod schema in resolveConflict

### Phase 28: KEK Rotation Infrastructure
**Goal**: A KEK compromise can be responded to by rotating to a new key and re-encrypting all DEKs, with a complete audit trail and no disruption to in-flight holdout evaluations
**Depends on**: Phase 25
**Requirements**: SEC-01
**Success Criteria** (what must be TRUE):
  1. Running the KEK rotation utility re-encrypts all holdout_vault DEKs under the new KEK — all holdout decryptions succeed after rotation completes
  2. The rotation audit log records three distinct events: rotation started, all DEKs re-encrypted, old key retired — the full rotation is traceable
  3. Holdout evaluations that began decrypting before rotation completes are not broken — the dual-encrypt window ensures the old key remains valid until all in-flight evaluations finish
  4. The old KEK is not retired in the same deployment that introduces the new KEK — no in-flight evaluation can see a missing key
**Plans:** 2/2 plans complete
Plans:
- [ ] 28-01-PLAN.md — Schema (kek_versions, kek_rotation_log, kek_version column), rotation core logic, dual-key unseal, unit tests
- [x] 28-02-PLAN.md — CLI rotate-kek command with --init, rotation, and --retire-old modes

### Phase 29: MCP Cross-Process IPC
**Goal**: Push notifications from the Inngest worker process reach the MCP stdio process reliably via Redis pub/sub — push is best-effort and pull via check-job-status remains the correctness path
**Depends on**: Phase 22
**Requirements**: ARCH-01
**Success Criteria** (what must be TRUE):
  1. An asset job status change in the Inngest worker process triggers a Redis PUBLISH to the job's channel — the event is not silently dropped at the process boundary
  2. The MCP stdio process receives the pub/sub message and calls notifyJobStatusChanged — the consuming app sees a push notification without polling
  3. A Redis connection failure in the IPC path is logged but does not surface as an error to the caller — check-job-status DB query remains the reliable fallback
**Plans:** 2/2 plans complete
Plans:
- [x] 29-01-PLAN.md — IPC publisher + subscriber modules with unit tests
- [x] 29-02-PLAN.md — Wire publisher into events.ts/CLI bootstrap, subscriber into MCP bootstrap/index

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-17 | v1.0 | 65/65 | Complete | 2026-03-28 |
| 18. Async Asset Engine | v1.1 | 3/3 | Complete | 2026-03-31 |
| 19. Local Image MCP & App Delivery | v1.1 | 3/3 | Complete | 2026-04-01 |
| 20. Operator Controls & E2E Validation | v1.1 | 2/2 | Complete | 2026-04-01 |
| 21. v1.1 Polish — Integration Wiring | v1.1 | 1/1 | Complete | 2026-04-01 |
| 22. Schema Migrations — Integrity Indexes | v1.2 | 1/2 | Complete    | 2026-04-02 |
| 23. FK Cascade Strategy | v1.2 | 2/2 | Complete    | 2026-04-02 |
| 24. Concurrency & Performance | v1.2 | 1/2 | Complete    | 2026-04-02 |
| 25. Process Reliability & Transactions | v1.2 | 2/2 | Complete    | 2026-04-02 |
| 26. Auth Middleware | v1.2 | 0/1 | Complete    | 2026-04-02 |
| 27. Structured Conflict Resolution | v1.2 | 1/1 | Complete    | 2026-04-02 |
| 28. KEK Rotation Infrastructure | v1.2 | 1/2 | Complete    | 2026-04-02 |
| 29. MCP Cross-Process IPC | v1.2 | 2/2 | Complete    | 2026-04-02 |

### Phase 30: Replace OpenAI Provider

**Goal**: Remove `@ai-sdk/openai` entirely and replace all OpenAI model references with Anthropic (primary), Google, Mistral (new), and local Qwen via Ollama (experimental) — no pipeline stage references a missing provider
**Depends on**: Phase 29
**Requirements**: TBD
**Success Criteria** (what must be TRUE):
  1. `@ai-sdk/openai` is not in any package.json — `grep -r "ai-sdk/openai" packages/*/package.json` returns zero results
  2. `cauldron.config.ts` contains no `gpt-` model references — all stages map to Anthropic, Google, Mistral, or Ollama models
  3. `packages/engine/src/gateway/providers.ts` resolves `mistral` and `ollama` provider families — new switch cases exist and return valid AI SDK provider instances
  4. `packages/engine/src/evolution/embeddings.ts` uses Mistral embeddings — no OpenAI embedding references remain
  5. All existing tests pass with updated mocks — no test references `@ai-sdk/openai`
**Plans**: TBD
