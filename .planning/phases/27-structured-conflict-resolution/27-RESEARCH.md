# Phase 27: Structured Conflict Resolution - Research

**Researched:** 2026-04-02
**Domain:** Vercel AI SDK `generateObject` — structured LLM output with Zod schema validation
**Confidence:** HIGH

## Summary

Phase 27 is a targeted refactor of a single method: `MergeQueue.resolveConflict()` in `packages/engine/src/execution/merge-queue.ts` (lines 166–240). The method currently calls `gateway.generateText()` and then string-scans the prose response for confidence substrings. This approach allows raw LLM text to be written directly to source files.

The replacement is mechanical: swap `generateText` for `gateway.generateObject()` with a Zod schema that defines per-file resolved content and a typed `confidence` enum. The gateway already has a working `generateObject` method used by the holdout generator, the decomposer, and the evolution evaluator. The pattern is established and consistent. No gateway changes are needed.

The test file (`merge-queue.test.ts`) currently mocks `gateway.generateText`. Those mocks must be updated to mock `gateway.generateObject` and return `{ object: { ... } }` instead of `{ text: '...' }`.

**Primary recommendation:** Define a `ConflictResolutionSchema` with `z.object({ confidence: z.enum(['high', 'low']), files: z.array(z.object({ path: z.string(), resolved_content: z.string() })) })`, call `gateway.generateObject({ ..., schema: ConflictResolutionSchema })`, and use `result.object` directly — no string-scanning, no prose-to-filesystem writes.

## Project Constraints (from CLAUDE.md)

- TypeScript end-to-end — no plain JS
- Vercel AI SDK 6 for all LLM interactions
- Zod 4 for schema validation (note: project uses `zod` v4 — `import { z } from 'zod'`)
- Vitest 4 for all unit tests
- Do NOT use Jest, `pg` driver, or third-party crypto wrappers
- GSD workflow enforcement — changes made through `/gsd:execute-phase`

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None — all implementation choices are at Claude's discretion.

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. The current `resolveConflict` in `packages/engine/src/execution/merge-queue.ts` uses `generateText` + string-scanning for confidence. Must switch to `generateObject` with a Zod schema that returns per-file resolved contents and a typed confidence enum.

### Deferred Ideas (OUT OF SCOPE)
None — infrastructure phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CONC-05 | Merge conflict resolver extracts structured JSON per file via AI SDK `generateObject` with Zod schema — never writes raw LLM prose to source files | `gateway.generateObject<T>()` exists and is tested. Zod schema with typed confidence enum replaces string-scanning. `NoObjectGeneratedError` thrown on validation failure provides the explicit failure mode. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `zod` | 4.3.6 (installed) | Conflict resolution schema | Project standard for all schema validation; Zod 4 API used throughout engine |
| `ai` (Vercel AI SDK) | 6.0.138 (installed) | `generateObject` call, `NoObjectGeneratedError` | Project-mandated AI SDK; `generateObject` already used in holdout/decomposition/evolution |

### Already Available (no install needed)
| Asset | Location | Notes |
|-------|----------|-------|
| `LLMGateway.generateObject<T>()` | `packages/engine/src/gateway/gateway.ts:203` | Accepts `GatewayObjectOptions<T>`, returns `{ object: T, usage: ... }` |
| `GatewayObjectOptions<T>` | `packages/engine/src/gateway/types.ts:22` | Extends `GatewayCallOptions` + adds `schema`, `schemaName`, `schemaDescription` |
| `NoObjectGeneratedError` | exported from `'ai'` | Thrown by `generateObject` when Zod validation fails |

**Installation:** None required — all dependencies already present.

## Architecture Patterns

### Established `generateObject` Pattern (from `holdout/generator.ts`)
```typescript
// Source: packages/engine/src/holdout/generator.ts:86-103
import { z } from 'zod';

const result = await gateway.generateObject({
  projectId,
  stage: 'holdout',          // PipelineStage
  schema: HoldoutScenariosSchema,
  schemaName: 'HoldoutScenarios',
  schemaDescription: 'A collection of adversarial holdout test scenarios',
  prompt: buildGeneratorPrompt(seed),
  system: ADVERSARIAL_SYSTEM_PROMPT,
  temperature: 0.8,
});

// Use result.object — already validated by Zod, typed as z.infer<typeof HoldoutScenariosSchema>
return result.object.scenarios.map(s => ({ ...s }));
```

### Proposed `ConflictResolutionSchema`
```typescript
// Source: pattern — to be defined in merge-queue.ts (or inline)
import { z } from 'zod';

const ConflictResolutionFileSchema = z.object({
  path: z.string(),
  resolved_content: z.string(),
});

const ConflictResolutionSchema = z.object({
  confidence: z.enum(['high', 'low']),
  files: z.array(ConflictResolutionFileSchema),
});

type ConflictResolution = z.infer<typeof ConflictResolutionSchema>;
```

### Updated `resolveConflict` Signature (unchanged)
```typescript
private async resolveConflict(
  entry: MergeQueueEntry,
  conflicts: string[]
): Promise<{ resolved: boolean; confidence: 'high' | 'low' }>
```
The public return type does not change — `processMerge` checks `resolution.confidence`, which remains `'high' | 'low'`. Only the internals change.

### Anti-Patterns to Avoid
- **String-scanning prose:** `responseText.includes('"confidence": "low"')` — eliminates the current fragile heuristic
- **Writing `result.text` to files:** The old code wrote `responseText` directly to each conflicted file. The new code writes `file.resolved_content` from the validated schema.
- **Defining schema outside the module:** Keep `ConflictResolutionSchema` in `merge-queue.ts` — it's not shared; no need for a separate `types.ts` entry.
- **Catching `NoObjectGeneratedError` silently:** When validation fails, allow the error to propagate. The merge operation should fail explicitly (CONC-05 requirement).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Structured LLM output | Custom JSON parser on prose | `gateway.generateObject()` + Zod schema | AI SDK handles retry, JSON extraction, schema coercion, and throws `NoObjectGeneratedError` on failure |
| Confidence type safety | String comparison `=== 'high'` on parsed substring | `z.enum(['high', 'low'])` in schema | Enum exhaustiveness checked by TypeScript; typos caught at schema definition time |
| Per-file content extraction | Regex parsing of LLM multi-file blocks | `files: z.array(...)` in schema | LLM produces structured array; no regex needed |

**Key insight:** `generateObject` enforces the contract at the AI SDK level — the application never receives unvalidated data. `NoObjectGeneratedError` propagates up and causes the merge operation to fail explicitly rather than silently writing garbage.

## Common Pitfalls

### Pitfall 1: `AI_NoObjectGeneratedError` vs `NoObjectGeneratedError`
**What goes wrong:** The CONTEXT.md and ROADMAP reference `AI_NoObjectGeneratedError` (with `AI_` prefix). This name does NOT exist in the installed `ai` v6.0.138 package.
**Why it happens:** Older AI SDK documentation used the `AI_` prefix naming convention.
**How to avoid:** Import `NoObjectGeneratedError` (no prefix) from `'ai'`. Verified against installed `packages/engine/node_modules/ai/dist/index.d.ts`.
**Warning signs:** TypeScript compile error `Module '"ai"' has no exported member 'AI_NoObjectGeneratedError'`.

### Pitfall 2: Gateway mock shape in tests
**What goes wrong:** Existing `merge-queue.test.ts` mocks `gateway` with only `{ generateText: vi.fn() }`. After the switch, tests calling `resolveConflict` will fail with `gateway.generateObject is not a function`.
**Why it happens:** The test's gateway mock is hand-built without `generateObject`.
**How to avoid:** Update the `gateway` mock in `beforeEach` to include `generateObject: vi.fn()`. The mock return shape changes from `{ text: '...' }` to `{ object: { confidence: 'high'|'low', files: [...] }, usage: {} }`.
**Warning signs:** Runtime error in test: `TypeError: gateway.generateObject is not a function`.

### Pitfall 3: `merge --abort` still required for low confidence path
**What goes wrong:** The existing low-confidence path calls `git.raw(['merge', '--abort'])` to leave the working tree clean. This must be preserved after the schema switch — the structured schema tells us confidence, but the merge is still in-progress and must be aborted.
**Why it happens:** `generateObject` replaces the LLM call but doesn't change git state management.
**How to avoid:** Keep the `merge --abort` call in the low-confidence branch. The `files` array is simply unused in that path.

### Pitfall 4: `files` array iteration replaces `conflicts` array iteration
**What goes wrong:** The old code iterated `for (const file of conflicts)` and wrote `responseText` to each. The new code must iterate `result.object.files` and write `file.resolved_content` to `join(this.projectRoot, file.path)`.
**Why it happens:** The schema returns structured per-file objects; the conflicts list is now secondary.
**How to avoid:** Use `result.object.files` for the write loop. The `conflicts` parameter is still needed to build the prompt, but file writing should come from the schema-validated objects.

### Pitfall 5: Zod 4 import syntax
**What goes wrong:** Using `import { z } from 'zod/v4'` or other Zod 4 sub-path imports.
**Why it happens:** Zod 4 can be imported from `'zod/v4'` compatibility path, but the project uses `import { z } from 'zod'` throughout.
**How to avoid:** Use `import { z } from 'zod'` — consistent with holdout/generator.ts, decomposer.ts, and all other engine files.

## Code Examples

### Full Updated `resolveConflict` Skeleton
```typescript
// packages/engine/src/execution/merge-queue.ts
import { z } from 'zod';
import { NoObjectGeneratedError } from 'ai';

const ConflictResolutionFileSchema = z.object({
  path: z.string(),
  resolved_content: z.string(),
});

const ConflictResolutionSchema = z.object({
  confidence: z.enum(['high', 'low']),
  files: z.array(ConflictResolutionFileSchema),
});

// Inside MergeQueue class:
private async resolveConflict(
  entry: MergeQueueEntry,
  conflicts: string[]
): Promise<{ resolved: boolean; confidence: 'high' | 'low' }> {
  const conflictDetails: string[] = [];
  for (const file of conflicts) {
    try {
      const content = readFileSync(join(this.projectRoot, file), 'utf-8');
      conflictDetails.push(`=== ${file} ===\n${content}`);
    } catch {
      conflictDetails.push(`=== ${file} === (could not read file)`);
    }
  }

  const prompt = [
    `Bead ID: ${entry.beadId}`,
    `Project ID: ${entry.projectId}`,
    `Conflicted files:`,
    ...conflictDetails,
    '',
    'Resolve each conflicted file. Return confidence "high" if you can resolve all files correctly,',
    'or "low" if you cannot resolve confidently. Include resolved_content for each file.',
  ].join('\n');

  // Throws NoObjectGeneratedError if schema validation fails — merge fails explicitly
  const result = await this.gateway.generateObject({
    stage: 'conflict_resolution',
    prompt,
    projectId: entry.projectId,
    beadId: entry.beadId,
    schema: ConflictResolutionSchema,
    schemaName: 'ConflictResolution',
    schemaDescription: 'Structured resolution for each conflicted file with confidence assessment',
  });

  if (result.object.confidence === 'low') {
    const git = simpleGit(this.projectRoot);
    try {
      await git.raw(['merge', '--abort']);
    } catch {
      // ignore — nothing to abort
    }
    return { resolved: false, confidence: 'low' };
  }

  // High confidence — write resolved files from structured objects
  for (const file of result.object.files) {
    try {
      writeFileSync(join(this.projectRoot, file.path), file.resolved_content, 'utf-8');
    } catch {
      const git = simpleGit(this.projectRoot);
      try {
        await git.raw(['merge', '--abort']);
      } catch {
        // ignore
      }
      return { resolved: false, confidence: 'low' };
    }
  }

  const git = simpleGit(this.projectRoot);
  for (const file of result.object.files) {
    await git.add(file.path);
  }

  return { resolved: true, confidence: 'high' };
}
```

### Updated Test Mock for `gateway.generateObject`
```typescript
// packages/engine/src/execution/__tests__/merge-queue.test.ts
// In beforeEach:
gateway = {
  generateObject: vi.fn(),
};

// For high-confidence mock:
gateway.generateObject.mockResolvedValue({
  object: {
    confidence: 'high',
    files: [{ path: 'src/index.ts', resolved_content: 'const a = 1; // resolved\n' }],
  },
  usage: { inputTokens: 100, outputTokens: 50 },
});

// For low-confidence mock:
gateway.generateObject.mockResolvedValue({
  object: {
    confidence: 'low',
    files: [],
  },
  usage: { inputTokens: 100, outputTokens: 50 },
});
```

### Test for `NoObjectGeneratedError` propagation
```typescript
import { NoObjectGeneratedError } from 'ai';

it('if generateObject throws NoObjectGeneratedError, merge fails explicitly', async () => {
  worktreeManager.mergeWorktreeToMain.mockResolvedValue({
    success: false, conflicted: true, conflicts: ['src/index.ts'],
  });
  (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('conflict content');

  gateway.generateObject.mockRejectedValue(
    new NoObjectGeneratedError({ message: 'Failed to parse response', text: undefined, response: undefined, cause: undefined, usage: { inputTokens: 0, outputTokens: 0 } })
  );

  queue.enqueue(makeEntry());
  await expect(queue.processNext(testRunner)).rejects.toThrow(NoObjectGeneratedError);
});
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4 |
| Config file | `packages/engine/vitest.config.ts` |
| Quick run command | `pnpm -F @get-cauldron/engine test -- src/execution/__tests__/merge-queue.test.ts` |
| Full suite command | `pnpm -F @get-cauldron/engine test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONC-05 | Zod validation failure throws `NoObjectGeneratedError` (not silent write) | unit | `pnpm -F @get-cauldron/engine test -- src/execution/__tests__/merge-queue.test.ts` | Exists — needs new test case |
| CONC-05 | `confidence` field is typed enum (`'high'` or `'low'`), not string-scanned | unit | same | Exists — existing tests must be updated to mock `generateObject` |
| CONC-05 | Resolved file contents come from `file.resolved_content` in schema, not raw LLM text | unit | same | Exists — needs write-verification test |

### Sampling Rate
- **Per task commit:** `pnpm -F @get-cauldron/engine test -- src/execution/__tests__/merge-queue.test.ts`
- **Per wave merge:** `pnpm -F @get-cauldron/engine test`
- **Phase gate:** Full suite green + `pnpm typecheck` before `/gsd:verify-work`

### Wave 0 Gaps
None — `merge-queue.test.ts` exists and has the test infrastructure. Three test cases need updating/addition:
- Update existing conflict tests to mock `generateObject` instead of `generateText`
- Add `NoObjectGeneratedError` propagation test (new)
- Add assertion that `writeFileSync` is called with `file.resolved_content`, not raw LLM text (update existing high-confidence test)

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — pure code refactor of a single method)

## Sources

### Primary (HIGH confidence)
- Installed `packages/engine/node_modules/ai/dist/index.d.ts` — confirmed `NoObjectGeneratedError` class name (no `AI_` prefix), `generateObject` export
- `packages/engine/src/gateway/gateway.ts:203` — confirmed `generateObject<T>(options: GatewayObjectOptions<T>)` exists with correct signature
- `packages/engine/src/gateway/types.ts:22` — confirmed `GatewayObjectOptions<T>` interface shape
- `packages/engine/src/holdout/generator.ts:86` — verified established `generateObject` pattern with `result.object` access
- `packages/engine/src/execution/merge-queue.ts:166-240` — read existing `resolveConflict` implementation in full
- `packages/engine/src/execution/__tests__/merge-queue.test.ts` — read all existing tests; identified mock update requirements

### Secondary (MEDIUM confidence)
- None needed — all findings are from direct code inspection

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified directly against installed node_modules types and existing usage
- Architecture: HIGH — pattern copied from working `holdout/generator.ts`; gateway already has `generateObject`
- Pitfalls: HIGH — all pitfalls derived from direct code inspection (`AI_NoObjectGeneratedError` naming checked against installed types, mock shape verified against test file)

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable — no new dependencies; only version risk is if `ai` package is bumped)
