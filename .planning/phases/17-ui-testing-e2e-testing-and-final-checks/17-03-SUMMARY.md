---
phase: 17-ui-testing-e2e-testing-and-final-checks
plan: "03"
subsystem: web-e2e-tests
tags:
  - e2e-testing
  - playwright
  - accessibility
  - visual-snapshots
  - interview
  - project-management
dependency_graph:
  requires:
    - packages/web/e2e/helpers/db.ts (17-01)
    - packages/web/e2e/helpers/accessibility.ts (17-01)
    - packages/web/e2e/helpers/routes.ts (17-01)
    - packages/web/src/app/projects/page.tsx
    - packages/web/src/app/projects/[id]/interview/page.tsx
    - packages/web/src/app/projects/[id]/settings/page.tsx
  provides:
    - E2E spec for project management CRUD flow (project-management.spec.ts)
    - E2E spec for settings page + archive dialog (settings.spec.ts)
    - E2E spec for interview page with pre-seeded transcript data (interview.spec.ts)
  affects:
    - Phase 17-04, 17-05 (downstream test phases)
tech_stack:
  added: []
  patterns:
    - "Pre-seeded DB transcript data for LLM mocking in E2E (server-side calls invisible to Playwright)"
    - "db.update() after createTestInterview to inject transcript/ambiguityScore data"
    - "Element-based waits (toBeVisible) — never waitForLoadState('networkidle') because SSE holds connection open"
    - "SSE test: createTestEvent() in DB then toBeVisible(timeout:8000) to cover polling interval"
key_files:
  created:
    - packages/web/e2e/project-management.spec.ts
    - packages/web/e2e/settings.spec.ts
    - packages/web/e2e/interview.spec.ts
  modified: []
decisions:
  - "Pre-seeded DB data (not page.route) for D-05: ALL LLM calls are server-side (browser->tRPC->Next.js->engine->gateway->AI SDK->Anthropic). Playwright page.route() only intercepts browser-originating requests — server-to-server calls are invisible. Seeding transcript directly in DB tests the actual rendering path."
  - "db.update() in test helpers for transcript seeding: createTestInterview creates a minimal row; tests then call db.update() to inject transcript[], currentAmbiguityScore, and phase for realistic rendering test scenarios."
  - "SSE test uses createTestEvent() + toBeVisible(timeout:8000): inserts event row directly to trigger Postgres NOTIFY; 8000ms timeout covers the client polling/debounce interval."
metrics:
  duration: "~15 minutes"
  completed_date: "2026-03-27"
  tasks: 2
  files: 3
---

# Phase 17 Plan 03: E2E Specs for Project Management, Interview, and Settings

**One-liner:** Created three Playwright E2E spec files covering project CRUD, interview transcript rendering with pre-seeded DB data, and settings/archive flows — with accessibility checks, visual snapshots, and SSE event testing.

## What Was Built

### Task 1: Project Management and Settings E2E Specs

**`packages/web/e2e/project-management.spec.ts`** (5 tests):
- `projects list page loads and shows empty state` — navigates to `/projects`, asserts "No projects yet" heading, runs axe-core a11y check, captures visual snapshot
- `projects list shows existing projects` — seeds Alpha/Beta projects via `createTestProject`, asserts both visible, a11y + snapshot
- `create new project via form` — navigates to `/projects/new`, fills project name, submits, asserts redirect to interview page
- `navigate to project details from list` — seeds project, clicks card link, asserts URL contains project ID
- `new project page has no accessibility violations` — standalone a11y check for the new project form

**`packages/web/e2e/settings.spec.ts`** (3 tests):
- `settings page displays project configuration` — seeds project, navigates to settings, asserts BUDGET + MODEL OVERRIDES sections, a11y + snapshot
- `archive project from settings shows confirmation dialog` — seeds project, clicks "Delete Project" button, asserts confirmation dialog appears with project name
- `settings page has no accessibility violations` — standalone a11y check

### Task 2: Interview E2E Spec with Pre-seeded Transcript Data (D-05)

**`packages/web/e2e/interview.spec.ts`** (6 tests):

The key architectural decision was determining the correct LLM mock strategy. Investigation confirmed that ALL AI SDK calls are server-side (browser -> tRPC -> Next.js server -> InterviewFSM -> gateway -> Anthropic API). Playwright's `page.route()` cannot intercept server-to-server calls, so D-05 is achieved by pre-seeding transcript data directly in the `interviews` table.

Tests:
- `interview page renders pre-seeded transcript` — seeds 2-turn transcript with realistic question/answer data, asserts first question and user answer visible, a11y + snapshot
- `user can type and submit an answer` — seeds interview, fills answer input (aria-label="Interview answer input"), clicks "Send Answer" button, verifies the submission flow fires the tRPC mutation
- `MC chips render and are clickable` — seeds interview with last-turn mcOptions, asserts chip text visible (Regex patterns, Template strings, Glob matching), clicks a chip to trigger submission
- `ambiguity meter displays seeded scores` — seeds interview with currentAmbiguityScore, asserts "AMBIGUITY SCORE" sidebar heading visible + "INTERVIEW PROGRESS" section rendered
- `interview page has no accessibility violations` — standalone a11y check with pre-seeded transcript
- `SSE delivers real-time events to UI` — seeds interview, navigates to page, inserts `interview_started` event via `createTestEvent()`, then waits with `toBeVisible({ timeout: 8000 })` for UI to reflect the update (covers SSE polling interval per D-15)

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Architectural Notes

The plan correctly identified that `page.route()` cannot intercept server-side AI SDK calls. The pre-seeded DB approach was implemented as specified. The `db.update()` pattern (calling `seedTranscriptData()` helper after `createTestInterview()`) was used to inject realistic multi-turn transcript data with proper `InterviewTurn` type shape.

## Known Stubs

None — all spec files test actual production code paths through the running server. The interview spec uses pre-seeded DB data to avoid LLM calls, but the UI rendering and tRPC query paths are real.

## Self-Check

Verified:
- `packages/web/e2e/project-management.spec.ts` — exists, 5 test blocks, `assertNoA11yViolations`, `toHaveScreenshot`, `truncateE2EDb`
- `packages/web/e2e/settings.spec.ts` — exists, 3 test blocks, `assertNoA11yViolations`, `toHaveScreenshot`, `truncateE2EDb`
- `packages/web/e2e/interview.spec.ts` — exists, 6 test blocks, `createTestInterview`, `assertNoA11yViolations`, `toHaveScreenshot`, `truncateE2EDb`, `timeout: 8000` SSE test, no `page.route('https://api.anthropic.com`, no `networkidle`
- Commits exist: `3111c32` (Task 1), `a9203db` (Task 2)

## Self-Check: PASSED
