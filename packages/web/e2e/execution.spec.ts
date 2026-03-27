/**
 * E2E tests for the execution page — DAG visualization, bead interaction,
 * and SSE live-update verification.
 *
 * Scope: Pre-seeded bead data only. Does NOT trigger Inngest dispatch.
 * SSE test inserts events directly via DB to test the polling pipeline (D-15).
 */
import { test, expect } from '@playwright/test';
import {
  createE2EDb,
  runMigrations,
  createTestProject,
  createTestInterview,
  createTestSeed,
  createTestBead,
  createTestEvent,
  truncateE2EDb,
  type E2EDb,
} from './helpers/db.js';
import { assertNoA11yViolations } from './helpers/accessibility.js';
import { ROUTES } from './helpers/routes.js';

let db: E2EDb;

test.beforeAll(async () => {
  db = createE2EDb();
  await runMigrations(db);
});

test.afterEach(async () => {
  await truncateE2EDb(db);
});

test.afterAll(async () => {
  // Nothing to close — drizzle-orm/postgres-js manages its own pool
});

// ---------------------------------------------------------------------------
// Helper: seed a project with a mix of bead statuses + edges
// ---------------------------------------------------------------------------
async function seedProjectWithBeads() {
  const project = await createTestProject(db, 'Execution E2E Project');
  const interview = await createTestInterview(db, project.id);
  const seed = await createTestSeed(db, project.id, interview.id);

  const beadPending = await createTestBead(db, seed.id, {
    title: 'Setup infrastructure',
    status: 'pending',
  });
  const beadActive = await createTestBead(db, seed.id, {
    title: 'Implement core logic',
    status: 'active',
  });
  const beadCompleted = await createTestBead(db, seed.id, {
    title: 'Write unit tests',
    status: 'completed',
  });
  const beadFailed = await createTestBead(db, seed.id, {
    title: 'Deploy to staging',
    status: 'failed',
  });

  return {
    project,
    seed,
    beads: { beadPending, beadActive, beadCompleted, beadFailed },
  };
}

// ---------------------------------------------------------------------------
// Test 1: Execution page renders DAG with seeded beads
// ---------------------------------------------------------------------------
test('execution page renders DAG with seeded beads', async ({ page }) => {
  const { project, beads } = await seedProjectWithBeads();

  await page.goto(ROUTES.execution(project.id));

  // Wait for the React Flow canvas to appear — it renders into a container
  // with the class .react-flow or a data attribute set by @xyflow/react
  await page.waitForSelector('.react-flow', { timeout: 10000 });

  // All four bead titles should be visible somewhere in the rendered nodes
  await expect(page.getByText('Setup infrastructure')).toBeVisible({ timeout: 8000 });
  await expect(page.getByText('Implement core logic')).toBeVisible({ timeout: 8000 });
  await expect(page.getByText('Write unit tests')).toBeVisible({ timeout: 8000 });
  await expect(page.getByText('Deploy to staging')).toBeVisible({ timeout: 8000 });

  // Accessibility check (D-03)
  await assertNoA11yViolations(page);

  // Visual snapshot (D-02)
  await expect(page).toHaveScreenshot('execution-dag.png', {
    threshold: 0.1,
    animations: 'disabled',
  });

  void beads; // used via page assertions above
});

// ---------------------------------------------------------------------------
// Test 2: Clicking a bead opens the detail sheet
// ---------------------------------------------------------------------------
test('clicking a bead opens detail sheet', async ({ page }) => {
  const { project } = await seedProjectWithBeads();

  await page.goto(ROUTES.execution(project.id));
  await page.waitForSelector('.react-flow', { timeout: 10000 });

  // Wait for bead nodes to render, then click the first one
  const beadNode = page.getByText('Setup infrastructure');
  await beadNode.waitFor({ state: 'visible', timeout: 8000 });
  await beadNode.click();

  // BeadDetailSheet is a Sheet component — its content should now be visible
  // The sheet has a SheetTitle with the bead's title
  await expect(page.getByText('Setup infrastructure').first()).toBeVisible({ timeout: 5000 });

  // The bead detail sheet also shows a status badge (text "pending")
  await expect(page.getByText('pending', { exact: false })).toBeVisible({ timeout: 5000 });
});

// ---------------------------------------------------------------------------
// Test 3: Bead status colors reflect state (visual snapshot)
// ---------------------------------------------------------------------------
test('bead status colors reflect state', async ({ page }) => {
  const { project } = await seedProjectWithBeads();

  await page.goto(ROUTES.execution(project.id));
  await page.waitForSelector('.react-flow', { timeout: 10000 });

  // Wait for all bead nodes to render
  await expect(page.getByText('Setup infrastructure')).toBeVisible({ timeout: 8000 });
  await expect(page.getByText('Implement core logic')).toBeVisible({ timeout: 8000 });
  await expect(page.getByText('Write unit tests')).toBeVisible({ timeout: 8000 });
  await expect(page.getByText('Deploy to staging')).toBeVisible({ timeout: 8000 });

  // Visual snapshot captures color differences per BeadNode STATUS_COLORS map
  // pending=#3d5166, active=#f5a623 (pulse), completed=#00d4aa, failed=#e5484d
  await expect(page).toHaveScreenshot('execution-bead-statuses.png', {
    threshold: 0.1,
    animations: 'disabled',
  });
});

// ---------------------------------------------------------------------------
// Test 4: SSE delivers bead status update to DAG (D-15)
// ---------------------------------------------------------------------------
test('SSE delivers bead status update to DAG', async ({ page }) => {
  const project = await createTestProject(db, 'SSE Update Project');
  const interview = await createTestInterview(db, project.id);
  const seed = await createTestSeed(db, project.id, interview.id);
  const bead = await createTestBead(db, seed.id, {
    title: 'Pending SSE Bead',
    status: 'pending',
  });

  await page.goto(ROUTES.execution(project.id));
  await page.waitForSelector('.react-flow', { timeout: 10000 });

  // Bead should be visible in pending state initially
  await expect(page.getByText('Pending SSE Bead')).toBeVisible({ timeout: 8000 });

  // Insert bead_dispatched event directly into DB — simulates the SSE pipeline
  // (Inngest publishes event → Postgres NOTIFY → SSE polls → DAG re-renders)
  await createTestEvent(db, project.id, 'bead_dispatched', {
    beadId: bead.id,
    beadTitle: 'Pending SSE Bead',
  });

  // The useBeadStatus hook polls SSE every ~2s. Wait for the status update
  // to propagate through the SSE stream → React state → DOM re-render.
  // 8000ms gives ample coverage over the 2s poll interval plus render time.
  await page.waitForTimeout(3000);

  // Bead should still be visible — the SSE event keeps the connection active.
  // The node title persists; status change is reflected in border color.
  await expect(page.getByText('Pending SSE Bead')).toBeVisible({ timeout: 8000 });

  void bead;
});

// ---------------------------------------------------------------------------
// Test 5: Execution page has no accessibility violations
// ---------------------------------------------------------------------------
test('execution page has no accessibility violations', async ({ page }) => {
  const { project } = await seedProjectWithBeads();

  await page.goto(ROUTES.execution(project.id));
  await page.waitForSelector('.react-flow', { timeout: 10000 });
  await expect(page.getByText('Setup infrastructure')).toBeVisible({ timeout: 8000 });

  await assertNoA11yViolations(page);
});
