import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from './schema/index.js';

// Lazy initialization — db is created on first access so that importing this
// module during Next.js build-time static analysis does not throw when
// DATABASE_URL is absent. The env var is still required at runtime.
let _client: postgres.Sql | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function getClient(): postgres.Sql {
  if (!_client) {
    const connectionString = process.env['DATABASE_URL'];
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is required');
    }
    _client = postgres(connectionString);
  }
  return _client;
}

// Proxy db so it initializes lazily on first property access
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    if (!_db) {
      _db = drizzle({ client: getClient(), schema });
    }
    return (_db as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export type DbClient = typeof db;

/**
 * Run all pending Drizzle migrations against the connected database.
 * Safe to call multiple times — already-applied migrations are skipped.
 * Suppresses Postgres NOTICE messages (e.g., "relation already exists, skipping").
 */
export async function ensureMigrations(): Promise<void> {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const migrationsFolder = path.resolve(__dirname, 'migrations');
  // Use a separate connection with notices suppressed for migrations
  const migrationClient = postgres(connectionString, { onnotice: () => {} });
  const migrationDb = drizzle({ client: migrationClient, schema });
  try {
    await migrate(migrationDb, { migrationsFolder });
  } finally {
    await migrationClient.end();
  }
}
