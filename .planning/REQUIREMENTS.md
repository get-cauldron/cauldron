# Requirements: Cauldron

**Defined:** 2026-04-01
**Core Value:** User describes what they want; Cauldron autonomously designs, decomposes, implements, tests, evaluates, and evolves until the goal is met.

## v1.2 Requirements

Requirements for architectural hardening. Each maps to roadmap phases.

### Data Integrity

- [ ] **DATA-01**: Event sequence numbers are unique per project, enforced by DB constraint (UNIQUE on project_id + sequence_number)
- [ ] **DATA-02**: Events table has composite indexes on (project_id, sequence_number) and (project_id, occurred_at)
- [ ] **DATA-03**: Seed versions are unique per parent seed, enforced by partial unique index (WHERE parent_seed_id IS NOT NULL)
- [ ] **DATA-04**: bead_edges table has reverse-lookup index on (target_bead_id)
- [ ] **DATA-05**: Foreign keys use appropriate cascade strategy (CASCADE for structural rows like bead_edges/holdout_vault, SET NULL for audit tables like llm_usage/events) with data-audit migration preceding constraint changes

### Concurrency Safety

- [ ] **CONC-01**: Bead completion uses version-conditioned optimistic locking (WHERE version = $current), conflict returns error
- [ ] **CONC-02**: LLM usage recording is synchronous — budget checks reflect actual spend before next call proceeds
- [ ] **CONC-03**: Timeout supervisor holds ChildProcess reference and enforces SIGTERM → 5s grace → SIGKILL on hard timeout
- [ ] **CONC-04**: Holdout generation failure after crystallization rolls back seed or marks it incomplete — no silent success masquerading as full success
- [ ] **CONC-05**: Merge conflict resolver extracts structured JSON per file via AI SDK Output.object() with Zod schema — never writes raw LLM prose to source files

### Security & UX

- [ ] **SEC-01**: KEK rotation infrastructure with versioned key table, audit trail, and bulk re-encryption capability
- [ ] **SEC-02**: All tRPC routes use authenticatedProcedure (dev-mode bypass preserved when CAULDRON_API_KEY is unset)
- [ ] **SEC-03**: DAGCanvas wrapped in React error boundary with fallback UI — layout failures don't crash the execution page

### Performance & Architecture

- [ ] **PERF-01**: Projects list loads in a single query with joins or window functions — no N+1 pattern
- [ ] **ARCH-01**: MCP push notifications delivered via Redis pub/sub bridge between Inngest worker process and MCP stdio process

## Future Requirements

### Deferred from v1.2

- **STYLE-01**: Style-aware interview capturing visual direction as a first-class ambiguity dimension — v1.3
- **MODEL-01**: Model acquisition UX (import from ComfyUI install or guided upstream download) — v1.3

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full auth system (OAuth, sessions, RBAC) | v1.2 scopes to API key auth only — sufficient for single-operator local use |
| Database sharding or partitioning | Event table indexes solve the immediate performance problem |
| Distributed locking (Redis-based) | Optimistic concurrency at DB level is sufficient for current scale |
| Process sandboxing | Timeout kill is sufficient; full sandboxing is v2+ |
| MCP transport migration (stdio → SSE) | Redis pub/sub bridges the gap without transport rewrite |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | — | Pending |
| DATA-02 | — | Pending |
| DATA-03 | — | Pending |
| DATA-04 | — | Pending |
| DATA-05 | — | Pending |
| CONC-01 | — | Pending |
| CONC-02 | — | Pending |
| CONC-03 | — | Pending |
| CONC-04 | — | Pending |
| CONC-05 | — | Pending |
| SEC-01 | — | Pending |
| SEC-02 | — | Pending |
| SEC-03 | — | Pending |
| PERF-01 | — | Pending |
| ARCH-01 | — | Pending |

**Coverage:**
- v1.2 requirements: 15 total
- Mapped to phases: 0
- Unmapped: 15

---
*Requirements defined: 2026-04-01*
*Last updated: 2026-04-01 after initial definition*
