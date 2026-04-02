---
phase: quick
plan: 260402-oou
type: execute
wave: 1
depends_on: []
files_modified:
  # Core source
  - packages/engine/src/interview/types.ts
  - packages/engine/src/interview/perspectives.ts
  - packages/web/src/components/interview/ChatBubble.tsx
  - packages/engine/src/evolution/lateral-thinking.ts
  - cauldron.config.ts
  - packages/engine/src/gateway/config.ts
  # Tests
  - packages/engine/src/interview/__tests__/perspectives.test.ts
  - packages/engine/src/interview/__tests__/fsm.test.ts
  - packages/engine/src/interview/__tests__/scorer.test.ts
  - packages/engine/src/interview/__tests__/contrarian.test.ts
  - packages/engine/src/interview/__tests__/synthesizer.test.ts
  - packages/engine/src/evolution/__tests__/lateral-thinking.test.ts
  - packages/engine/src/evolution/__tests__/mutator.test.ts
  - packages/web/src/trpc/routers/__tests__/interview-engine.test.ts
  - packages/web/src/__tests__/components/interview/ChatBubble.test.tsx
  # E2E / harness
  - packages/web/e2e/interview.spec.ts
  - packages/web/e2e/pipeline-live.spec.ts
  - packages/web/e2e/helpers/live-infra.ts
  - packages/test-harness/src/scripts/interview-turn.ts
  - packages/test-harness/src/scripts/interview-turn.d.ts
  - packages/shared/src/db/__tests__/interview.integration.test.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "PerspectiveName type uses 'henry-wu' | 'occam' | 'heist-o-tron' | 'hickam' | 'kirk' — no old names remain"
    - "Each persona has a character-flavored system prompt reflecting their source material personality"
    - "All tests pass with new names"
    - "Build succeeds (typecheck clean)"
  artifacts:
    - path: "packages/engine/src/interview/types.ts"
      provides: "PerspectiveName union type with new persona names"
      contains: "henry-wu"
    - path: "packages/engine/src/interview/perspectives.ts"
      provides: "PERSPECTIVE_PROMPTS with character-flavored system prompts"
      contains: "Henry Wu"
    - path: "packages/web/src/components/interview/ChatBubble.tsx"
      provides: "PERSPECTIVE_COLORS mapped to new persona names"
      contains: "henry-wu"
  key_links:
    - from: "packages/engine/src/interview/types.ts"
      to: "packages/engine/src/interview/perspectives.ts"
      via: "PerspectiveName type import"
      pattern: "PerspectiveName"
    - from: "packages/engine/src/interview/perspectives.ts"
      to: "cauldron.config.ts"
      via: "perspectiveModels config keys"
      pattern: "henry-wu|occam|heist-o-tron|hickam|kirk"
---

<objective>
Rename the 5 interview perspective personas from generic roles to character personas with personality-driven system prompts.

Mapping:
- researcher -> henry-wu (Jurassic Park — "Map what's possible, leave ethics to others")
- simplifier -> occam (Occam's Razor — "Cut what isn't necessary")
- architect -> heist-o-tron (Rick and Morty — "Set up preconditions so execution is trivial")
- breadth-keeper -> hickam (Hickam's Dictum — "Don't collapse real complexity")
- seed-closer -> kirk (Star Trek — "We have enough — execute")

This is more than a find-and-replace: each persona gets a character-flavored system prompt that embodies their source material's personality and epistemology.

Purpose: Give the interview panel distinct intellectual identities that make their functions memorable and their counterweight dynamics legible.
Output: All perspective references updated, character prompts written, all tests green, typecheck clean.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/engine/src/interview/types.ts
@packages/engine/src/interview/perspectives.ts
@packages/engine/src/interview/fsm.ts
@packages/engine/src/interview/contrarian.ts
@packages/web/src/components/interview/ChatBubble.tsx
@packages/engine/src/evolution/lateral-thinking.ts
@cauldron.config.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rename PerspectiveName type and rewrite character system prompts</name>
  <files>
    packages/engine/src/interview/types.ts
    packages/engine/src/interview/perspectives.ts
    packages/web/src/components/interview/ChatBubble.tsx
    packages/engine/src/evolution/lateral-thinking.ts
    cauldron.config.ts
    packages/engine/src/gateway/config.ts
  </files>
  <action>
**Name mapping (apply everywhere):**
- `researcher` -> `henry-wu`
- `simplifier` -> `occam`
- `architect` -> `heist-o-tron`
- `breadth-keeper` -> `hickam`
- `seed-closer` -> `kirk`

**1. `packages/engine/src/interview/types.ts`:**
Change PerspectiveName union type to:
```typescript
export type PerspectiveName = 'henry-wu' | 'occam' | 'heist-o-tron' | 'hickam' | 'kirk';
```

**2. `packages/engine/src/interview/perspectives.ts`:**
Update PERSPECTIVE_PROMPTS keys to new names. Replace the generic role-based prompts with character-flavored ones:

- **henry-wu**: Channel Dr. Henry Wu from Jurassic Park. Warm, intellectually voracious, maps the full possibility space. His instinct is to explore every dimension — "someone else can decide whether to build it; my job is to know what's possible." Asks questions that surface hidden assumptions, alternative approaches, scale implications. Accepts the user's vision enthusiastically and helps them see angles they haven't considered. Does NOT moralize or warn — that's not his function.

- **occam**: Channel the spirit of William of Ockham — ruthless parsimony in friendly packaging. Pragmatic, direct, gently asks "what if we started with just..." questions. His razor cuts: every entity, feature, and constraint must justify its existence. If two approaches explain the same behavior, prefer the simpler. Never says the user is overcomplicating — instead helps them find the essential kernel. Friendly tone, sharp mind.

- **heist-o-tron**: Channel Rick Sanchez's heist-planning mode (the Heist-o-tron from "One Crew Over the Crewcoo's Morty"). Thinks in preconditions: the best execution is trivially easy because the setup was perfect. Asks about structural aspects — data models, component boundaries, integration points — framed as "if we set THIS up right, THAT becomes trivial." Slightly theatrical but genuinely insightful. Frame questions as "how would you like..." not "have you considered...".

- **hickam**: Channel Hickam's Dictum from medical epistemology — "A patient can have as many diseases as they damn well please." Protective of real complexity. Gently surfaces dimensions the user might want to think about: error handling, edge cases, deployment, accessibility. His instinct opposes premature simplification — some things ARE complex and collapsing them destroys information. Supportive tone, frames as "one thing worth thinking about is..." rather than pointing out gaps.

- **kirk**: Channel Captain Kirk's decisive command style — "We have enough intelligence. Now we act." Encouraging, action-oriented. Converts vision into concrete, testable acceptance criteria. Asks "how will we know when this is working?" and "what does success look like for...?" to drive toward a buildable spec. Restrained by Hickam and Henry Wu from closing too early, but his function is forward momentum.

Update `selectActivePerspectives` — replace all string literals with new names:
- Early turns: `['henry-wu', 'occam', 'hickam']`
- Mid turns: `'heist-o-tron'` replaces `'architect'`, dimension specialists mapped: successCriteriaClarity -> `'kirk'`, constraintClarity -> `'hickam'`, goalClarity -> `'henry-wu'`, fallbacks -> `['hickam', 'occam']`
- Late turns: `['kirk', 'heist-o-tron']`, with dimension specialists: constraintClarity -> `'hickam'`, goalClarity -> `'henry-wu'`, successCriteriaClarity -> `'occam'`

**3. `packages/web/src/components/interview/ChatBubble.tsx`:**
Update PERSPECTIVE_COLORS keys to new names. Keep the same colors but map them:
- `'henry-wu': '#2563eb'` (was researcher blue)
- `'occam': '#059669'` (was simplifier green)
- `'heist-o-tron': '#7c3aed'` (was architect purple)
- `'hickam': '#d97706'` (was breadth-keeper amber)
- `'kirk': '#00d4aa'` (was seed-closer teal)

**4. `packages/engine/src/evolution/lateral-thinking.ts`:**
Update PERSONAS array and PERSONA_PROMPTS keys. Map: `'simplifier'` -> `'occam'`, `'researcher'` -> `'henry-wu'`, `'architect'` -> `'heist-o-tron'`. Keep `'contrarian'` and `'hacker'` unchanged (they are evolution-specific, not interview perspectives). Update the prompt text for the renamed personas to match their character flavor (shorter than interview prompts — these are evolution context, not interview system prompts).

**5. `cauldron.config.ts`:**
Update perspectiveModels keys:
- `'henry-wu'` (was researcher)
- `'occam'` (was simplifier)
- `'heist-o-tron'` (was architect)
- `'hickam'` (was breadth-keeper)
- `'kirk'` (was seed-closer)

**6. `packages/engine/src/gateway/config.ts`:**
The `perspectiveModels` type is `Partial<Record<string, string>>` — no changes needed to the type itself, but verify it still works after config key rename. Only update if there are hardcoded perspective name references.

Run `pnpm typecheck` after all source changes to catch any missed references.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/cauldron && pnpm typecheck 2>&1 | tail -30</automated>
  </verify>
  <done>PerspectiveName type uses new names, all 5 character system prompts written, PERSPECTIVE_COLORS/config updated, typecheck passes with zero errors, grep for old names in source (non-test) files returns zero matches.</done>
</task>

<task type="auto">
  <name>Task 2: Update all test files and E2E references to use new persona names</name>
  <files>
    packages/engine/src/interview/__tests__/perspectives.test.ts
    packages/engine/src/interview/__tests__/fsm.test.ts
    packages/engine/src/interview/__tests__/scorer.test.ts
    packages/engine/src/interview/__tests__/contrarian.test.ts
    packages/engine/src/interview/__tests__/synthesizer.test.ts
    packages/engine/src/interview/__tests__/fsm-sendAnswer.integration.test.ts
    packages/engine/src/evolution/__tests__/lateral-thinking.test.ts
    packages/engine/src/evolution/__tests__/mutator.test.ts
    packages/web/src/trpc/routers/__tests__/interview-engine.test.ts
    packages/web/src/__tests__/components/interview/ChatBubble.test.tsx
    packages/web/e2e/interview.spec.ts
    packages/web/e2e/pipeline-live.spec.ts
    packages/web/e2e/helpers/live-infra.ts
    packages/test-harness/src/scripts/interview-turn.ts
    packages/test-harness/src/scripts/interview-turn.d.ts
    packages/shared/src/db/__tests__/interview.integration.test.ts
  </files>
  <action>
Apply the same name mapping across ALL test, E2E, and harness files:
- `'researcher'` -> `'henry-wu'`
- `'simplifier'` -> `'occam'`
- `'architect'` -> `'heist-o-tron'`
- `'breadth-keeper'` -> `'hickam'`
- `'seed-closer'` -> `'kirk'`

**Specific files and what to update:**

1. **`perspectives.test.ts`**: Update expectedKeys array, all string literals in selectActivePerspectives assertions (`toEqual`, `toContain`), perspective field in makeTurn helper.

2. **`fsm.test.ts`**: Update perspective strings in mock data objects and comments referencing perspective names (e.g., "seed-closer + architect" -> "kirk + heist-o-tron").

3. **`scorer.test.ts`**: Update `perspective: 'researcher'` in test fixtures.

4. **`contrarian.test.ts`**: Update `perspective: 'researcher'` in test fixtures.

5. **`synthesizer.test.ts`**: Update perspective strings in test fixtures and assertion strings (e.g., `'Turn 1 (researcher)'` -> `'Turn 1 (henry-wu)'`).

6. **`fsm-sendAnswer.integration.test.ts`**: Check for and update any perspective name references.

7. **`lateral-thinking.test.ts`**: Update `'simplifier'` -> `'occam'`, `'researcher'` -> `'henry-wu'` in all assertions, mock data, and step run names (e.g., `'lateral-thinking-simplifier'` -> `'lateral-thinking-occam'`). Keep `'contrarian'` and `'hacker'` unchanged.

8. **`mutator.test.ts`**: Update `persona: 'simplifier'` -> `persona: 'occam'`.

9. **`interview-engine.test.ts`**: Update all perspective strings in mock return values and test fixtures.

10. **`ChatBubble.test.tsx`**: Update perspective name strings if any are used in test props.

11. **`interview.spec.ts`**: Update `perspective: 'researcher'` -> `perspective: 'henry-wu'`.

12. **`pipeline-live.spec.ts`**: Update perspectiveModels keys and perspective title selectors (`[title="researcher"]` -> `[title="henry-wu"]`, etc.) and the perspectiveTitles array.

13. **`live-infra.ts`**: Update perspectiveModels keys to new names.

14. **`interview-turn.ts` + `.d.ts`**: Update comments and any string references to old perspective names.

15. **`interview.integration.test.ts`**: Update `perspective: 'researcher'` in test data.

After updating, run a codebase-wide grep to confirm ZERO remaining references to old names (excluding git history, node_modules, .claude/worktrees):
```bash
grep -r "researcher\|simplifier\|breadth-keeper\|seed-closer" packages/ cauldron.config.ts --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".claude/worktrees"
```
Note: `'architect'` may still appear in non-perspective contexts (e.g., CLAUDE.md, comments about software architecture). Only replace when it refers to the interview perspective persona.

Run the full test suite to confirm everything passes.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/cauldron && pnpm test 2>&1 | tail -30</automated>
  </verify>
  <done>All test files use new persona names. `grep -r "'\''researcher'\''\|'\''simplifier'\''\|'\''breadth-keeper'\''\|'\''seed-closer'\''" packages/ cauldron.config.ts --include="*.ts" --include="*.tsx"` returns zero matches (excluding worktrees). `pnpm test` passes. `pnpm typecheck` still passes.</done>
</task>

</tasks>

<verification>
1. `pnpm typecheck` — zero errors
2. `pnpm test` — all unit tests pass
3. Codebase grep for old perspective names returns zero matches in packages/ and cauldron.config.ts (excluding .claude/worktrees)
4. PERSPECTIVE_PROMPTS has 5 entries with character-flavored text (not generic role descriptions)
5. PerspectiveName type has exactly the 5 new names
</verification>

<success_criteria>
- PerspectiveName type: 'henry-wu' | 'occam' | 'heist-o-tron' | 'hickam' | 'kirk'
- Each persona has a character-specific system prompt reflecting their source material
- selectActivePerspectives returns new names in same activation patterns
- ChatBubble colors mapped to new names
- cauldron.config.ts perspectiveModels use new names
- lateral-thinking.ts PERSONAS updated (occam, henry-wu, heist-o-tron replace simplifier, researcher, architect)
- Zero references to old names remain in source or test files
- pnpm typecheck passes
- pnpm test passes
</success_criteria>

<output>
After completion, create `.planning/quick/260402-oou-rename-interview-perspectives-to-charact/260402-oou-SUMMARY.md`
</output>
