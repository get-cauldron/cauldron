---
phase: 09-cli
plan: "04"
subsystem: cli
tags: [webhook, inngest, pipeline-trigger, npm-publish]
dependency_graph:
  requires: ["09-02"]
  provides:
    - GitHub push webhook HMAC validation route
    - CLI webhook setup command
    - Inngest pipeline_trigger consumer with queue logic
    - getPipelineStatus tRPC query
    - "@cauldron/cli npm-publishable package"
  affects:
    - packages/web/src/app/api/webhook/git/route.ts
    - packages/web/src/inngest/pipeline-trigger.ts
    - packages/web/src/trpc/routers/execution.ts
    - packages/api/src/commands/webhook.ts
    - packages/api/package.json
tech_stack:
  added:
    - "@octokit/webhooks-methods (web package) — HMAC-SHA256 verify/sign for GitHub webhooks"
    - "inngest (web package) — Inngest client and pipelineTriggerFunction"
  patterns:
    - "TDD: wrote failing tests first, then route implementation"
    - "pipeline_trigger added to eventTypeEnum with migration 0011"
    - "Inngest serve route at /api/inngest registers web-layer functions"
key_files:
  created:
    - packages/web/src/app/api/webhook/git/route.ts
    - packages/web/src/app/api/webhook/git/route.test.ts
    - packages/api/src/commands/webhook.ts
    - packages/web/src/inngest/client.ts
    - packages/web/src/inngest/pipeline-trigger.ts
    - packages/web/src/app/api/inngest/route.ts
    - packages/shared/src/db/migrations/0011_pipeline_trigger_event.sql
  modified:
    - packages/web/src/trpc/routers/execution.ts
    - packages/web/src/trpc/routers/projects.ts
    - packages/api/src/commands/status.ts
    - packages/api/src/cli.ts
    - packages/api/package.json
    - packages/api/src/config-io.ts
    - packages/shared/src/db/schema/event.ts
    - packages/shared/src/db/migrations/meta/_journal.json
decisions:
  - "pipeline_trigger added to eventTypeEnum (not reused pipeline_started) — semantically distinct: trigger is the inbound event, started is post-queue/post-check"
  - "InngestFunction<any,any,any,any> type annotation required to avoid TS2883 — consistent with Phase 4 decision"
  - "Inngest client in web package separate from engine package (cauldron-web vs cauldron-engine) — web layer owns its own Inngest functions"
  - "projects.updateSettings expanded to accept repoUrl — required for webhook setup --repo flag"
metrics:
  duration: "~7 minutes"
  completed: "2026-03-27"
  tasks: 4
  files: 15
---

# Phase 09 Plan 04: Webhook, Pipeline Queue, and npm Publish Summary

GitHub push webhook handler with HMAC-SHA256 validation, CLI webhook setup command, Inngest pipeline trigger consumer with active-pipeline queue logic, and @cauldron/cli npm publishable package.

## What Was Built

### Task 1: GitHub Webhook Route Handler
- `POST /api/webhook/git` validates x-hub-signature-256 using `@octokit/webhooks-methods verify()`
- Raw body used for signature verification (critical: must be `req.text()`, not parsed JSON)
- Missing/invalid signatures return 401; non-push events (ping) return 200 gracefully
- Valid push events match projects by `settings.repoUrl` and append `pipeline_trigger` event
- `pipeline_trigger` added to eventTypeEnum via migration 0011
- 6 TDD tests cover all behavior cases

### Task 2: CLI Webhook Setup Command
- `cauldron webhook setup <project-id>` generates 64-char hex secret via `generateApiKey()`
- Writes `GITHUB_WEBHOOK_SECRET` to `.env` via `writeEnvVar()`
- Prints GitHub webhook configuration instructions with teal-colored URL and secret
- `--repo <url>` flag updates project settings with repoUrl via `projects.updateSettings`
- `--json` flag outputs `{ url, secret, projectId }` for machine-readable use
- `saveCLIConfig` extended to persist `webhookSecret` in cauldron.config.ts

### Task 3: Inngest Pipeline Trigger Consumer
- `pipelineTriggerFunction` listens on `cauldron/pipeline.trigger` Inngest event
- Step 1 checks for active beads (claimed/pending status) in the latest seed
- Active pipeline: appends queued `pipeline_trigger` event, then `step.waitForEvent` waits for `cauldron/pipeline.completed` with 2-hour timeout
- After completion, checks for newer queued commits — if superseded, returns early
- `getPipelineStatus` tRPC query exposes active/queued state for CLI consumption
- `status` command now shows "Pipeline queued behind active run" in amber when applicable
- Inngest serve route at `/api/inngest` registers web-layer functions

### Task 4: npm Package Configuration
- Package renamed from `@cauldron/api` to `@cauldron/cli`
- `"bin": { "cauldron": "./dist/cli.js" }` — installable as global `cauldron` command
- `"publishConfig": { "access": "public" }` — ready for `npm publish`
- `"files": ["dist/"]` — only compiled output is published
- `#!/usr/bin/env node` shebang added to `cli.ts` — preserved in `dist/cli.js` after `tsc`
- Version bumped to `0.1.0`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing] Added repoUrl to projects.updateSettings input schema**
- **Found during:** Task 2
- **Issue:** The `updateSettings` tRPC mutation only accepted `budgetLimitCents` and `maxConcurrentBeads`. The webhook setup command needs to set `repoUrl` on the project to enable push event matching.
- **Fix:** Added `repoUrl: z.string().optional()` to the updateSettings input schema in `projects.ts`
- **Files modified:** `packages/web/src/trpc/routers/projects.ts`
- **Commit:** f98c130

**2. [Rule 2 - Missing] Created Inngest client and serve route for web package**
- **Found during:** Task 3
- **Issue:** The plan referenced `packages/web/src/inngest/client.ts` but no Inngest setup existed in the web package. Without a client and serve route, the Inngest functions would never be registered.
- **Fix:** Created `inngest/client.ts` with a `cauldron-web` Inngest client, and `app/api/inngest/route.ts` serving the functions
- **Files modified:** `packages/web/src/inngest/client.ts`, `packages/web/src/app/api/inngest/route.ts`
- **Commit:** c0fab76

**3. [Rule 2 - Missing] Added inngest dependency to web package**
- **Found during:** Task 3
- **Issue:** `inngest` was not in `packages/web/package.json` but the new pipeline-trigger.ts imports from it
- **Fix:** Added `inngest` via `pnpm --filter @cauldron/web add inngest`
- **Files modified:** `packages/web/package.json`
- **Commit:** c0fab76

## Self-Check: PASSED

All files confirmed present:
- packages/web/src/app/api/webhook/git/route.ts — FOUND
- packages/web/src/app/api/webhook/git/route.test.ts — FOUND
- packages/api/src/commands/webhook.ts — FOUND
- packages/web/src/inngest/pipeline-trigger.ts — FOUND

All commits confirmed present:
- 51cad90 (Task 1: webhook route) — FOUND
- f98c130 (Task 2: webhook command) — FOUND
- c0fab76 (Task 3: pipeline trigger) — FOUND
- aa4a3dd (Task 4: npm package) — FOUND
