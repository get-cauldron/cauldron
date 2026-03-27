/**
 * E2E tests for project management flow.
 *
 * Covers:
 *  - Project list page (empty state + populated)
 *  - Create new project via form (D-01)
 *  - Accessibility assertions on every page visit (D-03)
 *  - Visual snapshots for key pages (D-02)
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

test('projects list page loads and shows empty state', async ({ page }) => {
  await page.goto(ROUTES.projects);
  // Wait for the main heading to confirm the page rendered
  await expect(page.getByRole('heading', { name: /projects/i })).toBeVisible();
  // Empty state text from ProjectListClient
  await expect(page.getByText('No projects yet')).toBeVisible();

  await assertNoA11yViolations(page);
  await expect(page).toHaveScreenshot('projects-empty.png', {
    threshold: 0.1,
    animations: 'disabled',
  });
});

test('projects list shows existing projects', async ({ page }) => {
  await createTestProject(db, 'Alpha Project');
  await createTestProject(db, 'Beta Project');

  await page.goto(ROUTES.projects);
  // Wait for the list to render (cards appear)
  await expect(page.getByText('Alpha Project')).toBeVisible();
  await expect(page.getByText('Beta Project')).toBeVisible();

  await assertNoA11yViolations(page);
  await expect(page).toHaveScreenshot('projects-list.png', {
    threshold: 0.1,
    animations: 'disabled',
  });
});

test('create new project via form', async ({ page }) => {
  await page.goto(ROUTES.newProject);

  // Fill in the project name
  const nameInput = page.getByLabel(/project name/i);
  await expect(nameInput).toBeVisible();
  await nameInput.fill('E2E Test Project');

  // Submit the form
  await page.getByRole('button', { name: /start building/i }).click();

  // After creation the user is redirected to the interview page for that project
  await expect(page).toHaveURL(/\/projects\/.+\/interview/);
});

test('navigate to project details from list', async ({ page }) => {
  const project = await createTestProject(db, 'Navigator Project');

  await page.goto(ROUTES.projects);
  // Click the project card (it is a link)
  await expect(page.getByText('Navigator Project')).toBeVisible();
  await page.getByText('Navigator Project').click();

  // Should land on the interview page for the project
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/`));
});

test('new project page has no accessibility violations', async ({ page }) => {
  await page.goto(ROUTES.newProject);
  await expect(page.getByRole('heading', { name: /new project/i })).toBeVisible();
  await assertNoA11yViolations(page);
});
