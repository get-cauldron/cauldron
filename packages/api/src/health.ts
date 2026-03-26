import { sql } from 'drizzle-orm';
import { db } from '@cauldron/shared';

/**
 * Health check for all required Cauldron services.
 * Verifies PostgreSQL connectivity and Inngest dev server reachability.
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
