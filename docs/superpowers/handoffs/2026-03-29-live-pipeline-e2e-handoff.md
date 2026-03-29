# Live Pipeline E2E Test — Handoff

**Date:** 2026-03-29
**Status:** Interview loop proven working, dev mode timing race remaining

## What Was Built

A single Playwright test (`packages/web/e2e/pipeline-live.spec.ts`) that boots the full Cauldron stack and drives a URL shortener project through the entire pipeline using real LLM calls. Claude Haiku plays the simulated user; gpt-4.1-mini and gemini-2.5-flash handle the pipeline stages.

### Files Created/Modified

| File | Action | Purpose |
|------|--------|---------|
| `packages/engine/src/gateway/config.ts` | Modified | `CAULDRON_CONFIG_PATH` env var for loadConfig override |
| `packages/web/src/trpc/engine-deps.ts` | Modified | `CAULDRON_CONFIG_OVERRIDE` env var for Next.js config injection |
| `docker-compose.live-test.yml` | Created | Isolated Docker services (Postgres :5435, Redis :6380, Inngest :8290) |
| `packages/web/playwright.live.config.ts` | Created | 45min timeout, trace always on, no globalSetup/webServer |
| `packages/web/e2e/helpers/live-infra.ts` | Created | Docker + server lifecycle, health checks, process group teardown |
| `packages/web/e2e/helpers/simulated-user.ts` | Created | Haiku-based interview answerer + MC chip keyword matcher |
| `packages/web/e2e/pipeline-live.spec.ts` | Created | 6 pipeline stages: create → interview → crystallize → holdouts → execute → evolve |
| `packages/web/package.json` | Modified | Added `test:live` script, `ai` + `@ai-sdk/anthropic` devDeps |

### Design Docs

- Spec: `docs/superpowers/specs/2026-03-29-live-pipeline-e2e-design.md`
- Plan: `docs/superpowers/plans/2026-03-29-live-pipeline-e2e.md`

## How to Run

```bash
set -a && source .env && set +a && pnpm -F @get-cauldron/web test:live
```

Prerequisites: Docker running, API keys in `.env` (OPENAI, ANTHROPIC, GOOGLE).

## Where It Stopped

**Stage 2 (Interview)** — the interview loop works but hits a dev mode timing race.

### The Proven Path (Attempt 10)

```
startInterview → 200 (46ms)
sendAnswer → 200 (6.7s, real LLM call to gpt-4.1-mini)
Perspective avatar found: 1 ← first AI question rendered!
```

The interview loop logic (find AI message → call Haiku → type/click answer → wait for next question) is correct and worked end-to-end with real LLM calls.

### The Remaining Bug

**Race condition between auto-start and sendAnswer in Next.js dev mode.**

The interview page has a `useEffect` that auto-starts the interview when `getTranscript` returns `status: 'not_started'`. The test waits for this, then types and clicks Send. But in dev mode:

1. Next.js webpack compilation (`"Compiling..."`) delays page readiness
2. The `startInterview` mutation sometimes 500s on first try (gateway initialization race in `engine-deps.ts`)
3. Our `sendAnswer` click can arrive before `startInterview` completes

**The fix needed:** After confirming "Interview not started" has disappeared, add a short wait + retry logic for the `sendAnswer` click. Specifically:

```typescript
// After "Interview not started" disappears, wait for the page to stabilize
await page.waitForTimeout(3000);

// Fill input and click send — retry if sendAnswer fails
await expect(async () => {
  await answerInput.fill(LIVE_CONFIG.project.description);
  await page.waitForTimeout(300);
  const btn = page.getByRole('button', { name: /send answer/i });
  await expect(btn).toBeEnabled({ timeout: 3000 });
  await btn.click();
  // Wait for thinking indicator OR perspective avatar to confirm it worked
  const thinking = page.getByText('Thinking...');
  await thinking.waitFor({ state: 'visible', timeout: 5000 });
}).toPass({ timeout: 30_000, intervals: [5_000] });
```

This retries the fill+click every 5 seconds until the `sendAnswer` actually succeeds (indicated by "Thinking..." appearing).

## Bugs Found and Fixed (10+)

| # | Bug | Root Cause | Fix |
|---|-----|-----------|-----|
| 1 | Engine server crash on start | `CAULDRON_CONFIG_PATH=''` caused import from empty path | `\|\|` instead of `??` in config.ts |
| 2 | Test can't find AI messages | `data-testid` attributes don't exist on ChatBubble | Use `[title="researcher"]` etc. |
| 3 | Servers not killed on teardown | `SIGTERM` on pnpm doesn't kill child Node processes | `detached: true` + process group `SIGKILL` |
| 4 | Docker killed by teardown | `lsof \| xargs kill -9` too aggressive | Filter to node processes only |
| 5 | Can't interact during "Compiling" | Next.js dev mode webpack compilation | Wait for "Compiling" text to hide |
| 6 | Auto-start never fires | Page says "Send your first message" — user must initiate | Send initial message via UI |
| 7 | sendAnswer before interview exists | Race: clicked Send before startInterview completed | Wait for "Interview not started" to appear then disappear |
| 8 | Question text locator resolves to 2 elements | ChatBubble has content `<p>` + timestamp `<p>` | Use `.first()` |
| 9 | False positive on "not_started" check | Checked before React hydration, text not rendered yet | Wait for AMBIGUITY SCORE heading first |
| 10 | tRPC batch format wrong | Manual fetch used wrong body format | Correct to `{ "0": { json: { ... } } }` |

## Architecture Notes

- The test creates its own Docker services on unique ports (5435, 6380, 8290) so it doesn't conflict with dev
- `LiveInfra.buildEnv()` passes `CAULDRON_CONFIG_OVERRIDE` as JSON in the env to both servers
- The engine server (Hono :3001) loads the override config via `CAULDRON_CONFIG_OVERRIDE` in `engine-deps.ts`
- The simulated user calls Haiku directly via Vercel AI SDK — it's the only direct LLM call in the test code
- All other LLM calls flow through the real Cauldron pipeline via the UI

## What's Next After the Fix

Once the interview timing race is fixed, the test should progress through:
- **Stage 2:** Full interview loop (multiple turns with Haiku answering)
- **Stage 3:** Seed crystallization (approve the summary card)
- **Stage 4:** Holdout approval and sealing
- **Stage 5:** Decomposition + bead execution (this will surface Inngest/execution bugs)
- **Stage 6:** Evaluation and evolution

Each stage will likely surface its own bugs — that's the whole point. Fix and re-run until the pipeline executes end-to-end.
