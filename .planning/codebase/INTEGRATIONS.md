# External Integrations

**Analysis Date:** 2026-03-29

## AI/LLM Providers

**Anthropic:**
- SDK: `@ai-sdk/anthropic` 3.0.64 via Vercel AI SDK
- Models: `claude-sonnet-4-6`, `claude-opus-4-6`, `claude-opus-4-5`, `claude-haiku-4-5`
- Auth: `ANTHROPIC_API_KEY` env var
- Used for: interview, implementation, decomposition, evaluation, conflict resolution, perspective agents (researcher, architect, breadth-keeper, seed-closer)

**OpenAI:**
- SDK: `@ai-sdk/openai` 3.0.48 via Vercel AI SDK
- Models: `gpt-4.1`, `gpt-4.1-mini`, `gpt-4o`, `gpt-4o-mini`, `gpt-5.4`, `gpt-5-mini`, `gpt-5-nano`
- Auth: `OPENAI_API_KEY` env var
- Used for: fallback on most stages, scoring model, simplifier perspective

**Google:**
- SDK: `@ai-sdk/google` 3.0.53 via Vercel AI SDK
- Models: `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-3.1-pro-preview`
- Auth: `GOOGLE_GENERATIVE_AI_API_KEY` env var
- Used for: holdout generation, evaluation (cross-model diversity requirement)

**Gateway Architecture:**
- Implementation: `packages/engine/src/gateway/gateway.ts` - `LLMGateway` class
- Config: `cauldron.config.ts` (root) maps pipeline stages to ordered model chains
- Failover: `packages/engine/src/gateway/failover.ts` - sequential chain with 1 retry per model, exponential backoff (1s-8s)
- Circuit breaker: `packages/engine/src/gateway/circuit-breaker.ts` - per-provider, 3-failure threshold, 60s cooldown, 120s window
- Diversity enforcement: `packages/engine/src/gateway/diversity.ts` - holdout/evaluation models must differ from implementation model's provider family
- Budget enforcement: `packages/engine/src/gateway/budget.ts` - per-project cost tracking in cents, configurable limit (default 500 cents)
- Pricing: `packages/engine/src/gateway/pricing.ts` - per-model input/output token pricing
- Key validation: `packages/engine/src/gateway/validation.ts` - validates API keys at gateway construction time
- Usage tracking: writes to `llm_usage` table via `packages/shared/src/db/schema/llm-usage.ts`

**Error Classification (failover decisions):**
- `rate_limit` (429): retry + failover
- `server_error` (5xx): retry + failover
- `timeout` (ETIMEDOUT/ECONNABORTED): retry + failover
- `auth_error` (401/403): failover only (no circuit breaker penalty)
- `other`: failover only

## Database

**PostgreSQL 17:**
- Driver: `postgres` 3.4.8 (NOT `pg`/node-postgres)
- ORM: Drizzle ORM 0.45.1
- Connection: `DATABASE_URL` env var (e.g., `postgres://cauldron:cauldron@localhost:5432/cauldron`)
- Client: `packages/shared/src/db/client.ts` - lazy-initialized Proxy to avoid build-time errors in Next.js
- Schema: `packages/shared/src/db/schema/` (8 schema files)
- Migrations: `packages/shared/src/db/migrations/` (13 migration files, Drizzle-managed)

**Schema Tables:**
- `projects` - `packages/shared/src/db/schema/project.ts`
- `interviews` - `packages/shared/src/db/schema/interview.ts`
- `seeds` - `packages/shared/src/db/schema/seed.ts`
- `beads`, `bead_edges` - `packages/shared/src/db/schema/bead.ts`
- `events` - `packages/shared/src/db/schema/event.ts` (event sourcing)
- `holdout` - `packages/shared/src/db/schema/holdout.ts`
- `snapshots` - `packages/shared/src/db/schema/snapshot.ts`
- `llm_usage` - `packages/shared/src/db/schema/llm-usage.ts`

**Key Patterns:**
- Immutable seeds (append-only)
- Event sourcing via `events` table with `appendEvent()` from `packages/shared/src/db/event-store.ts`
- Optimistic concurrency with version columns
- JSONB for flexible metadata and settings
- Row-level locking for atomic bead claims
- DAG stored as adjacency rows in `bead_edges` (not JSONB blob)
- Lazy DB initialization via Proxy to prevent build-time failures

**Migration Strategy:**
- Generate: `pnpm db:generate` (drizzle-kit generate)
- Apply: `pnpm db:migrate` (runs `packages/shared/src/db/migrate.ts` via tsx)
- Programmatic: `ensureMigrations()` function in `packages/shared/src/db/client.ts` for runtime migration
- Migration table: `__drizzle_migrations` in `public` schema

**Docker Instances:**
- Dev: port 5432 (`cauldron` database)
- Test: port 5433 (`cauldron_test` database)
- E2E: port 5434 (`cauldron_e2e` database)

## Redis

**Redis 7 (Alpine):**
- Client: `ioredis` 5.10.1
- Connection: `REDIS_URL` env var (default `redis://localhost:6379`)
- Purpose: Inngest event broker
- Docker: port 6379

## Job Queue / Background Processing

**Inngest 4.1.0:**
- Dev server: Docker container on port 8288 (UI) and 8289
- Endpoints registered at:
  - `http://localhost:3001/api/inngest` (Hono engine server via CLI)
  - `http://localhost:3000/api/inngest` (Next.js web app)
- Web client: `packages/web/src/inngest/client.ts` - `Inngest({ id: 'cauldron-web' })`
- Engine server: `packages/cli/src/engine-server.ts` (Hono on :3001)

**Durable Execution Patterns:**
- `step.run()` - retryable atomic steps
- `step.waitForEvent()` - fan-in synchronization (e.g., wait for pipeline completion, 2h timeout)
- `step.sendEvent()` - dispatch sub-events (e.g., bead dispatch)

**Pipeline Events:**
- `cauldron/pipeline.trigger` - dispatched by GitHub webhook or manual trigger
- `cauldron/pipeline.completed` - waited on for queued trigger resolution
- `bead.dispatch_requested` - dispatched per-bead for parallel execution

**Pipeline Trigger Logic:** `packages/web/src/inngest/pipeline-trigger.ts`
- Checks for active pipeline before triggering
- Queues behind active pipeline with 2h timeout
- Superseded commit detection (skips if newer push exists)

## GitHub Integration

**Webhook Endpoint:**
- Route: `packages/web/src/app/api/webhook/git/route.ts`
- Event: `push` events only (ping and others accepted gracefully)
- Auth: HMAC signature verification via `@octokit/webhooks-methods` 6.0.0
- Secret: `GITHUB_WEBHOOK_SECRET` env var
- Flow: verify signature -> find matching project by `repoUrl` in settings -> append audit event -> dispatch Inngest `cauldron/pipeline.trigger`

**Git Operations:**
- Library: `simple-git` 3.33.0
- Worktree management: `packages/engine/src/execution/worktree-manager.ts`
- Operations: create/remove worktrees, commit changes, merge to main
- Worktree path: `{projectRoot}/.cauldron/worktrees/{beadId}`
- Branch naming: `cauldron/bead-{shortId}` (first 8 chars of beadId)

## Encryption

**Holdout Test Encryption:**
- Algorithm: AES-256-GCM via `node:crypto` (no external crypto dependencies)
- Pattern: DEK/KEK envelope encryption
- Key: `HOLDOUT_ENCRYPTION_KEY` env var (base64-encoded 256-bit key)
- Implementation: `packages/engine/src/holdout/crypto.ts`
- DEK storage: compound format `dekIv:dekAuthTag:dekCiphertext` (base64, colon-separated)
- Each seal generates fresh DEK + IV for ciphertext uniqueness

## API Surface

**tRPC (Internal Dashboard):**
- Server: `@trpc/server` 11.15.1
- Client: `@trpc/client` 11.15.1 + `@trpc/tanstack-react-query` 11.15.1
- Route: `packages/web/src/app/api/trpc/[trpc]/`
- Routers in `packages/web/src/trpc/routers/`:
  - `projects.ts` - project CRUD
  - `interview.ts` - interview session management
  - `execution.ts` - bead execution control
  - `evolution.ts` - evolutionary loop management
  - `costs.ts` - LLM usage and cost tracking

**SSE Streaming:**
- Endpoint: `GET /api/events/[projectId]` at `packages/web/src/app/api/events/[projectId]/route.ts`
- Auth: Bearer token or `?token=` query param (checked against `CAULDRON_API_KEY`)
- Features: replay from `Last-Event-ID` or `?lastEventId=`, 2s polling interval, 30s keepalive
- Event format: `event: pipeline`, `id: {sequenceNumber}`, `data: {JSON payload}`
- Implementation: polling-based (not LISTEN/NOTIFY) - pragmatic for v1

**Inngest Webhook:**
- Endpoint: `POST /api/inngest` at `packages/web/src/app/api/inngest/route.ts`
- Purpose: receives Inngest step execution callbacks

**GitHub Webhook:**
- Endpoint: `POST /api/webhook/git` at `packages/web/src/app/api/webhook/git/route.ts`
- Auth: HMAC-SHA256 signature verification (`x-hub-signature-256` header)

**Hono Engine Server:**
- Entry: `packages/cli/src/engine-server.ts`
- Port: 3001
- Purpose: Inngest handler for engine operations, separate from Next.js for independent scaling

## Authentication / Authorization

**API Key Auth (v1):**
- Key: `CAULDRON_API_KEY` env var
- Behavior: if unset, dev mode (allow all requests)
- Web frontend: `NEXT_PUBLIC_CAULDRON_API_KEY` for client-side SSE connections
- SSE: Bearer token in Authorization header or `?token=` query parameter
- tRPC: handled at middleware level

## Monitoring & Observability

**Logging:**
- Framework: Pino 10.3.1 (structured JSON)
- Used in: engine gateway, execution pipeline

**Cost Tracking:**
- Table: `llm_usage` in PostgreSQL
- Tracks: model, stage, prompt/completion tokens, cost in cents, per-project
- Events: `gateway_call_completed` and `gateway_failover` written to event store

**Error Tracking:**
- No external error tracking service detected (Sentry, etc.)

**Metrics:**
- No external metrics service detected (Datadog, etc.)

## Environment Configuration

**Required env vars:**
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string

**Required for AI operations:**
- At least one of: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`
- Gateway validates keys at construction and removes invalid providers from routing

**Required for holdout encryption:**
- `HOLDOUT_ENCRYPTION_KEY` - base64-encoded 256-bit AES key

**Optional:**
- `CAULDRON_API_KEY` - API auth (unset = dev mode)
- `GITHUB_WEBHOOK_SECRET` - GitHub webhook HMAC verification
- `INNGEST_DEV=1` - Inngest dev mode
- `LOG_LEVEL` - Pino log level
- `CAULDRON_PROJECT_ROOT` - project root override

**Secrets location:**
- `.env` file at project root (gitignored)
- `.env.example` documents all required/optional vars

---

*Integration audit: 2026-03-29*
