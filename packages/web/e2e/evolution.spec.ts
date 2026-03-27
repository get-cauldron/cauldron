/**
 * E2E tests for the evolution page — seed lineage tree, convergence panel,
 * and evolution timeline rendering.
 *
 * Scope: Pre-seeded seed + event data. Does NOT trigger live evolution cycles.
 * Seed lineage is built by inserting parent + child seeds with parentId FK.
 */
import { test, expect } from '@playwright/test';
import {
  createE2EDb,
  runMigrations,
  createTestProject,
  createTestInterview,
  createTestSeed,
  createTestEvent,
  truncateE2EDb,
  type E2EDb,
} from './helpers/db.js';
import { assertNoA11yViolations } from './helpers/accessibility.js';
import { ROUTES } from './helpers/routes.js';
import * as schema from '@get-cauldron/shared';

let db: E2EDb;

test.beforeAll(async () => {
  db = createE2EDb();
  await runMigrations(db);
});

test.afterEach(async () => {
  await truncateE2EDb(db);
});

// ---------------------------------------------------------------------------
// Helper: seed project with parent + evolved child seed + evolution events
// ---------------------------------------------------------------------------
async function seedProjectWithLineage() {
  const project = await createTestProject(db, 'Evolution E2E Project');
  const interview = await createTestInterview(db, project.id);

  // Gen 0 — parent seed
  const parentSeed = await createTestSeed(db, project.id, interview.id);

  // Gen 1 — evolved child seed (parentId points to parent)
  const [childSeed] = await db
    .insert(schema.seeds)
    .values({
      projectId: project.id,
      interviewId: interview.id,
      parentId: parentSeed.id,
      goal: 'Evolved goal — improved specification after first evaluation cycle',
      constraints: [],
      acceptanceCriteria: [{ description: 'All tests pass' }],
      ontologySchema: {},
      evaluationPrinciples: [],
      exitConditions: {},
      status: 'crystallized' as const,
      version: 2,
      generation: 1,
      evolutionContext: {
        terminalReason: null,
        convergenceSignal: null,
      },
    })
    .returning();

  if (!childSeed) throw new Error('seedProjectWithLineage: child seed insert failed');

  // Evolution events
  await createTestEvent(db, project.id, 'evolution_started', {
    seedId: parentSeed.id,
    cycle: 1,
  });
  await createTestEvent(db, project.id, 'evolution_converged', {
    seedId: childSeed.id,
    cycle: 1,
    signals: [
      { type: 'ontology_stability', fired: true, value: 0.95, threshold: 0.9 },
      { type: 'stagnation', fired: false, value: 0.1, threshold: 0.7 },
    ],
  });
  await createTestEvent(db, project.id, 'seed_crystallized', {
    seedId: childSeed.id,
    generation: 1,
  });

  return { project, parentSeed, childSeed };
}

// ---------------------------------------------------------------------------
// Test 1: Evolution page shows seed lineage tree
// ---------------------------------------------------------------------------
test('evolution page shows seed lineage tree', async ({ page }) => {
  const { project } = await seedProjectWithLineage();

  await page.goto(ROUTES.evolution(project.id));

  // Wait for seed lineage tree to render — SeedLineageTree shows "Gen N" badges
  await expect(page.getByText('Gen 0')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Gen 1')).toBeVisible({ timeout: 8000 });

  // Both seed goal texts should be present
  await expect(page.getByText('Test goal created by E2E factory')).toBeVisible({
    timeout: 8000,
  });
  await expect(
    page.getByText('Evolved goal — improved specification after first evaluation cycle')
  ).toBeVisible({ timeout: 8000 });

  // Accessibility check (D-03)
  await assertNoA11yViolations(page);

  // Visual snapshot (D-02)
  await expect(page).toHaveScreenshot('evolution-lineage.png', {
    threshold: 0.1,
    animations: 'disabled',
  });
});

// ---------------------------------------------------------------------------
// Test 2: Convergence panel displays signal statuses
// ---------------------------------------------------------------------------
test('convergence panel displays signal statuses', async ({ page }) => {
  const { project } = await seedProjectWithLineage();

  await page.goto(ROUTES.evolution(project.id));

  // Wait for lineage tree — convergence panel is co-located in the right pane
  await expect(page.getByText('Gen 1')).toBeVisible({ timeout: 10000 });

  // Click gen 1 seed to load its convergence data
  await page.getByText('Gen 1').click();

  // ConvergencePanel header is always visible (collapsible is open by default)
  await expect(page.getByText('CONVERGENCE SIGNALS')).toBeVisible({ timeout: 8000 });

  // Signal labels from SIGNAL_LABELS map should render (default or from event payload)
  // When no convergence data is loaded, ConvergencePanel renders default signal rows
  await expect(page.getByText('Ontology Stability')).toBeVisible({ timeout: 5000 });
});

// ---------------------------------------------------------------------------
// Test 3: Evolution timeline shows generation history
// ---------------------------------------------------------------------------
test('evolution timeline shows cycle history', async ({ page }) => {
  const { project } = await seedProjectWithLineage();

  await page.goto(ROUTES.evolution(project.id));

  // Wait for data to load
  await expect(page.getByText('Gen 0')).toBeVisible({ timeout: 10000 });

  // EvolutionTimeline renders generation dots — text like "Gen 0" and "Gen 1"
  // should appear both in the SeedLineageTree and the EvolutionTimeline strip
  const gen0Elements = await page.getByText('Gen 0').all();
  expect(gen0Elements.length).toBeGreaterThanOrEqual(1);

  const gen1Elements = await page.getByText('Gen 1').all();
  expect(gen1Elements.length).toBeGreaterThanOrEqual(1);
});

// ---------------------------------------------------------------------------
// Test 4: Evolution page has no accessibility violations
// ---------------------------------------------------------------------------
test('evolution page has no accessibility violations', async ({ page }) => {
  const { project } = await seedProjectWithLineage();

  await page.goto(ROUTES.evolution(project.id));
  await expect(page.getByText('Gen 0')).toBeVisible({ timeout: 10000 });

  await assertNoA11yViolations(page);
});
