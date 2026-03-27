# Phase 9: CLI - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Every pipeline operation available in the web dashboard is also available via CLI, sharing the same tRPC API contract with zero schema drift. Git-push-triggered runs are supported via webhook. The CLI is published as an npm global package.

</domain>

<decisions>
## Implementation Decisions

### tRPC Sharing Strategy
- **D-01:** CLI is a tRPC HTTP client — calls the running web server's /api/trpc endpoint using @trpc/client. True zero-drift: same router, same types, single source of truth.
- **D-02:** Extract AppRouter type to a new packages/trpc-types package. Both packages/web and packages/api depend on it. Cleaner dependency graph than direct cross-package import.
- **D-03:** CLI auto-starts the Next.js dev server if localhost:3000 is not responding. Seamless UX — user doesn't need to manage server lifecycle separately.

### Command Surface
- **D-04:** Mirror dashboard commands 1:1. Full command set: projects (list/create/archive), interview, crystallize, seal, decompose, execute, status, logs, costs, evolution, kill, resolve. Plus 'run' as convenience pipeline.
- **D-05:** 'cauldron run' exists as a convenience command that pipelines the full flow: interview -> crystallize -> seal -> decompose -> execute. Individual commands remain for advanced usage.
- **D-06:** 'cauldron interview' supports both modes: interactive terminal (default) with numbered MC options + freeform input, and --browser flag to open the dashboard interview page.
- **D-07:** 'cauldron logs' streams in real-time by default (like 'docker logs -f'). SSE-backed. '--bead <id>' filters to one bead. Ctrl+C to stop.

### Git-Push Triggers
- **D-08:** Webhook server at Next.js Route Handler /api/webhook/git receives GitHub push events. Validates HMAC-SHA256 signature, extracts repo+branch+commit, finds matching project, triggers pipeline.
- **D-09:** GitHub-only for v1. GitLab/Bitbucket deferred to v2.
- **D-10:** Setup via 'cauldron webhook setup <project-id>' which prints the webhook URL and generates a secret.
- **D-11:** When a push arrives for a project mid-pipeline, queue the event. When current pipeline finishes, check if new commit invalidates result. If yes, re-run. CLI shows 'pipeline queued behind active run'.

### Output Formatting
- **D-12:** Colored text + tables as default output. Tables for status/costs/evolution. --json flag for machine-readable output. Spinner for long operations.
- **D-13:** 'cauldron logs' renders prefixed lines: [bead-name] in distinct colors per bead. Multiple beads interleave. Like 'docker compose logs'.

### Configuration
- **D-14:** Extend existing cauldron.config.ts with a 'cli' section. Server URL, webhook secret, API key, project-to-repo mapping. Single config file for the whole platform.

### Auth/Security
- **D-15:** API key authentication. CLI sends key in Authorization header. Prevents accidental cross-project calls. Key stored in cauldron.config.ts cli.apiKey.
- **D-16:** Auto-generate API key on first CLI run via node:crypto. Store in cauldron.config.ts and server env. Seamless setup with no manual steps.

### Package Distribution
- **D-17:** Publish as @cauldron/cli to npm. Users install globally with 'npm i -g @cauldron/cli'. Requires npm publishing infrastructure.

### Claude's Discretion
- Terminal UI library choice for colors/tables/spinners (chalk, ora, cli-table3, or built-in)
- Exact flag naming conventions (--json, --follow, --bead, --browser, etc.)
- Error message formatting
- How 'cauldron run' reports progress between pipeline stages
- Webhook secret storage mechanism (env var vs config file)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing CLI
- `packages/api/src/cli.ts` — Current CLI entrypoint with parseArgs, 8 commands, healthCheck pattern
- `packages/api/src/commands/` — 8 existing command files (interview, crystallize, decompose, execute, status, kill, seal, resolve)
- `packages/api/src/bootstrap.ts` — Dependency injection for CLI commands
- `packages/api/src/health.ts` — Health check pattern (Postgres, Inngest)

### tRPC API (from Phase 8)
- `packages/web/src/trpc/router.ts` — appRouter with all sub-routers
- `packages/web/src/trpc/routers/` — 5 tRPC routers: projects, interview, execution, evolution, costs
- `packages/web/src/trpc/init.ts` — createTRPCContext, tRPC instance setup
- `packages/web/src/app/api/trpc/[trpc]/route.ts` — HTTP endpoint

### SSE Infrastructure
- `packages/web/src/app/api/events/[projectId]/route.ts` — SSE Route Handler
- `packages/web/src/hooks/useSSE.ts` — Client-side SSE hook pattern (CLI will use EventSource or fetch)

### Platform Config
- `cauldron.config.ts` — Existing model config (Phase 2) to be extended with cli section

### Stack
- `CLAUDE.md` §Recommended Stack — tRPC v11, TypeScript, node:util parseArgs

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **CLI entrypoint** (`packages/api/src/cli.ts`): parseArgs pattern, COMMANDS array, healthCheck-before-command pattern. Refactor to use tRPC client instead of direct engine calls.
- **Command files** (`packages/api/src/commands/`): 8 command implementations. Each bootstraps deps and calls engine functions. These become the templates for tRPC-backed commands.
- **tRPC routers** (`packages/web/src/trpc/routers/`): 5 routers covering all dashboard features. CLI will call these same procedures via HTTP.
- **SSE endpoint** (`/api/events/[projectId]`): CLI logs streaming can use EventSource or fetch with SSE parsing.

### Established Patterns
- **node:util parseArgs**: Used in existing CLI. Keep for v1 — zero external dependencies for arg parsing.
- **Bootstrap pattern**: `bootstrap()` creates deps (db, gateway, etc.). With tRPC client, most of this moves server-side.
- **healthCheck()**: Checks Postgres + Inngest. Extend to also check web server availability.

### Integration Points
- **packages/trpc-types** (new): Extract AppRouter type from packages/web. Both web and api depend on it.
- **@trpc/client** in packages/api: New dependency — HTTP client calling web server's /api/trpc.
- **Webhook Route Handler** in packages/web: New /api/webhook/git endpoint receiving GitHub push events.
- **cauldron.config.ts**: Extend with cli section (serverUrl, apiKey, webhook secret).

</code_context>

<specifics>
## Specific Ideas

- The CLI output style (colored tables with bead status) should echo the HZD aesthetic — teal for success, amber for active, red for failed. The Cauldron hex icon could appear in the CLI banner.
- 'cauldron logs' prefixed output should use distinct colors per bead to distinguish interleaved output, similar to 'docker compose logs'.
- Auto-start of the web server should be non-blocking — start in background, wait for health check to pass, then proceed with the command.

</specifics>

<deferred>
## Deferred Ideas

- GitLab/Bitbucket webhook support — v2
- Standalone binary distribution (pkg/esbuild) — v2/OSS release
- Multi-user auth (OAuth, session tokens) — v2 when remote deployment supported
- 'cauldron deploy' command — explicitly out of scope per PROJECT.md

</deferred>

---

*Phase: 09-cli*
*Context gathered: 2026-03-27*
