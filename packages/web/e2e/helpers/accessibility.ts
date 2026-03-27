/**
 * Accessibility test helper for E2E tests.
 *
 * Wraps @axe-core/playwright (AxeBuilder) to run axe-core accessibility
 * checks against a page. Reports WCAG 2.0 A/AA violations with critical
 * and serious impact.
 *
 * Usage:
 *   await assertNoA11yViolations(page);
 */
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Assert no accessibility violations on the given page.
 * Checks WCAG 2.0 A and AA conformance levels.
 * Only fails on critical and serious impact violations.
 */
export async function assertNoA11yViolations(page: Page): Promise<void> {
  const accessibilityScanResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();

  const criticalOrSerious = accessibilityScanResults.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious'
  );

  expect(criticalOrSerious, 'Accessibility violations found').toEqual([]);
}
