# Phase 20: Operator Controls & End-to-End Validation — Research

**Researched:** 2026-04-01
**Domain:** Project settings extension, CLI config/verify commands, E2E integration test architecture
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Nested `asset` object in `ProjectSettings`: `{ asset: { mode, runtimeUrl, artifactsRoot, maxConcurrentJobs } }`.
- **D-02:** Mode enum: `asset.mode: 'active' | 'paused' | 'disabled'`. Active runs normally, paused accepts jobs but does not dispatch, disabled rejects job submission with clear error.
- **D-03:** Acquisition mode is `local-only` for v1.1. Fail fast if ComfyUI not available. No remote fallback.
- **D-04:** No monetary budget for asset generation — local ComfyUI has no per-job cost. LLM budget system is unrelated.
- **D-05:** `asset.maxConcurrentJobs` limits simultaneous running jobs. Prevents GPU overload.
- **D-06:** Both integration test suite AND CLI verification command for E2E validation.
- **D-07:** Full pipeline E2E: interview with style hints → crystallize seed (style persisted) → submit asset job referencing seed style → generation → artifact delivery.
- **D-08:** Dual executor paths: mock executor for standard CI (no GPU required), optional flag to run against real ComfyUI. Mock proves wiring, real proves actual generation.
- **D-09:** CLI command: `cauldron verify` (top-level) with `cauldron verify assets` subcommand. Extensible for future checks.
- **D-10:** Two-layer config: `cauldron.config.ts` sets project defaults (version-controlled), CLI commands override per-project in DB at runtime. DB values take precedence.
- **D-11:** CLI commands: `cauldron config set asset.mode active`, `cauldron config set asset.maxConcurrentJobs 2`. Reads/writes ProjectSettings JSONB in projects table.

### Claude's Discretion

- Exact enforcement point for maxConcurrentJobs (submission vs dispatch)
- Mock executor implementation details for CI tests
- CLI verify command output format and verbosity levels
- Default values for asset settings when not explicitly configured
- Error message wording when mode is disabled/paused

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OPS-01 | Project-level settings support configuring image runtime paths, acquisition mode, and generation budgets without hand-editing implementation internals | `ProjectSettings` JSONB extension with nested `asset` object; `updateSettings` tRPC mutation already exists as pattern; `cauldron config set` CLI command writes directly to DB |
| OPS-02 | Operators can disable or budget-limit image generation per project | `asset.mode` enum enforcement in `submitAssetJob`; `asset.maxConcurrentJobs` checked at submission or dispatch time; pattern mirrors `checkBudget()` in `budget.ts` |
| OPS-03 | End-to-end verification proves style capture → seed persistence → async generation → asset delivery on a local runtime | Integration test using mock executor covers wiring path; `cauldron verify assets` CLI command covers operator setup validation; full pipeline test requires real DB (Docker :5433) |
</phase_requirements>

---

## Summary

Phase 20 extends the existing `ProjectSettings` interface in `packages/shared/src/db/schema/project.ts` with a nested `asset` object, adds enforcement logic in the asset job submission path, introduces two new CLI command groups (`cauldron config` and `cauldron verify`), and delivers an E2E integration test that proves the complete v1.1 path.

The codebase already has all the infrastructure needed. The `ProjectSettings` interface is a TypeScript-typed JSONB column. The `updateSettings` tRPC mutation in `packages/web/src/trpc/routers/projects.ts` already demonstrates the merge-and-write pattern for settings. The `checkBudget()` function in `packages/engine/src/gateway/budget.ts` provides the pre-call enforcement pattern to mirror for concurrency checking. The CLI follows a consistent subcommand pattern established by `projects.ts`, `status.ts`, and others.

The largest new work is: (1) the asset settings enforcement in `submitAssetJob` and the Inngest handler, (2) the `config set` CLI command that reads/writes `ProjectSettings.asset` over the existing `updateSettings` tRPC mutation, (3) the `verify assets` CLI command that runs a connectivity and wiring smoke test, and (4) the E2E integration test that exercises the full pipeline with a mock executor. No new packages are needed.

**Primary recommendation:** Extend `ProjectSettings`, enforce at submission time in `submitAssetJob`, add a `settings` tRPC mutation extension to expose asset fields, build `config` and `verify` CLI commands over the existing tRPC layer, and write an E2E integration test with a mock executor that avoids GPU dependencies.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Drizzle ORM | 0.45 | JSONB settings read/write | Already used for all DB access |
| Vitest | 4 | Unit and integration tests | Project standard; all existing tests use it |
| `postgres` driver | current | Real DB in integration tests | Project forbids `pg` driver |
| Zod 4 | 4 | Input validation in tRPC mutations | Project standard |
| `node:util` `parseArgs` | built-in | CLI argument parsing | Used by `cli.ts` for all command dispatch |
| chalk | current | CLI output formatting | Used throughout existing CLI commands |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pino | current | Structured logging in verify command | Already wired through `bootstrap()` |
| `node:fs/promises` | built-in | Reading/writing config files | Used in `config-io.ts` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| tRPC mutation for `config set` | Direct DB from CLI | tRPC keeps all DB writes server-side per project architecture — do not bypass |
| Vitest integration test for E2E | Playwright E2E | Integration test with mock executor is faster and requires no UI; full browser E2E is out of scope |

**Installation:** No new packages needed. All required libraries are already in the monorepo.

---

## Architecture Patterns

### Recommended Project Structure

Changes span four packages:

```
packages/shared/src/db/schema/
  └── project.ts            # Extend ProjectSettings interface + add asset sub-type

packages/engine/src/asset/
  ├── types.ts              # Add AssetSettings type (mirrors ProjectSettings.asset shape)
  ├── errors.ts             # Add AssetModeDisabledError, AssetModePausedError
  ├── job-store.ts          # Enforce mode + maxConcurrentJobs in submitAssetJob
  └── __tests__/
       └── settings-enforcement.test.ts  # Unit tests for enforcement logic

packages/web/src/trpc/routers/
  └── projects.ts           # Extend updateSettings to accept asset sub-object

packages/cli/src/
  ├── commands/
  │    ├── config.ts        # cauldron config set <key> <value> --project <id>
  │    └── verify.ts        # cauldron verify [assets] [--project <id>] [--real-comfyui]
  └── cli.ts                # Register config and verify commands

packages/engine/src/asset/__tests__/
  └── e2e-pipeline.integration.test.ts  # Full pipeline with mock executor
```

### Pattern 1: ProjectSettings Extension

**What:** Add a typed nested `asset` object to the existing `ProjectSettings` interface. JSONB merging already works via the spread pattern in `updateSettings`.

**When to use:** Whenever adding new configurable project-level state.

**Example (verified from `packages/shared/src/db/schema/project.ts`):**
```typescript
// Source: packages/shared/src/db/schema/project.ts
export type AssetMode = 'active' | 'paused' | 'disabled';

export interface AssetSettings {
  mode?: AssetMode;
  runtimeUrl?: string;
  artifactsRoot?: string;
  maxConcurrentJobs?: number;
}

export interface ProjectSettings {
  models?: Partial<Record<string, string[]>>;
  budgetLimitCents?: number;
  maxConcurrentBeads?: number;
  asset?: AssetSettings;
}
```

No migration is required — this is a TypeScript interface change only. JSONB columns accept any valid JSON; adding optional keys to the TypeScript overlay does not alter the DB schema.

### Pattern 2: Pre-submission Enforcement (mirror checkBudget)

**What:** Read `ProjectSettings.asset.mode` and `asset.maxConcurrentJobs` before inserting a new asset job. Throw domain-specific errors so callers (MCP tool, future API) get clear rejection reasons.

**When to use:** Any time a project-level setting should gate job submission.

**Example (modeled after `packages/engine/src/gateway/budget.ts`):**
```typescript
// Enforcement inside submitAssetJob, before the INSERT
export async function checkAssetMode(
  db: DbClient,
  projectId: string,
): Promise<void> {
  const [project] = await db
    .select({ settings: projects.settings })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  const mode = project?.settings?.asset?.mode ?? 'active';
  if (mode === 'disabled') {
    throw new AssetModeDisabledError(projectId);
  }
  if (mode === 'paused') {
    throw new AssetModePausedError(projectId);
  }
}

export async function checkAssetConcurrency(
  db: DbClient,
  projectId: string,
): Promise<void> {
  const [project] = await db
    .select({ settings: projects.settings })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  const max = project?.settings?.asset?.maxConcurrentJobs;
  if (max == null) return; // no limit configured

  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(assetJobs)
    .where(
      and(
        eq(assetJobs.projectId, projectId),
        inArray(assetJobs.status, ['pending', 'claimed', 'active'])
      )
    );

  if (Number(count) >= max) {
    throw new AssetConcurrencyLimitError(projectId, max, Number(count));
  }
}
```

**Enforcement point decision (Claude's discretion):** Enforce at submission time (`submitAssetJob`) so callers get an immediate synchronous error. Enforcing at dispatch time in the Inngest handler is less operator-friendly because the error surfaces asynchronously in logs rather than as a CLI rejection. Submission-time enforcement matches the `checkBudget()` pattern exactly.

### Pattern 3: `config set` CLI Command

**What:** Dot-notation key → typed ProjectSettings.asset write over the existing `updateSettings` tRPC mutation. Follows `projects.ts` subcommand pattern.

**When to use:** Any CLI command that writes project configuration.

**Example structure (modeled after `packages/cli/src/commands/projects.ts`):**
```typescript
// packages/cli/src/commands/config.ts
export async function configCommand(
  client: CLIClient,
  args: string[],
  flags: { json: boolean; projectId?: string }
): Promise<void> {
  const subcommand = args[0];
  if (subcommand === 'set') {
    const key = args[1];   // e.g. "asset.mode"
    const value = args[2]; // e.g. "active"
    await configSet(client, key, value, flags);
  } else if (subcommand === 'get') {
    await configGet(client, flags);
  } else {
    printConfigUsage();
  }
}
```

The dot-notation parser maps `asset.mode` → `{ asset: { mode: value } }`, which the tRPC `updateSettings` mutation merges via the existing spread pattern.

### Pattern 4: `cauldron verify assets` Command

**What:** Standalone CLI smoke-test that proves the local asset stack is reachable and wired correctly. Structured like `healthCheck()` in `health.ts` — sequential checks with clear exit codes and human-readable output.

**Checks to run:**
1. Project exists and has settings readable
2. ComfyUI endpoint is reachable (HTTP GET to `COMFYUI_URL/system_stats`)
3. Database asset_jobs table is accessible
4. Submit a test job with mock executor, verify it reaches `pending` state
5. (Optional with `--real-comfyui` flag) Dispatch a real generation job and wait for completion

**Default behavior:** Mock wiring-only checks, no GPU required. Suitable for CI.

### Pattern 5: E2E Integration Test with Mock Executor

**What:** Vitest integration test (`.integration.test.ts`) against Docker Postgres :5433. Injects a mock executor that short-circuits ComfyUI calls. Tests the complete path: submit job → Inngest handler → poll → artifact write → completed state.

**When to use:** Phase gate and CI validation.

**Example mock executor (modeled after `packages/engine/src/asset/__tests__/events.test.ts`):**
```typescript
const mockExecutor: AssetExecutor = {
  submitJob: vi.fn().mockResolvedValue('mock-prompt-id-001'),
  checkStatus: vi.fn().mockResolvedValue({
    done: true,
    outputs: {
      images: [{ filename: 'output_00001.png', subfolder: '', type: 'output' }],
    },
  }),
  getArtifact: vi.fn().mockResolvedValue(Buffer.from('fake-image-data')),
};
```

The integration test uses `createTestDb()` and `truncateAll()` from `packages/engine/src/__tests__/setup.ts` — the same helpers used by existing integration tests.

### Anti-Patterns to Avoid

- **Bypassing tRPC for CLI DB writes:** Do not import Drizzle directly in CLI commands. All DB mutations go through the tRPC client so they use the server's auth and transaction handling. Exception: the `verify` command uses `bootstrap()` for direct health checks, not mutations.
- **Storing asset settings in cauldron.config.ts only:** The two-layer system requires DB as the authoritative runtime store; config file sets defaults but DB values override. Do not skip the DB write.
- **Throwing generic `Error` for mode violations:** Use domain-specific error classes (`AssetModeDisabledError`, `AssetModePausedError`) so callers can distinguish them and tRPC can map them to appropriate HTTP status codes.
- **Mocking DB in E2E integration test:** The E2E test must use real Postgres (Docker :5433). The mock is the executor, not the database. This follows the project's testing philosophy from `feedback_testing_mocks.md`.
- **Wildcard `export * from` for new error types:** Follow the barrel pattern — list each export explicitly in `errors.ts` and the `index.ts` barrel.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DB settings read/write | Custom JSONB utilities | Drizzle `$type<ProjectSettings>()` + spread merge | Already implemented; type-safe |
| CLI argument parsing | Custom parser | `node:util` `parseArgs` with `allowPositionals: true` | Used throughout existing CLI |
| Settings persistence | File-based config | `updateSettings` tRPC mutation (existing) | Ensures server-side validation and JSONB merge |
| Concurrent active jobs count | Manual counter | `SELECT COUNT(*) WHERE status IN ('pending','claimed','active')` | DB is source of truth; no in-memory counter |
| Integration test DB setup | Custom fixtures | `createTestDb()`, `runMigrations()`, `truncateAll()` from `engine/src/__tests__/setup.ts` | Already battle-tested |
| Mock ComfyUI executor | Full HTTP mock server | `vi.fn()` mock on `AssetExecutor` interface | Interface is already defined; pure functions are testable without HTTP |

**Key insight:** The entire settings infrastructure (JSONB column, TypeScript interface, tRPC mutation, merge pattern) already exists. This phase extends it, not replaces it.

---

## Common Pitfalls

### Pitfall 1: Missing Drizzle Import for `inArray` in Concurrency Check
**What goes wrong:** The active-job count query uses `inArray(assetJobs.status, [...])`. If `inArray` is not imported from `drizzle-orm`, TypeScript compiles but the query fails at runtime with a confusing error.
**Why it happens:** `inArray` is a less-common Drizzle operator that looks like a utility function.
**How to avoid:** Import `inArray` alongside `eq`, `and`, `sql` from `drizzle-orm` at the top of `job-store.ts`.
**Warning signs:** TypeScript error "inArray is not exported" or runtime query returning wrong results.

### Pitfall 2: Settings Not Merged — Overwrite Instead
**What goes wrong:** Writing `db.update(projects).set({ settings: input.settings })` overwrites the entire JSONB blob, erasing existing LLM budget or maxConcurrentBeads settings.
**Why it happens:** Forgetting to fetch-and-spread before writing.
**How to avoid:** Always fetch `existing.settings` first, then spread: `const merged = { ...existing.settings, ...input.settings, asset: { ...existing.settings?.asset, ...input.settings?.asset } }`.
**Warning signs:** Existing `budgetLimitCents` or `maxConcurrentBeads` settings disappear after `config set`.

### Pitfall 3: `cauldron config set` Requires tRPC Server
**What goes wrong:** `config set` tries to call `updateSettings` over tRPC but the web server is not running, causing a cryptic connection refused error.
**Why it happens:** Unlike `verify`, which can operate with only `bootstrap()` (direct DB), `config set` routes through the tRPC client which needs the Hono/Next.js server.
**How to avoid:** The CLI already handles this — `bootstrapClient()` auto-starts the dev server via `startDevServer()`. Document this clearly so the operator knows they need the server running.
**Warning signs:** `ECONNREFUSED` on `config set` calls.

### Pitfall 4: TypeScript Narrowing on JSONB `settings?.asset`
**What goes wrong:** TypeScript treats `project.settings?.asset?.mode` as `string | undefined` instead of `AssetMode | undefined` if the `$type<ProjectSettings>()` annotation is not present on the column.
**Why it happens:** The `$type<>()` call must be on the Drizzle column definition in `project.ts`, and it must use the updated `ProjectSettings` interface that includes `asset`.
**How to avoid:** Update `ProjectSettings` in `project.ts` before writing enforcement code; TypeScript will catch mismatches at compile time.
**Warning signs:** Type errors in enforcement code saying `mode` is `string` not `AssetMode`.

### Pitfall 5: E2E Test Writes to Filesystem
**What goes wrong:** `generateAssetHandler` calls `writeArtifact()` which writes real files. In a CI integration test this can leave stale files or fail on missing directory permissions.
**Why it happens:** The handler is not purely DB-driven; it also writes to `artifactsRoot`.
**How to avoid:** Use a `tmpdir`-based `artifactsRoot` in the test (following the `artifact-writer.test.ts` pattern which already uses `mkdtemp`). The `getArtifact` mock returns a `Buffer`, so `writeArtifact` will call `fs.writeFile` on the temp dir path. Clean up in `afterEach` with `rm(tmpDir, { recursive: true })`.
**Warning signs:** Tests leave `.png` and `.meta.json` files in the project tree.

### Pitfall 6: `cauldron verify` Requires `bootstrap()` Not `bootstrapClient()`
**What goes wrong:** `verify` runs health-style checks that need direct DB access and executor wiring, but `bootstrapClient()` only creates a tRPC client, not engine deps.
**Why it happens:** Most CLI commands route through tRPC; `verify` and `health` are the exceptions.
**How to avoid:** Import and call `bootstrap(projectRoot)` inside `verify.ts` (same as `serve:engine` pattern), not `bootstrapClient()`.
**Warning signs:** `verify assets` fails with "Asset dependencies not configured" because `configureAssetDeps()` was never called.

---

## Code Examples

### Extending ProjectSettings (verified from project.ts)
```typescript
// Source: packages/shared/src/db/schema/project.ts
export type AssetMode = 'active' | 'paused' | 'disabled';

export interface AssetSettings {
  mode?: AssetMode;          // Default: 'active' when absent
  runtimeUrl?: string;       // ComfyUI base URL; overrides COMFYUI_URL env var
  artifactsRoot?: string;    // Local artifacts directory; overrides .cauldron/artifacts default
  maxConcurrentJobs?: number; // Max simultaneous pending+claimed+active jobs; no limit when absent
}

export interface ProjectSettings {
  models?: Partial<Record<string, string[]>>;
  budgetLimitCents?: number;
  maxConcurrentBeads?: number;
  asset?: AssetSettings;
}
```

### Safe Settings Merge (verified from projects.ts updateSettings)
```typescript
// Source: packages/web/src/trpc/routers/projects.ts (existing pattern)
const merged = {
  ...existing.settings,
  ...input.settings,
  // Deep-merge asset sub-object explicitly to avoid clobbering sibling keys
  ...(input.settings.asset !== undefined ? {
    asset: { ...existing.settings?.asset, ...input.settings.asset }
  } : {}),
};
```

### Domain Error Classes for Asset Mode
```typescript
// packages/engine/src/asset/errors.ts (append to existing)
export class AssetModeDisabledError extends Error {
  constructor(public readonly projectId: string) {
    super(`Asset generation is disabled for project '${projectId}'`);
    this.name = 'AssetModeDisabledError';
  }
}

export class AssetModePausedError extends Error {
  constructor(public readonly projectId: string) {
    super(`Asset generation is paused for project '${projectId}'. Jobs will not be dispatched.`);
    this.name = 'AssetModePausedError';
  }
}

export class AssetConcurrencyLimitError extends Error {
  constructor(
    public readonly projectId: string,
    public readonly limit: number,
    public readonly current: number,
  ) {
    super(`Asset concurrency limit reached for project '${projectId}': ${current}/${limit} active jobs`);
    this.name = 'AssetConcurrencyLimitError';
  }
}
```

### Integration Test Setup (verified from existing pattern)
```typescript
// packages/engine/src/asset/__tests__/e2e-pipeline.integration.test.ts
import { createTestDb, runMigrations, truncateAll } from '../../__tests__/setup.js';

let testDb: ReturnType<typeof createTestDb>;
let tmpDir: string;

beforeAll(async () => {
  testDb = createTestDb();
  await runMigrations(testDb.db);
  tmpDir = await mkdtemp(join(tmpdir(), 'cauldron-e2e-'));
});

afterEach(async () => {
  await truncateAll(testDb.db);
  await rm(tmpDir, { recursive: true, force: true });
  tmpDir = await mkdtemp(join(tmpdir(), 'cauldron-e2e-'));
});

afterAll(async () => {
  await testDb.client.end();
  await rm(tmpDir, { recursive: true, force: true });
});
```

### CLI Config Command Registration (verified from cli.ts pattern)
```typescript
// packages/cli/src/cli.ts — add 'config' and 'verify' to COMMANDS array
const COMMANDS = [
  // ... existing ...
  'config',
  'verify',
] as const;

// In switch statement:
case 'config':
  await configCommand(client, commandArgs, flags);
  break;
case 'verify':
  await verifyCommand(commandArgs, flags);  // Note: uses bootstrap(), not client
  break;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Flat settings in ProjectSettings | Nested sub-objects (e.g., `asset: {}`) | This phase | Grouping keeps top-level clean; TypeScript interface enforces structure |
| All CLI commands through tRPC | verify/health bypass tRPC for direct bootstrap | Already established in health.ts | verify follows the health pattern; config follows the projects pattern |

**No deprecated APIs used.** All patterns verified against current source files.

---

## Open Questions

1. **`paused` mode behavior for already-submitted jobs**
   - What we know: D-02 says `paused` accepts jobs but does not dispatch to executor
   - What's unclear: Does `paused` affect the Inngest `handleAssetGenerate` handler? Or only `submitAssetJob`? If the handler fires for a paused project's job, should it fail, or silently succeed?
   - Recommendation: Enforce at submission time only. For paused mode, `submitAssetJob` inserts the job but does NOT fire the `inngest.send()` event. The Inngest event trigger is in `generate-image.ts`, not in `submitAssetJob` itself — but for paused mode, the MCP tool should suppress the `inngest.send()` call. This means the mode check must propagate to the call site that fires the Inngest event (currently in `handleGenerateImage` in `mcp/src/tools/generate-image.ts`). Planner should address this integration point.

2. **`config set` key parsing scope**
   - What we know: D-11 specifies dot-notation keys like `asset.mode` and `asset.maxConcurrentJobs`
   - What's unclear: Should the command validate that `asset.mode` values must be a valid `AssetMode` enum member? What error is shown for `cauldron config set asset.mode garbage`?
   - Recommendation: Validate in the CLI command before sending the tRPC mutation. Use a small lookup map: `{ 'asset.mode': z.enum(['active','paused','disabled']), 'asset.maxConcurrentJobs': z.number().int().positive() }`.

3. **`cauldron verify assets` scope without `--project`**
   - What we know: The command should be extensible, but a project ID is needed to read settings
   - What's unclear: Should it work project-agnostically (just tests ComfyUI connectivity) or always require `--project`?
   - Recommendation: Require `--project` to test full wiring including settings. Optionally allow a `--no-project` flag for basic ComfyUI connectivity check only. Planner should make the final call on this UX.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All CLI and engine code | Yes | v22.22.1 | — |
| pnpm | Monorepo scripts | Yes | 10.32.1 | — |
| Docker | Integration tests (Postgres :5433) | Yes | 29.3.1 | — |
| PostgreSQL (Docker :5433) | Integration tests | Requires `docker compose up -d` | — | Must be started before running integration tests |
| ComfyUI (:8188) | Real GPU tests only | Not checked — local hardware dep | — | Mock executor covers CI; `--real-comfyui` flag activates real path |

**Missing dependencies with no fallback:**
- None that block the standard CI path. Integration tests use Docker Postgres; unit tests and mock-executor E2E tests need no external services.

**Missing dependencies with fallback:**
- ComfyUI: not required for any CI test. The mock executor covers wiring. `--real-comfyui` flag on `verify assets` is opt-in for operator validation on GPU hardware.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4 |
| Config file | `packages/engine/vitest.config.ts` (inferred — `.integration.test.ts` excluded from default run) |
| Quick run command | `pnpm -F @get-cauldron/engine test -- src/asset/__tests__/settings-enforcement.test.ts` |
| Full suite command | `pnpm test` (unit) + `pnpm test:integration` (Docker Postgres required) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OPS-01 | ProjectSettings.asset fields are readable/writable | unit | `pnpm -F @get-cauldron/engine test -- src/asset/__tests__/settings-enforcement.test.ts` | Wave 0 |
| OPS-01 | `updateSettings` tRPC mutation accepts asset sub-object | unit | `pnpm -F @get-cauldron/web test -- src/trpc/routers/projects.test.ts` | Wave 0 |
| OPS-01 | `config set asset.mode` CLI writes DB correctly | unit (mock tRPC) | `pnpm -F @get-cauldron/cli test -- src/commands/config.test.ts` | Wave 0 |
| OPS-02 | `disabled` mode rejects job submission | unit | `pnpm -F @get-cauldron/engine test -- src/asset/__tests__/settings-enforcement.test.ts` | Wave 0 |
| OPS-02 | `paused` mode accepts job but suppresses dispatch | unit | `pnpm -F @get-cauldron/engine test -- src/asset/__tests__/settings-enforcement.test.ts` | Wave 0 |
| OPS-02 | `maxConcurrentJobs` blocks submission when limit reached | unit | `pnpm -F @get-cauldron/engine test -- src/asset/__tests__/settings-enforcement.test.ts` | Wave 0 |
| OPS-03 | Full pipeline wiring: submit → handler → mock executor → completed state | integration | `pnpm test:integration` (engine package) | Wave 0 |
| OPS-03 | `verify assets` command exits 0 when wiring is healthy | unit (mock bootstrap) | `pnpm -F @get-cauldron/cli test -- src/commands/verify.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** Run relevant unit test file (`pnpm -F @get-cauldron/engine test -- <file>`)
- **Per wave merge:** `pnpm typecheck && pnpm test && pnpm build`
- **Phase gate:** Full suite + integration tests green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/engine/src/asset/__tests__/settings-enforcement.test.ts` — covers OPS-01/OPS-02 mode and concurrency enforcement unit tests
- [ ] `packages/engine/src/asset/__tests__/e2e-pipeline.integration.test.ts` — covers OPS-03 full wiring path
- [ ] `packages/cli/src/commands/config.test.ts` — covers `config set` key parsing and tRPC call
- [ ] `packages/cli/src/commands/verify.test.ts` — covers `verify assets` output and exit codes
- [ ] `packages/web/src/trpc/routers/projects.test.ts` — may already exist; if not, covers `updateSettings` asset extension

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on This Phase |
|-----------|---------------------|
| TypeScript end-to-end | All new code in `.ts`; no JS files |
| Vercel AI SDK for model interface | Not relevant to this phase |
| OSS deps: 80%+ fit or reject | No new packages needed; all infrastructure already present |
| `postgres` driver (not `pg`) | Integration tests use `postgres` driver via `createTestDb()` |
| Drizzle ORM | All DB reads/writes through Drizzle; no raw SQL except for `sql` template tag |
| Zod 4 | tRPC mutation input validation uses Zod 4 |
| Vitest (not Jest) | All tests use Vitest |
| Do not use Express, WebSockets, `pg`, `react-flow-renderer`, `dagre` 0.8.x | Not relevant to this phase |
| tRPC for dashboard↔backend only | CLI config mutations go through tRPC; verify uses bootstrap() directly |
| Integration tests need Docker Postgres :5433; do not mock the database | E2E integration test uses real Postgres; mock is the executor only |
| Run build (not just test+typecheck) in regression gate | Phase gate includes `pnpm build` |
| `.js` extensions in all relative imports | All new relative imports must use `.js` extension |
| No `export *` wildcard for types in barrel files | New exports in `index.ts` listed explicitly |
| Inngest v4 for durable execution | `handleAssetGenerate` already uses Inngest; no changes to Inngest wiring needed |
| `cauldron.config.ts` with `defineConfig()` for project defaults | Two-layer config: `cauldron.config.ts` defaults + DB override (D-10) |

---

## Sources

### Primary (HIGH confidence)
- Direct source read: `packages/shared/src/db/schema/project.ts` — `ProjectSettings` interface, JSONB column definition
- Direct source read: `packages/engine/src/gateway/budget.ts` — `checkBudget()` enforcement pattern
- Direct source read: `packages/engine/src/gateway/config.ts` — `GatewayConfig`, `loadConfig()`, two-layer config pattern
- Direct source read: `packages/engine/src/gateway/gateway.ts` lines 128-130 — DB settings override config defaults
- Direct source read: `packages/engine/src/asset/job-store.ts` — `submitAssetJob`, all job lifecycle functions
- Direct source read: `packages/engine/src/asset/events.ts` — `generateAssetHandler`, `configureAssetDeps`
- Direct source read: `packages/engine/src/asset/types.ts` — `AssetExecutor` interface
- Direct source read: `packages/mcp/src/tools/generate-image.ts` — `handleGenerateImage`, Inngest event dispatch
- Direct source read: `packages/mcp/src/bootstrap.ts` — MCP bootstrap wiring pattern
- Direct source read: `packages/cli/src/bootstrap.ts` — `bootstrap()` wiring pattern
- Direct source read: `packages/cli/src/inngest-serve.ts` — `ENGINE_FUNCTIONS` array
- Direct source read: `packages/cli/src/cli.ts` — command dispatch pattern, `COMMANDS` array, `parseArgs` usage
- Direct source read: `packages/cli/src/config-io.ts` — `loadCLIConfig`, `saveCLIConfig`, `writeEnvVar`
- Direct source read: `packages/cli/src/commands/projects.ts` — subcommand pattern to replicate
- Direct source read: `packages/cli/src/health.ts` — `healthCheck()` sequential-checks pattern to replicate for `verify`
- Direct source read: `packages/web/src/trpc/routers/projects.ts` — `updateSettings` mutation; merge pattern
- Direct source read: `packages/web/src/trpc/router.ts` — `AppRouter` structure
- Direct source read: `packages/engine/src/asset/__tests__/events.test.ts` — mock executor pattern
- Direct source read: `packages/engine/src/__tests__/setup.ts` — `createTestDb`, `runMigrations`, `truncateAll`

### Secondary (MEDIUM confidence)
- None needed — all findings verified from source code directly.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified from source files; no new packages
- Architecture patterns: HIGH — all patterns verified against live codebase
- Pitfalls: HIGH — derived from direct source inspection of integration points
- Test architecture: HIGH — mirrors established patterns in the codebase

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (stable codebase; patterns won't drift in 30 days)
