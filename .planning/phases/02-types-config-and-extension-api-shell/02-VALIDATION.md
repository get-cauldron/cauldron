---
phase: 2
slug: types-config-and-extension-api-shell
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-15
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.4 |
| **Config file** | `vitest.config.ts` (root) |
| **Quick run command** | `pnpm exec vitest run --project unit` |
| **Full suite command** | `pnpm exec vitest run --coverage.enabled` |
| **Estimated runtime** | ~5 seconds (unit) / ~15 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm exec vitest run --project unit`
- **After every plan wave:** Run `pnpm exec vitest run --coverage.enabled`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds (unit), ~15 seconds (full)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-P1-01 | 01 | 1 | EXT-01 | — | N/A | unit | `node scripts/check-boundaries.mjs` | ✅ (script exists; needs zero-dep check added) | ⬜ pending |
| 02-P1-02 | 01 | 1 | EXT-01 | — | N/A | unit | `pnpm exec vitest run --project unit` | ✅ `packages/extension-api/src/extension.test.ts` | ⬜ pending |
| 02-P1-03 | 01 | 1 | EXT-02 | — | N/A | unit | `pnpm exec vitest run --project unit` | ❌ W0 (update execute test for ToolResult shape) | ⬜ pending |
| 02-P1-04 | 01 | 1 | EXT-02 | — | N/A | unit | `pnpm exec vitest run --project unit` | ❌ W0 (new test: ToolParameter enum field) | ⬜ pending |
| 02-P2-01 | 02 | 1 | SC-3 | T-02-01 | `safeParse()` returns err(), never throws | integration | `pnpm exec vitest run --project integration` | ❌ W0 | ⬜ pending |
| 02-P2-02 | 02 | 1 | SC-3 | T-02-01 | malformed JSONC returns typed error, not crash | integration | `pnpm exec vitest run --project integration` | ❌ W0 | ⬜ pending |
| 02-P2-03 | 02 | 1 | SC-3 | — | N/A | integration | `pnpm exec vitest run --project integration` | ❌ W0 | ⬜ pending |
| 02-P2-04 | 02 | 1 | SC-3 | — | N/A | integration | `pnpm exec vitest run --project integration` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/extension-api/src/extension.test.ts` — update execute test for `ToolResult` shape; add `enum` test case for `ToolParameter`
- [ ] `packages/config/__tests__/integration.test.ts` — write file-based integration tests: load/merge/validate happy path, malformed JSONC rejection, missing field rejection, global+project merge with project winning
- [ ] `packages/config/src/loader.test.ts` — extend existing unit tests with Zod validation error cases
- [ ] `packages/types/src/errors.test.ts` — type-level test that `CauldronError` satisfies the interface shape

*These files are either non-existent (❌) or need significant updates for Phase 2 scope.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `loadConfig` reads actual `~/.cauldron/config.jsonc` from home dir | SC-3 | Integration tests use temp dirs; real home dir path not exercised in CI | Create `~/.cauldron/config.jsonc` with valid content, run `pnpm exec vitest run --project integration` with `CAULDRON_LIVE_TESTS=1` |

---

## Threat Model (ASVS L1)

| ASVS Category | Applies | Control |
|---------------|---------|---------|
| V5 Input Validation | **yes** | Zod v4 `safeParse()` on config file content — never throws, returns typed error |
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V6 Cryptography | no | — |

| Threat | STRIDE | Mitigation |
|--------|--------|------------|
| Malformed config causes crash | DoS | `safeParse()` returns `err()`, never throws — by design |
| Config path traversal | Tampering | Paths constructed from `os.homedir()` + hardcoded filenames, not user input |
| API key leaked via config type | Info Disclosure | `apiKeyEnv` stores the env var name, not the key — correct by design |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
