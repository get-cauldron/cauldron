# Phase 18: Async Asset Engine - Research

**Researched:** 2026-03-31
**Domain:** Durable async job system, ComfyUI API adapter, Inngest step orchestration, PostgreSQL job state
**Confidence:** HIGH

## Summary

Phase 18 adds a durable async image generation job system to Cauldron. The architecture mirrors the existing bead execution subsystem: a new `asset_jobs` table in PostgreSQL tracks job lifecycle, an Inngest function on the `cauldron-engine` client handles durable execution with retries, and the pluggable executor interface has a ComfyUI HTTP API adapter as its first implementation. Completed jobs write image artifacts plus JSON sidecar files to `.cauldron/artifacts/{jobId}/`.

The ComfyUI REST API works by POST-ing a workflow JSON to `/prompt` (returns a `prompt_id`), then polling `/history/{prompt_id}` until the job appears in the history object, then fetching the image binary from `/view`. ComfyUI does not provide a push notification path over plain HTTP; polling is the standard programmatic approach. Within Inngest, the correct pattern is to use `step.sleep()` between poll attempts inside the poll-completion step rather than raw `setInterval`, so Inngest can checkpoint state between polls.

No first-party Docker image exists for ComfyUI. Community images are the standard approach; `yanwk/comfyui-boot` (Docker Hub) and `YanWenKun/ComfyUI-Docker` (GitHub) are widely used, CPU and GPU variants are both available. The ComfyUI service is added to `docker-compose.yml` alongside existing Postgres/Redis/Inngest services.

**Primary recommendation:** Build `packages/engine/src/asset/` as a new engine submodule following the exact holdout events module pattern. Register the Inngest function by adding it to `ENGINE_FUNCTIONS` in `packages/cli/src/inngest-serve.ts` and wiring deps in `packages/cli/src/bootstrap.ts`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Job Lifecycle & States**
- D-01: Mirror bead status pattern: pending -> claimed -> active -> completed/failed, plus canceled state
- D-02: Separate `asset_jobs` table (not reusing beads), but append to the shared `events` table for unified observability across code and asset work
- D-03: Canceled jobs are soft-deleted via status column (row preserved for audit trail)
- D-04: Add a priority column (default 0) for future use, but process FIFO initially

**Execution Backend**
- D-05: Pluggable executor interface in TypeScript: `submitJob`, `checkStatus`, `getArtifact` methods. First adapter is ComfyUI API
- D-06: ComfyUI runs as a Docker container added to docker-compose.yml alongside Postgres/Redis/Inngest — always-on when dev infra is up
- D-07: Cauldron expects ComfyUI available at a configured URL (the docker-compose service). No dynamic process management

**ComfyUI Workflow Contract**
- D-08: Default FLUX.2 dev workflow shipped as a JSON template with variable substitution (prompt, seed, dimensions, steps, guidance)
- D-09: Workflow template lives in `packages/shared/src/workflows/flux-dev.json` — accessible to engine and CLI

**Artifact Storage**
- D-10: Generated images stored in project-local `.cauldron/artifacts/{jobId}/` directory (gitignored)
- D-11: Each artifact gets a JSON sidecar file with full provenance: prompt, model, seed, generation params, timestamp, job ID, executor adapter used
- D-12: No automatic cleanup — artifacts persist until operator manually removes them

**Observability & Progress**
- D-13: DB status transitions drive observability. Leverage existing Postgres LISTEN/NOTIFY -> SSE pipeline (already built for bead status) to stream asset job updates to the dashboard

**Job Submission API Shape**
- D-14: Minimal required fields: `projectId`, `prompt`. Optional: `negativePrompt`, `width`, `height`, `seed`, `steps`, `guidanceScale`, `idempotencyKey`. Extensible via JSONB `extras` column

**Retry & Idempotency**
- D-15: Use Inngest built-in retry via `step.run()` with exponential backoff (max 3 attempts, configurable)
- D-16: Client-provided idempotency key. Duplicate keys within a window are rejected at submission time
- D-17: Configurable generation timeout with 5-minute default. Jobs exceeding timeout transition to failed with timeout reason

**Inngest Function Design**
- D-18: Dedicated `asset/generate` Inngest function on the `cauldron-engine` client. Steps: submit-to-ComfyUI, poll-completion, artifact-collection
- D-19: New `packages/engine/src/asset/` submodule following established module pattern (types.ts, executor interface, ComfyUI adapter, events, __tests__/)

### Claude's Discretion
- Exact ComfyUI Docker image selection and configuration
- Internal polling interval for ComfyUI job completion within the Inngest step
- Error classification (transient vs permanent) for retry decisions
- JSONB `extras` schema shape for extensibility

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ASSET-01 | Image generation requests persist as asynchronous jobs with queued, running, succeeded, failed, and canceled states | asset_jobs table schema + Drizzle pgEnum for status; mirrors bead_status pattern exactly |
| ASSET-02 | Initiating generation returns a durable job handle immediately instead of blocking until the image is ready | Inngest `inngest.send()` returns immediately after event dispatch; job row is inserted before Inngest function starts |
| ASSET-03 | Generation progress and completion can be observed independently of the initiating CLI or web request | Existing SSE polling pipeline at `/api/events/[projectId]/route.ts` consumes the shared `events` table; appending asset job events makes them observable |
| ASSET-04 | Completed jobs persist prompt inputs, output metadata, artifact locations, and failure diagnostics for review and reuse | `asset_jobs` JSONB columns for params + output metadata; file sidecar for provenance; `failureReason` column |
| ASSET-05 | Asset jobs support retry and idempotency controls so duplicate calls do not trigger uncontrolled reruns | Inngest `retries: 3` config; idempotency key uniqueness check at submission time |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `inngest` | 4.1.0 (verified) | Durable async job execution with retries | Already in use for bead execution; `step.run()` with `retries: 3` is the locked pattern |
| `drizzle-orm` | 0.45.2 (verified) | ORM for `asset_jobs` table queries | Project standard; all existing tables use Drizzle |
| `postgres` driver | existing | DB connection | Project standard — not `pg` |
| `node:crypto` | built-in | Not needed here (holdout use only) | Mentioned as project constraint |
| `node:fs/promises` | built-in | Writing artifact files and JSON sidecars | No external dep needed |
| `node:path` | built-in | Building artifact directory paths | No external dep needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pino` | existing | Structured logging in executor adapter | Injected via configureAssetDeps pattern |
| `zod` | 4 (existing) | Input validation for job submission | tRPC input schema for submit endpoint |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inngest step polling with `step.sleep()` | ComfyUI WebSocket | WebSocket requires a persistent connection per job; not compatible with Inngest's checkpoint model. Polling via `step.sleep()` is idempotent and restartable |
| Community Docker image | Build custom ComfyUI image | Custom build adds maintenance burden; community images (yanwk/comfyui-boot) are well-maintained |
| JSON sidecar files | Additional DB table | Sidecars are self-describing outside Cauldron; DB-only approach loses provenance if table is dropped |

**Installation:** No new packages required. Phase uses existing `inngest`, `drizzle-orm`, Node built-ins.

## Architecture Patterns

### Recommended Project Structure
```
packages/
├── shared/
│   ├── src/
│   │   ├── db/
│   │   │   ├── schema/
│   │   │   │   └── asset-job.ts        # NEW: asset_jobs table + enum
│   │   │   │   └── index.ts            # UPDATED: export asset-job
│   │   │   └── migrations/
│   │   │       └── 0013_asset_jobs.sql # NEW: generated migration
│   │   └── workflows/
│   │       └── flux-dev.json           # NEW: FLUX.2 dev workflow template
└── engine/
    └── src/
        └── asset/                      # NEW submodule
            ├── index.ts
            ├── types.ts
            ├── executor.ts             # Pluggable executor interface
            ├── comfyui-adapter.ts      # ComfyUI HTTP API adapter
            ├── job-store.ts            # DB read/write for asset_jobs
            ├── artifact-writer.ts      # File system artifact + sidecar
            ├── events.ts               # Inngest function definition
            ├── errors.ts               # AssetJobError, ComfyUIError, etc.
            └── __tests__/
                ├── executor.test.ts
                ├── comfyui-adapter.test.ts
                ├── job-store.test.ts
                ├── events.test.ts
                └── job-store.integration.test.ts
```

### Pattern 1: Inngest Function Registration (mirror holdout/events.ts)
**What:** Module-level deps configured via `configureAssetDeps()`, function registered on the `cauldron-engine` Inngest client, added to `ENGINE_FUNCTIONS` in `inngest-serve.ts`, wired in `bootstrap.ts`.
**When to use:** Every new engine function that needs DB access follows this pattern.
**Example:**
```typescript
// packages/engine/src/asset/events.ts
// Source: packages/engine/src/holdout/events.ts (exact pattern)
import { inngest } from '../holdout/events.js'; // reuse the cauldron-engine client
import type { InngestFunction } from 'inngest';

interface AssetDeps { db: DbClient; logger: Logger; comfyuiUrl: string; artifactsRoot: string; }
let assetDeps: AssetDeps | null = null;
export function configureAssetDeps(deps: AssetDeps): void { assetDeps = deps; }

export async function generateAssetHandler({ event, step }: { event: { data: AssetJobEvent }; step: StepTools }): Promise<AssetJobResult> {
  const { db, logger, comfyuiUrl, artifactsRoot } = getAssetDeps();
  const { jobId, projectId } = event.data;

  // Step 1: Transition to active, submit workflow to ComfyUI
  const promptId = await step.run('submit-to-comfyui', async () => {
    await updateJobStatus(db, jobId, 'active');
    return submitToComfyUI(comfyuiUrl, event.data);
  });

  // Step 2: Poll for completion using step.sleep between checks
  const outputs = await step.run('poll-completion', async () => {
    return pollUntilComplete(comfyuiUrl, promptId, { timeoutMs: 300_000, pollIntervalMs: 3_000 });
  });

  // Step 3: Download artifacts and write sidecar
  await step.run('collect-artifacts', async () => {
    await collectArtifacts(db, { jobId, projectId, comfyuiUrl, outputs, artifactsRoot, params: event.data });
    await updateJobStatus(db, jobId, 'completed');
    await appendAssetEvent(db, { projectId, jobId, type: 'asset_job_completed' });
  });

  return { jobId, status: 'completed' };
}

export const handleAssetGenerate: InngestFunction<any, any, any, any> = inngest.createFunction(
  { id: 'asset/generate', triggers: [{ event: 'asset/generate.requested' }], retries: 3 },
  (ctx) => generateAssetHandler(ctx as any)
);
```

### Pattern 2: asset_jobs Schema (mirror bead.ts)
**What:** Separate table with status enum, uuid PK, projectId FK, JSONB columns for params and output metadata, idempotency key unique index, version for optimistic concurrency.
**When to use:** New durable job type.
**Example:**
```typescript
// packages/shared/src/db/schema/asset-job.ts
// Source: packages/shared/src/db/schema/bead.ts (pattern)
import { pgTable, pgEnum, uuid, text, timestamp, integer, jsonb, unique } from 'drizzle-orm/pg-core';
import { projects } from './project.js';

export const assetJobStatusEnum = pgEnum('asset_job_status', [
  'pending',
  'active',
  'completed',
  'failed',
  'canceled',
]);

export const assetJobs = pgTable('asset_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  status: assetJobStatusEnum('status').notNull().default('pending'),
  priority: integer('priority').notNull().default(0),
  prompt: text('prompt').notNull(),
  negativePrompt: text('negative_prompt'),
  width: integer('width'),
  height: integer('height'),
  seed: integer('seed'),
  steps: integer('steps'),
  guidanceScale: integer('guidance_scale'),
  idempotencyKey: text('idempotency_key'),
  extras: jsonb('extras').$type<Record<string, unknown>>().default({}),
  outputMetadata: jsonb('output_metadata').$type<AssetOutputMetadata>(),
  artifactPath: text('artifact_path'),
  failureReason: text('failure_reason'),
  executorAdapter: text('executor_adapter').notNull().default('comfyui'),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  idempotencyKeyUnique: unique('asset_jobs_idempotency_key_unique').on(table.projectId, table.idempotencyKey),
}));
```

### Pattern 3: ComfyUI API Interaction
**What:** POST to `/prompt` with workflow JSON, receive `prompt_id`. Poll `/history/{prompt_id}` until the key appears in the returned object (empty object = not done). Fetch image from `/view?filename=...&subfolder=...&type=output`.
**When to use:** Every ComfyUI adapter interaction.
**Example:**
```typescript
// packages/engine/src/asset/comfyui-adapter.ts
// Source: https://docs.comfy.org/development/comfyui-server/comms_routes (verified)
async function submitPrompt(baseUrl: string, workflow: object): Promise<string> {
  const resp = await fetch(`${baseUrl}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow }),
  });
  if (!resp.ok) throw new ComfyUIError(`Prompt rejected: ${resp.status}`);
  const { prompt_id } = await resp.json() as { prompt_id: string };
  return prompt_id;
}

async function pollHistory(baseUrl: string, promptId: string): Promise<ComfyUIOutputs> {
  const resp = await fetch(`${baseUrl}/history/${promptId}`);
  if (!resp.ok) throw new ComfyUIError(`History fetch failed: ${resp.status}`);
  const history = await resp.json() as Record<string, unknown>;
  // Empty object means still in queue or executing
  if (!history[promptId]) return null; // not ready
  return extractOutputs(history[promptId]);
}

async function fetchImage(baseUrl: string, filename: string, subfolder: string): Promise<Buffer> {
  const url = `${baseUrl}/view?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder)}&type=output`;
  const resp = await fetch(url);
  if (!resp.ok) throw new ComfyUIError(`Image fetch failed: ${resp.status}`);
  return Buffer.from(await resp.arrayBuffer());
}
```

### Pattern 4: Event Type Extension
**What:** New event types for asset job lifecycle must be added to `eventTypeEnum` in `packages/shared/src/db/schema/event.ts`.
**When to use:** Adding any new observable lifecycle event.
**Required new types:**
- `asset_job_submitted`
- `asset_job_active`
- `asset_job_completed`
- `asset_job_failed`
- `asset_job_canceled`

### Pattern 5: FLUX.2 dev Workflow Template
**What:** ComfyUI requires a complete workflow JSON graph. The template uses placeholder strings that get substituted before submission. Node IDs are ComfyUI-internal — they must match what the FLUX.2 dev workflow actually uses.
**When to use:** Every `submitJob` call.
**Template variables to support:** `{{PROMPT}}`, `{{NEGATIVE_PROMPT}}`, `{{SEED}}`, `{{WIDTH}}`, `{{HEIGHT}}`, `{{STEPS}}`, `{{GUIDANCE_SCALE}}`

### Anti-Patterns to Avoid
- **Polling with `setInterval` inside a `step.run()` callback:** `step.run()` is a single checkpoint unit — if it takes 5 minutes and Inngest's function timeout fires, the step fails without the intermediate poll state being preserved. Instead, implement the poll loop as a plain `while` loop with `await sleep(interval)` (a simple Promise delay, not Inngest's `step.sleep`) or structure each poll as a separate step with `step.sleep` between.
- **Using `step.sleep()` between steps for sub-minute polling:** `step.sleep()` is designed for waits measured in minutes, hours, or days — it checkpoints and resumes. For polling a local ComfyUI service every 3 seconds, a standard `while` loop with `Promise` delay inside one `step.run()` is simpler and avoids excessive step fan-out.
- **Using the `beads` table for asset jobs:** D-02 locked this — separate table required.
- **Mutating seeds table for asset state:** Seeds are immutable; asset state belongs in `asset_jobs`.
- **Importing the `events.ts` Inngest client definition twice:** The `cauldron-engine` Inngest client is already defined in `packages/engine/src/holdout/events.ts` — import `inngest` from there. Do not create a second `new Inngest({ id: 'cauldron-engine' })`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Durable retry with exponential backoff | Custom retry loop | Inngest `step.run()` with `retries: 3` | Handles crash recovery, state persistence, backoff automatically |
| Idempotency dedup | In-memory cache | Postgres unique constraint on `(projectId, idempotencyKey)` | Survives restarts; enforced at DB level |
| Job persistence across server restarts | Custom job queue | `asset_jobs` Postgres table + Inngest | Jobs survive process death; Inngest picks up from last checkpoint |
| ComfyUI HTTP client | axios/node-fetch wrapper | `fetch` (built-in Node 22) | Already at Node 22.22 — no extra dependency needed |
| File I/O for artifacts | Third-party fs library | `node:fs/promises` | Built-in; no extra dep |

**Key insight:** The entire async durability problem is solved by Inngest steps. The only custom code is the ComfyUI HTTP adapter and the DB schema.

## Common Pitfalls

### Pitfall 1: ComfyUI `/history` returns empty object while job is still running
**What goes wrong:** Code checks `if (!result)` but `/history/{prompt_id}` returns `{}` (not null) when the job is pending or running. A check like `if (!history[promptId])` correctly detects not-ready.
**Why it happens:** ComfyUI only adds an entry to the history object once execution completes.
**How to avoid:** Check `if (history[promptId] === undefined)` to distinguish "not ready" from "error". Return `null` to signal "keep polling".
**Warning signs:** Poll loop exits immediately after first check with no artifact.

### Pitfall 2: Inngest function timeout vs. ComfyUI generation time
**What goes wrong:** FLUX.2 dev generation on CPU can take 10-30+ minutes. Default Inngest function step timeout may not accommodate this.
**Why it happens:** The `poll-completion` step runs inside `step.run()` — if ComfyUI generation exceeds the step's execution window, the step fails.
**How to avoid:** Structure the poll loop with explicit timeout tracking (D-17: 5-minute default). Throw a `NonRetriableError` on timeout so the job transitions to `failed` rather than retrying indefinitely. Check Inngest's configured step timeout for the self-hosted dev server (default is generous in dev mode).
**Warning signs:** Jobs sit in `active` state indefinitely.

### Pitfall 3: Duplicate Inngest client registration
**What goes wrong:** Creating a second `new Inngest({ id: 'cauldron-engine' })` in `asset/events.ts` causes the Inngest dev server to see two clients with the same ID.
**Why it happens:** Each engine submodule is tempted to define its own client.
**How to avoid:** Import `inngest` from `'../holdout/events.js'` — the cauldron-engine client is defined there and shared across all engine Inngest functions.
**Warning signs:** Inngest dev server shows duplicate function registrations or "client id conflict" errors.

### Pitfall 4: Missing event type enum values cause Drizzle migration conflicts
**What goes wrong:** Adding new event types to `eventTypeEnum` after the initial migration requires a new migration that alters the PostgreSQL enum — this cannot be done in the same migration as the `asset_jobs` table.
**Why it happens:** PostgreSQL enum alterations require `ALTER TYPE ... ADD VALUE` which has transaction restrictions.
**How to avoid:** Generate two separate migrations: one for the `asset_jobs` table, one for extending `event_type` enum. Or add all new event types in the same migration as the table creation (they can be in the same Drizzle migration file if the enum extension comes before table creation).
**Warning signs:** `pnpm db:migrate` fails with "cannot ALTER TYPE inside a transaction" in some PostgreSQL versions.

### Pitfall 5: Artifact directory not gitignored
**What goes wrong:** Generated images (potentially large binary files) get accidentally committed.
**Why it happens:** `.cauldron/artifacts/` directory is created at runtime.
**How to avoid:** Add `.cauldron/` to root `.gitignore` as part of this phase.
**Warning signs:** `git status` shows untracked binary files after a generation run.

### Pitfall 6: ComfyUI workflow JSON node IDs are not portable
**What goes wrong:** The FLUX.2 dev workflow template is copied from one ComfyUI installation and references specific node IDs (e.g., `"6"`, `"271"`) that depend on how the workflow was built. A different ComfyUI install may have different node IDs.
**Why it happens:** ComfyUI workflow JSON is not a declarative spec — it's a snapshot of a specific graph state.
**How to avoid:** Derive the canonical FLUX.2 dev workflow JSON from the ComfyUI default examples. Document which node IDs hold prompt/seed/dimension values. The template is in `packages/shared/src/workflows/flux-dev.json` (D-09) — treat it as authoritative and pin the ComfyUI Docker image version.
**Warning signs:** Variable substitution writes prompt text to wrong nodes; generated image ignores prompt.

## Code Examples

Verified patterns from official sources:

### ComfyUI Prompt Submission
```typescript
// Source: https://docs.comfy.org/development/comfyui-server/comms_routes
// POST /prompt — submit workflow for execution
const response = await fetch(`${comfyuiUrl}/prompt`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: workflowGraph }),
});
// Success: { prompt_id: string, number: number, node_errors: {} }
// Failure: { error: string, node_errors: Record<string, unknown> }
const { prompt_id } = await response.json();
```

### ComfyUI History Polling
```typescript
// Source: https://docs.comfy.org/development/comfyui-server/comms_routes
// GET /history/{prompt_id} — check completion
const response = await fetch(`${comfyuiUrl}/history/${promptId}`);
const history = await response.json() as Record<string, ComfyUIHistoryEntry>;
if (!history[promptId]) {
  // Job is still pending/running — poll again
  return null;
}
// history[promptId].outputs contains node output data including image filenames
const outputs = history[promptId].outputs;
```

### Inngest Function with Retry Configuration
```typescript
// Source: https://www.inngest.com/docs/features/inngest-functions/error-retries/retries
// retries: 3 means 3 retry attempts after the initial try (4 total attempts)
export const handleAssetGenerate = inngest.createFunction(
  {
    id: 'asset/generate',
    triggers: [{ event: 'asset/generate.requested' }],
    retries: 3, // D-15: max 3 attempts, configurable
  },
  async ({ event, step }) => { /* handler body */ }
);
```

### NonRetriableError for Permanent Failures
```typescript
// Source: https://www.inngest.com/docs/features/inngest-functions/error-retries/retries
import { NonRetriableError } from 'inngest';

// Use for permanent failures that should not retry
if (isTimeout) {
  throw new NonRetriableError('Asset generation timed out after 5 minutes');
}
// Inngest will mark the step as failed and not retry
```

### Idempotency Key Enforcement
```typescript
// Source: drizzle-orm docs — unique constraint on insert
// Reject duplicate submissions at DB level
try {
  await db.insert(assetJobs).values({ ...jobData, idempotencyKey });
} catch (err) {
  if (isUniqueConstraintError(err)) {
    // Return existing job handle instead of creating a new one
    const [existing] = await db.select().from(assetJobs)
      .where(and(eq(assetJobs.projectId, projectId), eq(assetJobs.idempotencyKey, idempotencyKey)));
    return { jobId: existing.id, status: existing.status, duplicate: true };
  }
  throw err;
}
```

### Artifact Sidecar JSON Shape
```typescript
// D-11: Full provenance in sidecar
interface ArtifactSidecar {
  jobId: string;
  projectId: string;
  prompt: string;
  negativePrompt?: string;
  model: string;          // e.g., "FLUX.2-dev"
  seed: number;
  width: number;
  height: number;
  steps: number;
  guidanceScale: number;
  generatedAt: string;    // ISO 8601
  executorAdapter: string; // "comfyui"
  comfyuiPromptId: string;
  imageFilename: string;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ComfyUI WebSocket for status | HTTP polling `/history/{prompt_id}` | Stable since ComfyUI v0.x | Polling is simpler for non-interactive clients; WebSocket requires persistent connection management incompatible with Inngest steps |
| `pg` driver | `postgres` (postgres.js) driver | Project decision Phase 1 | Must use `postgres` driver — see CLAUDE.md constraint |
| Prisma | Drizzle ORM | Project decision Phase 1 | Drizzle's SQL-like API, no codegen |

**Deprecated/outdated:**
- `dagre` 0.8.x: Do not use — use `@dagrejs/dagre` (CLAUDE.md constraint, not relevant to this phase)
- `pg` driver: Do not use (CLAUDE.md constraint)

## Open Questions

1. **FLUX.2 dev ComfyUI workflow JSON template accuracy**
   - What we know: The workflow must target specific node IDs for prompt, seed, dimensions. D-09 specifies the template lives at `packages/shared/src/workflows/flux-dev.json`.
   - What's unclear: The exact node structure of a minimal FLUX.2 dev workflow depends on the ComfyUI version. Since models are not yet acquired (Phase 19), the template cannot be end-to-end tested in this phase.
   - Recommendation: Create a well-structured placeholder template with documentation of expected node IDs. Mark it clearly as requiring validation when models are available in Phase 19.

2. **ComfyUI Docker image selection**
   - What we know: No official ComfyUI Docker image exists. Community options include `yanwk/comfyui-boot` (actively maintained) and `YanWenKun/ComfyUI-Docker` (GitHub). CPU-only mode works for integration tests; GPU mode requires NVIDIA runtime.
   - What's unclear: Exact image tag to pin for reproducibility.
   - Recommendation: Use `yanwk/comfyui-boot:latest` for the docker-compose entry with a `profiles: ["gpu"]` flag so the service is opt-in. Document that GPU passthrough requires NVIDIA container toolkit. This is Claude's discretion per context.

3. **PostgreSQL enum ALTER inside migrations**
   - What we know: Adding values to an existing `eventTypeEnum` (already has 29 values) requires `ALTER TYPE ... ADD VALUE`. In PostgreSQL 12+, this can be done outside transactions but Drizzle Kit generates it differently.
   - What's unclear: Whether Drizzle Kit 0.45.x generates a proper `ALTER TYPE ... ADD VALUE` or tries to drop/recreate the enum.
   - Recommendation: Run `pnpm db:generate` after adding new event types and inspect the generated migration SQL before applying. If Drizzle generates a drop/recreate, manually rewrite the migration to use `ALTER TYPE ... ADD VALUE`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker | ComfyUI service container | ✓ | 29.3.1 | — |
| Docker Compose | Dev infra orchestration | ✓ | v5.1.0 | — |
| Node.js | Engine runtime, fetch API | ✓ | 22.22.1 | — |
| pnpm | Build and test commands | ✓ | 10.32.1 | — |
| PostgreSQL | asset_jobs table | ✓ (via docker-compose) | 17-alpine | — |
| Inngest server | Function orchestration | ✓ (via docker-compose) | latest | — |
| ComfyUI API | Image generation | ✗ (not yet in docker-compose) | — | Phase adds it |
| FLUX.2 dev model | Actual generation | ✗ (Phase 19 scope) | — | Mock adapter in tests |

**Missing dependencies with no fallback:**
- ComfyUI Docker service: This phase adds it to `docker-compose.yml`. Functional tests against a real ComfyUI require the container to be running with models loaded (Phase 19 concern).

**Missing dependencies with fallback:**
- FLUX.2 dev model: Not acquired until Phase 19. Unit and integration tests for this phase use a mock ComfyUI adapter or a stub HTTP server. End-to-end generation is a Phase 19 concern.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4 |
| Config file | `packages/engine/vitest.config.ts` (exists) |
| Quick run command | `pnpm -F @get-cauldron/engine test -- src/asset` |
| Full suite command | `pnpm -F @get-cauldron/engine test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ASSET-01 | `asset_jobs` table has correct status enum values and schema | unit | `pnpm -F @get-cauldron/engine test -- src/asset/__tests__/job-store.test.ts` | ❌ Wave 0 |
| ASSET-01 | Status transitions: pending→active→completed, pending→active→failed, pending→canceled | unit | `pnpm -F @get-cauldron/engine test -- src/asset/__tests__/job-store.test.ts` | ❌ Wave 0 |
| ASSET-02 | `submitJob()` inserts a row and returns job handle without awaiting ComfyUI | unit | `pnpm -F @get-cauldron/engine test -- src/asset/__tests__/job-store.test.ts` | ❌ Wave 0 |
| ASSET-02 | Inngest function is triggered and returns immediately | unit | `pnpm -F @get-cauldron/engine test -- src/asset/__tests__/events.test.ts` | ❌ Wave 0 |
| ASSET-03 | Asset job events (`asset_job_submitted`, `asset_job_completed`) are appended to events table | unit | `pnpm -F @get-cauldron/engine test -- src/asset/__tests__/events.test.ts` | ❌ Wave 0 |
| ASSET-04 | Completed job row contains prompt params, artifact path, output metadata | unit | `pnpm -F @get-cauldron/engine test -- src/asset/__tests__/job-store.test.ts` | ❌ Wave 0 |
| ASSET-04 | Artifact sidecar JSON written alongside image with correct provenance fields | unit | `pnpm -F @get-cauldron/engine test -- src/asset/__tests__/artifact-writer.test.ts` | ❌ Wave 0 |
| ASSET-05 | Duplicate idempotency key returns existing job handle, does not insert new row | unit | `pnpm -F @get-cauldron/engine test -- src/asset/__tests__/job-store.test.ts` | ❌ Wave 0 |
| ASSET-05 | ComfyUI submission failure retries up to 3 times before marking failed | unit | `pnpm -F @get-cauldron/engine test -- src/asset/__tests__/events.test.ts` | ❌ Wave 0 |
| ASSET-01–05 | Full job lifecycle against real Postgres (submit→active→completed state transitions) | integration | `pnpm -F @get-cauldron/engine test:integration -- src/asset/__tests__/job-store.integration.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm -F @get-cauldron/engine test -- src/asset`
- **Per wave merge:** `pnpm -F @get-cauldron/engine test && pnpm typecheck && pnpm build`
- **Phase gate:** Full suite green + build green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/engine/src/asset/__tests__/job-store.test.ts` — covers ASSET-01, ASSET-02, ASSET-04, ASSET-05
- [ ] `packages/engine/src/asset/__tests__/events.test.ts` — covers ASSET-02, ASSET-03, ASSET-05
- [ ] `packages/engine/src/asset/__tests__/artifact-writer.test.ts` — covers ASSET-04
- [ ] `packages/engine/src/asset/__tests__/comfyui-adapter.test.ts` — ComfyUI HTTP adapter unit tests with mocked fetch
- [ ] `packages/engine/src/asset/__tests__/job-store.integration.test.ts` — real Postgres, covers full lifecycle

## Sources

### Primary (HIGH confidence)
- `packages/engine/src/holdout/events.ts` — Inngest function pattern, `cauldron-engine` client, `configure*Deps` pattern
- `packages/shared/src/db/schema/bead.ts` — Status enum pattern, schema conventions
- `packages/shared/src/db/schema/event.ts` — Event type enum structure, append-only pattern
- `packages/cli/src/inngest-serve.ts` — Function registration pattern, ENGINE_FUNCTIONS list
- `packages/cli/src/bootstrap.ts` — Dependency wiring pattern at startup
- `packages/web/src/app/api/events/[projectId]/route.ts` — SSE polling mechanism (no changes needed for asset observability)
- https://docs.comfy.org/development/comfyui-server/comms_routes — ComfyUI REST API endpoints verified
- https://www.inngest.com/docs/features/inngest-functions/error-retries/retries — Inngest retry config verified

### Secondary (MEDIUM confidence)
- https://www.inngest.com/docs/features/inngest-functions/steps-workflows/sleeps — Inngest step.sleep semantics
- https://www.inngest.com/docs/learn/inngest-steps — Step execution model
- `yanwk/comfyui-boot` Docker Hub image — community-maintained, widely used (no official ComfyUI Docker image exists)

### Tertiary (LOW confidence)
- ComfyUI workflow JSON node ID structure for FLUX.2 dev — depends on specific workflow version; cannot be verified without a running instance

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in project; versions verified from `packages/engine/package.json` and npm registry
- Architecture: HIGH — directly mirrors existing bead/holdout patterns verified by reading source files
- ComfyUI API: HIGH — verified against official docs.comfy.org
- Pitfalls: HIGH — derived from reading actual source code and ComfyUI API semantics
- FLUX.2 workflow template: LOW — exact node IDs cannot be verified without a running ComfyUI instance

**Research date:** 2026-03-31
**Valid until:** 2026-04-30 (Inngest and Drizzle are stable; ComfyUI API changes infrequently)
