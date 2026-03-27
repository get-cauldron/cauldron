# Repository Guidelines

## Project Structure & Module Organization
This repo is a `pnpm` + Turborepo monorepo. `packages/cli` contains the `cauldron` CLI and local server entrypoints. `packages/engine` holds core pipeline logic such as interview, decomposition, execution, evolution, and gateway flows. `packages/shared` contains shared types plus the database schema, migrations, and seed utilities. `packages/web` is the Next.js app, with UI code under `src/app`, `src/components`, `src/hooks`, and `src/trpc`. Root config lives in files such as `turbo.json`, `cauldron.config.ts`, `docker-compose.yml`, and `.env.example`. Do not hand-edit generated output in `dist/`, `.next/`, or `.turbo/`.

## Build, Test, and Development Commands
Run commands from the repository root with `pnpm`.

- `pnpm build`: build all workspace packages through Turborepo.
- `pnpm dev`: start package dev tasks.
- `pnpm test`: run standard Vitest suites across the workspace.
- `pnpm test:integration`: run integration suites.
- `pnpm typecheck`: run strict TypeScript checks.
- `pnpm lint`: run workspace lint tasks.
- `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:seed`: database workflow commands routed to `packages/shared`.

For focused work, use filters such as `pnpm --filter @get-cauldron/web dev` or `pnpm --filter @get-cauldron/web test:e2e`.

## Coding Style & Naming Conventions
Use strict TypeScript with ES modules, single quotes, semicolons, and 2-space indentation. Follow existing naming patterns: `PascalCase` for React components, `camelCase` for functions and variables, and kebab-case filenames like `merge-queue.ts` or `context-assembler.ts`. Keep reusable contracts in `shared`, domain orchestration in `engine`, and transport/UI concerns in `cli` or `web`.

## Testing Guidelines
Vitest is the default test runner. Place unit tests near source as `*.test.ts` or `*.test.tsx`. Use `*.integration.test.ts` for database-backed or cross-system flows; those suites are intentionally more constrained and may run serially. Web browser flows belong in `packages/web/e2e` and run with Playwright. Prefer deterministic fixtures and keep tests package-local when possible.

## Commit & Pull Request Guidelines
Recent history uses scoped, phase-aware Conventional Commits such as `feat(14-02): ...`, `fix(14-02): ...`, `test(14-01): ...`, and `docs(scope): ...`. Keep commits focused and imperative. Pull requests should summarize the behavioral change, list affected packages, note verification commands, and include screenshots for `packages/web` UI changes or terminal samples for CLI output changes.

## Agent Notes
When using repository-aware agents, prefer the codebase memory graph for discovery first: `search_graph`, `trace_call_path`, and `get_code_snippet`. Fall back to text search only for config files, string literals, or other non-code assets.
