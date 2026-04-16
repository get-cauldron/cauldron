# Requirements: Cauldron

**Defined:** 2026-04-15
**Core Value:** Every boundary is real, every test is honest, and the extension system prevents extensions from collapsing into the core.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Foundation

- [x] **FOUND-01**: Monorepo uses pnpm + Turborepo with workspace boundary enforcement
- [x] **FOUND-02**: Zero circular dependencies enforced in CI (madge or equivalent)
- [x] **FOUND-03**: Repo-wide TypeScript typecheck with no suppression flags or ignoreBuildErrors
- [x] **FOUND-04**: All tests run against real build artifacts, not synthetic rewrites
- [x] **FOUND-05**: Vitest test infrastructure with mocked + live test layers
- [x] **FOUND-06**: Fixture recording/replay system for deterministic LLM response testing
- [x] **FOUND-07**: Coverage thresholds enforced: 80/80/60/60 minimum (statements/lines/branches/functions)
- [x] **FOUND-08**: CI pipeline: typecheck, boundary enforcement, test cube, cross-platform (macOS/Linux)

### Core Agent

- [ ] **AGENT-01**: ReAct agent loop (message -> tool calls -> parallel execution -> response -> repeat)
- [ ] **AGENT-02**: Provider abstraction with thin interface (doGenerate + doStream)
- [ ] **AGENT-03**: Anthropic provider integration with streaming support
- [ ] **AGENT-04**: OpenAI provider integration with streaming support
- [ ] **AGENT-05**: Google provider integration with streaming support
- [ ] **AGENT-06**: Mistral provider integration with streaming support
- [ ] **AGENT-07**: Session persistence (save/resume conversations across CLI invocations)
- [ ] **AGENT-08**: Session history (list and select previous sessions)
- [ ] **AGENT-09**: Conversation context management with token tracking
- [ ] **AGENT-10**: Context compaction strategy for long conversations

### Tool System

- [ ] **TOOL-01**: File read tool with filesystem containment (project root jail)
- [ ] **TOOL-02**: File write tool with filesystem containment
- [ ] **TOOL-03**: File edit tool with filesystem containment
- [ ] **TOOL-04**: Grep tool with Rust-native hot path
- [ ] **TOOL-05**: Glob/find tool with Rust-native hot path
- [ ] **TOOL-06**: Bash tool with sandboxing and permission prompts
- [ ] **TOOL-07**: Tool execution reports results back to agent loop
- [ ] **TOOL-08**: MCP client for external tool integration

### Security

- [ ] **SEC-01**: Path containment validates resolved paths stay within project root
- [ ] **SEC-02**: Symlink-safe path resolution (no symlink escape from project jail)
- [ ] **SEC-03**: Prompt injection detection on file content entering LLM context
- [ ] **SEC-04**: Permission system for destructive/sensitive operations (user approval)
- [ ] **SEC-05**: Credential storage with appropriate file permissions (chmod 0o600)
- [ ] **SEC-06**: No secrets leak into LLM context
- [ ] **SEC-07**: Bash tool uses argument arrays, not string interpolation

### TUI

- [ ] **TUI-01**: Ink v7 rendering pipeline with streaming token display
- [ ] **TUI-02**: Syntax highlighting for code blocks
- [ ] **TUI-03**: Diff display for file changes
- [ ] **TUI-04**: Terminal capability detection with graceful degradation
- [ ] **TUI-05**: Resize handling
- [ ] **TUI-06**: Widget slots for extension-provided UI components

### Extension System

- [ ] **EXT-01**: Extension API with descriptor-based contracts (types-only package)
- [ ] **EXT-02**: Extension types: tool, provider, UI widget
- [ ] **EXT-03**: Worker thread isolation for extensions
- [ ] **EXT-04**: Extension lifecycle: load, enable, disable, unload with clean teardown
- [ ] **EXT-05**: Built-in tools consume the extension API (dogfooding the boundary)
- [ ] **EXT-06**: CI enforcement: extension packages cannot import core packages

### Identity

- [x] **ID-01**: All packages use @get-cauldron/* npm scope
- [x] **ID-02**: No Pi or GSD references in source code, configs, or documentation
- [x] **ID-03**: Single documentation system

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### TUI Enhancements

- **TUI-V2-01**: Configurable color themes and styling
- **TUI-V2-02**: Custom keybinding configuration

### Agent Enhancements

- **AGENT-V2-01**: Session branching/forking
- **AGENT-V2-02**: Ollama/local model provider
- **AGENT-V2-03**: Plan mode (think before acting)

### Platform

- **PLAT-V2-01**: Web UI surface
- **PLAT-V2-02**: VS Code extension
- **PLAT-V2-03**: Extension marketplace/distribution

### Workflow

- **WF-V2-01**: Workflow/project management extensions
- **WF-V2-02**: Automated task orchestration

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| GSD workflow orchestration | Complexity that collapsed upstream architecture. Earn it back in v2+. |
| Web UI | CLI-first. Web earns its way back after CLI is solid. |
| VS Code extension | Same — earn it back. |
| Studio (Electron app) | Dead upstream, stays dead. |
| Daemon process | Zombie upstream, not resurrecting. |
| Extension marketplace | Extension system first, distribution later. |
| Crypto token integration | No. |
| Multiple doc systems | One system, one source of truth. |
| Pi/GSD backward compat | Clean break. No config migration, no data migration. |
| Codebase indexing/RAG | Research confirms agentic search beats RAG for this use case. |
| Real-time collaboration | Not a multi-user tool. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | Complete |
| FOUND-02 | Phase 1 | Complete |
| FOUND-03 | Phase 1 | Complete |
| FOUND-04 | Phase 1 | Complete |
| FOUND-05 | Phase 1 | Complete |
| FOUND-06 | Phase 1 | Complete |
| FOUND-07 | Phase 1 | Complete |
| FOUND-08 | Phase 1 | Complete |
| ID-01 | Phase 1 | Complete |
| ID-02 | Phase 1 | Complete |
| ID-03 | Phase 1 | Complete |
| EXT-01 | Phase 2 | Pending |
| EXT-02 | Phase 2 | Pending |
| AGENT-02 | Phase 3 | Pending |
| AGENT-03 | Phase 3 | Pending |
| TOOL-01 | Phase 4 | Pending |
| TOOL-02 | Phase 4 | Pending |
| TOOL-03 | Phase 4 | Pending |
| TOOL-06 | Phase 4 | Pending |
| TOOL-07 | Phase 4 | Pending |
| SEC-01 | Phase 4 | Pending |
| SEC-02 | Phase 4 | Pending |
| SEC-04 | Phase 4 | Pending |
| SEC-07 | Phase 4 | Pending |
| TOOL-04 | Phase 5 | Pending |
| TOOL-05 | Phase 5 | Pending |
| AGENT-01 | Phase 6 | Pending |
| AGENT-07 | Phase 6 | Pending |
| AGENT-08 | Phase 6 | Pending |
| AGENT-09 | Phase 6 | Pending |
| AGENT-10 | Phase 6 | Pending |
| TUI-01 | Phase 7 | Pending |
| TUI-02 | Phase 7 | Pending |
| TUI-03 | Phase 7 | Pending |
| TUI-04 | Phase 7 | Pending |
| TUI-05 | Phase 7 | Pending |
| TUI-06 | Phase 7 | Pending |
| SEC-05 | Phase 8 | Pending |
| SEC-06 | Phase 8 | Pending |
| AGENT-04 | Phase 9 | Pending |
| AGENT-05 | Phase 9 | Pending |
| AGENT-06 | Phase 9 | Pending |
| EXT-03 | Phase 10 | Pending |
| EXT-04 | Phase 10 | Pending |
| EXT-05 | Phase 10 | Pending |
| EXT-06 | Phase 10 | Pending |
| SEC-03 | Phase 11 | Pending |
| TOOL-08 | Phase 11 | Pending |

**Coverage:**
- v1 requirements: 48 total
- Mapped to phases: 48
- Unmapped: 0

---
*Requirements defined: 2026-04-15*
*Last updated: 2026-04-15 after roadmap creation — traceability populated, count corrected (was 43, actual 48)*
