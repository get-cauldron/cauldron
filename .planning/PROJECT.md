# Cauldron

## What This Is

Cauldron is an AI-powered software development platform that orchestrates multiple LLM agents through a structured pipeline — from Socratic requirements gathering to parallel code implementation to evolutionary refinement — producing tested, validated software. It includes durable async image generation backed by a local FLUX.2 dev runtime, exposed through an MCP tool surface for apps and build agents. Think Vercel's v0 on steroids: not just UI generation, but full-stack application development with multi-model orchestration, cross-model holdout testing, autonomous evolutionary loops, and project-owned asset generation. Eventually open-sourced for other developers and small teams.

## Core Value

The full pipeline works end-to-end: a user describes what they want, and Cauldron autonomously designs, decomposes, implements, tests, evaluates, and evolves the software until it meets the goal — with humans steering at key decision points, not babysitting every step.

## Current Milestone: v1.2 Architectural Hardening

**Goal:** Fix race conditions, silent failures, data integrity gaps, and performance bottlenecks that will break under concurrency and growth.

**Target features:**
- Structured JSON extraction for merge conflict resolution
- Event sequence uniqueness constraint per project
- Events table indexes (project+sequence, project+timestamp)
- N+1 query elimination in projects list
- Seed version uniqueness constraint (parent_seed_id + version)
- Enforced timeout supervisor (kill hung agents)
- Holdout failure rollback after crystallization
- Cascading deletes or soft-delete for foreign keys
- Synchronous usage recording for budget accuracy
- Optimistic locking on bead completion
- KEK rotation infrastructure and audit trail
- Auth middleware on tRPC routes
- React error boundaries around DAGCanvas
- Reverse-lookup index on bead_edges
- MCP push notification architecture fix (cross-process IPC)

## History

### v1.1 Shipped (2026-04-01)

**Phases completed:** 21 (plus 2 inserted: 6.1, 6.2)
**Total plans:** 74

v1.0 delivered the complete autonomous builder pipeline. v1.1 added local asset generation with durable async jobs, MCP tool surface, operator controls, and E2E verification.

## Requirements

### Validated

- Monorepo scaffold (Turborepo + pnpm, 4 packages) — v1.0
- PostgreSQL schema (7 tables: projects, seeds, beads, bead_edges, events, holdout_vault, snapshots) — v1.0
- Docker Compose dev environment (PG, Redis, Inngest) — v1.0
- Event sourcing with append/replay/snapshot — v1.0
- Drizzle migrations infrastructure — v1.0
- 13 integration tests against real PostgreSQL (no mocks) — v1.0
- Vercel AI SDK multi-provider gateway with stage-based routing — v1.0
- Provider failover with circuit breaker and ordered fallback chains — v1.0
- Token usage tracking with cost calculation — v1.0
- Cross-model diversity enforcement for holdout generation — v1.0
- Per-project budget kill switch — v1.0
- Socratic interview with multi-perspective panel (5 perspectives, cross-model diversity) — v1.0
- Deterministic ambiguity scoring (hybrid LLM + rule validation) — v1.0
- Immutable seed spec with DB-only storage and recursive CTE lineage — v1.0
- Brownfield interview mode with auto-detection — v1.0
- Cross-model holdout test generation with adversarial prompting — v1.0
- AES-256-GCM envelope encryption (DEK/KEK) with process-level key isolation — v1.0
- Two-pass LLM decomposition (molecules then beads) with cycle detection — v1.0
- Atomic bead claiming with optimistic concurrency — v1.0
- Inngest dispatch with fan-in synchronization — v1.0
- WorktreeManager for git worktree isolation per bead — v1.0
- ContextAssembler with knowledge graph queries and token budget trimming — v1.0
- AgentRunner TDD loop with self-healing iterations — v1.0
- MergeQueue with DAG topological ordering and LLM conflict resolution — v1.0
- HZD-styled web dashboard (project, interview, execution, evolution, cost, settings) — v1.0
- CLI with 14 commands and Hono engine server — v1.0
- ✓ Durable async asset jobs with 6-state lifecycle (pending/claimed/active/completed/failed/canceled) — v1.1
- ✓ ComfyUI HTTP adapter with FLUX.2 dev workflow template — v1.1
- ✓ Artifact writer with JSON provenance sidecars — v1.1
- ✓ Idempotency key dedup at DB level — v1.1
- ✓ Inngest asset/generate function with 3 durable steps — v1.1
- ✓ Local image MCP server with 4 tools (generate, check-status, list-jobs, deliver-artifact) — v1.1
- ✓ Operator asset controls (mode, concurrency, budgets) via tRPC and CLI — v1.1
- ✓ `cauldron verify assets` E2E pipeline verification command — v1.1
- ✓ Asset event emission and MCP push notification callbacks — v1.1
- ✓ Float-precision guidance_scale column — v1.1
- ✓ Event sourcing sequence uniqueness (UNIQUE constraint + appendEvent retry) — v1.2
- ✓ Events table composite indexes (project+sequence, project+occurred_at) — v1.2
- ✓ Seed version partial unique index (parent_seed_id + version) — v1.2
- ✓ bead_edges reverse-lookup index (target_bead_id) — v1.2
- ✓ FK cascade strategy (CASCADE structural, SET NULL audit tables) — v1.2
- ✓ Optimistic locking on bead completion (version-conditioned WHERE) — v1.2
- ✓ Synchronous LLM usage recording for budget enforcement — v1.2
- ✓ N+1 query elimination in projects list (LATERAL JOIN) — v1.2
- ✓ Enforced timeout supervisor (SIGTERM → 5s → SIGKILL) — v1.2
- ✓ Holdout failure rollback with DB transaction — v1.2
- ✓ DAGCanvas React error boundary — v1.2

### Active

- Structured merge conflict resolution with per-file JSON extraction
- KEK rotation infrastructure with audit trail
- Auth middleware on tRPC routes (beyond context-level)
- React error boundaries around DAGCanvas
- Reverse-lookup index on bead_edges
- MCP push notifications via IPC or shared-process architecture (v1.1 tech debt)

### Deferred

- Style-aware interview capturing visual direction as a first-class ambiguity dimension — v1.3
- Model acquisition UX (import from ComfyUI install or guided upstream download) — v1.3

### Out of Scope

- Digital twins (locally-running mock servers for third-party integrations) — v2, dogfooding target
- Deployment to cloud infrastructure — v2, after development pipeline is proven
- Mobile app store packaging — v2+
- Multi-tenant SaaS hosting — eventual OSS concern
- Real-time collaboration — v2+
- Billing/payments — not needed until SaaS
- Committing model binaries to git — gitignored local runtime
- Synchronous image generation — must be async-first
- Embedded ComfyUI workflow editor — managed generation, not ComfyUI clone
- Video, audio, or 3D generation — 2D image path first
- Model fine-tuning or LoRA training — acquisition and inference first

## Context

### Codebase State

- **Packages:** 5 (shared, engine, cli, web, mcp)
- **Tech stack:** TypeScript, Next.js 16, React 19, Tailwind CSS 4, tRPC 11, Hono, Vercel AI SDK 6, Drizzle ORM, Inngest 4, Vitest, Playwright
- **Database:** PostgreSQL with 14 migrations, event sourcing, JSONB metadata
- **Asset runtime:** ComfyUI via Docker, FLUX.2 dev workflow template, project-owned model bundle

### Inspirations

| Project | What Cauldron Takes | What Cauldron Improves |
|---------|--------------------|-----------------------|
| **Ouroboros** | Socratic interview, ambiguity scoring, seed spec, evolutionary loop | Cross-model holdouts, web UI, multi-provider routing |
| **Beads** (Yegge) | DAG coordination, molecules/beads hierarchy, parallel-by-default | Integrated with Ouroboros decomposition, web visualization |
| **GSD** | Context window decomposition | Avoids waterfall rigidity and verbose file explosion |
| **codebase-memory-mcp** | Fast code indexing, knowledge graph | Integrated as agent context layer |

### Key Architectural Concepts

- **Seeds are immutable**: Once crystallized, a seed never changes. Evolution creates new seeds.
- **Parallel by default**: Beads execute concurrently unless explicit dependency edges exist.
- **Fresh context per bead**: Each atomic task gets a clean context window.
- **Cross-model adversarial testing**: Holdout tests generated by a different LLM family than the implementer.
- **Autonomous with escalation**: The evolutionary loop runs autonomously but escalates when convergence looks unlikely.
- **Async asset generation**: Image generation runs as durable jobs with observable lifecycle, not blocking requests.

### v1 Test Case

A CLI bulk file renaming tool that accepts natural language requests. Deliberately trivial — the goal is proving the pipeline, not the product.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript end-to-end | Single language, large ecosystem, AI SDK compatibility | ✓ Good |
| Cross-model holdout testing | Prevents LLMs from gaming tests they can see | ✓ Good |
| Seeds are immutable | Clean lineage tracking, prevents spec mutation | ✓ Good |
| Testing cube over testing pyramid | AI agents have infinite patience for E2E coverage | ✓ Good |
| Deployment is v2 | Prove development pipeline first | -- Pending |
| CLI renaming tool as v1 test case | Trivially simple app to prove pipeline | -- Pending |
| HZD Cauldron visual identity | Distinctive, differentiated from generic SaaS | ✓ Good |
| Dogfood ASAP | Use Cauldron subsystems to build subsequent phases | -- Pending |
| Project-owned FLUX.2 dev bundle | Local-first, reproducible, not dependent on global cache | ✓ Good |
| Async-only image generation | Durable job tracking over blocking requests | ✓ Good |
| MCP tool surface for apps | Apps consume generation through stable tool contract, not direct API | ✓ Good |
| Callback injection for cross-package notifications | Engine doesn't import MCP; MCP injects callbacks at bootstrap | ✓ Good |
| AssetOutputMetadata in schema file | Avoids circular dependency between shared and engine packages | ✓ Good |
| ALTER TYPE ADD VALUE for enum extension | Safe for existing DB, no drop/recreate | ✓ Good |
| Deep-merge for settings updates | Prevents clobbering sibling keys when updating one sub-key | ✓ Good |

## Constraints

- **Tech stack**: TypeScript end-to-end
- **AI SDK**: Vercel AI SDK for multi-provider model interface
- **Context window**: Each bead must fit in ~200k tokens with room for implementation
- **OSS dependencies**: Use if 80%+ fit is clean; reject if it forces architectural contortion
- **Encryption**: Holdout tests must be encrypted at rest with keys inaccessible to implementation agents
- **Local runtime**: Image generation must work against a project-owned local FLUX.2 dev bundle
- **Asynchrony**: Image generation cannot block interactive requests

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition:**
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone:**
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-02 after Phase 25 completion*
