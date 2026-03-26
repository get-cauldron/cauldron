import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from './schema/index.js';

const connectionString = process.env['DATABASE_URL'];
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required');
}

const client = postgres(connectionString);
export const db = drizzle({ client, schema });

export type DbClient = typeof db;

/**
 * Run all pending Drizzle migrations against the connected database.
 * Safe to call multiple times — already-applied migrations are skipped.
 * Suppresses Postgres NOTICE messages (e.g., "relation already exists, skipping").
 */
export async function ensureMigrations(): Promise<void> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const migrationsFolder = path.resolve(__dirname, 'migrations');
  // Use a separate connection with notices suppressed for migrations
  const migrationClient = postgres(connectionString!, { onnotice: () => {} });
  const migrationDb = drizzle({ client: migrationClient, schema });
  try {
    await migrate(migrationDb, { migrationsFolder });
  } finally {
    await migrationClient.end();
  }
}
