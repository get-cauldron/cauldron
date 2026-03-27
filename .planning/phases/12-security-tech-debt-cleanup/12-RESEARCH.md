# Phase 12: Security & Tech Debt Cleanup - Research

**Researched:** 2026-03-27
**Domain:** Next.js Route Handler security, CLI flag design, documentation accuracy
**Confidence:** HIGH

## Summary

Phase 12 closes three discrete warning-level findings from the Phase 11 milestone audit. None of the findings touch v1 requirements — all requirements are already satisfied at the code level. The work is surgical: one security hardening, one CLI usability fix, and one documentation correction.

The three success criteria map directly to three isolated changes:

1. **SSE access gate** — `/api/events/[projectId]/route.ts` streams events to any caller that knows the URL, with no API key check. The fix mirrors the existing `validateApiKey` pattern in `packages/web/src/trpc/init.ts`: read the `Authorization: Bearer` header and return `401` if `CAULDRON_API_KEY` is set and the key is wrong or missing.

2. **`--project-id` flag on kill** — The `kill` command already reads `flags.projectId`, which `cli.ts` populates from `--project` (the shared flag for all commands). The phase requirement says `kill` should also accept `--project-id` as a local override. This is a two-part change: add `project-id` as an option in `parseArgs` inside `cli.ts` (or parse it locally in `kill.ts`), and fall back from `--project-id` to `--project` to `CAULDRON_PROJECT_ID`.

3. **VERIFICATION.md status correction** — The Phase 09 VERIFICATION.md frontmatter says `status: passed` but the body documents `status: gaps_found`. The two gaps were resolved later (Phase 09 re-verification happened inline within the same file at lines 8-12 of the frontmatter). The frontmatter needs to reflect the resolved state accurately, and the body status line needs to match.

**Primary recommendation:** These are three isolated, single-file edits. Plan them as one wave with three tasks. No new dependencies needed.

## Standard Stack

No new libraries are introduced by this phase.

### Core (existing, referenced)
| Library | Version | Purpose |
|---------|---------|---------|
| `node:util` `parseArgs` | Built-in | CLI arg parsing in `packages/api/src/cli.ts` |
| Next.js App Router | 16.2.1 | Route handler in `packages/web/src/app/api/events/[projectId]/route.ts` |
| Drizzle ORM | 0.45.1 | DB query in SSE handler (already present, no changes) |

## Architecture Patterns

### Pattern 1: API Key Validation in Next.js Route Handlers

The existing auth pattern is in `packages/web/src/trpc/init.ts`:

```typescript
// Source: packages/web/src/trpc/init.ts
function validateApiKey(req?: Request): boolean {
  const expectedKey = process.env['CAULDRON_API_KEY'];
  if (!expectedKey) {
    return true; // Dev mode: no key configured, allow all
  }
  if (!req) return false;
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return false;
  const providedKey = authHeader.slice('Bearer '.length);
  return providedKey === expectedKey;
}
```

The SSE route handler should apply this same logic. If the key is wrong, return a `Response` with status 401 immediately — before the `ReadableStream` is constructed. This prevents the stream setup overhead and is standard HTTP auth practice.

```typescript
// Pattern for SSE route handler (packages/web/src/app/api/events/[projectId]/route.ts)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  // Auth gate — must come before stream construction
  const expectedKey = process.env['CAULDRON_API_KEY'];
  if (expectedKey) {
    const authHeader = request.headers.get('Authorization');
    const providedKey = authHeader?.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : null;
    if (providedKey !== expectedKey) {
      return new Response('Unauthorized', { status: 401 });
    }
  }
  // ... rest of existing handler unchanged
}
```

The `logsCommand` in `packages/api/src/commands/logs.ts` already sends the `Authorization: Bearer ${apiKey}` header via its custom `fetch` wrapper, so the CLI will pass the check without modification.

### Pattern 2: CLI Flag Parsing for Per-Command Overrides

The current `cli.ts` uses `parseArgs` with `strict: false` and a shared `--project` flag. The kill command's success criterion asks for `--project-id` as a flag name (distinct from `--project`).

Two valid approaches:

**Option A: Add `project-id` to the global `parseArgs` in `cli.ts`**
Add `'project-id': { type: 'string' }` to the `options` object in `main()`. Then pass `values['project-id'] ?? values['project'] ?? process.env['CAULDRON_PROJECT_ID']` as `projectId` in flags. This makes `--project-id` available to all commands uniformly.

**Option B: Parse `--project-id` locally inside `kill.ts`**
The `kill` command already receives raw `args: string[]`. It can parse `--project-id` itself: `args.indexOf('--project-id')` pattern, same as `--bead-id` parsing at line 26-27 of kill.ts. This is more surgical but inconsistent with how other flags work.

**Recommendation: Option A** — adding to the global `parseArgs` is consistent with the existing pattern and costs zero extra logic. `strict: false` means unknown flags are already silently passed through, but Option A makes the type explicit and ensures `values['project-id']` is typed as `string | undefined`.

The kill command's `Flags` interface needs `projectId` to be populated from either source:

```typescript
// cli.ts flags construction (updated)
const flags = {
  json: (values['json'] as boolean | undefined) ?? false,
  projectId:
    (values['project-id'] as string | undefined) ??
    (values['project'] as string | undefined) ??
    process.env['CAULDRON_PROJECT_ID'],
};
```

### Pattern 3: VERIFICATION.md Frontmatter Correction

The Phase 09 VERIFICATION.md frontmatter at `/Users/zakkeown/Code/cauldron/.planning/phases/09-cli/09-VERIFICATION.md`:

Current (lines 1-12):
```yaml
---
phase: 09-cli
verified: 2026-03-27T15:02:14Z
status: passed
score: 7/7 must-haves verified
gaps:
  - truth: "cauldron logs streams pipeline events in real-time via SSE"
    status: resolved
    resolution: "Imported logsCommand in cli.ts and routed 'case logs' to it with serverUrl/apiKey from config"
  - truth: "Valid push event triggers a pipeline run for the matching project"
    status: resolved
    resolution: "Added inngest.send({ name: 'cauldron/pipeline.trigger' }) call in webhook route after appendEvent"
```

The `status: passed` and `score: 7/7` are correct — these were set after gap resolution. The body `status: gaps_found` at line 29 is the stale remnant of the pre-resolution state. The body also says `Score: 5/7 truths verified` at line 46 — this was also pre-resolution.

The body needs to reflect that this is a re-verified file with the original findings documented as historical and the current status as passed.

### Anti-Patterns to Avoid

- **Inline auth logic** in the SSE handler: extract a function or inline the check but do NOT duplicate the multi-line `validateApiKey` function body. The pattern is simple enough to inline (5 lines) without extracting since the SSE route has no access to `createTRPCContext`.
- **Breaking the `--project` flag**: the global `--project` flag must remain because all other commands use it. `--project-id` is additive.
- **Rewriting VERIFICATION.md body wholesale**: only update the `status:` line in the body (line 29) and the `Score:` summary (line 46), and add a re-verification note. The full observable truths table, anti-patterns, and behavioral checks remain as accurate historical record.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Auth header parsing | Custom regex or manual string slicing | `authHeader?.startsWith('Bearer ')` + `slice()` — already validated pattern in `init.ts` |
| Flag precedence logic | Complex flag parser | `??` chain: `--project-id` ?? `--project` ?? env var |

## Common Pitfalls

### Pitfall 1: SSE Stream Already Started Before 401

**What goes wrong:** Returning 401 after `controller.enqueue()` has been called does not work — the HTTP response headers (200 OK + text/event-stream) have already been sent. The client will receive 200 and then get garbage data.

**Why it happens:** `ReadableStream` with `start()` is synchronous setup; the HTTP response is constructed from the stream before `start()` runs. Auth must happen before `new ReadableStream(...)` is called.

**How to avoid:** Place the auth check before `const stream = new ReadableStream(...)` and return early with `new Response('Unauthorized', { status: 401 })` if the key is wrong.

**Warning signs:** Any auth check placed inside the `start(controller)` callback is too late.

### Pitfall 2: `--project-id` vs `--project` collision

**What goes wrong:** If both `--project-id` and `--project` are passed, the last one wins unless precedence is explicit.

**Why it happens:** `parseArgs` with `strict: false` doesn't enforce mutual exclusivity.

**How to avoid:** Use `??` chain: `values['project-id'] ?? values['project'] ?? env_var`. This gives `--project-id` precedence over `--project` over env var, which is the most specific-wins pattern CLI users expect.

### Pitfall 3: VERIFICATION.md body/frontmatter drift

**What goes wrong:** Updating only one location (frontmatter or body) creates a contradictory document that misleads the planner and verifier.

**Why it happens:** The file has two status sources — YAML frontmatter and a Markdown table row.

**How to avoid:** Update both locations atomically in one Edit call. The frontmatter `status` and the body `**Status:**` line must agree.

## Code Examples

### SSE Auth Gate (verified pattern from codebase)
```typescript
// Full pattern for packages/web/src/app/api/events/[projectId]/route.ts
// Place before stream construction at line 22

const expectedKey = process.env['CAULDRON_API_KEY'];
if (expectedKey) {
  const authHeader = request.headers.get('Authorization');
  const providedKey = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : null;
  if (providedKey !== expectedKey) {
    return new Response('Unauthorized', { status: 401 });
  }
}
```

### parseArgs Addition (verified pattern from codebase)
```typescript
// packages/api/src/cli.ts — options object inside parseArgs call
options: {
  json: { type: 'boolean', default: false },
  project: { type: 'string' },
  'project-id': { type: 'string' }, // add this
},
```

## State of the Art

No library version changes or migrations in this phase. All patterns are already established in the codebase.

## Open Questions

None. All three success criteria are fully specified and the target code is read.

## Environment Availability

Step 2.6: SKIPPED — no external dependencies. All three changes are code/documentation edits only. No new tools, services, CLIs, or runtimes are required.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.x |
| Config file | Each package has its own `vitest.config.ts` |
| Quick run command | `pnpm --filter @cauldron/web exec vitest run` |
| Full suite command | `pnpm --filter @cauldron/web exec vitest run && pnpm --filter @cauldron/cli exec vitest run` |

### Phase Requirements to Test Map

This phase has no mapped requirement IDs. The three success criteria are gap-closure items. Test coverage needs:

| Success Criterion | Behavior | Test Type | Automated Command | File Exists? |
|-------------------|----------|-----------|-------------------|-------------|
| SSE auth gate | GET /api/events/[id] returns 401 with wrong key | unit | `pnpm --filter @cauldron/web exec vitest run src/app/api/events` | No — Wave 0 |
| SSE auth gate | GET /api/events/[id] returns 200 in dev mode (no key) | unit | same | No — Wave 0 |
| `--project-id` flag | kill command resolves projectId from `--project-id` flag | unit | `pnpm --filter @cauldron/cli exec vitest run src/__tests__/kill` | No — Wave 0 |
| `--project-id` flag | `--project-id` takes precedence over `--project` | unit | same | No — Wave 0 |
| VERIFICATION.md | frontmatter status matches body status | manual (read file) | N/A | N/A |

### Sampling Rate
- **Per task commit:** Quick run on the affected package
- **Per wave merge:** Full suite on web + cli packages
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/web/src/app/api/events/__tests__/route.test.ts` — covers SSE auth gate (401 with key, 200 without key in dev mode)
- [ ] `packages/api/src/__tests__/kill-project-id-flag.test.ts` — covers `--project-id` flag precedence (or add test cases to existing kill.test.ts if it exists)

## Sources

### Primary (HIGH confidence)
- Direct code read: `packages/web/src/app/api/events/[projectId]/route.ts` — current SSE handler with no auth
- Direct code read: `packages/web/src/trpc/init.ts` — `validateApiKey` pattern to replicate
- Direct code read: `packages/api/src/commands/kill.ts` — current flag handling
- Direct code read: `packages/api/src/cli.ts` — global `parseArgs` config and flag population
- Direct code read: `packages/api/src/commands/logs.ts` — confirms SSE client already sends Bearer header
- Direct code read: `.planning/phases/09-cli/09-VERIFICATION.md` — documents the status discrepancy
- Direct code read: `packages/shared/src/db/schema/project.ts` — confirms no user/auth ownership model in v1

### Secondary (MEDIUM confidence)
- Next.js App Router docs pattern: early return from Route Handler before stream construction is the correct auth gate location

## Metadata

**Confidence breakdown:**
- SSE auth gate: HIGH — code read, pattern exists in same codebase, no new library needed
- `--project-id` flag: HIGH — code read, `parseArgs` option addition is trivial, precedence chain is clear
- VERIFICATION.md correction: HIGH — both locations identified, edit is mechanical

**Research date:** 2026-03-27
**Valid until:** Stable — no external dependencies; valid until the files being edited change

## Project Constraints (from CLAUDE.md)

Directives the planner must verify compliance with:

- **TypeScript end-to-end:** All edits stay in TypeScript. The SSE route handler change is TypeScript. The CLI flag change is TypeScript. No new files need to be in another language.
- **No external dependencies for encryption:** Not applicable to this phase.
- **Hono for standalone API, Next.js Route Handlers for dashboard:** The SSE endpoint is a Next.js Route Handler — correct, no change needed.
- **No WebSockets for streaming:** The SSE handler stays SSE — correct.
- **Vitest for testing:** New tests (Wave 0 gaps) must use Vitest.
- **GSD workflow enforcement:** All edits must go through `/gsd:execute-phase` — no direct repo edits outside GSD.
- **OSS dependencies:** This phase adds zero new dependencies.
