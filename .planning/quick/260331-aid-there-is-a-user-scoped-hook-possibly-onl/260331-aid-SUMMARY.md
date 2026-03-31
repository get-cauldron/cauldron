---
phase: quick
plan: 260331-aid
subsystem: agent-hooks
tags: [hooks, codex, claude, execution, docs]
dependency_graph:
  requires: [git-worktrees, codex-hook-runtime, claude-project-settings]
  provides: [shared-no-excuses-guard, repo-scoped-hook-config, install-guidance]
  affects: [codex-stop-hooks, claude-stop-hooks, execution-worktree-behavior]
tech_stack:
  added: []
  patterns: [repo-scoped-hooks, shared-hook-script, stop-hook-continuation, git-root-path-resolution]
key_files:
  created:
    - .codex/config.toml
    - .codex/hooks.json
    - .claude/settings.json
    - scripts/agent-hooks/no-excuses-guard.js
    - scripts/agent-hooks/no-excuses-guard.test.js
  modified:
    - README.md
decisions:
  - "Kept protection hook-only per explicit user direction; no prompt hardening was added to Cauldron's runtime prompts"
  - "Used one shared guard script for both Claude and Codex instead of duplicating logic in runtime-specific hook files"
  - "Resolved the hook script from the git root so repo-local config still works when Codex or Claude starts from a subdirectory or execution worktree"
metrics:
  duration: 24min
  completed: "2026-03-31T14:02:00Z"
---

# Quick Task 260331-aid: Repo-Scoped No-Excuses Guard

**One-liner:** Cauldron now carries a stricter no-excuses guard in tracked repo files for Claude and Codex, and the install docs explain how git worktrees inherit it during execution.

## What Was Done

### Task 1: Broaden and harden the guard itself (67ef1e3)

Added a shared hook script at `scripts/agent-hooks/no-excuses-guard.js` that blocks a wider excuse set than the home-directory Claude version, including:

- pre-existing / already broken / already failing
- known / legacy / upstream / inherited issue language
- unrelated-to-my-changes language
- outside-scope / follow-up-later / leave-it-as-is language

The script also tolerates different hook payload shapes by extracting assistant text from both the simple `last_assistant_message` shape and nested message/content structures.

### Task 2: Add repo-scoped Claude and Codex hook wiring (67ef1e3)

Added:

- `.codex/config.toml` with `features.codex_hooks = true`
- `.codex/hooks.json` with a repo-local `Stop` hook
- `.claude/settings.json` with `Stop` and `SubagentStop` hooks

Both runtimes call the shared guard from the git root, which keeps the path stable in the main repo and in git worktrees created during execution.

### Task 3: Include the guard in Cauldron installation guidance (67ef1e3)

Updated `README.md` Quickstart with a dedicated hook-guard step that explains:

- the guard ships in tracked repo files
- execution worktrees inherit those files automatically
- Codex hooks are still under development, so protection depends on a hook-capable Codex build

## Deviations from Plan

None.

## Verification

- `node --test scripts/agent-hooks/no-excuses-guard.test.js`
- `printf '%s' '{"last_assistant_message":"This is a known issue in legacy code, so I left it as-is."}' | node scripts/agent-hooks/no-excuses-guard.js`

## Self-Check: PASSED
