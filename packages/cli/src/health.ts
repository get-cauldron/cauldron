import { sql } from 'drizzle-orm';
import { db, ensureMigrations } from '@cauldron/shared';

const REQUIRED_TABLES = [
  'projects', 'seeds', 'interviews', 'beads', 'bead_edges',
  'events', 'holdout_vault', 'project_snapshots',
] as const;

/**
 * Health check for all required Cauldron services.
 * Verifies PostgreSQL connectivity, schema completeness, and Inngest dev server reachability.
 * Auto-runs pending migrations if tables are missing.
 * On failure, prints a human-readable error and exits with code 1.
 */
export async function healthCheck(): Promise<void> {
  // Check PostgreSQL reachability
  try {
    await db.execute(sql`SELECT 1`);
  } catch {
    console.error('PostgreSQL not reachable. Run: docker compose up -d postgres');
    process.exit(1);
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
  }

  // Check Inngest dev server reachability
  try {
    const res = await fetch('http://localhost:8288/v1/events');
    if (!res.ok) {
      throw new Error(`Inngest returned HTTP ${res.status}`);
    }
  } catch {
    console.error('Inngest dev server not reachable. Run: docker compose up -d inngest');
    process.exit(1);
  }

  console.log('All services healthy');
}
