# Phase 1: Monorepo Foundation - Pattern Map

**Mapped:** 2026-04-16
**Files analyzed:** 54 new files (9 packages x 5 files each [index.ts, test, package.json, tsconfig.json, vitest.config.ts] = 45, plus 7 root configs [package.json, tsconfig.json, turbo.json, pnpm-workspace.yaml, vitest.workspace.ts, .dependency-cruiser.cjs, .npmrc], plus CI workflow, plus Cargo.toml rename)
**Analogs found:** 20 / 54 (most no-analog files are new tooling configs with patterns defined in RESEARCH.md)

## File Classification

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `packages/*/src/index.ts` (x9) | module-entry | transform | `packages/pi-agent-core/src/index.ts` | exact |
| `packages/*/tests/index.test.ts` (x9) | test | -- | None (Vitest, not Node test runner) | no-analog |
| `packages/*/package.json` (x9) | config | -- | `packages/pi-agent-core/package.json` | exact |
| `packages/*/tsconfig.json` (x9) | config | -- | `packages/pi-ai/tsconfig.json` | role-match |
| `packages/*/vitest.config.ts` (x9) | config | -- | None (new test framework) | no-analog |
| `package.json` (root) | config | -- | `package.json` (GSD-2 root) | role-match |
| `tsconfig.json` (root solution file) | config | -- | None (GSD-2 root is single-project) | no-analog |
| `turbo.json` | config | -- | None (GSD-2 uses npm scripts) | no-analog |
| `pnpm-workspace.yaml` | config | -- | None (GSD-2 uses npm workspaces) | no-analog |
| `vitest.workspace.ts` | config | -- | None (new framework) | no-analog |
| `.dependency-cruiser.cjs` | config | -- | None (new tool) | no-analog |
| `.github/workflows/ci.yml` | config | -- | `.github/workflows/ci.yml` (GSD-2) | role-match |
| `native/Cargo.toml` (rename) | config | -- | `native/Cargo.toml` (GSD-2) | exact |

## Pattern Assignments

### Package `package.json` (config)

**Analog:** `packages/pi-agent-core/package.json` (lines 1-18)

**Minimal ESM package with single export** -- the cleanest GSD-2 package to copy from:
```json
{
  "name": "@gsd/pi-agent-core",
  "version": "2.74.0",
  "description": "General-purpose agent core (vendored from pi-mono)",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json"
  },
  "dependencies": {}
}
```

**Cauldron adaptations:**
- Change scope from `@gsd/pi-*` to `@get-cauldron/*`
- Set version to `"0.0.0"`
- Add `"files": ["dist"]`
- Add `test` script: `"test": "vitest run --coverage"`
- Add devDependencies for `typescript`, `vitest`, `@vitest/coverage-v8`
- Use `workspace:*` protocol for inter-package deps (pnpm, not npm)
- Add `"build": "tsc --build"` (project references mode, not `-p tsconfig.json`)

**Native package (CJS exception)** -- analog `packages/native/package.json` (line 6):
```json
{
  "type": "commonjs"
}
```
Only `@get-cauldron/native` uses CJS. All other packages use `"type": "module"`.

---

### Package `tsconfig.json` (config)

**Analog:** `packages/pi-ai/tsconfig.json` (lines 1-28)

**Full tsconfig with all compiler options:**
```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "Node16",
    "lib": ["ES2024"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "incremental": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "inlineSources": true,
    "inlineSourceMap": false,
    "moduleResolution": "Node16",
    "resolveJsonModule": true,
    "allowImportingTsExtensions": false,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "useDefineForClassFields": false,
    "types": ["node"],
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "**/*.d.ts", "src/**/*.d.ts"]
}
```

**Cauldron adaptations (per RESEARCH.md Pattern 2):**
- Add `"composite": true` (required for project references)
- Change `"module"` to `"NodeNext"` and `"moduleResolution"` to `"NodeNext"` (RESEARCH.md recommendation)
- Add `"references"` array wiring per the dependency DAG
- Remove `experimentalDecorators` and `emitDecoratorMetadata` (no decorators in Cauldron)
- Use `"include": ["src"]` (simpler)

---

### Package `src/index.ts` (module-entry, transform)

**Analog:** `packages/pi-agent-core/src/index.ts` (lines 1-8)

**Barrel export pattern with section comments:**
```typescript
// Core Agent
export * from "./agent.js";
// Loop functions
export * from "./agent-loop.js";
// Proxy utilities
export * from "./proxy.js";
// Types
export * from "./types.js";
```

**Cauldron adaptation for stubs (per RESEARCH.md Pattern 1):**
```typescript
export const PACKAGE_NAME = "@get-cauldron/types" as const;
export type PackageIdentifier = typeof PACKAGE_NAME;
```
Stubs export a single typed constant. Real barrel exports come in later phases.

---

### Root `package.json` (config)

**Analog:** `package.json` (GSD-2 root, lines 1-16)

**Workspace and engine config pattern:**
```json
{
  "name": "gsd-pi",
  "type": "module",
  "workspaces": [
    "packages/*",
    "studio"
  ],
  "engines": {
    "node": ">=22.0.0"
  },
  "packageManager": "npm@10.9.3"
}
```

**Cauldron adaptations:**
- Name: `"cauldron"` (root, not published)
- Remove `workspaces` (pnpm uses `pnpm-workspace.yaml` instead)
- Change `packageManager` to `"pnpm@10.33.0"`
- Add `"private": true` (monorepo root is never published)
- Add devDependencies: `turborepo`, `typescript`, `vitest`, `@vitest/coverage-v8`, `dependency-cruiser`, `@types/node`
- Scripts: `"build": "turbo build"`, `"test": "turbo test"`, `"lint": "turbo lint"`, `"typecheck": "tsc --build"`

---

### `.github/workflows/ci.yml` (config)

**Analog:** `.github/workflows/ci.yml` (GSD-2, lines 1-24)

**Workflow structure pattern:**
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```

**Cauldron adaptations (per RESEARCH.md CI example):**
- Use `pnpm/action-setup@v4` instead of npm
- Use `actions/setup-node@v4` with `cache: "pnpm"`
- Steps: `pnpm install --frozen-lockfile`, `pnpm exec tsc --build`, `pnpm exec depcruise packages --config .dependency-cruiser.cjs --output-type err`, `pnpm exec turbo test`
- Use standard `ubuntu-latest` runner (GSD-2 uses `blacksmith-4vcpu-ubuntu-2404`)
- Pin `actions/checkout@v4` (GSD-2 uses v6 which may be custom)

---

### `native/Cargo.toml` (config, copy-and-rename)

**Analog:** `native/Cargo.toml` (GSD-2, lines 1-20)

**Rust workspace config:**
```toml
[workspace]
members = ["crates/*"]
resolver = "2"

[workspace.package]
version = "0.1.0"
edition = "2021"
license = "MIT"
authors = ["GSD Contributors"]
repository = "https://github.com/gsd-build/gsd-2"

[profile.release]
opt-level = 3
lto = "fat"
codegen-units = 1
strip = true
panic = "abort"

[profile.dev]
codegen-units = 256
incremental = true
```

**Cauldron adaptations (per D-14, ID-02):**
- Change `authors` to `["Cauldron Contributors"]`
- Change `repository` to `"https://github.com/get-cauldron/cauldron"`
- Rename crate names inside individual `crates/*/Cargo.toml` from `gsd-*` to `cauldron-*`

---

## Shared Patterns

### ESM Module Convention
**Source:** All GSD-2 packages
**Apply to:** All 9 package stubs (except `@get-cauldron/native` which is CJS)

Key conventions carried forward:
- `"type": "module"` in package.json
- `.js` extensions in import paths (required by NodeNext resolution)
- Named exports only, no default exports
- `import type` for type-only imports
- `kebab-case.ts` file naming

### Package Exports Field
**Source:** `packages/pi-agent-core/package.json` (lines 8-12)
**Apply to:** All 9 package stubs

```json
"exports": {
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js"
  }
}
```
`types` condition MUST come first. Points to `dist/` (not `src/`) to satisfy FOUND-04.

### Code Style
**Source:** `packages/pi-ai/src/index.ts`, `packages/pi-agent-core/src/index.ts`
**Apply to:** All new TypeScript files in `packages/`

- Tabs for indentation (GSD-2 convention for `packages/`)
- Double quotes for strings in `packages/`
- Semicolons used consistently in `packages/`
- JSDoc block comment at top of each file describing purpose

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `packages/*/vitest.config.ts` (x9) | config | -- | GSD-2 uses Node built-in test runner, not Vitest. Use RESEARCH.md Pattern 5 |
| `packages/*/tests/index.test.ts` (x9) | test | -- | GSD-2 tests use `node --test` API. Use RESEARCH.md Pattern 1 test example |
| `tsconfig.json` (root solution file) | config | -- | GSD-2 root tsconfig is a single-project config, not solution-style. Use RESEARCH.md Pattern 2 |
| `turbo.json` | config | -- | GSD-2 has no Turborepo. Use RESEARCH.md Pattern 3 |
| `pnpm-workspace.yaml` | config | -- | GSD-2 uses npm workspaces in package.json. Use RESEARCH.md Code Example |
| `vitest.workspace.ts` | config | -- | New framework. Use RESEARCH.md Pattern 6 |
| `.dependency-cruiser.cjs` | config | -- | New tool. Use RESEARCH.md Pattern 4 |
| Fixture scaffold (e.g. `packages/types/src/fixtures/`) | utility | transform | No fixture infrastructure in GSD-2. RESEARCH.md FOUND-06 + Open Question 1: scaffold types and test helpers only, defer recording to Phase 3 |

## Metadata

**Analog search scope:** `packages/`, `native/`, `.github/workflows/`, root configs (all within GSD-2 codebase)
**Files scanned:** 35+ (all package configs, root configs, CI workflows, source entry points)
**Pattern extraction date:** 2026-04-16
