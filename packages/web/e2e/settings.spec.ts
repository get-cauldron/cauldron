/**
 * E2E tests for the project settings page.
 *
 * Covers:
 *  - Settings page displays project configuration (D-01)
 *  - Archive (delete) project flow with confirmation dialog
 *  - Accessibility assertions (D-03)
 *  - Visual snapshots (D-02)
 *  - DB isolation with truncate in afterEach (D-06)
 *
 * First run: pnpm -F @get-cauldron/web test:e2e -- --update-snapshots
 */
import { test, expect } from '@playwright/test';
import {
  createE2EDb,
  createTestProject,
  truncateE2EDb,
  runMigrations,
  type E2EDb,
} from './helpers/db';
import { assertNoA11yViolations } from './helpers/accessibility';
import { ROUTES } from './helpers/routes';

let db: E2EDb;

test.beforeAll(async () => {
  db = createE2EDb();
  await runMigrations(db);
});

test.afterEach(async () => {
  await truncateE2EDb(db);
});

test.afterAll(async () => {
  // postgres.js connections are managed per-request; no explicit close needed
});

test('settings page displays project configuration', async ({ page }) => {
  const project = await createTestProject(db, 'Settings Test Project');

  await page.goto(ROUTES.settings(project.id));

  // Budget and model override sections are rendered
  await expect(page.getByText('BUDGET')).toBeVisible();
  await expect(page.getByText('MODEL OVERRIDES')).toBeVisible();

  await assertNoA11yViolations(page);
  await expect(page).toHaveScreenshot('settings-page.png', {
    threshold: 0.1,
    animations: 'disabled',
  });
});

test('archive project from settings shows confirmation dialog', async ({ page }) => {
  const project = await createTestProject(db, 'Project To Delete');

  await page.goto(ROUTES.settings(project.id));

  // Danger zone section should be visible
  await expect(page.getByText('DANGER ZONE')).toBeVisible();

  // Click "Delete Project" button to open dialog
  await page.getByRole('button', { name: 'Delete Project' }).click();

  // Confirmation dialog should appear
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('Delete project?')).toBeVisible();
  await expect(page.getByText('Project To Delete')).toBeVisible();
});

test('settings page has no accessibility violations', async ({ page }) => {
  const project = await createTestProject(db, 'A11y Settings Project');

  await page.goto(ROUTES.settings(project.id));
  await expect(page.getByText('BUDGET')).toBeVisible();

  await assertNoA11yViolations(page);
});
