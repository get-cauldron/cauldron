# Phase 13: Re-scope to @get-cauldron/* - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Rename the npm package scope from `@cauldron/*` to `@get-cauldron/*` across the entire monorepo. Consolidate `@cauldron/trpc-types` into `@get-cauldron/shared`. Rename `packages/api` directory to `packages/cli`. Update all source files, config files, workspace deps, and documentation.

**Goal:** Rename npm scope from `@cauldron/*` to `@get-cauldron/*`, consolidate `trpc-types` into `shared`, rename `packages/api` to `packages/cli`, and update all references project-wide.

**Success Criteria:**
1. All package.json `name` fields use `@get-cauldron/*` scope
2. `@cauldron/trpc-types` package no longer exists — its exports live in `@get-cauldron/shared`
3. `packages/api` directory renamed to `packages/cli`
4. Zero occurrences of `@cauldron/` in source files, imports, or workspace deps
5. All tests pass, typecheck passes, build succeeds after rename
6. CLAUDE.md and planning docs updated to reference new scope

</domain>

<decisions>
## Implementation Decisions

### Scope & Naming
- **D-01:** New scope is `@get-cauldron/*` (user already has the GitHub and npm orgs)
- **D-02:** Package mapping:
  - `@cauldron/cli` (packages/api) → `@get-cauldron/cli` (packages/cli)
  - `@cauldron/engine` (packages/engine) → `@get-cauldron/engine` (packages/engine)
  - `@cauldron/shared` (packages/shared) → `@get-cauldron/shared` (packages/shared)
  - `@cauldron/trpc-types` (packages/trpc-types) → merged into `@get-cauldron/shared`
  - `@cauldron/web` (packages/web) → `@get-cauldron/web` (packages/web)
- **D-03:** Directory `packages/api` renamed to `packages/cli` to align with package name
- **D-04:** `trpc-types` package eliminated — its type exports folded into `@get-cauldron/shared`

### Migration Strategy
- **D-05:** Big-bang rename in one atomic commit (or minimal commit set). No transitional state, no backward compat aliases.
- **D-06:** All references updated — source files, imports, workspace deps, package.json, CLAUDE.md, planning docs, config files, README. Clean break.

### Registry & Publishing
- **D-07:** Internal rename only. No npm publishing in this phase. Publishing is a future concern for open-sourcing.

### Claude's Discretion
- How to handle the trpc-types → shared merge (re-export strategy, directory structure within shared)
- Whether to update turbo.json filter patterns if they reference package names
- How to handle any Docker Compose or CI config that references old paths

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs — requirements fully captured in decisions above.

### Workspace Config
- `pnpm-workspace.yaml` — Workspace glob definition (packages/*)
- `turbo.json` — Task runner config, may reference package names

### Package Manifests
- `packages/api/package.json` — Current @cauldron/cli manifest (directory rename target)
- `packages/engine/package.json` — Current @cauldron/engine manifest
- `packages/shared/package.json` — Current @cauldron/shared manifest (merge target for trpc-types)
- `packages/trpc-types/package.json` — Current @cauldron/trpc-types manifest (to be eliminated)
- `packages/web/package.json` — Current @cauldron/web manifest

### Project Docs
- `CLAUDE.md` — Contains @cauldron/* references throughout technology stack docs

</canonical_refs>

<code_context>
## Existing Code Insights

### Scope of Change
- 5 packages currently under `@cauldron/*` scope
- 75 source files import `@cauldron/*` packages
- 6 workspace dependency references (`workspace:*`) across package.json files
- `pnpm-workspace.yaml` uses `packages/*` glob (no package name references)

### Key Import Patterns
- `@cauldron/shared` is imported by: engine, api/cli, web
- `@cauldron/engine` is imported by: api/cli, web
- `@cauldron/trpc-types` is imported by: api/cli, web (type-only imports)

### Integration Points
- Inngest function registration may reference package paths
- Docker Compose and dev scripts may reference `packages/api` path
- turbo.json may have package-specific filter/task config

</code_context>

<specifics>
## Specific Ideas

- User already owns the `@get-cauldron` GitHub org and npm org — naming is confirmed
- The rename is preparation for eventual open-sourcing

</specifics>

<deferred>
## Deferred Ideas

- npm publishing setup and CI workflows — future phase when open-sourcing
- Package versioning strategy — not needed until publishing

</deferred>

---

*Phase: 13-re-scope-to-get-cauldron-already-have-the-github-and-npm-orgs*
*Context gathered: 2026-03-27*
