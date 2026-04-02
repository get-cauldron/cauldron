# Phase 25: Process Reliability & Transactions - Research

**Researched:** 2026-04-02
**Domain:** Node.js process management, Drizzle transactions, React error boundaries
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None. All implementation choices are at Claude's discretion.

### Claude's Discretion
All implementation choices. Key guidelines from CONTEXT.md:

- **CONC-03 (timeout enforcement):** TimeoutSupervisor needs a `setKillTarget(proc: ChildProcess)` method. On hard timeout, send SIGTERM, wait 5s, then SIGKILL. Agent-runner.ts must wire the spawned process to the supervisor.
- **CONC-04 (holdout rollback):** If holdout generation fails after crystallization, either delete the seed or mark it as `draft` (un-crystallize). Don't return success with a seedId if holdout generation failed.
- **SEC-03 (error boundary):** Use `react-error-boundary` package. Wrap DAGCanvas in an ErrorBoundary with a fallback UI.

### Deferred Ideas (OUT OF SCOPE)
None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CONC-03 | Timeout supervisor holds ChildProcess reference and enforces SIGTERM → 5s grace → SIGKILL on hard timeout | TimeoutSupervisor.ts read — currently fires callbacks only, no kill target. AgentRunner uses `exec()` not `spawn()`, so ChildProcess extraction requires approach change. See Architecture Patterns. |
| CONC-04 | Holdout generation failure after crystallization rolls back seed or marks it incomplete — no silent success masquerading as full success | interview.ts read — crystallizeSeed + holdout generation are in a try/catch with separate catch blocks. The inner holdout catch swallows the error and returns seedId anyway. Fix: wrap in Drizzle transaction OR delete seed in compensation block. |
| SEC-03 | DAGCanvas wrapped in React error boundary with fallback UI — layout failures don't crash the execution page | execution/page.tsx read — DAGCanvas is rendered directly with no boundary. react-error-boundary 6.1.1 is the correct package (not in web package.json yet). |
</phase_requirements>

---

## Summary

Phase 25 contains three independent reliability fixes that span the engine and web packages. Each fix is narrow in scope but addresses a documented production defect.

**CONC-03** fixes a hung-process bug: `TimeoutSupervisor` fires `onHardTimeout` callbacks today but holds no process reference, so nothing is actually killed. The fix requires `TimeoutSupervisor` to accept a `ChildProcess` reference and perform a SIGTERM → 5s → SIGKILL escalation. The critical complication: `AgentRunner` currently uses `exec()` (which returns a `ChildProcess` that is accessible from the `exec` callback signature), not `spawn()`. The kill target must be extracted from the `exec()` return value and passed to the supervisor.

**CONC-04** fixes a silent-success bug: in `approveSummary`, crystallization succeeds and `seedId` is returned even when holdout generation throws. The inner `try/catch` around holdout generation is intentionally swallowing the error (see the comment in interview.ts). The fix removes that silent swallow and either (a) wraps both operations in a Drizzle transaction so crystallization rolls back on holdout failure, or (b) uses a compensation block to delete the seed row and re-throw. The Drizzle transaction approach is cleaner but requires `crystallizeSeed()` to accept a transaction client (`tx`) instead of the global `db`. The compensation approach works without changing the function signature.

**SEC-03** wraps `<DAGCanvas />` in a React error boundary using `react-error-boundary` 6.1.1. The package is not currently installed in `packages/web`. The fallback UI must show enough context for the user to understand what failed without taking down the execution page or the EvolutionTimeline above it.

**Primary recommendation:** Three independent tasks, each with a clear unit test. No inter-dependencies between fixes — they can be planned as parallel beads.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js `child_process` built-in | Node.js built-in | SIGTERM/SIGKILL two-phase process termination | No dependency needed. `.kill('SIGTERM')` + `.kill('SIGKILL')` after `setTimeout`. Already used in `merge-queue.ts`. |
| Drizzle ORM | `^0.45` (already installed) | Transaction wrapping for crystallize + holdout | `db.transaction(async (tx) => {...})` syntax. Rollback is automatic on throw. |
| `react-error-boundary` | `6.1.1` (new addition) | React error boundary without class boilerplate | React 19 still requires class components for `getDerivedStateFromError`. This package wraps it cleanly with `ErrorBoundary`, `fallbackRender`, `onError` props, and `useErrorBoundary` hook. Author is Brian Vaughn (former React core team). |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@types/node` | Already in engine | `ChildProcess` type for `setKillTarget` parameter | Required for typing the kill target in TypeScript |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Two-phase `.kill()` | `AbortSignal.timeout()` single-phase | AbortSignal requires spawning with `signal:` option. Current `exec()`-based code does not use it, and it doesn't support two-phase escalation. Stick with two-phase `.kill()`. |
| Drizzle transaction | Compensation delete | Transaction is cleaner but requires changing `crystallizeSeed`'s function signature to accept `tx` OR `db`. Compensation delete is simpler but leaves a brief window where seed exists without holdout. Either is acceptable; transaction is preferred. |
| `react-error-boundary` | Hand-written class component | Acceptable for a single boundary but verbose. `react-error-boundary` adds `resetKeys` prop and `useErrorBoundary` hook. The dependency cost is trivial. |

**Installation:**
```bash
pnpm -F @get-cauldron/web add react-error-boundary
```

**Version verification:** `npm view react-error-boundary version` returns `6.1.1` (verified 2026-04-02).

---

## Architecture Patterns

### CONC-03: Timeout Supervisor Kill Wiring

#### Current State (what we read)
`TimeoutSupervisor` tracks three timers (idle, soft, hard) and fires callbacks. It holds no process reference. `AgentRunner.runWithTddLoop()` uses `execPromise()` (wrapping `node:child_process exec`) and never creates or passes a `TimeoutSupervisor`. These two classes are not wired to each other at all.

#### The Connection Gap
`AgentRunner` does not instantiate a `TimeoutSupervisor`. There is no wiring today. The fix requires:
1. `TimeoutSupervisor` gains a `setKillTarget(proc: ChildProcess)` method
2. `TimeoutSupervisor.onHardTimeout` callback performs the SIGTERM → SIGKILL sequence
3. `AgentRunner` creates a `TimeoutSupervisor`, starts it, and passes the `ChildProcess` from `exec()` to `setKillTarget()`

#### How `exec()` returns a ChildProcess
`node:child_process exec(cmd, opts, callback)` returns a `ChildProcess` synchronously (the callback fires asynchronously). The existing `execPromise()` wrapper ignores the return value. To extract it:

```typescript
// Source: Node.js child_process docs
import { exec, type ChildProcess } from 'node:child_process';

function execPromiseWithRef(
  cmd: string,
  options: { cwd: string },
  onProcess?: (proc: ChildProcess) => void
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = exec(cmd, options, (err, stdout, stderr) => {
      if (err) {
        reject(Object.assign(err, { stdout: stdout ?? '', stderr: stderr ?? '' }));
      } else {
        resolve({ stdout: stdout ?? '', stderr: stderr ?? '' });
      }
    });
    onProcess?.(proc);
  });
}
```

#### TimeoutSupervisor Kill Target Pattern
```typescript
// Source: Node.js child_process docs + FEATURES.md
setKillTarget(proc: ChildProcess): void {
  this.killTarget = proc;
  // Wire hard timeout to kill sequence
  this.callbacks.onHardTimeout = (elapsed) => {
    this.killTarget?.kill('SIGTERM');
    this.killGraceTimer = setTimeout(() => {
      this.killTarget?.kill('SIGKILL');
    }, 5_000);
    this.originalOnHardTimeout?.(elapsed);
  };
}
```

The cleaner approach: keep callbacks immutable and perform the kill sequence directly in the `hardTimer` setTimeout in `start()` when a kill target is set. This avoids mutating callbacks after construction.

**Recommended approach:** Add a `killTarget: ChildProcess | null` private field. In the `hardTimer` setTimeout body:
```typescript
this.hardTimer = setTimeout(() => {
  this.status = 'hard_timeout';
  if (this.killTarget) {
    this.killTarget.kill('SIGTERM');
    this.killGraceTimer = setTimeout(() => {
      if (this.killTarget) {
        this.killTarget.kill('SIGKILL');
      }
    }, 5_000);
  }
  this.callbacks.onHardTimeout?.(this.getElapsedMinutes());
}, hardMs);
```

Also add a `killGraceTimer` field and clear it in `stop()` to prevent SIGKILL from firing after the process has already exited cleanly.

#### Agent Runner Wiring
`AgentRunner.runWithTddLoop()` currently calls `execPromise()` for test/typecheck commands. The timeout supervision should wrap the entire bead execution loop, not individual subprocess calls. The `TimeoutSupervisor` should be started at the top of `runWithTddLoop()` and each `exec()` call should register its process reference with `setKillTarget()`.

The critical design choice: the supervisor should apply to the **entire bead**, not per-subprocess call. Only one subprocess runs at a time (sequential loop), so `setKillTarget()` can be called before each `exec()` to replace the current target.

### CONC-04: Holdout Transaction Boundary

#### Current State (what we read)
In `approveSummary` (interview router, lines 300-332):

```typescript
const seed = await crystallizeSeed(ctx.db, interview.id, projectId, summary, ambiguityScore);

// Separate try/catch:
try {
  const scenarios = await generateHoldoutScenarios({...});
  await createVault(ctx.db, { seedId: seed.id, scenarios });
} catch (holdoutErr) {
  console.error('[approveSummary] Holdout generation failed:', holdoutErr);
  // ← ERROR SWALLOWED. Seed stays crystallized. seedId returned.
}

return { seedId: seed.id, version: seed.version };
```

CONC-04 requires that holdout failure prevents silent success. Two implementation options:

**Option A: Drizzle Transaction (preferred)**
```typescript
// Source: Drizzle ORM transaction docs
const { seedId, version } = await ctx.db.transaction(async (tx) => {
  const seed = await crystallizeSeed(tx, interview.id, projectId, summary, ambiguityScore);
  const scenarios = await generateHoldoutScenarios({ gateway, seed, projectId });
  await createVault(tx, { seedId: seed.id, scenarios });
  return { seedId: seed.id, version: seed.version };
});
```

This requires `crystallizeSeed` and `createVault` to accept `tx` (a Drizzle transaction client). Both currently accept `db: DbClient`. Drizzle's transaction callback receives a `tx` with the same interface as `db` — the type `DbClient` should be compatible without changes if `DbClient` is typed broadly enough.

Check `DbClient` type in shared:
```typescript
// Need to verify: does DbClient accept both db and tx from drizzle transaction?
```

**Option B: Compensation Delete (simpler)**
```typescript
let seed: Seed;
try {
  seed = await crystallizeSeed(ctx.db, interview.id, projectId, summary, ambiguityScore);
} catch (e) { ... }

try {
  const scenarios = await generateHoldoutScenarios({...});
  await createVault(ctx.db, { seedId: seed.id, scenarios });
} catch (holdoutErr) {
  // Compensate: delete the seed that was just crystallized
  await ctx.db.delete(seeds).where(eq(seeds.id, seed.id));
  // Also revert interview phase back to 'approved'
  await ctx.db.update(interviews).set({ phase: 'approved', status: 'active', completedAt: null })
    .where(eq(interviews.id, interview.id));
  throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Holdout generation failed' });
}
```

Option B is simpler but has a brief window where the seed exists without holdout. Compensation can also fail. Option A (Drizzle transaction) is the cleaner approach if `DbClient` types are compatible.

**Recommendation: Check `DbClient` type. If `tx` from `db.transaction()` is assignable to `DbClient`, use Option A. If type incompatibility requires broader changes, use Option B.**

### SEC-03: React Error Boundary

#### Current State (what we read)
In `execution/page.tsx`, `<DAGCanvas>` is rendered directly with no boundary:
```tsx
<div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
  <DAGCanvas
    projectId={projectId}
    onNodeClick={(beadId) => setSelectedBeadId(beadId)}
  />
  {/* overlay buttons */}
</div>
```

The `DAGCanvas` component itself wraps `DAGCanvasInner` in a `<ReactFlowProvider>`. Errors from `@xyflow/react` rendering, `getLayoutedElements()` (dagre layout), or `useBeadStatus()` SSE parsing can propagate and crash the entire execution page.

#### react-error-boundary 6.1.1 API
```tsx
// Source: react-error-boundary GitHub (bvaughn/react-error-boundary)
import { ErrorBoundary } from 'react-error-boundary';

<ErrorBoundary
  fallbackRender={({ error, resetErrorBoundary }) => (
    <div role="alert" style={{ /* ... */ }}>
      <p>DAG visualization failed: {error.message}</p>
      <button onClick={resetErrorBoundary}>Retry</button>
    </div>
  )}
  onError={(error, info) => {
    console.error('[DAGCanvas] Render error:', error, info);
  }}
>
  <DAGCanvas projectId={projectId} onNodeClick={...} />
</ErrorBoundary>
```

**Placement:** Wrap `<DAGCanvas>` inside the `execution/page.tsx` div that contains it (not inside `DAGCanvas.tsx` itself). This keeps the EvolutionTimeline above it, the BeadDetailSheet, and the EscalationDialog all functional when DAGCanvas crashes.

**Fallback UI requirements per SEC-03:** Show an error message without crashing the execution page. The fallback should:
- Display the error message
- Offer a retry button (`resetErrorBoundary`)
- Not obscure the EvolutionTimeline above

### Recommended Project Structure (changes only)

```
packages/engine/src/execution/
├── timeout-supervisor.ts         # Add setKillTarget(), killGraceTimer, kill logic
└── __tests__/
    └── timeout-supervisor.test.ts  # Add tests for kill target wiring

packages/web/src/
├── app/projects/[id]/execution/
│   └── page.tsx                  # Wrap <DAGCanvas> in <ErrorBoundary>
└── __tests__/pages/
    └── execution-page.test.tsx   # Add test: error boundary fallback renders on throw
```

The `approveSummary` handler change is in:
```
packages/web/src/trpc/routers/interview.ts   # Remove silent holdout catch, use tx or compensation
packages/engine/src/interview/crystallizer.ts # May need tx parameter (Option A only)
packages/engine/src/holdout/vault.ts          # May need tx parameter (Option A only)
```

### Anti-Patterns to Avoid

- **Wrapping the entire `ExecutionPage` in an error boundary:** This would also catch errors from EvolutionTimeline and EscalationDialog. Boundary must be granular around `DAGCanvas` only.
- **Catching SIGTERM in agent code:** Agent processes should not be catching SIGTERM unless they need graceful shutdown. The SIGKILL backstop ensures termination regardless.
- **Using `proc.killed` to gate SIGKILL:** `proc.killed` is only set after `.kill()` is called, not after the process actually exits. Use the `exit` event to clear the kill target and cancel the grace timer.
- **Swapping the entire `crystallizeSeed` + interview router to use transactions everywhere:** Only the `approveSummary` mutation needs the transaction boundary. Other callers of `crystallizeSeed` (evolution flow) do not generate holdouts and should remain unchanged.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| React error boundary | Custom `getDerivedStateFromError` class component | `react-error-boundary` 6.1.1 | Class component boilerplate, no `useErrorBoundary` hook, no `resetKeys` prop. react-error-boundary is the de facto standard (bvaughn, React 19 compatible). |
| Two-phase kill logic | Custom kill orchestration library | Node.js built-in `child_process` `.kill()` | SIGTERM + setTimeout + SIGKILL is 10 lines of native Node.js. No dependency needed. |
| Manual transaction rollback | Hand-crafted compensation logic | Drizzle `db.transaction()` | Drizzle transaction auto-rolls back on throw. Compensation logic has edge cases (compensation itself can fail). |

**Key insight:** All three fixes use either built-in Node.js/React mechanisms or a single tiny library (react-error-boundary). No new infrastructure.

---

## Common Pitfalls

### Pitfall 1: SIGKILL fires after process already exited cleanly
**What goes wrong:** Process exits before 5s grace period. SIGKILL fires on a dead PID (harmless on Linux/macOS but messy). On some platforms, PID could be reused by a new process.
**Why it happens:** Grace timer is not cancelled on process exit.
**How to avoid:** Subscribe to `child.on('exit', ...)`. Clear the grace timer and null out `this.killTarget` on exit.
**Warning signs:** SIGKILL firing for a process that already completed normally.

### Pitfall 2: `crystallizeSeed` DbClient type incompatibility with Drizzle transaction
**What goes wrong:** `db.transaction(async (tx) => { crystallizeSeed(tx, ...) })` fails type-check because `tx` is not assignable to `DbClient`.
**Why it happens:** `DbClient` in `@get-cauldron/shared` may be typed as the postgres driver's `Database` type, not the broader Drizzle client union that includes transaction clients.
**How to avoid:** Check the `DbClient` type definition in `packages/shared/src/db/client.ts` before choosing Option A vs Option B. If `tx` from `db.transaction()` is assignable, use Option A. Otherwise use Option B (compensation delete).
**Warning signs:** TypeScript error like "Argument of type 'PgTransaction<...>' is not assignable to parameter of type 'DbClient'".

### Pitfall 3: Error boundary catches errors from components outside DAGCanvas
**What goes wrong:** Wrapping too broadly catches errors from `EvolutionTimeline`, `BeadDetailSheet`, or `EscalationDialog`. The entire execution layout goes down.
**Why it happens:** Over-broad boundary placement (wrapping the outer container div instead of just DAGCanvas).
**How to avoid:** Wrap `<DAGCanvas>` only, leaving siblings (EvolutionTimeline, BeadDetailSheet) outside the boundary.
**Warning signs:** EvolutionTimeline disappears when DAGCanvas throws in tests.

### Pitfall 4: interview.ts `approveSummary` rolls back interview phase transition
**What goes wrong:** When using Option A (Drizzle transaction), the transaction wraps both crystallizeSeed (which updates `interviews.phase` to 'crystallized') and holdout generation. If holdout fails, the interview phase rolls back to 'approved', leaving the user able to retry. This is actually the desired behavior but must be accounted for in the test: verify the interview is back in 'approved' phase on failure.
**Why it happens:** `crystallizeSeed()` does an `UPDATE interviews SET phase = 'crystallized'` inside the transaction.
**How to avoid:** This is correct behavior. Document it in tests. If using Option B (compensation), explicitly revert interview phase in the compensation block.

### Pitfall 5: `TimeoutSupervisor` not instantiated anywhere in AgentRunner
**What goes wrong:** Tests and types pass but the supervisor is never actually called in production because `AgentRunner` never creates one.
**Why it happens:** The two classes are currently completely disconnected.
**How to avoid:** Wire `TimeoutSupervisor` into `AgentRunner.runWithTddLoop()`. The supervisor must be created, started, and have its kill target set before each subprocess execution. Also ensure `supervisor.stop()` is called after the loop exits (success or failure).

---

## Code Examples

### CONC-03: setKillTarget implementation

```typescript
// Source: Node.js child_process docs https://nodejs.org/api/child_process.html
import type { ChildProcess } from 'node:child_process';

// Add to TimeoutSupervisor class:
private killTarget: ChildProcess | null = null;
private killGraceTimer: ReturnType<typeof setTimeout> | null = null;

setKillTarget(proc: ChildProcess): void {
  this.killTarget = proc;
  // Clear grace timer if target changes
  if (this.killGraceTimer !== null) {
    clearTimeout(this.killGraceTimer);
    this.killGraceTimer = null;
  }
  // Ensure process exit clears the reference to prevent stale SIGKILL
  proc.once('exit', () => {
    this.killTarget = null;
    if (this.killGraceTimer !== null) {
      clearTimeout(this.killGraceTimer);
      this.killGraceTimer = null;
    }
  });
}
```

The `hardTimer` body change:
```typescript
this.hardTimer = setTimeout(() => {
  this.status = 'hard_timeout';
  this.callbacks.onHardTimeout?.(this.getElapsedMinutes());
  // Enforce kill: SIGTERM first, SIGKILL after 5s grace
  if (this.killTarget) {
    this.killTarget.kill('SIGTERM');
    this.killGraceTimer = setTimeout(() => {
      if (this.killTarget) {
        this.killTarget.kill('SIGKILL');
      }
    }, 5_000);
  }
}, hardMs);
```

`stop()` additions:
```typescript
stop(): void {
  // ... existing timer clears ...
  if (this.killGraceTimer !== null) clearTimeout(this.killGraceTimer);
  this.killGraceTimer = null;
  this.killTarget = null;
  this.status = 'stopped';
}
```

### CONC-03: execPromise with kill target wiring in AgentRunner

```typescript
// Source: Node.js child_process docs
function execPromiseWithRef(
  cmd: string,
  options: { cwd: string },
  onProcess?: (proc: ChildProcess) => void
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = exec(cmd, options, (err, stdout, stderr) => {
      if (err) {
        reject(Object.assign(err, { stdout: stdout ?? '', stderr: stderr ?? '' }));
      } else {
        resolve({ stdout: stdout ?? '', stderr: stderr ?? '' });
      }
    });
    onProcess?.(child);
  });
}
```

In `runVerification`:
```typescript
for (const cmd of commands) {
  try {
    await execPromiseWithRef(cmd, { cwd: worktreePath }, (proc) => {
      supervisor?.setKillTarget(proc);
    });
  } catch (err) { /* ... existing error handling ... */ }
}
```

### CONC-04: Transaction boundary (Option A)

```typescript
// Source: Drizzle ORM transaction docs https://orm.drizzle.team/docs/transactions
const { seedId, version } = await ctx.db.transaction(async (tx) => {
  const seed = await crystallizeSeed(tx, interview.id, projectId, summary, ambiguityScore);
  const { gateway } = await ctx.getEngineDeps();
  const scenarios = await generateHoldoutScenarios({ gateway, seed, projectId });
  await createVault(tx, { seedId: seed.id, scenarios });
  return { seedId: seed.id, version: seed.version };
});
return { seedId, version };
```

### CONC-04: Compensation delete (Option B — if DbClient type blocks Option A)

```typescript
const seed = await crystallizeSeed(ctx.db, interview.id, projectId, summary, ambiguityScore);
try {
  const { gateway } = await ctx.getEngineDeps();
  const scenarios = await generateHoldoutScenarios({ gateway, seed, projectId });
  await createVault(ctx.db, { seedId: seed.id, scenarios });
} catch (holdoutErr) {
  // Compensation: revert crystallization
  await ctx.db.delete(seeds).where(eq(seeds.id, seed.id));
  await ctx.db.update(interviews)
    .set({ status: 'active', phase: 'approved', completedAt: null })
    .where(eq(interviews.id, interview.id));
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Holdout generation failed — crystallization rolled back',
  });
}
```

### SEC-03: Error boundary in execution page

```tsx
// Source: react-error-boundary GitHub https://github.com/bvaughn/react-error-boundary
import { ErrorBoundary } from 'react-error-boundary';

// In execution/page.tsx, replace:
<div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
  <DAGCanvas ... />
  {/* overlay */}
</div>

// With:
<div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
  <ErrorBoundary
    fallbackRender={({ error, resetErrorBoundary }) => (
      <div
        role="alert"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: 12,
          color: '#6b8399',
        }}
      >
        <span style={{ fontSize: 14 }}>DAG visualization failed</span>
        <span style={{ fontSize: 12, color: '#e5484d' }}>{error.message}</span>
        <button
          onClick={resetErrorBoundary}
          style={{
            padding: '6px 16px',
            background: '#1a2330',
            border: '1px solid #1a2330',
            borderRadius: 4,
            color: '#c8d6e5',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          Retry
        </button>
      </div>
    )}
    onError={(error, info) => {
      console.error('[DAGCanvas] render error:', error, info.componentStack);
    }}
  >
    <DAGCanvas
      projectId={projectId}
      onNodeClick={(beadId) => setSelectedBeadId(beadId)}
    />
  </ErrorBoundary>
  {/* overlay buttons */}
</div>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `getDerivedStateFromError` class component for error boundaries | `react-error-boundary` function API | React 16+ (library); v6.1.1 Feb 2026 | Clean function components, `useErrorBoundary` hook, `resetKeys` prop |
| `AbortSignal.timeout()` for process cancellation | Two-phase SIGTERM → SIGKILL | Always valid | AbortSignal requires `signal:` on spawn. Two-phase works with `exec()` return value. |

**Deprecated/outdated:**
- Ignoring the return value of `exec()` when timeout supervision is needed: the return value is a `ChildProcess` and must be captured.

---

## Open Questions

1. **`DbClient` type compatibility with Drizzle transaction client**
   - What we know: `crystallizeSeed(db: DbClient, ...)` and `createVault(db: DbClient, ...)` take `db: DbClient`. Drizzle's `db.transaction(async (tx) => {...})` passes `tx` which has a slightly different type than the outer `db`.
   - What's unclear: Whether `DbClient` is typed as the outer Drizzle client type or a broader union that includes transaction clients.
   - Recommendation: Read `packages/shared/src/db/client.ts` (or wherever `DbClient` is exported) at the start of Task 2. If `tx` is assignable, use Option A. If not, use Option B. Do not guess.

2. **TimeoutSupervisor wiring location — AgentRunner constructor vs runWithTddLoop**
   - What we know: `AgentRunner` has no supervisor today. The supervisor must be started before the TDD loop and stopped after.
   - What's unclear: Whether the supervisor config should be a constructor parameter to `AgentRunner` or created inside `runWithTddLoop` from `TddLoopOptions`.
   - Recommendation: Pass `TimeoutSupervisor` as an optional constructor parameter to `AgentRunner` (with a default no-op). This keeps `runWithTddLoop` signature unchanged and allows callers (Inngest handlers) to inject a configured supervisor.

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies beyond existing project stack)

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4 |
| Config file | `packages/engine/vitest.config.ts` / `packages/web/vitest.config.ts` |
| Quick run command (engine) | `pnpm -F @get-cauldron/engine test -- --grep "TimeoutSupervisor"` |
| Quick run command (web) | `pnpm -F @get-cauldron/web test -- --grep "ExecutionPage\|DAGCanvas"` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONC-03 | `setKillTarget()` stores ChildProcess reference | unit | `pnpm -F @get-cauldron/engine test -- --grep "setKillTarget"` | ❌ Wave 0 — add to existing timeout-supervisor.test.ts |
| CONC-03 | Hard timeout sends SIGTERM then SIGKILL after 5s | unit | `pnpm -F @get-cauldron/engine test -- --grep "SIGTERM\|SIGKILL"` | ❌ Wave 0 |
| CONC-03 | Grace timer cleared on process exit | unit | `pnpm -F @get-cauldron/engine test -- --grep "grace timer\|exit"` | ❌ Wave 0 |
| CONC-03 | stop() clears killGraceTimer | unit | `pnpm -F @get-cauldron/engine test -- --grep "stop.*grace"` | ❌ Wave 0 |
| CONC-04 | Holdout failure throws TRPCError (no silent swallow) | unit | `pnpm -F @get-cauldron/web test -- --grep "holdout.*fail\|crystallize.*rollback"` | ❌ Wave 0 |
| CONC-04 | Seed does not exist in DB after holdout failure | integration | `pnpm test:integration` | ❌ Wave 0 |
| SEC-03 | ErrorBoundary fallback renders when DAGCanvas throws | unit | `pnpm -F @get-cauldron/web test -- --grep "error boundary\|fallback"` | ❌ Wave 0 (add to execution-page.test.tsx) |
| SEC-03 | Rest of ExecutionPage renders when DAGCanvas crashes | unit | `pnpm -F @get-cauldron/web test -- --grep "EvolutionTimeline.*boundary"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm -F @get-cauldron/{engine,web} test`
- **Per wave merge:** `pnpm test`
- **Phase gate:** `pnpm test && pnpm typecheck && pnpm build` green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/engine/src/execution/__tests__/timeout-supervisor.test.ts` — add `setKillTarget` tests (file exists, needs new test cases)
- [ ] `packages/web/src/__tests__/pages/execution-page.test.tsx` — add error boundary fallback tests (file exists, needs new test cases)
- [ ] Integration test for CONC-04 holdout rollback — new file needed in `packages/web/src/__tests__/` or `packages/engine/src/interview/__tests__/`

---

## Sources

### Primary (HIGH confidence)
- Node.js child_process docs — `.kill()`, SIGTERM, SIGKILL, exec() return value (verified 2026-04-02)
- react-error-boundary GitHub (bvaughn/react-error-boundary) — v6.1.1 API, February 2026
- Drizzle ORM transaction docs — `db.transaction(async (tx) => {...})` rollback behavior
- Direct code read: `packages/engine/src/execution/timeout-supervisor.ts` — confirmed no kill target
- Direct code read: `packages/engine/src/execution/agent-runner.ts` — confirmed uses `exec()`, no supervisor wiring
- Direct code read: `packages/web/src/trpc/routers/interview.ts` — confirmed silent holdout catch
- Direct code read: `packages/engine/src/interview/crystallizer.ts` — confirmed no transaction
- Direct code read: `packages/web/src/app/projects/[id]/execution/page.tsx` — confirmed no error boundary
- Direct code read: `packages/web/src/components/dag/DAGCanvas.tsx` — confirmed ReactFlowProvider + DAGCanvasInner pattern

### Secondary (MEDIUM confidence)
- `.planning/research/FEATURES.md` — timeout enforcement and error boundary research from v1.2 roadmap phase
- `.planning/research/STACK.md` — react-error-boundary 6.1.1 recommendation, SIGTERM/SIGKILL pattern

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- CONC-03 (timeout kill wiring): HIGH — code read confirms supervisor has no kill target; Node.js APIs are well-understood
- CONC-04 (holdout rollback): HIGH — code read confirms exact silent catch location; Drizzle transaction vs compensation decision pending DbClient type check
- SEC-03 (error boundary): HIGH — code read confirms no existing boundary; react-error-boundary version confirmed on npm

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable APIs)
