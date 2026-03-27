# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- GSD:project-start source:PROJECT.md -->
## Project

**Cauldron** is an AI-powered software development platform that orchestrates multiple LLM agents through a structured pipeline — from Socratic requirements gathering to parallel code implementation to evolutionary refinement — producing tested, validated software.

**Core Value:** A user describes what they want, and Cauldron autonomously designs, decomposes, implements, tests, evaluates, and evolves the software until it meets the goal — with humans steering at key decision points, not babysitting every step.

### Constraints

- **Tech stack**: TypeScript end-to-end
- **AI SDK**: Vercel AI SDK for multi-provider model interface
- **Context window**: Each bead must fit in ~200k tokens with room for implementation
- **OSS dependencies**: Use if 80%+ fit is clean; reject if it forces architectural contortion
- **Encryption**: Holdout tests must be encrypted at rest with keys inaccessible to implementation agents
<!-- GSD:project-end -->

## Commands

### Build & Dev
```bash
pnpm build                          # Build all packages (turbo)
pnpm dev                            # Start dev servers (Next.js :3000)
pnpm typecheck                      # Type-check all packages
pnpm lint                           # Lint all packages
pnpm db:generate                    # Generate Drizzle migrations from schema changes
pnpm db:migrate                     # Run database migrations
pnpm db:seed                        # Seed test data (runs migrate first)
```

### Testing
```bash
pnpm test                           # All unit tests (turbo)
pnpm test:integration               # Integration tests (needs Docker Postgres on :5433)

# Per-package
pnpm -F @get-cauldron/cli test
pnpm -F @get-cauldron/engine test
pnpm -F @get-cauldron/shared test
pnpm -F @get-cauldron/web test

# Single test file
pnpm -F @get-cauldron/engine test -- src/__tests__/interview.test.ts

# Pattern match
pnpm -F @get-cauldron/engine test -- --grep "crystallizer"

# E2E (Playwright)
pnpm -F @get-cauldron/web test:e2e
```

### Infrastructure
```bash
docker compose up -d                # Postgres (:5432), Postgres-test (:5433), Redis (:6379), Inngest (:8288)
docker compose down
```

### CLI
```bash
pnpm -F @get-cauldron/cli cauldron <command>   # Run CLI directly via tsx
pnpm -F @get-cauldron/cli serve:engine         # Start Inngest engine server (Hono :3001)
```

## Monorepo Structure

```
packages/
├── shared/    @get-cauldron/shared  — Database schema (Drizzle), migrations, event store, shared types
├── engine/    @get-cauldron/engine  — Core AI orchestration pipeline (7 submodules)
├── cli/       @get-cauldron/cli    — User-facing CLI (14 commands) + embedded Hono dev server
└── web/       @get-cauldron/web    — Next.js 16 dashboard, tRPC API, SSE streaming, DAG visualization
```

**Dependency graph:** `shared` ← `engine` ← `cli`, `web`. Package scope is `@get-cauldron/*`.

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

### Pipeline Flow

```
User → CLI or Web UI
  → Interview (Socratic requirements, FSM: gathering → reviewing → approved → crystallized)
  → Crystallize (lock into immutable Seed spec)
  → Seal (generate encrypted holdout tests)
  → Decompose (2-pass breakdown into parallel Beads DAG)
  → Execute (dispatch Beads as Inngest durable steps)
  → Evaluate (run holdout tests against implementation)
  → Evolve (iterative refinement loop)
```

### Key Domain Concepts

- **Seed**: Immutable specification with goal, constraints, and acceptance criteria. Created by crystallizing an interview.
- **Bead**: Atomic execution unit in the DAG. Has status lifecycle and dependency edges.
- **Interview**: Socratic session using an FSM with multi-perspective questioning (researcher, simplifier, architect, breadth-keeper, seed-closer).
- **Holdout**: Cross-model test scenarios encrypted at rest (AES-256-GCM via `node:crypto`). Implementation agents never see these tests.
- **Evolution**: Track seed lineage and iterative refinement across versions.

### Engine Submodules (`packages/engine/src/`)

| Module | Purpose |
|--------|---------|
| `interview/` | FSM, ambiguity scoring, multi-perspective questions, crystallization |
| `decomposition/` | 2-pass task breakdown into parallel bead DAG |
| `holdout/` | Encrypted test vault, generator, evaluator |
| `execution/` | Agent runner, context assembler, worktree manager, merge queue, timeout supervisor |
| `evolution/` | Version evaluator, semantic embeddings for lineage |
| `intelligence/` | Vercel AI SDK adapter (streamText, tool calls) |
| `gateway/` | Multi-model routing, failover, circuit breaker, budget enforcement, pricing |

### Web Architecture (`packages/web/`)

- **tRPC routers** at `src/trpc/routers/`: projects, interview, execution, evolution, costs
- **SSE streaming** at `src/app/api/events/[projectId]/route.ts` via Postgres LISTEN/NOTIFY
- **Inngest webhook** at `src/app/api/inngest/route.ts`
- **DAG visualization** using `@xyflow/react` + `@dagrejs/dagre` auto-layout

### Database

PostgreSQL via Drizzle ORM. Schema in `packages/shared/src/db/schema/`:
- Core tables: `projects`, `interviews`, `seeds`, `beads`, `bead_edges`, `holdout`
- Supporting: `events` (event sourcing), `snapshots`, `llm_usage`
- Key patterns: immutable seeds, event sourcing, optimistic concurrency (version column), JSONB for flexible metadata, row-level locking for atomic bead claims
- DAG stored as adjacency rows (not JSONB blob) — enables ready-bead queries without deserialization
- Uses `postgres` driver (not `pg`/node-postgres) with Drizzle

### Job Orchestration

Inngest v4 for durable execution. `step.run()` for retryable steps, `step.waitForEvent()` for fan-in synchronization. Redis as broker. CLI runs a standalone Hono server on :3001 for Inngest handlers separate from the Next.js app.

### LLM Gateway

`cauldron.config.ts` maps pipeline stages to model families with primary + fallback models. Gateway at `packages/engine/src/gateway/` handles multi-model routing, failover, circuit breaking, budget enforcement, and model diversity constraints for holdout testing.
<!-- GSD:architecture-end -->

## Testing Patterns

- **Unit tests**: Vitest, `*.test.ts`, excludes `*.integration.test.ts`
- **Integration tests**: Vitest, `*.integration.test.ts`, real PostgreSQL (Docker :5433) — **do not mock the database**
- **Web component tests**: Vitest + jsdom + React Testing Library
- **E2E tests**: Playwright against localhost:3000

<!-- GSD:stack-start source:research/STACK.md -->
## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4 (v4 uses CSS `@theme`, no `tailwind.config.ts`), shadcn/ui, @xyflow/react 12 |
| API | tRPC 11 (dashboard↔backend only), Hono (agent workers — separate from Next.js for independent scaling) |
| AI | Vercel AI SDK 6 (`ai`), `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google` |
| Database | PostgreSQL, Drizzle ORM 0.45, `postgres` driver (not `pg`) |
| Validation | Zod 4 (schema validation, tRPC + Drizzle integration) |
| Jobs | Inngest 4, Redis (ioredis) |
| Logging | Pino (structured JSON) |
| Testing | Vitest 4, Playwright 1.58, @testing-library/react |
| Build | Turborepo, pnpm workspaces, TypeScript 6, tsx (direct .ts execution) |
| Crypto | `node:crypto` AES-256-GCM (holdout encryption — no external crypto deps) |

### Key Stack Decisions

- **Hono over Express** for agent worker API — 3x throughput, first-class TypeScript
- **tRPC for internal dashboard↔backend only** — Route Handlers for webhooks, SSE, public endpoints
- **SSE over WebSockets** — AI SDK's `useChat` handles SSE natively; no bidirectional need
- **Drizzle over Prisma** — SQL-like API, no codegen, 90% smaller bundle
- **Inngest over BullMQ/Temporal** — purpose-built for AI agent workflows, simpler than Temporal
- **`@xyflow/react` not `react-flow-renderer`** — latter is unmaintained; use `@dagrejs/dagre` (not unmaintained `dagre` 0.8.x)

### Do Not Use

Express, GraphQL, WebSockets (for streaming), Jest, Cypress, `pg` driver, `react-flow-renderer`, `dagre` 0.8.x, third-party crypto wrappers (aes256, crypto-ts).
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
