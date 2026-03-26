# Phase 6: Parallel Execution Engine - Research

**Researched:** 2026-03-26
**Domain:** Multi-agent parallel code execution, git worktree isolation, code knowledge graph, self-healing loops, merge queue
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Code Intelligence**
- D-01: Hybrid approach — use codebase-memory-mcp as the knowledge graph engine, wrapped with a thin TypeScript adapter in `packages/engine` that formats query results for agent context assembly. No custom graph build needed.
- D-02: Internal TypeScript API (not MCP passthrough). The adapter is a library module called by the execution engine during context assembly. Agents never interact with MCP directly.
- D-03: Index both the target project's code AND Cauldron's own engine code. Enables the dogfood inflection point.
- D-04: Initial full index happens during the brownfield interview (Phase 3), not at execution start. Adapter must be usable by both Phase 3 and Phase 6.
- D-05: Incremental re-indexing triggers on bead completion, before dispatching newly-ready beads. Downstream beads always see updated code from upstream beads.
- D-06: Knowledge graph scope per agent: main branch state + current bead's worktree changes only. No cross-worktree visibility.

**Agent Context Assembly**
- D-07: Two-step relevant code selection: (1) deterministic keyword extraction from bead spec → knowledge graph for symbols + 1-hop dependencies, then (2) lightweight LLM pass to prune/add non-obvious dependencies.
- D-08: Dependency outputs include actual code artifacts (files/diffs) produced by completed upstream beads, pulled from the merged main branch or knowledge graph.
- D-09: Seed excerpt scoped per bead: goal statement + all constraints + only the acceptance criteria referenced by the bead's `coversCriteria` field.
- D-10: Hard token budget with priority-based trimming: cap at 200k minus implementation room. Trim order: distant dependencies first, then code examples, then full files reduced to signatures.
- D-11: Agents receive a dedicated system prompt defining role, constraints, output format expectations, and error handling behavior. Assembled context goes in user/assistant messages.
- D-12: Process-level capability scoping: agents can only write files within their worktree. No git push, no deletion outside scope, no network calls except LLM API.

**Git Worktree & Merge Queue**
- D-13: Branch naming: `cauldron/bead-{short-uuid}`. Flat namespace under `cauldron/`. One branch per bead. Cleaned up after merge.
- D-14: Merge conflict resolution: LLM agent attempts resolution first using both sides' bead specs as context. If LLM can't resolve confidently, escalate to human via event/notification.
- D-15: Merge queue processes in DAG topological order, not FIFO. Upstream beads merge before downstream ones regardless of completion time.
- D-16: Post-merge test re-run: after successful merge, the bead's test suite runs against updated main. Test failure reverts merge and flags.
- D-17: Worktree location: `.cauldron/worktrees/{bead-id}/` in the target project root. Gitignored.
- D-18: Immediate cleanup after merge: delete worktree directory and prune branch after successful merge + post-merge test pass. Failed merges retain worktree for debugging.

**Test Generation Strategy**
- D-19: TDD approach — agents write tests from the bead spec first, then implement until tests pass.
- D-20: Anti-mocking heuristic: real dependencies by default. Only external services (third-party APIs, payment providers) get mocked.
- D-21: Test runner selection: use the target project's existing test infrastructure. If none, default to Vitest (unit/integration) + Playwright (E2E).
- D-22: Self-healing error loop: agent reads test failure output, modifies code, reruns tests. Max 5 iterations. If still failing, mark bead as failed.
- D-23: E2E tests generated only for beads that touch user-facing surfaces (UI, API endpoints, CLI commands). Internal/infrastructure beads get unit + integration only.
- D-24: Graduated timeout supervision: (1) idle detection — no file writes for N minutes triggers warning; (2) soft timeout at 80% of time limit — tell agent to wrap up; (3) hard timeout — kill bead and mark failed.

### Claude's Discretion
- codebase-memory-mcp adapter API design and query patterns
- System prompt content and structure for implementation agents
- Token budget allocation between context sections (seed excerpt vs code vs deps)
- Priority trimming algorithm details
- Worktree creation and git branch management implementation
- Merge queue data structure and processing loop
- LLM conflict resolution prompt design
- Test detection heuristics for existing project runners
- Idle detection thresholds and soft timeout percentages
- Event naming conventions for bead lifecycle (extending Phase 5 patterns)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EXEC-01 | Each bead executes in a fresh context window with only relevant context pre-loaded | Context assembly adapter (D-07 through D-10) + codebase-memory-mcp CLI invocation patterns |
| EXEC-02 | Git worktree isolation: each active bead gets its own worktree branch | Git CLI via child_process; branch naming D-13; worktree location D-17 |
| EXEC-03 | Multiple agents execute independent beads concurrently | Inngest concurrency config already in handleBeadDispatchRequested; `beadDispatchHandler` is the extension point |
| EXEC-04 | Agent context assembly: seed excerpt + bead spec + relevant code (via knowledge graph) + dependency outputs | codebase-memory-mcp `search_graph` + `trace_call_path` + `get_code_snippet` tools via child_process spawn |
| EXEC-05 | Self-healing error loop: agent reads error output, iterates on code, reruns verification | Inngest `step.run` loop with max 5 iterations inside `beadDispatchHandler` |
| EXEC-06 | Sequential merge queue resolves completed bead worktrees back to project main | DAG topological order already available from Phase 5 scheduler; implement as Inngest step after bead execution |
| EXEC-07 | Merge conflict detection with escalation (LLM-assisted resolution or human escalation) | `git merge --no-commit` + LLM resolution via gateway `context_resolution` stage |
| EXEC-08 | Agent capability scoping: least-privilege access, no destructive operations without approval | Process-level isolation: worktree path restriction enforced by cwd + OS filesystem permissions |
| EXEC-09 | Bead timeout supervision (soft warning, idle detection, hard timeout) | Inngest step timeout + AbortController for agent process; file-write mtime polling for idle detection |
| TEST-01 | Unit tests generated with thorough coverage for every implemented feature | TDD via agent system prompt; test files committed to worktree before implementation |
| TEST-02 | Integration tests generated with thorough coverage — equal depth to unit tests | Same TDD flow; integration tests in worktree alongside unit tests |
| TEST-03 | E2E tests generated only for user-facing surface beads (D-23) | Bead spec surface detection heuristic (UI/API/CLI keyword matching) |
| TEST-04 | Anti-mocking heuristics: prefer real integrations over mocks where feasible | Agent system prompt directive; D-20 — only external services mocked |
| TEST-05 | Test generation is part of bead execution (not a separate post-execution step) | TDD loop within `beadDispatchHandler`; tests written before implementation |
| TEST-06 | All three test levels must pass before a bead is marked complete | Verification gate in self-healing loop before `completeBead()` |
| CODE-01 | Knowledge graph indexing of project codebase | `codebase-memory-mcp cli index_repository` via child_process; project parameter required |
| CODE-02 | Sub-millisecond graph queries for agent context loading | Confirmed: codebase-memory-mcp delivers sub-ms queries from in-memory SQLite |
| CODE-03 | Incremental re-indexing triggered as agents modify code | `codebase-memory-mcp cli detect_changes` then `index_repository` (partial update) |
| CODE-04 | Brownfield codebase mapping: one-time full index when onboarding existing project | `index_repository` call in Phase 3 brownfield interview path; adapter usable by both phases |
</phase_requirements>

---

## Summary

Phase 6 completes the end-to-end execution path. Three complex subsystems must be implemented and wired together: (1) a code knowledge graph adapter wrapping `codebase-memory-mcp`, (2) a parallel agent execution engine using git worktrees + Inngest durable steps, and (3) a sequential merge queue with LLM-assisted conflict resolution.

The good news: the entry point (`beadDispatchHandler` in Phase 5) already exists and has a `// Phase 6 will add the actual LLM execution logic here` comment at exactly the right insertion point. The concurrency config, fan-in coordination, optimistic bead claiming, and event sourcing are already implemented. Phase 6 fills in the body of that function with the full execution lifecycle.

`codebase-memory-mcp` is confirmed installed at `/Users/zakkeown/.local/bin/codebase-memory-mcp` version `0.5.6`. It exposes 14 CLI tools via `codebase-memory-mcp cli <tool> '<json>'` and returns MCP-format JSON: `{"content":[{"type":"text","text":"<json-string>"}]}`. **Critical:** all query tools require a `"project"` parameter matching the project's derived name (URL-path-derived: `Users-zakkeown-Code-cauldron`). The binary has no TypeScript SDK — the adapter must spawn it as a child process and parse the double-encoded JSON response.

**Primary recommendation:** Build the adapter as a thin TypeScript class in `packages/engine/src/intelligence/` that spawns `codebase-memory-mcp` via Node `child_process.exec`, parses the MCP response envelope, and exposes typed methods. Then extend `beadDispatchHandler` with worktree creation, context assembly, TDD loop, and merge queue steps.

---

## Standard Stack

### Core (already in codebase — no new installs needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `inngest` | 4.1.0 | Durable agent execution lifecycle | Already wired; `beadDispatchHandler` is the extension point |
| `drizzle-orm` | 0.45.1 | DB operations for bead state | Established pattern from Phases 1-5 |
| `ai` (Vercel AI SDK) | 6.0.138 | Agent LLM calls via `streamText`/`generateText` | Gateway wraps this; use `implementation` stage |
| `zod` | 4.3.6 | Schema validation for structured LLM output | Established pattern |
| `pino` | 10.3.1 | Structured logging for agent workers | Already in engine |
| `node:child_process` | Node built-in | Spawn `codebase-memory-mcp` CLI | No external dep needed |

### New Dependencies Required
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `simple-git` | 3.33.0 | Git worktree management via Node.js | Current npm version; provides typed TS API; uses `.raw()` for worktree commands since `worktreeAdd()` is not in the documented API |

**Installation:**
```bash
pnpm add simple-git --filter @cauldron/engine
```

**Version verification:** `npm view simple-git version` → 3.33.0 (verified 2026-03-26)

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `simple-git` | Raw `child_process.exec('git worktree add ...')` | Raw exec works fine; simple-git adds typed git error handling and cleaner API for branch operations needed alongside worktrees |
| `simple-git` | `nodegit` (libgit2 bindings) | nodegit has native binary dependency that breaks serverless/edge; simple-git wraps the git CLI directly — no binary overhead |

---

## Architecture Patterns

### Recommended Project Structure (new files for Phase 6)
```
packages/engine/src/
├── intelligence/                    # NEW: Code Knowledge Graph Adapter (CODE-01 through CODE-04)
│   ├── adapter.ts                   # KnowledgeGraphAdapter class — spawns codebase-memory-mcp
│   ├── types.ts                     # GraphNode, TraceResult, DetectChangesResult, etc.
│   └── __tests__/
│       └── adapter.test.ts          # Unit tests with mocked child_process
├── execution/                       # NEW: Agent execution engine (EXEC-01 through EXEC-09)
│   ├── context-assembler.ts         # Assembles seed excerpt + bead spec + relevant code
│   ├── worktree-manager.ts          # Git worktree lifecycle (create, commit, cleanup)
│   ├── agent-runner.ts              # Runs LLM agent with TDD loop (TEST-01 through TEST-06)
│   ├── merge-queue.ts               # Sequential topological merge back to main
│   ├── test-detector.ts             # Detects existing test runner in target project
│   ├── timeout-supervisor.ts        # Idle detection + soft/hard timeout (EXEC-09)
│   └── __tests__/
│       ├── context-assembler.test.ts
│       ├── worktree-manager.test.ts
│       └── agent-runner.test.ts
└── decomposition/
    └── events.ts                    # EXTEND: beadDispatchHandler gets execution logic injected
```

### Pattern 1: Knowledge Graph Adapter (CODE-01, CODE-02, CODE-04)

The adapter wraps the `codebase-memory-mcp` binary via `child_process`. The binary returns MCP envelope JSON: `{"content":[{"type":"text","text":"<json-string>"}]}`. The inner text must be JSON-parsed a second time.

**Critical:** All query tools require a `"project"` parameter. The project name is the filesystem path with slashes replaced by dots: `/Users/zakkeown/Code/cauldron` → `Users-zakkeown-Code-cauldron`. This is derived by the binary during indexing.

```typescript
// packages/engine/src/intelligence/adapter.ts
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const BINARY = process.env['CODEBASE_MEMORY_MCP_BIN'] ?? 'codebase-memory-mcp';

export class KnowledgeGraphAdapter {
  constructor(
    private readonly repoPath: string,
    private readonly projectName: string  // derived: path.replace(/\//g, '.').replace(/^\./, '')
  ) {}

  private async invoke<T>(tool: string, args: Record<string, unknown>): Promise<T> {
    const json = JSON.stringify({ ...args, project: this.projectName });
    const { stdout } = await execAsync(`${BINARY} cli ${tool} '${json}'`);
    const envelope = JSON.parse(stdout) as { content: Array<{ type: string; text: string }> };
    return JSON.parse(envelope.content[0]!.text) as T;
  }

  async indexRepository(): Promise<{ nodes: number; edges: number }> {
    return this.invoke('index_repository', { repo_path: this.repoPath });
  }

  async searchGraph(params: { label?: string; name_pattern?: string; file_pattern?: string }): Promise<GraphSearchResult> {
    return this.invoke('search_graph', params);
  }

  async traceCallPath(functionName: string, direction: 'callers' | 'callees' | 'both' = 'both'): Promise<TraceResult> {
    return this.invoke('trace_call_path', { function_name: functionName, direction });
  }

  async getCodeSnippet(qualifiedName: string): Promise<CodeSnippetResult> {
    return this.invoke('get_code_snippet', { qualified_name: qualifiedName });
  }

  async detectChanges(): Promise<DetectChangesResult> {
    return this.invoke('detect_changes', {});
  }
}
```

**Return shapes confirmed by CLI testing:**
- `search_graph`: `{ total: number; results: Array<{ name, qualified_name, label, file_path, in_degree, out_degree }>; has_more: boolean }`
- `trace_call_path`: `{ function: string; direction: string; callers: Array<{ name, qualified_name, hop }>; callees: Array<{ name, qualified_name, hop }> }`
- `detect_changes`: `{ changed_files: string[]; changed_count: number; impacted_symbols: Array<{ name, label, file }> }`
- `index_repository`: `{ project: string; status: string; nodes: number; edges: number }`

### Pattern 2: Worktree Manager (EXEC-02, D-13, D-17, D-18)

`simple-git` does not document dedicated `worktreeAdd()`/`worktreeRemove()` methods — use `.raw()` for worktree operations. All other git operations (commit, branch, merge) use the typed API.

```typescript
// packages/engine/src/execution/worktree-manager.ts
import simpleGit from 'simple-git';

export class WorktreeManager {
  constructor(private readonly projectRoot: string) {}

  async createWorktree(beadId: string): Promise<{ path: string; branch: string }> {
    const git = simpleGit(this.projectRoot);
    const shortId = beadId.slice(0, 8);
    const branch = `cauldron/bead-${shortId}`;
    const worktreePath = `${this.projectRoot}/.cauldron/worktrees/${beadId}`;

    // git worktree add -b <branch> <path>
    await git.raw(['worktree', 'add', '-b', branch, worktreePath]);
    return { path: worktreePath, branch };
  }

  async removeWorktree(beadId: string): Promise<void> {
    const git = simpleGit(this.projectRoot);
    const worktreePath = `${this.projectRoot}/.cauldron/worktrees/${beadId}`;
    // git worktree remove --force <path>
    await git.raw(['worktree', 'remove', '--force', worktreePath]);
    // prune to remove the branch reference
    await git.raw(['worktree', 'prune']);
    await git.deleteLocalBranch(`cauldron/bead-${beadId.slice(0, 8)}`, true);
  }

  async commitWorktreeChanges(worktreePath: string, message: string): Promise<string> {
    const git = simpleGit(worktreePath);
    await git.add('.'); // within worktree, '.' is scoped to worktree root
    const result = await git.commit(message);
    return result.commit;
  }

  async mergeWorktreeToMain(beadId: string, branch: string): Promise<MergeResult> {
    const git = simpleGit(this.projectRoot);
    await git.checkout('main');
    try {
      await git.merge([branch, '--no-ff', '-m', `Merge bead ${beadId}`]);
      return { success: true, conflicted: false };
    } catch (err) {
      const conflicted = await git.status();
      return { success: false, conflicted: true, conflicts: conflicted.conflicted };
    }
  }
}
```

**Key constraint (confirmed from git docs):** The one-branch-per-worktree rule is enforced by git. If a branch is already checked out in another worktree, `git worktree add` will fail. This is desirable — it prevents two beads from sharing a branch.

**Gitignore entry required:** `.cauldron/worktrees/` must be added to `.gitignore` of the target project during Phase 6 setup.

### Pattern 3: Extending beadDispatchHandler (EXEC-01 through EXEC-09)

The Phase 5 `beadDispatchHandler` in `packages/engine/src/decomposition/events.ts` ends with `// Phase 6 will add the actual LLM execution logic here`. Phase 6 inserts execution steps here:

```typescript
// Extending beadDispatchHandler after step 4 (emit-dispatched):

// Step 5: Create git worktree for isolated execution
const { worktreePath, branch } = await step.run('create-worktree', async () => {
  return worktreeManager.createWorktree(beadId);
});

// Step 6: Assemble context (knowledge graph + seed excerpt + dep outputs)
const context = await step.run('assemble-context', async () => {
  return contextAssembler.assemble({ beadId, seedId, projectId, worktreePath });
});

// Step 7: TDD self-healing loop (max 5 iterations per D-22)
const executionResult = await step.run('execute-agent', async () => {
  return agentRunner.runWithTddLoop({ context, worktreePath, beadId, projectId, maxIterations: 5 });
});

// Step 8: Merge queue — topological order enforced by waiting for upstream merges
await step.run('queue-merge', async () => {
  return mergeQueue.enqueue({ beadId, branch, worktreePath, seedId, projectId });
});
```

Note: each `step.run` is durable — if the Inngest worker restarts, already-completed steps are skipped. The `executionResult` from step 7 is persisted and available for step 8.

### Pattern 4: TDD Self-Healing Loop (EXEC-05, TEST-01 through TEST-06)

```typescript
// packages/engine/src/execution/agent-runner.ts
export async function runWithTddLoop(options: TddLoopOptions): Promise<ExecutionResult> {
  const { context, worktreePath, beadId, projectId, maxIterations } = options;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    // Phase A: Generate tests first (TDD — D-19)
    if (iteration === 0) {
      await agentGenerateTests(context, worktreePath, gateway);
    }

    // Phase B: Generate/update implementation
    const implResult = await agentGenerateImplementation(context, worktreePath, gateway, iteration);

    // Phase C: Run tests and typecheck
    const testOutput = await runTests(worktreePath, context.testRunner);
    const typecheckOutput = await runTypecheck(worktreePath);

    if (testOutput.passed && typecheckOutput.passed) {
      return { success: true, iterations: iteration + 1 };
    }

    // Pass error output back to agent for next iteration
    context.previousErrors = [...(testOutput.errors ?? []), ...(typecheckOutput.errors ?? [])];
  }

  return { success: false, iterations: maxIterations, finalErrors: context.previousErrors };
}
```

### Pattern 5: Context Assembly (EXEC-04, D-07 through D-10)

```typescript
// packages/engine/src/execution/context-assembler.ts
export async function assembleContext(options: AssemblyOptions): Promise<AgentContext> {
  const { bead, seed, knowledgeGraph } = options;

  // Step 1: Deterministic keyword extraction from bead spec
  const keywords = extractKeywords(bead.spec, bead.title);

  // Step 2: Knowledge graph query — symbols + 1-hop dependencies
  const [symbolResults, ...traceResults] = await Promise.all([
    knowledgeGraph.searchGraph({ name_pattern: keywords.join('|') }),
    ...keywords.map(kw => knowledgeGraph.traceCallPath(kw, 'both')),
  ]);

  // Step 3: LLM pruning pass (D-07) — lightweight call to prune noise
  const prunedSymbols = await gateway.generateObject({
    stage: 'context_assembly',
    schema: PrunedSymbolListSchema,
    prompt: buildPruningPrompt(bead.spec, symbolResults, traceResults),
    projectId: options.projectId,
  });

  // Step 4: Fetch code snippets for selected symbols
  const codeSnippets = await Promise.all(
    prunedSymbols.symbols.map(s => knowledgeGraph.getCodeSnippet(s.qualified_name))
  );

  // Step 5: Scoped seed excerpt (D-09)
  const seedExcerpt = buildSeedExcerpt(seed, bead.coversCriteria);

  // Step 6: Priority-based token budget trimming (D-10)
  return applyTokenBudget({
    seedExcerpt,
    beadSpec: bead.spec,
    codeSnippets,
    budget: 180_000, // 200k minus ~20k for agent response room
  });
}
```

**New gateway stage required:** Add `'context_assembly'` and `'conflict_resolution'` to `PipelineStage` type in `packages/engine/src/gateway/types.ts`, and add STAGE_PREAMBLES entries in `gateway.ts`.

### Anti-Patterns to Avoid

- **Loading the full codebase into agent context:** Always use knowledge graph queries. Never read all project files.
- **FIFO merge queue:** D-15 mandates topological order. A bead that finishes first but has an incomplete upstream dependency must wait.
- **Blocking the Inngest worker thread on `child_process.exec`:** Use `promisify(exec)` for async invocations; wrap in `step.run` so Inngest can checkpoint.
- **Using `git merge --ff-only` for agent worktrees:** Fast-forward loses commit attribution. Always use `--no-ff` to preserve bead authorship in git history.
- **Sharing worktrees across beads:** The one-branch-per-worktree git constraint enforces isolation. Never reuse a worktree path for a different bead.
- **Mocking the DB in integration tests:** Established project pattern — use real PostgreSQL on the test port (5433). See STATE.md pattern.
- **Using auto-watcher for re-index:** `codebase-memory-mcp`'s `auto_index` background watcher is not appropriate here. Trigger re-index explicitly via `index_repository` after each bead merge, not continuously.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Code symbol extraction | Custom AST parser | `codebase-memory-mcp search_graph` | 66-language tree-sitter parsing; call graphs already built; hand-rolling for TypeScript alone misses cross-language deps |
| Git operations | `child_process.exec` raw strings for all git ops | `simple-git` with `.raw()` for worktree-specific commands | Type safety, git error parsing, exit code handling; hand-rolled strings silently pass malformed arguments |
| Durable agent retry | Manual retry loops with try/catch | Inngest `step.run` | Inngest checkpoints each step; if the worker restarts after step 3, steps 1-3 are skipped automatically |
| Fan-in synchronization | Custom Redis pub/sub listener | `step.waitForEvent` | Already implemented in Phase 5 `beadDispatchHandler`; `waitForEvent` handles timeout + null return natively |
| Token counting | Manual character/word estimation | Count words × 1.3 (conservative) or use `ai` SDK `countTokens` if available | Perfect counting is not needed — conservative estimates prevent overflow; don't spend tokens counting tokens |
| Conflict detection | String parsing of diff output | `git merge --no-commit` + check exit code and `git status --porcelain` | Git's conflict detection is authoritative; parsing diff is brittle for binary files and rename conflicts |

**Key insight:** `codebase-memory-mcp` eliminates the hardest problem in context assembly (symbol extraction, call graph traversal, cross-file dependency mapping). The adapter layer is thin by design — its job is type-safe invocation and response parsing, not code analysis.

---

## Common Pitfalls

### Pitfall 1: codebase-memory-mcp Project Parameter
**What goes wrong:** All query tools (search_graph, trace_call_path, detect_changes, etc.) silently return empty results if the `"project"` parameter is omitted or wrong. The binary returns `{"total":0,"results":[]}` with no error.
**Why it happens:** Queries are scoped to a project index; without the project key, the tool searches the wrong scope or nothing.
**How to avoid:** Always pass `"project"` as the URL-path-derived name: replace `/` with `.` and strip leading dot. Example: `/Users/zakkeown/Code/cauldron` → `Users-zakkeown-Code-cauldron`. Derive this programmatically in `KnowledgeGraphAdapter` constructor.
**Warning signs:** Search returning `total: 0` for known symbols. Test the adapter's `searchGraph` in integration tests with a known function name (e.g., `completeBead`).

### Pitfall 2: MCP Response Double-Encoding
**What goes wrong:** `codebase-memory-mcp cli` returns `{"content":[{"type":"text","text":"<json-string>"}]}` — the actual data is JSON-encoded inside the `text` field. If you parse once and access `.content[0].text`, you get a string, not an object.
**Why it happens:** This is the MCP protocol envelope format; the binary wraps all tool output in this standard container.
**How to avoid:** Always parse twice: `const envelope = JSON.parse(stdout); const data = JSON.parse(envelope.content[0].text)`.
**Warning signs:** TypeScript type errors at runtime accessing `.results` on a string.

### Pitfall 3: Git Worktree One-Branch Rule
**What goes wrong:** `git worktree add -b cauldron/bead-abc123 .cauldron/worktrees/abc123` fails with `fatal: A branch named 'cauldron/bead-abc123' already exists` if cleanup from a previous failed run didn't remove the branch.
**Why it happens:** Git enforces that a branch can only be checked out in one worktree at a time.
**How to avoid:** In `WorktreeManager.createWorktree`, check if the branch exists and force-delete it before creating. Include branch cleanup in both `removeWorktree` (success path) and error recovery (failure path).
**Warning signs:** Bead stuck in `claimed` status with `create-worktree` Inngest step failing.

### Pitfall 4: Merge Queue Race Condition
**What goes wrong:** Two beads complete at nearly the same time and both attempt to merge to main simultaneously, causing a second merge to see conflicts that wouldn't exist if they merged sequentially.
**Why it happens:** Inngest dispatches `queue-merge` steps concurrently unless serialized.
**How to avoid:** Use a PostgreSQL advisory lock or a Redis lock keyed on `{projectId}-merge-queue`. Alternatively, use Inngest's `concurrency` config with `scope: 'fn'` and `key: 'event.data.projectId'` on the merge handler function (same pattern as `handleBeadDispatchRequested`). The topological ordering (D-15) also helps: upstream beads merge first, so downstream beads naturally wait.
**Warning signs:** Merge conflicts on files that were not modified by both beads.

### Pitfall 5: Incremental Re-Index Timing
**What goes wrong:** A downstream bead's context assembly runs before the upstream bead's changes are reflected in the knowledge graph, so the downstream agent doesn't see the new interfaces/types it depends on.
**Why it happens:** D-05 says re-index triggers on bead completion before dispatching newly-ready beads. If the Inngest step that re-indexes runs asynchronously and the dispatch step fires immediately, the graph may not be updated yet.
**How to avoid:** Make re-indexing a synchronous `step.run` that completes (and returns) before the `step.sendEvent` for downstream beads in `beadCompletionHandler`.
**Warning signs:** Downstream agents generating code with wrong interface signatures that only existed in the previous version.

### Pitfall 6: Test Runner Detection Failure
**What goes wrong:** The target project has both Jest config files and Vitest config files (from migrating). Agent picks Jest and runs against a Vitest-only setup (or vice versa).
**Why it happens:** Detecting the active test runner from config file presence is ambiguous when both exist.
**How to avoid:** Priority order: (1) `package.json` "test" script command text — if it contains `vitest`, use vitest; if `jest`, use jest; (2) config file presence (vitest.config.* beats jest.config.*); (3) package.json devDependencies presence; (4) default to Vitest.
**Warning signs:** Test command exits with `Cannot find module 'jest'` or similar.

### Pitfall 7: Agent Capability Scope Bypass
**What goes wrong:** Agent generates code that imports a module and runs `fs.writeFileSync` on an absolute path outside the worktree, bypassing the worktree isolation.
**Why it happens:** Process-level scoping (D-12) is enforced by the agent's system prompt and cwd, but not by OS permissions if the agent process has access to the full filesystem.
**How to avoid:** Set `cwd` of any test/verification subprocesses to the worktree path. In the system prompt, include an explicit constraint: "You may only create or modify files relative to the current working directory." For stronger enforcement, use a separate Node.js child process with `process.chdir(worktreePath)` before running the agent's generated code.
**Warning signs:** Files modified outside `.cauldron/worktrees/{bead-id}/` during bead execution.

### Pitfall 8: Inngest step.run Non-Idempotency
**What goes wrong:** `create-worktree` step succeeds, creates the worktree directory, but the function restarts (Inngest retries). The step runs again and fails with "path already exists".
**Why it happens:** Inngest only skips a step on replay if it successfully completed and memoized the result. If the step threw after creating the directory, it will re-run.
**How to avoid:** Make worktree creation idempotent: check if the worktree path exists before calling `git worktree add`. If it exists and the branch matches, return the cached result. In `createWorktree`: `if (existsSync(worktreePath)) return { path: worktreePath, branch }`.
**Warning signs:** `create-worktree` step failing intermittently on Inngest retries with "path already exists".

---

## Code Examples

### codebase-memory-mcp CLI Invocation (verified by direct testing)
```typescript
// Source: Direct CLI testing on cauldron repo 2026-03-26
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

// Returns MCP envelope — always parse twice
async function invokeTool<T>(tool: string, args: Record<string, unknown>): Promise<T> {
  const json = JSON.stringify(args).replace(/'/g, "'\\''"); // shell-escape single quotes
  const { stdout } = await execAsync(`codebase-memory-mcp cli ${tool} '${json}'`);
  const envelope = JSON.parse(stdout) as { content: Array<{ type: string; text: string }>; isError?: boolean };
  if (envelope.isError) throw new Error(`codebase-memory-mcp error: ${envelope.content[0]?.text}`);
  return JSON.parse(envelope.content[0]!.text) as T;
}

// Example: search for all Functions in the cauldron project
const result = await invokeTool<{ total: number; results: GraphNode[] }>('search_graph', {
  label: 'Function',
  project: 'Users-zakkeown-Code-cauldron',  // REQUIRED
  name_pattern: '.*Handler.*',
});
// result.total = 111 for all functions (verified)
```

### Git Worktree via simple-git .raw()
```typescript
// Source: simple-git npm 3.33.0 API + git official docs
import simpleGit from 'simple-git';

const git = simpleGit('/path/to/project');

// Create worktree with new branch
await git.raw(['worktree', 'add', '-b', 'cauldron/bead-abc12345', '.cauldron/worktrees/bead-uuid-here']);

// List worktrees
await git.raw(['worktree', 'list', '--porcelain']);

// Remove worktree (force handles unclean worktrees)
await git.raw(['worktree', 'remove', '--force', '.cauldron/worktrees/bead-uuid-here']);

// Prune stale worktree references
await git.raw(['worktree', 'prune']);
```

### Inngest Step Pattern for Execution (extending Phase 5)
```typescript
// Source: Inngest docs + Phase 5 established pattern in events.ts
// Extending beadDispatchHandler after step 4 ('emit-dispatched')

// Step 5: Idempotent worktree creation
const worktreeInfo = await step.run('create-worktree', async () => {
  const path = `${projectRoot}/.cauldron/worktrees/${beadId}`;
  if (existsSync(path)) return { path, branch: `cauldron/bead-${beadId.slice(0, 8)}` };
  return worktreeManager.createWorktree(beadId);
});

// Step 6: Context assembly (includes knowledge graph queries)
const agentContext = await step.run('assemble-context', async () => {
  return contextAssembler.assemble({ beadId, seedId, projectId });
});

// Step 7: TDD execution loop — all 5 iterations within a single step.run
// (keeping it atomic so partial iteration state doesn't leak between Inngest retries)
const execResult = await step.run('execute-tdd-loop', async () => {
  return agentRunner.runWithTddLoop({ agentContext, worktreePath: worktreeInfo.path, beadId, projectId });
});

// Step 8: Enqueue merge (actual merge may happen in a separate Inngest function)
await step.sendEvent('enqueue-merge', {
  name: 'bead.merge_requested',
  data: { beadId, seedId, projectId, branch: worktreeInfo.branch, success: execResult.success },
});
```

### Gateway Stage Extension
```typescript
// packages/engine/src/gateway/types.ts — add new stages
export type PipelineStage =
  | 'interview'
  | 'holdout'
  | 'implementation'
  | 'evaluation'
  | 'decomposition'
  | 'context_assembly'    // NEW: D-07 LLM pruning of candidate code
  | 'conflict_resolution'; // NEW: D-14 LLM-assisted merge conflict resolution

// packages/engine/src/gateway/gateway.ts — add preambles
const STAGE_PREAMBLES: Record<PipelineStage, string> = {
  // ... existing entries ...
  context_assembly:
    'You are a code relevance analyst. Given a bead specification and a set of candidate code symbols, identify which symbols are truly relevant and which are noise. Return only symbols directly needed for implementing the bead.',
  conflict_resolution:
    'You are resolving a git merge conflict. You have the bead specifications for both sides of the conflict. Produce a resolution that satisfies both bead goals. If you cannot resolve confidently, respond with confidence: "low" to escalate to human review.',
};
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Full codebase grep for context | Knowledge graph sub-ms queries | 2025-2026 (codebase-memory-mcp) | 120x token reduction for context assembly |
| Manual git merge in CI | LLM-assisted conflict resolution with bead spec context | 2025-2026 (Resolve.AI, Claude Code /batch) | Automated resolution for semantic conflicts |
| Single-agent sequential execution | Multi-agent parallel worktree execution | 2025-2026 (Augment Code, parallel-worktrees pattern) | Orders-of-magnitude speedup for independent beads |
| Mocking external deps in tests | Real integration testing, mocks only for true externals | Established 2024+ | Catches real bugs that mock tests miss (per MEMORY.md) |
| `Promise.race` for fan-out | `group.parallel()` in Inngest v4 | Inngest v4 | Correct parallel step semantics; `Promise.race` changed behavior in v4 |

**Deprecated/outdated:**
- `inngest.createFunction({ id, triggers })` with `pipeline` key in `turbo.json`: Phase 1 decision — Turborepo v2 uses `tasks` key, not `pipeline`. Already correct in codebase.
- MCP TypeScript SDK for calling codebase-memory-mcp: No TypeScript SDK exists for this binary. The CLI child_process pattern is the correct approach.

---

## Open Questions

1. **Shell injection in codebase-memory-mcp invocation**
   - What we know: Bead titles/specs may contain single quotes or other shell metacharacters. Current shell-escape approach (`replace(/'/g, "'\\''")`) handles basic cases.
   - What's unclear: Edge cases with newlines, backticks, `$()` in spec text.
   - Recommendation: Use `JSON.stringify` to produce the JSON string, then pass via a temp file or stdin pipe rather than shell argument. `exec(`${BINARY} cli ${tool}`, { input: json })` if the binary supports stdin input; otherwise write to a temp file.

2. **Worktree filesystem scope enforcement (D-12)**
   - What we know: Setting `cwd` to worktree path in subprocesses restricts relative file ops. Absolute paths can still escape.
   - What's unclear: Whether any test framework (Jest/Vitest) or the agent itself issues `process.chdir` calls that could escape the scope.
   - Recommendation: Add a runtime assertion in test execution: after test run, scan for files modified outside the worktree directory and emit a warning event. This is detective, not preventive, but sufficient for Phase 6.

3. **codebase-memory-mcp incremental re-index behavior after worktree commits**
   - What we know: `detect_changes` maps git diff to affected symbols. `index_repository` re-indexes fully.
   - What's unclear: Does `detect_changes` work on a repo that has a worktree with new commits that haven't been merged to main? The merged-to-main triggering point (D-05) is clear, but can `detect_changes` detect in-progress worktree changes?
   - Recommendation: Trigger full `index_repository` after each bead merge to main (D-05). Don't rely on `detect_changes` for post-merge updates — use it only for informational "blast radius" analysis during context assembly.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| `codebase-memory-mcp` binary | CODE-01, CODE-02, CODE-03, CODE-04 | Yes | 0.5.6 | None — blocking |
| `git` CLI | EXEC-02, EXEC-06, EXEC-07 | Yes | 2.50.1 | None — blocking |
| `simple-git` npm package | Worktree manager | Not yet installed | 3.33.0 (latest) | Fall back to raw child_process git exec (viable but less clean) |
| PostgreSQL (port 5432 dev, 5433 test) | Integration tests | Assumed present from Phase 1 | 15.x | Docker Compose from Phase 1 |
| Inngest dev server | Local Inngest step execution | Assumed from Phase 4/5 setup | 4.x | None for integration tests |
| Node.js `child_process` | codebase-memory-mcp adapter | Built-in | Node 18+ | None needed |

**Missing dependencies with no fallback:**
- None beyond `simple-git` which has a viable raw-git fallback.

**Missing dependencies with fallback:**
- `simple-git`: Not yet in engine package.json. Fallback is raw `child_process.exec` git commands — viable but adds 2-3 lines per worktree operation.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.x |
| Config file | `packages/engine/vitest.config.ts` (unit) + `packages/engine/vitest.integration.config.ts` (integration) |
| Quick run command | `pnpm --filter @cauldron/engine test` |
| Full suite command | `pnpm --filter @cauldron/engine test && pnpm --filter @cauldron/engine test:integration` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CODE-01 | `KnowledgeGraphAdapter.indexRepository()` returns node/edge counts | unit | `vitest run src/intelligence/__tests__/adapter.test.ts` | No — Wave 0 |
| CODE-02 | `searchGraph` returns results with correct project param | unit (mocked exec) | same | No — Wave 0 |
| CODE-03 | `detectChanges` called after bead merge before dispatch | integration | `vitest run --config vitest.integration.config.ts` | No — Wave 0 |
| CODE-04 | `indexRepository` callable from brownfield interview context | unit | same adapter test | No — Wave 0 |
| EXEC-02 | `WorktreeManager.createWorktree` creates git worktree at expected path | unit | `vitest run src/execution/__tests__/worktree-manager.test.ts` | No — Wave 0 |
| EXEC-04 | `assembleContext` respects token budget and includes expected sections | unit | `vitest run src/execution/__tests__/context-assembler.test.ts` | No — Wave 0 |
| EXEC-05 | `agentRunner.runWithTddLoop` retries on test failure up to 5 times | unit (mocked gateway) | `vitest run src/execution/__tests__/agent-runner.test.ts` | No — Wave 0 |
| EXEC-06 | Merge queue processes in topological order | unit | merge-queue test | No — Wave 0 |
| EXEC-09 | Timeout supervisor fires soft warning at 80%, kills at hard timeout | unit | timeout-supervisor test | No — Wave 0 |
| TEST-06 | `completeBead` only called after all test levels pass | integration | full integration test | No — Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @cauldron/engine test`
- **Per wave merge:** `pnpm --filter @cauldron/engine test && pnpm --filter @cauldron/engine test:integration && pnpm -r build`
- **Phase gate:** Full suite green + build passing before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/engine/src/intelligence/__tests__/adapter.test.ts` — covers CODE-01, CODE-02; mocks `child_process.exec`
- [ ] `packages/engine/src/execution/__tests__/worktree-manager.test.ts` — covers EXEC-02; mocks `simple-git`
- [ ] `packages/engine/src/execution/__tests__/context-assembler.test.ts` — covers EXEC-04; mocks `KnowledgeGraphAdapter`
- [ ] `packages/engine/src/execution/__tests__/agent-runner.test.ts` — covers EXEC-05; mocks `LLMGateway`
- [ ] `packages/engine/src/intelligence/adapter.integration.test.ts` — covers CODE-03; requires live `codebase-memory-mcp` binary + real git repo; add to integration config

---

## Project Constraints (from CLAUDE.md)

- **TypeScript end-to-end:** All Phase 6 code must be TypeScript. No JavaScript files.
- **Vercel AI SDK:** Use `streamText`/`generateText`/`generateObject` from `ai` package via `LLMGateway`. No direct provider SDK calls.
- **Context window:** Each bead must fit in ~200k tokens (Opus 1M excluded). Token budget enforced at assembly time.
- **OSS dependencies:** `simple-git` passes the 80% clean rule. No architectural contortion required.
- **No encryption contortion:** Holdout tests remain sealed (Phase 4). Phase 6 does not touch the vault or unsealing logic.
- **Integration tests against real PostgreSQL:** No mocking the DB in integration tests (per MEMORY.md `feedback_testing_mocks.md`).
- **Build step required:** Include `pnpm -r build` in regression gate, not just test + typecheck (per MEMORY.md `feedback_run_build.md`).
- **Read code before planning:** Canonical refs in CONTEXT.md must be read before planning any task targeting those paths (per MEMORY.md `feedback_read_code_before_planning.md`).
- **Node16 module resolution:** Explicit `.js` extensions on all relative TypeScript imports (from STATE.md Phase 1 decision).
- **Vitest integration test maxWorkers:1:** Sharing single PostgreSQL instance requires single-fork pool (from STATE.md Phase 1 decision).
- **InngestFunction type annotation:** Use `InngestFunction<any, any, any, any>` to avoid TS2883 (from STATE.md Phase 4 decision).
- **Drizzle ORM not mock:** Use drizzle-orm with real postgres driver for integration tests.
- **GSD Workflow:** All file edits go through GSD commands, not direct edits.

---

## Sources

### Primary (HIGH confidence)
- Direct CLI testing of `codebase-memory-mcp` 0.5.6 on cauldron repo (2026-03-26) — confirmed response format, project parameter requirement, double-encoding
- `packages/engine/src/decomposition/events.ts` — Phase 5 `beadDispatchHandler` extension point confirmed
- `packages/shared/src/db/schema/bead.ts`, `event.ts`, `project.ts` — schema confirmed, no worktree columns exist (Phase 6 adds them via migration)
- `packages/engine/src/gateway/types.ts` — `PipelineStage` type requires new stages
- git 2.50.1 official documentation — worktree add/remove/prune commands confirmed
- Inngest docs `step-parallelism`, `step-wait-for-event` — `step.run` without await + `Promise.all` pattern confirmed for parallel steps

### Secondary (MEDIUM confidence)
- [Inngest Step Parallelism Docs](https://www.inngest.com/docs/guides/step-parallelism) — parallel step pattern with `Promise.all` confirmed
- [Inngest waitForEvent Reference](https://www.inngest.com/docs/reference/typescript/functions/step-wait-for-event) — `step.waitForEvent(id, { event, timeout, match })` signature confirmed
- [codebase-memory-mcp GitHub](https://github.com/DeusData/codebase-memory-mcp) — 14 tools, CLI invocation patterns, project scoping
- [simple-git npm](https://www.npmjs.com/package/simple-git) — version 3.33.0, `.raw()` method for worktree operations

### Tertiary (LOW confidence)
- [AI agent worktree isolation patterns 2026](https://medium.com/@mabd.dev/git-worktrees-the-secret-weapon-for-running-multiple-ai-coding-agents-in-parallel-e9046451eb96) — community pattern validation only

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified via npm registry and direct testing
- Architecture patterns: HIGH — based on actual code reading of Phase 5 integration points
- codebase-memory-mcp adapter: HIGH — direct CLI testing confirmed response format and project parameter requirement
- Git worktree management: HIGH — git 2.50.1 official docs + confirmed worktree list command works in project
- Pitfalls: HIGH for confirmed bugs found during research (project param, double-encoding, idempotency); MEDIUM for race condition and scope bypass (derived from architecture, not empirically observed)
- Test patterns: HIGH — follows established project conventions from Phases 1-5

**Research date:** 2026-03-26
**Valid until:** 2026-04-25 (stable stack; codebase-memory-mcp is pre-1.0 so watch for breaking changes)
