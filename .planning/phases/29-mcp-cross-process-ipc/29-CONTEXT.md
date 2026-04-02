# Phase 29: MCP Cross-Process IPC - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Push notifications from the Inngest worker process reach the MCP stdio process reliably via Redis pub/sub — push is best-effort and pull via check-job-status remains the correctness path. Redis connection failures are logged but do not surface as errors.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. The MCP server and Inngest worker run as separate processes. Redis pub/sub bridges the gap for push notifications. The existing `check-job-status` DB query remains the reliable fallback.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/engine/src/asset/events.ts` — Inngest asset job handlers
- MCP server with `notifyJobStatusChanged` callback pattern
- Redis already in Docker Compose on port 6379
- ioredis already a project dependency

### Established Patterns
- Asset jobs use 6-state lifecycle (pending/claimed/active/completed/failed/canceled)
- MCP tools: generate, check-status, list-jobs, deliver-artifact
- Push notifications are best-effort; pull is the correctness path

### Integration Points
- Inngest worker process — publishes status changes
- MCP stdio process — subscribes and calls notifyJobStatusChanged
- Redis — pub/sub broker

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Refer to ROADMAP phase description and success criteria.

</specifics>

<deferred>
## Deferred Ideas

None — infrastructure phase.

</deferred>
