# Feature Research

**Domain:** AI coding agent CLI with TUI and extension system
**Researched:** 2026-04-15
**Confidence:** MEDIUM-HIGH (competitor features verified from official docs and multiple comparison sources; internal Cauldron decisions from PROJECT.md)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete or broken by comparison to the field.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Code generation + multi-file editing | Every competitor ships this; it's the core value proposition | MEDIUM | Must handle coherent changes across files in a single agent turn |
| File read / write / edit tools | Core agent capability; required for any agentic loop | LOW | Read, write, apply-diff (edit) are the three primitives. All competitors have these. |
| Bash / shell execution tool | Required to run tests, linters, build commands | MEDIUM | Needs approval gating; see security below |
| Grep / glob / find tools | Required for codebase navigation without indexing | LOW | Competitors (Claude Code in particular) proved agentic search beats RAG for most codebases |
| Diff preview before apply | Users won't accept blind writes; standard UX since Aider established it | LOW | Show before-after, require confirmation or auto-apply based on mode |
| Git integration (auto-commit optional) | Aider made auto-commit with descriptive messages the default; users expect a clean undo path | MEDIUM | Auto-commit as opt-in; git diff / git log as the undo mechanism |
| Multi-turn conversation (session) | Stateless one-shot is not an agent | LOW | Conversation history must accumulate tool calls and results |
| Session resume / persistence | Claude Code, Codex CLI, Aider all ship this; users expect to pick up where they left off | MEDIUM | Persist sessions to disk; resume by ID or most-recent picker |
| Permission prompting (approve before exec) | Security baseline; every competitor ships it | MEDIUM | Pre-tool prompt for bash commands at minimum; allow/deny rule config |
| Syntax-highlighted output | Standard terminal UX; Codex CLI, Aider, OpenCode all do this | LOW | Markdown code blocks with language-appropriate highlighting |
| Diff display (colored hunks) | Required for reviewing changes; every tool ships this | LOW | Unified diff format with color; word-level diffs are a nice-to-have |
| Headless / non-interactive mode | Required for CI/CD, scripting; all competitors ship it | LOW | `--print` or `--yes-always` style; pipe output to stdout |
| CLAUDE.md / AGENTS.md style config | Project-specific instructions passed to model; Claude Code made this the standard; competitors follow | LOW | File at project root that injects into system prompt |
| API key management | Required to use any LLM; competitors all solve this | LOW | Environment variable + config file; chmod 0600 on stored credentials |
| Basic model selection | Users need to choose which model to use | LOW | Config-level default; per-session override |
| Progress indicators | Long agent turns need visual feedback; missing = product feels frozen | LOW | Spinner or streaming output while agent is running |
| Streaming output | Users need to see model output as it arrives | LOW | Stream tokens to TUI; critical for perceived responsiveness |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required by all users, but meaningfully valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Multi-provider LLM support | Only Aider and OpenCode do this well among CLI tools. Claude Code = Anthropic only; Codex = OpenAI only; Gemini CLI = Google only. Multi-provider is a real differentiator for users who want model choice or cost control. | MEDIUM | Requires provider abstraction layer; Cauldron PROJECT.md already targets this |
| Local model support (Ollama) | Offline use, privacy, cost elimination. Aider supports this via Ollama; major competitors do not. Growing developer segment. | MEDIUM | Ollama has a stable REST API; treat as a provider like any other |
| Extension API (tools, providers, UI widgets) | No competitor ships a clean, isolated extension system. Claude Code has MCP (external protocol), not first-class extensions. Aider has none. This is Cauldron's explicit architectural bet. | HIGH | Must enforce isolation — extension-as-product collapse is the failure mode from GSD-2 |
| MCP client support | Claude Code, Codex CLI, and Gemini CLI all ship MCP. Aider has limited bridge support. MCP is becoming the standard protocol for agent-tool integration. Being a good MCP client (not just having it) matters. | MEDIUM | Remote MCP with OAuth; lazy loading to reduce context overhead; scoped per project |
| Filesystem containment (enforced) | Claude Code relies on OS-level controls; Codex sandboxes via OS mechanisms. No competitor enforces path confinement at the tool layer with explicit errors. This is a trust differentiator for solo devs and CI use. | MEDIUM | Block reads/writes outside project root at tool implementation level, not just by convention |
| Prompt injection detection on file reads | Emerging attack surface documented by Trail of Bits, Snyk. Every tested coding agent is vulnerable (85%+ adaptive attack success per Jan 2026 research). Being the tool that visibly detects and flags injection attempts is a real differentiator. | HIGH | Scan file content entering LLM context; warn on patterns that look like instruction hijacking |
| Architect / plan-then-execute mode | Aider has "Architect mode"; Codex has plan mode; Gemini CLI has Plan Mode on by default. Users want to review strategy before execution. Differentiate on quality of plan output and interactivity. | MEDIUM | Separate planning step from execution; user approves plan before tool calls begin |
| Clean, well-structured TUI | Most CLI tools have functional but not polished TUIs. OpenCode is the current bar-setter for TUI quality. A fast, well-organized TUI with clear separation of conversation / tool output / diff preview is a differentiator. | HIGH | Cauldron's TUI rewrite from pi-tui reference is already planned; the bar is OpenCode |
| Extension lifecycle management (load/enable/disable/unload) | No competitor ships first-class extension lifecycle. MCP servers are external processes, not managed extensions. | HIGH | Load, enable, disable, unload with clean state transitions; runtime hot-reload is a v2 concern |
| Voice input | Aider has experimental voice-to-code. Others have nothing. Niche but visible differentiator. | HIGH | Out of scope for v1; flag for v2 consideration |
| Subagent / parallelization | Claude Code ("Agent Teams") and Codex CLI ship parallel subagents. Aider and Gemini CLI do not. Enables complex multi-part tasks. | HIGH | v2 consideration; requires careful session isolation to avoid cross-contamination |
| Code review workflow (`/review` command) | Codex CLI ships a `/review` command that analyzes diffs without modifying the working tree. Useful for PR review use case. | MEDIUM | Post-MVP; requires git diff integration |

### Anti-Features (Things to Deliberately NOT Build)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Workflow / project management orchestration | GSD-2 users expect it; it's the 88K-line extension in the upstream | It becomes the product. Collapses extension isolation. Complexity without proportional agent value. Explicitly out of scope per PROJECT.md. | Provide a clean extension API; let workflows be an extension, not the core |
| Daemon / background process | Some users want persistent background agent | Zombie process management, IPC complexity, port conflicts. GSD-2 killed this; keep it dead. | Headless mode + session resume covers the real use cases |
| Web UI | Users occasionally ask for browser interface | Out of scope for v1 per PROJECT.md. Web UI earns its way back by proving CLI is solid first. | CLI-first; web can follow later if warranted |
| VS Code / IDE extension (bundled) | Natural request from IDE users | Separate surface, separate release cadence, separate permissions model. Out of scope per PROJECT.md. | The CLI works in any terminal including VS Code's integrated terminal |
| Electron desktop app ("Studio") | Some users want a native GUI | Dead upstream (GSD-2); keep it dead. High complexity, low return for a CLI-first product. | TUI in terminal is the product |
| Marketplace / plugin distribution | Extension system implies a marketplace to users | Extension system must be solid before distribution. Marketplace is a platform product, not a feature. | Extension API first; marketplace is v2+ |
| Auto-accepting all commands without review | Power users request `--dangerously-skip-permissions` style flags | Removes the last safety layer. Leads to unrecoverable filesystem damage in CI. | Provide an explicit "full access" mode with prominent warnings; don't make it the default |
| Codebase vector indexing / RAG | Seems like it would help large codebases | Claude Code's creator confirmed agentic search (grep, glob, file reads) outperforms RAG for most codebases. RAG adds embedding infrastructure cost and maintenance. | Agentic search via grep/glob/read tools; Rust-native grep for performance |
| Real-time file watching (IDE watch mode) | Aider has this; users notice | Turns the CLI into a daemon-like process. Complicates the process lifecycle. | Explicit invocation per session; headless mode for CI; watch mode can be an extension |

---

## Feature Dependencies

```
Multi-turn conversation
    └──requires──> Session persistence (disk storage)
                       └──required by──> Session resume

Permission prompting
    └──requires──> Tool system (file read/write/edit/bash/grep/glob)
    └──enhances──> Filesystem containment

MCP client support
    └──requires──> Tool system (tool dispatch abstraction)
    └──enhances──> Extension API (MCP is one extension mechanism)

Extension API (tools / providers / UI widgets)
    └──requires──> Provider abstraction layer
    └──requires──> Tool dispatch abstraction
    └──requires──> TUI widget protocol
    └──requires──> Extension lifecycle management

Multi-provider LLM support
    └──requires──> Provider abstraction layer

Local model support (Ollama)
    └──requires──> Multi-provider support (Ollama as a provider)

Prompt injection detection
    └──requires──> File read tool (detection runs on content entering context)

Filesystem containment
    └──requires──> File read / write / edit tools (containment is a property of those tools)

Architect / plan mode
    └──requires──> Multi-turn conversation
    └──enhances──> Permission prompting (user approves plan before execution)

Code review workflow
    └──requires──> Git integration
    └──requires──> Diff display
```

### Dependency Notes

- **Extension API requires provider + tool abstraction first:** The extension API cannot be designed in isolation. Provider abstraction and tool dispatch must be stable interfaces before extension authors can build against them.
- **MCP conflicts with raw extension API design:** MCP is an external-process protocol, not an in-process extension system. They serve different use cases. MCP = connect to external services. Extension API = first-class native extensions. Design them as complementary, not competing.
- **Filesystem containment and permission prompting are orthogonal:** Containment is enforced at the tool layer (path validation). Permission prompting is enforced at the agent loop layer (pre-tool approval). Both are needed; neither replaces the other.
- **Prompt injection detection gates file content entering context:** Detection must run at read-time, before content is assembled into the LLM message. Retrofitting it after the tool layer is significantly harder.

---

## MVP Definition

### Launch With (v1)

Minimum viable for a developer to actually use Cauldron on a real project and prefer it over competitors.

- [ ] Core tool system: read, write, edit (apply-diff), bash, grep, glob — with filesystem containment enforced
- [ ] Permission prompting: pre-tool approval for bash commands; allow/deny rule config
- [ ] Multi-turn conversation with streaming output
- [ ] Session persistence and resume (disk-backed; resume by ID or most-recent)
- [ ] Multi-provider LLM support (Anthropic, OpenAI, Google at minimum; provider abstraction layer)
- [ ] Prompt injection detection on file reads entering context
- [ ] Git integration: diff display, optional auto-commit
- [ ] TUI: conversation view, tool output display, diff preview, syntax highlighting, progress indicators
- [ ] AGENTS.md / project config file support (project-specific system prompt injection)
- [ ] API key management (env + config file, chmod 0600)
- [ ] Headless / non-interactive mode for CI/CD
- [ ] Extension API: tools and providers (UI widget extension is v1.x)

### Add After Validation (v1.x)

- [ ] Local model support (Ollama) — add once provider abstraction is proven stable
- [ ] MCP client support — high user demand; add once extension API is solid
- [ ] Architect / plan-then-execute mode — common request; validates agent interaction model
- [ ] Extension lifecycle management (hot-reload, enable/disable at runtime) — add once extension API has real users
- [ ] UI widget extension type — complex; add after tool + provider extensions are stable
- [ ] Code review workflow (`/review` command) — adds a specific workflow without becoming a workflow tool

### Future Consideration (v2+)

- [ ] Subagent / parallelization — high complexity; requires session isolation proofs first
- [ ] Voice input — niche; only after core is solid
- [ ] Web UI — earns its way back by demonstrating user demand; must not compromise CLI-first architecture

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Core tool system (read/write/edit/bash/grep/glob) | HIGH | MEDIUM | P1 |
| Filesystem containment | HIGH | LOW | P1 |
| Permission prompting + allow/deny rules | HIGH | MEDIUM | P1 |
| Multi-turn conversation + streaming | HIGH | LOW | P1 |
| Session persistence + resume | HIGH | MEDIUM | P1 |
| Multi-provider LLM support | HIGH | MEDIUM | P1 |
| Prompt injection detection | MEDIUM | MEDIUM | P1 |
| TUI (conversation + tool output + diff + syntax highlight) | HIGH | HIGH | P1 |
| Git integration + diff display | HIGH | MEDIUM | P1 |
| Project config file (AGENTS.md) | MEDIUM | LOW | P1 |
| API key management | HIGH | LOW | P1 |
| Headless / CI mode | MEDIUM | LOW | P1 |
| Extension API (tools + providers) | HIGH | HIGH | P1 |
| Local model support (Ollama) | MEDIUM | LOW | P2 |
| MCP client support | HIGH | MEDIUM | P2 |
| Architect / plan mode | MEDIUM | MEDIUM | P2 |
| Extension lifecycle management | MEDIUM | HIGH | P2 |
| UI widget extensions | MEDIUM | HIGH | P2 |
| Code review workflow | LOW | MEDIUM | P3 |
| Subagent / parallelization | MEDIUM | HIGH | P3 |
| Voice input | LOW | HIGH | P3 |
| Web UI | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

| Feature | Claude Code | Aider | Codex CLI | Gemini CLI | OpenCode | Cauldron Approach |
|---------|-------------|-------|-----------|------------|----------|-------------------|
| Core tools (read/write/edit/bash/grep/glob) | Yes | Yes | Yes | Yes | Yes | Yes — with filesystem containment enforced at tool layer |
| Multi-provider LLM | No (Anthropic only) | Yes (100+ models) | No (OpenAI only) | No (Google only) | Yes (75+ providers) | Yes — provider abstraction layer, core differentiator |
| Local model support | No | Yes (Ollama) | No | No | Yes | Yes (v1.x) |
| MCP client | Yes (extensive, 6000+ apps) | Limited (bridge) | Yes | Yes | Yes | Yes (v1.x, after extension API) |
| Extension / plugin API | No native; MCP is external | No | No | Extensions only | No | Yes — first-class, isolated, scoped |
| Permission system | Yes (allow/deny rules, hooks) | Minimal | Yes (3 approval modes) | System-level | Minimal | Yes (allow/deny rules; hooks for advanced control) |
| Sandboxing | OS-level (no native containment) | None | OS sandbox (Rust) | macOS Seatbelt + Windows | None | Filesystem containment at tool layer (not OS sandbox in v1) |
| Prompt injection detection | Yes (server-side probe in auto mode) | No | Offline default reduces risk | No | No | Yes — on file reads entering context |
| Session resume | Yes (--continue, --resume) | No | Yes (resume subcommand) | No | Yes (/undo /redo) | Yes |
| Session branching / forking | Yes (fork API) | No | No | No | No | Yes (agent loop; out of scope in v1) |
| Git integration | Optional auto-commit | Automatic commit (default) | Optional | Optional | Yes | Optional auto-commit; always show diff |
| Architect / plan mode | Yes | Yes (Architect mode) | Yes | Yes (on by default) | Yes (Plan mode) | Yes (v1.x) |
| TUI quality | Functional | Minimal | Good (Rust, fast) | Minimal | Best in class | Goal: match or exceed OpenCode quality |
| Headless / CI mode | Yes (--print) | Yes (--yes-always) | Yes (codex exec) | Yes | Yes | Yes |
| Auto-commit with descriptive messages | Optional | Default; described as "excellent" | Optional | Optional | Optional | Optional |
| Codebase indexing / repo-map | No (agentic search) | Yes (repo map) | No (agentic search) | No (agentic search) | No | No (agentic search via grep/glob; Rust grep for speed) |
| Project config file | CLAUDE.md | .aider* files | .codex/ | .gemini/ | AGENTS.md | AGENTS.md (follow OpenCode convention) |
| Open source | No | Yes | Yes (Apache 2.0) | Yes (Apache 2.0) | Yes | Yes |

---

## Sources

- [Claude Code MCP Documentation](https://code.claude.com/docs/en/mcp) — HIGH confidence (official docs)
- [Claude Code Permissions Documentation](https://code.claude.com/docs/en/permissions) — HIGH confidence (official docs)
- [Aider Documentation](https://aider.chat/docs/) — HIGH confidence (official docs)
- [Codex CLI Features Documentation](https://developers.openai.com/codex/cli/features) — HIGH confidence (official docs)
- [Codex CLI Security / Sandboxing](https://developers.openai.com/codex/sandboxing) — HIGH confidence (official docs)
- [Gemini CLI GitHub](https://github.com/google-gemini/gemini-cli) — HIGH confidence (official repo)
- [Google Gemini CLI Introduction](https://blog.google/innovation-and-ai/technology/developers-tools/introducing-gemini-cli-open-source-ai-agent/) — HIGH confidence (official blog)
- [OpenCode Documentation](https://opencode.ai/docs/) — MEDIUM confidence (official docs; some features unverified)
- [Terminal AI Coding Agents Compared 2026 — Effloow](https://effloow.com/articles/terminal-ai-coding-agents-compared-claude-code-gemini-cli-2026) — MEDIUM confidence (third-party comparison, cross-checked against official docs)
- [Aider vs OpenCode vs Claude Code — sanj.dev](https://sanj.dev/post/comparing-ai-cli-coding-assistants) — MEDIUM confidence (third-party comparison)
- [MCP Security Vulnerabilities 2026 — Practical DevSecOps](https://www.practical-devsecops.com/mcp-security-vulnerabilities/) — MEDIUM confidence (security landscape)
- [Prompt Injection to RCE in AI Agents — Trail of Bits](https://blog.trailofbits.com/2025/10/22/prompt-injection-to-rce-in-ai-agents/) — HIGH confidence (security research)
- [Repository Intelligence in AI Coding Tools 2026 — BuildMVPFast](https://www.buildmvpfast.com/blog/repository-intelligence-ai-coding-codebase-understanding-2026) — MEDIUM confidence (ecosystem analysis)
- [Claude Code Session Management — DeepWiki](https://deepwiki.com/anthropics/claude-code/2.4-session-management) — MEDIUM confidence (community documentation)

---

*Feature research for: AI coding agent CLI (Cauldron)*
*Researched: 2026-04-15*
