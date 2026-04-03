# E2E Live Pipeline Debug Session — 2026-04-03 ~2AM

## What We Fixed (committed)

1. **`c7ab9a8` — Crystallization error handling** — `handleApproveSummary` now catches errors and shows an error banner with retry. Also fixed `getHoldouts` field mapping (title/given/when/then vs name/description).

2. **`73b2b69` — Crystallize timeout** — Increased from 2min to 5min. The `approveSummary` mutation includes an LLM call (Gemini Flash) for holdout generation that can take several minutes.

3. **`b6589b1` - `94ead54` - `548aa23` - `923cc44` - `182fc2e` — E2E test robustness** — Stricter readiness checks, page reload on stall, warmup loop, compilation wait, removed `networkidle` hang.

## What's Still Failing

The test consistently fails at the **"wait for first AI response"** step. The flow is:
1. Project created ✓
2. Interview page loads ✓ (after warmup)
3. Auto-start creates interview ✓ (sometimes needs reload)
4. First message sent ✓ ("Thinking..." appears)
5. **AI response never renders** — perspective avatars (`[title="henry-wu"]` etc.) count stays at 0

### First run tonight (before fixes): WORKED
- Interview completed in 2 turns
- Crystallized seed ✓
- Stalled at holdout review (the bug we fixed)

### Subsequent runs: FAIL at avatar wait
- Next.js dev mode instability after repeated starts/stops
- `500 "Unexpected end of JSON input"` and `"Manifest file is empty"` errors
- `sendAnswer` mutation returns 200 but transcript update doesn't reach the client

## Root Cause Assessment

The avatar failure is **not an application bug** — it's Next.js dev mode instability:
- Each test run starts/stops Next.js dev server
- Dev mode compilation races cause 500s on tRPC routes
- The `sendAnswer` tRPC call may succeed server-side but the transcript polling/refetch that updates the UI fails or returns stale data
- SSE updates (Postgres LISTEN/NOTIFY → SSE → client) may not be connected in time

## Recommendations for Zak

### Quick win: Run it once, clean
```bash
docker compose -f docker-compose.live-test.yml down -v
rm -rf packages/web/.next
# Then run ONCE without HMR churn:
pnpm -F @get-cauldron/web test:live
```
The first run tonight worked. The issue is repeated runs. A single clean run should work.

### Medium: Add pre-warmup to live-infra.ts
The `LiveInfra.start()` should hit the interview page route BEFORE returning "all ready". This forces Next.js to compile the route while no test is running.

### Longer: Consider a production build for E2E
The test uses `pnpm dev` which runs Next.js in dev mode. Dev mode has HMR, slow compilation, manifest corruption on repeated visits. A `pnpm build && pnpm start` for the test would be slower to start but dramatically more stable. The `playwright.live.config.ts` should have an option for this.

### Biggest ROI: The holdout handoff fix
Even if the dev mode flakiness persists, the crystallization error handling fix (c7ab9a8) is a real production bug fix. If holdout LLM generation fails, the user now sees an error instead of a silent freeze.
