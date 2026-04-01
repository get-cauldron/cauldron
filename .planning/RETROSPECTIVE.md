# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.1 — Local Asset Generation & Style-Aware Seeds

**Shipped:** 2026-04-01
**Phases:** 4 | **Plans:** 9 | **Tasks:** 16

### What Was Built
- Durable async asset job system with 6-state lifecycle, ComfyUI adapter, artifact writer with provenance sidecars
- Local image MCP server (`@get-cauldron/mcp`) with 4 tools for apps and build agents
- Operator controls for asset mode, concurrency, and budget limits via tRPC and CLI
- E2E pipeline verification (`cauldron verify assets`) proving style → seed → generation → delivery
- Integration polish closing 4 audit gaps (event emission, push notifications, float column, template path)

### What Worked
- **Audit-driven gap closure:** Running `/gsd:audit-milestone` before completion identified 4 real integration gaps that Phase 21 closed — the audit prevented shipping with dead code paths
- **Compact milestone scope:** 4 phases over 2 days with clear vertical slices (schema → adapter → MCP → operator → polish) — each phase built cleanly on the prior
- **Cross-phase integration checks:** The milestone audit's cross-phase wiring verification caught that `asset_job_submitted` was never emitted and `notifyJobStatusChanged` was dead code
- **Callback injection pattern:** Engine exposing `onJobStatusChanged` callback avoided MCP importing engine internals — clean cross-package boundary

### What Was Inefficient
- **REQUIREMENTS.md traceability drift:** STYLE-01..05 and IMG-01..04 were listed in requirements but never assigned to any phase scope — aspirational requirements cluttered the traceability table and confused the audit
- **Some SUMMARY.md one-liners empty:** The `summary-extract` tool returned "One-liner:" for 5 of 9 summaries, suggesting the one_liner field was not consistently populated during phase execution
- **MCP push notification architecture oversight:** Built the callback injection but missed that Inngest handler and MCP stdio server run in separate processes — code-correct but structurally unreachable, requiring v1.2 IPC work

### Patterns Established
- **Callback injection for cross-package events:** `onJobStatusChanged` pattern enables engine to notify consumers without importing them
- **`createRequire` with monorepo fallback** for robust template path resolution across packaging environments
- **Deep-merge for settings updates** to prevent clobbering sibling keys
- **ALTER TYPE ADD VALUE** for enum extensions — safe for existing databases
- **`IF NOT EXISTS` guards on migrations** for integration test rerunnability

### Key Lessons
1. **Run milestone audit before archiving** — the audit caught 4 real integration gaps that would have shipped as silent bugs
2. **Requirements should only list what phases will actually build** — aspirational requirements that get scoped out during planning create traceability noise
3. **Verify process architecture before designing cross-process communication** — the MCP push notification path was correct in code but architecturally unreachable because Inngest and MCP stdio run in separate processes
4. **Populate SUMMARY.md one-liners consistently** — missing one-liners degrade milestone archive quality

### Cost Observations
- Model mix: Primarily opus for planning/execution, sonnet for research agents
- Sessions: ~5 sessions across 2 days
- Notable: v1.1 was significantly more compact than v1.0 (9 plans vs 65) — the existing foundation made each phase faster

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 19 | 65 | Full pipeline build from greenfield |
| v1.1 | 4 | 9 | Brownfield extension with audit-driven gap closure |

### Cumulative Quality

| Milestone | Plans | Files Changed | Lines Added |
|-----------|-------|---------------|-------------|
| v1.0 | 65 | — | — |
| v1.1 | 9 | 72 | 9,937 |

### Top Lessons (Verified Across Milestones)

1. **Integration testing catches what unit tests miss** — v1.0 had 92 passing tests with 3 real bugs found in manual testing; v1.1 audit caught 4 integration gaps that unit tests passed cleanly
2. **Read code before planning** — v1.0 beads plan wrote 7 tasks targeting wrong paths/APIs; v1.1 phases were grounded in existing code
3. **Run milestone audit before shipping** — v1.1 audit caught dead code paths that would have silently failed in production
