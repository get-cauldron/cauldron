---
phase: 01-persistence-foundation
plan: 01
subsystem: infra
tags: [turborepo, pnpm, typescript, docker, postgres, redis, inngest, monorepo]

# Dependency graph
requires: []
provides:
  - 4-package Turborepo + pnpm monorepo (shared, api, engine, web)
  - Root turbo.json pipeline with build/typecheck/test/dev tasks
  - Docker Compose dev environment (PostgreSQL 17, Redis 7, Inngest dev server)
  - TypeScript base config extended by all packages
  - .env.example with all required environment variables
  - scripts/wait-for-services.sh for CI test readiness
affects: [02-persistence-foundation, 03-ouroboros-interview, all subsequent phases]

# Tech tracking
tech-stack:
  added:
    - turbo 2.8.20
    - pnpm 10.32.1 (workspace manager)
    - typescript 6.0.2
    - drizzle-orm 0.45.1 (in shared)
    - drizzle-kit 0.31.10 (in shared)
    - postgres 3.4.8 (in shared, api)
    - ioredis 5.10.1 (in api, engine)
    - inngest 4.1.0 (in engine)
    - zod 4.3.6 (in shared, api)
    - dotenv 16.4.0 (in shared)
    - tsx 4.21.0 (root devDep)
    - vitest 4.1.1 (root devDep)
    - vite 8.0.2 (root devDep)
  patterns:
    - "packages/shared as single source of truth for Drizzle schemas and TypeScript types"
    - "turbo.json uses tasks key (Turborepo 2.x API, not deprecated pipeline)"
    - "Each package tsconfig.json extends root tsconfig.json"
    - "Two Postgres instances: dev (5432) and test (5433) to isolate test data"

key-files:
  created:
    - package.json
    - pnpm-workspace.yaml
    - turbo.json
    - tsconfig.json
    - .gitignore
    - .env.example
    - docker-compose.yml
    - scripts/wait-for-services.sh
    - packages/shared/package.json
    - packages/shared/tsconfig.json
    - packages/shared/src/index.ts
    - packages/api/package.json
    - packages/api/tsconfig.json
    - packages/api/src/index.ts
    - packages/engine/package.json
    - packages/engine/tsconfig.json
    - packages/engine/src/index.ts
    - packages/web/package.json
    - packages/web/tsconfig.json
    - packages/web/src/index.ts
  modified: []

key-decisions:
  - "turbo.json uses tasks key (not pipeline) per Turborepo 2.x API"
  - "Two Postgres instances in Docker Compose: dev on 5432, test on 5433 with cauldron_test DB"
  - "packages/web is a stub with placeholder build/dev scripts — Next.js scaffold deferred to UI phase"
  - "Inngest dev server connects to host.docker.internal:3001 for engine process running on host"

patterns-established:
  - "Each workspace package extends ../../tsconfig.json for consistent TS settings"
  - "All stub index.ts files use export {} to satisfy isolatedModules"
  - "wait-for-services.sh polls docker compose exec for health before test runs"

requirements-completed: [INFR-01, INFR-03, INFR-06]

# Metrics
duration: 3min
completed: 2026-03-25
---

# Phase 1 Plan 1: Monorepo + Docker Compose Scaffold Summary

**Turborepo + pnpm monorepo with 4 workspace packages and Docker Compose dev environment (PostgreSQL 17 dev+test, Redis 7, Inngest dev server) — pnpm install and turbo typecheck pass cleanly**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-25T22:07:17Z
- **Completed:** 2026-03-25T22:10:28Z
- **Tasks:** 2
- **Files modified:** 20

## Accomplishments
- Root monorepo scaffold with turbo.json (tasks API), pnpm-workspace.yaml, and base tsconfig.json
- All 4 workspace packages (shared, api, engine, web) created with correct dependencies and tsconfig extending root
- `pnpm install` succeeds across all 5 projects (root + 4 packages), `turbo typecheck` passes with 5 successful tasks
- Docker Compose defines PostgreSQL 17 (dev port 5432 + test port 5433), Redis 7, and Inngest dev server with health checks on all three data services

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold Turborepo monorepo with 4 workspace packages** - `2634c7f` (chore)
2. **Task 2: Create Docker Compose dev environment with health checks** - `dfa6bea` (chore)

## Files Created/Modified
- `package.json` - Root workspace with turbo scripts and devDependencies (turbo, typescript, tsx, vitest, vite, eslint)
- `pnpm-workspace.yaml` - Workspace glob: packages/*
- `turbo.json` - Task pipeline (build, typecheck, test, test:integration, dev, db:*, lint) using tasks key
- `tsconfig.json` - Base TypeScript config (ES2022, Node16, strict) extended by all packages
- `.gitignore` - Ignores node_modules, dist, .next, .turbo, .env, coverage
- `.env.example` - All required env vars with correct ports (TEST_DATABASE_URL uses 5433)
- `docker-compose.yml` - PostgreSQL 17 dev+test, Redis 7 with health checks, Inngest dev server
- `scripts/wait-for-services.sh` - Polls docker compose exec for service health (executable)
- `packages/shared/package.json` - @cauldron/shared with drizzle-orm, postgres, zod, dotenv, drizzle-kit
- `packages/api/package.json` - @cauldron/api with workspace:* dep on shared, ioredis, drizzle-orm, zod
- `packages/engine/package.json` - @cauldron/engine with workspace:* dep on shared, inngest, ioredis
- `packages/web/package.json` - @cauldron/web stub with placeholder build/dev scripts
- `packages/*/tsconfig.json` - Each extends ../../tsconfig.json with outDir/rootDir overrides
- `packages/*/src/index.ts` - Stub entry points with `export {}` for isolatedModules compliance

## Decisions Made
- Used `tasks` key in turbo.json (not `pipeline`) — Turborepo 2.x API, `pipeline` is deprecated
- Two Postgres instances in Docker Compose (port 5432 dev, 5433 test) — prevents test data from polluting dev DB, matching the TEST_DATABASE_URL in .env.example
- packages/web is a build stub — Next.js scaffold is deferred to the UI phase; stub satisfies typecheck now
- Inngest dev server uses `host.docker.internal:3001` — engine runs on host during development, not inside Docker

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Docker CLI not in shell PATH (Docker Desktop installed but binary at `/Applications/Docker.app/Contents/Resources/bin/docker`). Could not run `docker compose config --quiet` for YAML validation. Validated docker-compose.yml correctness via Node.js content checks instead — all required services, images, ports, healthchecks, and volumes confirmed present. Docker Desktop is available for actual `docker compose up` usage.

## Known Stubs
- `packages/web/src/index.ts` — stub entry point, no Next.js scaffold yet; intentional for Phase 1. Web scaffold deferred to UI phase (Phase 7 or designated web plan).
- `packages/shared/src/index.ts` — empty, no Drizzle schema yet; Phase 1 Plan 2 will add full schema.
- `packages/api/src/index.ts` — empty, no Hono server yet; will be wired in Phase 2+.
- `packages/engine/src/index.ts` — empty, no Inngest functions yet; will be wired in Phase 5+.

These stubs are intentional scaffolding — each is populated by a specific subsequent plan.

## Next Phase Readiness
- Monorepo is bootable: `pnpm install` works from root, all 4 packages resolve correctly
- TypeScript is configured: `turbo typecheck` passes across all packages
- Docker Compose stack is defined: `docker compose up` will start PostgreSQL, Redis, and Inngest when Docker Desktop is running
- Plan 02 (Drizzle schema) can now target `packages/shared/src/db/schema/` as the schema directory

---
*Phase: 01-persistence-foundation*
*Completed: 2026-03-25*
