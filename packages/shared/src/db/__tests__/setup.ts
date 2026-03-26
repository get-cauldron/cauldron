import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from '../schema/index.js';
import { sql } from 'drizzle-orm';

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'] ?? 'postgres://cauldron:cauldron@localhost:5433/cauldron_test';

export function createTestDb() {
  const client = postgres(TEST_DATABASE_URL);
  const db = drizzle({ client, schema });
  return { client, db };
}

export async function runMigrations(db: ReturnType<typeof drizzle>) {
  await migrate(db, { migrationsFolder: './src/db/migrations' });
}

export async function truncateAll(db: ReturnType<typeof drizzle>) {
  await db.execute(sql`TRUNCATE TABLE llm_usage, project_snapshots, events, holdout_vault, bead_edges, beads, seeds, projects RESTART IDENTITY CASCADE`);
}
