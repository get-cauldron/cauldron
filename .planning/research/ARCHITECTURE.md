# Architecture Research

**Domain:** AI coding CLI agent — TypeScript monorepo with Rust hot paths
**Researched:** 2026-04-15
**Confidence:** HIGH (agent loop, provider layer, extension isolation); MEDIUM (TUI patterns, context management)

## Standard Architecture

### System Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                          CLI Entry Layer                            │
│   bin/cauldron  ──►  @get-cauldron/cli  (arg parse, mode select)   │
└──────────────────────────────┬─────────────────────────────────────┘
                               │
┌──────────────────────────────▼─────────────────────────────────────┐
│                        Session / Agent Layer                         │
│   @get-cauldron/agent-core                                          │
│   ┌────────────────┐  ┌──────────────────┐  ┌──────────────────┐   │
│   │  AgentSession  │  │   Agent Loop     │  │ Context Manager  │   │
│   │  (lifecycle)   │  │  (ReAct cycle)   │  │ (token budget)   │   │
│   └───────┬────────┘  └────────┬─────────┘  └────────┬─────────┘   │
└───────────┼────────────────────┼─────────────────────┼─────────────┘
            │                   │                      │
┌───────────▼──────┐  ┌─────────▼──────────┐  ┌───────▼──────────────┐
│  Provider Layer  │  │    Tool System     │  │    TUI Layer         │
│ @get-cauldron/   │  │ @get-cauldron/     │  │ @get-cauldron/tui    │
│ providers        │  │ tools              │  │ (Ink/React renderer) │
│ ┌──────────────┐ │  │ ┌────────────────┐ │  │ ┌──────────────────┐ │
│ │ LLM Registry │ │  │ │ Tool Registry  │ │  │ │ Layout Engine    │ │
│ │ (multi-api)  │ │  │ │ + Sandbox      │ │  │ │ (Yoga/Flexbox)   │ │
│ └──────────────┘ │  │ └────────────────┘ │  │ └──────────────────┘ │
└──────────────────┘  └────────────────────┘  └──────────────────────┘
            │                   │
┌───────────▼───────────────────▼────────────────────────────────────┐
│                         Extension API Layer                          │
│   @get-cauldron/extension-api  (the ONLY import extensions can use) │
│   Types and interfaces ONLY — zero runtime deps on core internals   │
│   ┌──────────────────────────────────────────────────────────────┐  │
│   │  ToolRegistration  |  ProviderRegistration  |  WidgetSlot   │  │
│   └──────────────────────────────────────────────────────────────┘  │
└───────────────────────────┬────────────────────────────────────────┘
                            │ (extensions export descriptors; core consumes)
┌───────────────────────────▼────────────────────────────────────────┐
│                        Extension Packages                            │
│   @get-cauldron/ext-*  (separate npm packages, not in core)         │
│   export default: CauldronExtension (descriptor object, no runtime  │
│   call into core)                                                    │
└────────────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────────────┐
│                         Native Crates (Rust)                         │
│   @get-cauldron/native  (grep, AST parsing, fast search via napi-rs)│
└────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Talks To |
|-----------|---------------|----------|
| `@get-cauldron/cli` | Entry point, arg parsing, mode selection (interactive/headless/onboard) | `agent-core`, `tui` |
| `@get-cauldron/agent-core` | Agent loop, session lifecycle, context management, compaction, extension loading | `providers`, `tools`, `extension-api` |
| `@get-cauldron/providers` | LLM abstraction, streaming, multi-provider registry | `agent-core` only |
| `@get-cauldron/tools` | Built-in tool registry, sandboxed execution, permission enforcement | `agent-core`, `native` |
| `@get-cauldron/tui` | Ink/React rendering pipeline, input handling, layout, permission prompt UI | `agent-core` (events only), `extension-api` (widget slots) |
| `@get-cauldron/extension-api` | Published API surface — types and interfaces only, no runtime core deps | Extensions implement it; agent-core consumes extension descriptors |
| `@get-cauldron/native` | Rust hot paths: grep, AST search, file walking | `tools` only |
| `@get-cauldron/config` | Config loading, schema validation, defaults | `agent-core`, `cli` |
| `@get-cauldron/types` | Shared type definitions — no runtime code | All packages |

## Recommended Package Structure

```
packages/
├── cli/                        # @get-cauldron/cli
│   ├── src/
│   │   ├── commands/           # Subcommands (init, run, config)
│   │   ├── entry.ts            # Main entry point
│   │   └── modes/              # interactive, headless, onboard
│   └── package.json
│
├── agent-core/                 # @get-cauldron/agent-core
│   ├── src/
│   │   ├── session/            # AgentSession, lifecycle, compaction
│   │   ├── loop/               # Agent loop, turn management
│   │   ├── context/            # Message history, token budget
│   │   ├── extensions/         # ExtensionLoader — consumes extension descriptors
│   │   └── index.ts            # Public API only
│   └── package.json
│
├── providers/                  # @get-cauldron/providers
│   ├── src/
│   │   ├── registry.ts         # Provider registry (api → stream fn)
│   │   ├── types.ts            # LanguageModelV4-compatible interfaces
│   │   └── impl/               # anthropic.ts, openai.ts, google.ts, etc.
│   └── package.json
│
├── tools/                      # @get-cauldron/tools
│   ├── src/
│   │   ├── registry.ts         # Tool registration + dispatch
│   │   ├── sandbox/            # Filesystem containment, permission checks
│   │   ├── builtin/            # read, write, edit, grep, bash, find
│   │   └── index.ts
│   └── package.json
│
├── tui/                        # @get-cauldron/tui
│   ├── src/
│   │   ├── components/         # Ink React components
│   │   ├── layout/             # Screen regions, widget slots
│   │   ├── input/              # Keybindings, stdin buffer
│   │   └── renderer.ts         # render() entry, terminal lifecycle
│   └── package.json
│
├── extension-api/              # @get-cauldron/extension-api  ← THE BOUNDARY
│   ├── src/
│   │   ├── tool-api.ts         # ToolRegistration interface (types only)
│   │   ├── provider-api.ts     # ProviderRegistration interface (types only)
│   │   ├── widget-api.ts       # WidgetRegistration interface (types only)
│   │   └── index.ts            # Re-exports ONLY what extensions may use
│   └── package.json
│       # CRITICAL: package.json has NO dependencies on core packages
│
├── config/                     # @get-cauldron/config
│   └── src/
│       ├── schema.ts           # Zod schemas for all config
│       └── loader.ts           # Load + validate + merge
│
├── types/                      # @get-cauldron/types
│   └── src/                    # Shared types, no runtime deps
│
└── native/                     # @get-cauldron/native (napi-rs)
    ├── src/                    # Rust source
    └── index.d.ts              # Generated TypeScript bindings
```

Extensions live outside core:
```
extensions/
└── ext-example/                # @get-cauldron/ext-example
    ├── src/
    │   └── index.ts            # Imports ONLY from @get-cauldron/extension-api
    │                           # Default export: CauldronExtension descriptor
    └── package.json
        └── peerDependencies:
              @get-cauldron/extension-api: "*"
        # NO dependency on agent-core, tools, providers, tui
```

## Architectural Patterns

### Pattern 1: ReAct Agent Loop

**What:** The core agent cycle: stream LLM response, collect tool calls, execute all tools in parallel, append results, loop until finish reason is not `tool_calls`.

**When to use:** For all interactive and headless agent sessions.

**Trade-offs:** Simple to implement and reason about. Loop depth must be bounded (`maxSteps`). All state lives in the message array — no shared mutable singletons between turns.

```typescript
// packages/agent-core/src/loop/run-loop.ts
async function* runLoop(config: AgentLoopConfig): AsyncIterable<AgentEvent> {
  const messages: AgentMessage[] = [...config.initialMessages];
  let steps = 0;

  while (steps < config.maxSteps) {
    const response = await streamTurn(config.model, messages, config.tools);

    for await (const event of response) {
      yield event;
    }

    const turn = await response.resolved;
    messages.push(turn.assistantMessage);

    if (turn.finishReason !== 'tool_calls') break;

    // Execute all tool calls in parallel, preserve order in results
    const results = await Promise.allSettled(
      turn.toolCalls.map(tc => executeTool(tc, config.sandbox))
    );

    const toolResultMessage = buildToolResultMessage(turn.toolCalls, results);
    messages.push(toolResultMessage);
    steps++;
  }
}
```

### Pattern 2: Provider Registry with LanguageModelV4 Interface

**What:** Each LLM provider implements a typed interface (`doGenerate` + `doStream`). A registry maps `api → provider`. The agent core talks only to the registry — never to provider implementations directly.

**When to use:** Whenever a new LLM API needs to be supported. The interface enforces that providers convert their response format to a standard internal format.

**Trade-offs:** Adds an indirection layer. Worth it: providers can be swapped, mocked in tests, or registered by extensions without touching agent-core.

```typescript
// packages/providers/src/types.ts
export interface LanguageModelProvider {
  readonly specificationVersion: 'V4';
  readonly provider: string;
  readonly modelId: string;
  doGenerate(options: GenerateOptions): Promise<GenerateResult>;
  doStream(options: GenerateOptions): Promise<StreamResult>;
}

// packages/providers/src/registry.ts
const registry = new Map<string, LanguageModelProvider>();

export function registerProvider(provider: LanguageModelProvider): void {
  registry.set(`${provider.provider}:${provider.modelId}`, provider);
}

export function getProvider(id: string): LanguageModelProvider {
  const p = registry.get(id);
  if (!p) throw new Error(`Unknown provider: ${id}`);
  return p;
}
```

### Pattern 3: Tool Registry with Declarative Registration

**What:** Tools register via a typed descriptor that includes JSON schema (for the LLM), a permission declaration, and an execute function. The registry dispatches calls by name. Sandbox enforcement happens in the dispatcher, not inside each tool.

**When to use:** For all built-in tools and extension-registered tools. The same registry serves both.

**Trade-offs:** Tool isolation is only as strong as the sandbox enforcement in the dispatcher. The sandbox must be tested independently.

```typescript
// packages/tools/src/registry.ts
export interface ToolDescriptor<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodSchema<TInput>;
  permissions: ToolPermission[];
  execute: (input: TInput, ctx: ToolContext) => Promise<TOutput>;
}

const tools = new Map<string, ToolDescriptor>();

export function registerTool<T, R>(descriptor: ToolDescriptor<T, R>): void {
  tools.set(descriptor.name, descriptor as ToolDescriptor);
}

export async function dispatchTool(
  call: ToolCall,
  sandbox: Sandbox,
): Promise<ToolResult> {
  const tool = tools.get(call.toolName);
  if (!tool) throw new ToolNotFoundError(call.toolName);

  // Sandbox enforced HERE, not inside tool.execute()
  await sandbox.checkPermissions(tool.permissions, call.input);
  const validated = tool.inputSchema.parse(call.input);
  const output = await tool.execute(validated, { sandbox });
  return { toolCallId: call.toolCallId, output };
}
```

### Pattern 4: Extension API Surface Enforcement (Critical)

**What:** A published `@get-cauldron/extension-api` package is the ONLY import path available to extensions. It contains types and interfaces only — zero runtime code that touches core internals. This is essential to avoid a circular dependency: if extension-api exported a `registerExtension()` function that called into core registries, extension-api would depend on agent-core, creating a cycle since agent-core depends on extension-api.

The correct flow: extensions export a typed descriptor as their default export. The `ExtensionLoader` in agent-core imports the extension package, reads the descriptor, and feeds it into core registries. Extension-api stays at Level 1 in the DAG with no upstream deps.

**When to use:** Always. No exceptions.

**Trade-offs:** Requires designing the extension API surface deliberately before writing extensions. This is a feature: forces explicit decisions about what is public.

The rule that prevents the upstream collapse:

```json
// packages/ext-*/eslint.config.json
{
  "rules": {
    "no-restricted-imports": ["error", {
      "patterns": [
        "@get-cauldron/agent-core/*",
        "@get-cauldron/tools/*",
        "@get-cauldron/providers/*",
        "@get-cauldron/tui/*"
      ],
      "message": "Extensions may only import from @get-cauldron/extension-api"
    }]
  }
}
```

The extension-api package is types only:

```typescript
// packages/extension-api/src/index.ts — types and interfaces, NO runtime deps on core
export type { ToolRegistration } from './tool-api.js';
export type { ProviderRegistration } from './provider-api.js';
export type { WidgetRegistration } from './widget-api.js';
export type { CauldronExtension } from './extension.js';  // the descriptor type

// packages/extension-api/src/extension.ts
export interface CauldronExtension {
  name: string;
  version: string;
  tools?: ToolRegistration[];
  providers?: ProviderRegistration[];
  widgets?: WidgetRegistration[];
}
```

Extension entry point:

```typescript
// packages/ext-example/src/index.ts
import type { CauldronExtension } from '@get-cauldron/extension-api';
// The ONLY allowed import from @get-cauldron/*

const extension: CauldronExtension = {
  name: 'example',
  version: '1.0.0',
  tools: [{ name: 'my-tool', /* ... */ }],
};

export default extension;
```

Core's ExtensionLoader (in agent-core) imports extensions and feeds descriptors into registries:

```typescript
// packages/agent-core/src/extensions/loader.ts
// This is the only place extension packages are imported at runtime
async function loadExtension(packageName: string): Promise<void> {
  const mod = await import(packageName);
  const descriptor: CauldronExtension = mod.default;
  // Feed into core registries — core knows how to do this, extensions don't
  for (const tool of descriptor.tools ?? []) {
    ToolRegistry.registerTool(tool);
  }
  for (const provider of descriptor.providers ?? []) {
    ProviderRegistry.registerProvider(provider);
  }
}
```

### Pattern 5: Ink TUI with Slot-Based Widget API

**What:** The TUI renders fixed layout regions (header, chat, status bar, input). Extension-contributed widgets fill named slots via the extension-api descriptor, not by importing Ink components directly.

**When to use:** For extension-contributed UI elements. Core UI is React/Ink directly.

**Trade-offs:** Extensions cannot render arbitrary Ink trees — only into declared slots with serializable render output. This is intentional: prevents extension code from taking over the rendering pipeline.

```typescript
// packages/extension-api/src/widget-api.ts
export interface WidgetRegistration {
  slot: 'status-bar' | 'sidebar' | 'footer';
  render: (props: WidgetProps) => string; // serializable, not JSX
}
```

## Data Flow

### Agent Turn (primary flow)

```
User Input (stdin)
    │
    ▼
@get-cauldron/tui  ──►  InputHandler  ──►  onSubmit(text)
    │
    ▼
@get-cauldron/agent-core
    │
    ├──  AgentSession.send(text)
    │        │
    │        ▼
    │    ContextManager.append(UserMessage)
    │        │
    │        ▼
    │    runLoop():
    │        ├──  ProviderRegistry.getProvider(model)
    │        │       └──  provider.doStream(messages, tools)
    │        │              └──  [streaming events → TUI via EventEmitter]
    │        │
    │        ├──  finishReason == 'tool_calls'?
    │        │         YES:
    │        │         └──  ToolRegistry.dispatchTool(call, sandbox)  [parallel]
    │        │                   ├──  sandbox.checkPermissions()
    │        │                   │         │
    │        │                   │    permission gap too large?
    │        │                   │         │ YES: emit 'permission_prompt' event
    │        │                   │         │          ▼
    │        │                   │         │    TUI shows prompt (via callback
    │        │                   │         │    registered at CLI startup)
    │        │                   │         │          ▼
    │        │                   │         │    user approves/denies
    │        │                   │         │          ▼
    │        │                   │         │    sandbox.resolvePrompt(decision)
    │        │                   │         └── (sandbox awaits this promise)
    │        │                   └──  tool.execute()  [reads/writes fs]
    │        │                           └──  @get-cauldron/native  (hot paths)
    │        │
    │        └──  finishReason == 'end_turn'?
    │                  YES: loop exits
    │
    ▼
AgentSession emits agent_end event
    │
    ▼
TUI renders final state
```

**Permission prompt wiring:** The sandbox holds a `promptHandler: (request: PermissionRequest) => Promise<boolean>` callback. The CLI sets this at startup by wiring it to the TUI's prompt component. In headless mode, the CLI sets a non-interactive handler (auto-deny or auto-approve based on config). The agent-core and tools packages never import tui — the callback is injected by CLI at session creation.

### Extension Loading Flow

```
startup (agent-core ExtensionLoader)
    │
    ├──  read cauldron config (extensions: ['@get-cauldron/ext-foo', ...])
    ├──  for each extension package:
    │       └──  import(packageName)  → CauldronExtension descriptor
    │                 └──  loader.registerTools(descriptor.tools)
    │                 └──  loader.registerProviders(descriptor.providers)
    │                 └──  loader.registerWidgets(descriptor.widgets)
    └──  onLoadComplete() — all registries populated before first turn
```

No runtime call from extension into core. Extensions are passive descriptors.

### Context Management Flow

```
Each turn:
    ContextManager
        ├──  append new messages
        ├──  count tokens (tiktoken / @anthropic-ai/tokenizer)
        ├──  contextBudget = modelMaxTokens * 0.8  (leave room for response)
        │
        └──  if totalTokens > contextBudget:
                 ├──  CompactionOrchestrator.compact(messages)
                 │         └──  option A: drop oldest non-system messages (fast)
                 │         └──  option B: LLM-generated summary (slow, better)
                 └──  emit context_compacted event to TUI
```

## Build Order and Dependency DAG

Packages must build in this order (no circular deps enforced by CI):

```
Level 0 (no deps):
  @get-cauldron/types
  @get-cauldron/native  (Rust build, produces .node binary)

Level 1 (depends only on Level 0):
  @get-cauldron/config        → types
  @get-cauldron/extension-api → types ONLY (zero deps on core packages)

Level 2 (depends on Level 0-1):
  @get-cauldron/providers     → types, config
  @get-cauldron/tools         → types, config, native

Level 3 (depends on Level 0-2):
  @get-cauldron/agent-core    → types, config, providers, tools, extension-api

Level 4 (depends on Level 0-3):
  @get-cauldron/tui           → types, agent-core (events only), extension-api

Level 5 (depends on Level 0-4):
  @get-cauldron/cli           → all above

External extensions (never in build order — they are consumers):
  @get-cauldron/ext-*         → extension-api ONLY
```

CI must fail if any package imports from a higher level or creates a cycle. Use `madge --circular` or `dependency-cruiser` in the lint step.

The most important invariant: `extension-api` is Level 1. If CI shows it depends on anything above Level 0, a boundary has been violated.

## Extension Isolation: The Anti-Pattern and the Fix

### What Went Wrong Upstream

The upstream had one "extension" slot that became a 303-file, 88K-line package that imported directly from core internals. Extensions bypassed the registry and imported raw source files. Core code started depending on extension behavior. The boundary dissolved because it was enforced by convention only.

**Failure mode chain:**
1. Extension needs one internal type → imports directly from core internals
2. Core needs to know extension behavior → imports from extension
3. Circular dependency → build hack to suppress error
4. Extension has unrestricted access to all core state → no isolation

### The Fix: Descriptor Pattern + API Surface Enforcement

**Three-layer defense:**

**Layer 1 — Extension-api is types only, Level 1 in the DAG.** The package contains interfaces that extensions implement — `CauldronExtension`, `ToolRegistration`, etc. No runtime code that touches core registries. This eliminates the circular dependency at the package boundary level.

**Layer 2 — ESLint enforcement.** `eslint-plugin-boundaries` or `no-restricted-imports` in every extension package's ESLint config. Extension files cannot import from any `@get-cauldron/*` package except `extension-api`. CI runs lint before allowing merge.

**Layer 3 — Descriptor consumption, not callback registration.** Extensions export a static descriptor object. Core's `ExtensionLoader` imports and reads it. The flow is one-directional: core pulls from extensions. Extensions never push into core. This is the key: there is no `registerExtension()` call that extensions make into core. They have nothing to call.

**Why not process isolation (VS Code model)?** Solo developer + AI assistance means complexity budget is limited. Process isolation (child processes + IPC) provides the strongest boundary but adds 3-4x the implementation complexity. The descriptor pattern + ESLint enforcement is sufficient when actually enforced in CI. The upstream failed on enforcement, not on choosing the wrong model.

## Anti-Patterns

### Anti-Pattern 1: Extension-as-Product

**What people do:** Build the entire application inside the extension slot because it's the fastest path to features. The extension grows until it IS the product.

**Why it's wrong:** Eliminates all isolation benefits. Extension gets unrestricted access to core internals. Core starts depending on extension code. Circular deps appear. Build hacks follow.

**Do this instead:** Keep the extension API surface small and stable. If a feature needs deeper access than the API provides, expand the API explicitly rather than bypassing it. New API surface is a deliberate decision, not an escape hatch.

### Anti-Pattern 2: God Files via Accumulated Conditionals

**What people do:** Add every new feature as a conditional branch in the same file (agent-session.ts, interactive-mode.ts). The file grows to 3,000-4,000 lines over time.

**Why it's wrong:** Untestable, unreadable, unrefactorable. Every new feature is coupled to every existing feature through shared file scope.

**Do this instead:** Each concern gets its own module. AgentSession is a coordinator, not an implementer. Context management, compaction, tool dispatch, and event emission are separate modules that AgentSession composes.

### Anti-Pattern 3: Mutable Singletons for Cross-Component State

**What people do:** Export a module-level `let state = {}` that every file imports and mutates. Convenient for sharing state without prop-drilling.

**Why it's wrong:** Makes testing impossible without resetting global state. Creates invisible coupling between modules. Circular dependencies emerge because everything imports the state file.

**Do this instead:** Pass state as arguments (dependency injection). Sessions get a context object. Tools get a sandbox context. Tests create fresh instances. No shared mutable module state.

### Anti-Pattern 4: Build Systems That Suppress Errors

**What people do:** Add `ignoreBuildErrors: true`, loader hacks that fall back from `/dist` to `/src`, or suppress TypeScript errors with `@ts-ignore` when the "real" fix would require fixing circular imports.

**Why it's wrong:** You don't have a build system — you have a build wish. Type errors that are suppressed accumulate silently. The codebase slowly becomes untyped.

**Do this instead:** One `tsc --build` at repo root. If it fails, fix the error. The only acceptable `@ts-ignore` is for an upstream library bug with a filed issue link.

### Anti-Pattern 5: Synthetic Test Pipeline

**What people do:** Build a custom test runner that rewrites dist files before testing, or tests source files directly while shipping dist files that were never tested.

**Why it's wrong:** You're not testing what ships. The test suite proves nothing about the actual artifact.

**Do this instead:** Tests run against the built artifact (`dist/`). No rewriting, no loaders, no fallbacks. CI builds first, then tests.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Anthropic API | `@ai-sdk/anthropic` or custom `LanguageModelV4` impl | Streaming required |
| OpenAI API | `@ai-sdk/openai` or custom impl | Responses API for newer models |
| Google Gemini | `@ai-sdk/google` or custom impl | Vertex and direct both needed |
| Bedrock | Custom impl (sigv4 auth) | Complex auth, upstream impl is solid reference |
| Ollama / local | Custom `LanguageModelV4` impl | OpenAI-compatible endpoint |

The Vercel AI SDK (`ai` + `@ai-sdk/*`) provides `LanguageModelV4` as the stable interface. Adopting it avoids building provider abstraction from scratch and gives access to existing provider packages. The upstream's custom `ApiProvider` registry pattern is equivalent in concept but not ecosystem-compatible.

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `cli` ↔ `agent-core` | Direct function calls | cli owns session lifecycle, wires permission callback |
| `agent-core` ↔ `tui` | EventEmitter / AsyncIterable | agent-core never imports tui |
| `agent-core` ↔ `providers` | Registry lookup + typed interface | No direct provider imports |
| `agent-core` ↔ `tools` | Registry dispatch | Sandbox enforced by dispatcher |
| `tools` ↔ `native` | napi-rs bindings | Native is a leaf node in the DAG |
| `extension-api` ↔ core | Types only in extension-api; core reads descriptors from extension packages | No reverse dependency |
| `ext-*` ↔ `extension-api` | `import type from '@get-cauldron/extension-api'` only | ESLint enforced |
| `sandbox` ↔ `tui` | Promise-based callback injected by cli | Never a direct import |

## Sources

- Vercel AI SDK documentation: https://github.com/vercel/ai — provider abstraction, ToolLoopAgent, LanguageModelV4 interface, custom providers (Context7, HIGH confidence)
- Ink TUI framework: https://github.com/vadimdemedes/ink — React/Flexbox renderer for CLI (Context7, HIGH confidence)
- "Inside the Scaffold: A Source-Code Taxonomy of Coding Agent Architectures" — https://arxiv.org/html/2604.03515 (MEDIUM confidence, recent taxonomy paper)
- Claude Code architecture analysis — https://dev.to/brooks_wilson_36fbefbbae4/claude-code-architecture-explained-agent-loop-tool-system-and-permission-model-rust-rewrite-41b2 (MEDIUM confidence)
- VS Code extension host isolation — https://code.visualstudio.com/api/advanced-topics/extension-host (HIGH confidence, official)
- Nx module boundary enforcement — https://nx.dev/docs/features/enforce-module-boundaries (HIGH confidence, official)
- ESLint plugin boundaries — https://www.npmjs.com/package/eslint-plugin-boundaries (HIGH confidence)
- GSD-2 upstream codebase — `/packages/pi-agent-core`, `/packages/pi-ai`, `/packages/pi-tui` (direct inspection, HIGH confidence for what to avoid)

---
*Architecture research for: Cauldron — AI coding CLI agent*
*Researched: 2026-04-15*
