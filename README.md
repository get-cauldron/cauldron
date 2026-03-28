# Cauldron

**AI-powered software development platform that turns a description into tested, validated code.**

<!-- Badges: CI | License | Node version -->

## What is Cauldron?

Cauldron is an autonomous software factory. You describe what you want to build — in plain language — and Cauldron designs the architecture, decomposes it into parallel workstreams, implements each piece with purpose-built AI agents, validates the result against encrypted holdout tests that the implementation agents never saw, and evolves the output until it meets your goal. Humans steer at key decision points; they don't babysit every step.

The pipeline starts with a **Socratic interview**: multi-perspective AI questioning (researcher, simplifier, architect, breadth-keeper, seed-closer) that surfaces hidden constraints and scores ambiguity until the spec is unambiguous. That spec is then **crystallized into an immutable Seed** — a locked contract no agent can retroactively rewrite. Holdout test scenarios are generated and **encrypted at rest** (AES-256-GCM) using a key that implementation agents never have access to, enforcing true cross-model evaluation.

Execution is parallel and durable. A 2-pass decomposition produces a **dependency-aware Bead DAG**, dispatched through Inngest durable steps so failures retry without losing progress. After implementation, holdout tests are decrypted and run — and if the result falls short, an **evolutionary loop** runs tiered mutations (targeted rewrites, full regeneration, lateral thinking with divergent personas) until convergence or escalation to the user.

## Architecture

```
User (CLI / Web Dashboard)
         |
         v
+--------------------+     +--------------------+     +--------------------+
|     Interview      | --> |    Crystallize     | --> |       Seal         |
|  Socratic Q&A      |     |  Immutable Seed    |     |  Encrypted Tests   |
|  Ambiguity Scoring |     |  Locked Contract   |     |  (AES-256-GCM)     |
+--------------------+     +--------------------+     +--------------------+
                                                               |
         +-----------------------------------------------------+
         |
         v
+--------------------+     +--------------------+     +--------------------+
|     Decompose      | --> |      Execute       | --> |     Evaluate       |
|  2-Pass DAG Build  |     |  Durable Agents    |     |  Holdout Tests     |
|  Parallel Beads    |     |  Inngest Steps     |     |  Cross-Model Judge |
+--------------------+     +--------------------+     +--------------------+
                                                               |
                                                               v
                                                    +--------------------+
                                                    |      Evolve        |
                                                    |  Tiered Mutations  |
                                                    |  Convergence Loop  |
                                                    +--------------------+
```

| Stage | What it does |
|-------|-------------|
| **Interview** | FSM-driven Socratic Q&A with 5 AI perspectives. Scores ambiguity across goal/constraint/success-criteria dimensions until the spec is ready to lock. |
| **Crystallize** | Locks the interview into an immutable Seed (goal, constraints, acceptance criteria). Cannot be modified after approval. |
| **Seal** | Generates holdout test scenarios via a model family excluded from implementation. Encrypts them. Implementation agents never see the keys or plaintext. |
| **Decompose** | 2-pass breakdown: first into logical molecules, then into atomic Beads with dependency edges. Produces a parallel DAG validated for cycles and coverage. |
| **Execute** | Claims and runs each ready Bead via Inngest durable steps. Agents get context-assembled working trees; merges are serialized via a topological merge queue. |
| **Evaluate** | Decrypts holdout tests, runs them against the implementation. Scores goal attainment. Enforces model diversity (evaluator != implementer family). |
| **Evolve** | Tiered mutation loop: targeted AC rewrite → full spec regeneration → lateral thinking personas → meta-judge convergence. Escalates to user if stuck. |

## Key Features

- **Socratic Interview** — Multi-perspective AI questioning (researcher, simplifier, architect, breadth-keeper, seed-closer) with ambiguity scoring across 3 dimensions. Gathering doesn't end until the spec is clear.
- **Immutable Seeds** — Crystallized specs that cannot be modified after approval. The implementation pipeline always runs against a locked contract.
- **Cross-Model Holdout Testing** — Test scenarios encrypted with AES-256-GCM using a key the implementation agents can't access. A different model family generates the tests; a different family runs them. No cheating possible.
- **Parallel DAG Execution** — 2-pass task decomposition into a dependency-aware Bead graph. Inngest durable steps handle retries, fan-in, and timeout supervision.
- **Evolutionary Loop** — Tiered mutation strategy (targeted, full-regen, lateral thinking) with divergent personas and meta-judge convergence. Runs until the holdout pass rate crosses the threshold.
- **LLM Gateway** — Multi-provider routing (OpenAI, Anthropic, Google) with failover, circuit breaking, and budget enforcement. `cauldron.config.ts` maps each pipeline stage to a model family.
- **Web Dashboard** — Real-time DAG visualization (React Flow + Dagre auto-layout), SSE streaming, interview UI, evolution timeline, cost tracking.
- **CLI** — Full pipeline control from terminal. 14 commands covering every stage from interview to evolution.

## Monorepo Structure

```
packages/
├── shared/    @get-cauldron/shared  — DB schema (Drizzle + PostgreSQL), migrations, event store, shared types
├── engine/    @get-cauldron/engine  — Core AI orchestration: interview, decomposition, holdout, execution, evolution, gateway
├── cli/       @get-cauldron/cli    — 14 CLI commands + embedded Hono server on :3001 for Inngest handlers
└── web/       @get-cauldron/web    — Next.js 16 dashboard, tRPC API, SSE streaming, DAG visualization
```

**Dependency graph:** `shared` ← `engine` ← `cli`, `web`

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, shadcn/ui, @xyflow/react 12 |
| API | tRPC 11 (dashboard ↔ backend), Hono (agent workers) |
| AI | Vercel AI SDK 6, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google` |
| Database | PostgreSQL, Drizzle ORM 0.45, `postgres` driver |
| Validation | Zod 4 |
| Jobs | Inngest 4, Redis (ioredis) |
| Logging | Pino (structured JSON) |
| Testing | Vitest 4, Playwright 1.58, @testing-library/react |
| Build | Turborepo, pnpm workspaces, TypeScript 6, tsx |
| Crypto | `node:crypto` AES-256-GCM (no external crypto deps) |

## Quickstart

### Prerequisites

- Node.js 22+
- pnpm 10+
- Docker (for Postgres, Redis, Inngest)

### Steps

1. **Clone the repo**
   ```bash
   git clone https://github.com/get-cauldron/cauldron.git
   cd cauldron
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   Fill in your API keys. At minimum you need one provider key to run the pipeline:
   ```
   OPENAI_API_KEY=...
   ANTHROPIC_API_KEY=...
   GOOGLE_GENERATIVE_AI_API_KEY=...
   ```
   Also set `HOLDOUT_ENCRYPTION_KEY` (32-byte hex) for holdout encryption. Generate one:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

4. **Start infrastructure**
   ```bash
   docker compose up -d   # PostgreSQL :5432, Redis :6379, Inngest :8288
   ```

5. **Run database migrations**
   ```bash
   pnpm db:migrate
   ```

6. **Start the web dashboard**
   ```bash
   pnpm dev   # Next.js at localhost:3000
   ```

   Or use the CLI directly:
   ```bash
   pnpm -F @get-cauldron/cli cauldron interview start
   ```

## CLI Commands

Run all commands via `pnpm -F @get-cauldron/cli cauldron <command>`.

| Command | Description |
|---------|-------------|
| `interview start` | Begin a new Socratic requirements session |
| `interview resume` | Continue an in-progress interview |
| `crystallize` | Lock interview into an immutable Seed spec |
| `seal` | Generate and encrypt holdout tests for a Seed |
| `decompose` | Break a Seed into a parallel Bead DAG |
| `execute` | Dispatch ready Beads via Inngest durable steps |
| `run` | Full pipeline: seal → decompose → execute → evaluate |
| `status` | Show project and Bead status |
| `logs` | Stream execution logs (SSE) |
| `evolve` | Trigger an evolution cycle against current results |
| `kill` | Cancel a running execution |
| `resolve` | Resolve a merge conflict in the Bead queue |
| `costs` | Show LLM usage and cost breakdown |
| `projects` | List all projects |

## Development

```bash
pnpm build          # Build all packages (Turborepo)
pnpm typecheck      # Type-check all packages
pnpm lint           # Lint all packages
pnpm test           # Unit tests (Vitest)
```

**Integration tests** require a running Docker Postgres on :5433:
```bash
docker compose up -d
pnpm test:integration
```

**E2E tests** run against localhost:3000 via Playwright:
```bash
pnpm -F @get-cauldron/web test:e2e
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code standards, and PR guidelines.

## License

License TBD.
