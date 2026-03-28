# Quick Task 260328-g8l: Hide archived projects by default with toggle

**Status:** Complete
**Commit:** 294c5c1

## Changes

1. **Router** (`projects.ts`): Added `includeArchived` optional boolean input to `list` procedure. When false (default), filters out projects whose name starts with `[archived]` using SQL `NOT LIKE`.

2. **UI** (`ProjectListClient.tsx`): Added `useState` toggle with "Show archived" / "Hide archived" button above the project grid. Toggles `includeArchived` query param.

3. **Server prefetch** (`page.tsx`): Updated prefetch to pass `{ includeArchived: false }` explicitly.

4. **Test** (`projects.wiring.test.ts`): Updated archive test to verify both hidden (default) and shown (`includeArchived: true`) states.

## Tests

- 27/27 web unit tests passing
- 56/56 wiring tests passing
