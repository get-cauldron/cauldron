# Phase 9: CLI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-27
**Phase:** 09-cli
**Areas discussed:** tRPC sharing strategy, Command surface, Git-push triggers, Output formatting, Config file, Auth/security, Package distribution

---

## tRPC Sharing Strategy

### How CLI shares tRPC types

| Option | Description | Selected |
|--------|-------------|----------|
| CLI as tRPC HTTP client | Calls running web server's /api/trpc. True zero-drift. | ✓ |
| Extract routers to shared package | Move routers from web to shared. CLI calls directly. | |
| Type-only sharing | Export AppRouter type, CLI builds own API calls. | |

**User's choice:** CLI as tRPC HTTP client

### Server not running

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-start if needed | CLI starts Next.js dev server in background | ✓ |
| Error with instructions | Fail fast, user manages server | |
| You decide | | |

**User's choice:** Auto-start if needed

### Type import approach

| Option | Description | Selected |
|--------|-------------|----------|
| Direct import from @cauldron/web | Workspace dependency | |
| Extract to packages/trpc-types | New package re-exports AppRouter type | ✓ |
| You decide | | |

**User's choice:** Extract to packages/trpc-types

---

## Command Surface

### Command set

| Option | Description | Selected |
|--------|-------------|----------|
| Mirror dashboard 1:1 | Add projects, logs, costs, evolution. ~12 commands. | ✓ |
| Unified run command | Collapse into single 'cauldron run' | |
| You decide | | |

**User's choice:** Mirror dashboard 1:1

### Interview UX

| Option | Description | Selected |
|--------|-------------|----------|
| Interactive terminal | Questions in stdout, numbered MC options | |
| Open browser | Launch dashboard interview page | |
| Both modes | --interactive (default) + --browser flag | ✓ |

**User's choice:** Both modes

### Run convenience command

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, add 'cauldron run' | Pipelines full flow end-to-end | ✓ |
| No, keep separate | Users compose themselves | |
| You decide | | |

**User's choice:** Yes, add 'cauldron run'

### Logs streaming

| Option | Description | Selected |
|--------|-------------|----------|
| Stream by default | SSE-backed, like 'docker logs -f' | ✓ |
| Snapshot + follow flag | Recent logs default, --follow for stream | |
| You decide | | |

**User's choice:** Stream by default

---

## Git-Push Triggers

### Trigger mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Webhook server | Next.js Route Handler, GitHub HMAC validation | ✓ |
| Local git hook | post-push hook calling 'cauldron run' | |
| GitHub App | Full OAuth integration | |
| You decide | | |

**User's choice:** Webhook server

### Platform support

| Option | Description | Selected |
|--------|-------------|----------|
| GitHub-only for v1 | HMAC-SHA256, GitHub payload format | ✓ |
| GitHub + GitLab | Both formats | |
| You decide | | |

**User's choice:** GitHub-only for v1

### Mid-pipeline push

| Option | Description | Selected |
|--------|-------------|----------|
| Queue and notify | Queue event, re-run if needed after current finishes | ✓ |
| Reject with status | 409 Conflict, drop the event | |
| You decide | | |

**User's choice:** Queue and notify

---

## Output Formatting

### Default style

| Option | Description | Selected |
|--------|-------------|----------|
| Colored text + tables | Human-readable, --json for machine | ✓ |
| Minimal plain text | No colors, pipe-friendly | |
| You decide | | |

**User's choice:** Colored text + tables

### Log rendering

| Option | Description | Selected |
|--------|-------------|----------|
| Prefixed lines | [bead-name] in color, interleaved | ✓ |
| Split panes | Terminal UI sections per bead | |
| You decide | | |

**User's choice:** Prefixed lines

---

## Config File

### Config location

| Option | Description | Selected |
|--------|-------------|----------|
| Existing cauldron.config.ts | Extend with 'cli' section | ✓ |
| Separate .cauldronrc | New config file | |
| Environment variables only | No config file | |

**User's choice:** Existing cauldron.config.ts

---

## Auth/Security

### Authentication

| Option | Description | Selected |
|--------|-------------|----------|
| Trust-local for v1 | No auth, both on localhost | |
| API key from config | Key in Authorization header | ✓ |
| You decide | | |

**User's choice:** API key from config

### Key generation

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-generate on first run | node:crypto, store in config + server env | ✓ |
| Manual setup command | 'cauldron auth setup' | |
| You decide | | |

**User's choice:** Auto-generate on first run

---

## Package Distribution

### Installation

| Option | Description | Selected |
|--------|-------------|----------|
| Monorepo-local for v1 | pnpm cauldron, no global install | |
| npm global package | npm i -g @cauldron/cli | ✓ |
| Standalone binary | Bundle with pkg/esbuild | |

**User's choice:** npm global package

---

## Claude's Discretion

- Terminal UI library choice
- Flag naming conventions
- Error message formatting
- Pipeline progress reporting
- Webhook secret storage mechanism

## Deferred Ideas

- GitLab/Bitbucket webhook support — v2
- Standalone binary — v2/OSS
- Multi-user auth — v2
- 'cauldron deploy' — out of scope
