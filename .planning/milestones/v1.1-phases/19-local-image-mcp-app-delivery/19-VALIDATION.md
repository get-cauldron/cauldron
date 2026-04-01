---
phase: 19
slug: local-image-mcp-app-delivery
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-31
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4 |
| **Config file** | `packages/mcp/vitest.config.ts` (Wave 0 — new package) |
| **Quick run command** | `pnpm -F @get-cauldron/mcp test` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm -F @get-cauldron/mcp test && pnpm -F @get-cauldron/engine test -- src/asset`
- **After every plan wave:** Run `pnpm test && pnpm typecheck && pnpm build`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 19-01-T1 | 01 | 1 | MCP-02 | unit | `pnpm -F @get-cauldron/mcp test -- src/__tests__/defaults.test.ts` | W0 | pending |
| 19-01-T2 | 01 | 1 | MCP-02 | unit | `pnpm -F @get-cauldron/mcp test -- src/__tests__/project-detector.test.ts` | W0 | pending |
| 19-02-T1 | 02 | 1 | MCP-03 | unit | `pnpm -F @get-cauldron/engine test -- --grep "listAssetJobs"` | extend | pending |
| 19-02-T2 | 02 | 1 | MCP-04 | unit | `pnpm -F @get-cauldron/engine test -- --grep "collect-artifacts\|destination\|delivery"` | extend | pending |
| 19-03-T1 | 03 | 2 | MCP-01, MCP-02, MCP-03, MCP-04 | typecheck | `pnpm -F @get-cauldron/mcp typecheck` | N/A | pending |
| 19-03-T2 | 03 | 2 | MCP-02, MCP-03 | unit | `pnpm -F @get-cauldron/mcp test -- src/__tests__/generate-image.test.ts` | W0 | pending |

*Status: pending / green / red / flaky*

**Note:** Plan 03 Task 1 creates all tool/server/entry-point implementation files and is verified by typecheck. Plan 03 Task 2 adds behavioral unit tests for the tool handlers (generate-image, check-job-status) and runs the full test + typecheck + build regression. Integration tests requiring a running MCP server process and real DB are deferred.

---

## Wave 0 Requirements

- [ ] `packages/mcp/vitest.config.ts` — test config for new package (Plan 01 Task 1)
- [ ] `packages/mcp/src/__tests__/defaults.test.ts` — intendedUse smart defaults (Plan 01 Task 1)
- [ ] `packages/mcp/src/__tests__/project-detector.test.ts` — cwd project detection (Plan 01 Task 2)
- [ ] `packages/engine/src/asset/__tests__/job-store.test.ts` — listAssetJobs (Plan 02 Task 1, extend existing)
- [ ] `packages/engine/src/asset/__tests__/events.test.ts` — destination delivery (Plan 02 Task 2, extend existing)
- [ ] `packages/mcp/src/__tests__/generate-image.test.ts` — request handling (Plan 03 Task 2)
- [ ] `packages/mcp/src/__tests__/check-job-status.test.ts` — status polling (Plan 03 Task 2)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| MCP server launched by Claude Code and tools visible | MCP-01 | Requires MCP client integration | Configure in claude_desktop_config.json, verify tools appear in tool list |
| End-to-end generation via MCP tool | MCP-02 | Requires running Inngest + ComfyUI + models | Call generate-image tool, verify job created and image generated |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
