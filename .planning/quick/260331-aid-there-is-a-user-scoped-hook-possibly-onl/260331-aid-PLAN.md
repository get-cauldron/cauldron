---
phase: quick
plan: 260331-aid
type: execute
wave: 1
depends_on: []
files_modified:
  - .codex/config.toml
  - .codex/hooks.json
  - .claude/settings.json
  - scripts/agent-hooks/no-excuses-guard.js
  - scripts/agent-hooks/no-excuses-guard.test.js
  - README.md
autonomous: true
requirements: []
must_haves:
  truths:
    - "The no-excuses guard is broader and stricter than the current user-scoped Claude version"
    - "Codex gets a repo-scoped Stop hook and the repo enables `features.codex_hooks = true`"
    - "Claude gets a repo-scoped guard for `Stop` and `SubagentStop`"
    - "Cauldron installation docs explain that tracked hook files propagate into execution worktrees"
  artifacts:
    - path: ".codex/config.toml"
      provides: "Repo-local Codex feature flag enabling hooks"
    - path: ".codex/hooks.json"
      provides: "Repo-local Codex Stop hook wiring"
    - path: ".claude/settings.json"
      provides: "Repo-local Claude Stop/SubagentStop hook wiring"
    - path: "scripts/agent-hooks/no-excuses-guard.js"
      provides: "Shared no-excuses guard implementation for both runtimes"
    - path: "scripts/agent-hooks/no-excuses-guard.test.js"
      provides: "Automated coverage for the broader guard behavior"
    - path: "README.md"
      provides: "Installation/setup guidance for hook-backed execution protection"
  key_links:
    - from: ".codex/hooks.json"
      to: "scripts/agent-hooks/no-excuses-guard.js"
      via: "Codex Stop hook command"
      pattern: "no-excuses-guard\\.js"
    - from: ".claude/settings.json"
      to: "scripts/agent-hooks/no-excuses-guard.js"
      via: "Claude Stop/SubagentStop hook command"
      pattern: "no-excuses-guard\\.js"
---

<objective>
Add a stricter repo-scoped no-excuses guard for Claude and Codex, enable Codex hooks for this repo, and document how Cauldron installation/execution inherits the protection through tracked worktree files.

Purpose: move this protection out of a one-off user-scoped Claude hook and into Cauldron itself so supported agent runtimes pick it up automatically.
Output: repo-local hook config, shared guard logic, verification coverage, and updated install docs.
</objective>

<tasks>

<task type="auto">
  <name>Task 1: Replace the one-off guard with a stricter shared implementation</name>
  <files>scripts/agent-hooks/no-excuses-guard.js, scripts/agent-hooks/no-excuses-guard.test.js</files>
  <action>
Create a shared hook script that catches a broader set of deflection patterns: pre-existing, known, legacy, upstream, unrelated, outside-scope, follow-up-later, and leave-as-is language. Make the parser resilient to Claude/Codex stop payload variations, and add a focused automated test for the behavior.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/cauldron && node --test scripts/agent-hooks/no-excuses-guard.test.js</automated>
  </verify>
  <done>The shared guard blocks the broader excuse set and has passing automated coverage.</done>
</task>

<task type="auto">
  <name>Task 2: Wire the guard into repo-scoped Claude and Codex hooks</name>
  <files>.codex/config.toml, .codex/hooks.json, .claude/settings.json</files>
  <action>
Enable Codex hooks at the repo level and add a repo-local Stop hook that points at the shared guard from the git root. Add matching Claude project settings for `Stop` and `SubagentStop` so the repo carries the same protection in worktrees without depending on a user home-directory hook.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/cauldron && printf '%s' '{"last_assistant_message":"This is a known issue in legacy code, so I left it as-is."}' | node scripts/agent-hooks/no-excuses-guard.js</automated>
  </verify>
  <done>Both runtimes have repo-scoped hook config that resolves the shared guard from the git root.</done>
</task>

<task type="auto">
  <name>Task 3: Document how Cauldron installation/execution gets the protection</name>
  <files>README.md</files>
  <action>
Update Quickstart to explain that Cauldron now ships the hook guard in tracked repo files, that git worktrees inherit those files automatically, and that Codex hooks are still under development so protection only exists when the host Codex build supports hooks.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/cauldron && rg -n "Agent hook guard is included in the repo|codex_hooks = true|git worktrees" README.md .codex/config.toml .codex/hooks.json .claude/settings.json</automated>
  </verify>
  <done>The install docs describe how the guard lands in execution worktrees and the Codex support caveat.</done>
</task>

</tasks>

<verification>
1. `node --test scripts/agent-hooks/no-excuses-guard.test.js`
2. `printf '%s' '{"last_assistant_message":"This is a known issue in legacy code, so I left it as-is."}' | node scripts/agent-hooks/no-excuses-guard.js`
3. `rg -n "Agent hook guard is included in the repo|codex_hooks = true|git worktrees" README.md .codex/config.toml .codex/hooks.json .claude/settings.json`
</verification>

<success_criteria>
- The guard blocks broader excuse/deflection language than the current home-dir Claude script
- Codex hooks are enabled at the repo level and the repo-local Stop hook is configured
- Claude project settings apply the same guard to Stop and SubagentStop
- Installation docs explain why execution worktrees inherit the guard and note the Codex maturity caveat
</success_criteria>

<output>
After completion, create `.planning/quick/260331-aid-there-is-a-user-scoped-hook-possibly-onl/260331-aid-SUMMARY.md`
</output>
