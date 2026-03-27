# Phase 13: Re-scope to @get-cauldron/* - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-27
**Phase:** 13-re-scope-to-get-cauldron-already-have-the-github-and-npm-orgs
**Areas discussed:** Scope & naming, Migration strategy, Registry & publishing, Phase goal & criteria

---

## Scope & Naming

### Package Names

| Option | Description | Selected |
|--------|-------------|----------|
| Direct rename | Same names under new scope: @get-cauldron/cli, etc. | |
| Rename + consolidate | Take the opportunity to rename or merge some packages | ✓ |
| Rename + restructure | New scope AND reorganize package boundaries | |

**User's choice:** Rename + consolidate
**Notes:** User wants to merge packages and rename directories, not just swap scope prefix.

### Consolidation Targets

| Option | Description | Selected |
|--------|-------------|----------|
| Merge trpc-types into shared | Fold type definitions into @get-cauldron/shared | |
| Merge api into cli | Rename packages/api directory to packages/cli | |
| Both merges | Merge trpc-types into shared AND rename api dir to cli | ✓ |
| Custom plan | Different consolidation in mind | |

**User's choice:** Both merges

### Directory Rename

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, rename directory | packages/api → packages/cli | ✓ |
| No, keep packages/api | Only change package.json name | |

**User's choice:** Yes, rename directory

---

## Migration Strategy

### Execution Approach

| Option | Description | Selected |
|--------|-------------|----------|
| Big-bang rename | One atomic commit, clean break | ✓ |
| Phased rename | One package at a time across multiple commits | |
| Alias bridge | TypeScript path aliases for gradual migration | |

**User's choice:** Big-bang rename

### Documentation Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, update everything | CLAUDE.md, planning docs, config files, README | ✓ |
| Source only | Only package.json, TypeScript imports, workspace config | |
| You decide | Claude's discretion on non-source files | |

**User's choice:** Yes, update everything

---

## Registry & Publishing

### Publishing Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Internal rename only | Just rename within monorepo, no npm publishing | ✓ |
| Set up npm publishing | Configure npm org, publish scripts, CI workflows | |
| Reserve names only | Publish empty placeholders to reserve names | |

**User's choice:** Internal rename only

---

## Phase Goal & Criteria

### Proposed Goal & Criteria

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, looks right | Use proposed goal and success criteria | ✓ |
| Adjust criteria | Modify some of the success criteria | |
| Broader scope | Phase should include more than just the rename | |

**User's choice:** Yes, looks right

---

## Claude's Discretion

- trpc-types → shared merge strategy (re-export structure, directory layout within shared)
- turbo.json filter pattern updates
- Docker Compose / CI config path updates

## Deferred Ideas

- npm publishing setup and CI workflows — future phase when open-sourcing
- Package versioning strategy — not needed until publishing
