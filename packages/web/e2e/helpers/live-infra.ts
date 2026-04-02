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
    const required = ['MISTRAL_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'];
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
      detached: true,
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
      detached: true,
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

    // Stop servers — kill entire process tree (pnpm spawns child node processes)
    for (const [server, label] of [[this.devServer, 'Next.js'], [this.engineServer, 'Engine']] as const) {
      if (server?.pid) {
        try {
          // Kill the entire process group to catch child processes
          process.kill(-server.pid, 'SIGKILL');
        } catch {
          // Process group kill may fail — fall back to direct kill
          try { server.kill('SIGKILL'); } catch { /* already dead */ }
        }
      }
    }
    this.devServer = null;
    this.engineServer = null;

    // Also kill any lingering node processes on our ports (safe — only targets node)
    try {
      execSync(
        "lsof -ti:3000 -ti:3001 -sTCP:LISTEN | xargs -r ps -o pid=,comm= | grep node | awk '{print $1}' | xargs -r kill -9 2>/dev/null || true",
        { stdio: 'pipe', timeout: 5_000 },
      );
    } catch { /* no lingering processes */ }

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
