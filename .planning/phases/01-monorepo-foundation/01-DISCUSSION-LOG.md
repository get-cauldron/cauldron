# Phase 1: Monorepo Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 01-monorepo-foundation
**Areas discussed:** Package map, Test runner, Boundary enforcement, Starting point

---

## Package Map

| Option | Description | Selected |
|--------|-------------|----------|
| Full target set (9 packages) | All packages as empty stubs — types, native, ai, agent-core, tools, workflow, session, tui, mcp-server. Proves the full DAG before any real code. | ✓ |
| By-proximity (4 packages) | types, native, ai, agent-core — covers Phase 2-3 consumers with enough topology. | |
| Minimal (2 packages) | types, native only — fastest, but DAG enforcement is shallow. | |

**User's choice:** Full target set (Recommended)
**Notes:** Research showed each stub is ~10 lines. Cost difference is minimal; full set gives strongest CI proof against the actual production topology.

---

## Test Runner

| Option | Description | Selected |
|--------|-------------|----------|
| Vitest | Stable coverage via @vitest/coverage-v8, native TS/ESM support, watch mode, official Turborepo docs. Adds Vite as dev-only dep. | ✓ |
| node:test + c8 | Zero deps, matches GSD-2 convention. But experimental coverage flag + loader chain complexity across 9 packages. | |
| node:test + borp | TypeScript wrapper around node:test by Matteo Collina. Smaller ecosystem but avoids Vite. | |

**User's choice:** Vitest (Recommended)
**Notes:** Key factor: "nothing merges without coverage" is a hard rule, and node:test coverage is still experimental-flagged. Vitest also eliminates the loader chain complexity across 9 packages.

---

## Boundary Enforcement

| Option | Description | Selected |
|--------|-------------|----------|
| dependency-cruiser | Single tool for both circular detection + cross-boundary import rules. Native TS/ESM support. No ESLint needed. | ✓ |
| madge + ESLint no-restricted-imports | Battle-tested circular checker + core ESLint rule. Two tools, but familiar ecosystem. Requires introducing ESLint. | |
| madge only (+ TS project refs) | Circular detection via madge, cross-boundary enforcement via tsc composite alone. Simpler but weaker boundary rule. | |

**User's choice:** dependency-cruiser (Recommended)
**Notes:** TS project references added regardless as compiler-level baseline. dependency-cruiser handles both success criteria (zero cycles + no cross-boundary relative imports) in a single tool with native TS/ESM/NodeNext support.

---

## Starting Point

| Option | Description | Selected |
|--------|-------------|----------|
| Fresh repo at get-cauldron org | New repo at get-cauldron/cauldron. Copy .planning/ and native/crates/. Clean identity from commit 1. | ✓ |
| Rebuild in-place | Strip GSD-2 in this repo. Keep full git history. CI secrets already wired. | |
| New branch in existing repo | Defer the repo decision. Work in a branch here, move later. | |

**User's choice:** Fresh repo (Recommended)
**Notes:** PROJECT.md lists only files worth keeping (not commit history). Cherry-picking is not a stated need. .planning/ is 252KB, native crates are a directory copy. Clean identity eliminates GSD-2 noise in git log.

---

## Claude's Discretion

- CI workflow structure, Turborepo pipeline config, dependency-cruiser rule specifics, tsconfig settings

## Deferred Ideas

None — discussion stayed within phase scope
