# Stack Research

**Domain:** AI-powered software development platform (autonomous agent pipeline, DAG orchestration, web dashboard)
**Researched:** 2026-03-25
**Confidence:** HIGH (all versions verified against npm registry; key choices verified against multiple current sources)

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js | 16.2.1 | Web dashboard, API routes, SSE streaming | Vercel's own framework, tightest Vercel AI SDK integration, App Router + React Server Components handle DAG visualization and streaming natively; Next.js 16 added AI agent tooling (AGENTS.md, next-browser); no competing framework has equivalent AI-first trajectory |
| TypeScript | 6.0.2 | End-to-end type safety | Project constraint; TS 6 shipped strict improvements; required by tRPC, Drizzle, AI SDK, and every other library below |
| Hono | 4.12.9 | Standalone API server for agent workers | Fastest Node.js framework (3x Express throughput, 30% less memory than Fastify); edge-compatible; first-class TypeScript; use for the backend service that agents call into, separate from Next.js |
| Vercel AI SDK (`ai`) | 6.0.138 | Multi-provider LLM interface, streaming | Project constraint; `streamText`, `streamObject`, multi-provider unification (OpenAI, Anthropic, Google via `@ai-sdk/*` packages); Server-Sent Events integration is native; no alternative matches its TypeScript-first design |
| Drizzle ORM | 0.45.1 | Database access layer | 90% smaller bundle than Prisma, SQL-like TypeScript API, zero Rust/binary dependencies, instant type feedback without codegen step; Prisma 7 finally went pure TypeScript but Drizzle is already the community momentum pick for AI-tooled TypeScript stacks |
| PostgreSQL (via `postgres` driver) | 3.4.8 | Primary persistence: seeds, beads DAG, project state | JSONB for flexible DAG edge metadata, row-level locking for atomic bead claims, transactions for seed crystallization; SQLite cannot handle concurrent agent workers safely |
| Inngest | 4.1.0 | Durable job orchestration for parallel agent execution | Purpose-built for AI agent workflows; `step.run()` provides durable execution with automatic retry and state persistence; `step.waitForEvent()` handles fan-in synchronization gates natively; managed cloud + self-hostable; simpler than Temporal for TypeScript; stronger durability story than BullMQ |
| tRPC | 11.15.0 | Internal type-safe API between Next.js frontend and backend | End-to-end TypeScript inference without codegen; tRPC v11 + Next.js App Router integration is first-class; pairs with TanStack Query for caching; eliminates schema drift between client and server; only use for dashboard↔backend; not for agent↔orchestrator (use Hono there) |
| Vitest | 4.1.1 | Unit and integration test runner | Native ESM + TypeScript; no Babel/ts-jest configuration tax; 10-20x faster than Jest in watch mode; Vitest Workspaces built for monorepos; drop-in Jest-compatible API means no new mental model |
| Playwright | 1.58.2 | E2E test runner | Industry standard for TypeScript E2E in 2025/2026; first-class trace viewer for CI debugging; Page Object Model with TypeScript generics; parallel sharding for CI speed; replaces Cypress for all new TypeScript projects |
| Turborepo | 0.0.1 (use latest stable) | Monorepo task runner and cache | Simpler config than Nx (20 lines vs hours of setup); 3x faster than Nx on smaller repos; project has ~5 packages (apps/web, apps/api, packages/core, packages/db, packages/ai), which is Turborepo's sweet spot; acquired by Vercel so Next.js integration is seamless |

> **Note on Turborepo version:** npm registry shows `0.0.1` as a stale/legacy entry. Install via `npx create-turbo@latest` or `pnpm add -D turbo` — current actual release is 2.x.

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@ai-sdk/openai` | 3.0.48 | OpenAI provider for Vercel AI SDK | Interview stage, general implementation agents |
| `@ai-sdk/anthropic` | 3.0.64 | Anthropic provider for Vercel AI SDK | Holdout test generation (cross-model diversity) |
| `@ai-sdk/google` | 3.0.53 | Google provider for Vercel AI SDK | Alternative holdout generator; Gemini 2.0 as evolutionary loop evaluator |
| `@xyflow/react` | 12.10.1 | DAG visualization in the dashboard | Bead execution graph; has dagre layout example and AI Workflow Editor pro template; first-class TypeScript; the standard for node-based UIs in React |
| `@dagrejs/dagre` | 3.0.0 | Auto-layout algorithm for DAG nodes | Hierarchical auto-positioning of bead nodes in React Flow; use this org's package (not the unmaintained `dagre` 0.8.x) |
| `tailwindcss` | 4.2.2 | Utility-first CSS | Tailwind v4 works with Next.js 16 without `tailwind.config.ts`; dark mode via `@theme` directive; pairs with shadcn/ui for HZD visual identity |
| `shadcn/ui` | (CLI tool, not a package) | Component primitives for dashboard | Accessible, customizable, copy-paste components; supports Tailwind v4 + React 19 + dark mode; basis for chat interface, bead status cards, diff viewers |
| `zod` | 4.3.6 | Runtime schema validation | Seed YAML validation, bead claim payloads, API input validation; native tRPC + Drizzle integration |
| `pino` | 10.3.1 | Structured logging | Fast JSON logging for agent workers; low overhead vs Winston; async transport prevents logging from blocking hot path |
| `ioredis` | 5.10.1 | Redis client for Inngest broker + ephemeral state | Inngest requires Redis for local dev; also use for distributed locks on bead atomic claims if not relying solely on Postgres row locking |
| `node:crypto` (built-in) | Node.js built-in | Holdout test encryption at rest | AES-256-GCM authenticated encryption; no external dependency needed; GCM mode provides both encryption and authentication tag (prevents tampering); key management via env vars inaccessible to agent processes |
| `tsx` | 4.21.0 | TypeScript execution for scripts/CLI | Runs `.ts` files directly without compilation step; use for CLI entrypoint and dev scripts; faster than `ts-node` |
| `@trpc/server` + `@trpc/client` | 11.15.0 | tRPC server/client packages | Install alongside `trpc` core; needed for App Router server-side callers and React Query integration |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Turborepo | Parallel task execution, build caching | `turbo.json` with `build`, `test`, `typecheck` pipeline; remote cache via Vercel for CI |
| `pnpm` | Package manager | Workspace-aware, faster installs than npm, efficient disk usage for monorepos; use `pnpm-workspace.yaml` |
| `vitest --workspace` | Cross-package test runner | Single `vitest.workspace.ts` at root references each package config |
| `playwright` with `@playwright/test` | E2E test runner | Separate `e2e/` app; point at `localhost:3000` in CI with Docker Compose for full-stack testing |
| `eslint` + `@typescript-eslint/parser` | Linting | TypeScript-aware rules; configure once in root, extend per package |
| Drizzle Kit | Database migrations | `drizzle-kit generate` + `drizzle-kit migrate`; schema-first migrations, no ORM abstraction leak |

---

## Installation

```bash
# Monorepo scaffold
pnpm dlx create-turbo@latest cauldron --package-manager pnpm

# Core app dependencies (apps/web)
pnpm add next react react-dom @trpc/server @trpc/client @trpc/next \
  @tanstack/react-query zod @xyflow/react @dagrejs/dagre \
  tailwindcss @shadcn/ui

# Core API dependencies (apps/api)
pnpm add hono inngest drizzle-orm postgres ioredis pino zod

# AI SDK (packages/ai or apps/api)
pnpm add ai @ai-sdk/openai @ai-sdk/anthropic @ai-sdk/google

# Database package (packages/db)
pnpm add drizzle-orm postgres zod
pnpm add -D drizzle-kit

# Dev dependencies (root)
pnpm add -D typescript tsx vitest @playwright/test \
  eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin \
  turbo
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Next.js 16 | Remix / SvelteKit | Remix if full-stack data loading patterns matter more than AI streaming primitives; SvelteKit if bundle size is critical and team is not React-native |
| Drizzle ORM | Prisma 7 | Prisma if team is new to SQL and wants more guardrails; Prisma 7 is now pure TypeScript so the binary overhead argument is gone, but Drizzle still wins on bundle size and query transparency |
| Inngest | Temporal | Temporal if requirements demand enterprise-grade guarantees, multi-language workers, or >10K concurrent workflows; complexity cost is real — Temporal requires separate worker clusters and the TypeScript SDK is less ergonomic |
| Inngest | Trigger.dev v3 | Trigger.dev if self-hosting is a hard requirement from day one (Apache 2.0, no managed dependency); Inngest's managed tier is easier to start with and has better fan-out/fan-in step primitives |
| Inngest | BullMQ | BullMQ if workloads are simple fire-and-forget jobs without durability requirements; for agent workflows that run minutes and need step-level retry, BullMQ requires building durability yourself |
| tRPC | REST (Next.js Route Handlers) | Use Route Handlers directly for: public API endpoints, webhook receivers, SSE streaming routes — tRPC is for the internal dashboard↔backend boundary only |
| Vitest | Jest | Jest if adding tests to an existing Next.js project already using Jest; for greenfield TypeScript monorepo Vitest is unambiguously better |
| Playwright | Cypress | Cypress if team has deep existing investment; Playwright is the industry direction for new TypeScript projects in 2025/2026 |
| Turborepo | Nx | Nx if the monorepo grows beyond ~15 packages or needs polyglot support; Nx's project graph is more accurate for large repos but requires hours of upfront configuration |
| PostgreSQL | SQLite | SQLite for single-process local-only tools; not suitable for Cauldron's multi-agent concurrent writes and row-level locking requirements |
| `node:crypto` | `tweetnacl`, `libsodium-wrappers` | Either NaCl library if the encryption model grows to include asymmetric key exchange (e.g., agent-specific keys per holdout set); for symmetric encryption at rest, `node:crypto` AES-256-GCM is sufficient and has no external dependency surface |
| `@xyflow/react` | D3.js custom DAG | D3 if full custom rendering is required; React Flow provides 80%+ of DAG visualization needs with far less code |
| Hono (standalone API) | NestJS | NestJS if team wants a strongly opinionated backend framework with decorators, DI container, and module system; Cauldron's agent-worker API surface is small enough that NestJS adds ceremony without payoff |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Express | 2x slower than Fastify, 3x slower than Hono; no first-class TypeScript; has not had a major release since 4.x (2014 era); Express 5 released 2024 but still fundamentally the same architecture | Hono for standalone API; Next.js Route Handlers for dashboard API |
| Prisma (pre-v7 Rust engine) | The binary dependency was a serious problem for edge/serverless deploys; if using older Prisma, migrate to Drizzle or Prisma 7 | Drizzle ORM |
| GraphQL | 2x the latency of REST for simple queries; no benefit over tRPC for an internal TypeScript monorepo with a single frontend; adds schema maintenance overhead | tRPC for internal APIs; REST Route Handlers for external/webhook endpoints |
| BullMQ alone for agent orchestration | No built-in state persistence across restarts; no step-level retry; must build durability primitives yourself for multi-step agent workflows | Inngest (wraps BullMQ-like queuing with durable execution on top) |
| WebSockets for agent output streaming | SSE is sufficient for server→client streaming (LLM tokens, bead status updates); WebSockets add bidirectional complexity with no benefit for this pattern | SSE via Next.js Route Handlers or Hono |
| Jest | Config overhead for TypeScript (Babel or ts-jest); 10-20x slower than Vitest in watch mode; no native ESM support | Vitest |
| Cypress | Slower than Playwright; inferior TypeScript support; team attention has drifted to component testing | Playwright |
| `react-flow-renderer` | Unmaintained legacy package (last release 10.3.17 in 2022); superseded by `@xyflow/react` | `@xyflow/react` 12.x |
| `dagre` (unmaintained 0.8.x) | Last commit 2017; use the maintained fork | `@dagrejs/dagre` 3.0.0 |
| Third-party encryption packages (aes256, crypto-ts) | Thin wrappers over `node:crypto` that add dependency surface without adding capability; some have CVEs in older versions | `node:crypto` built-in with AES-256-GCM |

---

## Stack Patterns by Variant

**For the agent worker API (bead execution, claims, results):**
- Use Hono (not Next.js Route Handlers)
- Because agents run as separate processes; keeping the worker API surface out of the Next.js bundle prevents cold start interference and allows independent scaling

**For the Socratic interview / chat interface:**
- Use Vercel AI SDK `streamText` + SSE via Next.js Route Handler
- Because the AI SDK's `useChat` hook handles SSE streaming, tool calls, and message history natively; no custom streaming infrastructure needed

**For holdout test encryption:**
- Use `node:crypto` AES-256-GCM with a dedicated `HOLDOUT_ENCRYPTION_KEY` env var
- Store ciphertext + IV + auth tag together in the database
- Never pass the key to agent processes; use a separate Node.js process or Inngest step that runs with restricted env to unseal after convergence

**For bead DAG storage:**
- Store the DAG as adjacency rows in PostgreSQL (not JSONB blob)
- This allows: `SELECT * FROM beads WHERE status = 'ready' AND NOT EXISTS (SELECT 1 FROM bead_edges WHERE target = bead_id AND source IN (SELECT id FROM beads WHERE status != 'completed'))` for ready-bead queries without deserializing the whole graph

**For real-time bead status updates to the dashboard:**
- Use SSE from a Next.js Route Handler that subscribes to a PostgreSQL `LISTEN`/`NOTIFY` channel
- Inngest publishes bead status change events → trigger a Postgres NOTIFY → dashboard SSE pushes to React Flow nodes
- This avoids a separate WebSocket server

**For the testing cube:**
- Unit tests: Vitest in each package (`packages/core/src/*.test.ts`)
- Integration tests: Vitest with real PostgreSQL via Docker Compose (`test:integration` Turborepo task)
- E2E tests: Playwright against a fully running stack (`apps/e2e/`)
- Do not mock the database in integration tests — use real Postgres with test transactions rolled back per test

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `next@16.2.1` | `react@19`, `tailwindcss@4.x` | Next.js 16 requires React 19; Tailwind v4 drops `tailwind.config.ts` in favor of CSS `@theme` |
| `ai@6.0.138` | `next@16.x`, `@ai-sdk/openai@3.x`, `@ai-sdk/anthropic@3.x` | AI SDK 6 is the current major; provider packages are independently versioned; always install matching major provider packages |
| `drizzle-orm@0.45.x` | `postgres@3.x`, `drizzle-kit@0.28.x` | Use `drizzle-kit` for migrations; incompatible with `pg` driver (use `postgres` package instead) |
| `@trpc/server@11.x` | `@tanstack/react-query@5.x`, `next@16.x` | tRPC 11 requires TanStack Query v5; the v10→v11 migration changes `useQuery` call syntax |
| `inngest@4.x` | Node.js 18+, TypeScript 5.x+ | Inngest v4 TypeScript SDK; supports Zod 4 via Standard Schema interface for event payload typing |
| `@xyflow/react@12.x` | `react@19`, `@dagrejs/dagre@3.x` | `@xyflow/react` is the React 18/19 compatible package; old `react-flow-renderer` is not compatible |
| `vitest@4.x` | TypeScript 6.x, Vite 6.x | Vitest 4 requires Vite 6 as peer dependency; works natively with ESM and TypeScript |

---

## Sources

- npm registry (verified 2026-03-25): versions for all packages confirmed via `npm info`
- [Next.js AI Agents Guide](https://nextjs.org/docs/app/guides/ai-agents) — Next.js 16 AI capabilities confirmed
- [Next.js 16.2 Release](https://nextjs.org/blog/next-16-2-ai) — AI improvements confirmed
- [Vercel AI SDK Docs](https://ai-sdk.dev/docs/introduction) — streamText, multi-provider patterns (MEDIUM confidence: fetched from official docs)
- [AI SDK 4.2 Release Notes](https://vercel.com/blog/ai-sdk-4-2) — Version history context (MEDIUM confidence)
- [Inngest Durable Execution Blog](https://www.inngest.com/blog/durable-execution-key-to-harnessing-ai-agents) — AI agent workflow patterns (MEDIUM confidence)
- [Inngest TypeScript SDK v4 Docs](https://www.inngest.com/docs/reference/typescript/intro) — v4 confirmed current (MEDIUM confidence)
- [Trigger.dev v3 Architecture](https://trigger.dev/blog/v2-end-of-life-announcement) — Long-running compute model comparison (MEDIUM confidence)
- [Drizzle vs Prisma 2026 Deep Dive](https://makerkit.dev/blog/tutorials/drizzle-vs-prisma) — ORM comparison with current versions (MEDIUM confidence)
- [Vitest vs Jest 2025](https://bitworld.bigshelter.com/vitest-vs-jest-2025-the-ultimate-no-hype-testing-guide/) — Performance benchmarks (LOW confidence: single source)
- [React Flow DAG Layout](https://reactflow.dev/examples/layout/dagre) — dagre integration confirmed (HIGH confidence: official docs)
- [SSE vs WebSockets 2025](https://hackernoon.com/streaming-in-nextjs-15-websockets-vs-server-sent-events) — Streaming recommendation (MEDIUM confidence)
- [tRPC 11 Next.js App Router Setup](https://dev.to/matowang/trpc-11-setup-for-nextjs-app-router-2025-33fo) — Integration pattern (MEDIUM confidence)
- Node.js built-in crypto docs (AES-256-GCM) — Encryption approach (HIGH confidence: official)

---

*Stack research for: Cauldron — AI-powered software development platform*
*Researched: 2026-03-25*
