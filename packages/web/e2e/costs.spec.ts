/**
 * E2E tests for the costs page — token usage summary, per-model breakdown,
 * and empty state display.
 *
 * Scope: Pre-seeded llm_usage records. Tests UI rendering of cost data
 * without triggering live LLM calls.
 */
import { test, expect } from '@playwright/test';
import {
  createE2EDb,
  runMigrations,
  createTestProject,
  createTestInterview,
  createTestSeed,
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
// Helper: seed a project with llm_usage records
// ---------------------------------------------------------------------------
async function seedProjectWithCosts() {
  const project = await createTestProject(db, 'Costs E2E Project');
  const interview = await createTestInterview(db, project.id);
  const seed = await createTestSeed(db, project.id, interview.id);

  // Insert llm_usage rows directly — 2 models, 3 calls total
  await db.insert(schema.llmUsage).values([
    {
      projectId: project.id,
      seedId: seed.id,
      stage: 'interview',
      model: 'claude-sonnet-4-5',
      promptTokens: 1200,
      completionTokens: 400,
      totalTokens: 1600,
      costCents: 48, // $0.48
    },
    {
      projectId: project.id,
      seedId: seed.id,
      stage: 'interview',
      model: 'claude-sonnet-4-5',
      promptTokens: 800,
      completionTokens: 200,
      totalTokens: 1000,
      costCents: 30, // $0.30
    },
    {
      projectId: project.id,
      seedId: seed.id,
      stage: 'decomposition',
      model: 'gpt-4.1',
      promptTokens: 2000,
      completionTokens: 600,
      totalTokens: 2600,
      costCents: 156, // $1.56
    },
  ]);

  return { project, seed };
}

// ---------------------------------------------------------------------------
// Test 1: Costs page displays token usage summary
// ---------------------------------------------------------------------------
test('costs page displays token usage summary', async ({ page }) => {
  const { project } = await seedProjectWithCosts();

  await page.goto(ROUTES.costs(project.id));

  // Total cost card: sum of 48 + 30 + 156 = 234 cents = $2.34
  await expect(page.getByText('Total Cost')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('$2.34')).toBeVisible({ timeout: 8000 });

  // Total calls card: 3 API calls
  await expect(page.getByText('Total Calls')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('3')).toBeVisible({ timeout: 5000 });

  // Accessibility check (D-03)
  await assertNoA11yViolations(page);

  // Visual snapshot (D-02)
  await expect(page).toHaveScreenshot('costs-page.png', {
    threshold: 0.1,
    animations: 'disabled',
  });
});

// ---------------------------------------------------------------------------
// Test 2: Costs page shows per-model breakdown
// ---------------------------------------------------------------------------
test('costs page shows per-model breakdown', async ({ page }) => {
  const { project } = await seedProjectWithCosts();

  await page.goto(ROUTES.costs(project.id));

  // Wait for data to load
  await expect(page.getByText('Total Cost')).toBeVisible({ timeout: 10000 });

  // Both model names should appear in the COST BY MODEL section
  await expect(page.getByText('COST BY MODEL')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('claude-sonnet-4-5')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('gpt-4.1')).toBeVisible({ timeout: 5000 });
});

// ---------------------------------------------------------------------------
// Test 3: Costs page handles empty state
// ---------------------------------------------------------------------------
test('costs page handles empty state', async ({ page }) => {
  // Project with no llm_usage records
  const project = await createTestProject(db, 'Empty Costs Project');

  await page.goto(ROUTES.costs(project.id));

  // Empty state message from CostsPage component
  await expect(page.getByText('No token usage yet')).toBeVisible({ timeout: 10000 });
  await expect(
    page.getByText('Cost data appears once execution begins.')
  ).toBeVisible({ timeout: 5000 });
});

// ---------------------------------------------------------------------------
// Test 4: Costs page has no accessibility violations
// ---------------------------------------------------------------------------
test('costs page has no accessibility violations', async ({ page }) => {
  const { project } = await seedProjectWithCosts();

  await page.goto(ROUTES.costs(project.id));
  await expect(page.getByText('Total Cost')).toBeVisible({ timeout: 10000 });

  await assertNoA11yViolations(page);
});
