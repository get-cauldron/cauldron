# Cauldron

## What This Is

A clean AI coding CLI with a well-designed extension system, forked from GSD-2 and rebuilt from the ground up. Cauldron keeps the core value of GSD-2 — a multi-provider AI coding agent with TUI — but rewrites the foundation with real package boundaries, honest builds, and first-class testing. The Pi SDK packages serve as reference, not as vendored dependencies.

## Core Value

Every boundary is real, every test is honest, and the extension system prevents extensions from collapsing into the core.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Clean package architecture with enforced public APIs (`@get-cauldron/*` scope)
- [ ] Filesystem containment — tools cannot read/write outside project root
- [ ] Prompt injection detection on file reads entering LLM context
- [ ] Honest build system — one repo-wide typecheck, no `ignoreBuildErrors`, no loader magic
- [ ] Agent session management (rewritten from pi-coding-agent reference)
- [ ] Tool system with sandboxed execution (read, write, edit, grep, find, bash)
- [ ] Multi-provider LLM integration (Anthropic, OpenAI, Google, Mistral, etc.)
- [ ] TUI with clean rendering pipeline (rewritten from pi-tui reference)
- [ ] Extension API for tools, providers, and UI widgets — with isolation boundaries
- [ ] Extension lifecycle management (load, enable, disable, unload)
- [ ] Testing cube: mocked unit + live integration for every module, against real artifacts
- [ ] Coverage thresholds that mean something (80/80/60/60 minimum)
- [ ] Core entry points tested (CLI, headless, onboarding equivalents)
- [ ] Single identity: Cauldron, `@get-cauldron/*`, no legacy Pi/GSD references
- [ ] Rust native crates for hot paths (grep, AST parsing, search)
- [ ] Zero circular dependencies — enforced by CI
- [ ] No god files — enforced max complexity per module
- [ ] Clean dependency declarations — each package declares what it uses

### Out of Scope

- Workflow/project management extensions (GSD orchestration system) — complexity doesn't earn its place in v1
- Web UI — CLI-first, web can earn its way back later
- VS Code extension — same, earn it back
- Studio (Electron app) — dead upstream, stays dead
- Daemon — zombie upstream, not resurrecting
- Marketplace/plugin distribution — extension system first, marketplace later
- Crypto token badge — no
- Multiple documentation systems — one system, one source of truth
- Backward compatibility with GSD-2/Pi configs or data — clean break

## Context

Cauldron is forked from GSD-2, a ~470K-line TypeScript monorepo that vendors the Pi SDK. Four independent audits (Claude, Codex, Mistral, Gemini) converge on the same diagnosis: the architecture has collapsed. Package boundaries are fictional, the "extension" is the product (303 files, ~88K lines), 99 circular dependencies, god files exceeding 3,000-4,000 lines, and a build system that suppresses type errors and compensates for broken boundaries with loader hacks.

The product works — 6,381 tests pass, users exist, features are real. The foundation is what failed. Cauldron keeps the product vision and rewrites the foundation.

**What's worth studying from upstream:**
- Agent session management patterns (agent-session.ts — the logic, not the 2,952-line god class)
- Provider integration approach (25 provider files, well-structured individually)
- Tool implementations (read, write, edit, grep — solid per-tool, bad containment)
- TUI rendering approach (pi-tui — 37 files, reasonable size)
- Integration test patterns (real git repos, RPC testing, actual flows)
- CI pipeline structure (3-stage, cross-platform, smart change detection)
- Credential handling (auth-storage.ts — chmod 0o600, file locking, allowlisted commands)
- Conventional commits enforcement

**What to avoid from upstream:**
- Extension-as-product pattern (303 files in one extension slot)
- Fictional package boundaries (raw `src` imports across packages)
- Build hacks (`ignoreBuildErrors`, source/dist fallback loaders, runtime self-repair)
- God files (gsd-db.ts 3,238 lines, interactive-mode.ts 4,083 lines)
- Mutable singletons (8 in gsd-db.ts alone)
- Synthetic test pipeline (custom dist-test rewrites instead of real artifacts)
- Identity fragmentation (6 names, 4 npm scopes)
- Silent error swallowing (231+ instances in production)
- Side-effect-heavy installs (binary downloads, browser installs, workspace rebuilds)

**Audit documents:** `audit/` directory contains the full findings from all four AI perspectives.

## Constraints

- **Tech stack**: TypeScript monorepo + Rust for performance-critical native crates
- **npm scope**: `@get-cauldron/*` (org already claimed)
- **GitHub org**: get-cauldron (already exists)
- **Team**: Solo developer + AI assistance — architecture must support AI-driven refactoring
- **Testing**: Every module ships with tests. Nothing merges without coverage. Mocked + live layers. Tests run against real artifacts, not synthetic rewrites.
- **Boundaries**: Enforced at build time, not by convention. Circular dependency = CI failure.
- **Complexity**: No file exceeds reasonable limits. No function accumulates unbounded conditionals.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Fork GSD-2, don't start from scratch | Product works, test patterns are real, provider integrations are solid. The architecture failed, not the features. | -- Pending |
| Rewrite Pi SDK core, don't just rename | The vendored packages carry upstream's architectural debt. Rewriting with clean boundaries is cheaper than untangling. | -- Pending |
| TypeScript + Rust, not full Rust/Go | LLM API latency dominates. TS has the best LLM SDK ecosystem. Rust for hot paths only (grep, AST, search). Solo velocity matters. | -- Pending |
| No workflow extensions in v1 | The 88K-line GSD mega-extension was the source of most audit findings. Workflows are a feature, not a platform concern. | -- Pending |
| Extension API: tools, providers, UI widgets | These are the extension points that map to real user needs without risking the "extension becomes the product" collapse. | -- Pending |
| Test-alongside, not TDD | Every module ships with tests. Mocked unit + live integration. But tests don't need to come before code — they come with it. | -- Pending |
| Gut renovation approach | Fix it right. Define target architecture, then systematically rebuild. No half-measures, no "shore up and hope." | -- Pending |
| Triage dead code individually | Don't blindly cut — some "dead" pieces may have value as reference or partial implementations. But default to cut. | -- Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-15 after initialization*
