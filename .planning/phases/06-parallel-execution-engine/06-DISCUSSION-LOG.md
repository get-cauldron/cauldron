# Phase 6: Parallel Execution Engine - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-26
**Phase:** 06-parallel-execution-engine
**Areas discussed:** Code Intelligence approach, Agent context assembly, Git worktree & merge queue, Test generation strategy

---

## Code Intelligence approach

| Option | Description | Selected |
|--------|-------------|----------|
| codebase-memory-mcp | Already available as MCP server. Purpose-built for code knowledge graphs. | |
| Custom tree-sitter indexer | Build custom AST parser, store in PostgreSQL. Full control but significant build effort. | |
| Hybrid: codebase-memory-mcp + adapter | Use codebase-memory-mcp as engine, wrap with thin adapter for Cauldron-specific interface. | ✓ |

**User's choice:** Hybrid — codebase-memory-mcp + lightweight adapter
**Notes:** Best of both: no custom graph build, but Cauldron-specific query interface.

### Re-indexing timing

| Option | Description | Selected |
|--------|-------------|----------|
| On bead completion | Re-index after each bead completes, before dispatching next wave. | ✓ |
| On merge to main | Re-index only on merge. Simpler but concurrent beads won't see changes. | |
| Continuous background | File watcher triggers re-index on every save. Highest overhead. | |

**User's choice:** On bead completion
**Notes:** Ensures downstream beads see updated code.

### API surface

| Option | Description | Selected |
|--------|-------------|----------|
| Internal TS API | Adapter is a TypeScript module called by execution engine. Type-safe, no protocol overhead. | ✓ |
| MCP passthrough | Agents call codebase-memory-mcp tools directly. More flexible but adds complexity. | |
| You decide | Claude's discretion. | |

**User's choice:** Internal TS API

### Index scope

| Option | Description | Selected |
|--------|-------------|----------|
| Target project only | Index only the user's project. Simpler scope. | |
| Target + Cauldron engine | Also index Cauldron's own packages for dogfooding. | ✓ |
| You decide | Claude's discretion. | |

**User's choice:** Target + Cauldron engine
**Notes:** Enables dogfood inflection point.

### Index timing (brownfield)

| Option | Description | Selected |
|--------|-------------|----------|
| Start of execution | Index before first bead dispatches. | |
| During interview | Index during brownfield interview so knowledge graph informs decomposition too. | ✓ |
| You decide | Claude's discretion. | |

**User's choice:** During interview
**Notes:** Adapter must be usable by both Phase 3 and Phase 6.

### Knowledge graph scope per agent

| Option | Description | Selected |
|--------|-------------|----------|
| Main + current worktree only | Each agent sees main + its own worktree. No cross-contamination. | ✓ |
| Cross-worktree visibility | Agents can query other concurrent agents' changes. | |
| You decide | Claude's discretion. | |

**User's choice:** Main + current worktree only

---

## Agent context assembly

### Relevant code selection

| Option | Description | Selected |
|--------|-------------|----------|
| Bead spec keyword extraction | Deterministic extraction, query KG for symbols + 1-hop deps. | |
| LLM-driven context selection | LLM interactively queries KG. More adaptive but adds latency. | |
| Full module inclusion | Include all files in touched modules. Simple but may blow token budget. | |
| Keyword extraction + lightweight LLM check | Two-step: deterministic extraction then LLM review/prune/add. | ✓ |

**User's choice:** Keyword extraction + lightweight LLM check (user suggested hybrid via "Other")
**Notes:** Traceable primary step with adaptive augmentation.

### Dependency outputs

| Option | Description | Selected |
|--------|-------------|----------|
| Upstream code artifacts | Include actual files/diffs from completed upstream beads. | ✓ |
| Specs + interfaces only | Include upstream specs and type signatures, not full code. | |
| You decide | Claude's discretion. | |

**User's choice:** Upstream code artifacts

### Seed excerpt scope

| Option | Description | Selected |
|--------|-------------|----------|
| Trimmed to relevant ACs | Only goal + relevant acceptance criteria. | |
| Full seed spec | Entire seed YAML. More tokens but full context. | |
| Goal + constraints + relevant ACs | Goal, all constraints (cross-cutting), relevant ACs only. | ✓ |

**User's choice:** Goal + constraints + relevant ACs

### Token budget

| Option | Description | Selected |
|--------|-------------|----------|
| Hard budget with priority trimming | Hard cap, trim lowest-priority items on overflow. | ✓ |
| Trust Phase 5 estimates | Rely on decomposition estimates. Simpler but fragile. | |
| You decide | Claude's discretion. | |

**User's choice:** Hard budget with priority trimming

### Agent prompt architecture

| Option | Description | Selected |
|--------|-------------|----------|
| System prompt + context | Dedicated system prompt for role/constraints, context in messages. | ✓ |
| Everything in one prompt | Single flat prompt with instructions and context interleaved. | |
| You decide | Claude's discretion. | |

**User's choice:** System prompt + context

### Capability scoping (EXEC-08)

| Option | Description | Selected |
|--------|-------------|----------|
| No destructive ops + scoped filesystem | Process-level enforcement. Write only within worktree. No git push, no deletion outside scope. | ✓ |
| Soft constraints via prompt only | System prompt guidance, no runtime enforcement. | |
| You decide | Claude's discretion. | |

**User's choice:** No destructive ops + scoped filesystem

---

## Git worktree & merge queue

### Branch naming

| Option | Description | Selected |
|--------|-------------|----------|
| cauldron/bead-{beadId} | Flat namespace, one branch per bead, cleaned up after merge. | ✓ |
| cauldron/{seedId}/{beadTitle} | Hierarchical with human-readable titles. | |
| You decide | Claude's discretion. | |

**User's choice:** cauldron/bead-{beadId}

### Conflict resolution

| Option | Description | Selected |
|--------|-------------|----------|
| LLM resolution first, then human | LLM attempts using bead specs as context. Escalate if not confident. | ✓ |
| Always escalate to human | Any conflict pauses queue. Safest but slowest. | |
| Auto-resolve with heuristics | Git merge strategies, no LLM/human. Fast but may produce incorrect merges. | |

**User's choice:** LLM resolution first, then human

### Merge order

| Option | Description | Selected |
|--------|-------------|----------|
| DAG topological order | Upstream beads merge first regardless of completion time. | ✓ |
| FIFO completion order | First completed, first merged. Simpler but more conflicts. | |
| You decide | Claude's discretion. | |

**User's choice:** DAG topological order

### Post-merge testing

| Option | Description | Selected |
|--------|-------------|----------|
| Re-run on main | Run bead's tests against main after merge. Revert if fail. | ✓ |
| Trust worktree results | Skip re-running. Faster but misses integration failures. | |
| You decide | Claude's discretion. | |

**User's choice:** Re-run on main

### Worktree location

| Option | Description | Selected |
|--------|-------------|----------|
| .cauldron/worktrees/ in project root | Gitignored, easy to find and clean up. | ✓ |
| System temp directory | Isolated from project but harder to find/debug. | |
| You decide | Claude's discretion. | |

**User's choice:** .cauldron/worktrees/ in project root

### Worktree cleanup

| Option | Description | Selected |
|--------|-------------|----------|
| Immediate after merge | Delete worktree + prune branch after merge + test pass. Failed merges retained. | ✓ |
| Batch cleanup after seed completes | Keep all worktrees until DAG completes. Higher disk usage. | |
| You decide | Claude's discretion. | |

**User's choice:** Immediate after merge

---

## Test generation strategy

### Test timing

| Option | Description | Selected |
|--------|-------------|----------|
| Inline — implement + test together | Agent writes implementation AND tests in one session. | |
| Separate test generation step | Second LLM call generates tests against implementation. | |
| TDD — tests first | Agent writes tests from bead spec first, then implements until pass. | ✓ |

**User's choice:** TDD — tests first
**Notes:** Aligns with self-healing loop since agent has clear target.

### Anti-mocking heuristic

| Option | Description | Selected |
|--------|-------------|----------|
| Real deps by default, mock only externals | Real DB, real file I/O, real internal APIs. Only external services mocked. | ✓ |
| Prompt-level guidance only | System prompt says prefer real integrations. No enforcement. | |
| Strict no-mock policy | Zero mocks. May be impractical for some beads. | |

**User's choice:** Real deps by default, mock only externals

### Test runners

| Option | Description | Selected |
|--------|-------------|----------|
| Vitest + Playwright | Matching Cauldron's own stack as default. | |
| Target project's existing runners | Detect and use existing test infrastructure. Default to Vitest/Playwright if none. | ✓ |
| You decide | Claude's discretion. | |

**User's choice:** Target project's existing runners

### Self-healing iterations

| Option | Description | Selected |
|--------|-------------|----------|
| Read error, fix, rerun — max 5 | Agent reads failure, modifies code, reruns. 5 iteration cap. | ✓ |
| Unlimited until timeout | Keep iterating until pass or timeout. May burn tokens. | |
| You decide | Claude's discretion. | |

**User's choice:** Max 5 iterations

### E2E test scope

| Option | Description | Selected |
|--------|-------------|----------|
| Only user-facing beads | E2E for APIs, UI, CLI. Internal beads get unit + integration only. | ✓ |
| Every bead, all three levels | Strict TEST-06: every bead gets all three levels. | |
| You decide | Claude's discretion. | |

**User's choice:** Only user-facing beads

### Timeout supervision

| Option | Description | Selected |
|--------|-------------|----------|
| Graduated: idle + soft + hard | Three levels: idle detection, soft warning at 80%, hard kill. Configurable. | ✓ |
| Single hard timeout | One value, kill on expiry. Simpler but no graceful completion. | |
| You decide | Claude's discretion. | |

**User's choice:** Graduated: idle detect + soft + hard

---

## Claude's Discretion

- codebase-memory-mcp adapter API design and query patterns
- System prompt content and structure for implementation agents
- Token budget allocation between context sections
- Priority trimming algorithm details
- Worktree creation and git branch management implementation
- Merge queue data structure and processing loop
- LLM conflict resolution prompt design
- Test detection heuristics for existing project runners
- Idle detection thresholds and soft timeout percentages
- Event naming conventions for bead lifecycle

## Deferred Ideas

None — discussion stayed within phase scope.
