# Roadmap: Cauldron

## Overview

Cauldron is a greenfield rebuild of a collapsed architecture. The upstream product works — 6,381 tests pass, users exist, features are real — but the foundation failed: 99 circular dependencies, fictional package boundaries, and a build system that compensated for broken imports with loader hacks. This roadmap rebuilds the foundation with enforced boundaries, honest builds, and a testing cube that actually means something, then layers product features on top in DAG level order. Every phase delivers a coherent, verifiable capability. Nothing builds on sand.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Monorepo Foundation** - Build system, lint, CI, and test infrastructure proven before any product code lands
- [ ] **Phase 2: Types, Config, and Extension API Shell** - Level 0-1 packages with enforced public APIs and zero runtime deps on core
- [ ] **Phase 3: Provider Layer (Anthropic)** - First streaming provider with correct SSE buffering and the interface all future providers follow
- [ ] **Phase 4: Tool System and Sandbox** - Core tools built-in with filesystem containment and security enforced at the dispatcher
- [ ] **Phase 5: Native Crate** - Rust hot paths for grep and file-walking wired into the tool layer
- [ ] **Phase 6: Agent Core** - ReAct loop, session lifecycle, context compaction, and extension loader — no mutable singletons
- [ ] **Phase 7: TUI** - Ink v7 rendering pipeline with streaming display, diff preview, and terminal capability detection
- [ ] **Phase 8: CLI Integration** - Commander entry point, mode wiring, credential management, session resume, and permission callbacks
- [ ] **Phase 9: Multi-Provider Expansion** - OpenAI, Google, and Mistral adapters proving the provider abstraction generalizes
- [ ] **Phase 10: Extension System** - Lifecycle management, ESLint boundary enforcement in CI, and built-in tools dogfooded through extension API
- [ ] **Phase 11: Security Hardening and MCP Client** - Prompt injection detection at file-read time and MCP client as one extension mechanism

## Phase Details

### Phase 1: Monorepo Foundation
**Goal**: The build system, lint rules, and test infrastructure are provably correct before any product code exists
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05, FOUND-06, FOUND-07, FOUND-08, ID-01, ID-02, ID-03
**Success Criteria** (what must be TRUE):
  1. `turbo build` runs and caches correctly across all package stubs
  2. Circular deps detected and CI fails on introduction
  3. Boundary-crossing imports fail lint rule
  4. Each package stub has a vitest test importing by package name
  5. TypeScript project references wired for `tsc --build`
**Plans:** 3 plans
Plans:
- [ ] 01-01-PLAN.md — Fresh repo creation, root build tooling, 9 package stubs with dependency DAG
- [ ] 01-02-PLAN.md — Vitest test infrastructure, coverage thresholds, dependency-cruiser boundary enforcement
- [ ] 01-03-PLAN.md — GitHub Actions CI workflow, fixture recording/replay infrastructure

### Phase 2: Types, Config, and Extension API Shell
**Goal**: Level 0-1 packages exist with enforced public APIs; the extension-api type surface is locked before any extension code exists
**Depends on**: Phase 1
**Requirements**: EXT-01, EXT-02
**Success Criteria** (what must be TRUE):
  1. `@get-cauldron/extension-api` package.json has zero `@get-cauldron/*` dependencies and CI verifies this
  2. A developer can import `CauldronExtension`, `ToolRegistration`, `ProviderRegistration`, and `WidgetRegistration` types from `@get-cauldron/extension-api` with no runtime errors
  3. Config loading validates a well-formed config file and rejects a malformed one with a typed error
**Plans:** 2 plans
Plans:
- [ ] 02-01-PLAN.md — CauldronError type, enriched extension-api contract, CI zero-dep check
- [ ] 02-02-PLAN.md — Config package: Zod schema, JSONC loader, global+project merge, tests

### Phase 3: Provider Layer (Anthropic)
**Goal**: The streaming provider interface is real and correct, with Anthropic as the reference implementation that all future providers follow
**Depends on**: Phase 2
**Requirements**: AGENT-02, AGENT-03
**Success Criteria** (what must be TRUE):
  1. A streamed Anthropic response assembled from character-at-a-time chunks produces the same output as a single-chunk response
  2. The provider registry accepts and retrieves a registered Anthropic provider by name
  3. Exponential backoff with jitter fires on rate-limit responses and does not retry on non-retriable errors
  4. All streaming tests pass using recorded fixtures, not live API calls
**Plans**: TBD

### Phase 4: Tool System and Sandbox
**Goal**: Users can run core tools against files in their project; the sandbox blocks every path escape and the bash tool is safe by construction
**Depends on**: Phase 3
**Requirements**: TOOL-01, TOOL-02, TOOL-03, TOOL-06, TOOL-07, SEC-01, SEC-02, SEC-04, SEC-07
**Success Criteria** (what must be TRUE):
  1. A file read tool call for a path outside the project root returns a containment error, not file contents
  2. A symlink pointing outside the project root is resolved and rejected before any read occurs
  3. The bash tool invoked with an array argument containing `../secrets` does not construct a shell string — the argument is passed verbatim to the subprocess with `--` separator
  4. A destructive tool call (write, bash) prompts for user approval before executing
  5. Tool execution results flow back to the agent loop as typed structured data
**Plans**: TBD

### Phase 5: Native Crate
**Goal**: Rust hot paths for grep and file-walking are wired into the tool layer via napi-rs and the cross-platform CI builds succeed
**Depends on**: Phase 4
**Requirements**: TOOL-04, TOOL-05
**Success Criteria** (what must be TRUE):
  1. `@get-cauldron/native` builds on macOS and Linux in CI without node-gyp
  2. Grep via the native crate returns the same results as the TypeScript stub it replaced, verified by the same test cases
  3. File-walking via the native crate handles symlinks consistently with the containment rules from Phase 4
**Plans**: TBD

### Phase 6: Agent Core
**Goal**: The ReAct loop runs, sessions persist and resume, context compaction triggers before hitting the token limit, and no mutable singletons exist
**Depends on**: Phase 5
**Requirements**: AGENT-01, AGENT-07, AGENT-08, AGENT-09, AGENT-10
**Success Criteria** (what must be TRUE):
  1. A multi-step agent session completes without hitting the token limit by triggering compaction at 70% budget
  2. A session saved to disk and resumed in a new CLI invocation continues the conversation with correct history
  3. `cauldron session list` shows previous sessions and `cauldron session resume <id>` restores one
  4. Tests for session state run in random order with no shared module-level state between test cases
**Plans**: TBD

### Phase 7: TUI
**Goal**: Users can have a streamed conversation with tool output and diff preview in a terminal — across iTerm2, SSH, tmux, and Windows Terminal
**Depends on**: Phase 6
**Requirements**: TUI-01, TUI-02, TUI-03, TUI-04, TUI-05, TUI-06
**Success Criteria** (what must be TRUE):
  1. Streamed token output renders without visual artifacts in iTerm2, SSH, tmux, and Windows Terminal
  2. A file edit produces a readable diff with syntax-highlighted code blocks in the conversation view
  3. Resizing the terminal mid-conversation reflows the layout without corrupting output
  4. In a non-TTY environment (piped output), the TUI degrades gracefully without crashing
  5. An extension-provided UI widget renders in its designated slot without accessing TUI internals
**Plans**: TBD
**UI hint**: yes

### Phase 8: CLI Integration
**Goal**: Users can start Cauldron, load a project, resume sessions, and manage API keys from the command line in interactive or headless mode
**Depends on**: Phase 7
**Requirements**: SEC-05, SEC-06
**Success Criteria** (what must be TRUE):
  1. API keys stored via CLI are written to disk with mode 0600 and never appear in LLM context
  2. A project cloned from an unknown source prompts for trust before loading its AGENTS.md
  3. Cauldron runs in headless/CI mode with `--headless` and exits with a non-zero code on tool failure
  4. `cauldron session resume` without an ID resumes the most recent session
**Plans**: TBD

### Phase 9: Multi-Provider Expansion
**Goal**: OpenAI, Google, and Mistral providers work alongside Anthropic; each has independent backoff state and passes its own streaming fixture tests
**Depends on**: Phase 8
**Requirements**: AGENT-04, AGENT-05, AGENT-06
**Success Criteria** (what must be TRUE):
  1. `--provider openai`, `--provider google`, and `--provider mistral` each complete a multi-turn conversation
  2. Simulating a rate-limit error on one provider does not affect the backoff timer on any other provider
  3. Each provider's streaming behavior is tested with recorded fixtures covering chunk fragmentation
**Plans**: TBD

### Phase 10: Extension System
**Goal**: Extensions load, enable, disable, and unload cleanly; built-in tools are registered through the extension API; CI blocks extension packages from importing core
**Depends on**: Phase 9
**Requirements**: EXT-03, EXT-04, EXT-05, EXT-06
**Success Criteria** (what must be TRUE):
  1. A third-party extension package that imports `@get-cauldron/agent-core` fails the CI boundary check
  2. All built-in tools (read, write, edit, grep, glob, bash) register through the extension API with no direct core imports
  3. An extension enabled, then disabled, then unloaded leaves no registered tools or providers in the registry
  4. An example extension ships and is loadable via config without touching core packages
**Plans**: TBD

### Phase 11: Security Hardening and MCP Client
**Goal**: Prompt injection in files is detected before content enters LLM context; MCP tools are available as one extension mechanism with untrusted-content flagging
**Depends on**: Phase 10
**Requirements**: SEC-03, TOOL-08
**Success Criteria** (what must be TRUE):
  1. A file containing an injected system-prompt pattern triggers a warning before the content is sent to the LLM
  2. A red-team exercise — file content instructs the agent to execute a shell command — is detected and blocked by the injection scanner
  3. An MCP server registered in config provides tools accessible to the agent
  4. MCP tool responses are marked as untrusted external content in the LLM context
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10 -> 11

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Monorepo Foundation | 0/3 | Planning complete | - |
| 2. Types, Config, and Extension API Shell | 0/2 | Planning complete | - |
| 3. Provider Layer (Anthropic) | 0/TBD | Not started | - |
| 4. Tool System and Sandbox | 0/TBD | Not started | - |
| 5. Native Crate | 0/TBD | Not started | - |
| 6. Agent Core | 0/TBD | Not started | - |
| 7. TUI | 0/TBD | Not started | - |
| 8. CLI Integration | 0/TBD | Not started | - |
| 9. Multi-Provider Expansion | 0/TBD | Not started | - |
| 10. Extension System | 0/TBD | Not started | - |
| 11. Security Hardening and MCP Client | 0/TBD | Not started | - |
