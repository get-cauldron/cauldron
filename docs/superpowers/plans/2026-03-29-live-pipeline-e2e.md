# Live Pipeline E2E Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A single Playwright test that boots the full Cauldron stack, creates a project via the UI, and drives it through the entire pipeline to delivery using real LLM calls with an LLM-simulated user.

**Architecture:** Self-contained test with its own Docker services (Postgres :5435, Redis :6380, Inngest :8290), dev servers, and config overrides. An LLM (Haiku) plays the user role in the interview, answering questions adaptively. The test asserts at every pipeline stage gate and fixes bugs inline.

**Tech Stack:** Playwright, Vercel AI SDK (`ai`, `@ai-sdk/anthropic`), Docker Compose, child_process for server lifecycle

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/engine/src/gateway/config.ts` | Modify | Add `CAULDRON_CONFIG_PATH` env var support to `loadConfig` |
| `packages/web/src/trpc/engine-deps.ts` | Modify | Add `CAULDRON_CONFIG_OVERRIDE` env var support for Next.js config |
| `docker-compose.live-test.yml` | Create | Isolated Docker services for live test (Postgres :5435, Redis :6380, Inngest :8290) |
| `packages/web/playwright.live.config.ts` | Create | Separate Playwright config for live tests (no globalSetup, 45min timeout) |
| `packages/web/e2e/helpers/live-infra.ts` | Create | Docker lifecycle, server lifecycle, health checks, teardown |
| `packages/web/e2e/helpers/simulated-user.ts` | Create | Haiku-based interview answerer |
| `packages/web/e2e/pipeline-live.spec.ts` | Create | The main test file with all pipeline stages |

---

### Task 1: Add Config Override Support

Two small changes to allow the live test to inject cheap models into both the engine server and Next.js server.

**Files:**
- Modify: `packages/engine/src/gateway/config.ts:22-38`
- Modify: `packages/web/src/trpc/engine-deps.ts:62-88`
- Test: Manual — verified by Task 6 when servers start with overridden config

- [ ] **Step 1: Add `CAULDRON_CONFIG_PATH` to `loadConfig`**

In `packages/engine/src/gateway/config.ts`, modify `loadConfig` to check for an env var override before using the default path:

```typescript
export async function loadConfig(projectRoot: string): Promise<GatewayConfig> {
  const configPath = process.env['CAULDRON_CONFIG_PATH'] ?? path.join(projectRoot, 'cauldron.config.ts');
  try {
    const mod = await import(/* webpackIgnore: true */ configPath);
    return mod.default as GatewayConfig;
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ERR_MODULE_NOT_FOUND') {
      const cauldronRoot = path.resolve(import.meta.dirname, '..', '..', '..', '..');
      if (cauldronRoot !== projectRoot) {
        return loadConfig(cauldronRoot);
      }
    }
    throw err;
  }
}
```

The change is one line: `process.env['CAULDRON_CONFIG_PATH'] ?? path.join(...)`. This lets the engine server (Hono :3001) load a test-specific config when the env var is set.

- [ ] **Step 2: Add `CAULDRON_CONFIG_OVERRIDE` to `engine-deps.ts`**

In `packages/web/src/trpc/engine-deps.ts`, add a check at the top of `getEngineDeps()` before the existing try/catch:

```typescript
export async function getEngineDeps(): Promise<{
  gateway: LLMGateway;
  config: GatewayConfig;
  logger: any;
}> {
  if (_gateway && _config && _logger) {
    return { gateway: _gateway, config: _config, logger: _logger };
  }

  // Allow live tests to inject a config without needing loadConfig to work in Next.js
  const configOverride = process.env['CAULDRON_CONFIG_OVERRIDE'];
  if (configOverride) {
    _config = JSON.parse(configOverride) as GatewayConfig;
  } else {
    const projectRoot = process.env['CAULDRON_PROJECT_ROOT'] ?? process.cwd();
    try {
      _config = await loadConfig(projectRoot);
    } catch {
      const { defineConfig } = await import('@get-cauldron/engine');
      _config = defineConfig({
        models: {
          interview: ['claude-sonnet-4-6', 'gpt-4.1'],
          holdout: ['gemini-2.5-pro', 'gpt-4.1'],
          implementation: ['claude-sonnet-4-6', 'gpt-4.1'],
          evaluation: ['gemini-2.5-pro', 'claude-sonnet-4-6'],
          decomposition: ['claude-sonnet-4-6', 'gpt-4.1'],
          context_assembly: ['gpt-4.1-mini', 'gpt-4o-mini'],
          conflict_resolution: ['claude-sonnet-4-6', 'gpt-4.1'],
        },
        budget: { defaultLimitCents: 500 },
        selfBuild: true,
      });
      console.warn('[engine-deps] cauldron.config.ts import failed — using built-in defaults');
    }
  }

  _logger = makeConsoleLogger();
  _gateway = await LLMGateway.create({ db, config: _config, logger: _logger as any, validateKeys: false });

  return { gateway: _gateway, config: _config, logger: _logger };
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS — both changes are backward-compatible (env vars default to undefined, existing behavior unchanged)

- [ ] **Step 4: Run existing tests**

Run: `pnpm -F @get-cauldron/engine test && pnpm -F @get-cauldron/web test`
Expected: PASS — no behavior change when env vars are not set

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/gateway/config.ts packages/web/src/trpc/engine-deps.ts
git commit -m "feat: add config override env vars for live testing"
```

---

### Task 2: Create Docker Compose for Live Test

**Files:**
- Create: `docker-compose.live-test.yml`

- [ ] **Step 1: Create the Docker Compose file**

```yaml
# docker-compose.live-test.yml
# Isolated services for the live pipeline E2E test.
# All ports offset from dev defaults to avoid conflicts.
services:
  postgres-live:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: cauldron
      POSTGRES_PASSWORD: cauldron
      POSTGRES_DB: cauldron_live
    ports:
      - '5435:5432'
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U cauldron']
      interval: 3s
      timeout: 3s
      retries: 10

  redis-live:
    image: redis:7-alpine
    ports:
      - '6380:6379'
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 3s
      timeout: 3s
      retries: 10

  inngest-live:
    image: inngest/inngest:latest
    command: >-
      inngest dev
      -u http://host.docker.internal:3001/api/inngest
      -u http://host.docker.internal:3000/api/inngest
    ports:
      - '8290:8288'
    depends_on:
      redis-live:
        condition: service_healthy
    environment:
      - INNGEST_DEV=1
```

- [ ] **Step 2: Verify it starts cleanly**

Run: `docker compose -f docker-compose.live-test.yml up -d && docker compose -f docker-compose.live-test.yml ps`
Expected: All 3 services healthy

Run: `docker compose -f docker-compose.live-test.yml down -v`
Expected: Clean shutdown

- [ ] **Step 3: Commit**

```bash
git add docker-compose.live-test.yml
git commit -m "infra: add docker-compose for live pipeline E2E test"
```

---

### Task 3: Create Playwright Live Config

**Files:**
- Create: `packages/web/playwright.live.config.ts`

- [ ] **Step 1: Create the config file**

```typescript
import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the live pipeline E2E test.
 *
 * Differences from playwright.config.ts:
 * - No globalSetup — the test manages its own infrastructure
 * - No webServer — the test starts/stops servers itself
 * - 45-minute timeout for the full LLM-driven pipeline
 * - Always captures traces for debugging
 * - Matches only pipeline-live.spec.ts
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: 'pipeline-live.spec.ts',
  fullyParallel: false,       // single test, serial execution
  retries: 0,                 // no retries — fix bugs inline
  workers: 1,
  timeout: 45 * 60_000,       // 45 minutes
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on',               // always capture traces for debugging
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // No webServer — live-infra.ts manages server lifecycle
});
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/playwright.live.config.ts
git commit -m "config: add Playwright config for live pipeline E2E test"
```

---

### Task 4: Create Infrastructure Helpers

**Files:**
- Create: `packages/web/e2e/helpers/live-infra.ts`

- [ ] **Step 1: Create the infrastructure helper**

```typescript
/**
 * Infrastructure lifecycle for the live pipeline E2E test.
 *
 * Manages:
 * - Docker services (Postgres :5435, Redis :6380, Inngest :8290)
 * - Database migrations
 * - Engine server (Hono :3001)
 * - Next.js dev server (:3000)
 * - Pre-flight checks (API keys, port availability)
 *
 * Usage:
 *   const infra = new LiveInfra(LIVE_CONFIG);
 *   await infra.start();   // in test.beforeAll
 *   await infra.stop();    // in test.afterAll
 */
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..', '..');

interface LiveConfig {
  models: Record<string, string[]>;
  budget: { limitCents: number };
  timeouts: Record<string, number>;
  perspectiveModels?: Record<string, string>;
  scoringModel?: string;
}

export class LiveInfra {
  private devServer: ChildProcess | null = null;
  private engineServer: ChildProcess | null = null;
  private readonly config: LiveConfig;
  private readonly dbUrl = 'postgres://cauldron:cauldron@localhost:5435/cauldron_live';

  constructor(config: LiveConfig) {
    this.config = config;
  }

  /**
   * Pre-flight: check API keys exist. Returns list of missing keys.
   */
  static checkApiKeys(): string[] {
    const required = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'];
    return required.filter((key) => !process.env[key]);
  }

  /**
   * Check if a port is available by attempting to connect.
   */
  private async isPortAvailable(port: number): Promise<boolean> {
    const net = await import('node:net');
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(500);
      socket.on('connect', () => { socket.destroy(); resolve(false); });
      socket.on('timeout', () => { socket.destroy(); resolve(true); });
      socket.on('error', () => { socket.destroy(); resolve(true); });
      socket.connect(port, 'localhost');
    });
  }

  /**
   * Wait for a URL to return a successful response.
   */
  private async waitForUrl(url: string, timeoutMs: number, label: string): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch(url);
        if (res.ok || res.status < 500) return;
      } catch {
        // not ready yet
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(`${label} did not become ready at ${url} within ${timeoutMs}ms`);
  }

  /**
   * Wait for a TCP port to accept connections.
   */
  private async waitForPort(port: number, timeoutMs: number, label: string): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const available = await this.isPortAvailable(port);
      if (!available) return; // port is in use = service is listening
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`${label} did not start listening on port ${port} within ${timeoutMs}ms`);
  }

  /**
   * Build the env vars for the app servers.
   */
  private buildEnv(): Record<string, string> {
    const configOverride = JSON.stringify({
      models: this.config.models,
      budget: { defaultLimitCents: this.config.budget.limitCents },
      perspectiveModels: this.config.perspectiveModels ?? {
        researcher: this.config.models.interview[0],
        simplifier: this.config.models.interview[0],
        architect: this.config.models.interview[0],
        'breadth-keeper': this.config.models.interview[0],
        'seed-closer': this.config.models.interview[0],
      },
      scoringModel: this.config.scoringModel ?? this.config.models.interview[0],
      selfBuild: false,
    });

    return {
      ...process.env as Record<string, string>,
      DATABASE_URL: this.dbUrl,
      REDIS_URL: 'redis://localhost:6380',
      INNGEST_DEV: '1',
      INNGEST_BASE_URL: 'http://localhost:8290',
      CAULDRON_CONFIG_OVERRIDE: configOverride,
      CAULDRON_CONFIG_PATH: '', // clear so loadConfig uses the override
      LOG_LEVEL: 'info',
      NODE_ENV: 'development',
    };
  }

  /**
   * Start all infrastructure. Call in test.beforeAll.
   */
  async start(): Promise<void> {
    // 1. Check ports are available
    for (const [port, label] of [[3000, 'Next.js'], [3001, 'Engine']] as const) {
      if (!(await this.isPortAvailable(port))) {
        throw new Error(`Port ${port} (${label}) is already in use. Stop existing servers first.`);
      }
    }

    // 2. Start Docker services
    console.log('[live-infra] Starting Docker services...');
    execSync('docker compose -f docker-compose.live-test.yml up -d --wait', {
      cwd: REPO_ROOT,
      stdio: 'pipe',
      timeout: 60_000,
    });

    // 3. Wait for Postgres to accept connections
    await this.waitForPort(5435, 30_000, 'Postgres');

    // 4. Run DB migrations
    console.log('[live-infra] Running database migrations...');
    const migrationClient = postgres(this.dbUrl, { onnotice: () => {} });
    const migrationDb = drizzle({ client: migrationClient });
    const migrationsFolder = resolve(REPO_ROOT, 'packages/shared/src/db/migrations');
    try {
      await migrate(migrationDb, { migrationsFolder });
    } finally {
      await migrationClient.end();
    }

    // 5. Start engine server (Hono :3001)
    console.log('[live-infra] Starting engine server on :3001...');
    const env = this.buildEnv();
    this.engineServer = spawn('pnpm', ['-F', '@get-cauldron/cli', 'serve:engine'], {
      cwd: REPO_ROOT,
      env,
      stdio: 'pipe',
    });
    this.engineServer.stdout?.on('data', (d: Buffer) => process.stdout.write(`[engine] ${d}`));
    this.engineServer.stderr?.on('data', (d: Buffer) => process.stderr.write(`[engine:err] ${d}`));
    await this.waitForPort(3001, 30_000, 'Engine server');

    // 6. Wait for Inngest to be ready
    await this.waitForPort(8290, 30_000, 'Inngest');

    // 7. Start Next.js dev server (:3000)
    console.log('[live-infra] Starting Next.js dev server on :3000...');
    this.devServer = spawn('pnpm', ['-F', '@get-cauldron/web', 'dev'], {
      cwd: REPO_ROOT,
      env,
      stdio: 'pipe',
    });
    this.devServer.stdout?.on('data', (d: Buffer) => process.stdout.write(`[next] ${d}`));
    this.devServer.stderr?.on('data', (d: Buffer) => process.stderr.write(`[next:err] ${d}`));
    await this.waitForUrl('http://localhost:3000', 60_000, 'Next.js dev server');

    console.log('[live-infra] All infrastructure ready.');
  }

  /**
   * Stop all infrastructure. Call in test.afterAll.
   */
  async stop(preserveOnFailure = false): Promise<void> {
    console.log('[live-infra] Stopping infrastructure...');

    // Stop servers
    if (this.devServer) {
      this.devServer.kill('SIGTERM');
      this.devServer = null;
    }
    if (this.engineServer) {
      this.engineServer.kill('SIGTERM');
      this.engineServer = null;
    }

    // Stop Docker
    if (!preserveOnFailure) {
      try {
        execSync('docker compose -f docker-compose.live-test.yml down -v', {
          cwd: REPO_ROOT,
          stdio: 'pipe',
          timeout: 30_000,
        });
      } catch (err) {
        console.warn('[live-infra] Docker compose down failed:', err);
      }
    } else {
      console.log('[live-infra] Preserving Docker containers for post-mortem.');
    }
  }

  /**
   * Truncate all tables for a clean state.
   */
  async truncate(): Promise<void> {
    const client = postgres(this.dbUrl);
    try {
      await client.unsafe(
        `TRUNCATE TABLE llm_usage, project_snapshots, events, holdout_vault, bead_edges, beads, seeds, interviews, projects RESTART IDENTITY CASCADE`
      );
    } finally {
      await client.end();
    }
  }
}
```

- [ ] **Step 2: Run typecheck to verify imports**

Run: `cd packages/web && npx tsc --noEmit --skipLibCheck e2e/helpers/live-infra.ts 2>&1 || echo 'Type issues to fix'`

Note: Playwright test files use their own tsconfig. Check that `drizzle-orm`, `postgres`, and `node:*` imports resolve. If there are issues, they'll be caught when we first run the test.

- [ ] **Step 3: Commit**

```bash
git add packages/web/e2e/helpers/live-infra.ts
git commit -m "feat: add infrastructure lifecycle helper for live E2E test"
```

---

### Task 5: Create Simulated User Helper

**Files:**
- Create: `packages/web/e2e/helpers/simulated-user.ts`

- [ ] **Step 1: Create the simulated user helper**

```typescript
/**
 * LLM-based simulated user for the live pipeline E2E test.
 *
 * Uses Claude Haiku (Anthropic) to play the "human" role in the interview,
 * reading each question and providing contextual answers. The simulated
 * user never shares a provider with the interviewer (OpenAI).
 */
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

interface SimulatedUserConfig {
  model: string;
  persona: string;
}

/**
 * Generate a simulated user answer for an interview question.
 *
 * @param question - The interviewer's question text
 * @param config - Model and persona configuration
 * @param conversationHistory - Previous Q&A pairs for context
 * @returns The simulated user's answer text
 */
export async function getSimulatedAnswer(
  question: string,
  config: SimulatedUserConfig,
  conversationHistory: Array<{ question: string; answer: string }> = [],
): Promise<string> {
  const historyContext = conversationHistory.length > 0
    ? `\n\nPrevious conversation:\n${conversationHistory.map(
        (h) => `Q: ${h.question}\nA: ${h.answer}`
      ).join('\n\n')}`
    : '';

  const { text } = await generateText({
    model: anthropic(config.model),
    prompt: `${config.persona}${historyContext}\n\nThe interviewer now asks: "${question}"\n\nRespond concisely (1-3 sentences). Be specific and direct:`,
    maxTokens: 200,
  });

  return text.trim();
}

/**
 * Determine if a simulated answer matches any of the MC chip options closely enough
 * to click instead of typing freeform.
 *
 * Uses simple keyword overlap — not LLM-based, to avoid extra cost.
 * Returns the best-matching chip text, or null if no good match.
 */
export function findMatchingChip(
  answer: string,
  chipTexts: string[],
): string | null {
  const answerWords = new Set(answer.toLowerCase().split(/\s+/));

  let bestMatch: string | null = null;
  let bestScore = 0;

  for (const chip of chipTexts) {
    const chipWords = chip.toLowerCase().split(/\s+/);
    const overlap = chipWords.filter((w) => answerWords.has(w)).length;
    const score = overlap / chipWords.length;
    if (score > bestScore && score >= 0.5) {
      bestScore = score;
      bestMatch = chip;
    }
  }

  return bestMatch;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/e2e/helpers/simulated-user.ts
git commit -m "feat: add LLM-based simulated user for live E2E interview"
```

---

### Task 6: Create Test File — Setup + Project Creation + Interview

**Files:**
- Create: `packages/web/e2e/pipeline-live.spec.ts`

- [ ] **Step 1: Create the test file with config, setup, and interview stage**

```typescript
/**
 * Live Pipeline E2E Test
 *
 * A single test that boots the full Cauldron stack and drives a URL shortener
 * project through the entire pipeline using real LLM calls.
 *
 * - Simulated user: Claude Haiku (Anthropic) — never same provider as interviewer
 * - Pipeline models: ultra-cheap (gpt-4.1-mini, gemini-2.5-flash)
 * - Infrastructure: self-contained Docker + dev servers
 *
 * Run: pnpm -F @get-cauldron/web exec playwright test --config playwright.live.config.ts
 *
 * Prerequisites:
 * - API keys set: OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY
 * - Docker available
 * - Ports 3000, 3001, 5435, 6380, 8290 available
 */
import { test, expect } from '@playwright/test';
import { LiveInfra } from './helpers/live-infra';
import { getSimulatedAnswer, findMatchingChip } from './helpers/simulated-user';
import { ROUTES } from './helpers/routes';

// ────────────────────────────────────────────────────────────────────────────
// Configuration — swap models and project concept here
// ────────────────────────────────────────────────────────────────────────────

const LIVE_CONFIG = {
  project: {
    name: 'URL Shortener Library',
    description:
      'A TypeScript library with shorten(url) and expand(code) functions using an in-memory store',
  },

  simulatedUser: {
    model: 'claude-haiku-4-5',
    persona: `You are a developer who wants a URL shortener library in TypeScript.
Key requirements: shorten(url) returns a short code, expand(code) returns original URL,
in-memory Map storage, collision-resistant codes (nanoid or similar), input validation.
Answer concisely (1-3 sentences). If asked about constraints, mention: no external DB,
no HTTP server, just a pure library. If asked about success criteria, mention: unit tests
should cover round-trip shorten→expand, duplicate URLs, and invalid input.`,
  },

  models: {
    interview: ['gpt-4.1-mini'],
    holdout: ['gemini-2.5-flash'],
    implementation: ['gpt-4.1-mini'],
    evaluation: ['gemini-2.5-flash'],
    decomposition: ['gpt-4.1-mini'],
    context_assembly: ['gpt-4.1-mini'],
    conflict_resolution: ['gpt-4.1-mini'],
  },

  perspectiveModels: {
    researcher: 'gpt-4.1-mini',
    simplifier: 'gpt-4.1-mini',
    architect: 'gpt-4.1-mini',
    'breadth-keeper': 'gpt-4.1-mini',
    'seed-closer': 'gpt-4.1-mini',
  },

  scoringModel: 'gpt-4.1-mini',

  timeouts: {
    interview: 5 * 60_000,
    crystallize: 2 * 60_000,
    holdouts: 3 * 60_000,
    decomposition: 3 * 60_000,
    execution: 15 * 60_000,
    evaluation: 5 * 60_000,
    evolution: 10 * 60_000,
  },

  budget: { limitCents: 1500 },
  maxInterviewTurns: 15,
};

// ────────────────────────────────────────────────────────────────────────────
// Pre-flight: skip if API keys are missing
// ────────────────────────────────────────────────────────────────────────────

const missingKeys = LiveInfra.checkApiKeys();
const SKIP = missingKeys.length > 0;
if (SKIP) {
  console.warn(
    `[pipeline-live] Skipping: missing API keys: ${missingKeys.join(', ')}`
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Test suite
// ────────────────────────────────────────────────────────────────────────────

test.describe('Live Pipeline E2E', () => {
  test.skip(() => SKIP, 'Requires API keys: OPENAI, ANTHROPIC, GOOGLE');
  test.describe.configure({ mode: 'serial' });

  const infra = new LiveInfra({
    models: LIVE_CONFIG.models,
    budget: LIVE_CONFIG.budget,
    timeouts: LIVE_CONFIG.timeouts,
    perspectiveModels: LIVE_CONFIG.perspectiveModels,
    scoringModel: LIVE_CONFIG.scoringModel,
  });

  let projectId: string;
  let testFailed = false;

  test.beforeAll(async () => {
    await infra.start();
  });

  test.afterAll(async () => {
    await infra.stop(testFailed);
  });

  // ── Stage 1: Create Project ─────────────────────────────────────────────

  test('Stage 1: Create project via UI', async ({ page }) => {
    try {
      await page.goto(ROUTES.newProject);

      // Fill in project name
      const nameInput = page.getByRole('textbox', { name: /project name/i });
      await expect(nameInput).toBeVisible({ timeout: 10_000 });
      await nameInput.fill(LIVE_CONFIG.project.name);

      // Fill in description
      const descInput = page.getByRole('textbox', { name: /description/i });
      await descInput.fill(LIVE_CONFIG.project.description);

      // Click create
      const createButton = page.getByRole('button', { name: /start building/i });
      await expect(createButton).toBeEnabled();
      await createButton.click();

      // Wait for redirect to interview page
      await page.waitForURL(/\/projects\/[\w-]+\/interview/, {
        timeout: 15_000,
      });

      // Extract project ID from URL
      const url = page.url();
      const match = url.match(/\/projects\/([\w-]+)\/interview/);
      expect(match).toBeTruthy();
      projectId = match![1];

      console.log(`[pipeline-live] Project created: ${projectId}`);
    } catch (err) {
      testFailed = true;
      throw err;
    }
  });

  // ── Stage 2: Interview Loop ─────────────────────────────────────────────

  test('Stage 2: Complete interview with simulated user', async ({ page }) => {
    try {
      expect(projectId).toBeTruthy();
      await page.goto(ROUTES.interview(projectId));

      // Wait for interview to auto-start and first question to appear
      // The interview page auto-calls startInterview on mount
      const chatArea = page.locator('[data-testid="chat-area"]').or(
        page.locator('.flex-1') // fallback to layout-based selector
      );
      await expect(chatArea).toBeVisible({ timeout: 30_000 });

      // Wait for first AI message (system message bubble)
      // Interview questions appear as left-aligned messages
      await page.waitForTimeout(3000); // allow startInterview mutation to complete

      const conversationHistory: Array<{ question: string; answer: string }> = [];
      let turn = 0;
      let crystallized = false;

      while (turn < LIVE_CONFIG.maxInterviewTurns && !crystallized) {
        turn++;
        console.log(`[pipeline-live] Interview turn ${turn}...`);

        // Wait for the latest AI question to appear
        // AI messages are rendered as chat bubbles — find the last one
        const aiMessages = page.locator('[data-testid="system-message"]').or(
          page.locator('div').filter({ has: page.locator('[data-testid="perspective-avatar"]') })
        );

        // Wait for at least `turn` messages (the new question)
        // Use a generous timeout since LLM generation takes time
        await expect(async () => {
          const count = await aiMessages.count();
          expect(count).toBeGreaterThanOrEqual(turn);
        }).toPass({ timeout: LIVE_CONFIG.timeouts.interview / LIVE_CONFIG.maxInterviewTurns });

        // Extract the last question text
        const lastMessage = aiMessages.last();
        const questionText = await lastMessage.innerText();
        console.log(`[pipeline-live] Q${turn}: ${questionText.slice(0, 100)}...`);

        // Check if clarity banner appeared (threshold met)
        const clarityBanner = page.getByText(/clarity|crystallize seed/i);
        if (await clarityBanner.isVisible({ timeout: 1000 }).catch(() => false)) {
          console.log('[pipeline-live] Clarity threshold met — crystallizing');
          const crystallizeButton = page.getByRole('button', { name: /crystallize seed/i });
          await crystallizeButton.click();
          crystallized = true;
          break;
        }

        // Generate simulated user answer via Haiku
        const answer = await getSimulatedAnswer(
          questionText,
          LIVE_CONFIG.simulatedUser,
          conversationHistory,
        );
        console.log(`[pipeline-live] A${turn}: ${answer.slice(0, 100)}...`);

        // Check for MC chips and try to click a matching one
        const mcChips = page.locator('button').filter({ hasText: /^(?!Send|Sending|Crystallize|Keep|Approve|Reject|Seal)/ });
        const chipTexts: string[] = [];
        const chipCount = await mcChips.count();
        // Gather chip texts (MC suggestions are typically short phrases)
        for (let i = 0; i < chipCount; i++) {
          const text = await mcChips.nth(i).innerText();
          if (text.length < 100 && text.length > 2) { // filter to likely MC chips
            chipTexts.push(text);
          }
        }

        const matchingChip = findMatchingChip(answer, chipTexts);

        if (matchingChip) {
          console.log(`[pipeline-live] Clicking MC chip: "${matchingChip}"`);
          await page.getByText(matchingChip, { exact: true }).click();
        } else {
          // Type freeform answer
          const answerInput = page.getByRole('textbox', { name: /interview answer|type your answer/i });
          await expect(answerInput).toBeVisible({ timeout: 5000 });
          await answerInput.fill(answer);

          const sendButton = page.getByRole('button', { name: /send answer/i });
          await expect(sendButton).toBeEnabled({ timeout: 2000 });
          await sendButton.click();
        }

        conversationHistory.push({ question: questionText, answer });

        // Wait for "thinking" indicator to appear and disappear
        // This confirms the server received and processed the answer
        const thinkingIndicator = page.getByText(/thinking/i).or(
          page.locator('[data-testid="thinking-indicator"]')
        );
        // Wait for it to appear (may be very brief)
        await thinkingIndicator.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {
          // Thinking indicator may be too brief to catch — that's OK
        });
        // Wait for it to disappear (answer processed)
        await thinkingIndicator.waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {
          // May already be hidden
        });

        // Check again for clarity banner after the turn
        if (await clarityBanner.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log('[pipeline-live] Clarity threshold met — crystallizing');
          const crystallizeButton = page.getByRole('button', { name: /crystallize seed/i });
          await crystallizeButton.click();
          crystallized = true;
        }
      }

      // Assert interview completed
      expect(crystallized).toBe(true);
      console.log(`[pipeline-live] Interview completed in ${turn} turns`);
    } catch (err) {
      testFailed = true;
      throw err;
    }
  });

  // Stages 3-6 will be added in subsequent tasks
});
```

- [ ] **Step 2: Verify the test file parses correctly**

Run: `cd packages/web && npx playwright test --list --config playwright.live.config.ts 2>&1`
Expected: Lists "Stage 1: Create project via UI" and "Stage 2: Complete interview with simulated user"

- [ ] **Step 3: Commit**

```bash
git add packages/web/e2e/pipeline-live.spec.ts
git commit -m "feat: add live pipeline E2E test — project creation + interview stages"
```

---

### Task 7: Add Crystallization + Holdout Stages

**Files:**
- Modify: `packages/web/e2e/pipeline-live.spec.ts`

- [ ] **Step 1: Add Stage 3 (Seed Approval) after Stage 2**

Insert after the Stage 2 test, before the closing `});` of the describe block:

```typescript
  // ── Stage 3: Approve Seed ───────────────────────────────────────────────

  test('Stage 3: Review and approve crystallized seed', async ({ page }) => {
    try {
      expect(projectId).toBeTruthy();
      await page.goto(ROUTES.interview(projectId));

      // The seed approval card should be visible (phase = reviewing)
      const seedCard = page.getByText(/seed summary/i).or(
        page.locator('[data-testid="seed-approval-card"]')
      );
      await expect(seedCard).toBeVisible({
        timeout: LIVE_CONFIG.timeouts.crystallize,
      });

      // Verify the seed has content
      const goalText = page.getByText(/goal/i);
      await expect(goalText).toBeVisible();

      // Click "Crystallize Seed" / "Approve" button
      const approveButton = page.getByRole('button', { name: /crystallize seed|approve/i });
      await expect(approveButton).toBeVisible();
      await approveButton.click();

      // Wait for phase to transition to crystallized
      // The holdout cards should appear
      await expect(
        page.getByText(/holdout test review/i).or(
          page.getByText(/holdout/i)
        )
      ).toBeVisible({ timeout: LIVE_CONFIG.timeouts.crystallize });

      console.log('[pipeline-live] Seed approved and crystallized');
    } catch (err) {
      testFailed = true;
      throw err;
    }
  });
```

- [ ] **Step 2: Add Stage 4 (Holdout Review + Seal)**

Insert after Stage 3:

```typescript
  // ── Stage 4: Approve and Seal Holdouts ──────────────────────────────────

  test('Stage 4: Approve holdout scenarios and seal vault', async ({ page }) => {
    try {
      expect(projectId).toBeTruthy();
      await page.goto(ROUTES.interview(projectId));

      // Wait for holdout cards to render
      const holdoutSection = page.getByText(/holdout/i);
      await expect(holdoutSection).toBeVisible({
        timeout: LIVE_CONFIG.timeouts.holdouts,
      });

      // Find all holdout cards and approve each
      // Each card has an "Approve" button
      const approveButtons = page.getByRole('button', { name: /^approve$/i });

      // Wait for at least one holdout card to appear
      await expect(async () => {
        const count = await approveButtons.count();
        expect(count).toBeGreaterThan(0);
      }).toPass({ timeout: LIVE_CONFIG.timeouts.holdouts });

      const holdoutCount = await approveButtons.count();
      console.log(`[pipeline-live] Found ${holdoutCount} holdout scenarios`);

      // Approve each holdout
      for (let i = 0; i < holdoutCount; i++) {
        // Cards may need to be expanded first
        const expandButtons = page.locator('[data-testid="holdout-expand"]').or(
          page.locator('button').filter({ hasText: /scenario/i })
        );
        if (await expandButtons.nth(i).isVisible().catch(() => false)) {
          await expandButtons.nth(i).click();
        }

        // Click approve on the i-th holdout
        // After clicking, the button may change to "Approved"
        const btn = approveButtons.nth(0); // always click first available
        if (await btn.isVisible().catch(() => false)) {
          await btn.click();
          await page.waitForTimeout(500); // brief pause for state update
        }
      }

      // Click "Seal Holdout Tests" button
      const sealButton = page.getByRole('button', { name: /seal holdout/i });
      await expect(sealButton).toBeVisible({ timeout: 10_000 });
      await sealButton.click();

      // Wait for seal confirmation
      // Phase should show "crystallized" and holdouts sealed
      await expect(
        page.getByText(/sealed/i).or(
          page.getByText(/seed crystallized/i)
        )
      ).toBeVisible({ timeout: LIVE_CONFIG.timeouts.holdouts });

      console.log('[pipeline-live] Holdouts approved and sealed');
    } catch (err) {
      testFailed = true;
      throw err;
    }
  });
```

- [ ] **Step 3: Verify test list**

Run: `cd packages/web && npx playwright test --list --config playwright.live.config.ts 2>&1`
Expected: Lists all 4 stages

- [ ] **Step 4: Commit**

```bash
git add packages/web/e2e/pipeline-live.spec.ts
git commit -m "feat: add crystallization + holdout stages to live E2E test"
```

---

### Task 8: Add Decomposition + Execution + Terminal Stages

**Files:**
- Modify: `packages/web/e2e/pipeline-live.spec.ts`

- [ ] **Step 1: Add Stage 5 (Decomposition + Execution)**

Insert after Stage 4:

```typescript
  // ── Stage 5: Decompose and Execute Beads ────────────────────────────────

  test('Stage 5: Trigger decomposition and execute beads', async ({ page }) => {
    try {
      expect(projectId).toBeTruthy();

      // Navigate to execution page
      await page.goto(ROUTES.execution(projectId));

      // The execution page should show a DAG visualization
      // First, it may need decomposition to be triggered
      // Look for a "Trigger Decomposition" button or auto-trigger
      const triggerButton = page.getByRole('button', { name: /decompose|trigger|start/i });
      if (await triggerButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        console.log('[pipeline-live] Triggering decomposition...');
        await triggerButton.click();
      }

      // Wait for bead nodes to appear in the DAG
      // Beads render as nodes in the @xyflow/react canvas
      await expect(async () => {
        // Look for bead nodes in the DAG canvas
        const beadNodes = page.locator('[data-testid="bead-node"]').or(
          page.locator('.react-flow__node')
        );
        const count = await beadNodes.count();
        expect(count).toBeGreaterThan(0);
      }).toPass({ timeout: LIVE_CONFIG.timeouts.decomposition });

      const nodeCount = await page.locator('[data-testid="bead-node"]').or(
        page.locator('.react-flow__node')
      ).count();
      console.log(`[pipeline-live] DAG rendered with ${nodeCount} beads`);

      // Wait for beads to execute — watch for status transitions
      // Poll until no beads are in pending/claimed/executing state
      console.log('[pipeline-live] Waiting for bead execution...');

      await expect(async () => {
        // Refresh the page to get latest bead statuses
        await page.reload();
        await page.waitForTimeout(2000); // let the page render

        // Check for any beads still in progress
        const pendingBeads = page.locator('[data-testid="bead-status-pending"]').or(
          page.locator('.react-flow__node').filter({ hasText: /pending|executing|claimed/i })
        );
        const pendingCount = await pendingBeads.count();

        // Check for completed beads
        const completedBeads = page.locator('[data-testid="bead-status-completed"]').or(
          page.locator('.react-flow__node').filter({ hasText: /completed/i })
        );
        const completedCount = await completedBeads.count();

        console.log(`[pipeline-live] Beads: ${completedCount} completed, ${pendingCount} pending`);

        // All beads should be done (completed or failed, not pending)
        expect(pendingCount).toBe(0);
      }).toPass({
        timeout: LIVE_CONFIG.timeouts.execution,
        intervals: [10_000], // check every 10 seconds
      });

      console.log('[pipeline-live] All beads executed');
    } catch (err) {
      testFailed = true;
      throw err;
    }
  });
```

- [ ] **Step 2: Add Stage 6 (Evaluation + Evolution + Terminal State)**

Insert after Stage 5:

```typescript
  // ── Stage 6: Evaluation and Evolution ───────────────────────────────────

  test('Stage 6: Reach terminal state (evaluation/evolution)', async ({ page }) => {
    try {
      expect(projectId).toBeTruthy();

      // Navigate to evolution page
      await page.goto(ROUTES.evolution(projectId));

      // Wait for evaluation results or evolution events to appear
      console.log('[pipeline-live] Waiting for evaluation/evolution...');

      await expect(async () => {
        await page.reload();
        await page.waitForTimeout(3000);

        // Look for any terminal state indicator:
        // - "Goal Met" / "Converged" / "Budget Exceeded" on the evolution page
        // - Evolution timeline showing a completed generation
        // - Convergence panel with results
        const terminalIndicators = [
          page.getByText(/goal.?met/i),
          page.getByText(/converged/i),
          page.getByText(/budget.?exceeded/i),
          page.getByText(/halted/i),
          page.getByText(/evolution.*complete/i),
          page.locator('[data-testid="generation-status"]').filter({
            hasText: /converged|goal_met|halted/i,
          }),
        ];

        let foundTerminal = false;
        for (const indicator of terminalIndicators) {
          if (await indicator.isVisible().catch(() => false)) {
            const text = await indicator.innerText();
            console.log(`[pipeline-live] Terminal state reached: ${text}`);
            foundTerminal = true;
            break;
          }
        }

        // Also check if we're in an evolution cycle (not terminal yet but progressing)
        if (!foundTerminal) {
          const evolutionEvents = page.locator('[data-testid="evolution-event"]').or(
            page.getByText(/generation|evolution.*started|lateral/i)
          );
          const eventCount = await evolutionEvents.count();
          console.log(`[pipeline-live] Evolution events visible: ${eventCount}`);
        }

        expect(foundTerminal).toBe(true);
      }).toPass({
        timeout: LIVE_CONFIG.timeouts.evaluation + LIVE_CONFIG.timeouts.evolution,
        intervals: [15_000], // check every 15 seconds
      });

      console.log('[pipeline-live] Pipeline reached terminal state — test passed!');
    } catch (err) {
      testFailed = true;
      throw err;
    }
  });
```

- [ ] **Step 3: Verify complete test list**

Run: `cd packages/web && npx playwright test --list --config playwright.live.config.ts 2>&1`
Expected: Lists all 6 stages:
- Stage 1: Create project via UI
- Stage 2: Complete interview with simulated user
- Stage 3: Review and approve crystallized seed
- Stage 4: Approve holdout scenarios and seal vault
- Stage 5: Trigger decomposition and execute beads
- Stage 6: Reach terminal state (evaluation/evolution)

- [ ] **Step 4: Commit**

```bash
git add packages/web/e2e/pipeline-live.spec.ts
git commit -m "feat: add decomposition, execution, and terminal stages to live E2E test"
```

---

### Task 9: Add npm Script + First Dry Run

**Files:**
- Modify: `packages/web/package.json`

- [ ] **Step 1: Add the test:live script**

Add to the `scripts` section of `packages/web/package.json`:

```json
"test:live": "playwright test --config playwright.live.config.ts"
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/package.json
git commit -m "chore: add test:live script for live pipeline E2E test"
```

- [ ] **Step 3: First dry run**

Run: `pnpm -F @get-cauldron/web test:live 2>&1`

This will be the first real execution. Expected outcome: the test will likely fail at some stage due to pipeline bugs. When it does:
1. Read the error and Playwright trace
2. Diagnose the root cause
3. Fix the bug in the relevant package
4. Re-run from the failing stage

This is the bug-hunting phase — iterate until the pipeline runs end-to-end.

---

## Execution Notes

- **Task dependency chain:** Tasks 1-5 are independent and can be parallelized. Tasks 6-8 are sequential (each builds on the previous test stages). Task 9 depends on all others.
- **Bug fixing:** When the first dry run (Task 9) surfaces pipeline bugs, fix them inline. Each fix should get its own commit. This is the primary value of the test — proving the plumbing works.
- **Model tuning:** Once the pipeline executes cleanly with cheap models, the config object at the top of the test makes it trivial to upgrade to stronger models or change the project concept.
