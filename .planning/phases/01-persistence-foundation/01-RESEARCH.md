# Phase 1: Persistence Foundation - Research

**Researched:** 2026-03-25
**Domain:** Turborepo + pnpm monorepo, Drizzle ORM + PostgreSQL, Redis, Inngest dev server, Docker Compose, event sourcing, Vitest integration testing
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Schema Design**
- D-01: Seed YAML content stored as structured columns — decompose seed fields (goal, constraints, acceptance_criteria, ontology_schema, evaluation_principles, exit_conditions) into typed PostgreSQL columns. Queryable, validates at DB level.
- D-02: Bead DAG edges modeled as a separate BeadEdge table with (from_bead_id, to_bead_id, edge_type). Edge type is an enum: blocks, parent_child, conditional_blocks, waits_for.
- D-03: Evolution lineage tracked via parent_id FK on the seed table. Recursive CTE traversal when ancestry queries are needed. No closure table — lineages are short (< 30 generations).
- D-04: Encrypted holdout tests stored as DB blob in a holdout_vault table alongside metadata (seed_id, status, encrypted_at, unsealed_at).

**Event Sourcing**
- D-05: Hybrid event sourcing — events are append-only log, materialized views / denormalized read tables for fast queries. Audit trail + query performance.
- D-06: Events scoped to pipeline milestones (~15-20 event types): interview started/completed, seed crystallized, holdouts sealed/unsealed, bead claimed/completed/failed, evolution started/converged, merge completed.
- D-07: Snapshotting built from day one — periodic snapshots for each project aggregate even though v1 event volumes will be low.

**Monorepo Layout**
- D-08: 4-package Turborepo + pnpm monorepo: packages/web (Next.js dashboard), packages/api (tRPC server), packages/engine (Inngest workers + pipeline logic), packages/shared (types, schemas, utils).
- D-09: Drizzle table definitions in `packages/shared` are the single source of truth for TypeScript types. tRPC routers in `api` consume these. `web` consumes tRPC client types.
- D-10: Inngest worker functions defined in `packages/engine/src/inngest/`. Engine runs as its own process, separate from the API.

**Dev Environment**
- D-11: Fully containerized Docker Compose — PostgreSQL, Redis, Inngest dev server, AND all app services.
- D-12: TypeScript seed scripts for dev/test data (`pnpm db:seed`). Insert example projects, seeds, beads. Deterministic, version-controlled.

**Specifics**
- Inngest 4 is the confirmed scheduler (not BullMQ directly)
- AES-256-GCM for holdout encryption (node:crypto, no external library)
- Event types should be an enum that's extensible via migration

### Claude's Discretion
- Table naming conventions, column naming (snake_case vs camelCase)
- Drizzle migration naming and organization strategy
- Docker Compose service naming and networking
- Vitest configuration and test file organization
- ESLint / Prettier / TypeScript config details

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFR-01 | Monorepo scaffolded with Turborepo + pnpm workspaces (packages: web, api, engine, shared) | Turborepo 2.8.20 + pnpm 10.x; 4-package layout via pnpm-workspace.yaml |
| INFR-02 | PostgreSQL schema supports seeds, beads, DAG edges, agent sessions, and evolution lineage | Drizzle ORM 0.45.1 + postgres.js 3.4.8; 7-table schema with pgEnum for edge types and event types |
| INFR-03 | Redis configured for job queue (Inngest/BullMQ) and pub/sub event streaming | ioredis 5.10.1; Redis in Docker Compose; Inngest uses Redis as backing store |
| INFR-04 | Event sourcing model: all state changes are appended as immutable events; state derived by replay | Append-only Event table with Drizzle; snapshot table for performance; no UPDATE on event rows |
| INFR-05 | Database migrations managed via Drizzle Kit with version-controlled schema | drizzle-kit 0.31.10; `drizzle-kit generate` + `drizzle-kit migrate`; migrations committed to git |
| INFR-06 | Docker Compose configuration for local development (PostgreSQL + Redis + Inngest dev server) | inngest/inngest Docker image; PostgreSQL 17, Redis 7; health checks; service networking |
</phase_requirements>

---

## Summary

Phase 1 establishes the data layer that every subsequent phase writes against. The stack is fully determined by prior research: Turborepo 2.x + pnpm workspaces for the monorepo, Drizzle ORM 0.45.1 + postgres.js 3.4.8 for the database layer, drizzle-kit 0.31.10 for migrations, ioredis 5.10.1 for Redis, and the `inngest/inngest` Docker image for the local Inngest dev server. All decisions are locked in CONTEXT.md — this research focuses on the exact mechanics of each.

The critical correctness requirement for this phase is schema design that enforces the three core invariants: event immutability (no UPDATE on event rows, ever), seed immutability (no UPDATE on seed rows after status = 'crystallized'), and DAG integrity (edges in a separate table enabling cycle detection queries). These are database-level constraints backed by Drizzle schema definitions, not application-level conventions.

**Primary recommendation:** Put all Drizzle schema files in `packages/shared/src/db/schema/` as the canonical TypeScript type source. Import `drizzle-orm/postgres-js` from that package in both `api` and `engine` packages — never define schemas elsewhere.

---

## Standard Stack

### Core (Phase 1 scope)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| turbo | 2.8.20 | Monorepo task orchestration, build caching | Verified current via npm registry 2026-03-25 |
| pnpm | 10.32.1 | Package manager with workspace support | Already installed on dev machine |
| drizzle-orm | 0.45.1 | Database access layer, schema-as-code | Verified current; zero binary deps; SQL-transparent |
| drizzle-kit | 0.31.10 | Migration generator + applier | Verified current; paired with drizzle-orm 0.45.x |
| postgres | 3.4.8 | postgres.js driver for Drizzle | Verified current; chosen over `pg` per STACK.md |
| ioredis | 5.10.1 | Redis client | Verified current; Inngest uses Redis backing store |
| inngest | 4.1.0 | Durable job orchestration | Confirmed in STACK.md; supports Zod 4 |
| zod | 4.3.6 | Runtime schema validation | Verified current; native Drizzle + tRPC integration |
| vitest | 4.1.1 | Test runner | Verified current; Vitest 4 requires Vite 6 as peer |
| vite | 8.0.2 | Peer dependency for Vitest 4 | Verified current via npm registry |
| typescript | 6.0.2 | End-to-end type safety | Per STACK.md; TS 6 strict improvements |
| tsx | 4.21.0 | Run .ts scripts without compile step | For seed scripts, db:seed, migration runner |

### Docker Services (Dev Environment)

| Image | Version | Port | Purpose |
|-------|---------|------|---------|
| postgres | 17-alpine | 5432 | Primary database |
| redis | 7-alpine | 6379 | Inngest backing store + pub/sub |
| inngest/inngest | latest (v1.17.2+) | 8288, 8289 | Inngest dev server UI + connect() |

### Installation

```bash
# From monorepo root — install all workspaces
pnpm install

# packages/shared (schema source of truth)
pnpm --filter @cauldron/shared add drizzle-orm postgres zod
pnpm --filter @cauldron/shared add -D drizzle-kit typescript

# packages/engine
pnpm --filter @cauldron/engine add inngest ioredis

# packages/api
pnpm --filter @cauldron/api add drizzle-orm postgres ioredis zod

# Dev root
pnpm add -D turbo vitest vite tsx typescript eslint @typescript-eslint/parser
```

**Version verification:** All versions above confirmed against npm registry on 2026-03-25.

---

## Architecture Patterns

### Recommended Project Structure

```
cauldron/
├── packages/
│   ├── shared/                     # D-09: Drizzle schema = TypeScript type source of truth
│   │   ├── src/
│   │   │   ├── db/
│   │   │   │   ├── schema/
│   │   │   │   │   ├── index.ts         # Re-exports all tables + enums
│   │   │   │   │   ├── project.ts       # Project table
│   │   │   │   │   ├── seed.ts          # Seed table (immutable after crystallization)
│   │   │   │   │   ├── bead.ts          # Bead table + BeadEdge table
│   │   │   │   │   ├── event.ts         # Event log (append-only)
│   │   │   │   │   ├── holdout.ts       # HoldoutVault table
│   │   │   │   │   └── evolution.ts     # EvolutionLineage (derived from seed.parent_id)
│   │   │   │   ├── client.ts            # db = drizzle({ client: postgres(DATABASE_URL) })
│   │   │   │   └── migrations/          # drizzle-kit output
│   │   │   ├── types/                   # TypeScript type exports derived from Drizzle inference
│   │   │   └── index.ts                 # Package entry point
│   │   ├── drizzle.config.ts            # drizzle-kit configuration
│   │   └── package.json
│   ├── api/                        # tRPC server — imports from @cauldron/shared
│   ├── engine/                     # Inngest workers — imports from @cauldron/shared
│   │   └── src/
│   │       └── inngest/            # D-10: Inngest functions live here
│   └── web/                        # Next.js dashboard
├── docker-compose.yml              # PostgreSQL + Redis + Inngest dev server
├── turbo.json                      # Turborepo task pipeline
├── pnpm-workspace.yaml             # Workspace definition
└── package.json                    # Root package.json
```

### Pattern 1: Turborepo 2.x turbo.json

**What:** Turborepo 2.x uses a `tasks` key (not `pipeline` from 1.x). Tasks declare dependencies with `^` (run in dependency packages first), outputs for caching, and `persistent: true` for long-running dev servers.

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "inputs": ["src/**/*.ts", "src/**/*.tsx", "tsconfig.json"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "test:integration": {
      "dependsOn": ["^build"],
      "cache": false
    },
    "dev": {
      "persistent": true,
      "cache": false
    },
    "db:generate": {
      "cache": false
    },
    "db:migrate": {
      "cache": false
    },
    "db:seed": {
      "dependsOn": ["db:migrate"],
      "cache": false
    }
  }
}
```

**Critical difference from 1.x:** Use `"tasks"` not `"pipeline"`. Both are supported in 2.x for backwards compat, but `"tasks"` is the canonical key going forward.

### Pattern 2: pnpm-workspace.yaml

```yaml
packages:
  - 'packages/*'
```

### Pattern 3: Drizzle Schema Definition

**What:** All tables defined in `packages/shared` using `pgTable` and `pgEnum`. Enums declared once, referenced by FK columns. Drizzle infers TypeScript types automatically — no codegen step needed.

```typescript
// packages/shared/src/db/schema/bead.ts
// Source: https://orm.drizzle.team/docs/sql-schema-declaration
import { pgTable, pgEnum, uuid, text, timestamp, integer } from 'drizzle-orm/pg-core';
import { seeds } from './seed';

export const beadEdgeTypeEnum = pgEnum('bead_edge_type', [
  'blocks',
  'parent_child',
  'conditional_blocks',
  'waits_for',
]);

export const beadStatusEnum = pgEnum('bead_status', [
  'pending',
  'claimed',
  'active',
  'completed',
  'failed',
]);

export const beads = pgTable('beads', {
  id: uuid('id').primaryKey().defaultRandom(),
  seedId: uuid('seed_id').notNull().references(() => seeds.id),
  title: text('title').notNull(),
  spec: text('spec').notNull(),
  status: beadStatusEnum('status').notNull().default('pending'),
  agentAssignment: text('agent_assignment'),
  claimedAt: timestamp('claimed_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const beadEdges = pgTable('bead_edges', {
  id: uuid('id').primaryKey().defaultRandom(),
  fromBeadId: uuid('from_bead_id').notNull().references(() => beads.id),
  toBeadId: uuid('to_bead_id').notNull().references(() => beads.id),
  edgeType: beadEdgeTypeEnum('edge_type').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// TypeScript types inferred automatically
export type Bead = typeof beads.$inferSelect;
export type NewBead = typeof beads.$inferInsert;
export type BeadEdge = typeof beadEdges.$inferSelect;
```

```typescript
// packages/shared/src/db/schema/event.ts — APPEND-ONLY, never UPDATE
import { pgTable, pgEnum, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const eventTypeEnum = pgEnum('event_type', [
  'interview_started',
  'interview_completed',
  'seed_crystallized',
  'holdouts_sealed',
  'holdouts_unsealed',
  'bead_claimed',
  'bead_completed',
  'bead_failed',
  'evolution_started',
  'evolution_converged',
  'merge_completed',
]);

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull(),
  seedId: uuid('seed_id'),
  beadId: uuid('bead_id'),
  type: eventTypeEnum('type').notNull(),
  payload: jsonb('payload').notNull().default({}),
  occurredAt: timestamp('occurred_at').notNull().defaultNow(),
  // NO updatedAt — this table is append-only, never UPDATE
});
```

```typescript
// packages/shared/src/db/schema/holdout.ts
import { pgTable, pgEnum, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { seeds } from './seed';

export const holdoutStatusEnum = pgEnum('holdout_status', [
  'sealed',
  'unsealed',
  'evaluated',
]);

export const holdoutVault = pgTable('holdout_vault', {
  id: uuid('id').primaryKey().defaultRandom(),
  seedId: uuid('seed_id').notNull().references(() => seeds.id),
  ciphertext: text('ciphertext').notNull(),       // base64-encoded AES-256-GCM ciphertext
  encryptedDek: text('encrypted_dek').notNull(),  // base64-encoded DEK encrypted with master key
  iv: text('iv').notNull(),                        // base64-encoded initialization vector
  authTag: text('auth_tag').notNull(),             // GCM authentication tag
  status: holdoutStatusEnum('status').notNull().default('sealed'),
  encryptedAt: timestamp('encrypted_at').notNull().defaultNow(),
  unsealedAt: timestamp('unsealed_at'),
});
```

### Pattern 4: Drizzle DB Client

```typescript
// packages/shared/src/db/client.ts
// Source: https://orm.drizzle.team/docs/get-started/postgresql-new
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle({ client, schema });

// TypeScript type for transaction context
export type DbClient = typeof db;
```

### Pattern 5: drizzle.config.ts

```typescript
// packages/shared/drizzle.config.ts
// Source: https://orm.drizzle.team/docs/drizzle-config-file
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  migrations: {
    table: '__drizzle_migrations',
    schema: 'public',
  },
  verbose: true,
  strict: true,
});
```

### Pattern 6: Docker Compose

```yaml
# docker-compose.yml
# Source: https://www.inngest.com/docs/dev-server
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: cauldron
      POSTGRES_PASSWORD: cauldron
      POSTGRES_DB: cauldron
    ports:
      - '5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U cauldron']
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 5s
      retries: 5

  inngest:
    image: inngest/inngest:latest
    command: 'inngest dev -u http://engine:3001/api/inngest'
    ports:
      - '8288:8288'   # Dev Server UI
      - '8289:8289'   # connect() port
    depends_on:
      redis:
        condition: service_healthy
    environment:
      - INNGEST_DEV=1

volumes:
  postgres_data:
```

**Key note:** Inngest dev server image is `inngest/inngest` on Docker Hub. The `command` must point at the `engine` service's Inngest handler endpoint. Port 8288 is the dev UI, port 8289 is required for `connect()`.

### Pattern 7: Event Append + Replay

```typescript
// Append — never update
async function appendEvent(db: DbClient, event: NewEvent): Promise<Event> {
  const [row] = await db.insert(schema.events).values(event).returning();
  return row;
}

// Replay to derive state — no direct state queries on hot paths
async function deriveProjectState(db: DbClient, projectId: string) {
  const eventLog = await db
    .select()
    .from(schema.events)
    .where(eq(schema.events.projectId, projectId))
    .orderBy(asc(schema.events.occurredAt));
  // fold over events to produce current state
  return eventLog.reduce(applyEvent, initialProjectState());
}

// Snapshot — store derived state for fast reads
async function upsertSnapshot(db: DbClient, projectId: string, state: ProjectState) {
  await db
    .insert(schema.projectSnapshots)
    .values({ projectId, state, snapshotAt: new Date() })
    .onConflictDoUpdate({
      target: schema.projectSnapshots.projectId,
      set: { state, snapshotAt: new Date() },
    });
}
```

### Pattern 8: Vitest Integration Tests Against Real Docker Postgres

```typescript
// packages/shared/src/db/__tests__/event-sourcing.integration.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../schema';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

// Vitest integration tests run against a real Docker Postgres — no mocks
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://cauldron:cauldron@localhost:5432/cauldron_test';

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
  client = postgres(TEST_DATABASE_URL);
  db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: './src/db/migrations' });
});

afterAll(async () => {
  await client.end();
});

beforeEach(async () => {
  // Truncate all tables in reverse dependency order for test isolation
  await db.execute(sql`TRUNCATE TABLE events, holdout_vault, bead_edges, beads, seeds, projects RESTART IDENTITY CASCADE`);
});

describe('Event log append-only invariant', () => {
  it('appends events without mutating existing rows', async () => {
    // ... real DB test, no mocks
  });
});
```

### Anti-Patterns to Avoid

- **Putting Drizzle schema in `packages/api` or `packages/engine`:** Causes type drift between packages. Schema belongs in `packages/shared` exclusively.
- **Using `pipeline` key in turbo.json:** Turborepo 2.x uses `tasks`. Both work, but `pipeline` is the legacy key — start with `tasks`.
- **Using `pg` (node-postgres) driver with drizzle-orm:** The STACK.md decision is `postgres` (postgres.js). The import paths differ (`drizzle-orm/postgres-js` vs `drizzle-orm/node-postgres`). Pick one and be consistent.
- **Running `drizzle-kit push` in CI:** `push` bypasses migration files and directly modifies the schema. Use `generate` + `migrate` for all version-controlled changes.
- **Updating event rows:** The event log is append-only. Any "correction" creates a new compensating event — never UPDATE or DELETE event rows. Enforce this with a Postgres row-level trigger or application-level convention.
- **Putting the Inngest SDK handler in `packages/web`:** D-10 specifies Inngest functions live in `packages/engine`. The web package should never import `inngest` directly.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQL migration versioning | Custom migration runner | drizzle-kit generate + migrate | Handles ordering, checksums, migration table tracking, non-commutative migration detection |
| Monorepo task orchestration | Custom Makefile / bash scripts | turbo | Task graph parallelism, remote caching, output hashing |
| Database schema types | Manual TypeScript interfaces | Drizzle `$inferSelect` / `$inferInsert` | Zero-drift: schema and types are the same source of truth |
| Postgres connection pooling | Manual pool management | postgres.js built-in pooling | postgres.js pools by default; configurable via `max` option |
| Durable job scheduling | Custom Redis queue | inngest | Step-level retry, durable execution, event fan-in (`step.waitForEvent`) |
| Event type validation | Custom discriminated unions | Drizzle pgEnum | Validates at DB level AND generates TypeScript union type |

**Key insight:** The Drizzle schema is both the database schema and the TypeScript type system. Anything defined in pgTable, pgEnum, etc. is automatically available as a TypeScript type via `$inferSelect`/`$inferInsert`. Never maintain a parallel types file.

---

## Common Pitfalls

### Pitfall 1: drizzle-kit version mismatch with drizzle-orm

**What goes wrong:** drizzle-kit 0.28.x (from STACK.md) is outdated. The current version is 0.31.10. If STACK.md's version is used, migration commands may fail or produce incorrect output.

**Why it happens:** The stack research documented a version that has since advanced. drizzle-kit and drizzle-orm are independently versioned and must be compatible.

**How to avoid:** Use drizzle-kit 0.31.10 (verified current as of 2026-03-25). The `drizzle.config.ts` `dialect` field is required in 0.31.x — earlier versions used `driver`.

**Warning signs:** `drizzle-kit generate` fails with "unknown option 'driver'" or similar. Downgrade to 0.31.x if installed version differs.

### Pitfall 2: Turborepo 1.x `pipeline` key in turbo.json

**What goes wrong:** Many tutorials and docs still show `"pipeline"` key. Turborepo 2.x uses `"tasks"`. Both work for backwards compat, but new projects should use `"tasks"` to avoid confusion.

**Why it happens:** The Turborepo 2.x docs changed the key name. Training data and many blog posts still show the old format.

**How to avoid:** Use `"tasks"` in turbo.json. Verify with `turbo --version` that you're on 2.x before setting up.

### Pitfall 3: Inngest dev server not receiving function registrations

**What goes wrong:** The Inngest dev server starts but shows no functions. The engine service hasn't served its `/api/inngest` endpoint to the dev server.

**Why it happens:** The Docker Compose `command` for Inngest must point at the correct service name and port (`http://engine:3001/api/inngest`). If the engine service hasn't started or uses a different port, Inngest gets no function registrations.

**How to avoid:** Add `depends_on` with health check conditions. Verify the engine exposes its Inngest handler at the expected path. Test with `curl http://localhost:8288` to confirm the dev UI loads and lists functions.

### Pitfall 4: Event table receives UPDATE queries

**What goes wrong:** Application code accidentally updates event rows (e.g., adding a "resolution" field to an existing event). The append-only invariant is silently violated.

**Why it happens:** ORMs make updates easy. A developer unfamiliar with event sourcing patterns will reach for `db.update(events)` naturally.

**How to avoid:** Apply a Postgres trigger on the events table that raises an exception on UPDATE/DELETE. This is a database-level constraint, not just a code convention.

```sql
-- Add via a migration
CREATE OR REPLACE FUNCTION prevent_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'events table is append-only — no UPDATE or DELETE allowed';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_event_immutability
BEFORE UPDATE OR DELETE ON events
FOR EACH ROW EXECUTE FUNCTION prevent_event_mutation();
```

### Pitfall 5: Vitest integration tests against Docker Postgres fail in CI

**What goes wrong:** Integration tests pass locally but fail in CI because the Docker Postgres service isn't healthy when tests run.

**Why it happens:** Vitest runs immediately after Docker Compose starts. PostgreSQL takes a few seconds to accept connections. The test runner doesn't wait.

**How to avoid:** Use `docker compose up --wait` in CI (waits for health checks) before running `pnpm test:integration`. Alternatively, add a retry loop in the test `beforeAll` with a short delay.

### Pitfall 6: `postgres` driver vs `pg` driver confusion

**What goes wrong:** Mixing imports from `drizzle-orm/postgres-js` and `drizzle-orm/node-postgres` in different packages. They are not interchangeable — different API, different connection string format handling.

**Why it happens:** Some docs use `pg`, others use `postgres`. The STACK.md decision is `postgres` (postgres.js, `drizzle-orm/postgres-js`).

**How to avoid:** Enforce a single import via ESLint rule or a workspace-wide convention. All Drizzle client instantiation goes through `packages/shared/src/db/client.ts`.

### Pitfall 7: Snapshot table out of sync with event log

**What goes wrong:** Snapshots are written but not invalidated when new events arrive. Reads return stale state.

**Why it happens:** The snapshot is a write-through cache. If an event is appended but the snapshot update fails or is skipped, the snapshot diverges from reality.

**How to avoid:** Always append event first, then update snapshot in the same transaction. If the transaction rolls back, both are rolled back together.

```typescript
await db.transaction(async (tx) => {
  await tx.insert(schema.events).values(event);
  await tx.insert(schema.projectSnapshots)
    .values({ projectId, state: newState, snapshotAt: new Date() })
    .onConflictDoUpdate({ target: schema.projectSnapshots.projectId, set: { state: newState } });
});
```

---

## Code Examples

### Complete Seed Table Schema

```typescript
// packages/shared/src/db/schema/seed.ts
// Source: verified against https://orm.drizzle.team/docs/sql-schema-declaration
import { pgTable, pgEnum, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { projects } from './project';

export const seedStatusEnum = pgEnum('seed_status', [
  'draft',
  'crystallized',  // immutable after this point — no UPDATE allowed
]);

export const seeds = pgTable('seeds', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  parentId: uuid('parent_id'),  // self-reference for evolution lineage (D-03)
  version: text('version').notNull(),
  // D-01: structured columns for seed fields
  goal: text('goal').notNull(),
  constraints: jsonb('constraints').notNull().default([]),
  acceptanceCriteria: jsonb('acceptance_criteria').notNull().default([]),
  ontologySchema: jsonb('ontology_schema').notNull().default({}),
  evaluationPrinciples: jsonb('evaluation_principles').notNull().default([]),
  exitConditions: jsonb('exit_conditions').notNull().default([]),
  status: seedStatusEnum('status').notNull().default('draft'),
  crystallizedAt: timestamp('crystallized_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  // NO updatedAt — seeds are immutable after crystallization
});

// Recursive CTE for lineage traversal (D-03)
// SELECT id, parent_id, goal, version
// FROM seeds
// WHERE id = $seedId
// UNION ALL
// SELECT s.id, s.parent_id, s.goal, s.version
// FROM seeds s JOIN lineage ON s.id = lineage.parent_id
export type Seed = typeof seeds.$inferSelect;
export type NewSeed = typeof seeds.$inferInsert;
```

### Project Snapshot Table (D-07 Snapshotting)

```typescript
// packages/shared/src/db/schema/snapshot.ts
import { pgTable, uuid, jsonb, timestamp, integer } from 'drizzle-orm/pg-core';
import { projects } from './project';

export const projectSnapshots = pgTable('project_snapshots', {
  projectId: uuid('project_id').primaryKey().references(() => projects.id),
  state: jsonb('state').notNull(),
  eventsApplied: integer('events_applied').notNull().default(0),
  snapshotAt: timestamp('snapshot_at').notNull().defaultNow(),
});
```

### Atomic Bead Claim with Row-Level Locking

```typescript
// Atomic bead claim prevents race conditions (PITFALL 4 from PITFALLS.md)
async function claimBead(db: DbClient, beadId: string, agentId: string): Promise<Bead | null> {
  return db.transaction(async (tx) => {
    // SELECT FOR UPDATE skips locked rows — atomic claim
    const [bead] = await tx
      .select()
      .from(schema.beads)
      .where(
        and(
          eq(schema.beads.id, beadId),
          eq(schema.beads.status, 'pending')
        )
      )
      .for('update', { skipLocked: true });

    if (!bead) return null;  // Already claimed by another worker

    const [updated] = await tx
      .update(schema.beads)
      .set({ status: 'claimed', agentAssignment: agentId, claimedAt: new Date() })
      .where(eq(schema.beads.id, beadId))
      .returning();

    await tx.insert(schema.events).values({
      projectId: bead.projectId,
      beadId: bead.id,
      type: 'bead_claimed',
      payload: { agentId },
    });

    return updated;
  });
}
```

### Recursive CTE for Seed Lineage (D-03)

```typescript
// packages/shared/src/db/queries/lineage.ts
import { sql } from 'drizzle-orm';

async function getSeedLineage(db: DbClient, seedId: string) {
  // Recursive CTE — traverses parent_id chain back to root seed
  return db.execute(sql`
    WITH RECURSIVE lineage AS (
      SELECT id, parent_id, goal, version, created_at, 0 AS depth
      FROM seeds
      WHERE id = ${seedId}
      UNION ALL
      SELECT s.id, s.parent_id, s.goal, s.version, s.created_at, l.depth + 1
      FROM seeds s
      INNER JOIN lineage l ON s.id = l.parent_id
    )
    SELECT * FROM lineage ORDER BY depth DESC
  `);
}
```

### Migration Workflow

```bash
# 1. Edit schema in packages/shared/src/db/schema/
# 2. Generate migration SQL (never edit generated files manually)
pnpm --filter @cauldron/shared db:generate
# Runs: drizzle-kit generate --config drizzle.config.ts
# Output: packages/shared/src/db/migrations/0001_initial.sql

# 3. Apply to running Docker Postgres
pnpm --filter @cauldron/shared db:migrate
# Runs: drizzle-kit migrate --config drizzle.config.ts

# 4. Commit BOTH the schema change AND the migration file
git add packages/shared/src/db/schema/ packages/shared/src/db/migrations/
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Turborepo `"pipeline"` key | `"tasks"` key in turbo.json | Turborepo 2.0 | Old key still works but new projects use `"tasks"` |
| drizzle-kit `"driver"` field | `"dialect"` field in drizzle.config.ts | drizzle-kit ~0.24 | Required in 0.31.x — `driver` removed for standard databases |
| Prisma binary for PG | Drizzle ORM (pure JS) | 2024-2025 | No binary dep; instant type feedback; smaller bundle |
| Vitest workspace file | `test.projects` in vitest.config.ts | Vitest 2.0+ | `vitest.workspace.ts` still works but `test.projects` is the 2025 pattern |
| `inngest dev` CLI locally | `inngest/inngest` Docker image | Inngest 1.x | Docker Compose is the recommended local dev approach per official docs |

**Deprecated/outdated from STACK.md:**
- `drizzle-kit@0.28.x`: The STACK.md listed this version; current is **0.31.10**. Use 0.31.10. The `dialect` key is required in 0.31.x.
- Turborepo `"pipeline"` key: Still works in 2.x but deprecated. Use `"tasks"`.

---

## Open Questions

1. **Inngest Redis connection in Docker Compose**
   - What we know: Inngest dev server requires Redis as its backing store. The Docker image accepts a `INNGEST_REDIS_URI` environment variable.
   - What's unclear: Whether the local Inngest dev server uses the same Redis instance as the application's `ioredis` client, or requires a separate Redis. The official Docker Compose example doesn't show Redis connection config for the Inngest container.
   - Recommendation: Configure `INNGEST_REDIS_URI=redis://redis:6379` in the Inngest service. Share one Redis instance for dev (separate in production).

2. **Seed table UPDATE trigger timing**
   - What we know: Seeds should be immutable after `status = 'crystallized'`. The trigger should only prevent updates after that status is set, not before.
   - What's unclear: Whether to use a Postgres trigger (database-level) or application-level constraint (Drizzle query layer). Database trigger is stronger but harder to test.
   - Recommendation: Application-level guard in the seed repository methods for v1. Document the intent clearly. Add DB trigger in a follow-on migration once the pattern is stable.

3. **drizzle-kit 0.31.x `strict: true` behavior**
   - What we know: `strict: true` in drizzle.config.ts causes drizzle-kit to prompt for confirmation on destructive operations.
   - What's unclear: Whether `strict: true` blocks automated migration runs in CI (requires interactive confirmation).
   - Recommendation: Set `strict: false` for the `test:integration` environment; `strict: true` only in developer-facing scripts. Or use `drizzle-kit migrate` (not `push`) which doesn't prompt.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All packages | Yes | v22.22.1 | — |
| pnpm | Package manager | Yes | 10.32.1 | — |
| Docker Desktop | INFR-06 (Docker Compose) | Yes (app present) | Unknown | — |
| docker CLI | INFR-06 | Not in PATH | — | Open Docker Desktop first; add to PATH |
| psql client | DB verification | Not in PATH | — | Use `docker exec` to run psql inside container |
| redis-cli | Redis verification | Not in PATH | — | Use `docker exec` to run redis-cli inside container |
| turbo | Build orchestration | Not in PATH | — | Install via `pnpm add -D turbo` in Wave 0 |

**Missing dependencies with no fallback:**
- Docker CLI must be accessible from the shell before `docker compose up` can run. Docker Desktop is installed but the CLI binary is not in PATH. Installer must run `open /Applications/Docker.app` to launch Docker Desktop first, or add `/Applications/Docker.app/Contents/Resources/bin` to PATH.

**Missing dependencies with fallback:**
- `psql`, `redis-cli`, `turbo` — all installable as part of Wave 0 package setup.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.1 |
| Config file | `vitest.config.ts` at repo root (test.projects pattern) |
| Quick run command | `pnpm --filter @cauldron/shared test` |
| Integration run command | `pnpm --filter @cauldron/shared test:integration` |
| Full suite command | `turbo run test test:integration` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFR-01 | `pnpm install` resolves all packages | smoke | `pnpm install --frozen-lockfile` | Wave 0 |
| INFR-02 | All 7 tables created by migrations | integration | `vitest run --project shared` | Wave 0 |
| INFR-03 | Redis connection accepted | integration | `vitest run --project shared` | Wave 0 |
| INFR-04 | Events append-only, replay derives state | integration | `vitest run --project shared` | Wave 0 |
| INFR-05 | Drizzle migrations run to completion | integration | `pnpm --filter @cauldron/shared db:migrate` | Wave 0 |
| INFR-06 | Docker Compose health checks pass | smoke | `docker compose up --wait` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @cauldron/shared typecheck`
- **Per wave merge:** `pnpm --filter @cauldron/shared test:integration` (requires Docker)
- **Phase gate:** `turbo run build typecheck test:integration` — all green before `/gsd:verify-work`

### Wave 0 Gaps

All test infrastructure must be created in Wave 0 (none exists yet — greenfield):
- [ ] `packages/shared/vitest.config.ts` — Vitest config for shared package
- [ ] `vitest.config.ts` at repo root — workspace projects config
- [ ] `packages/shared/src/db/__tests__/schema.integration.test.ts` — covers INFR-02
- [ ] `packages/shared/src/db/__tests__/event-sourcing.integration.test.ts` — covers INFR-04
- [ ] `packages/shared/src/db/__tests__/redis.integration.test.ts` — covers INFR-03
- [ ] `packages/shared/src/db/migrations/` — created by first `drizzle-kit generate` run

---

## Project Constraints (from CLAUDE.md)

| Directive | Category | Enforcement |
|-----------|----------|-------------|
| TypeScript end-to-end | Required language | All packages use TypeScript; no plain JS files |
| Vercel AI SDK for multi-provider | Required LLM interface | Phase 1 installs as dev dep only (used in Phase 2+) |
| Each bead fits in commercial context window (~200k tokens) | Architecture constraint | Phase 1 schema must support bead sizing metadata |
| OSS deps: use if 80% clean fit, don't contort for 100% | Dependency policy | Don't wrap Drizzle in abstraction layers it doesn't need |
| Holdout tests encrypted at rest with keys inaccessible to agents | Security requirement | holdout_vault schema stores ciphertext, not plaintext |
| GSD workflow entry points before file edits | Workflow enforcement | All Phase 1 work runs via `/gsd:execute-phase` |

---

## Sources

### Primary (HIGH confidence)
- npm registry (verified 2026-03-25): `turbo@2.8.20`, `drizzle-orm@0.45.1`, `drizzle-kit@0.31.10`, `postgres@3.4.8`, `ioredis@5.10.1`, `inngest@4.1.0`, `zod@4.3.6`, `vitest@4.1.1`, `vite@8.0.2`
- `.planning/research/STACK.md` — Full technology stack with version justifications
- `.planning/research/ARCHITECTURE.md` — Component boundaries, event sourcing patterns
- `.planning/research/PITFALLS.md` — Race conditions, event table mutation, atomic claim patterns
- `.planning/phases/01-persistence-foundation/01-CONTEXT.md` — All locked schema decisions (D-01 through D-12)
- `https://orm.drizzle.team/docs/drizzle-config-file` — drizzle.config.ts structure (official docs)
- `https://orm.drizzle.team/docs/sql-schema-declaration` — pgTable, pgEnum patterns (official docs)
- `https://orm.drizzle.team/docs/get-started/postgresql-new` — postgres.js driver init (official docs)

### Secondary (MEDIUM confidence)
- `https://www.inngest.com/docs/dev-server` — Inngest Docker image, ports, Docker Compose config
- `https://turborepo.dev/docs/crafting-your-repository/configuring-tasks` — turbo.json `tasks` format for 2.x
- Docker Hub `inngest/inngest` image — confirmed image name and port 8288/8289

### Tertiary (LOW confidence)
- WebSearch results for Turborepo 2.x scaffold — cross-verified with official turbo docs

---

## Metadata

**Confidence breakdown:**
- Standard stack (versions): HIGH — all verified via npm registry on 2026-03-25
- Schema design: HIGH — all decisions locked in CONTEXT.md, patterns verified against official Drizzle docs
- Docker Compose: HIGH — Inngest image name and ports verified from official docs
- Turborepo turbo.json format: MEDIUM — official docs confirmed `tasks` key but no full 1.x→2.x migration guide found
- drizzle-kit 0.31.x `strict` behavior in CI: LOW — flagged as open question

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable stack, 30-day window)
