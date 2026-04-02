# Deferred Items — 260402-o0w

## Out-of-Scope Pre-existing Failures

### pricing.test.ts: `returns correct cost for gpt-4o`
- **File:** `packages/engine/src/gateway/__tests__/pricing.test.ts:24`
- **Cause:** gpt-4o removed from MODEL_PRICING_MAP as part of Phase 30 (replace-openai-provider)
- **Owner:** Phase 30 Plan 01 (already in progress)

### diversity.test.ts: 5 failures referencing gpt-4o
- **File:** `packages/engine/src/gateway/__tests__/diversity.test.ts`
- **Cause:** gpt-4o removed from MODEL_FAMILY_MAP as part of Phase 30
- **Owner:** Phase 30 Plan 01 (already in progress)

These failures are pre-existing and caused by Phase 30's partial removal of OpenAI provider. Out of scope for this quick task.
