---
phase: 19
slug: local-image-mcp-app-delivery
status: draft
nyquist_compliant: false
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
| 19-01-01 | 01 | 1 | MCP-01 | unit | `pnpm -F @get-cauldron/mcp test -- src/__tests__/server.test.ts` | W0 | pending |
| 19-01-02 | 01 | 1 | MCP-02 | unit | `pnpm -F @get-cauldron/mcp test -- src/__tests__/defaults.test.ts` | W0 | pending |
| 19-02-01 | 02 | 2 | MCP-02, MCP-03 | unit | `pnpm -F @get-cauldron/mcp test -- src/__tests__/generate-image.test.ts` | W0 | pending |
| 19-02-02 | 02 | 2 | MCP-03 | unit | `pnpm -F @get-cauldron/mcp test -- src/__tests__/check-job-status.test.ts` | W0 | pending |
| 19-02-03 | 02 | 2 | MCP-03 | unit | `pnpm -F @get-cauldron/mcp test -- src/__tests__/get-artifact.test.ts` | W0 | pending |
| 19-03-01 | 03 | 3 | MCP-04 | unit | `pnpm -F @get-cauldron/engine test -- src/asset/__tests__/events.test.ts` | extend | pending |

*Status: pending / green / red / flaky*

**Note:** Integration tests requiring a running MCP server process and real DB are deferred. Phase 19 validates behavior through unit tests with mocked dependencies.

---

## Wave 0 Requirements

- [ ] `packages/mcp/vitest.config.ts` — test config for new package
- [ ] `packages/mcp/src/__tests__/server.test.ts` — tool registration (MCP-01)
- [ ] `packages/mcp/src/__tests__/generate-image.test.ts` — request handling (MCP-02, MCP-03)
- [ ] `packages/mcp/src/__tests__/check-job-status.test.ts` — status polling (MCP-03)
- [ ] `packages/mcp/src/__tests__/get-artifact.test.ts` — artifact retrieval (MCP-03)
- [ ] `packages/mcp/src/__tests__/defaults.test.ts` — intendedUse smart defaults (MCP-02)
- [ ] `packages/mcp/src/__tests__/project-detector.test.ts` — cwd project detection (D-07)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| MCP server launched by Claude Code and tools visible | MCP-01 | Requires MCP client integration | Configure in claude_desktop_config.json, verify tools appear in tool list |
| End-to-end generation via MCP tool | MCP-02 | Requires running Inngest + ComfyUI + models | Call generate-image tool, verify job created and image generated |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
