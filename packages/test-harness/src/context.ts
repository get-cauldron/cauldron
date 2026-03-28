import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from '@get-cauldron/shared';
import { sql } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { appRouter } from '@get-cauldron/web/src/trpc/router';
import { createScriptedGateway } from './gateway.js';
import { fixtures } from './fixtures.js';
import type { MockGatewayCall } from './gateway.js';
import type { LLMGateway } from '@get-cauldron/engine';

// ─── DB Helpers (copied from shared/__tests__/setup.ts) ──────────────────────

const TEST_DATABASE_URL =
  process.env['TEST_DATABASE_URL'] ?? 'postgres://cauldron:cauldron@localhost:5433/cauldron_test';

function createTestDb() {
  const client = postgres(TEST_DATABASE_URL);
  const db = drizzle({ client, schema });
  return { client, db };
}

async function runMigrations(db: ReturnType<typeof drizzle>) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  // Migrations live in packages/shared/src/db/migrations (two levels up from test-harness/src)
  const migrationsFolder = path.resolve(__dirname, '../../shared/src/db/migrations');
  await migrate(db, { migrationsFolder });
}

async function truncateAll(db: ReturnType<typeof drizzle>) {
  await db.execute(
    sql`TRUNCATE TABLE llm_usage, project_snapshots, events, holdout_vault, bead_edges, beads, seeds, interviews, projects RESTART IDENTITY CASCADE`,
  );
}

// ─── Test Context ─────────────────────────────────────────────────────────────

export interface TestContext {
  /** tRPC caller — call procedures directly: ctx.caller.interview.sendAnswer(...) */
  caller: ReturnType<typeof appRouter.createCaller>;
  /** Direct DB access for assertions */
  db: ReturnType<typeof createTestDb>['db'];
  /** Data factory */
  fixtures: ReturnType<typeof fixtures>;
  /** The mock gateway instance — use gateway.assertAllConsumed() in afterEach */
  gateway: LLMGateway & { assertAllConsumed: () => void };
  /** Truncate all tables (call in afterEach) */
  truncate: () => Promise<void>;
  /** Close DB connection (call in afterAll) */
  cleanup: () => Promise<void>;
}

export interface TestContextOptions {
  /** Gateway script for this test context. Can be replaced per-test by creating a new context. */
  gatewayScript?: MockGatewayCall[];
}

/**
 * Creates a full tRPC test context with:
 * - Real PostgreSQL test database (port 5433)
 * - Real tRPC router + real engine code
 * - Mocked LLM gateway (scripted responses)
 * - Data fixtures for setup
 */
export async function createTestContext(options?: TestContextOptions): Promise<TestContext> {
  const testDb = createTestDb();
  await runMigrations(testDb.db);

  const gateway = createScriptedGateway(options?.gatewayScript ?? []);

  const mockConfig = {
    models: {
      interview: ['test-model'],
      holdout: ['test-holdout-model'],
      implementation: ['test-impl-model'],
      evaluation: ['test-eval-model'],
      decomposition: ['test-decomp-model'],
      context_assembly: ['test-model'],
      conflict_resolution: ['test-model'],
    },
    budget: { defaultLimitCents: 1000 },
  };

  const mockLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    trace: () => {},
    fatal: () => {},
    child: function () {
      return mockLogger;
    },
  };

  // Create a tRPC caller with real DB but mock engine deps
  const caller = appRouter.createCaller({
    db: testDb.db as any,
    authenticated: true,
    getEngineDeps: async () => ({
      gateway: gateway as unknown as LLMGateway,
      config: mockConfig as any,
      logger: mockLogger as any,
    }),
  });

  const fix = fixtures(testDb.db as any);

  return {
    caller,
    db: testDb.db,
    fixtures: fix,
    gateway,
    truncate: () => truncateAll(testDb.db),
    cleanup: async () => {
      await truncateAll(testDb.db);
      await testDb.client.end();
    },
  };
}
