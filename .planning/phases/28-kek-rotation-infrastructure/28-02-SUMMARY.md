---
phase: 28-kek-rotation-infrastructure
plan: "02"
subsystem: cli
tags: [kek-rotation, security, cli, operator-tools]
dependency_graph:
  requires: [28-01]
  provides: [rotate-kek-cli-command]
  affects: [packages/cli]
tech_stack:
  added: []
  patterns: [direct-db-cli-pattern, env-var-key-injection]
key_files:
  created:
    - packages/cli/src/commands/rotate-kek.ts
  modified:
    - packages/cli/src/cli.ts
decisions:
  - KEK keys injected exclusively via env vars (never CLI args) to prevent shell history exposure
  - Retire is always a separate invocation from rotate — enforced by distinct --retire-old mode
  - --new-key-env accepts the env var name (not the key value) so operators can name their key vars
metrics:
  duration: "204s"
  completed: "2026-04-02T14:23:55Z"
  tasks_completed: 1
  files_created: 1
  files_modified: 1
---

# Phase 28 Plan 02: KEK Rotation CLI Command Summary

Wire KEK rotation infrastructure into `cauldron rotate-kek` with --init, default rotation, and --retire-old modes backed by `@get-cauldron/engine` rotation functions.

## Tasks Completed

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | Create rotate-kek CLI command and register it | 4ca083c | Done |

## What Was Built

### `packages/cli/src/commands/rotate-kek.ts` (new)

CLI command implementing three modes:

**Mode 1: `--init`** — First-time setup. Reads `HOLDOUT_ENCRYPTION_KEY` from env, decodes base64 to Buffer, validates 32 bytes, calls `initKekVersion(db, { kek, label })`. Prints version number and fingerprint prefix. `--json` outputs `{ version, fingerprint, label }`.

**Mode 2: Default rotation** — Reads old key from `HOLDOUT_ENCRYPTION_KEY` and new key from the env var named by `--new-key-env` (default: `HOLDOUT_ENCRYPTION_KEY_NEW`). Both validated as 32-byte buffers. Calls `rotateKek(db, { oldKek, newKek, newKekLabel })`. Prints progress and post-rotation operator reminders. `--json` outputs `RotationResult`.

**Mode 3: `--retire-old --old-version N`** — Calls `retireKek(db, { kekVersion })` after parsing and validating the version integer. Prints confirmation message. `--json` outputs `{ retired: true, version: N }`.

All modes wrap errors in try/catch with `chalk.red` output and `process.exit(1)`. Keys never appear in CLI args.

### `packages/cli/src/cli.ts` (updated)

- Import added: `rotateKekCommand` from `./commands/rotate-kek.js`
- `'rotate-kek'` added to `COMMANDS` array
- Direct-DB dispatch block inserted after `verify` block, before `bootstrapClient`
- Usage line added under Management commands in `printUsage()`

## Verification Results

- All acceptance criteria pass (grep checks confirmed)
- `pnpm -F @get-cauldron/engine test`: 465 pass, 10 fail (pre-existing: inngest package not in test env)
- Typecheck: no errors introduced by rotate-kek.ts (pre-existing engine inngest errors unrelated)
- Build: pre-existing failure in engine (inngest module not found) — unrelated to this plan

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. The command wires directly to engine rotation functions.

## Self-Check: PASSED

- `packages/cli/src/commands/rotate-kek.ts`: FOUND
- `packages/cli/src/cli.ts` (contains `rotate-kek`): FOUND
- Commit `4ca083c`: FOUND
