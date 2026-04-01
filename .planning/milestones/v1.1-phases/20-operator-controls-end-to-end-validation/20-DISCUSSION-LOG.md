# Phase 20: Operator Controls & End-to-End Validation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-01
**Phase:** 20-operator-controls-end-to-end-validation
**Areas discussed:** Asset settings shape, Budget enforcement, E2E validation scope, CLI/API surface

---

## Asset Settings Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Nested asset object | Add `asset` key to ProjectSettings: { asset: { enabled, runtimeUrl, artifactsRoot, budgetLimitCents, acquisitionMode } }. Grouped and extensible. | ✓ |
| Flat top-level fields | Add assetEnabled, assetRuntimeUrl, etc. directly to ProjectSettings. Simpler but crowded. | |
| Separate asset_config table | New DB table for asset settings. Normalized but adds joins. | |

**User's choice:** Nested asset object
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| local-only | Only use locally running ComfyUI. Fail if not available. | ✓ |
| local-preferred + stub | Try local first, fall back to placeholder/error. | |
| You decide | Claude picks based on milestone scope. | |

**User's choice:** local-only
**Notes:** Simplest for v1.1, no remote backends yet.

| Option | Description | Selected |
|--------|-------------|----------|
| Boolean enabled flag | asset.enabled: true/false. Simple toggle. | |
| Mode enum | asset.mode: 'active' \| 'paused' \| 'disabled'. Paused queues, disabled rejects. | ✓ |
| You decide | Claude picks based on OPS-02 needs. | |

**User's choice:** Mode enum
**Notes:** More nuanced control than a simple boolean.

---

## Budget Enforcement

| Option | Description | Selected |
|--------|-------------|----------|
| Separate asset budget | asset.budgetLimitCents tracked independently from LLM budget. | |
| Unified budget pool | Single budgetLimitCents covers both LLM and asset costs. | |
| You decide | Claude picks based on existing infrastructure. | |

**User's choice:** Other — "If assets are generated locally theres no cost"
**Notes:** Local ComfyUI generation has no monetary cost. Budget concept doesn't apply.

| Option | Description | Selected |
|--------|-------------|----------|
| Max concurrent jobs | asset.maxConcurrentJobs limits simultaneous jobs. Prevents GPU overload. | ✓ |
| Daily/hourly job quota | Caps total volume over time. | |
| No limits needed | Mode enum is enough control. | |
| Both concurrent + quota | Concurrent for hardware, quota for queue management. | |

**User's choice:** Max concurrent jobs
**Notes:** Practical hardware protection without unnecessary complexity.

---

## E2E Validation Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Integration test suite | Vitest tests walking full path. Requires Docker. | |
| CLI verification command | `cauldron verify-assets` for manual operator validation. | |
| Both test + CLI command | Integration tests for CI, CLI for operator setup validation. | ✓ |
| You decide | Claude picks to satisfy OPS-03. | |

**User's choice:** Both test + CLI command

| Option | Description | Selected |
|--------|-------------|----------|
| Full pipeline | interview → crystallize → submit job → generation → delivery. | ✓ |
| Asset path only | Pre-seeded project, test only job → generation → delivery. | |
| You decide | Claude picks based on OPS-03 and test reliability. | |

**User's choice:** Full pipeline
**Notes:** Proves the complete v1.1 story end-to-end.

| Option | Description | Selected |
|--------|-------------|----------|
| Mock executor for CI | Mock returns test image, proves wiring. Real ComfyUI via CLI verify. | |
| Real ComfyUI required | Tests hit actual ComfyUI. Most realistic but needs GPU in CI. | |
| Both paths | Mock in CI, optional flag for real ComfyUI. | ✓ |

**User's choice:** Both paths
**Notes:** Mock proves wiring in CI, real ComfyUI available via flag for full validation.

---

## CLI/API Surface

| Option | Description | Selected |
|--------|-------------|----------|
| CLI commands | cauldron config set asset.mode active, etc. | |
| cauldron.config.ts file | Asset section in config file. | |
| Both CLI + config file | Config file for defaults, CLI for runtime overrides. | ✓ |
| Web dashboard only | Settings page in web dashboard. | |

**User's choice:** Both CLI + config file
**Notes:** Two-layer config: version-controlled defaults + runtime DB overrides.

| Option | Description | Selected |
|--------|-------------|----------|
| cauldron verify | Top-level command, subcommands like `cauldron verify assets`. | ✓ |
| cauldron assets verify | Nested under assets command group. | |
| You decide | Claude picks based on existing CLI patterns. | |

**User's choice:** cauldron verify (top-level)

---

## Claude's Discretion

- Exact enforcement point for maxConcurrentJobs
- Mock executor implementation details
- CLI verify output format and verbosity
- Default values for asset settings
- Error messages for disabled/paused mode

## Deferred Ideas

None — discussion stayed within phase scope.
