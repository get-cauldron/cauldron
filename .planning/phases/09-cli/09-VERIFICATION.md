---
phase: 09-cli
verified: 2026-03-27T15:02:14Z
status: passed
score: 7/7 must-haves verified
gaps:
  - truth: "cauldron logs streams pipeline events in real-time via SSE"
    status: resolved
    resolution: "Imported logsCommand in cli.ts and routed 'case logs' to it with serverUrl/apiKey from config"
  - truth: "Valid push event triggers a pipeline run for the matching project"
    status: resolved
    resolution: "Added inngest.send({ name: 'cauldron/pipeline.trigger' }) call in webhook route after appendEvent"
human_verification:
  - test: "Run cauldron interview --project <id>"
    expected: "Polls tRPC for transcript, shows MC options, accepts input, sends answer via tRPC, shows updated ambiguity score"
    why_human: "Interactive terminal readline loop cannot be verified programmatically"
  - test: "Run cauldron logs <project-id> after fix is applied"
    expected: "SSE stream opens to /api/events/<project-id>, per-bead colored prefixes appear, Ctrl+C cleanly exits"
    why_human: "SSE streaming requires live server"
  - test: "Push to configured GitHub repo with valid HMAC secret after fix is applied"
    expected: "Inngest receives cauldron/pipeline.trigger event, checks for active pipeline, triggers or queues run"
    why_human: "Requires live GitHub webhook delivery or manual curl with valid HMAC"
---

# Phase 09: CLI Verification Report

**Phase Goal:** Every pipeline operation available in the web dashboard is also available via CLI, sharing the same tRPC API contract with zero schema drift, and git-push-triggered runs are supported.
**Verified:** 2026-03-27T15:02:14Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Developer can run `cauldron interview`, `cauldron run`, `cauldron status` and get same data as web dashboard | VERIFIED | cli.ts routes all 15 commands through tRPC client; status calls getProjectDAG; interview polls getTranscript |
| 2 | `cauldron logs` streams pipeline events in real-time via SSE | FAILED | `logsCommand` with SSE/EventSource exists in logs.ts but `cli.ts` routes 'logs' to `statusCommand --logs` (polling), never calls `logsCommand` |
| 3 | A git push triggers a pipeline run without manual CLI invocation | FAILED | Webhook validates HMAC and appends DB event but never sends `cauldron/pipeline.trigger` Inngest event — `pipelineTriggerFunction` is never invoked |
| 4 | CLI and web dashboard share the same tRPC type definitions — no separate schema | VERIFIED | `packages/trpc-types/src/index.ts` re-exports `AppRouter` from web; CLI client imports `AppRouter` from `@cauldron/trpc-types` |
| 5 | All commands use tRPC client exclusively (zero direct engine/DB calls) | VERIFIED | `grep -r "from '@cauldron/engine'" packages/api/src/commands/` returns zero matches |
| 6 | `cauldron webhook setup` generates secret and prints GitHub config instructions | VERIFIED | webhook.ts: generates key, writes GITHUB_WEBHOOK_SECRET to .env, prints URL + GitHub steps |
| 7 | Push mid-pipeline queues the event; status shows "pipeline queued behind active run" | FAILED (by proxy) | pipelineTriggerFunction queue logic is correct but unreachable — webhook never sends the Inngest event it depends on (same root cause as Truth 3) |

**Score:** 5/7 truths verified (2 failures share one root cause; 1 is independent)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/trpc-types/src/index.ts` | AppRouter type re-export | VERIFIED | `export type { AppRouter } from '../../web/src/trpc/router.js'` |
| `packages/api/src/trpc-client.ts` | tRPC client factory with auth header | VERIFIED | `createCLIClient(serverUrl, apiKey)` with `httpBatchLink` + Bearer header |
| `packages/api/src/cli.ts` | CLI router with tRPC bootstrap | VERIFIED | 15 commands, tRPC client bootstrap, server auto-start, API key provisioning, `#!/usr/bin/env node` shebang |
| `packages/api/src/commands/decompose.ts` | triggerDecomposition via tRPC | VERIFIED | Calls `client.execution.triggerDecomposition.mutate(...)` |
| `packages/api/src/commands/execute.ts` | triggerExecution via tRPC | VERIFIED | Calls `client.execution.triggerExecution.mutate(...)` |
| `packages/api/src/commands/status.ts` | bead table with colored status | VERIFIED | Uses `getProjectDAG` + `getPipelineStatus`, renders `createTable`, `colorStatus`, shows amber queue warning |
| `packages/api/src/commands/logs.ts` | SSE-backed real-time log streaming | ORPHANED | Exists and is substantive (EventSource, bead coloring, SIGINT) but NOT imported or called from cli.ts |
| `packages/web/src/app/api/webhook/git/route.ts` | GitHub push webhook handler | PARTIAL | HMAC validation, project matching, DB event append — correct. Missing: Inngest event send |
| `packages/web/src/inngest/pipeline-trigger.ts` | Inngest queue/trigger consumer | ORPHANED | Exists and is correct but never receives events — webhook never sends `cauldron/pipeline.trigger` |
| `packages/api/src/commands/webhook.ts` | webhook setup CLI command | VERIFIED | Generates secret, writes to .env, prints instructions, optionally sets repoUrl |
| `packages/api/package.json` | bin entry + publishConfig | VERIFIED | `"bin": { "cauldron": "./dist/cli.js" }`, `"publishConfig": { "access": "public" }`, `"files": ["dist/"]` |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `packages/trpc-types/src/index.ts` | `packages/web/src/trpc/router.ts` | type re-export | WIRED | `export type { AppRouter }` confirmed |
| `packages/api/src/trpc-client.ts` | `packages/trpc-types/src/index.ts` | `import type { AppRouter }` | WIRED | Line 2 of trpc-client.ts |
| `packages/api/src/cli.ts` | `packages/api/src/trpc-client.ts` | `createCLIClient` call | WIRED | Line 6 import, called in `bootstrapClient()` |
| `packages/web/src/trpc/init.ts` | `process.env.CAULDRON_API_KEY` | auth check in `createTRPCContext` | WIRED | `validateApiKey()` checks env var; `authenticated` in context |
| `packages/api/src/commands/logs.ts` | `/api/events/[projectId]` | EventSource connection | NOT_WIRED | logs.ts is correct but cli.ts routes 'logs' to statusCommand — EventSource never opened from CLI |
| `packages/web/src/app/api/webhook/git/route.ts` | `packages/web/src/inngest/pipeline-trigger.ts` | Inngest event `cauldron/pipeline.trigger` | NOT_WIRED | webhook route never calls `inngest.send()`; pipelineTriggerFunction never receives trigger event |
| `packages/web/src/app/api/inngest/route.ts` | `pipelineTriggerFunction` | Inngest serve registration | WIRED | `functions: [pipelineTriggerFunction]` confirmed |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `status.ts` | `dag.beads` | `client.execution.getProjectDAG.query({ projectId })` | Yes — queries DB via tRPC | FLOWING |
| `logs.ts` | `PipelineEvent` | EventSource on `/api/events/${projectId}` | Yes — SSE from DB events | FLOWING (but orphaned) |
| `projects.ts` | project list | `client.projects.list.query()` | Yes — DB query via tRPC | FLOWING |
| `costs.ts` | cost breakdown | `client.costs.getProjectSummary.query(...)` | Yes — DB query via tRPC | FLOWING |
| `evolution.ts` | seed lineage | `client.evolution.getSeedLineage.query(...)` | Yes — DB query via tRPC | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| CLI package has bin entry | `grep '"bin"' packages/api/package.json` | `"cauldron": "./dist/cli.js"` found | PASS |
| CLI shebang present | `head -1 packages/api/src/cli.ts` | `#!/usr/bin/env node` | PASS |
| Zero engine imports in commands | `grep -r "from '@cauldron/engine'" packages/api/src/commands/` | zero matches | PASS |
| tRPC mutations exist in execution router | `grep triggerDecomposition packages/web/src/trpc/routers/execution.ts` | line 60 | PASS |
| Web typecheck passes | `pnpm --filter @cauldron/web typecheck` | exit 0 | PASS |
| CLI typecheck passes | `pnpm --filter @cauldron/cli typecheck` | exit 0 | PASS |
| logsCommand wired in cli.ts | `grep logsCommand packages/api/src/cli.ts` | NOT FOUND — routes to statusCommand instead | FAIL |
| Webhook sends Inngest event | `grep inngest packages/web/src/app/api/webhook/git/route.ts` | NOT FOUND | FAIL |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CLI-01 | 09-02-PLAN.md, 09-03-PLAN.md | All pipeline operations available via CLI | PARTIAL | 12/13 operations are available and wired via tRPC. `cauldron logs` exists but uses polling (statusCommand) instead of SSE — the SSE implementation (logsCommand) is orphaned. |
| CLI-02 | 09-04-PLAN.md | Git-push triggered pipeline runs (webhook listener) | PARTIAL | Webhook validates signatures and matches projects. Pipeline trigger Inngest function exists with queue logic. Critical break: webhook never sends `cauldron/pipeline.trigger` Inngest event, so the trigger function is never invoked. |
| CLI-03 | 09-01-PLAN.md, 09-02-PLAN.md, 09-04-PLAN.md | CLI and web dashboard share the same tRPC layer | VERIFIED | `packages/trpc-types` re-exports `AppRouter` from web; CLI uses `createCLIClient<AppRouter>`; all 13 command files use `client.*` exclusively; zero schema duplication. |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/api/src/cli.ts` | 176-179 | `case 'logs': await statusCommand([...commandArgs, '--logs'], flags)` — delegates to a different command instead of using the dedicated SSE implementation | Blocker | `cauldron logs` does not stream; it polls and shows a table snapshot. The SSE-based `logsCommand` is dead code. |
| `packages/web/src/app/api/webhook/git/route.ts` | 71-82 | `appendEvent(db, { type: 'pipeline_trigger', ... })` — appends DB event with no corresponding Inngest event dispatch | Blocker | `pipelineTriggerFunction` listens to the Inngest event bus, not the DB. A push can never trigger a pipeline through the intended mechanism. |

---

### Human Verification Required

#### 1. Interview Terminal Flow

**Test:** Run `cauldron interview --project <id>` against a live server with an active interview session.
**Expected:** Terminal displays the current question with numbered MC options and a freeform option. After entering a choice, the ambiguity score updates and the next question appears. When the threshold is met, the structured summary is shown and the user is prompted to approve/reject.
**Why human:** Interactive readline loop with polling cannot be verified without a live terminal + server.

#### 2. Logs SSE Streaming (after fix)

**Test:** After wiring `logsCommand` in cli.ts, run `cauldron logs <project-id>` against a server with an active bead execution.
**Expected:** Real-time event lines appear with `[beadId]` prefixes in distinct per-bead colors. `--bead <id>` filters to one bead. Ctrl+C exits cleanly with "Stream closed."
**Why human:** SSE connection requires a live server and executing pipeline.

#### 3. GitHub Webhook End-to-End (after fix)

**Test:** After adding `inngest.send()` to the webhook route, push to a configured repo with a valid HMAC-signed payload.
**Expected:** Inngest receives `cauldron/pipeline.trigger` event. If no pipeline is active, `pipeline_started` event appears and execution begins. If active, queue message written and status shows "Pipeline queued behind active run."
**Why human:** Requires real GitHub webhook delivery or manual curl with valid HMAC.

---

### Gaps Summary

Two gaps are blocking goal achievement, with different root causes:

**Gap 1 — logsCommand is orphaned (CLI-01 partial):** `packages/api/src/commands/logs.ts` is a complete, correct SSE streaming implementation with per-bead coloring, bead filtering, SIGINT handling, and 8 passing tests. However, `cli.ts` never imports it. The `'logs'` case in the switch statement delegates to `statusCommand(..., '--logs')`, which displays a polling table snapshot. The SSE requirement from plan 09-03 is unmet. Fix: import `logsCommand` and route `case 'logs'` to it with `serverUrl` and `apiKey` from config.

**Gap 2 — Webhook-to-Inngest bridge missing (CLI-02 partial):** The webhook route (`POST /api/webhook/git`) correctly validates HMAC, matches projects, and appends a `pipeline_trigger` DB event. However, it never calls `inngest.send({ name: 'cauldron/pipeline.trigger', data: {...} })`. The `pipelineTriggerFunction` registered at `/api/inngest` only listens to Inngest events, not DB events — so the entire queue logic (active-pipeline check, supersedure detection, step.waitForEvent) is unreachable from a git push. Fix: import the `inngest` client in the webhook route and call `inngest.send(...)` after `appendEvent`.

Both gaps are surgical two-line fixes with clear paths to resolution.

---

_Verified: 2026-03-27T15:02:14Z_
_Verifier: Claude (gsd-verifier)_
