/**
 * Playwright global setup — runs once before all E2E test suites.
 *
 * Runs database migrations against the E2E database (cauldron_e2e on :5434)
 * so the schema is up to date before any test accesses the DB.
 *
 * Wired via playwright.config.ts `globalSetup` property.
 */
import { runMigrations, createE2EDb } from './helpers/db.js';

async function globalSetup() {
  // createE2EDb uses process.env.E2E_DATABASE_URL or defaults to localhost:5434
  const db = createE2EDb();
  await runMigrations(db);
}

export default globalSetup;
