/**
 * E2E database helpers for Playwright tests.
 *
 * Creates a separate Drizzle client connected to the E2E database (port 5434,
 * DB: cauldron_e2e) so tests can insert seed data and truncate between runs
 * without touching the dev or test databases.
 *
 * Usage:
 *   const db = createE2EDb();
 *   const project = await createTestProject(db);
 *   // ... run test
 *   await truncateE2EDb(db);
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from '@get-cauldron/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// E2E database URL — defaults to the postgres-e2e docker-compose service
const E2E_DATABASE_URL =
  process.env['E2E_DATABASE_URL'] ??
  'postgres://cauldron:cauldron@localhost:5434/cauldron_e2e';

export type E2EDb = ReturnType<typeof createE2EDb>;

/**
 * Create a Drizzle client connected to the E2E database.
 * Call this once per test file in `test.beforeAll` and pass to helpers.
 */
export function createE2EDb() {
  const client = postgres(E2E_DATABASE_URL);
  return drizzle({ client, schema });
}

/**
 * Run all Drizzle migrations against the E2E database.
 * Safe to call multiple times — already-applied migrations are skipped.
 * Run this in `test.beforeAll` before any factory functions.
 */
export async function runMigrations(db: E2EDb): Promise<void> {
  const connectionString = E2E_DATABASE_URL;
  const migrationsFolder = path.resolve(
    __dirname,
    '../../../../packages/shared/src/db/migrations'
  );
  const migrationClient = postgres(connectionString, { onnotice: () => {} });
  const migrationDb = drizzle({ client: migrationClient, schema });
  try {
    await migrate(migrationDb, { migrationsFolder });
  } finally {
    await migrationClient.end();
  }
}

/**
 * Truncate all E2E database tables in dependency order.
 * Call this in `test.afterEach` or `test.afterAll` to keep tests isolated.
 */
export async function truncateE2EDb(_db: E2EDb): Promise<void> {
  // Use a fresh client for the truncation to avoid transaction conflicts
  const client = postgres(E2E_DATABASE_URL);
  try {
    await client.unsafe(
      `TRUNCATE TABLE llm_usage, project_snapshots, events, holdout_vault, bead_edges, beads, seeds, interviews, projects RESTART IDENTITY CASCADE`
    );
  } finally {
    await client.end();
  }
}

/**
 * Insert a test project into the E2E database.
 * Returns the full project row.
 */
export async function createTestProject(
  db: E2EDb,
  name?: string
): Promise<typeof schema.projects.$inferSelect> {
  const [project] = await db
    .insert(schema.projects)
    .values({
      name: name ?? `Test Project ${Date.now()}`,
      description: 'Created by E2E test factory',
      settings: {},
    })
    .returning();
  if (!project) throw new Error('createTestProject: insert returned no rows');
  return project;
}

/**
 * Insert a test interview into the E2E database.
 * Returns the full interview row.
 */
export async function createTestInterview(
  db: E2EDb,
  projectId: string
): Promise<typeof schema.interviews.$inferSelect> {
  const [interview] = await db
    .insert(schema.interviews)
    .values({
      projectId,
      mode: 'greenfield',
      status: 'active',
      phase: 'gathering',
      transcript: [],
      ambiguityScoresHistory: [],
      turnCount: 0,
    })
    .returning();
  if (!interview) throw new Error('createTestInterview: insert returned no rows');
  return interview;
}

/**
 * Insert a test seed into the E2E database.
 * Returns the full seed row.
 */
export async function createTestSeed(
  db: E2EDb,
  projectId: string,
  interviewId: string
): Promise<typeof schema.seeds.$inferSelect> {
  const [seed] = await db
    .insert(schema.seeds)
    .values({
      projectId,
      interviewId,
      goal: 'Test goal created by E2E factory',
      constraints: [],
      acceptanceCriteria: [],
      ontologySchema: {},
      evaluationPrinciples: [],
      exitConditions: {},
      status: 'crystallized',
      version: 1,
      generation: 0,
    })
    .returning();
  if (!seed) throw new Error('createTestSeed: insert returned no rows');
  return seed;
}

/**
 * Insert a test bead into the E2E database.
 * Returns the full bead row.
 */
export async function createTestBead(
  db: E2EDb,
  seedId: string,
  opts?: { title?: string; status?: 'pending' | 'claimed' | 'active' | 'completed' | 'failed' }
): Promise<typeof schema.beads.$inferSelect> {
  const [bead] = await db
    .insert(schema.beads)
    .values({
      seedId,
      title: opts?.title ?? `Test Bead ${Date.now()}`,
      spec: 'Test bead specification',
      status: opts?.status ?? 'pending',
      version: 1,
    })
    .returning();
  if (!bead) throw new Error('createTestBead: insert returned no rows');
  return bead;
}

/**
 * Insert a test event into the E2E database.
 * Returns the full event row.
 */
export async function createTestEvent(
  db: E2EDb,
  projectId: string,
  type: typeof schema.events.$inferSelect['type'],
  payload?: Record<string, unknown>
): Promise<typeof schema.events.$inferSelect> {
  // Get next sequence number for this project
  const result = await db
    .select({ max: schema.events.sequenceNumber })
    .from(schema.events)
    .where(eq(schema.events.projectId, projectId));
  const nextSeq = (result[0]?.max ?? 0) + 1;

  const [event] = await db
    .insert(schema.events)
    .values({
      projectId,
      type,
      payload: payload ?? {},
      sequenceNumber: nextSeq,
    })
    .returning();
  if (!event) throw new Error('createTestEvent: insert returned no rows');
  return event;
}
