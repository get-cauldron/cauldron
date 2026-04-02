# Phase 28: KEK Rotation Infrastructure - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

A KEK compromise can be responded to by rotating to a new key and re-encrypting all DEKs, with a complete audit trail and no disruption to in-flight holdout evaluations. Implements dual-encrypt window so old key remains valid during rotation.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. The existing holdout crypto is in `packages/engine/src/holdout/crypto.ts` using AES-256-GCM envelope encryption. The vault is in `packages/engine/src/holdout/vault.ts`. KEK rotation needs a utility that re-encrypts all DEKs under a new KEK with audit trail events.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/engine/src/holdout/crypto.ts` — AES-256-GCM envelope encryption (DEK/KEK)
- `packages/engine/src/holdout/vault.ts` — holdout vault storage and retrieval
- `packages/engine/src/holdout/types.ts` — holdout type definitions
- `packages/shared/src/db/schema/` — database schema including holdout_vault table

### Established Patterns
- `node:crypto` for all cryptographic operations (no third-party crypto)
- Event sourcing via `appendEvent` for audit trail
- Database transactions via Drizzle ORM

### Integration Points
- `holdout_vault` table — stores encrypted DEKs
- Event store — audit trail for rotation events
- CLI — rotation command entry point

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Refer to ROADMAP phase description and success criteria.

</specifics>

<deferred>
## Deferred Ideas

None — infrastructure phase.

</deferred>
