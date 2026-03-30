# Project Structure

**Analysis Date:** 2026-03-29

## Directory Layout

```
cauldron/
├── packages/
│   ├── shared/              # @get-cauldron/shared — DB schema, event store, types
│   │   └── src/
│   │       ├── db/
│   │       │   ├── schema/  # Drizzle table definitions (8 files)
│   │       │   ├── migrations/ # Generated SQL migrations
│   │       │   ├── client.ts   # Lazy-init Drizzle client + migration runner
│   │       │   ├── event-store.ts # Event sourcing: append, replay, snapshot
│   │       │   ├── migrate.ts  # CLI migration script
│   │       │   └── seed.ts     # DB seeding script
│   │       ├── types/
│   │       │   └── index.ts    # Re-exports of Drizzle-inferred types
│   │       ├── index.ts        # Package barrel export
│   │       └── trpc-types.ts   # Shared tRPC type definitions
│   │
│   ├── engine/              # @get-cauldron/engine — AI pipeline logic (7 submodules)
│   │   └── src/
│   │       ├── interview/   # Socratic interview FSM
│   │       ├── decomposition/ # 2-pass DAG decomposition + scheduler + Inngest events
│   │       ├── holdout/     # Encrypted test vault + evaluator + Inngest events
│   │       ├── execution/   # Agent runner, worktree, merge queue, timeout
│   │       ├── evolution/   # Seed mutation, convergence, lateral thinking + Inngest events
│   │       ├── gateway/     # LLM routing, failover, circuit breaker, budget, pricing
│   │       ├── intelligence/ # Knowledge graph adapter for code context
│   │       └── index.ts     # Package barrel export
│   │
│   ├── cli/                 # @get-cauldron/cli — CLI + Hono engine server
│   │   └── src/
│   │       ├── commands/    # 14 CLI command implementations
│   │       ├── review/      # Code review utilities
│   │       ├── cli.ts       # CLI entry point (parseArgs, command dispatch)
│   │       ├── engine-server.ts # Hono Inngest server entry (port 3001)
│   │       ├── inngest-serve.ts # Creates Hono app with 5 engine Inngest functions
│   │       ├── bootstrap.ts # Wires all engine deps (migrations, gateway, scheduler)
│   │       ├── config-io.ts # CLI config file management
│   │       ├── server-check.ts # Dev server health check + auto-start
│   │       ├── trpc-client.ts # tRPC client for CLI→web communication
│   │       └── output.ts    # CLI output formatting (spinners, etc.)
│   │
│   ├── web/                 # @get-cauldron/web — Next.js 16 dashboard
│   │   └── src/
│   │       ├── app/         # Next.js App Router pages + API routes
│   │       │   ├── page.tsx # Root page (redirects to /projects)
│   │       │   ├── layout.tsx # Root layout (dark theme, Geist font, Providers)
│   │       │   ├── globals.css # Tailwind CSS 4 styles
│   │       │   ├── projects/
│   │       │   │   ├── page.tsx # Project list page
│   │       │   │   ├── ProjectListClient.tsx # Client component for project list
│   │       │   │   ├── new/page.tsx # New project form
│   │       │   │   └── [id]/
│   │       │   │       ├── layout.tsx # Project detail layout with tab navigation
│   │       │   │       ├── ProjectShellClient.tsx # Client shell with SSE
│   │       │   │       ├── TabLinkClient.tsx # Tab navigation component
│   │       │   │       ├── interview/page.tsx # Interview chat UI
│   │       │   │       ├── execution/page.tsx # DAG visualization + bead execution
│   │       │   │       ├── evolution/page.tsx # Seed lineage + evolution timeline
│   │       │   │       ├── costs/page.tsx # Cost breakdown
│   │       │   │       └── settings/page.tsx # Project settings
│   │       │   └── api/
│   │       │       ├── trpc/[trpc]/route.ts # tRPC HTTP handler
│   │       │       ├── events/[projectId]/route.ts # SSE streaming endpoint
│   │       │       ├── inngest/route.ts # Inngest webhook endpoint
│   │       │       └── webhook/git/route.ts # GitHub push webhook
│   │       ├── components/
│   │       │   ├── ui/       # shadcn/ui primitives (button, card, badge, etc.)
│   │       │   ├── shell/    # Layout: NavSidebar, ProjectHeader, CauldronLogo, HexBackground, EscalationBanner
│   │       │   ├── interview/ # ChatBubble, MCChipGroup, AmbiguityMeter, SeedApprovalCard, ClarityBanner, HoldoutCard
│   │       │   ├── dag/      # DAGCanvas, BeadNode, MoleculeGroup, EdgeStyles
│   │       │   ├── bead/     # BeadDetailSheet, TerminalPane, DiffViewer
│   │       │   └── evolution/ # ConvergencePanel, SeedLineageTree, EvolutionTimeline
│   │       ├── trpc/
│   │       │   ├── init.ts   # tRPC initialization + auth middleware
│   │       │   ├── client.ts # React Query + tRPC client provider
│   │       │   ├── engine-deps.ts # Lazy engine dependency factory for tRPC context
│   │       │   └── routers/  # 5 tRPC routers (projects, interview, execution, evolution, costs)
│   │       ├── hooks/        # React hooks
│   │       ├── inngest/
│   │       │   ├── client.ts # cauldron-web Inngest client
│   │       │   └── pipeline-trigger.ts # Pipeline trigger Inngest function
│   │       └── lib/          # Shared utilities
│   │
│   └── test-harness/        # @get-cauldron/test-harness — Shared E2E test utilities
│       └── src/
│
├── scripts/                 # Utility scripts
│   ├── inject-cli-renamer-seed.ts
│   ├── run-interview-automated.ts
│   └── wait-for-services.sh
│
├── .planning/               # GSD workflow artifacts
│   ├── codebase/            # Codebase analysis documents (this file)
│   ├── phases/              # Phase plans (01 through 17)
│   ├── quick/               # Quick task plans
│   └── research/            # Research documents
│
├── cauldron.config.ts       # Model routing config (pipeline stage → model chain)
├── docker-compose.yml       # Postgres (:5432), Postgres-test (:5433), Redis (:6379), Inngest (:8288)
├── docker-compose.live-test.yml # Live E2E test environment
├── turbo.json               # Turborepo task config
├── pnpm-workspace.yaml      # Workspace declaration
├── tsconfig.json            # Root TypeScript config
└── package.json             # Root scripts (build, test, typecheck, lint, db:*)
```

## Package Dependencies

```
@get-cauldron/shared (zero workspace deps)
    ↑
@get-cauldron/engine (depends on: shared)
    ↑
@get-cauldron/cli (depends on: shared, engine)
@get-cauldron/web (depends on: shared, engine)
@get-cauldron/test-harness (depends on: shared, engine) — devDep of web
```

All workspace references use `workspace:*` protocol in package.json.

## Key Files

### Entry Points

| File | Purpose | Stability |
|------|---------|-----------|
| `packages/cli/src/cli.ts` | CLI entry point — parseArgs, command dispatch | high |
| `packages/cli/src/engine-server.ts` | Hono Inngest server entry (port 3001) | high |
| `packages/cli/src/bootstrap.ts` | Wires all engine deps at startup | high |
| `packages/web/src/app/layout.tsx` | Next.js root layout (dark theme, providers) | high |
| `packages/web/src/app/page.tsx` | Root page | high |

### Configuration

| File | Purpose | Stability |
|------|---------|-----------|
| `cauldron.config.ts` | Model routing: pipeline stage → model chain + budget | medium |
| `turbo.json` | Turborepo task definitions + env passthrough | high |
| `docker-compose.yml` | Local dev infrastructure (Postgres, Redis, Inngest) | high |
| `pnpm-workspace.yaml` | Workspace package paths | high |
| `tsconfig.json` | Root TypeScript config | high |

### Core Logic

| File | Purpose | Stability |
|------|---------|-----------|
| `packages/engine/src/gateway/gateway.ts` | LLM gateway — routing, failover, budget, usage tracking | high |
| `packages/engine/src/interview/fsm.ts` | Interview FSM (startOrResume, submitAnswer) | high |
| `packages/engine/src/interview/crystallizer.ts` | Seed crystallization (immutability enforcement) | high |
| `packages/engine/src/decomposition/decomposer.ts` | 2-pass LLM decomposition into bead DAG | medium |
| `packages/engine/src/decomposition/scheduler.ts` | findReadyBeads, claimBead, completeBead | high |
| `packages/engine/src/decomposition/events.ts` | Inngest handlers: dispatch, completion fan-out, merge | high |
| `packages/engine/src/execution/agent-runner.ts` | TDD self-healing loop for bead execution | medium |
| `packages/engine/src/execution/worktree-manager.ts` | Git worktree creation/cleanup | medium |
| `packages/engine/src/execution/merge-queue.ts` | Serialized merge queue with LLM conflict resolution | medium |
| `packages/engine/src/holdout/crypto.ts` | AES-256-GCM encryption for holdout tests | high |
| `packages/engine/src/holdout/events.ts` | Inngest convergence handler + vault Inngest client | high |
| `packages/engine/src/evolution/events.ts` | Evolution FSM Inngest handler | medium |
| `packages/engine/src/evolution/evaluator.ts` | Goal attainment scoring | medium |
| `packages/engine/src/evolution/mutator.ts` | Seed mutation for evolution | medium |
| `packages/shared/src/db/event-store.ts` | Event sourcing: append, replay, snapshot | high |
| `packages/shared/src/db/client.ts` | Lazy-init DB client + migration runner | high |

### Database Schema

| File | Purpose | Stability |
|------|---------|-----------|
| `packages/shared/src/db/schema/project.ts` | Projects table + ProjectSettings type | high |
| `packages/shared/src/db/schema/interview.ts` | Interviews table (FSM state, transcript JSONB) | high |
| `packages/shared/src/db/schema/seed.ts` | Seeds table (immutable specs, evolution lineage) | high |
| `packages/shared/src/db/schema/bead.ts` | Beads + BeadEdges tables (DAG adjacency rows) | high |
| `packages/shared/src/db/schema/event.ts` | Events table (35 event types, append-only) | high |
| `packages/shared/src/db/schema/holdout.ts` | Holdout vault (encryption columns, FSM status) | high |
| `packages/shared/src/db/schema/llm-usage.ts` | LLM usage tracking (tokens, cost per call) | high |
| `packages/shared/src/db/schema/snapshot.ts` | Project state snapshots for event replay optimization | high |

### tRPC API

| File | Purpose | Stability |
|------|---------|-----------|
| `packages/web/src/trpc/init.ts` | tRPC initialization + API key auth middleware | high |
| `packages/web/src/trpc/engine-deps.ts` | Lazy engine dependency factory for web context | high |
| `packages/web/src/trpc/routers/interview.ts` | 10 interview procedures (start, answer, approve, holdout) | medium |
| `packages/web/src/trpc/routers/execution.ts` | DAG queries, decomposition + execution triggers | medium |
| `packages/web/src/trpc/routers/evolution.ts` | Seed lineage, evolution history, convergence | medium |
| `packages/web/src/trpc/routers/projects.ts` | Project CRUD | high |
| `packages/web/src/trpc/routers/costs.ts` | Cost breakdown queries | high |

### API Routes

| File | Purpose | Stability |
|------|---------|-----------|
| `packages/web/src/app/api/events/[projectId]/route.ts` | SSE streaming (polling-based, 2s interval) | medium |
| `packages/web/src/app/api/webhook/git/route.ts` | GitHub push webhook → pipeline trigger | medium |
| `packages/web/src/app/api/inngest/route.ts` | Inngest webhook handler for web-layer functions | high |
| `packages/web/src/app/api/trpc/[trpc]/route.ts` | tRPC HTTP handler | high |

## Entry Points

### CLI Entry
- **File**: `packages/cli/src/cli.ts`
- **How invoked**: `pnpm -F @get-cauldron/cli cauldron <command>` or `tsx src/cli.ts`
- **Flow**: `parseArgs()` → `bootstrapClient()` (load config, auto-start server, create tRPC client) → command handler
- **Commands**: 15 commands (health, projects, interview, crystallize, seal, decompose, execute, status, logs, costs, evolution, kill, resolve, run, webhook)

### Engine Server Entry
- **File**: `packages/cli/src/engine-server.ts`
- **How invoked**: `pnpm -F @get-cauldron/cli serve:engine` or `tsx src/engine-server.ts`
- **Flow**: `bootstrap()` → `createInngestApp()` → `serve()` on port 3001
- **Serves**: 5 Inngest functions (handleBeadDispatchRequested, handleBeadCompleted, handleMergeRequested, handleEvolutionConverged, handleEvolutionStarted)

### Web Entry
- **File**: `packages/web/src/app/layout.tsx` (Next.js App Router)
- **How invoked**: `pnpm -F @get-cauldron/web dev` (Next.js dev server on port 3000)
- **Serves**: Dashboard UI, tRPC API, SSE streaming, webhooks, Inngest pipeline trigger

### Request Flow: Web UI to Engine

```
Browser → Next.js page → tRPC client (React Query)
  → tRPC HTTP handler (/api/trpc/[trpc]/route.ts)
    → tRPC router procedure
      → ctx.db (Drizzle queries)
      → ctx.getEngineDeps() → LLMGateway (when LLM calls needed)
      → engineInngest.send() (when async work needed)
```

### Request Flow: CLI to Engine

```
CLI command → tRPC client (HTTP)
  → Next.js tRPC handler (same as web UI path)
    → tRPC router → engine functions
```

### Request Flow: GitHub Webhook

```
GitHub push → POST /api/webhook/git/route.ts
  → Verify signature (octokit/webhooks-methods)
  → Match repo to project
  → appendEvent() (audit trail)
  → inngest.send('cauldron/pipeline.trigger')
    → pipelineTriggerFunction (Inngest durable function)
      → Check active pipeline → queue or proceed
      → findReadyBeads() → dispatch bead events
```

## Where to Add New Code

### New Engine Submodule
- Create directory: `packages/engine/src/<module-name>/`
- Add barrel export: `packages/engine/src/<module-name>/index.ts`
- Re-export from: `packages/engine/src/index.ts`
- Tests: `packages/engine/src/<module-name>/__tests__/`

### New tRPC Router
- Create router: `packages/web/src/trpc/routers/<name>.ts`
- Register in the app router (import and merge in the root router)
- Tests: `packages/web/src/trpc/routers/__tests__/<name>.test.ts`

### New CLI Command
- Create handler: `packages/cli/src/commands/<name>.ts`
- Register in: `packages/cli/src/cli.ts` (add to COMMANDS array + import + switch case)

### New UI Page
- Create page: `packages/web/src/app/<path>/page.tsx`
- Client components: `packages/web/src/components/<feature>/`
- Use `'use client'` directive for interactive components

### New UI Component
- shadcn/ui primitives: `packages/web/src/components/ui/`
- Feature-specific: `packages/web/src/components/<feature>/`
- Follow pattern: PascalCase filename, default export

### New Database Table
- Add schema: `packages/shared/src/db/schema/<name>.ts`
- Re-export from: `packages/shared/src/db/schema/index.ts`
- Generate migration: `pnpm db:generate`
- Run migration: `pnpm db:migrate`

### New Inngest Function (Engine)
- Add handler in appropriate submodule's `events.ts`
- Register in: `packages/cli/src/inngest-serve.ts` (add to ENGINE_FUNCTIONS array)

### New Inngest Function (Web)
- Create in: `packages/web/src/inngest/`
- Register in: `packages/web/src/app/api/inngest/route.ts`

## Special Directories

### `.planning/`
- Purpose: GSD workflow artifacts — phase plans, research, codebase analysis
- Generated: Yes (by GSD commands)
- Committed: Yes

### `.cauldron/`
- Purpose: Cauldron's own project state (worktrees, review artifacts)
- Generated: Yes (at runtime)
- Committed: Partially (`.gitignore` controls)

### `packages/shared/src/db/migrations/`
- Purpose: SQL migrations generated by Drizzle Kit
- Generated: Yes (`pnpm db:generate`)
- Committed: Yes (required for deployment)

### `packages/web/test-results/`
- Purpose: Playwright test artifacts (screenshots, traces)
- Generated: Yes (by E2E tests)
- Committed: No

---

*Structure analysis: 2026-03-29*
