# Stack Research

**Domain:** AI coding CLI tool (multi-provider, TUI, extension system, Rust hot paths)
**Researched:** 2026-04-15
**Confidence:** HIGH (all versions verified against npm registry and official sources)

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| TypeScript | 5.7+ | Primary language | Best LLM SDK ecosystem, model knows it well (Claude Code, Gemini CLI both chose TS for this reason), strictest type safety |
| Node.js | 22 LTS | Runtime | Required by Ink v7; LTS stability, native ESM, worker threads for extension isolation |
| pnpm | 10.x | Package manager | Workspace protocol, symlink store saves disk, strictest dependency isolation by default, fastest for monorepos |
| Turborepo | 2.9.6 | Monorepo build orchestration | Rust-written, up to 96% faster than raw tsc pipelines, task graph, remote caching; experimental `boundaries` feature for import enforcement |
| Ink | 7.0.0 | TUI framework | React renderer for terminal — Claude Code, Gemini CLI, and virtually every 2025/2026 AI CLI uses this. `<Static>` component handles streaming token output cleanly. Requires Node 22 + React 19.2+ |
| napi-rs | 3.6.2 | Rust/Node FFI | Dominant in 2025/2026. Used by Biome, Rolldown, SWC, Rspack. No node-gyp, cross-platform prebuilts, pnpm workspace compatible |

### LLM SDK Layer

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| @anthropic-ai/sdk | 0.89.0 | Anthropic / Claude | Official SDK, streaming via async iterator, tool use, toolRunner helper for agentic loops |
| openai | 6.34.0 | OpenAI + OpenAI-compatible | Official SDK; also covers any provider with OpenAI-compatible endpoints (Groq, Together, etc.) |
| @google/genai | 1.50.1 | Gemini (GA since May 2025) | Replaced `@google/generative-ai`; GA, supports streaming via `generateContentStream`, covers both Gemini API and Vertex AI |
| @mistralai/mistralai | 2.2.0 | Mistral | Official TS SDK v2; ESM-only, async-iterable streaming |

**Do not use Vercel AI SDK as the provider abstraction.** It adds real value for React/Next.js UI streaming hooks, but for a CLI-first multi-provider agent with its own per-provider file architecture, direct SDKs with a thin internal `Provider` interface is cleaner and avoids a dependency that ships breaking changes frequently. The upstream GSD-2's approach of 25 per-provider files is the right pattern — keep it.

### Build Tooling

| Tool | Purpose | Notes |
|------|---------|-------|
| tsup | Per-package bundling | Wraps esbuild. ESM + CJS dual output, type declaration generation. Use for publishable `@get-cauldron/*` packages. **Note:** tsdown is a faster successor but too new for a greenfield with stability requirements — re-evaluate at v1.0 |
| tsc | Project-wide type checking | Single repo-wide `tsc --build` with project references for the "honest build" constraint. Do NOT use `isolatedModules`-only. One typecheck rules them all. |
| Turborepo `boundaries` | Import boundary enforcement | Experimental in Turborepo 2.3+, stable enough to run in CI. Catches: files imported outside package dir, packages imported not in `package.json`. Supplement with `eslint-plugin-import` for cross-layer rules. |
| eslint-plugin-import / eslint-import-resolver-typescript | Circular dependency CI enforcement | `import/no-cycle` rule. Run in CI. Zero circular deps is a hard requirement from PROJECT.md. |
| @napi-rs/cli | Rust crate build + cross-compile | `napi build` inside Rust packages, `napi prepublish` for platform prebuilts. Integrates into Turborepo task graph. |
| @changesets/cli | Monorepo version management | Standard tool for versioning and changelogs across `@get-cauldron/*` packages. Works natively with pnpm workspaces. |

### Test Framework

| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| Vitest | 4.1.4 | Unit + integration testing | Native ESM, TypeScript first, `vi.mock()` for provider mocking. Fastest runner for TS monorepos in 2025/2026. |
| vitest-evals | latest | LLM eval assertions | Thin wrapper adding eval-style assertions for LLM output (structure checks, not content checks) |
| @vitest/coverage-v8 | Match Vitest version | Coverage reporting | V8 coverage; thresholds enforced in CI per PROJECT.md (80/80/60/60) |

**Testing LLM agent behavior — the right pattern:**
- Unit layer: Mock provider at the `Provider` interface boundary. Test tool handler logic, input validation, session state transitions. `vi.mock()` the API client module. Never assert on generated text — assert on structure (tool call made, message role, error type).
- Integration layer: Use recorded response fixtures (save real API responses as JSON, replay them). Never make live API calls in CI. Gate live tests behind `--run-live` flag with environment variable guard.
- Eval layer (separate from CI): Use `vitest-evals` or promptfoo for non-deterministic quality assertions. Run nightly, not on every PR.

### CLI Framework

| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| Commander.js | 14.0.3 | Argument parsing, subcommands | Most widely used, zero dependencies, TypeScript-first in v12+. Handles `cauldron chat`, `cauldron agent`, `cauldron config` subcommand tree cleanly. |

**Do not use yargs.** Heavier, more magic, harder to tree-shake. Clipanion is good but primarily designed for Yarn's internal use — Commander is more widely understood by AI assistants helping to refactor.

### Extension System

| Approach | Rationale |
|----------|-----------|
| Worker threads (Node.js built-in) | Extensions run in worker thread pools. Extension code cannot access core process memory. Communication via `MessageChannel`. This is the architecture that prevents the "extension becomes the product" collapse from upstream. |
| Dynamic `import()` with explicit capability manifest | Extensions declare what APIs they need at load time. Core grants only declared capabilities. No ambient access. |
| No `vm2` or `isolated-vm` for extension isolation | These are for running truly untrusted, arbitrary third-party code. For a curated extension system, worker threads provide sufficient isolation without the native binary overhead and security vulnerability surface that vm2/isolated-vm carry. vm2 had another critical CVE in January 2026. |

### Streaming / SSE

All official LLM SDKs handle SSE/streaming natively as `AsyncIterator`. No separate streaming library needed. The pattern:

```typescript
for await (const chunk of stream) {
  // push token to Ink component state
}
```

Use Ink's `<Static>` component for the already-rendered lines, mutable state for the current streaming token. This is how Claude Code handles it.

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | 3.x | Schema validation | Provider interface contracts, extension manifest validation, tool input schemas. Already a transitive dep via `@anthropic-ai/sdk`'s `betaZodTool` helper — make it explicit. |
| react | ^19.2 | Required by Ink v7 | Peer dependency of Ink. Use 19.2+ specifically, not just 19. |

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| Ink v7 | Blessed / neo-blessed | Blessed is effectively dead (last commit 2019). Neo-blessed has marginal maintenance. Ink is what Claude Code, Gemini CLI use. |
| Ink v7 | Raw ANSI / chalk + custom renderer | Valid for simple CLIs. For a multi-pane TUI with streaming, component model pays off. React's reconciler handles partial re-renders efficiently. |
| Turborepo | Nx | Nx wins at 30+ packages with complex cross-domain imports (deeper project graph analysis). At the expected package count for Cauldron (~10-15 packages), Turborepo's simpler config and Vercel's active release cadence win. Re-evaluate if the repo grows past 25 packages. |
| pnpm workspaces | npm workspaces | npm workspaces works but pnpm's strict default (no phantom dependencies) is essential for enforcing declared boundaries. npm workspaces allows hoisted phantom imports which undermines the boundary enforcement goal. |
| Direct LLM SDKs + thin Provider interface | Vercel AI SDK | Vercel AI SDK is optimized for React streaming UI (useChat, useCompletion hooks). These are useless in a CLI context. The unified provider abstraction is what you're building internally anyway. Dependency adds ~200KB and ships breaking majors. |
| napi-rs | Neon | napi-rs has become the ecosystem standard. Used by Biome, Rolldown, SWC. Better cross-platform prebuilt story, official CI templates, active development (v3.6.2 released April 15, 2026). Neon is solid but smaller ecosystem. |
| Commander.js | Clipanion | Clipanion is purpose-built for Yarn; less training data for AI-assisted development. Commander is the default choice AI models know best. |
| Vitest | Jest | Jest is CommonJS-first with heavy transform overhead for ESM/TS monorepos. Vitest is native ESM, same API surface, 10-40x faster cold starts. No reason to use Jest for a greenfield TS project in 2026. |
| Worker threads | isolated-vm | isolated-vm is for running arbitrary untrusted third-party code. Overkill for a curated extension system, adds a native binary dependency. Use worker threads. |
| tsup | tsdown | tsdown is faster and better at type generation, but still maturing. tsup is battle-tested for monorepo library publishing. Re-evaluate at v1.0 milestone. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `ignoreBuildErrors` in tsconfig/next.config | The root cause of upstream GSD-2's build debt. Suppresses real errors. | Fix the errors. Run `tsc --noEmit` in CI, fail hard. |
| Source/dist fallback loader hacks | Runtime self-repair of broken package boundaries. Masks the real problem. | Real package references via pnpm `workspace:*` and proper `exports` fields. |
| God files (>500 lines) | upstream `interactive-mode.ts` was 4,083 lines. Single-responsibility per file. | Enforced by ESLint `max-lines` rule in CI. |
| Mutable module-level singletons | Upstream had 8 in gsd-db.ts. Untestable, causes test pollution. | Dependency injection; factory functions; context passed explicitly. |
| `vm2` | Had multiple critical RCE CVEs including January 2026 sandbox escape. | Worker threads for extension isolation. |
| `@google/generative-ai` | Deprecated in favor of `@google/genai` (GA since May 2025) | `@google/genai` ^1.50.1 |
| Blessed / neo-blessed | Effectively unmaintained. API is imperative, no component model, no streaming story. | Ink v7 |
| LangChain for provider abstraction | 3MB+ bundle, complex abstraction over what is a straightforward API call, frequent breaking changes. | Direct SDKs + thin internal `Provider` interface |

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| ink@7.0.0 | react@^19.2, Node.js 22+ | Breaking: requires Node 22. Specify react@^19.2 not just react@19. |
| @napi-rs/cli@3.6.2 | napi@3.x, Rust stable | v3 migration guide available; v2→v3 has breaking CLI changes |
| vitest@4.1.4 | vite@6+, Node.js 20.18+ | v4 requires Vite 6 as peer. Check each package's vite version. |
| turbo@2.9.6 | pnpm 9+, Node.js 18+ | `boundaries` feature is experimental; stable enough for CI enforcement |
| openai@6.34.0 | Node.js 18+ | v6 is a major — check migration guide from v4/v5 if forking upstream code that used older SDK |
| @anthropic-ai/sdk@0.89.0 | Node.js 18+ | Tool use + streaming stable in current version |

---

## Monorepo Package Layout (Recommended)

```
packages/
  core/           @get-cauldron/core         — session, agent loop, tool executor
  providers/      @get-cauldron/providers    — per-provider adapters + Provider interface
  tools/          @get-cauldron/tools        — file system tools (read, write, grep, bash)
  tui/            @get-cauldron/tui          — Ink components, rendering pipeline
  extension-api/  @get-cauldron/extension-api — public extension contracts (no core internals)
  cli/            @get-cauldron/cli          — Commander entrypoint, wires everything
  native/         @get-cauldron/native       — napi-rs Rust crate (grep, AST, search)
apps/
  cauldron/       — top-level CLI binary (thin wrapper over @get-cauldron/cli)
```

**Key constraint:** `extension-api` can import nothing from `core`. Extensions import from `extension-api` only. Enforced via Turborepo `boundaries` tags + `eslint-plugin-import` no-restricted-imports.

---

## Installation

```bash
# Package manager
npm install -g pnpm@10

# Turborepo (devDependency at root)
pnpm add -D turbo@2.9.6

# Per package — Core / Providers
pnpm add @anthropic-ai/sdk openai @google/genai @mistralai/mistralai zod

# TUI package (react@^19.2 required — not just 19)
pnpm add ink@7.0.0 react@^19.2 react-dom@^19.2

# CLI package
pnpm add commander@14

# Testing (devDependencies, root or per-package)
pnpm add -D vitest@4 @vitest/coverage-v8 vitest-evals

# Build tooling (devDependencies at root)
pnpm add -D tsup typescript eslint eslint-plugin-import @changesets/cli

# Rust/Node FFI (in native/ package only)
pnpm add -D @napi-rs/cli@3.6.2
# + in Cargo.toml: napi = "3"
```

---

## Sources

- npm registry (verified 2026-04-15): turbo@2.9.6, ink@7.0.0, @napi-rs/cli@3.6.2, vitest@4.1.4, @anthropic-ai/sdk@0.89.0, openai@6.34.0, @google/genai@1.50.1, @mistralai/mistralai@2.2.0, commander@14.0.3
- [Turborepo blog (2.9 release)](https://turborepo.dev/blog) — verified latest version and boundaries feature status (HIGH confidence)
- [Turborepo boundaries docs](https://turborepo.dev/docs/reference/boundaries) — boundaries experimental status, tag-based enforcement (HIGH confidence)
- [NAPI-RS changelog](https://napi.rs/changelog/napi-cli) — v3.6.2 stable, April 2026 (HIGH confidence)
- [Ink GitHub releases](https://github.com/vadimdemedes/ink/releases) — v7.0.0 released April 8, 2024, Node 22 + React 19.2 requirement (HIGH confidence)
- Context7 `/anthropics/anthropic-sdk-typescript` — streaming, tool use API shape (HIGH confidence)
- Context7 `/vercel/turborepo` — boundaries configuration and tag rules (HIGH confidence)
- Context7 `/napi-rs/website` — programmatic build API, v3 features (HIGH confidence)
- Context7 `/vitest-dev/vitest` — vi.mock, version 4.x (HIGH confidence)
- [Claude Code tech stack analysis](https://newsletter.pragmaticengineer.com/p/how-claude-code-is-built) — TypeScript + React + Ink confirmation (MEDIUM confidence, secondary source)
- [Ink + AI CLI streaming pattern](https://ivanleo.com/blog/migrating-to-react-ink) — Static component for streaming (MEDIUM confidence)
- [Vercel AI SDK 6](https://vercel.com/blog/ai-sdk-6) — SDK positioning, why it doesn't fit CLI-first use (MEDIUM confidence)
- [Google genai GA announcement](https://ai.google.dev/gemini-api/docs/libraries) — @google/genai GA status (HIGH confidence)
- [vm2 CVE 2026](https://www.endorlabs.com/learn/cve-2026-22709-critical-sandbox-escape-in-vm2-enables-arbitrary-code-execution) — vm2 sandbox escape CVE January 2026 (MEDIUM confidence)
- [tsdown vs tsup comparison](https://alan.norbauer.com/articles/tsdown-bundler/) — tsup vs tsdown tradeoffs (MEDIUM confidence)

---

*Stack research for: Cauldron — AI coding CLI tool*
*Researched: 2026-04-15*
