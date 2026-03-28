# Contributing to Cauldron

## Development Setup

See the [Quickstart in README.md](README.md#quickstart) for the full setup walkthrough. Short version:

```bash
git clone https://github.com/get-cauldron/cauldron.git
cd cauldron
pnpm install
cp .env.example .env           # fill in API keys
docker compose up -d           # Postgres :5432, Redis :6379, Inngest :8288
pnpm db:migrate
pnpm dev                       # Next.js at localhost:3000
```

For the CLI engine server:
```bash
pnpm -F @get-cauldron/cli serve:engine   # Hono on :3001 for Inngest handlers
```

## Project Structure

Four packages in a pnpm + Turborepo monorepo. See [Monorepo Structure in README.md](README.md#monorepo-structure) for the layout and [CLAUDE.md](CLAUDE.md) for detailed architecture notes.

Package scope is `@get-cauldron/*`. Dependency direction: `shared` ← `engine` ← `cli`, `web`.

## Code Standards

- **TypeScript everywhere** — no `.js` source files
- **Unit tests**: Vitest (`*.test.ts`), run with `pnpm test`
- **Integration tests**: Vitest (`*.integration.test.ts`) against real Postgres on :5433 — do not mock the database
- **E2E tests**: Playwright against `localhost:3000`
- Before submitting, run the full regression gate:
  ```bash
  pnpm typecheck && pnpm lint && pnpm test && pnpm build
  ```

## Branching and PRs

1. Fork the repo and create a feature branch (`feat/my-feature`, `fix/bug-description`)
2. Keep PRs focused — one feature or fix per PR
3. Include tests for new functionality
4. Ensure CI passes before requesting review

## Key Conventions

These are enforced — do not substitute:

| Area | Use | Do NOT use |
|------|-----|-----------|
| Postgres driver | `postgres` | `pg` / `node-postgres` |
| Flow renderer | `@xyflow/react` | `react-flow-renderer` |
| DAG layout | `@dagrejs/dagre` | `dagre` 0.8.x |
| API workers | Hono | Express |
| Internal dashboard API | tRPC | GraphQL / REST |
| Streaming | SSE | WebSockets |
| Testing | Vitest | Jest |
| E2E | Playwright | Cypress |
| Crypto | `node:crypto` | `aes256`, `crypto-ts`, any third-party wrapper |

See the "Do Not Use" section in [CLAUDE.md](CLAUDE.md) for the full list of banned dependencies.
