# Phase 19: Local Image MCP & App Delivery - Research

**Researched:** 2026-03-31
**Domain:** Model Context Protocol (MCP) TypeScript server, monorepo package scaffolding, async artifact delivery
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Standalone stdio MCP server process — not embedded in CLI Hono server. Launched by clients (Claude Code, Cursor, etc.) via their MCP configuration
- **D-02:** New `@get-cauldron/mcp` package in the monorepo. Depends on engine + shared. Has its own bin entry for stdio launch
- **D-03:** Uses `@modelcontextprotocol/sdk` (official MCP TypeScript SDK) for protocol framing, tool registration, and JSON-RPC transport
- **D-04:** MCP server imports engine functions directly (submitAssetJob, getAssetJob, etc.) and the shared DB layer — calls through engine API, not HTTP to CLI server. Requires bootstrap wiring similar to how CLI does it
- **D-05:** Requires Inngest dev server running for generation. MCP sends Inngest events to trigger generation (same flow as CLI/web)
- **D-06:** Registered as `npx @get-cauldron/mcp` (or `pnpm` equivalent) bin entry for MCP client configuration
- **D-07:** Auto-detects project from cwd — scans upward for project markers (cauldron.config.ts, .cauldron/). Resolves projectId from DB. Falls back to error if not in a Cauldron project
- **D-08:** Four MCP tools exposed: `generate-image`, `check-job-status`, `get-artifact`, `list-jobs`
- **D-09:** `generate-image` — submits async generation, returns job handle immediately
- **D-10:** `check-job-status` — returns status enum, timestamps, and estimated progress (based on elapsed time vs typical generation time)
- **D-11:** `get-artifact` — returns file path + provenance metadata, with optional base64 image data if client requests it via a flag
- **D-12:** `list-jobs` — returns last 50 jobs across all projects by default, filterable by status, with project name in each result. Simple offset pagination
- **D-13:** Expose an MCP resource for job status subscriptions. Clients that support resource subscriptions can watch for status changes instead of polling
- **D-14:** Extended request fields beyond Phase 18 base: `styleGuidance` (free-text style direction), `referenceImages` (array of file paths), `intendedUse` (enum: hero-image, icon, texture, avatar, background, other), `destination` (target delivery path)
- **D-15:** `styleGuidance` is a separate field composed into the prompt by the MCP layer (prepend/append). Both values stored separately in provenance for clean content/style separation
- **D-16:** Smart defaults from `intendedUse` — e.g., icon → 512x512 + higher steps, hero-image → 1024x768 + standard steps. User can override any default
- **D-17:** Copy-based delivery — completed image copied from `.cauldron/artifacts/{jobId}/` to destination path. Both copies exist; artifact dir is source of truth, destination is the deliverable
- **D-18:** Provenance JSON sidecar stays in `.cauldron/artifacts/{jobId}/` only — not copied to destination. Keeps destination clean
- **D-19:** Create destination directory recursively (mkdir -p) if it doesn't exist
- **D-20:** Delivery happens automatically when a job with a destination completes — the Inngest function's collect-artifacts step also copies to destination. No second call needed

### Claude's Discretion

- MCP tool description text and parameter descriptions (should be clear enough for LLM tool-use)
- Exact style composition strategy (prepend vs append vs template)
- Estimated progress calculation method (simple elapsed/typical ratio is fine)
- Internal polling interval for estimated progress
- Resource subscription implementation details for notification

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MCP-01 | Cauldron exposes a local image-generation MCP surface backed by the project-owned FLUX.2 dev runtime | New `@get-cauldron/mcp` package with McpServer + StdioServerTransport. bootstrap() wires asset deps same as CLI. Tools call into existing engine functions. |
| MCP-02 | Apps and build agents can request assets with structured inputs including prompt, style guidance, references, aspect/size, destination, and intended use | `generate-image` tool Zod schema with all fields. intendedUse enum drives smart defaults. styleGuidance composed into final prompt before submitAssetJob(). destination stored in extras for delivery. |
| MCP-03 | MCP responses return job identifiers and retrieval handles suitable for async workflows | `generate-image` returns {jobId, status, duplicate} immediately. `check-job-status` returns status + elapsed progress. All tools return structured JSON as tool content. |
| MCP-04 | Completed generations can be written into the target app workspace or a declared artifact directory with provenance metadata attached | Extend collect-artifacts step in events.ts: when job.extras.destination is set, copy completed image to destination path (mkdir -p first). Sidecar stays in .cauldron/artifacts/. |
</phase_requirements>

---

## Summary

Phase 19 builds a new `@get-cauldron/mcp` monorepo package that exposes the Phase 18 async asset generation system through a stable stdio MCP server. The server uses `@modelcontextprotocol/sdk` v1.29.0 to register four tools (`generate-image`, `check-job-status`, `get-artifact`, `list-jobs`) and one resource for job status subscriptions. Bootstrap is a direct mirror of the CLI's bootstrap pattern — same `configureAssetDeps()` call, same DB wiring, same Inngest client.

The key new work in this phase breaks into three areas: (1) the MCP package scaffold and stdio server entry point, (2) the four tool handlers that delegate to existing engine functions with new extended input fields, and (3) the artifact delivery extension in `events.ts` — specifically the `collect-artifacts` Inngest step, which must copy the completed image to `extras.destination` when that field is set. The `styleGuidance` composition and `intendedUse` smart defaults are pure MCP-layer logic with no changes needed to Phase 18 types.

The MCP resource for job status subscriptions (D-13) follows the protocol's `resources/subscribe` / `notifications/resources/updated` flow. The high-level `McpServer` class from the SDK handles subscription tracking automatically; the server calls `server.server.sendResourceUpdated({ uri })` to push notifications. This is forward-looking infrastructure — not all clients support resource subscriptions yet, but the SDK surface is there.

**Primary recommendation:** Mirror the CLI package structure exactly. Use `McpServer` + `StdioServerTransport` from `@modelcontextprotocol/sdk`. Never write to stdout — only stderr — in the stdio process. Extend the Inngest `collect-artifacts` step (not a separate function) for destination delivery.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@modelcontextprotocol/sdk` | 1.29.0 | MCP protocol framing, tool/resource registration, stdio transport | Official MCP TypeScript SDK — locked by D-03 |
| `@get-cauldron/engine` | workspace:* | Asset job functions (submitAssetJob, getAssetJob, etc.), bootstrap deps | Phase 18 engine — locked by D-04 |
| `@get-cauldron/shared` | workspace:* | DB client, schema, ensureMigrations | Shared DB layer — same as all packages |
| `zod` | ^4.3.6 | Tool input schema validation | Project standard — all packages use Zod 4 |
| `pino` | ^10.3.1 | Structured logging (to stderr in stdio server) | Project standard logger |
| `dotenv` | ^16.4.0 | Load .env at startup | Project standard — CLI does the same |
| `inngest` | ^4.1.0 | Inngest client for sending asset/generate.requested events | Same client as CLI/engine |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:fs/promises` | built-in | mkdir -p for destination dir, copyFile for delivery | Delivery step only |
| `node:path` | built-in | Resolve destination paths | All file operations |

**Installation:**

```bash
# From monorepo root — add to new packages/mcp/
pnpm add @modelcontextprotocol/sdk zod pino dotenv inngest drizzle-orm postgres
pnpm add -D typescript @types/node vitest
```

**Version verification:**

```
@modelcontextprotocol/sdk — npm registry: 1.29.0 (verified 2026-03-31)
```

---

## Architecture Patterns

### Recommended Package Structure

```
packages/mcp/
├── package.json             # name: @get-cauldron/mcp, bin: { cauldron-mcp: ./dist/index.js }
├── tsconfig.json            # extends ../../tsconfig.json, same as CLI
├── vitest.config.ts         # same pattern as engine/cli
└── src/
    ├── index.ts             # Entry point: bootstrap + connectServer
    ├── bootstrap.ts         # Mirror of CLI bootstrap.ts — wires DB, executor, configureAssetDeps
    ├── server.ts            # createMcpServer() — instantiate McpServer, register all tools/resources
    ├── project-detector.ts  # Auto-detect project from cwd: scan for cauldron.config.ts / .cauldron/
    ├── tools/
    │   ├── generate-image.ts    # generate-image tool handler
    │   ├── check-job-status.ts  # check-job-status tool handler
    │   ├── get-artifact.ts      # get-artifact tool handler
    │   └── list-jobs.ts         # list-jobs tool handler
    ├── resources/
    │   └── job-status.ts        # MCP resource for job status subscriptions
    ├── defaults.ts              # intendedUse → dimension/steps defaults
    ├── types.ts                 # MCP-layer types (GenerateImageInput, etc.)
    └── __tests__/
        ├── generate-image.test.ts
        ├── check-job-status.test.ts
        ├── get-artifact.test.ts
        ├── list-jobs.test.ts
        ├── project-detector.test.ts
        └── defaults.test.ts
```

### Pattern 1: MCP Server Setup (stdio)

**What:** Instantiate McpServer, register all tools/resources, connect to StdioServerTransport.
**When to use:** Entry point only — called once at process start.
**Example:**

```typescript
// Source: https://modelcontextprotocol.io/docs/develop/build-server (TypeScript tab)
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "cauldron-mcp",
  version: "0.1.0",
});

// Register tools and resources here...

const transport = new StdioServerTransport();
await server.connect(transport);
// Server is now listening on stdin/stdout — do NOT log to stdout after this point
```

**Critical stdio rule:** Never call `console.log()` after `server.connect()`. It writes to stdout and corrupts the JSON-RPC stream. Use `console.error()` or pino configured to write to stderr/file.

### Pattern 2: Tool Registration with Zod Schema

**What:** Register a tool with typed input schema using Zod object fields, return content array.
**When to use:** All four MCP tools.
**Example:**

```typescript
// Source: https://modelcontextprotocol.io/docs/develop/build-server
import { z } from "zod";

server.registerTool(
  "generate-image",
  {
    description: "Submit an async image generation request. Returns a job handle immediately — use check-job-status to poll progress.",
    inputSchema: {
      prompt: z.string().describe("The generation prompt describing what to create"),
      styleGuidance: z.string().optional().describe("Visual style direction, prepended to the prompt"),
      intendedUse: z.enum(["hero-image", "icon", "texture", "avatar", "background", "other"]).optional(),
      destination: z.string().optional().describe("Target file path for the completed image"),
      width: z.number().int().optional(),
      height: z.number().int().optional(),
    },
  },
  async ({ prompt, styleGuidance, intendedUse, destination, width, height }) => {
    // ... handler logic
    return {
      content: [{ type: "text", text: JSON.stringify({ jobId, status }) }],
    };
  }
);
```

Note: `inputSchema` is a plain object of Zod fields (not `z.object({})`). The SDK wraps them.

### Pattern 3: Inngest Event Trigger from MCP

**What:** Fire `asset/generate.requested` event to kick off generation via existing Inngest handler.
**When to use:** `generate-image` tool handler.
**Example:**

```typescript
// Pattern mirrors CLI — same inngest client imported from engine
import { inngest } from '@get-cauldron/engine';

// After submitAssetJob returns jobId:
await inngest.send({
  name: 'asset/generate.requested',
  data: { jobId, projectId },
});
```

### Pattern 4: Artifact Delivery Extension in events.ts

**What:** In the `collect-artifacts` step, check if `extras.destination` is set; if so, copy the completed image there.
**When to use:** Extend the existing `generateAssetHandler` in `packages/engine/src/asset/events.ts`.
**Example:**

```typescript
// After writeArtifact() completes and artifactPath is known:
const destination = (job?.extras as Record<string, unknown>)?.destination as string | undefined;
if (destination) {
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(join(dir, imageFilename), destination);
  logger.info({ jobId, destination }, 'Asset copied to destination');
}
```

This goes inside the existing `collect-artifacts` `step.run()` callback in `events.ts`. No new Inngest function needed.

### Pattern 5: Resource Subscription for Job Status

**What:** Expose a dynamic MCP resource per job ID; push update notifications when job status changes.
**When to use:** D-13 — clients that support subscriptions can receive push instead of polling.
**Example:**

```typescript
// Source: https://github.com/modelcontextprotocol/typescript-sdk
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

server.resource(
  "job-status",
  new ResourceTemplate("cauldron://jobs/{jobId}/status", { list: undefined }),
  async (uri, { jobId }) => {
    const job = await getAssetJob(db, jobId as string);
    return {
      contents: [{
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify({ jobId, status: job?.status, updatedAt: job?.updatedAt }),
      }],
    };
  }
);

// When a job status changes (e.g. post-completion), push a notification:
await server.server.sendResourceUpdated({
  uri: `cauldron://jobs/${jobId}/status`,
});
```

The `McpServer` high-level class handles subscription tracking automatically. `sendResourceUpdated` is called on `server.server` (the underlying low-level `Server` instance).

### Pattern 6: Project Auto-Detection

**What:** Walk upward from cwd until a cauldron.config.ts or .cauldron/ directory is found. Query the projects table to match.
**When to use:** MCP bootstrap — called once at startup to resolve the active projectId.
**Example:**

```typescript
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function findProjectRoot(startDir: string): string | null {
  let dir = startDir;
  while (true) {
    if (existsSync(join(dir, 'cauldron.config.ts')) || existsSync(join(dir, '.cauldron'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) return null; // filesystem root
    dir = parent;
  }
}
```

Projects table has `name` and `settings` columns but no `rootPath` column — the DB does not store project root paths. The auto-detection resolves the project root from the filesystem, then the MCP server can either require an explicit projectId flag OR resolve the single most-recently-created project as a fallback. **This is a gap that needs a resolution decision in planning.** The projects table schema has no path column to match against, so cwd-based resolution cannot be done purely by DB query without a convention (e.g., project name derived from directory name, or a `.cauldron/project-id` file written at project creation time).

### Anti-Patterns to Avoid

- **console.log in stdio process:** Corrupts JSON-RPC stream. Always write diagnostic output to stderr or a log file.
- **Blocking on generation in tool handler:** The `generate-image` tool must return immediately with a job handle, not wait for the image to complete (async-first rule from REQUIREMENTS.md).
- **Creating a second Inngest client:** The existing `inngest` export from `@get-cauldron/engine` must be reused — the engine's events.ts already enforces this with a comment.
- **HTTP call to CLI server:** D-04 explicitly forbids this. MCP imports engine functions directly.
- **Returning raw file bytes from tool response for large images:** Default `get-artifact` response should return file path; base64 only when explicitly requested via flag (D-11).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON-RPC framing over stdio | Custom message parsing | `@modelcontextprotocol/sdk` StdioServerTransport | Protocol framing is complex; SDK handles length-prefixed messages, request/response correlation |
| Tool input validation | Manual type-checking | Zod schema in `inputSchema` field | SDK auto-validates and surfaces errors as protocol-level tool errors |
| Resource subscription tracking | Custom subscriber registry | `McpServer.resource()` + `server.server.sendResourceUpdated()` | SDK manages subscriber state and protocol-level subscribe/unsubscribe |
| Async job result polling in tool | setTimeout loop in handler | Return immediately with jobId; caller uses `check-job-status` | MCP tools must return quickly; long-running work must be async |

**Key insight:** The MCP SDK handles all transport-level complexity. Tool handlers are just async functions that return `{ content: [...] }`.

---

## Runtime State Inventory

> Not applicable. This is a greenfield package (new `@get-cauldron/mcp`). No existing runtime state to inventory. The Phase 18 `asset_jobs` table schema is unchanged by this phase.

---

## Common Pitfalls

### Pitfall 1: stdout Pollution in Stdio Transport

**What goes wrong:** Any `console.log()` call in the MCP server process writes to stdout, which is the JSON-RPC transport pipe. The MCP client receives malformed messages and disconnects.
**Why it happens:** Node.js default logging writes to stdout. Bootstrap, Pino default transport, and debug statements all typically use stdout.
**How to avoid:** Configure Pino with `destination: pino.destination({ sync: false })` to stderr, OR pass `{ level: 'silent' }` in production mode. Never use `console.log` anywhere in the mcp package.
**Warning signs:** MCP client reports "unexpected token" or connection immediately closes after startup.

### Pitfall 2: Missing Project ID Resolution

**What goes wrong:** The projects table has no `rootPath` or `cwd` column, so cwd-based auto-detection cannot match a project record by directory path alone.
**Why it happens:** Phase 18 never needed cwd-based lookup; the CLI receives projectId as an explicit argument.
**How to avoid:** Two options — (a) write a `.cauldron/project-id` file when a project is initialized (requires CLI change), or (b) require `--project-id` as a CLI argument to the MCP bin. Option (b) requires no schema changes. The planner should pick one approach.
**Warning signs:** Auto-detection finds the project root but then cannot resolve which project record it corresponds to.

### Pitfall 3: Inngest Not Running

**What goes wrong:** `generate-image` tool calls `submitAssetJob` (DB insert succeeds) and fires the Inngest event, but no worker is listening. Job stays in `pending` forever.
**Why it happens:** D-05 states the Inngest dev server must be running, but MCP clients launch the server process without checking Inngest health.
**How to avoid:** Log a clear warning to stderr at startup if the Inngest dev server is not reachable (check `http://localhost:8288` — the standard Inngest dev server port). Do not fail startup, but surface the warning.
**Warning signs:** Jobs submitted via `generate-image` remain in `pending` status indefinitely.

### Pitfall 4: Zod Version Mismatch in inputSchema

**What goes wrong:** The MCP SDK's `registerTool` inputSchema field expects Zod v3 schema shape in some older examples. The project uses Zod v4.
**Why it happens:** Many tutorials show `zod@3`. The project package.json uses `zod: ^4.3.6`.
**How to avoid:** Pass the Zod schema object fields (plain object of Zod values, not `z.object()`). The SDK wraps them. Test by calling `server.callTool()` in unit tests before wiring.
**Warning signs:** TypeScript type errors on `inputSchema` or runtime validation failures on valid inputs.

### Pitfall 5: extras Field Type Mismatch for Destination

**What goes wrong:** The `destination` field is stored in `asset_jobs.extras` (JSONB). When the collect-artifacts step reads it back, TypeScript types it as `Record<string, unknown>`. Direct cast to string may throw.
**Why it happens:** Drizzle types JSONB as `Record<string, unknown> | null`. The `destination` key is a convention, not a schema column.
**How to avoid:** Always guard with `typeof extras.destination === 'string'` before using it. Alternatively, define a typed extras schema and use Zod to parse it.

### Pitfall 6: Resource Subscription on non-subscribed jobs

**What goes wrong:** `sendResourceUpdated` called for a job URI that no client has subscribed to. SDK throws or logs an error.
**Why it happens:** The collect-artifacts step notifies all resource URIs it knows about, not checking for active subscribers.
**How to avoid:** The MCP SDK should silently discard notifications for URIs with no active subscribers. Verify this behavior. If it throws, wrap in try/catch.

---

## Code Examples

### Full Package Entry Point Pattern

```typescript
// packages/mcp/src/index.ts
// Source: Official MCP TypeScript SDK docs + CLI bootstrap pattern
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { bootstrapMcp } from "./bootstrap.js";
import { createMcpServer } from "./server.js";

async function main() {
  const deps = await bootstrapMcp();
  const server = createMcpServer(deps);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Process stays alive — stdio transport keeps it running
}

main().catch((err) => {
  console.error("Fatal MCP server error:", err);
  process.exit(1);
});
```

### generate-image Tool Handler Sketch

```typescript
// packages/mcp/src/tools/generate-image.ts
import { submitAssetJob } from '@get-cauldron/engine';
import { inngest } from '@get-cauldron/engine';
import { applyIntendedUseDefaults } from '../defaults.js';

export function registerGenerateImageTool(server: McpServer, deps: McpDeps) {
  server.registerTool(
    "generate-image",
    {
      description: "Submit an async image generation request backed by the local FLUX.2 dev model. Returns a job handle immediately. Use check-job-status to poll, or get-artifact once complete.",
      inputSchema: {
        prompt: z.string().describe("Describe the image to generate"),
        styleGuidance: z.string().optional().describe("Visual style direction (e.g., 'cinematic lighting, matte painting')"),
        referenceImages: z.array(z.string()).optional().describe("File paths to reference images"),
        intendedUse: z.enum(["hero-image", "icon", "texture", "avatar", "background", "other"]).optional(),
        destination: z.string().optional().describe("Where to copy the completed image"),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
        steps: z.number().int().min(1).max(150).optional(),
        seed: z.number().int().optional(),
      },
    },
    async (input) => {
      const params = applyIntendedUseDefaults(input);
      // Compose styleGuidance into prompt
      const finalPrompt = input.styleGuidance
        ? `${input.styleGuidance}, ${input.prompt}`
        : input.prompt;

      const handle = await submitAssetJob({
        db: deps.db,
        params: {
          projectId: deps.projectId,
          prompt: finalPrompt,
          width: params.width,
          height: params.height,
          steps: params.steps,
          seed: input.seed,
          extras: {
            styleGuidance: input.styleGuidance,
            originalPrompt: input.prompt,
            intendedUse: input.intendedUse,
            referenceImages: input.referenceImages,
            destination: input.destination,
          },
        },
      });

      await inngest.send({
        name: 'asset/generate.requested',
        data: { jobId: handle.jobId, projectId: deps.projectId },
      });

      return {
        content: [{ type: "text", text: JSON.stringify(handle) }],
      };
    }
  );
}
```

### intendedUse Defaults

```typescript
// packages/mcp/src/defaults.ts
const INTENDED_USE_DEFAULTS: Record<string, { width: number; height: number; steps: number }> = {
  'icon':       { width: 512,  height: 512,  steps: 30 },
  'hero-image': { width: 1024, height: 768,  steps: 20 },
  'texture':    { width: 1024, height: 1024, steps: 20 },
  'avatar':     { width: 512,  height: 512,  steps: 25 },
  'background': { width: 1920, height: 1080, steps: 20 },
  'other':      { width: 1024, height: 1024, steps: 20 },
};
const FALLBACK = { width: 1024, height: 1024, steps: 20 };

export function applyIntendedUseDefaults(input: GenerateImageInput) {
  const defaults = input.intendedUse ? (INTENDED_USE_DEFAULTS[input.intendedUse] ?? FALLBACK) : FALLBACK;
  return {
    width:  input.width  ?? defaults.width,
    height: input.height ?? defaults.height,
    steps:  input.steps  ?? defaults.steps,
  };
}
```

### Delivery Extension in collect-artifacts

```typescript
// Extend the collect-artifacts step in packages/engine/src/asset/events.ts
// Add AFTER writeArtifact() call and BEFORE completeJob():
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const destination = (job?.extras as Record<string, unknown>)?.destination;
if (typeof destination === 'string' && destination.length > 0) {
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(join(artifactPath, image.filename), destination);
  logger.info({ jobId, destination }, 'Asset delivered to destination');
}
```

### Package.json for @get-cauldron/mcp

```json
{
  "name": "@get-cauldron/mcp",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "cauldron-mcp": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "@get-cauldron/engine": "workspace:*",
    "@get-cauldron/shared": "workspace:*",
    "@modelcontextprotocol/sdk": "^1.29.0",
    "dotenv": "^16.4.0",
    "inngest": "^4.1.0",
    "pino": "^10.3.1",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@types/node": "^25.5.0",
    "typescript": "^6.0.2",
    "vitest": "^4.1.1"
  }
}
```

---

## Open Questions

1. **Project ID Resolution**
   - What we know: projects table has id, name, description — no rootPath or cwd column
   - What's unclear: How does the MCP server resolve which project record corresponds to the detected cwd root?
   - Recommendation: Create `.cauldron/project-id` file at project init time (simple text file with UUID). MCP server reads it after detecting root. If missing, error with instructions. This is a clean contract that requires a small CLI addition OR a manual setup step documented in the MCP config instructions.

2. **list-jobs scope — all projects vs detected project only**
   - What we know: D-12 says "returns last 50 jobs across all projects by default, filterable by status, with project name in each result"
   - What's unclear: Does this need a DB join with the projects table to get project name? The `asset_jobs` table only has `projectId` (UUID), not the project name.
   - Recommendation: JOIN `asset_jobs` with `projects` in the list-jobs query to include `projects.name`. Standard Drizzle join pattern.

3. **Resource notification delivery for job completion**
   - What we know: Inngest runs in a separate worker process (CLI Hono server or engine server). The MCP server is a different process.
   - What's unclear: How does the MCP server's McpServer instance receive notification that a job completed so it can call `sendResourceUpdated()`? The Inngest handler runs in a different process from the MCP server.
   - Recommendation: For this phase, resource subscriptions are best-effort and forward-looking (D-13 says "not all MCP clients support them yet"). The MCP server can poll the DB on a background interval for jobs that have subscribed clients and push updates. Alternatively, skip active push for now and document that `check-job-status` is the primary polling mechanism. The planner should resolve this.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | MCP server runtime | Check at dev time | >= 18 required | — |
| PostgreSQL | DB layer | Running via Docker :5432 | 15+ | — |
| Inngest dev server | Asset generation | Must be running on :8288 | ^4 | Warn at startup, jobs submitted but won't run |
| ComfyUI | Actual image generation | Optional at MCP-tool level | — | Jobs queue; generation fails at Inngest step |

**Missing dependencies with no fallback:**
- None that block MCP server startup — DB is required but that's the existing infrastructure.

**Missing dependencies with fallback:**
- Inngest dev server: MCP server starts fine; jobs submitted stay `pending`. Warn to stderr at startup.
- ComfyUI: Same — jobs fail at the Inngest `submit-to-comfyui` step, not at MCP tool invocation.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.1 |
| Config file | `packages/mcp/vitest.config.ts` (Wave 0 gap — new package) |
| Quick run command | `pnpm -F @get-cauldron/mcp test` |
| Full suite command | `pnpm test` (turbo — all packages) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MCP-01 | McpServer registers all 4 tools with expected names | unit | `pnpm -F @get-cauldron/mcp test -- src/__tests__/server.test.ts` | ❌ Wave 0 |
| MCP-02 | generate-image tool applies intendedUse defaults, composes styleGuidance into prompt | unit | `pnpm -F @get-cauldron/mcp test -- src/__tests__/generate-image.test.ts` | ❌ Wave 0 |
| MCP-02 | applyIntendedUseDefaults returns correct dimensions per use type | unit | `pnpm -F @get-cauldron/mcp test -- src/__tests__/defaults.test.ts` | ❌ Wave 0 |
| MCP-03 | generate-image returns jobId+status immediately without awaiting generation | unit | `pnpm -F @get-cauldron/mcp test -- src/__tests__/generate-image.test.ts` | ❌ Wave 0 |
| MCP-03 | check-job-status returns status enum and progress estimate | unit | `pnpm -F @get-cauldron/mcp test -- src/__tests__/check-job-status.test.ts` | ❌ Wave 0 |
| MCP-03 | get-artifact returns file path + provenance, base64 only when flag set | unit | `pnpm -F @get-cauldron/mcp test -- src/__tests__/get-artifact.test.ts` | ❌ Wave 0 |
| MCP-04 | collect-artifacts step copies image to destination when extras.destination set | unit | `pnpm -F @get-cauldron/engine test -- src/asset/__tests__/events.test.ts` | ✅ (extend) |
| MCP-04 | collect-artifacts does NOT copy when no destination set | unit | `pnpm -F @get-cauldron/engine test -- src/asset/__tests__/events.test.ts` | ✅ (extend) |
| MCP-04 | destination directory created recursively (mkdir -p) | unit | `pnpm -F @get-cauldron/engine test -- src/asset/__tests__/events.test.ts` | ❌ Wave 0 (new test case) |

### Sampling Rate

- **Per task commit:** `pnpm -F @get-cauldron/mcp test && pnpm -F @get-cauldron/engine test`
- **Per wave merge:** `pnpm test && pnpm typecheck`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `packages/mcp/vitest.config.ts` — test config for new package
- [ ] `packages/mcp/src/__tests__/server.test.ts` — covers MCP-01: tool registration
- [ ] `packages/mcp/src/__tests__/generate-image.test.ts` — covers MCP-02, MCP-03
- [ ] `packages/mcp/src/__tests__/check-job-status.test.ts` — covers MCP-03
- [ ] `packages/mcp/src/__tests__/get-artifact.test.ts` — covers MCP-03
- [ ] `packages/mcp/src/__tests__/defaults.test.ts` — covers MCP-02 smart defaults
- [ ] `packages/mcp/src/__tests__/project-detector.test.ts` — covers D-07

---

## Project Constraints (from CLAUDE.md)

The following directives from CLAUDE.md apply to this phase. The planner must verify all tasks comply.

| Directive | Impact on Phase 19 |
|-----------|-------------------|
| TypeScript end-to-end | `@get-cauldron/mcp` must be pure TypeScript with `"type": "module"` |
| Do not use Express | MCP server is standalone stdio — no HTTP server needed. Do not add Express. |
| Do not use WebSockets | Not applicable — stdio transport only |
| Do not use Jest or Cypress | Use Vitest for all tests in new mcp package |
| Do not use `pg` driver | Use `postgres` driver (already in shared) |
| Use `.js` extensions in all relative imports | All relative imports in mcp package must use `.js` extension |
| Zod 4 (import from `'zod'`) | MCP tool schemas must use Zod 4 |
| OSS dependencies: use if 80%+ fit is clean | `@modelcontextprotocol/sdk` is 100% fit — exactly this use case |
| Each bead must fit in ~200k tokens | Not directly applicable — this is a standalone package |
| pnpm workspaces | New package uses `workspace:*` for internal deps |
| Factory functions use `create*` prefix | `createMcpServer()` naming is correct |
| Engine submodule structure: types.ts, primary logic, errors.ts, `__tests__/` | Apply to tools/ subdirectory — each tool file co-located with its test |

---

## Sources

### Primary (HIGH confidence)

- Official MCP TypeScript SDK docs: `https://modelcontextprotocol.io/docs/develop/build-server` — stdio setup, tool registration pattern, Zod inputSchema usage, stdout corruption warning
- npm registry for `@modelcontextprotocol/sdk` — version 1.29.0 confirmed 2026-03-31
- Project source code (read directly): `packages/engine/src/asset/types.ts`, `job-store.ts`, `events.ts`, `artifact-writer.ts` — Phase 18 engine API surface
- Project source code: `packages/cli/src/bootstrap.ts` — bootstrap pattern to mirror
- Project source code: `packages/cli/package.json`, `packages/engine/package.json` — monorepo package structure to replicate

### Secondary (MEDIUM confidence)

- WebSearch result: `server.server.sendResourceUpdated()` for resource notifications — cross-verified against MCP protocol spec description of `notifications/resources/updated`
- GitHub MCP TypeScript SDK repository search results confirming `StdioServerTransport` import path `@modelcontextprotocol/sdk/server/stdio.js`

### Tertiary (LOW confidence)

- Resource subscription behavior (silently discard unsubscribed notifications) — stated in search results but not directly verified in SDK source. Treat as needing validation in implementation.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — SDK version verified from npm registry, all other deps are existing project dependencies
- Architecture: HIGH — patterns directly derived from existing CLI/engine code and official MCP docs
- MCP tool registration: HIGH — verified from official MCP docs with working TypeScript examples
- Resource subscriptions: MEDIUM — protocol flow understood, server-side push across process boundary (open question #3) is LOW confidence
- Pitfalls: HIGH — stdout corruption and project ID resolution are direct observations from reading the code and docs

**Research date:** 2026-03-31
**Valid until:** 2026-05-01 (MCP SDK is actively updated; re-verify if SDK version advances significantly)
