# Phase 9: CLI - Research

**Researched:** 2026-03-27
**Domain:** Node.js CLI development, tRPC HTTP client, GitHub webhook handling, terminal UI libraries
**Confidence:** HIGH

## Summary

Phase 9 migrates the existing `packages/api` CLI from direct engine calls to a tRPC HTTP client that calls the running Next.js web server. The existing CLI has 8 commands wired to engine functions via `bootstrap()`; this phase replaces those engine wires with `@trpc/client` calls to `/api/trpc` while adding new commands (projects, costs, evolution, logs streaming, webhook setup) and a new GitHub webhook handler in the web layer.

The key architectural shift is: instead of the CLI bootstrapping a full engine dependency graph (DB, gateway, Inngest, migrations), it boots a lightweight tRPC client pointed at the web server. The web server already owns all business logic through its 5 tRPC routers. A new `packages/trpc-types` package extracts `AppRouter` type so `packages/api` can reference it without a runtime dependency on `packages/web`.

The webhook component is a separate Next.js Route Handler at `/api/webhook/git` that validates HMAC-SHA256 signatures and triggers pipeline runs via Inngest events. This is entirely server-side and follows the existing SSE route pattern.

**Primary recommendation:** Extract `AppRouter` type to `packages/trpc-types` first. Wire `@trpc/client` with `httpBatchLink` in `packages/api`. Refactor each command to call tRPC procedures. Add SSE-based streaming for `cauldron logs`. Implement the GitHub webhook Route Handler last as it is the most isolated piece.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** CLI is a tRPC HTTP client — calls the running web server's /api/trpc endpoint using @trpc/client. True zero-drift: same router, same types, single source of truth.
- **D-02:** Extract AppRouter type to a new packages/trpc-types package. Both packages/web and packages/api depend on it. Cleaner dependency graph than direct cross-package import.
- **D-03:** CLI auto-starts the Next.js dev server if localhost:3000 is not responding. Seamless UX — user doesn't need to manage server lifecycle separately.
- **D-04:** Mirror dashboard commands 1:1. Full command set: projects (list/create/archive), interview, crystallize, seal, decompose, execute, status, logs, costs, evolution, kill, resolve. Plus 'run' as convenience pipeline.
- **D-05:** 'cauldron run' exists as a convenience command that pipelines the full flow: interview -> crystallize -> seal -> decompose -> execute. Individual commands remain for advanced usage.
- **D-06:** 'cauldron interview' supports both modes: interactive terminal (default) with numbered MC options + freeform input, and --browser flag to open the dashboard interview page.
- **D-07:** 'cauldron logs' streams in real-time by default (like 'docker logs -f'). SSE-backed. '--bead <id>' filters to one bead. Ctrl+C to stop.
- **D-08:** Webhook server at Next.js Route Handler /api/webhook/git receives GitHub push events. Validates HMAC-SHA256 signature, extracts repo+branch+commit, finds matching project, triggers pipeline.
- **D-09:** GitHub-only for v1. GitLab/Bitbucket deferred to v2.
- **D-10:** Setup via 'cauldron webhook setup <project-id>' which prints the webhook URL and generates a secret.
- **D-11:** When a push arrives for a project mid-pipeline, queue the event. When current pipeline finishes, check if new commit invalidates result. If yes, re-run. CLI shows 'pipeline queued behind active run'.
- **D-12:** Colored text + tables as default output. Tables for status/costs/evolution. --json flag for machine-readable output. Spinner for long operations.
- **D-13:** 'cauldron logs' renders prefixed lines: [bead-name] in distinct colors per bead. Multiple beads interleave. Like 'docker compose logs'.
- **D-14:** Extend existing cauldron.config.ts with a 'cli' section. Server URL, webhook secret, API key, project-to-repo mapping. Single config file for the whole platform.
- **D-15:** API key authentication. CLI sends key in Authorization header. Prevents accidental cross-project calls. Key stored in cauldron.config.ts cli.apiKey.
- **D-16:** Auto-generate API key on first CLI run via node:crypto. Store in cauldron.config.ts and server env. Seamless setup with no manual steps.
- **D-17:** Publish as @cauldron/cli to npm. Users install globally with 'npm i -g @cauldron/cli'. Requires npm publishing infrastructure.

### Claude's Discretion
- Terminal UI library choice for colors/tables/spinners (chalk, ora, cli-table3, or built-in)
- Exact flag naming conventions (--json, --follow, --bead, --browser, etc.)
- Error message formatting
- How 'cauldron run' reports progress between pipeline stages
- Webhook secret storage mechanism (env var vs config file)

### Deferred Ideas (OUT OF SCOPE)
- GitLab/Bitbucket webhook support — v2
- Standalone binary distribution (pkg/esbuild) — v2/OSS release
- Multi-user auth (OAuth, session tokens) — v2 when remote deployment supported
- 'cauldron deploy' command — explicitly out of scope per PROJECT.md
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CLI-01 | All pipeline operations available via CLI (start interview, trigger execution, check status, approve holdouts) | tRPC client pattern maps all 5 routers to CLI commands; existing 8-command surface extended to full set |
| CLI-02 | Git-push triggered pipeline runs (webhook listener) | GitHub webhook HMAC validation with node:crypto; Next.js Route Handler at /api/webhook/git; @octokit/webhooks-methods for signature verification |
| CLI-03 | CLI and web dashboard share the same API layer (tRPC) | packages/trpc-types exports AppRouter type; @trpc/client httpBatchLink calls /api/trpc endpoint; zero schema drift |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@trpc/client` | 11.15.1 | HTTP client for tRPC procedures | Already in packages/web at this version; exact match avoids type incompatibility with AppRouter type |
| `chalk` | 5.6.2 | ANSI colors for CLI output | ESM-native; zero-dependency; most widely used Node.js color lib; supports template literals |
| `ora` | 9.3.0 | Terminal spinners | ESM-only; wraps Node.js streams cleanly; pairs with chalk; well-maintained |
| `cli-table3` | 0.6.5 | ASCII table rendering | Stable, actively maintained fork of cli-table; colSpan, align, and color support |
| `tsx` | 4.21.0 | TypeScript execution for CLI entrypoint | Already in project; zero build step for development; keep for CLI package |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@octokit/webhooks-methods` | 6.0.0 | GitHub HMAC-SHA256 webhook signature verification | Route Handler for /api/webhook/git — use `verify()` instead of rolling node:crypto manually |
| `node:crypto` (built-in) | Node.js built-in | API key generation on first run | `randomBytes(32).toString('hex')` — 64-char hex key; already used in project for holdout encryption |
| `node:child_process` (built-in) | Node.js built-in | Auto-start Next.js dev server (D-03) | `spawn('pnpm', ['dev'], { detached: true })` in packages/web |
| `eventsource` | 4.1.0 | SSE client for `cauldron logs` streaming | Standard EventSource polyfill for Node.js; EventSource is not in Node.js natively below v22 |

**Version verification:** All versions confirmed via `npm view [package] version` on 2026-03-27.

**Installation:**
```bash
# In packages/cli (new package)
pnpm add @trpc/client chalk ora cli-table3 eventsource
pnpm add @octokit/webhooks-methods  # In packages/web (webhook handler)
```

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `chalk` | `picocolors` | picocolors is 5x smaller but lacks template literals; chalk is more ergonomic for bead-colored log prefixes |
| `cli-table3` | `console.table` | console.table is built-in but cannot apply ANSI colors per cell — needed for HZD teal/amber/red status display |
| `eventsource` | `fetch` with manual SSE parsing | fetch SSE parsing is ~30 lines of brittle stream handling; eventsource gives reconnect, Last-Event-ID, and event name parsing for free |
| `@octokit/webhooks-methods` | `node:crypto` manual | Manual HMAC is 8 lines but error-prone (timing attack if using `===` instead of `timingSafeEqual`); @octokit/webhooks-methods handles this correctly |

## Architecture Patterns

### Recommended Project Structure
```
packages/
├── trpc-types/                   # NEW — shared type-only package
│   ├── package.json              # "name": "@cauldron/trpc-types", type-only exports
│   └── src/
│       └── index.ts              # re-exports AppRouter type from packages/web
packages/api/
├── src/
│   ├── cli.ts                    # REFACTOR — tRPC client wiring, server auto-start
│   ├── trpc-client.ts            # NEW — createTRPCClient factory + auth header injection
│   ├── server-check.ts           # NEW — isServerRunning(), startDevServer()
│   ├── config-io.ts              # NEW — read/write cauldron.config.ts cli section
│   ├── commands/
│   │   ├── interview.ts          # REFACTOR — tRPC client replaces FSM bootstrap
│   │   ├── crystallize.ts        # REFACTOR
│   │   ├── seal.ts               # REFACTOR
│   │   ├── decompose.ts          # REFACTOR
│   │   ├── execute.ts            # REFACTOR
│   │   ├── status.ts             # REFACTOR
│   │   ├── kill.ts               # REFACTOR
│   │   ├── resolve.ts            # REFACTOR
│   │   ├── projects.ts           # NEW — list/create/archive
│   │   ├── logs.ts               # NEW — SSE streaming
│   │   ├── costs.ts              # NEW — costs table
│   │   ├── evolution.ts          # NEW — evolution summary
│   │   ├── webhook.ts            # NEW — webhook setup helper
│   │   └── run.ts                # NEW — convenience pipeline
packages/web/
├── src/app/api/
│   ├── trpc/[trpc]/route.ts      # EXTEND — add Authorization header check
│   └── webhook/
│       └── git/
│           └── route.ts          # NEW — GitHub push webhook handler
```

### Pattern 1: tRPC Client Factory with Auth Header

The CLI needs to send an API key on every request. The tRPC `httpBatchLink` accepts a `headers` callback for this.

```typescript
// packages/api/src/trpc-client.ts
// Source: @trpc/client docs, httpBatchLink headers option
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@cauldron/trpc-types';

export function createCLIClient(serverUrl: string, apiKey: string) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${serverUrl}/api/trpc`,
        headers() {
          return { Authorization: `Bearer ${apiKey}` };
        },
      }),
    ],
  });
}
```

**Confidence:** HIGH — this is the standard tRPC v11 Node.js client pattern, matching how `packages/web/src/trpc/client.tsx` uses httpBatchLink.

### Pattern 2: packages/trpc-types — Type-Only Package

The `AppRouter` type lives in `packages/web/src/trpc/router.ts`. To share it with `packages/api` without a runtime dependency on the Next.js package:

```typescript
// packages/trpc-types/src/index.ts
// Type-only re-export — no runtime code
export type { AppRouter } from '@cauldron/web/src/trpc/router';
```

**Critical constraint:** `package.json` must mark this as a type-only package with `"types"` field pointing at the index. The package has zero runtime dependencies — it is purely a TypeScript type bridge.

```json
// packages/trpc-types/package.json
{
  "name": "@cauldron/trpc-types",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "types": "./src/index.ts"
}
```

**Confidence:** HIGH — this is the standard monorepo pattern for sharing tRPC router types without creating circular runtime dependencies.

### Pattern 3: Server Auto-Start (D-03)

```typescript
// packages/api/src/server-check.ts
import { spawn } from 'node:child_process';

export async function isServerRunning(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/api/trpc/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function startDevServer(webPackageDir: string): Promise<void> {
  const proc = spawn('pnpm', ['dev'], {
    cwd: webPackageDir,
    detached: true,
    stdio: 'ignore',
  });
  proc.unref(); // Don't block CLI process on server lifecycle
  // Poll until healthy (max 30s)
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (await isServerRunning('http://localhost:3000')) return;
  }
  throw new Error('Dev server did not start within 30s');
}
```

**Warning:** `proc.unref()` is critical. Without it the CLI process will not exit when the command completes — it will keep waiting for the spawned server.

**Confidence:** HIGH — standard Node.js pattern. `spawn` with `detached: true` + `unref()` is the canonical background-process pattern.

### Pattern 4: SSE Streaming for `cauldron logs`

The existing SSE endpoint at `/api/events/[projectId]` polls DB every 2 seconds and emits `pipeline` events. The CLI must consume this using the `eventsource` package (Node.js does not have native EventSource below v22).

```typescript
// packages/api/src/commands/logs.ts
import EventSource from 'eventsource';

export async function logsCommand(projectId: string, beadFilter?: string): Promise<void> {
  const url = `http://localhost:3000/api/events/${projectId}`;
  const es = new EventSource(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  es.addEventListener('pipeline', (event) => {
    const payload = JSON.parse(event.data) as PipelineEvent;
    if (beadFilter && payload.beadId !== beadFilter) return;
    const beadName = payload.beadId?.slice(0, 8) ?? 'system';
    const color = getBeadColor(beadName); // deterministic per bead
    console.log(chalk[color](`[${beadName}]`) + ` ${payload.type}: ${JSON.stringify(payload.payload)}`);
  });

  process.on('SIGINT', () => {
    es.close();
    process.exit(0);
  });

  // Keep process alive — EventSource loop does this naturally
}
```

**SSE event format from existing route:** `{ id, projectId, seedId, beadId, type, payload, sequenceNumber, createdAt }` as JSON in the `data` field, event name `pipeline`, id is `sequenceNumber`.

**Confidence:** HIGH — verified by reading `/packages/web/src/app/api/events/[projectId]/route.ts`.

### Pattern 5: GitHub Webhook HMAC Validation

```typescript
// packages/web/src/app/api/webhook/git/route.ts
import { verify } from '@octokit/webhooks-methods';

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get('x-hub-signature-256') ?? '';
  const secret = process.env['GITHUB_WEBHOOK_SECRET'];
  if (!secret) return Response.json({ error: 'Webhook not configured' }, { status: 500 });

  const valid = await verify(secret, body, sig);
  if (!valid) return Response.json({ error: 'Invalid signature' }, { status: 401 });

  const event = req.headers.get('x-github-event');
  if (event !== 'push') return Response.json({ ok: true }); // ignore non-push events

  const payload = JSON.parse(body) as GitHubPushPayload;
  // Find project by repo URL + branch, trigger pipeline
  // ...
}
```

**Confidence:** HIGH — HMAC-SHA256 with `timingSafeEqual` is well-documented; `@octokit/webhooks-methods` is the official GitHub-maintained library for this exact purpose.

### Pattern 6: API Key Authentication in tRPC Context

The existing `createTRPCContext` in `packages/web/src/trpc/init.ts` currently returns only `{ db }`. To support auth, extend it:

```typescript
// packages/web/src/trpc/init.ts (extended)
export const createTRPCContext = cache(async (opts?: { req?: Request }) => {
  const apiKey = opts?.req?.headers.get('authorization')?.replace('Bearer ', '');
  const expectedKey = process.env['CAULDRON_API_KEY'];
  // If no key configured, allow all (dev mode). If configured, enforce.
  const authenticated = !expectedKey || apiKey === expectedKey;
  return { db, authenticated };
});
```

For v1, since this is a single-user local tool, a simple `process.env['CAULDRON_API_KEY']` check is sufficient. Multi-user auth is deferred to v2.

**Confidence:** HIGH — standard tRPC context pattern; matches how existing context is structured.

### Anti-Patterns to Avoid

- **Importing `@cauldron/engine` or `@cauldron/shared` from the new CLI commands.** After the tRPC migration, CLI commands must not bootstrap engine dependencies. All data goes through the web server. If a command needs a capability not yet in the tRPC routers, add a tRPC procedure — do not bypass through direct engine calls.
- **Putting `AppRouter` type directly in `packages/shared`.** `packages/shared` contains Drizzle schema and DB client — mixing tRPC types there creates architectural noise. The dedicated `packages/trpc-types` maintains clean separation.
- **Using native `fetch` for SSE.** Node.js fetch streams require manual SSE frame parsing (split on `\n\n`, extract `data:` fields, handle multi-line data). The `eventsource` package handles this, plus reconnect and `Last-Event-ID` tracking.
- **Using chalk v4.** Chalk v5 is ESM-only. The project uses `"type": "module"` throughout. Do not install chalk v4 (CommonJS).
- **Storing the webhook secret only in cauldron.config.ts.** The Next.js Route Handler runs in the web server process. It cannot read `cauldron.config.ts` at runtime unless explicitly loaded. Store the secret in `process.env['GITHUB_WEBHOOK_SECRET']` and let the CLI's webhook setup command write it to `.env`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GitHub webhook HMAC-SHA256 verification | Manual `node:crypto.createHmac` comparison | `@octokit/webhooks-methods verify()` | Timing-safe comparison, correct prefixing (`sha256=`), handles both Buffer and string payloads |
| Terminal spinner | Custom `setInterval` + stdout writes | `ora` | Handles cursor control, cleanup on Ctrl-C, TTY detection (auto-disables in CI) |
| ASCII tables with ANSI colors | Manual string padding + chalk | `cli-table3` | Column width calculation, border drawing, color support already built in |
| SSE client parsing | Manual `fetch` stream reader + frame parser | `eventsource` | Reconnect logic, Last-Event-ID, multi-line data, EventSource spec compliance |

**Key insight:** SSE frame parsing is deceptively complex — data fields can span multiple lines, comments (`:`-prefixed) must be ignored, retry fields must be honored. The eventsource package implements the full W3C spec.

## Common Pitfalls

### Pitfall 1: tRPC Type Incompatibility Across Package Boundaries

**What goes wrong:** `packages/api` imports `AppRouter` type from `packages/trpc-types`, which re-exports from `packages/web`. If `packages/web` is not included in `packages/api`'s TypeScript `references` array (tsconfig project references), `tsc` will fail to resolve the type chain, even though runtime is fine.

**Why it happens:** TypeScript project references require explicit declaration of which packages a package depends on for type resolution.

**How to avoid:** Add `packages/web` to `packages/api`'s `tsconfig.json` `references` array. Also add `packages/trpc-types` once that package exists. Verify with `pnpm typecheck` in the root before committing.

**Warning signs:** `Type 'AppRouter' is not assignable to...` or `Cannot find module '@cauldron/trpc-types'` errors.

### Pitfall 2: Chalk ESM Import in Node.js Script Context

**What goes wrong:** Chalk v5 is ESM-only. If any command file uses `require('chalk')` or the tsconfig targets CommonJS, chalk fails to import.

**Why it happens:** The project uses `"type": "module"` and TypeScript with `moduleResolution: "node16"`. This is correct. The pitfall is accidentally importing chalk from a CommonJS context (e.g., a `.cjs` file or a test that doesn't use `"type": "module"`).

**How to avoid:** Ensure `packages/cli/package.json` (or wherever chalk is used) has `"type": "module"`. Vitest tests in this package must use the ESM config.

**Warning signs:** `Error [ERR_REQUIRE_ESM]: require() of ES Module...`

### Pitfall 3: `httpBatchLink` Batches Multiple Requests — SSE Cannot Be Batched

**What goes wrong:** `cauldron logs` connects to `/api/events/[projectId]` — this is NOT a tRPC endpoint. It's a plain Route Handler that streams SSE. Using the tRPC client for it will fail because tRPC has no concept of streaming responses in v11 client (streaming is via AI SDK, not tRPC).

**Why it happens:** Developers assume tRPC handles all server communication. The SSE logs endpoint is separate from the tRPC batch link.

**How to avoid:** The `logs` command uses `eventsource` directly to `/api/events/[projectId]`, bypassing the tRPC client entirely. The tRPC client is only for `/api/trpc` procedures.

**Warning signs:** Trying to add a `logs.stream` tRPC procedure — do not do this.

### Pitfall 4: Auto-Start Server Race Condition

**What goes wrong:** `cauldron interview` auto-starts the Next.js dev server, but the server takes 3-8 seconds to be ready. If the CLI sends tRPC calls before the server finishes hydration, it gets connection refused errors that look like server failures.

**Why it happens:** The health check polls `/api/trpc/health` — but Next.js starts HTTP before all route handlers are compiled. The `health` procedure returns `{ status: 'ok' }` but subsequent procedures may still be unavailable.

**How to avoid:** Poll with a retry backoff (500ms intervals, 60 retries = 30s max). Use the tRPC `health` query specifically. Accept that the first-launch UX will have a brief spinner.

**Warning signs:** `TRPC_CLIENT_ERROR: Failed to fetch` on first run even after health check passes.

### Pitfall 5: Webhook Secret — cauldron.config.ts Cannot Be Read By Web Server

**What goes wrong:** `cauldron.config.ts` is loaded by the engine via `loadConfig(projectRoot)`. This works when CLI and engine run in the same process. But the Next.js web server runs from `packages/web` and does not call `loadConfig()` — it uses `process.env`. The webhook Route Handler will not find the secret if it is only in `cauldron.config.ts`.

**Why it happens:** There are two runtime processes: the web server and the CLI. Config file reading is a CLI concern; environment variables are how the web server receives config.

**How to avoid:** The `cauldron webhook setup` command writes the generated secret to `.env` (in the project root) in addition to `cauldron.config.ts`. The web server reads `GITHUB_WEBHOOK_SECRET` from `process.env`. The CLI stores it under `config.cli.webhookSecret` for reference only.

**Warning signs:** Webhook signature verification always failing even with correct secret.

### Pitfall 6: `spawn` Without `unref()` Keeps CLI Alive

**What goes wrong:** When the CLI auto-starts the dev server via `spawn(..., { detached: true })`, if `proc.unref()` is not called, the CLI process will stay alive waiting for the spawned child to exit — even after the command completes.

**Why it happens:** Node.js keeps its event loop alive for any unref'd child processes.

**How to avoid:** Always call `proc.unref()` immediately after `spawn` when starting background servers. Verified pattern in Node.js docs.

**Warning signs:** CLI command completes but process does not return to shell prompt.

## Code Examples

Verified patterns from official sources and existing codebase:

### tRPC v11 Standalone Node.js Client
```typescript
// Source: @trpc/client docs, confirmed matching packages/web/src/trpc/client.tsx pattern
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@cauldron/trpc-types';

const client = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/api/trpc',
      headers() {
        return { Authorization: `Bearer ${process.env['CAULDRON_API_KEY']}` };
      },
    }),
  ],
});

// Call any tRPC procedure
const projects = await client.projects.list.query();
const project = await client.projects.create.mutate({ name: 'My Project' });
```

### Chalk v5 (ESM) Colored Output
```typescript
// Source: chalk v5 README (ESM-only)
import chalk from 'chalk';

// HZD color palette mapping
const STATUS_COLORS = {
  completed: chalk.hex('#00d4aa'),   // teal
  active: chalk.hex('#f59e0b'),      // amber
  failed: chalk.hex('#ef4444'),      // red
  pending: chalk.hex('#6b7280'),     // gray
  claimed: chalk.hex('#3b82f6'),     // blue
};

function colorStatus(status: string): string {
  const colorFn = STATUS_COLORS[status as keyof typeof STATUS_COLORS] ?? chalk.white;
  return colorFn(status.toUpperCase());
}
```

### ora v9 Spinner with Async Operation
```typescript
// Source: ora v9 README
import ora from 'ora';

const spinner = ora('Generating first interview question...').start();
try {
  const result = await client.interview.sendAnswer.mutate({ projectId, answer });
  spinner.succeed('Question generated');
  return result;
} catch (err) {
  spinner.fail('Failed to generate question');
  throw err;
}
```

### cli-table3 Status Table with Colors
```typescript
// Source: cli-table3 README
import Table from 'cli-table3';
import chalk from 'chalk';

const table = new Table({
  head: [
    chalk.cyan('Title'),
    chalk.cyan('Status'),
    chalk.cyan('Agent'),
    chalk.cyan('Duration'),
  ],
});
for (const row of beads) {
  table.push([row.title, colorStatus(row.status), row.agent ?? '-', row.duration]);
}
console.log(table.toString());
```

### GitHub HMAC Webhook Verification
```typescript
// Source: @octokit/webhooks-methods README
import { verify } from '@octokit/webhooks-methods';

export async function POST(req: Request) {
  const body = await req.text(); // Must use text(), not json() — signature covers raw body
  const signature = req.headers.get('x-hub-signature-256') ?? '';
  const secret = process.env['GITHUB_WEBHOOK_SECRET']!;
  const isValid = await verify(secret, body, signature);
  if (!isValid) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  // proceed with payload = JSON.parse(body)
}
```

### API Key Generation (node:crypto)
```typescript
// Source: Node.js docs, node:crypto randomBytes
import { randomBytes } from 'node:crypto';

function generateApiKey(): string {
  return randomBytes(32).toString('hex'); // 64-char hex string
}
```

### packages/trpc-types Package Structure
```typescript
// packages/trpc-types/src/index.ts
// Type-only export — no runtime code, no imports executed at runtime
export type { AppRouter } from '../../web/src/trpc/router.js';
```

Note: the `.js` extension is required by Node16 moduleResolution even for `.ts` source files, consistent with existing project patterns (confirmed in STATE.md decision log).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CLI calls engine functions directly (bootstrap + DB + gateway) | CLI calls tRPC HTTP client → web server handles engine calls | Phase 9 migration | CLI no longer needs DB credentials or API keys directly |
| Separate CLI and web API contracts | Shared `AppRouter` type via `packages/trpc-types` | Phase 9 migration | Compile-time guarantee of zero schema drift |
| `console.table()` for status display | `cli-table3` with chalk colors | Phase 9 | ANSI-colored tables matching HZD aesthetic |
| No webhook support | GitHub push webhook at `/api/webhook/git` | Phase 9 | Git-push-triggered pipeline runs |

**Deprecated/outdated after this phase:**
- Direct `bootstrap()` calls in interview/crystallize/decompose/execute/seal/resolve commands — replaced by tRPC client calls
- Direct DB queries in `status.ts` — replaced by `client.execution.getProjectDAG.query()` and `client.execution.getBeadDetail.query()`

## Open Questions

1. **Interview command tRPC vs engine FSM**
   - What we know: The existing `interview.ts` command uses `InterviewFSM` directly with real-time terminal interaction. The `interview.sendAnswer` tRPC procedure records the answer to DB but runs LLM scoring asynchronously via the engine (per comment in interview tRPC router).
   - What's unclear: Does `cauldron interview` in the new CLI call `sendAnswer` and then poll for the next question via SSE? Or does it still use the FSM directly?
   - Recommendation: D-06 says "interactive terminal with numbered MC options + freeform input" — the FSM provides this. However D-01 says CLI is a tRPC HTTP client. The resolution: `cauldron interview` calls `interview.sendAnswer` then polls `interview.getTranscript` for the next question (via SSE or polling). This is consistent with how the web dashboard works. The existing FSM-direct approach bypasses the async scoring pipeline. **The planner should design the interview command as: send answer via tRPC, wait for SSE `interview_turn_complete` event, display next question.**

2. **cauldron.config.ts `cli` section schema**
   - What we know: D-14 says extend with `serverUrl`, `webhookSecret`, `apiKey`, `projectToRepo` mapping. The existing `defineConfig` function in `@cauldron/engine/gateway` parses the config.
   - What's unclear: Does the `defineConfig` function need to be updated to accept and validate the `cli` section, or is the cli section read separately?
   - Recommendation: Add `cli` as an optional field to `defineConfig`'s config schema. Parse it in a new `loadCLIConfig()` function in `packages/api`. The engine `GatewayConfig` type should not be polluted with CLI concerns.

3. **Auth enforcement mode**
   - What we know: D-15 requires API key authentication. D-16 auto-generates on first run. The web server's `createTRPCContext` currently has no auth.
   - What's unclear: In dev mode (local only), should auth be enforced? If the server runs locally and the CLI runs locally, the security value of API key auth is mainly preventing cross-project accidents.
   - Recommendation: Make auth optional by convention — if `CAULDRON_API_KEY` env var is not set in the web server, all requests are allowed (dev mode). If set, enforce. This matches the pattern used by many local dev tools (Inngest dev server, etc.).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | CLI runtime | ✓ | (system Node.js) | — |
| pnpm | Package manager | ✓ | (workspace) | — |
| Next.js dev server (port 3000) | CLI tRPC client | Conditional | 16.2.1 | Auto-start via D-03 |
| PostgreSQL (port 5432) | Web server (not CLI directly) | ✓ (Docker Compose) | 15.x | `docker compose up -d postgres` |
| Inngest dev server (port 8288) | execute command | ✓ (Docker Compose) | — | `docker compose up -d inngest` |

**Note:** After Phase 9, the CLI only needs the web server to be running. It no longer needs direct PostgreSQL or Inngest access. The web server orchestrates those dependencies. The `cauldron health` command should be updated to check only `localhost:3000` after this migration.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.1 |
| Config file | `packages/api/vitest.config.ts` (existing) |
| Quick run command | `pnpm --filter @cauldron/api test` |
| Full suite command | `pnpm --filter @cauldron/api test && pnpm --filter @cauldron/web test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLI-01 | All pipeline operations callable via tRPC client | unit | `pnpm --filter @cauldron/api test -- trpc-client` | ❌ Wave 0 |
| CLI-01 | `projects list` renders table output | unit | `pnpm --filter @cauldron/api test -- commands/projects` | ❌ Wave 0 |
| CLI-01 | `cauldron logs` closes on SIGINT | unit | `pnpm --filter @cauldron/api test -- commands/logs` | ❌ Wave 0 |
| CLI-02 | GitHub webhook HMAC verification accepts valid signature | unit | `pnpm --filter @cauldron/web test -- webhook` | ❌ Wave 0 |
| CLI-02 | GitHub webhook HMAC verification rejects invalid signature | unit | `pnpm --filter @cauldron/web test -- webhook` | ❌ Wave 0 |
| CLI-03 | AppRouter type is importable from packages/trpc-types | unit (tsc) | `pnpm --filter @cauldron/trpc-types typecheck` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @cauldron/api test`
- **Per wave merge:** `pnpm --filter @cauldron/api test && pnpm --filter @cauldron/web test && pnpm typecheck`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/api/src/trpc-client.test.ts` — covers CLI-03 (client factory, auth header injection)
- [ ] `packages/api/src/commands/projects.test.ts` — covers CLI-01 (projects list/create/archive)
- [ ] `packages/api/src/commands/logs.test.ts` — covers CLI-01 (SSE connection, SIGINT cleanup)
- [ ] `packages/web/src/app/api/webhook/git/route.test.ts` — covers CLI-02 (HMAC verification)
- [ ] `packages/trpc-types/src/index.test-d.ts` — covers CLI-03 (TypeScript type export validation)

## Sources

### Primary (HIGH confidence)
- Existing codebase: `packages/api/src/cli.ts` — 8-command parseArgs pattern, all current commands
- Existing codebase: `packages/web/src/trpc/router.ts` — 5 routers, AppRouter type export
- Existing codebase: `packages/web/src/trpc/client.tsx` — httpBatchLink, createTRPCClient pattern
- Existing codebase: `packages/web/src/app/api/events/[projectId]/route.ts` — SSE format, event shape
- npm registry (verified 2026-03-27): chalk@5.6.2, ora@9.3.0, cli-table3@0.6.5, eventsource@4.1.0, @octokit/webhooks-methods@6.0.0

### Secondary (MEDIUM confidence)
- @trpc/client v11 docs — httpBatchLink with headers callback
- @octokit/webhooks-methods README — `verify()` function for HMAC-SHA256
- chalk v5 README — ESM-only import pattern
- ora v9 README — spinner API

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified via npm registry on 2026-03-27; patterns verified against existing codebase
- Architecture: HIGH — derived from reading all canonical reference files listed in CONTEXT.md
- Pitfalls: HIGH — each pitfall is grounded in observed patterns from the STATE.md decision log or existing code

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (stable ecosystem; tRPC v11 unlikely to change)
