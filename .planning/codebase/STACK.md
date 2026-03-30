# Technology Stack

**Analysis Date:** 2026-03-29

## Languages

**Primary:**
- TypeScript 6.0.2 - Used end-to-end across all packages

**Secondary:**
- SQL - Drizzle migrations in `packages/shared/src/db/migrations/`
- CSS - Tailwind CSS 4 in `packages/web/`

## Runtime

**Environment:**
- Node.js (ES2022 target, Node16 module resolution)
- `.nvmrc` / `.node-version` not detected - no pinned Node version

**Package Manager:**
- pnpm 10.32.1 (pinned in root `package.json` `packageManager` field)
- Lockfile: `pnpm-lock.yaml` present

## Frameworks

**Core:**
| Layer | Framework | Version | Purpose |
|-------|-----------|---------|---------|
| Frontend | Next.js | 16.2.1 | Web dashboard, SSR, API routes |
| UI | React | 19.2.4 | Component library |
| CSS | Tailwind CSS | 4.2.2 | Utility-first styling (v4 uses CSS `@theme`, no `tailwind.config.ts`) |
| Component Library | shadcn/ui | 4.1.0 | Pre-built accessible components |
| API (dashboard) | tRPC | 11.15.1 | Type-safe dashboard-to-backend RPC |
| API (workers) | Hono | 4.12.9 | Agent worker HTTP server on :3001 |
| AI SDK | Vercel AI SDK (`ai`) | 6.0.138 | Multi-provider LLM interface (streamText, generateText, generateObject) |
| Database ORM | Drizzle ORM | 0.45.1 | SQL-like TypeScript ORM, no codegen |
| Jobs | Inngest | 4.1.0 | Durable step-function execution for pipeline orchestration |
| Validation | Zod | 4.3.6 | Schema validation across tRPC, Drizzle, AI SDK |
| Logging | Pino | 10.3.1 | Structured JSON logging |

**Testing:**
| Framework | Version | Purpose |
|-----------|---------|---------|
| Vitest | 4.1.1 | Unit + integration + wiring tests |
| Playwright | 1.58.2 | E2E browser tests |
| @testing-library/react | 16.3.2 | React component testing |
| @testing-library/jest-dom | 6.9.1 | DOM assertion matchers |
| jsdom | 29.0.1 | Browser environment for component tests |
| @axe-core/playwright | 4.11.1 | Accessibility testing in E2E |

**Build/Dev:**
| Tool | Version | Purpose |
|------|---------|---------|
| Turborepo | 2.8.20 | Monorepo build orchestration with caching |
| tsx | 4.21.0 | Direct TypeScript execution (scripts, CLI dev) |
| Vite | 8.0.2 | Test bundler for Vitest |
| ESLint | 9.0.0 | Linting |
| drizzle-kit | 0.31.10 | Migration generation |
| @vitejs/plugin-react | 6.0.1 | React support in Vitest |

## Key Dependencies

**AI Providers:**
- `@ai-sdk/anthropic` 3.0.64 - Anthropic Claude models (claude-sonnet-4-6, claude-opus-4-6, claude-haiku-4-5)
- `@ai-sdk/openai` 3.0.48 - OpenAI models (gpt-4.1, gpt-4.1-mini, gpt-4o, gpt-4o-mini)
- `@ai-sdk/google` 3.0.53 - Google Gemini models (gemini-2.5-pro, gemini-2.5-flash)

**Database:**
- `postgres` 3.4.8 - PostgreSQL driver (NOT `pg`/node-postgres)
- `drizzle-orm` 0.45.1 - ORM with SQL-like API

**Infrastructure:**
- `inngest` 4.1.0 - Durable workflow execution with `step.run()` and `step.waitForEvent()`
- `ioredis` 5.10.1 - Redis client for Inngest broker
- `simple-git` 3.33.0 - Git operations for worktree management in bead execution

**Web/UI:**
- `@xyflow/react` 12.10.1 - DAG visualization (NOT `react-flow-renderer`)
- `@dagrejs/dagre` 3.0.0 - Auto-layout for DAG nodes (NOT unmaintained `dagre` 0.8.x)
- `@tanstack/react-query` 5.95.2 - Server state management (via tRPC integration)
- `@base-ui/react` 1.3.0 - Unstyled accessible primitives
- `lucide-react` 1.7.0 - Icon library
- `class-variance-authority` 0.7.1 - Variant-based component styling
- `clsx` 2.1.1 + `tailwind-merge` 3.5.0 - Class name utilities
- `sonner` 2.0.7 - Toast notifications
- `next-themes` 0.4.6 - Dark/light theme support
- `geist` 1.7.0 - Font family
- `react-diff-viewer-continued` 4.2.0 - Code diff visualization
- `ansi-to-html` 0.7.2 - Terminal output rendering
- `eventsource` 4.1.0 - SSE client for CLI

**CLI:**
- `chalk` 5.6.2 - Terminal color output
- `cli-table3` 0.6.5 - Terminal table formatting
- `ora` 9.3.0 - Terminal spinners
- `dotenv` 16.4.0 - Environment variable loading

**Security:**
- `@octokit/webhooks-methods` 6.0.0 - GitHub webhook signature verification
- `node:crypto` (built-in) - AES-256-GCM encryption for holdout tests

## Explicitly Banned Technologies

Do NOT introduce these (per CLAUDE.md):
- Express (use Hono instead)
- GraphQL (use tRPC for internal, Route Handlers for external)
- WebSockets (use SSE - AI SDK handles it natively)
- Jest (use Vitest)
- Cypress (use Playwright)
- `pg` driver (use `postgres`)
- `react-flow-renderer` (use `@xyflow/react`)
- `dagre` 0.8.x (use `@dagrejs/dagre`)
- Third-party crypto wrappers like aes256, crypto-ts (use `node:crypto`)

## Configuration

**TypeScript:**
- Root config: `tsconfig.json` - ES2022 target, Node16 module resolution, strict mode
- Each package has its own `tsconfig.json` extending root

**Build:**
- Turborepo config: `turbo.json` - defines task dependency graph, caching strategy
- pnpm workspace: `pnpm-workspace.yaml` - `packages/*` glob

**Next.js:**
- Config: `packages/web/next.config.ts`
- Uses Webpack (NOT Turbopack) - required for `.js` to `.ts` extension alias resolution
- `transpilePackages`: `@get-cauldron/shared`, `@get-cauldron/engine`
- Server Actions body size limit: 2MB

**Database:**
- Drizzle config: `packages/shared/drizzle.config.ts`
- Schema source: `packages/shared/src/db/schema/index.ts`
- Migration output: `packages/shared/src/db/migrations/`
- Migration table: `__drizzle_migrations` in `public` schema

**Gateway:**
- Model routing config: `cauldron.config.ts` (root)
- Maps pipeline stages to model chains with primary + fallback
- Budget enforcement: default 500 cents
- Per-perspective model assignments for interview stage

**Environment:**
- `.env.example` present at project root
- Required vars: `DATABASE_URL`, `REDIS_URL`
- Optional: `CAULDRON_API_KEY` (unset = dev mode, allow all)
- AI keys: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`
- Holdout encryption: `HOLDOUT_ENCRYPTION_KEY` (base64-encoded 256-bit key)

## Platform Requirements

**Development:**
- Docker for infrastructure: PostgreSQL 17-alpine (:5432 dev, :5433 test, :5434 e2e), Redis 7-alpine (:6379), Inngest dev server (:8288)
- pnpm 10.32.1
- Node.js (ES2022+ compatible)

**Production:**
- PostgreSQL 17
- Redis 7
- Inngest Cloud (or self-hosted dev server)
- Next.js 16 hosting (Vercel or Node.js server)
- Hono server on separate port :3001 for agent workers

## Monorepo Package Graph

```
@get-cauldron/shared (leaf - no workspace deps)
  ├── @get-cauldron/engine (depends on shared)
  │   ├── @get-cauldron/cli (depends on engine + shared)
  │   └── @get-cauldron/web (depends on engine + shared)
  └── @get-cauldron/test-harness (depends on shared + engine)
```

All packages use `workspace:*` protocol for internal dependencies.

---

*Stack analysis: 2026-03-29*
