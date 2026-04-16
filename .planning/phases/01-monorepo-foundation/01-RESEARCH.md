# Phase 1: Monorepo Foundation - Research

**Researched:** 2026-04-16
**Domain:** Monorepo tooling (pnpm + Turborepo + Vitest + TypeScript project references + dependency-cruiser)
**Confidence:** HIGH

## Summary

Phase 1 scaffolds a greenfield Turborepo monorepo with 9 package stubs, boundary enforcement, and test infrastructure. The toolchain is well-established: pnpm workspaces for package management, Turborepo for build orchestration with caching, Vitest for testing with V8 coverage, TypeScript project references for compile-order enforcement, and dependency-cruiser for circular dependency detection and cross-boundary import prevention.

The critical nuance is artifact-honest testing (FOUND-04): tests must import from built `dist/` output via package name, not from source files. This requires careful `package.json` `exports` configuration and Vitest resolve settings that do not short-circuit to source. The two Vitest modes (workspace/projects for dev, per-package turbo tasks for CI) resolve an apparent conflict in the context decisions.

**Primary recommendation:** Scaffold per-package `vitest.config.ts` with coverage thresholds, wire `turbo test` for CI caching, and use a root `vitest.workspace.ts` for IDE/dev convenience only.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Scaffold all 9 target packages as empty stubs: `@get-cauldron/types`, `@get-cauldron/native`, `@get-cauldron/ai`, `@get-cauldron/agent-core`, `@get-cauldron/tools`, `@get-cauldron/workflow`, `@get-cauldron/session`, `@get-cauldron/tui`, `@get-cauldron/mcp-server`
- **D-02:** Each stub is minimal (~10 lines): `index.ts` exporting one typed constant, a `package.json`, a `tsconfig.json`, and a Vitest test importing the constant by package name
- **D-03:** Wire the full dependency DAG from the roadmap: types is the root, ai and agent-core depend on types, tools depends on agent-core + native, workflow depends on agent-core, session depends on ai + agent-core + tools + workflow, tui depends on session
- **D-04:** Use Vitest with `@vitest/coverage-v8` as the project-wide test framework
- **D-05:** Configure Vitest workspace/projects mode for cross-package coverage from root
- **D-06:** Each package has a `vitest.config.ts`; root config aggregates via `projects:`
- **D-07:** Turborepo `test` task runs Vitest per package with caching
- **D-08:** Use dependency-cruiser as the single tool for both circular dependency detection and cross-boundary import prevention
- **D-09:** Configure TypeScript project references (`composite: true`) as the compiler-level baseline
- **D-10:** dependency-cruiser rule DSL encodes: (a) zero circular dependencies, (b) no relative imports that cross a package boundary
- **D-11:** CI fails the build if dependency-cruiser finds any violation
- **D-12:** Create a fresh repo at `get-cauldron/cauldron` with clean git history
- **D-13:** Copy `.planning/` directory into the new repo
- **D-14:** Copy `native/crates/` (Rust crate source) into the new repo
- **D-15:** Do NOT copy GSD-2's `packages/`, `src/`, `web/`, `studio/`, or any other TypeScript code

### Claude's Discretion
- CI workflow structure (GitHub Actions YAML layout, job names, matrix strategy)
- Turborepo `turbo.json` pipeline configuration details
- dependency-cruiser `.dependency-cruiser.cjs` rule specifics beyond the two stated invariants
- tsconfig.json settings beyond `composite: true` and `strict: true`
- Package stub content beyond the minimum (index.ts + test + package.json + tsconfig.json)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FOUND-01 | Monorepo uses pnpm + Turborepo with workspace boundary enforcement | Turborepo turbo.json task config, pnpm-workspace.yaml, dependency-cruiser rules |
| FOUND-02 | Zero circular dependencies enforced in CI (madge or equivalent) | dependency-cruiser `no-circular` rule with severity `error`, CI script |
| FOUND-03 | Repo-wide TypeScript typecheck with no suppression flags | TS project references with `composite: true`, `tsc --build` at root |
| FOUND-04 | All tests run against real build artifacts, not synthetic rewrites | Package `exports` pointing to `dist/`, Vitest imports by package name |
| FOUND-05 | Vitest test infrastructure with mocked + live test layers | Vitest workspace config, per-package `vitest.config.ts` |
| FOUND-06 | Fixture recording/replay system for deterministic LLM response testing | Infrastructure setup only (no LLM code in Phase 1) -- scaffold fixture utilities |
| FOUND-07 | Coverage thresholds enforced: 80/80/60/60 minimum | Per-package `vitest.config.ts` coverage thresholds |
| FOUND-08 | CI pipeline: typecheck, boundary enforcement, test cube, cross-platform | GitHub Actions workflow with `tsc --build`, `depcruise`, `turbo test` |
| ID-01 | All packages use @get-cauldron/* npm scope | Package naming in all 9 stubs |
| ID-02 | No Pi or GSD references in source code, configs, or documentation | Rename Cargo.toml authors/repo, verify all configs |
| ID-03 | Single documentation system | One approach from Phase 1 onward |

</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Package scaffolding | Build System | -- | pnpm workspaces + package.json structure |
| Build orchestration | Build System | -- | Turborepo task graph, caching |
| Type compilation | Build System | -- | TypeScript project references, `tsc --build` |
| Boundary enforcement | Build System (CI) | -- | dependency-cruiser lint step in CI |
| Test execution | Build System | -- | Vitest per-package, turbo-cached |
| Coverage thresholds | Build System | -- | Per-package vitest.config.ts thresholds |
| Native crate compilation | Build System | -- | Cargo workspace (copied, not built in Phase 1) |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pnpm | 10.33.0 | Package manager with workspace support | [VERIFIED: npm registry] Strict dependency hoisting, workspace protocol |
| turborepo | 2.9.6 | Build orchestration with remote caching | [VERIFIED: npm registry] Industry standard for TS monorepos |
| typescript | 6.0.2 | Type checking and compilation | [VERIFIED: npm registry] Latest stable, project references support |
| vitest | 4.1.4 | Test runner | [VERIFIED: npm registry] Native ESM, workspace mode, TS-first |
| @vitest/coverage-v8 | 4.1.4 | V8-based code coverage | [VERIFIED: npm registry] Matches vitest version, no pre-transpile step |
| dependency-cruiser | 17.3.10 | Dependency analysis and rule enforcement | [VERIFIED: npm registry] Circular detection + boundary rules in one tool |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/node | latest | Node.js type definitions | All packages needing `process`, `Buffer`, etc. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| dependency-cruiser | madge + eslint-plugin-boundaries | Two tools instead of one; madge can't enforce import rules |
| Vitest | Node built-in test runner | GSD-2 uses it, but lacks workspace mode and coverage thresholds |
| pnpm | npm | npm workspaces are less strict about hoisting, no workspace protocol |

**Installation:**
```bash
pnpm add -D turborepo typescript vitest @vitest/coverage-v8 dependency-cruiser @types/node
```

## Architecture Patterns

### System Architecture Diagram

```
pnpm-workspace.yaml
        |
        v
  [pnpm install] -- resolves workspace:* protocol links
        |
        v
  turbo.json task graph
        |
        +---> turbo build ---> tsc --build (per package, dependency order)
        |                         |
        |                         +---> packages/types/dist/
        |                         +---> packages/ai/dist/
        |                         +---> ... (9 packages)
        |
        +---> turbo test ----> vitest run --coverage (per package)
        |                         |
        |                         +---> imports from dist/ by package name
        |                         +---> coverage thresholds 80/80/60/60
        |
        +---> turbo lint ----> depcruise (per package or root)
                                  |
                                  +---> no-circular rule
                                  +---> no-cross-boundary-import rule
```

### Recommended Project Structure
```
cauldron/
├── .github/
│   └── workflows/
│       └── ci.yml                    # typecheck + boundary + test
├── .planning/                        # Copied from GSD-2
├── native/
│   ├── Cargo.toml                    # Renamed authors/repo
│   └── crates/                       # Copied from GSD-2
│       ├── ast/
│       ├── engine/
│       └── grep/
├── packages/
│   ├── types/                        # @get-cauldron/types (DAG root)
│   │   ├── src/
│   │   │   └── index.ts
│   │   ├── tests/
│   │   │   └── index.test.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vitest.config.ts
│   ├── native/                       # @get-cauldron/native
│   ├── ai/                           # @get-cauldron/ai
│   ├── agent-core/                   # @get-cauldron/agent-core
│   ├── tools/                        # @get-cauldron/tools
│   ├── workflow/                     # @get-cauldron/workflow
│   ├── session/                      # @get-cauldron/session
│   ├── tui/                          # @get-cauldron/tui
│   └── mcp-server/                   # @get-cauldron/mcp-server
├── .dependency-cruiser.cjs           # Boundary + circular rules
├── package.json                      # Root workspace config
├── pnpm-workspace.yaml               # packages: ["packages/*"]
├── tsconfig.json                     # Root solution file with references
├── turbo.json                        # Task definitions
└── vitest.workspace.ts               # Dev/IDE convenience only
```

### Pattern 1: Package Stub Structure
**What:** Minimal package with typed export, test, and build config
**When to use:** Every package in Phase 1

```typescript
// packages/types/src/index.ts
export const PACKAGE_NAME = "@get-cauldron/types" as const;
export type PackageIdentifier = typeof PACKAGE_NAME;
```

```typescript
// packages/types/tests/index.test.ts
import { describe, it, expect } from "vitest";
import { PACKAGE_NAME } from "@get-cauldron/types";

describe("@get-cauldron/types", () => {
  it("exports package identifier", () => {
    expect(PACKAGE_NAME).toBe("@get-cauldron/types");
  });
});
```

```json
// packages/types/package.json
{
  "name": "@get-cauldron/types",
  "version": "0.0.0",
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc --build",
    "test": "vitest run --coverage"
  },
  "devDependencies": {
    "typescript": "^6.0.0",
    "vitest": "^4.1.0",
    "@vitest/coverage-v8": "^4.1.0"
  }
}
```

### Pattern 2: TypeScript Project Reference per Package
**What:** `composite: true` with references to dependencies
**When to use:** Every package tsconfig.json

```json
// packages/ai/tsconfig.json
{
  "compilerOptions": {
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    "strict": true,
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "src",
    "outDir": "dist",
    "skipLibCheck": true
  },
  "include": ["src"],
  "references": [
    { "path": "../types" }
  ]
}
```

```json
// Root tsconfig.json (solution file)
{
  "files": [],
  "references": [
    { "path": "packages/types" },
    { "path": "packages/native" },
    { "path": "packages/ai" },
    { "path": "packages/agent-core" },
    { "path": "packages/tools" },
    { "path": "packages/workflow" },
    { "path": "packages/session" },
    { "path": "packages/tui" },
    { "path": "packages/mcp-server" }
  ]
}
```

### Pattern 3: Turborepo Task Configuration
**What:** Task graph with build dependencies and caching
**When to use:** `turbo.json` at repo root

```json
// turbo.json
{
  "$schema": "https://turborepo.dev/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"],
      "inputs": ["src/**/*.ts", "tsconfig.json"]
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": ["coverage/**"],
      "inputs": ["src/**/*.ts", "tests/**/*.ts", "vitest.config.ts"]
    },
    "lint": {
      "dependsOn": ["build"]
    }
  }
}
```

### Pattern 4: dependency-cruiser Configuration
**What:** Rules for circular deps and cross-boundary imports
**When to use:** `.dependency-cruiser.cjs` at repo root

```javascript
// .dependency-cruiser.cjs
// Source: dependency-cruiser rules-reference docs
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "Zero circular dependencies allowed (FOUND-02)",
      from: {},
      to: { circular: true }
    },
    {
      name: "no-cross-boundary-relative-imports",
      severity: "error",
      comment: "Packages must import by @get-cauldron/* name, not relative path (D-10)",
      from: { path: "^packages/([^/]+)/" },
      to: {
        path: "^packages/([^/]+)/",
        pathNot: "^packages/$1/"
      }
    }
  ],
  options: {
    doNotFollow: {
      path: "node_modules"
    },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"]
    }
  }
};
```

### Pattern 5: Per-Package Vitest Config with Coverage
**What:** Coverage thresholds enforced per package for turbo caching
**When to use:** Every `vitest.config.ts`

```typescript
// packages/types/vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      thresholds: {
        statements: 80,
        lines: 80,
        branches: 60,
        functions: 60,
      },
    },
  },
});
```

### Pattern 6: Vitest Workspace for Dev/IDE
**What:** Root workspace file for running all tests from IDE
**When to use:** Development only; CI uses `turbo test`

```typescript
// vitest.workspace.ts
export default ["packages/*"];
```

### Anti-Patterns to Avoid
- **Source-aliased test imports:** Never set `resolve.alias` to map `@get-cauldron/*` to `src/` -- tests must hit `dist/` to satisfy FOUND-04
- **Root-only coverage thresholds:** Putting thresholds only in the root config breaks turbo per-package caching
- **`ignoreBuildErrors` or `skipLibCheck` on own packages:** Defeats FOUND-03; `skipLibCheck` is fine for `node_modules` only
- **Default exports:** Project convention is named exports only
- **Relative imports across packages:** e.g. `import { x } from "../../types/src/index.js"` -- dependency-cruiser catches this, but TS project references also reject it

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Circular dep detection | grep/regex-based scripts | dependency-cruiser `no-circular` rule | Handles transitive cycles, type-only exclusions |
| Build ordering | Manual shell scripts | `tsc --build` + Turborepo `^build` | Automatic DAG resolution from references |
| Coverage collection | Custom instrumentors | `@vitest/coverage-v8` | V8 native coverage, zero instrumentation step |
| Package linking | manual symlinks | pnpm `workspace:*` protocol | Automatic, version-locked, no hoisting leaks |
| Test caching | file-hash scripts | Turborepo task cache | Input/output hash, remote cache support |

**Key insight:** The entire Phase 1 toolchain is "configuration, not code." Every capability is achieved by wiring standard tools correctly, not by writing custom infrastructure.

## Common Pitfalls

### Pitfall 1: Tests Importing Source Instead of Dist
**What goes wrong:** Tests pass but don't validate the build output. A broken `exports` field or missing declaration goes undetected.
**Why it happens:** Vitest auto-resolves TypeScript source files when `resolve.alias` or `resolve.extensions` is configured, or when paths map to `src/`.
**How to avoid:** Package `exports` in `package.json` MUST point to `dist/`. Do NOT add any Vitest resolve aliases that map `@get-cauldron/*` to source directories. Test imports use the package name and resolve through `node_modules` symlinks to `dist/`.
**Warning signs:** Tests pass without running `turbo build` first.

### Pitfall 2: dependency-cruiser and pnpm Workspace Symlinks
**What goes wrong:** dependency-cruiser fails to resolve imports through pnpm's `node_modules/.pnpm` structure, producing false positives or missing real violations.
**Why it happens:** pnpm uses symlinked `node_modules` with a content-addressable store, which differs from npm/yarn flat `node_modules`.
**How to avoid:** Configure `enhancedResolveOptions` in `.dependency-cruiser.cjs` with proper `exportsFields` and `conditionNames`. Test the config early with a deliberate violation.
**Warning signs:** dependency-cruiser reports "could not resolve" for valid workspace imports.

### Pitfall 3: Vitest Workspace vs. Per-Package Caching Conflict
**What goes wrong:** Using root-level Vitest `projects` mode for CI means any change in any package busts the entire test cache.
**Why it happens:** Turborepo treats root tasks as a single unit; it can't cache individual packages within a root task.
**How to avoid:** Two modes: per-package `vitest run` scripts for CI (turbo-cached), root `vitest.workspace.ts` for IDE/dev convenience only. CI runs `turbo test`, not `vitest --projects`.
**Warning signs:** CI test times don't improve despite turbo caching being enabled.

### Pitfall 4: Missing `tsc --build` Before Tests
**What goes wrong:** Tests fail because `dist/` doesn't exist yet.
**Why it happens:** `turbo test` has `dependsOn: ["build"]`, but running `vitest` directly (e.g., in IDE) skips the build step.
**How to avoid:** Document that direct `vitest` requires a prior `turbo build`. IDE workspace config can use the root `vitest.workspace.ts` which resolves source, while CI always goes through turbo.
**Warning signs:** Tests fail locally but pass in CI.

### Pitfall 5: TypeScript `noEmitOnError` in `tsc --build`
**What goes wrong:** `tsc --build` implicitly enables `noEmitOnError`, so a type error in one package blocks all downstream packages from building.
**Why it happens:** This is by design in project references mode but surprising if you're used to `tsc` ignoring errors.
**How to avoid:** This is actually desired behavior (FOUND-03). Just be aware that a single type error cascades.
**Warning signs:** "Building project references" logs stop partway through.

### Pitfall 6: Fixture Infrastructure Without Fixtures
**What goes wrong:** FOUND-06 requires fixture recording/replay, but Phase 1 has no LLM code to record from.
**Why it happens:** Requirement is mapped to Phase 1 in REQUIREMENTS.md but there's no provider code yet.
**How to avoid:** Interpret FOUND-06 as "scaffold the fixture infrastructure" -- create the utility module and test helpers, not actual recorded fixtures. Real fixtures come in Phase 3 (Anthropic provider).
**Warning signs:** Planner tries to create LLM recording tests in a phase with no LLM dependencies.

## Code Examples

### GitHub Actions CI Workflow

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - name: Typecheck
        run: pnpm exec tsc --build
      - name: Boundary enforcement
        run: pnpm exec depcruise packages --config .dependency-cruiser.cjs --output-type err
      - name: Test
        run: pnpm exec turbo test
```

### pnpm Workspace Config

```yaml
# pnpm-workspace.yaml
packages:
  - "packages/*"
```

### Package Dependency Declaration (workspace protocol)

```json
// packages/ai/package.json (excerpt)
{
  "name": "@get-cauldron/ai",
  "dependencies": {
    "@get-cauldron/types": "workspace:*"
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| npm workspaces | pnpm workspaces | 2022+ | Strict hoisting, workspace protocol |
| Lerna for task running | Turborepo | 2022+ | Built-in caching, simpler config |
| Jest | Vitest | 2023+ | Native ESM, faster, TS-first |
| madge for circular deps | dependency-cruiser | Ongoing | Single tool for all dependency rules |
| `tsc` per package manually | `tsc --build` with project refs | TS 3.0+ | Automatic build ordering, incremental |
| eslint-plugin-boundaries | dependency-cruiser rules | Choice | dep-cruiser handles both circulars and boundaries |

**Deprecated/outdated:**
- `turbo.build/` domain has redirected to `turborepo.dev` (301 redirect) [VERIFIED: WebFetch redirect]
- Vitest `workspace` field renamed to `projects` in recent versions [CITED: vitest.dev/guide/workspace]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | FOUND-06 means scaffold fixture infrastructure, not record actual fixtures | Pitfalls | Planner scope creep into LLM work |
| A2 | dependency-cruiser handles pnpm workspace symlinks with enhancedResolveOptions | Pitfalls | False positives/negatives in boundary check |
| A3 | Per-package vitest.config.ts thresholds work correctly with turbo caching | Architecture | Coverage enforcement may not trigger correctly |
| A4 | `@get-cauldron/native` package will use CJS (matching GSD-2 pattern) | Structure | Build config may differ if ESM chosen |

## Open Questions (RESOLVED)

1. **FOUND-06 scope in Phase 1** (RESOLVED)
   - What we know: Requirement says "fixture recording/replay system for deterministic LLM response testing"
   - What's unclear: How much infrastructure to build when there's no LLM code yet
   - Resolution: Scaffold `packages/types/src/fixtures.ts` with types (FixtureRecording, FixtureChunk, FixtureReplayOptions), a type guard, and a loader function. Defer actual recording to Phase 3.

2. **dependency-cruiser pnpm compatibility** (RESOLVED)
   - What we know: GitHub issues report resolution challenges with pnpm symlinks
   - What's unclear: Whether v17.3.10 handles pnpm workspaces without additional config
   - Resolution: Configure `enhancedResolveOptions` with `exportsFields` and `conditionNames`. Plan 02 Task 2 verifies detection with a deliberate cross-boundary import violation.

3. **Native package build in Phase 1** (RESOLVED)
   - What we know: `@get-cauldron/native` is listed as a stub, and Rust crates are copied
   - What's unclear: Whether the native package stub should attempt Rust compilation or just be a TS wrapper stub
   - Resolution: TS wrapper stub only with placeholder exports. Rust compilation is Phase 5 scope.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All | Yes | v22.22.1 | -- |
| pnpm | Package management | Yes (installed) | Needs version check in new repo | -- |
| git | Version control | Yes | 2.50.1 | -- |
| Rust toolchain | Native crates (copy only) | Not checked | -- | Not needed in Phase 1 |
| GitHub CLI (gh) | Repo creation (D-12) | Needs check | -- | Manual creation |

**Missing dependencies with no fallback:**
- None for Phase 1 (all core tools available)

**Missing dependencies with fallback:**
- Turborepo CLI: installed as devDependency, not needed globally

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 + @vitest/coverage-v8 4.1.4 |
| Config file | Per-package `vitest.config.ts` + root `vitest.workspace.ts` |
| Quick run command | `pnpm exec turbo test` |
| Full suite command | `pnpm exec turbo test --force` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FOUND-01 | pnpm install + turbo build succeeds | smoke | `pnpm install && pnpm exec turbo build` | Wave 0 |
| FOUND-02 | Circular dep detected and fails | integration | `pnpm exec depcruise packages --config .dependency-cruiser.cjs --output-type err` | Wave 0 |
| FOUND-03 | tsc --build with no suppressions | smoke | `pnpm exec tsc --build` | Wave 0 |
| FOUND-04 | Tests import dist, not src | unit | Each package test imports by `@get-cauldron/*` name | Wave 0 |
| FOUND-05 | Vitest runs per package | smoke | `pnpm exec turbo test` | Wave 0 |
| FOUND-06 | Fixture infrastructure exists | unit | Test for fixture utility module | Wave 0 |
| FOUND-07 | Coverage below threshold fails | unit | `vitest run --coverage` with threshold below | Wave 0 |
| FOUND-08 | CI pipeline runs all checks | manual-only | GitHub Actions run (requires push) | Wave 0 |
| ID-01 | @get-cauldron/* scope | smoke | `grep -r "gsd\|pi-" packages/*/package.json` returns empty | Wave 0 |
| ID-02 | No Pi/GSD references | smoke | `grep -ri "gsd\b\|pi-sdk\|pi-ai\|pi-tui" packages/ src/` returns empty | Wave 0 |
| ID-03 | Single doc system | manual-only | Verify one documentation approach | -- |

### Sampling Rate
- **Per task commit:** `pnpm exec turbo test`
- **Per wave merge:** `pnpm exec turbo test --force && pnpm exec tsc --build && pnpm exec depcruise packages --config .dependency-cruiser.cjs --output-type err`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] Root `vitest.workspace.ts` -- workspace aggregation
- [ ] Root `turbo.json` -- task definitions
- [ ] Root `pnpm-workspace.yaml` -- workspace declaration
- [ ] Root `tsconfig.json` -- solution file with references
- [ ] `.dependency-cruiser.cjs` -- boundary and circular rules
- [ ] At least one package `vitest.config.ts` with coverage thresholds
- [ ] `.github/workflows/ci.yml` -- CI pipeline

## Security Domain

Phase 1 is infrastructure-only (no user input, no secrets, no network calls). Security considerations are minimal.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | -- |
| V3 Session Management | no | -- |
| V4 Access Control | no | -- |
| V5 Input Validation | no | -- |
| V6 Cryptography | no | -- |

### Known Threat Patterns for Build Systems

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Dependency confusion | Tampering | pnpm strict mode, `@get-cauldron` scope owned |
| CI script injection | Elevation | Pin action versions, use `--frozen-lockfile` |
| Malicious package in lockfile | Tampering | Review lockfile diffs in PR, use pnpm audit |

## Sources

### Primary (HIGH confidence)
- [npm registry] -- turborepo 2.9.6, vitest 4.1.4, @vitest/coverage-v8 4.1.4, dependency-cruiser 17.3.10, typescript 6.0.2, pnpm 10.33.0
- [turborepo.dev/repo/docs/reference/configuration] -- turbo.json task configuration
- [vitest.dev/guide/workspace] -- Vitest workspace/projects mode
- [vitest.dev/config/coverage] -- Coverage thresholds configuration
- [typescriptlang.org/docs/handbook/project-references.html] -- TS project references, composite, tsc --build
- [github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md] -- Rule DSL for circular and boundary rules
- [turborepo.dev/docs/guides/tools/vitest] -- Official Turborepo + Vitest integration guide

### Secondary (MEDIUM confidence)
- [github.com/sverweij/dependency-cruiser/issues/859] -- Monorepo usage patterns with pnpm
- [thecandidstartup.org/2025/09/08/vitest-3-monorepo-setup.html] -- Vitest 3+ monorepo patterns

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all versions verified against npm registry, official docs consulted
- Architecture: HIGH -- patterns from official Turborepo + Vitest guides
- Pitfalls: MEDIUM -- pnpm symlink handling with dependency-cruiser needs early validation

**Research date:** 2026-04-16
**Valid until:** 2026-05-16 (stable toolchain, 30-day validity)
