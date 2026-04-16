# Phase 1: Monorepo Foundation - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Scaffold a Turborepo monorepo with 9 package stubs, CI boundary enforcement (zero circular deps + cross-boundary import prevention), Vitest per package, and TypeScript project references — in a fresh repo at `get-cauldron/cauldron`. No feature code. Every package imports by name, builds via `turbo build`, and passes at least one test.

</domain>

<decisions>
## Implementation Decisions

### Package Map
- **D-01:** Scaffold all 9 target packages as empty stubs: `@get-cauldron/types`, `@get-cauldron/native`, `@get-cauldron/ai`, `@get-cauldron/agent-core`, `@get-cauldron/tools`, `@get-cauldron/workflow`, `@get-cauldron/session`, `@get-cauldron/tui`, `@get-cauldron/mcp-server`
- **D-02:** Each stub is minimal (~10 lines): `index.ts` exporting one typed constant, a `package.json`, a `tsconfig.json`, and a Vitest test importing the constant by package name
- **D-03:** Wire the full dependency DAG from the roadmap: types is the root, ai and agent-core depend on types, tools depends on agent-core + native, workflow depends on agent-core, session depends on ai + agent-core + tools + workflow, tui depends on session

### Test Runner
- **D-04:** Use Vitest with `@vitest/coverage-v8` as the project-wide test framework
- **D-05:** Configure Vitest workspace/projects mode for cross-package coverage from root
- **D-06:** Each package has a `vitest.config.ts`; root config aggregates via `projects:`
- **D-07:** Turborepo `test` task runs Vitest per package with caching

### Boundary Enforcement
- **D-08:** Use dependency-cruiser as the single tool for both circular dependency detection and cross-boundary import prevention
- **D-09:** Configure TypeScript project references (`composite: true`) as the compiler-level baseline — cross-package relative imports fail at `tsc --build` before dependency-cruiser runs
- **D-10:** dependency-cruiser rule DSL encodes: (a) zero circular dependencies, (b) no relative imports that cross a package boundary — packages must import by `@get-cauldron/*` name
- **D-11:** CI fails the build if dependency-cruiser finds any violation

### Starting Point
- **D-12:** Create a fresh repo at `get-cauldron/cauldron` with clean git history
- **D-13:** Copy `.planning/` directory (252KB of roadmap/requirements/state artifacts) into the new repo
- **D-14:** Copy `native/crates/` (Rust crate source) into the new repo — these are the "worth keeping" assets from GSD-2
- **D-15:** Do NOT copy GSD-2's `packages/`, `src/`, `web/`, `studio/`, or any other TypeScript code — Cauldron is built from scratch

### Claude's Discretion
- CI workflow structure (GitHub Actions YAML layout, job names, matrix strategy)
- Turborepo `turbo.json` pipeline configuration details
- dependency-cruiser `.dependency-cruiser.cjs` rule specifics beyond the two stated invariants
- tsconfig.json settings beyond `composite: true` and `strict: true`
- Package stub content beyond the minimum (index.ts + test + package.json + tsconfig.json)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context
- `.planning/PROJECT.md` — Vision, constraints, what to keep/not keep from GSD-2, key decisions
- `.planning/REQUIREMENTS.md` — FOUND-01 through FOUND-08 and ID-01 through ID-03 (monorepo foundation, boundary enforcement, test infrastructure, identity)
- `.planning/ROADMAP.md` — Phase 1 success criteria, full dependency DAG across 11 phases

### Codebase Reference (GSD-2 — for patterns to carry forward)
- `.planning/codebase/STRUCTURE.md` — Current directory layout and package organization
- `.planning/codebase/CONVENTIONS.md` — Naming patterns, code style, import conventions
- `.planning/codebase/STACK.md` — Technology stack, module system, workspace configuration

### Native Crates (to copy)
- `native/crates/engine/` — Main N-API addon (Rust source to carry forward)
- `native/crates/ast/` — AST parsing crate
- `native/crates/grep/` — Grep engine crate
- `native/Cargo.toml` — Rust workspace config

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `native/crates/` — Rust N-API crates (engine, ast, grep) are well-structured and carry forward as-is with rename from `gsd-*` to `cauldron-*`
- `native/npm/` — Platform-specific binary package templates for optional deps pattern
- `.github/workflows/build-native.yml` — Cross-platform Rust compilation workflow (pattern reference, not direct copy)

### Established Patterns
- ESM throughout with NodeNext module resolution (except native CJS) — carry forward
- `.js` extensions in package import paths (required by NodeNext) — carry forward
- `kebab-case.ts` file naming — carry forward
- Named exports, no default exports — carry forward
- `import type` for type-only imports — carry forward
- TypeScript strict mode — carry forward

### Integration Points
- New repo needs npm workspace config pointing at `packages/*`
- Turborepo config (`turbo.json`) at root with `build`, `test`, `lint` pipeline tasks
- Root `tsconfig.json` with project references to all 9 packages
- GitHub Actions CI calling `turbo build`, `turbo test`, and `npx depcruise`

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches for Turborepo scaffold, Vitest workspace config, and dependency-cruiser rules.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-monorepo-foundation*
*Context gathered: 2026-04-16*
