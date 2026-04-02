import { execFile } from 'node:child_process';
import Redis from 'ioredis';
import { Ollama } from 'ollama';
import { sql } from 'drizzle-orm';
import { db, ensureMigrations } from '@get-cauldron/shared';
import { isServerRunning } from './server-check.js';

const REQUIRED_TABLES = [
  'projects', 'seeds', 'interviews', 'beads', 'bead_edges',
  'events', 'holdout_vault', 'project_snapshots',
] as const;

const INNGEST_DEV_SERVER_URL = 'http://localhost:8288/v1/events';
const ENGINE_SERVER_URL = 'http://localhost:3001/api/inngest';
const AI_PROVIDER_KEYS = [
  'ANTHROPIC_API_KEY',
  'MISTRAL_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
] as const;

function exitWithError(message: string, detail?: unknown): void {
  if (detail === undefined) {
    console.error(message);
  } else {
    console.error(message, detail);
  }
  process.exit(1);
}

function warnOptionalPrerequisites(): void {
  const hasAiKey = AI_PROVIDER_KEYS.some((key) => Boolean(process.env[key]?.trim()));
  if (!hasAiKey) {
    console.warn(
      'Warning: No AI provider API key configured. Set ANTHROPIC_API_KEY, MISTRAL_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY before running the pipeline.'
    );
  }

  if (!process.env['HOLDOUT_ENCRYPTION_KEY']?.trim()) {
    console.warn(
      'Warning: HOLDOUT_ENCRYPTION_KEY is unset. `cauldron seal` will fail until you add it to .env.'
    );
  }
}

async function ensureModels(ollamaHost: string, ollamaModels: string[]): Promise<void> {
  const ollamaClient = new Ollama({ host: ollamaHost });
  const { models } = await ollamaClient.list();
  const presentNames = models.map(m => m.name);

  for (const prefixed of ollamaModels) {
    const modelTag = prefixed.replace(/^ollama:/, '');
    // Ollama list returns names with :latest suffix by default
    const found = presentNames.some(
      n => n === modelTag || n === `${modelTag}:latest` || n.startsWith(`${modelTag}:`)
    );
    if (!found) {
      console.log(`Model ${modelTag} not found locally. Pulling...`);
      const stream = await ollamaClient.pull({ model: modelTag, stream: true });
      for await (const chunk of stream) {
        process.stdout.write(`\r${chunk.status}`);
      }
      console.log(`\n${modelTag} ready.`);
    }
  }
}

async function ensureOllama(config: { models: Record<string, string[]> }): Promise<void> {
  // Scan all model chains for ollama: prefix
  const ollamaModels = Object.values(config.models)
    .flat()
    .filter(m => m.startsWith('ollama:'));
  if (ollamaModels.length === 0) return; // No Ollama models configured — skip

  const ollamaHost = process.env['OLLAMA_HOST'] ?? 'http://localhost:11434';
  try {
    const res = await fetch(`${ollamaHost}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`Ollama returned HTTP ${res.status}`);
  } catch {
    exitWithError(
      `Ollama not reachable at ${ollamaHost}. Ollama is required because your config includes local models: ${ollamaModels.join(', ')}. Start Ollama before running Cauldron.`
    );
    return; // exitWithError calls process.exit but TypeScript doesn't know that
  }

  // D-11: Auto-pull any missing models
  await ensureModels(ollamaHost, ollamaModels);
}

async function ensureCodebaseMemoryBinary(): Promise<void> {
  const binaryPath = process.env['CODEBASE_MEMORY_MCP_BIN'] ?? 'codebase-memory-mcp';

  try {
    await new Promise<void>((resolve, reject) => {
      execFile(binaryPath, ['--version'], (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  } catch {
    exitWithError(
      `codebase-memory-mcp not available at "${binaryPath}". Install it or set CODEBASE_MEMORY_MCP_BIN.`
    );
  }
}

async function ensureRedis(redisUrl: string): Promise<void> {
  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
  });

  try {
    await redis.ping();
  } catch {
    exitWithError(`Redis not reachable at ${redisUrl}. Run: docker compose up -d redis`);
  } finally {
    try {
      await redis.quit();
    } catch {
      redis.disconnect();
    }
  }
}

async function ensureInngestDevServer(): Promise<void> {
  try {
    const res = await fetch(INNGEST_DEV_SERVER_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '[]',
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) {
      throw new Error(`Inngest returned HTTP ${res.status}`);
    }
  } catch {
    exitWithError('Inngest dev server not reachable. Run: docker compose up -d inngest');
  }
}

async function ensureEngineServer(engineServerUrl: string): Promise<void> {
  try {
    const res = await fetch(engineServerUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(2000),
    });
    if (res.status === 404 || res.status >= 500) {
      throw new Error(`Engine server returned HTTP ${res.status}`);
    }
  } catch {
    exitWithError(
      `Engine server not reachable at ${engineServerUrl}. Run: pnpm --filter @get-cauldron/cli serve:engine`
    );
  }
}

export interface HealthCheckOptions {
  serverUrl?: string;
  engineServerUrl?: string;
  config?: { models: Record<string, string[]> };
}

/**
 * Health check for all required Cauldron services.
 * Verifies local env, services, and server prerequisites needed before execution.
 * Auto-runs pending migrations if tables are missing.
 * On failure, prints a human-readable error and exits with code 1.
 */
export async function healthCheck(options: HealthCheckOptions = {}): Promise<void> {
  const serverUrl = options.serverUrl ?? 'http://localhost:3000';
  const engineServerUrl = options.engineServerUrl ?? ENGINE_SERVER_URL;
  const databaseUrl = process.env['DATABASE_URL']?.trim();
  const redisUrl = process.env['REDIS_URL']?.trim();

  if (!databaseUrl) {
    exitWithError('DATABASE_URL is missing. Add it to .env before running Cauldron.');
    return;
  }

  if (!redisUrl) {
    exitWithError('REDIS_URL is missing. Add it to .env before running Cauldron.');
    return;
  }

  if (process.env['INNGEST_DEV'] !== '1') {
    exitWithError('INNGEST_DEV must be set to 1 for local execution.');
    return;
  }

  // Check PostgreSQL reachability
  try {
    await db.execute(sql`SELECT 1`);
  } catch {
    console.error('PostgreSQL not reachable. Run: docker compose up -d postgres');
    process.exit(1);
    return;
  }

  // Check schema completeness — auto-migrate if tables are missing
  try {
    const result = await db.execute(
      sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
    );
    const existing = new Set((result as unknown as Array<{ tablename: string }>).map(r => r.tablename));
    const missing = REQUIRED_TABLES.filter(t => !existing.has(t));

    if (missing.length > 0) {
      console.log(`Running pending migrations (missing: ${missing.join(', ')})...`);
      await ensureMigrations();
      console.log('Migrations applied successfully');
    }
  } catch (err) {
    console.error('Schema check failed:', err);
    process.exit(1);
    return;
  }

  await ensureRedis(redisUrl);

  if (options.config) {
    await ensureOllama(options.config);
  }

  await ensureInngestDevServer();
  await ensureCodebaseMemoryBinary();
  await ensureEngineServer(engineServerUrl);

  const serverOk = await isServerRunning(serverUrl);
  if (!serverOk) {
    console.error(
      `Cauldron web server not reachable at ${serverUrl}. Run: pnpm --filter @get-cauldron/web dev`
    );
    process.exit(1);
    return;
  }

  warnOptionalPrerequisites();
  console.log('All required pre-execution checks passed');
}
