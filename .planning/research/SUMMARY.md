# Project Research Summary

**Project:** Cauldron
**Domain:** AI coding CLI agent — multi-provider, TUI, extension system, Rust hot paths
**Researched:** 2026-04-15
**Confidence:** HIGH

## Executive Summary

Cauldron is a greenfield rebuild of a product whose architecture collapsed under its own weight. The upstream had a working product (6,381 passing tests, real users, solid provider integrations) sitting on a foundation of 99 circular dependencies, fictional package boundaries, 231+ silent error suppressions, and a build system that compensated for broken imports with loader hacks. The thesis of the rebuild is simple: keep the product vision, rebuild the foundation with enforced boundaries, honest builds, and a testing cube that actually means something. Every design decision downstream flows from this premise.

The recommended implementation path is a TypeScript monorepo (pnpm + Turborepo) with Rust native crates for hot paths via napi-rs. The TUI is Ink v7 with React 19.2. Provider integrations use direct LLM SDKs (Anthropic, OpenAI, Google, Mistral) with a thin internal `LanguageModelProvider` interface — not the Vercel AI SDK, which is optimized for React streaming UI hooks that are irrelevant in a CLI context. The extension system uses a descriptor-based pattern with ESLint-enforced import boundaries: extensions export a static descriptor, core reads it — there is no call from extension into core. This is the structural fix for the upstream's collapse.

The primary risks are sequencing and discipline. The research identifies 12 documented pitfalls — half of them are foundation-layer problems that are essentially free to prevent and very expensive to fix after code accumulates. Build system hacks, mutable singletons, empty catch blocks, and circular dependencies must all be linted against before any product code is written. The extension system's boundary must be designed and enforced before any extension code exists. The testing cube (mocked unit + recorded-fixture integration + live-gated) must be wired before any agent or provider code is written. Each phase that skips these constraints creates debt that compounds.

## Key Findings

### Recommended Stack

TypeScript 5.7+ on Node.js 22 LTS is the right primary language — it has the best LLM SDK ecosystem, is what Claude Code and Gemini CLI both use, and is the most trainable surface for AI-assisted development. pnpm 10 with Turborepo 2.9.6 handles the monorepo; Turborepo's experimental `boundaries` feature, combined with `eslint-plugin-import`, enforces the zero-circular-dependency constraint in CI. Vitest 4.1.4 is the test runner — native ESM, same API as Jest, 10-40x faster cold starts, and `vi.mock()` handles the provider mock layer cleanly.

**Core technologies:**
- TypeScript 5.7+ / Node.js 22 LTS: primary language — best LLM SDK ecosystem, AI-assistant-friendly
- pnpm 10 + Turborepo 2.9.6: monorepo — strict phantom-dep prevention, boundaries enforcement in CI
- Ink 7.0.0 + React 19.2: TUI — React component model handles streaming token display cleanly
- napi-rs 3.6.2: Rust FFI — ecosystem standard (Biome, SWC, Rolldown); no node-gyp, cross-platform prebuilts
- Vitest 4.1.4: testing — native ESM, `vi.mock()`, coverage, record/playback fixture pattern
- Commander.js 14: CLI arg parsing — zero dependencies, TypeScript-first, widely understood by AI models
- Zod 3.x: schema validation — provider interfaces, extension manifests, tool input schemas
- Direct LLM SDKs: `@anthropic-ai/sdk@0.89.0`, `openai@6.34.0`, `@google/genai@1.50.1`, `@mistralai/mistralai@2.2.0`

**Critical version notes:**
- Ink v7 requires Node 22 and React `^19.2` (not `^19`)
- Vitest v4 requires Vite 6 as peer
- `@google/genai` (GA since May 2025) replaces deprecated `@google/generative-ai`

**Do not use:** Vercel AI SDK (CLI-irrelevant hooks, 200KB, frequent breaking majors), vm2 (critical CVE January 2026), LangChain (3MB+), Blessed/neo-blessed (unmaintained)

See `.planning/research/STACK.md` for full version matrix and alternatives rationale.

### Expected Features

The competitive field (Claude Code, Aider, Codex CLI, Gemini CLI, OpenCode) has established a clear table-stakes floor. Cauldron's differentiators are multi-provider support, a first-class isolated extension system, and filesystem containment enforced at the tool layer rather than by convention.

**Must have (v1 launch):**
- Core tool system: read, write, edit (apply-diff), bash, grep, glob — with filesystem containment
- Permission prompting: pre-tool approval for bash, allow/deny rule config
- Multi-turn conversation with streaming output
- Session persistence and resume (disk-backed)
- Multi-provider LLM support: Anthropic, OpenAI, Google at minimum
- Prompt injection detection on file reads entering context
- Git integration: diff display, optional auto-commit
- TUI: conversation, tool output, diff preview, syntax highlight, progress indicators
- AGENTS.md project config (project-specific system prompt injection)
- API key management (env + config file, chmod 0600)
- Headless / CI mode
- Extension API: tools and providers (UI widget extensions are v1.x)

**Should have (v1.x after validation):**
- Local model support (Ollama) — add once provider abstraction is proven
- MCP client support — once extension API is stable
- Architect / plan-then-execute mode
- Extension lifecycle management (hot-reload, enable/disable at runtime)
- UI widget extension type

**Defer (v2+):**
- Subagent / parallelization
- Voice input
- Web UI
- Marketplace / plugin distribution

**Anti-features — do not build:**
- Workflow / project management orchestration (this is what collapsed the upstream)
- Daemon / background process
- IDE extensions, Electron app

See `.planning/research/FEATURES.md` for full competitor matrix and dependency graph.

### Architecture Approach

The architecture is a strict DAG of 9 packages at 6 dependency levels. Each level may only import from lower levels; no upward imports, no cycles. The extension API sits at Level 1 (depends only on types) and contains interfaces and types only — zero runtime code touching core internals. This is what prevents the upstream collapse: there is no `registerExtension()` call that extensions can make into core; they export a static descriptor and core's `ExtensionLoader` reads it.

**Major components (by DAG level):**
1. `@get-cauldron/types` (Level 0) — shared type definitions, no runtime deps
2. `@get-cauldron/native` (Level 0) — napi-rs Rust crate: grep, AST parsing, file walking
3. `@get-cauldron/config` (Level 1) — Zod schemas, config loading and validation
4. `@get-cauldron/extension-api` (Level 1) — types-only public API surface for extensions
5. `@get-cauldron/providers` (Level 2) — LLM registry, streaming, per-provider adapters
6. `@get-cauldron/tools` (Level 2) — tool registry, sandbox, permission enforcement, builtin tools
7. `@get-cauldron/agent-core` (Level 3) — ReAct loop, session lifecycle, context/compaction, extension loading
8. `@get-cauldron/tui` (Level 4) — Ink/React renderer, layout, permission prompt UI
9. `@get-cauldron/cli` (Level 5) — Commander entrypoint, mode wiring, session lifecycle ownership

**Key architectural patterns:**
- ReAct loop with explicit `maxSteps` bound; all state in the message array, no singletons
- Provider registry via typed `LanguageModelProvider` interface; agent-core never imports provider implementations
- Tool registry with Zod-validated inputs; sandbox enforcement in the dispatcher, not inside tools
- Extension descriptor pattern: `extension-api` is Level 1, types only, zero runtime deps on core
- Permission callback injected by CLI at session creation; `agent-core` and `tools` never import `tui`
- Context compaction as a first-class session concern (70% budget threshold triggers, not at limit)

**Architecture vs. Stack conflict resolved:**
ARCHITECTURE.md's integration points table mentions `@ai-sdk/anthropic` etc. STACK.md explicitly rules out the Vercel AI SDK. STACK.md is correct — use direct SDKs with the internal `LanguageModelProvider` interface. Pattern 2 in ARCHITECTURE.md already shows how to build this. The `@ai-sdk/*` mention in the integration table describes the interface shape to mirror, not a dependency to take.

See `.planning/research/ARCHITECTURE.md` for full component diagrams, code patterns, and anti-pattern breakdown.

### Critical Pitfalls

**Top 5 — highest severity, most relevant to this rebuild:**

1. **Build system compensating for broken architecture** — add `ignoreBuildErrors`, `skipLibCheck`, path alias hacks the moment a boundary violation fails the build. Prevention: establish `tsc --noEmit` with `skipLibCheck: false` in CI before any package code exists. If a build error reveals a boundary violation, fix the boundary.

2. **Extension becomes the product** — exact failure mode of the upstream. Prevention: `extension-api` must be types-only at Level 1; ESLint `no-restricted-imports` blocks extension imports from core packages; CI import boundary check runs before merge; file count and line count limits on extension packages enforced by linting.

3. **Silent error swallowing** — upstream had 231+ instances. Empty catch blocks, functions returning `undefined` on failure, tools returning empty arrays where callers assume "no results." Prevention: ESLint `no-empty` and `@typescript-eslint/no-empty-function` in CI before any tool or session code is written.

4. **Prompt injection to RCE** — attacker embeds instructions in files the agent reads; bash tool executes attacker-controlled arguments. Prevention: bash tool uses argument arrays with `--` separator, never `shell: true`, never string-concatenated commands; subprocess env scrubbed of API keys before spawn; filesystem containment blocks reads/writes outside project root.

5. **Non-deterministic tests against live LLM APIs** — flaky CI, expensive, hides regressions behind "model variance." Prevention: establish record/playback fixture layer before writing any agent tests; all CI tests use recorded fixtures; live tests gated behind `--run-live` flag, never in PR CI.

**Additional high-priority pitfalls:**
- Streaming partial response mishandling: stateful accumulation buffer per stream, streaming JSON parser, character-at-a-time chunked mock in test suite
- Mutable singleton session state: session state as explicit context objects; tests create isolated instances per case
- Context pollution without compaction: 70% budget threshold trigger designed before session loop is finalized
- Tool API lock-in: dogfood built-in tools through extension registration API; options objects not positional arguments

See `.planning/research/PITFALLS.md` for the full 12-pitfall catalog with prevention strategies, warning signs, and recovery cost estimates.

## Implications for Roadmap

**Testing cube applies to every phase — it is a phase constraint, not a separate phase.** Every phase delivers: mocked unit tests against the package's public API, integration tests with recorded fixtures, and live tests gated behind an environment flag. Tests run against built artifacts (`dist/`), not source files. Coverage thresholds (80/80/60/60) enforced per package.

The dependency DAG in ARCHITECTURE.md dictates build order. Phases follow DAG levels strictly. No phase builds a Level N package before all Level N-1 packages have enforced public APIs and passing tests.

---

### Phase 1: Monorepo Foundation

**Rationale:** Nothing else can start until the build system, lint rules, and test infrastructure are provably correct. Establishing these before product code is free; retrofitting them after accumulation costs weeks. This is the thesis of the entire rebuild.
**Delivers:** pnpm workspace, Turborepo task graph, `tsc --noEmit` with `skipLibCheck: false` in CI, Turborepo `boundaries` enforcement, `eslint-plugin-import` circular dep detection, ESLint `no-empty` rule, Vitest fixture infrastructure (record/playback layer), coverage thresholds configured, conventional commits hook
**Avoids:** Build system compensation (Pitfall 9), silent error swallowing (Pitfall 6), non-deterministic tests (Pitfall 10)
**Research flag:** Standard patterns — skip `/gsd-research-phase`

---

### Phase 2: Types, Config, and Extension API Shell

**Rationale:** Level 0-1 packages with zero runtime deps on core. They must exist before any Level 2+ package can start. Getting the `extension-api` type surface right before any extension code exists is the structural prevention for the upstream collapse.
**Delivers:** `@get-cauldron/types`, `@get-cauldron/config` (Zod schemas, loader), `@get-cauldron/extension-api` (types-only: `CauldronExtension`, `ToolRegistration`, `ProviderRegistration`, `WidgetRegistration`)
**Avoids:** Extension becomes the product (Pitfall 3), tool API lock-in (Pitfall 11)
**Key constraint:** `extension-api` package.json has zero dependencies on any `@get-cauldron/*` core package. CI verifies this via dependency-cruiser or madge.
**Research flag:** Standard patterns — skip `/gsd-research-phase`

---

### Phase 3: Provider Layer

**Rationale:** First significant product code. Getting the streaming buffer, `LanguageModelProvider` interface, and backoff handling right with Anthropic establishes the pattern all subsequent providers follow. Verify the architecture before wiring OpenAI and Google.
**Delivers:** `@get-cauldron/providers` — `LanguageModelProvider` interface, provider registry, Anthropic adapter with correct SSE accumulation buffer, exponential backoff with jitter, per-provider rate limit state tracking
**Avoids:** Streaming partial response mishandling (Pitfall 1), rate limit cascade (Pitfall 12)
**Key constraint:** Streaming tested with character-at-a-time chunked mock before multi-provider work starts.
**Research flag:** Standard patterns — skip `/gsd-research-phase`

---

### Phase 4: Tool System and Sandbox

**Rationale:** Highest-risk surface area — where LLM output becomes filesystem and shell operations. Containment and security must be built in, not bolted on. The bash tool must ship with argument array enforcement and env scrubbing from day one.
**Delivers:** `@get-cauldron/tools` — tool registry, Zod-validated tool descriptors, filesystem sandbox (path containment to project root), permission enforcement in dispatcher, builtin tools: read, write, edit, grep, glob, bash (bash ships with argument array enforcement, `--` separator, subprocess env scrubbing of `*_API_KEY` entries)
**Avoids:** Prompt injection to RCE (Pitfall 2), API credential leakage (Pitfall 4)
**Key constraint:** Red-team the bash tool before this phase closes: can a file containing injected instructions cause a shell command to execute?
**Research flag:** Standard patterns — skip `/gsd-research-phase`

---

### Phase 5: Native Crate (Rust)

**Rationale:** `@get-cauldron/native` is DAG Level 0, but the Rust build setup has its own complexity. Doing it after TypeScript foundation is stable means CI and build tooling are proven before adding a new build system layer. Tools package stubs native paths in earlier phases and wires real bindings here.
**Delivers:** `@get-cauldron/native` — napi-rs 3.6.2 build setup, Rust grep implementation, TypeScript bindings; wired into `@get-cauldron/tools` grep path
**Avoids:** Grep performance degradation on large codebases
**Research flag:** napi-rs v3 Turborepo integration has limited examples; cross-compilation CI setup needs verification — consider `/gsd-research-phase`

---

### Phase 6: Agent Core

**Rationale:** Integrating layer that depends on providers, tools, and extension-api. All Level 2 packages must have real, enforced APIs before agent-core imports from them. Context compaction is a first-class session concern designed here, not an afterthought.
**Delivers:** `@get-cauldron/agent-core` — ReAct loop with `maxSteps` bound, `AgentSession` lifecycle (no mutable singletons), `ContextManager` with token budget and 70%-threshold compaction trigger, `ExtensionLoader` (reads descriptors, feeds registries), session state as explicit context objects; component responsibilities split into separate modules (session, loop, context, extensions — no god files)
**Avoids:** Mutable singleton state (Pitfall 8), context pollution without compaction (Pitfall 5), god files
**Key constraint:** Tests must pass in random order with no shared module-level state between test cases.
**Research flag:** Context compaction strategy has meaningful tradeoffs (LLM-generated summary vs. drop-oldest vs. reversible tool output stripping) — consider `/gsd-research-phase` before finalizing compaction design

---

### Phase 7: TUI

**Rationale:** Level 4 in the DAG; imports from agent-core via events only, never direct. Rendering pipeline must include terminal capability detection, SIGWINCH handling, and raw mode cleanup from day one — retrofitting these after the initial build means touching every component.
**Delivers:** `@get-cauldron/tui` — Ink 7 + React 19.2, conversation view, tool output display, diff preview with syntax highlighting, permission prompt UI, `<Static>` component for streamed output, SIGWINCH handler, cleanup on SIGINT/SIGTERM/uncaught exception, `isTTY` guard, color depth detection with graceful degradation
**Avoids:** TUI rendering breaks across terminal environments (Pitfall 7)
**Key constraint:** Test matrix before closing: iTerm2, SSH, tmux, Windows Terminal — no garbage characters in any environment.
**Research flag:** Standard Ink patterns are well-documented — skip `/gsd-research-phase`

---

### Phase 8: CLI Integration

**Rationale:** Level 5 — the integrating entry point. This is where modes are wired, the permission callback is injected into the sandbox, and session lifecycle is owned. Headless mode and session resume ship here.
**Delivers:** `@get-cauldron/cli` — Commander.js subcommand tree, interactive / headless / onboard modes, session resume (by ID or most-recent), API key management (env + config file, chmod 0600), AGENTS.md loading with trust prompt for cloned repos, permission callback wiring between sandbox and TUI
**Avoids:** API credential leakage (Pitfall 4) — trust prompt before loading project-level config from cloned repos
**Research flag:** Standard Commander.js patterns — skip `/gsd-research-phase`

---

### Phase 9: Multi-Provider Expansion

**Rationale:** Provider abstraction was proven with Anthropic in Phase 3. This phase adds OpenAI, Google, and Mistral adapters and verifies that the streaming buffer, backoff, and per-provider state architecture generalizes correctly across all four providers.
**Delivers:** OpenAI adapter, Google (`@google/genai`) adapter, Mistral adapter — all with independent per-provider backoff state; cross-provider integration tests with recorded fixtures for each provider's chunk fragmentation behavior
**Avoids:** Rate limit cascade (Pitfall 12) — verify each provider has independent backoff state, not a shared global timer
**Research flag:** Standard patterns — skip `/gsd-research-phase`

---

### Phase 10: Extension System

**Rationale:** Cannot be built until provider and tool registry APIs are stable (Phases 3-4), agent-core `ExtensionLoader` exists (Phase 6), and CLI can load extensions at startup (Phase 8). Dogfooding the extension API by implementing all built-in tools as extension-registered tools validates the API surface before third-party extensions exist.
**Delivers:** Extension loading from config, extension lifecycle management (load/enable/disable/unload), ESLint boundary enforcement verified in CI, built-in tools dogfooded through extension API registration, example extension package
**Avoids:** Extension becomes the product (Pitfall 3), tool API lock-in (Pitfall 11)
**Key constraint:** CI import boundary check must pass with zero violations. If built-in tools need API capabilities the extension API doesn't expose, add them to the API explicitly before closing this phase — never bypass.
**Research flag:** Extension lifecycle management (hot-reload, enable/disable at runtime) has limited prior art in CLI tools — consider `/gsd-research-phase`

---

### Phase 11: Security Hardening and MCP Client

**Rationale:** Prompt injection detection must run at file-read time, before content enters LLM context — retrofitting after the tool layer is substantially harder. MCP is treated as one extension mechanism, complementary to the native extension API.
**Delivers:** Prompt injection detection on file reads (scan content before LLM context insertion, warn on instruction-hijacking patterns); MCP client with OAuth, scoped per project, lazy-loaded; MCP responses flagged as untrusted external content in LLM context
**Avoids:** Prompt injection to RCE (Pitfall 2 — detection at source)
**Research flag:** Prompt injection detection heuristics and MCP client OAuth flow both need verification — use `/gsd-research-phase` for this phase

---

### Phase 12: Validation, Ollama, Plan Mode, Launch Prep

**Rationale:** Final validation phase — add v1.x features requiring full-stack stability, run security red-team, enforce launch standards across all packages.
**Delivers:** Ollama provider (OpenAI-compatible endpoint, add once provider abstraction is proven), architect / plan-then-execute mode, full security audit (prompt injection red-team, credential scrubbing verification, filesystem containment boundary test), coverage threshold enforcement across all packages, launch checklist
**Research flag:** Ollama uses OpenAI-compatible API — skip `/gsd-research-phase`. Plan mode interaction design may benefit from a quick research pass.

---

### Phase Ordering Rationale

- Phases 1-2 are non-negotiable gates. If build enforcement, lint rules, and test infrastructure are not proven solid before product code lands, the entire rebuild thesis fails. No exceptions to this order.
- Phases 3-5 follow DAG level order strictly — no Level 3 code before Level 2 APIs are stable and tested.
- Phase 6 (agent-core) requires all Level 2 packages to have real, enforced, tested APIs — not stubs.
- Phase 7 (TUI) is delayed until agent-core exists so it can wire to real event streams, not mocked ones.
- Phase 8 (CLI) is the integration layer and must follow both TUI and agent-core.
- Phase 9 (multi-provider) builds on the proven single-provider architecture from Phase 3.
- Phase 10 (extensions) requires stable provider and tool APIs. Building extensions before APIs are stable is the exact upstream failure mode.
- Phase 11 (security + MCP) comes after the full stack is wired — prompt injection detection requires a stable file read tool and real context assembly pipeline.

### Research Flags

**Needs `/gsd-research-phase` during planning:**
- **Phase 5 (Native Crate):** napi-rs v3 Turborepo integration has limited examples; Rust cross-compilation CI setup needs verification
- **Phase 6 (Agent Core):** Context compaction strategy tradeoffs — empirical scores (2.19-2.45/5.0 on artifact tracking across compaction boundaries) suggest deliberate design is warranted
- **Phase 10 (Extension System):** Extension lifecycle management (hot-reload, enable/disable at runtime) has no clear prior art in CLI tools
- **Phase 11 (Security + MCP):** Prompt injection detection heuristics; MCP client OAuth flow

**Standard patterns — skip `/gsd-research-phase`:**
- **Phase 1 (Foundation):** pnpm + Turborepo + Vitest + ESLint are well-documented with established patterns
- **Phase 2 (Types + Config + Extension API Shell):** Zod schemas and types-only package design are standard
- **Phase 3 (Provider Layer):** Anthropic SDK streaming is well-documented; streaming buffer pattern is documented
- **Phase 4 (Tool System):** Tool registry and sandbox patterns are standard; bash tool security is well-documented
- **Phase 7 (TUI):** Ink v7 patterns documented; Claude Code and Gemini CLI serve as reference implementations
- **Phase 8 (CLI):** Commander.js subcommand wiring is standard
- **Phase 9 (Multi-Provider):** Provider adapter pattern proven in Phase 3; each SDK has official docs

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified against npm registry 2026-04-15; official docs consulted for all SDKs |
| Features | MEDIUM-HIGH | Competitor features from official docs; Cauldron-specific decisions from PROJECT.md and audit |
| Architecture | HIGH | Agent loop, provider layer, extension isolation: HIGH. TUI slot-based widget API: MEDIUM (less prior art) |
| Pitfalls | HIGH | Drawn from empirical bug studies, CVE disclosures, production post-mortems, and direct GSD-2 audit findings |

**Overall confidence:** HIGH

### Gaps to Address

- **Context compaction implementation:** Artifact tracking scores of 2.19-2.45/5.0 across compaction strategies suggest no clear winner. Evaluate options during Phase 6 planning with a dedicated research pass.
- **Extension hot-reload:** No direct prior art for CLI extension hot-reload. Evaluate feasibility before committing to a Phase 10 deliverable.
- **Prompt injection detection heuristics:** The approach (scan file content before LLM context insertion) is correct; the specific detection heuristics need validation. Red-teaming during Phase 11 is the validation mechanism.
- **TUI widget extension serialization:** Restricting extension widgets to serializable string output (not JSX) simplifies isolation but limits capability. Validate this tradeoff with real use cases before Phase 10.
- **Vercel AI SDK interface shape:** ARCHITECTURE.md references the `LanguageModelV4` interface shape as a model for the internal `LanguageModelProvider` interface. Take the interface pattern, not the dependency. Confirm the interface shape from official Vercel AI SDK docs when implementing Phase 3.

## Sources

### Primary (HIGH confidence)
- npm registry, verified 2026-04-15 — all package versions
- Context7 `/anthropics/anthropic-sdk-typescript` — streaming, tool use API shape
- Context7 `/vercel/turborepo` — boundaries configuration, tag rules
- Context7 `/napi-rs/website` — v3 build API, cross-compilation
- Context7 `/vitest-dev/vitest` — v4.x API, vi.mock
- `audit/` directory — four independent AI audits of GSD-2 upstream architecture
- [NAPI-RS changelog](https://napi.rs/changelog/napi-cli) — v3.6.2 stable
- [Ink GitHub releases](https://github.com/vadimdemedes/ink/releases) — v7.0.0 requirements
- [Google genai GA announcement](https://ai.google.dev/gemini-api/docs/libraries) — @google/genai GA status
- [Claude Code Permissions Documentation](https://code.claude.com/docs/en/permissions)
- [Codex CLI Features Documentation](https://developers.openai.com/codex/cli/features)
- [Gemini CLI GitHub](https://github.com/google-gemini/gemini-cli)
- [VS Code extension host isolation](https://code.visualstudio.com/api/advanced-topics/extension-host)
- [Prompt Injection to RCE — Trail of Bits](https://blog.trailofbits.com/2025/10/22/prompt-injection-to-rce-in-ai-agents/)
- [CVE-2025-59536 — Claude Code credential exfiltration](https://research.checkpoint.com/2026/rce-and-api-token-exfiltration-through-claude-code-project-files-cve-2025-59536/)

### Secondary (MEDIUM confidence)
- [Engineering Pitfalls in AI Coding Tools — arXiv 2603.20847](https://arxiv.org/html/2603.20847) — 3,864 bugs analyzed; 37.6% in tool/API orchestration
- [Solving Context Window Overflow — arXiv 2511.22729](https://arxiv.org/html/2511.22729v1) — compaction artifact tracking scores
- [Detecting Silent Failures in Multi-Agentic AI Trajectories — arXiv 2511.04032](https://arxiv.org/pdf/2511.04032) — error propagation as reliability bottleneck
- [Inside the Scaffold: Coding Agent Architectures — arXiv 2604.03515](https://arxiv.org/html/2604.03515) — agent loop taxonomy
- [Claude Code architecture analysis](https://dev.to/brooks_wilson_36fbefbbae4/claude-code-architecture-explained-agent-loop-tool-system-and-permission-model-rust-rewrite-41b2)
- [Claude Code tech stack — Pragmatic Engineer](https://newsletter.pragmaticengineer.com/p/how-claude-code-is-built)
- [Vercel AI SDK 6 positioning](https://vercel.com/blog/ai-sdk-6) — why it does not fit CLI-first use
- [vm2 CVE January 2026](https://www.endorlabs.com/learn/cve-2026-22709-critical-sandbox-escape-in-vm2-enables-arbitrary-code-execution)
- [GitGuardian 2025 — 29M leaked secrets from AI agents](https://www.helpnetsecurity.com/2026/04/14/gitguardian-ai-agents-credentials-leak/)
- [Terminal AI Coding Agents Compared 2026 — Effloow](https://effloow.com/articles/terminal-ai-coding-agents-compared-claude-code-gemini-cli-2026)

---
*Research completed: 2026-04-15*
*Ready for roadmap: yes*
