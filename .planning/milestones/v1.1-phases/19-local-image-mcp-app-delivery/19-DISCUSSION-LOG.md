# Phase 19: Local Image MCP & App Delivery - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-31
**Phase:** 19-local-image-mcp-app-delivery
**Areas discussed:** MCP server design, Asset request contract, Artifact delivery, Job polling & retrieval

---

## MCP Server Design

### Q1: How should the MCP server be structured?

| Option | Description | Selected |
|--------|-------------|----------|
| Standalone stdio MCP server | New process, clean separation, launched via MCP config | ✓ |
| Embedded in CLI Hono server | Add MCP endpoints alongside Inngest serve on :3001 | |
| New package (@get-cauldron/mcp) | Dedicated monorepo package with stdio server | |

**User's choice:** Standalone stdio MCP server
**Notes:** Clean process separation preferred

### Q2: Which MCP tools should be exposed?

| Option | Description | Selected |
|--------|-------------|----------|
| generate-image | Submit async generation, returns job handle | ✓ |
| check-job-status | Check current status and metadata by job ID | ✓ |
| get-artifact | Retrieve artifact path/URL and provenance | ✓ |
| list-jobs | List recent generation jobs with status filter | ✓ |

**User's choice:** All four tools
**Notes:** Full CRUD-like coverage for the asset lifecycle

### Q3: DB access pattern

| Option | Description | Selected |
|--------|-------------|----------|
| Call through engine API | Import engine functions + shared DB layer directly | ✓ |
| HTTP API to CLI server | Make HTTP calls to Hono :3001 for full isolation | |

**User's choice:** Call through engine API
**Notes:** Reuses existing job-store, needs bootstrap wiring

### Q4: Package location

| Option | Description | Selected |
|--------|-------------|----------|
| New @get-cauldron/mcp package | Dedicated package, clean dependency boundary | ✓ |
| Inside @get-cauldron/cli | Subcommand in existing CLI package | |

**User's choice:** New @get-cauldron/mcp package

### Q5: Launch method

| Option | Description | Selected |
|--------|-------------|----------|
| npx/pnpm bin entry | Register bin in package.json, standard MCP pattern | ✓ |
| tsx direct execution | Launch via tsx, dev-friendly, no build step | |

**User's choice:** npx/pnpm bin entry

### Q6: Inngest dependency

| Option | Description | Selected |
|--------|-------------|----------|
| Requires Inngest running | Same flow as CLI/web, docker-compose must be up | ✓ |
| Direct DB + Inngest send | Graceful degradation if Inngest not running | |
| You decide | Claude picks | |

**User's choice:** Requires Inngest running

### Q7: MCP SDK choice

| Option | Description | Selected |
|--------|-------------|----------|
| @modelcontextprotocol/sdk | Official SDK, handles protocol framing | ✓ |
| Hand-rolled stdio | Minimal JSON-RPC, no external dep | |
| You decide | Claude picks based on 80% fit rule | |

**User's choice:** @modelcontextprotocol/sdk

### Q8: Project detection

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-detect from cwd | Scan upward for project markers | ✓ |
| Explicit project ID | Pass projectId as env var or arg | |
| Both (auto + override) | Auto-detect with env var override | |

**User's choice:** Auto-detect from cwd

---

## Asset Request Contract

### Q1: Additional structured fields

| Option | Description | Selected |
|--------|-------------|----------|
| styleGuidance | Free-text style direction, prepended/appended to prompt | ✓ |
| referenceImages | Array of file paths for img2img or style reference | ✓ |
| intendedUse | Enum for hero-image, icon, texture, etc. | ✓ |
| destination | Target path for artifact delivery | ✓ |

**User's choice:** All four fields

### Q2: Generation param defaults

| Option | Description | Selected |
|--------|-------------|----------|
| Smart defaults from intendedUse | Auto-set dimensions/steps based on intendedUse | ✓ |
| Passthrough only | Client handles all param values | |
| You decide | Claude designs defaults | |

**User's choice:** Smart defaults from intendedUse

### Q3: Style composition

| Option | Description | Selected |
|--------|-------------|----------|
| Separate field, composed by MCP | MCP prepends/appends style to prompt, stored separately | ✓ |
| Client composes, MCP passes through | Style is metadata-only, client builds prompt | |
| You decide | Claude picks strategy | |

**User's choice:** Separate field, composed by MCP

---

## Artifact Delivery

### Q1: Delivery mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Copy to destination | Both copies exist, artifact dir is source of truth | ✓ |
| Symlink to artifact | Single source of truth, can break if dir moves | |
| Move to destination | Clean but breaks artifact store completeness | |

**User's choice:** Copy to destination

### Q2: Provenance at destination

| Option | Description | Selected |
|--------|-------------|----------|
| Copy provenance JSON too | Self-describing at destination | |
| Provenance stays in artifacts/ | Only image at destination, keeps it clean | ✓ |
| You decide | Claude picks based on Phase 18 pattern | |

**User's choice:** Provenance stays in artifacts/

### Q3: Missing destination directory

| Option | Description | Selected |
|--------|-------------|----------|
| Create it recursively | mkdir -p, standard behavior | ✓ |
| Fail with clear error | Safer against typos | |

**User's choice:** Create it recursively

### Q4: Delivery trigger

| Option | Description | Selected |
|--------|-------------|----------|
| Automatic on completion | Inngest collect-artifacts step copies to destination | ✓ |
| Explicit get-artifact call | Two-step: generate then deliver | |
| You decide | Claude picks based on async pattern | |

**User's choice:** Automatic on completion

---

## Job Polling & Retrieval

### Q1: Status checking mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| check-job-status tool only | Client polls via MCP tool | |
| Notification resource | MCP resource subscription for status changes | ✓ |

**User's choice:** Notification resource

### Q2: In-progress job response

| Option | Description | Selected |
|--------|-------------|----------|
| Status + timestamps only | Simple and honest | |
| Status + estimated progress | Elapsed/typical ratio approximation | ✓ |
| Status + ComfyUI step info | Accurate but couples to ComfyUI | |

**User's choice:** Status + estimated progress

### Q3: get-artifact response

| Option | Description | Selected |
|--------|-------------|----------|
| File path + provenance metadata | Client reads file itself | |
| Base64 image + metadata | Inline in MCP response | |
| Both (path + optional base64) | Path always, base64 on request | ✓ |

**User's choice:** Both (path + optional base64)

### Q4: list-jobs scope

| Option | Description | Selected |
|--------|-------------|----------|
| Last 20, current project | Scoped to auto-detected project | |
| Last 50, all projects | Cross-project with project name | ✓ |
| You decide | Claude picks defaults | |

**User's choice:** Last 50, all projects

---

## Claude's Discretion

- MCP tool description text and parameter descriptions
- Exact style composition strategy (prepend vs append vs template)
- Estimated progress calculation method
- Internal polling interval for estimated progress
- Resource subscription implementation details

## Deferred Ideas

None — discussion stayed within phase scope.
