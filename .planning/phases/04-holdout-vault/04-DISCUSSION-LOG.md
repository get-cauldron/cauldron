# Phase 4: Holdout Vault - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-26
**Phase:** 04-holdout-vault
**Areas discussed:** Test generation strategy, Human review & approval flow, Encryption & key isolation, Unsealing protocol

---

## Test Generation Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Scenario-based acceptance tests | Behavioral scenarios in Given/When/Then format from seed's acceptance criteria | ✓ |
| Code-level test stubs | Actual test code (Vitest/Playwright) with assertions | |
| Mixed: scenarios + code stubs | Both behavioral scenarios and executable test code | |

**User's choice:** Scenario-based acceptance tests

| Option | Description | Selected |
|--------|-------------|----------|
| Proportional to acceptance criteria | 1-3 scenarios per criterion, minimum 5 total | ✓ |
| Fixed count | Always generate exactly N tests | |

**User's choice:** Proportional to acceptance criteria

| Option | Description | Selected |
|--------|-------------|----------|
| Single structured call | One gateway.generateObject with holdout stage | ✓ |
| Multiple specialized calls | Separate calls for edge cases, happy paths, etc. | |

**User's choice:** Single structured call

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, adversarial prompt included | System prompt emphasizes LLM blind spots | ✓ |
| Standard test coverage only | Just generate from acceptance criteria | |

**User's choice:** Yes, adversarial prompt included

| Option | Description | Selected |
|--------|-------------|----------|
| Given/When/Then + metadata | Structured with id, title, given, when, then, category, severity | ✓ |
| Free-form description | Plain text descriptions | |

**User's choice:** Given/When/Then + metadata

---

## Human Review & Approval Flow

| Option | Description | Selected |
|--------|-------------|----------|
| Full review with edit/reject per scenario | Approve, edit, or reject individually; bulk approve option | ✓ |
| Approve/reject as a batch | All-or-nothing approval | |

**User's choice:** Full review with edit/reject per scenario

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, explicit seal confirmation | Separate "Seal Vault" action with irreversibility warning | ✓ |
| Approval IS sealing | Approving last scenario auto-triggers encryption | |

**User's choice:** Yes, explicit seal confirmation

| Option | Description | Selected |
|--------|-------------|----------|
| Single encrypted blob | All scenarios as one ciphertext blob, one vault row per seed | ✓ |
| Per-scenario encryption | Each scenario encrypted separately | |

**User's choice:** Single encrypted blob

| Option | Description | Selected |
|--------|-------------|----------|
| Regenerate rejected + keep approved | Only rejected scenarios regenerated, approved preserved | ✓ |
| Full regeneration only | Rejecting any triggers complete regeneration | |

**User's choice:** Regenerate rejected + keep approved

---

## Encryption & Key Isolation

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, envelope encryption | Random DEK per holdout set, encrypted with KEK from env var | ✓ |
| Direct encryption only | Encrypt directly with HOLDOUT_ENCRYPTION_KEY | |

**User's choice:** Yes, envelope encryption

| Option | Description | Selected |
|--------|-------------|----------|
| Inngest step-level env scoping | Encryption runs in dedicated Inngest step with key; agents spawned without | ✓ |
| Separate encryption service process | Standalone process for all encryption operations | |
| Process-level env filtering | Strip key from child process environment at spawn | |

**User's choice:** Inngest step-level env scoping

| Option | Description | Selected |
|--------|-------------|----------|
| Integration test simulating agent env | Child process without key attempts decrypt, asserts failure | |
| Unit test with env mocking | Mock process.env, verify decrypt throws | |
| Both unit + integration | Belt and suspenders | ✓ |

**User's choice:** Both unit + integration

---

## Unsealing Protocol

| Option | Description | Selected |
|--------|-------------|----------|
| Convergence event from Phase 7 | Vault listens for evolution_converged event, unseals | ✓ |
| Explicit API call | Direct function call from Phase 7 code | |

**User's choice:** Convergence event from Phase 7

| Option | Description | Selected |
|--------|-------------|----------|
| LLM evaluator with codebase context | Evaluation-stage LLM assesses pass/fail per scenario | ✓ |
| Automated test execution | Convert scenarios to executable tests at unseal time | |

**User's choice:** LLM evaluator with codebase context

| Option | Description | Selected |
|--------|-------------|----------|
| Failure context packaged for evo loop | Structured failure report attached to evolution_started event | ✓ |
| Direct seed evolution trigger | Phase 4 directly creates evolved seed | |

**User's choice:** Failure context packaged for evo loop

| Option | Description | Selected |
|--------|-------------|----------|
| Add pending_review and approved | Full lifecycle: pending_review → approved → sealed → unsealed → evaluated | ✓ |
| Keep existing 3 states | Track review state separately | |

**User's choice:** Add pending_review and approved

| Option | Description | Selected |
|--------|-------------|----------|
| No re-sealing needed | Once unsealed, scenarios become known; evo loop uses them as additional AC | ✓ |
| Re-seal with new scenarios | Generate new holdout scenarios each evolution cycle | |

**User's choice:** No re-sealing needed

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, evaluation results stored | JSONB on holdout_vault row with per-scenario pass/fail and reasoning | ✓ |
| Event store only | Results only in event log | |

**User's choice:** Yes, evaluation results stored

---

## Claude's Discretion

- Exact adversarial system prompt content
- Zod schema details for holdout scenarios
- Inngest step configuration for env isolation
- Encryption/decryption function implementation details
- Event handler registration pattern
- Holdout evaluation prompt design
- Failure report structure for evo loop consumption
- Migration SQL for holdoutStatusEnum extension

## Deferred Ideas

None — discussion stayed within phase scope
