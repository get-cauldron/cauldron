# Coding Conventions

**Analysis Date:** 2026-03-29

## Naming Patterns

**Files:**
- Source files: `kebab-case.ts` (e.g., `agent-runner.ts`, `circuit-breaker.ts`, `event-store.ts`)
- Test files: `kebab-case.test.ts`, `kebab-case.integration.test.ts`, `kebab-case.wiring.test.ts`
- React components: `PascalCase.tsx` (e.g., `ChatBubble.tsx`, `DAGCanvas.tsx`, `BeadNode.tsx`)
- Schema files: `singular-noun.ts` (e.g., `project.ts`, `bead.ts`, `seed.ts`)
- Barrel files: `index.ts` in every module directory

**Functions:**
- Use `camelCase` for all functions: `assertValidTransition()`, `scoreTranscript()`, `runActivePerspectives()`
- Factory functions: `create*` prefix (e.g., `createVault()`, `createTestDb()`, `createScriptedGateway()`)
- Builder helpers in tests: `make*` or `build*` prefix (e.g., `makeMockDb()`, `buildAgentContext()`)
- Boolean functions: no `is` prefix consistently enforced, but predicates use descriptive names

**Variables:**
- Use `camelCase` for variables and parameters
- Constants: `SCREAMING_SNAKE_CASE` (e.g., `VALID_TRANSITIONS`, `CLARITY_THRESHOLD`, `STAGE_PREAMBLES`)
- Mock variables: `mock*` prefix (e.g., `mockExecSync`, `mockLogger`, `mockGateway`)

**Types:**
- Interfaces and type aliases: `PascalCase` (e.g., `InterviewTurn`, `AmbiguityScores`, `SeedSummary`)
- Drizzle inferred types: `type Project = typeof projects.$inferSelect` / `type NewProject = typeof projects.$inferInsert`
- Enums: `camelCase` + `Enum` suffix for Drizzle pgEnums (e.g., `beadStatusEnum`, `eventTypeEnum`)

**Database columns:**
- Use `snake_case` in PostgreSQL: `project_id`, `created_at`, `ambiguity_score`
- Drizzle schema maps to `camelCase` TypeScript: `projectId`, `createdAt`, `ambiguityScore`
- Every table has `id: uuid().primaryKey().defaultRandom()`
- Timestamps: `createdAt` on all tables, `updatedAt` only on mutable tables (NOT on seeds or events)

**API routes:**
- tRPC procedures: `camelCase` verbs (e.g., `startInterview`, `getTranscript`, `sendAnswer`, `approveSummary`)
- REST Route Handlers: Next.js App Router convention at `src/app/api/[path]/route.ts`

## Code Organization Patterns

**Module structure (engine submodules):**
Each engine submodule follows a consistent internal layout:
```
packages/engine/src/{module}/
  ├── index.ts          # Barrel file with all public exports
  ├── types.ts          # Type definitions for the module
  ├── {primary}.ts      # Main implementation (e.g., fsm.ts, gateway.ts, decomposer.ts)
  ├── {helper1}.ts      # Supporting logic (e.g., scorer.ts, perspectives.ts, ranker.ts)
  ├── errors.ts         # Module-specific error classes (where applicable)
  └── __tests__/        # Co-located test directory
       ├── {name}.test.ts
       ├── {name}.integration.test.ts
       └── {name}.wiring.test.ts
```

**Import ordering:**
1. Node.js built-ins: `import { execSync } from 'node:child_process'`
2. External packages: `import { eq, desc } from 'drizzle-orm'`
3. Workspace packages: `import { interviews, seeds } from '@get-cauldron/shared'`
4. Relative imports: `import { scoreTranscript } from './scorer.js'`
5. Type imports use `import type` consistently: `import type { Logger } from 'pino'`

**Critical: Use `.js` extensions in all relative imports** (required by Node16 module resolution):
```typescript
// Correct
import { scoreTranscript } from './scorer.js';
import type { InterviewPhase } from './types.js';

// Wrong — will fail at runtime
import { scoreTranscript } from './scorer';
```

**Export patterns:**
- Every module has a barrel `index.ts` that re-exports public API
- Barrel files explicitly list exports (no `export * from` wildcard for types — use `export type` separately)
- Example from `packages/engine/src/gateway/index.ts`:
  ```typescript
  export type { PipelineStage, ProviderFamily } from './types.js';
  export { GatewayExhaustedError, BudgetExceededError } from './errors.js';
  export { LLMGateway } from './gateway.js';
  export type { LLMGatewayOptions } from './gateway.js';
  ```

**Path aliases:**
- Web package uses `@/` alias mapped to `packages/web/src/` (configured in `vitest.config.ts` and `tsconfig.json`)
- No path aliases in engine, shared, or CLI packages — use relative paths with `.js` extension

## Error Handling

**Custom error classes:**
Define domain-specific errors extending `Error` with typed properties. Located in `errors.ts` within each module.

```typescript
// Pattern from packages/engine/src/gateway/errors.ts
export class BudgetExceededError extends Error {
  public readonly projectId: string;
  public readonly limitCents: number;
  public readonly currentCents: number;
  constructor(projectId: string, limitCents: number, currentCents: number) {
    super(`Project '${projectId}' budget exceeded: ${currentCents} cents used of ${limitCents} cent limit`);
    this.name = 'BudgetExceededError';
    this.projectId = projectId;
    this.limitCents = limitCents;
    this.currentCents = currentCents;
  }
}
```

**Error propagation in tRPC:**
- Wrap domain errors in `TRPCError` at the router layer
- Use appropriate tRPC error codes: `UNAUTHORIZED`, `NOT_FOUND`, `BAD_REQUEST`

**Logging:**
- Framework: Pino (structured JSON logging)
- Logger is dependency-injected into engine classes (not imported as a global)
- Standard interface: `{ info, warn, error, debug }` matching Pino's API
- Use `logger.child()` for contextual sub-loggers

## Type Patterns

**Zod schemas:**
- Used for tRPC input validation: `z.object({ projectId: z.string() })`
- Used for Vercel AI SDK structured output schemas
- Zod version 4 (import from `'zod'`)

**Drizzle-inferred types vs manual types:**
- Database row types: always use Drizzle inference (`typeof table.$inferSelect` / `$inferInsert`)
- Domain types: manually defined in `types.ts` files (e.g., `InterviewTurn`, `AmbiguityScores`)
- Never duplicate Drizzle schema as manual TypeScript interfaces

**Shared type locations:**
- DB schema types: `packages/shared/src/db/schema/*.ts` (exported via barrel)
- Domain types: `packages/engine/src/{module}/types.ts`
- tRPC types: `packages/shared/src/trpc-types.ts`
- Web-specific types: inline in components or co-located

**Generic patterns:**
- `Record<PipelineStage, string[]>` for model configuration maps
- `Partial<Record<string, T>>` for optional configuration overrides
- `typeof table.$inferSelect` / `typeof table.$inferInsert` for Drizzle types

## Database Patterns

**Query patterns:**
- Use Drizzle's fluent API: `db.select().from(table).where(eq(col, val))`
- Always destructure single-row results: `const [row] = await db.select()...`
- Use `sql` template tag for raw SQL in aggregations: `sql<number>\`COALESCE(SUM(...), 0)\``
- JSONB columns typed with `$type<T>()` and `.default()`

**Immutability enforcement:**
- Seeds have no `updatedAt` column — immutable after crystallization
- Events table is append-only — no UPDATE operations, no `updatedAt`
- Optimistic concurrency via `version` column on beads (increment on claim)

**Event sourcing:**
- Append events via `appendEvent(db, { projectId, type, payload })` from `packages/shared/src/db/event-store.ts`
- Derive state via `applyEvent()` reducer pattern
- Snapshots for read optimization via `upsertSnapshot()`

**Migration conventions:**
- Generated by Drizzle Kit: `pnpm db:generate`
- Applied via `pnpm db:migrate` or `ensureMigrations()` at startup
- Migration files in `packages/shared/src/db/migrations/`

## API Patterns

**tRPC router structure:**
```typescript
// packages/web/src/trpc/routers/{domain}.ts
import { z } from 'zod';
import { router, publicProcedure } from '../init';

export const exampleRouter = router({
  procedureName: publicProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      // ctx.db for database access
      // ctx.getEngineDeps() for gateway, config, logger
      return result;
    }),
});
```

**tRPC context:**
- `ctx.db`: Drizzle database client
- `ctx.authenticated`: Boolean from Bearer token validation
- `ctx.getEngineDeps()`: Lazy loader returning `{ gateway, config, logger }`
- Two procedure types: `publicProcedure` (no auth) and `authenticatedProcedure` (requires API key)

**Route Handler structure (non-tRPC):**
```typescript
// packages/web/src/app/api/{path}/route.ts
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Validate auth, parse params, return Response
}
```

**SSE streaming:**
- Located at `packages/web/src/app/api/events/[projectId]/route.ts`
- Uses Postgres LISTEN/NOTIFY for real-time event delivery
- Standard `ReadableStream` + `TextEncoderStream` pattern

## Component Patterns

**React component structure:**
```typescript
// packages/web/src/components/{domain}/{ComponentName}.tsx
'use client';  // Only when client-side interactivity is needed

import * as React from 'react';

export interface ComponentNameProps {
  // Explicit prop interface, always exported
}

export function ComponentName({ prop1, prop2 }: ComponentNameProps) {
  // Named function export (not default export)
  return <div>...</div>;
}
```

**UI primitives:** shadcn/ui components in `packages/web/src/components/ui/` (Avatar, Badge, Button, Card, Dialog, etc.)

**Styling:** Tailwind CSS v4 with `class-variance-authority` for variant composition and `tailwind-merge` via `clsx` for className merging

---

*Convention analysis: 2026-03-29*
