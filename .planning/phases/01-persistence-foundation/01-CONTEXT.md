# Phase 1: Persistence Foundation - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

PostgreSQL event store, Redis, Drizzle schema, Docker Compose dev environment, and Turborepo monorepo scaffolding. This phase delivers the data layer that enforces Cauldron's core invariants — event immutability, seed lineage, DAG edges — so every subsequent phase writes against a contract that cannot be violated.

</domain>

<decisions>
## Implementation Decisions

### Schema Design
- **D-01:** Seed YAML content stored as structured columns — decompose seed fields (goal, constraints, acceptance_criteria, ontology_schema, evaluation_principles, exit_conditions) into typed PostgreSQL columns. Queryable, validates at DB level.
- **D-02:** Bead DAG edges modeled as a separate BeadEdge table with (from_bead_id, to_bead_id, edge_type). Edge type is an enum: blocks, parent_child, conditional_blocks, waits_for. Standard graph-in-RDBMS pattern.
- **D-03:** Evolution lineage tracked via parent_id FK on the seed table. Recursive CTE traversal when ancestry queries are needed. No closure table — lineages are short (< 30 generations).
- **D-04:** Encrypted holdout tests stored as DB blob in a holdout_vault table alongside metadata (seed_id, status, encrypted_at, unsealed_at).

### Event Sourcing
- **D-05:** Hybrid event sourcing — events are append-only log, materialized views / denormalized read tables for fast queries. Audit trail + query performance.
- **D-06:** Events scoped to pipeline milestones (~15-20 event types): interview started/completed, seed crystallized, holdouts sealed/unsealed, bead claimed/completed/failed, evolution started/converged, merge completed.
- **D-07:** Snapshotting built from day one — periodic snapshots for each project aggregate even though v1 event volumes will be low. Establishes the pattern for future scale.

### Monorepo Layout
- **D-08:** 4-package Turborepo + pnpm monorepo: packages/web (Next.js dashboard), packages/api (tRPC server), packages/engine (Inngest workers + pipeline logic), packages/shared (types, schemas, utils).
- **D-09:** Drizzle table definitions in `packages/shared` are the single source of truth for TypeScript types. tRPC routers in `api` consume these. `web` consumes tRPC client types.
- **D-10:** Inngest worker functions defined in `packages/engine/src/inngest/`. Engine runs as its own process, separate from the API.

### Dev Environment
- **D-11:** Fully containerized Docker Compose — PostgreSQL, Redis, Inngest dev server, AND all app services. Consistent environment across machines.
- **D-12:** TypeScript seed scripts for dev/test data (`pnpm db:seed`). Insert example projects, seeds, beads. Deterministic, version-controlled.

### Claude's Discretion
- Table naming conventions, column naming (snake_case vs camelCase)
- Drizzle migration naming and organization strategy
- Docker Compose service naming and networking
- Vitest configuration and test file organization
- ESLint / Prettier / TypeScript config details

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Research
- `.planning/research/STACK.md` — Technology stack decisions: Next.js 16, Inngest 4, Drizzle + PostgreSQL, specific versions
- `.planning/research/ARCHITECTURE.md` — Component boundaries, data flow, build order, event sourcing patterns
- `.planning/research/PITFALLS.md` — Domain pitfalls including DAG cycle detection, context rot, agent coordination failures

### Requirements
- `.planning/REQUIREMENTS.md` §INFR-01 through §INFR-06 — All Phase 1 requirements with success criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
None — greenfield project, no existing code.

### Established Patterns
None yet — this phase establishes the foundational patterns.

### Integration Points
Every subsequent phase depends on this data layer. The schema must support:
- Seeds with structured fields + immutability
- Beads with DAG edges and status tracking
- Events with append-only semantics and snapshot support
- Holdout vault with encrypted blob storage
- Evolution lineage via seed parent_id

</code_context>

<specifics>
## Specific Ideas

- Inngest 4 is the confirmed scheduler (not BullMQ directly) — the schema should accommodate Inngest's event/step model
- AES-256-GCM for holdout encryption (node:crypto, no external library) — holdout_vault table stores ciphertext
- Event types should be an enum that's extensible via migration

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-persistence-foundation*
*Context gathered: 2026-03-25*
