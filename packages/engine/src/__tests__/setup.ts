/**
 * Integration test setup utilities for the engine package.
 * Mirrors packages/shared/src/db/__tests__/setup.ts to give engine tests
 * access to a real PostgreSQL test database without a cross-package relative import.
 *
 * NOTE: We set DATABASE_URL here to prevent client.ts from throwing at import time.
 * The test DB URL overrides any production value for the duration of the test.
 */

// Must set DATABASE_URL before any @cauldron/shared import to prevent client.ts from throwing
process.env['DATABASE_URL'] =
  process.env['TEST_DATABASE_URL'] ?? 'postgres://cauldron:cauldron@localhost:5433/cauldron_test';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from '@cauldron/shared';
import { sql } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const TEST_DATABASE_URL =
  process.env['TEST_DATABASE_URL'] ?? 'postgres://cauldron:cauldron@localhost:5433/cauldron_test';

export function createTestDb() {
  const client = postgres(TEST_DATABASE_URL);
  const db = drizzle({ client, schema });
  return { client, db };
}

export async function runMigrations(db: ReturnType<typeof drizzle>) {
  // This file is at packages/engine/src/__tests__/setup.ts
  // Migrations are at packages/shared/src/db/migrations
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const migrationsPath = path.resolve(__dirname, '../../../shared/src/db/migrations');
  await migrate(db, { migrationsFolder: migrationsPath });
}

export async function truncateAll(db: ReturnType<typeof drizzle>) {
  await db.execute(
    sql`TRUNCATE TABLE llm_usage, project_snapshots, events, holdout_vault, bead_edges, beads, seeds, interviews, projects RESTART IDENTITY CASCADE`
  );
}
