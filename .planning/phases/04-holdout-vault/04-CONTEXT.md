# Phase 4: Holdout Vault - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Cross-model adversarial test generation from crystallized seeds, AES-256-GCM envelope encryption at rest with key isolation from agent processes, human review/approval before sealing, and an unsealing protocol triggered by evolutionary convergence events. The vault makes it structurally impossible for implementation agents to see or game the tests they will be evaluated against.

</domain>

<decisions>
## Implementation Decisions

### Test Generation Strategy
- **D-01:** Scenario-based acceptance tests — LLM generates behavioral scenarios from the seed's acceptance criteria and goal using Given/When/Then format. Tests the WHAT, not the HOW. Executable by an LLM evaluator after implementation.
- **D-02:** Proportional test count — 1-3 holdout scenarios per acceptance criterion in the seed. Minimum 5 total. Coverage scales with seed complexity.
- **D-03:** Single structured LLM call — one `gateway.generateObject` call with `stage: 'holdout'` (cross-model diversity enforced by gateway). Seed content + adversarial system prompt. Returns array of scenario objects via Zod schema.
- **D-04:** Adversarial edge case emphasis — system prompt instructs the holdout model to specifically generate edge cases that LLMs commonly miss: boundary conditions, error handling, concurrency, empty/null inputs, large inputs, unicode/encoding.
- **D-05:** Structured scenario schema — each scenario: `{id, title, given, when, then, category (happy_path|edge_case|error_handling|performance|security), acceptanceCriterionRef, severity (critical|major|minor)}`. Machine-evaluable after unsealing.

### Human Review & Approval Flow
- **D-06:** Full per-scenario review — user sees all generated scenarios. Can approve, edit, or reject each individually. Can request regeneration of only the rejected scenarios (new LLM call with rejection context). Bulk "Approve All" option. Minimum 5 approved scenarios required to seal.
- **D-07:** Explicit seal confirmation — after approving scenarios, a separate "Seal Vault" action with an irreversibility warning. Prevents accidental sealing. Two-step: approve scenarios → confirm seal.
- **D-08:** Single encrypted blob — all approved scenarios serialized to JSON, encrypted as one ciphertext blob, stored as one holdout_vault row per seed. Unsealing is all-or-nothing.
- **D-09:** Partial regeneration — rejecting scenarios triggers regeneration of only the rejected ones. Approved scenarios preserved. Can iterate until satisfied.

### Encryption & Key Isolation
- **D-10:** Envelope encryption (DEK/KEK) — generate random DEK per holdout set. Encrypt scenarios with DEK (AES-256-GCM via `node:crypto`). Encrypt DEK with master KEK (`HOLDOUT_ENCRYPTION_KEY` env var). Store encrypted DEK alongside ciphertext. Allows KEK rotation without re-encrypting all holdouts. Schema already has `encryptedDek` column.
- **D-11:** Inngest step-level env scoping for key isolation — holdout encryption/decryption runs in a dedicated Inngest step that has `HOLDOUT_ENCRYPTION_KEY` in its env. Agent execution steps are spawned WITHOUT this env var. Inngest `step.run()` allows per-step env configuration.
- **D-12:** Both unit + integration tests for key isolation — unit test mocks process.env to verify decrypt() throws without key. Integration test creates a child process simulating agent env (minus key), attempts decrypt, asserts failure. Proves isolation structurally.

### Unsealing Protocol
- **D-13:** Convergence event trigger — Phase 7's evolutionary loop emits an `evolution_converged` event. The vault listens for this event and unseals. Phase 4 builds the unseal function + event handler registration. Phase 7 triggers it. Clean separation of concerns.
- **D-14:** LLM evaluator for holdout assessment — an LLM (evaluation stage) receives the unsealed scenarios + actual built code and evaluates pass/fail per scenario. Structured output with pass/fail, reasoning, and evidence. Same approach Phase 7's evo loop uses for general evaluation.
- **D-15:** Failure context packaged for evo loop — failed holdout scenarios + evaluator reasoning packaged into a structured failure report. Attached to a new `evolution_started` event that Phase 7's evo loop consumes. Phase 4 builds the packaging; Phase 7 consumes it.
- **D-16:** Extended holdout status enum — full lifecycle: `pending_review → approved → sealed → unsealed → evaluated`. Requires extending the existing `holdoutStatusEnum` (currently: sealed/unsealed/evaluated) with `pending_review` and `approved`.
- **D-17:** No re-sealing after evaluation — once unsealed, scenarios become known. Re-sealing would be security theater. The evo loop works with known holdout tests as additional acceptance criteria. The value was in preventing agents from seeing them during initial implementation.
- **D-18:** Evaluation results stored in DB — after evaluation, store results as JSONB on the holdout_vault row (or add a results column): per-scenario pass/fail, evaluator reasoning, evaluation model used, timestamp. Enables audit trail and dashboard visualization.

### Claude's Discretion
- Exact adversarial system prompt content
- Zod schema details for holdout scenarios
- Inngest step configuration for env isolation
- Encryption/decryption function implementation details
- Event handler registration pattern
- Holdout evaluation prompt design
- Failure report structure for evo loop consumption
- Migration SQL for holdoutStatusEnum extension
- Whether to add a `results` JSONB column to holdout_vault or create a separate holdout_results table

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §HOLD-01 through §HOLD-08 — All Phase 4 requirements with success criteria

### Prior Phase Context
- `.planning/phases/01-persistence-foundation/01-CONTEXT.md` — Schema decisions: D-04 (holdout vault table with encrypted blob)
- `.planning/phases/02-llm-gateway/02-CONTEXT.md` — Gateway API: D-07 (cross-model diversity enforcement), D-18 (diversity during failover)
- `.planning/phases/03-interview-seed-pipeline/03-CONTEXT.md` — Seed crystallization decisions that produce the seeds holdout tests are generated from

### Existing Code
- `packages/shared/src/db/schema/holdout.ts` — Holdout vault table with ciphertext, encryptedDek, iv, authTag, status (sealed/unsealed/evaluated), seedId FK
- `packages/shared/src/db/schema/event.ts` — Event types including holdouts_sealed, holdouts_unsealed
- `packages/engine/src/gateway/diversity.ts` — Cross-model diversity enforcement (enforceDiversity, filterDiverseModels)
- `packages/engine/src/gateway/gateway.ts` — LLM gateway with holdout stage routing
- `packages/engine/src/interview/crystallizer.ts` — Seed crystallization that Phase 4 consumes
- `packages/shared/src/db/schema/seed.ts` — Seeds table with structured columns (goal, constraints, acceptanceCriteria, etc.)

### Stack References
- CLAUDE.md §Encryption — `node:crypto` AES-256-GCM, HOLDOUT_ENCRYPTION_KEY env var, GCM authentication tag

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **LLM Gateway** (`packages/engine/src/gateway/`): `generateObject` with holdout stage routing and cross-model diversity enforcement. All holdout generation calls go through this — diversity is automatic.
- **Event Store** (`packages/shared/src/db/event-store.ts`): Append events for holdouts_sealed, holdouts_unsealed
- **Holdout Schema** (`packages/shared/src/db/schema/holdout.ts`): Table already exists with envelope encryption columns (encryptedDek, iv, authTag, ciphertext)
- **Seed Data** (`packages/shared/src/db/schema/seed.ts`): Structured seed columns (goal, acceptanceCriteria, etc.) that holdout generation reads
- **Crystallizer** (`packages/engine/src/interview/crystallizer.ts`): Seeds are crystallized here — holdout generation triggers after crystallization

### Established Patterns
- Drizzle schema in `packages/shared`, consumed by engine
- pgEnum for status enums (extend holdoutStatusEnum with new states)
- UUID primary keys with `.defaultRandom()`
- Gateway stage-based routing with cross-model diversity
- Event store for audit trail
- `.js` extensions on all relative TypeScript imports
- Zod schemas for structured LLM output

### Integration Points
- holdoutStatusEnum needs extension via migration (add pending_review, approved)
- Holdout module created in `packages/engine/src/holdout/` (new directory)
- Gateway called with `stage: 'holdout'` for test generation
- Event store receives holdouts_sealed and holdouts_unsealed events
- Inngest step integration for key isolation (Phase 6 execution context)
- Results column or table addition for evaluation storage

</code_context>

<specifics>
## Specific Ideas

- Envelope encryption: random 256-bit DEK via `crypto.randomBytes(32)`, encrypt data with DEK using AES-256-GCM, encrypt DEK with KEK from `HOLDOUT_ENCRYPTION_KEY` env var using AES-256-GCM, store both ciphertexts
- The holdout_vault table already has the right columns — just needs the enum extension migration and possibly a results column
- Cross-model diversity is already enforced by the gateway for holdout stage calls — no new diversity logic needed in Phase 4
- Holdout evaluation is the same pattern Phase 7 uses for goal evaluation — can share the evaluator infrastructure
- The adversarial prompt should encourage the holdout model to think about what the IMPLEMENTING model might miss, leveraging the cross-model perspective

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-holdout-vault*
*Context gathered: 2026-03-26*
