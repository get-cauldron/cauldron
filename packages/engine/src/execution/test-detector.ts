import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { TestRunnerConfig } from './types.js';

/**
 * Detects the test runner for a target project by inspecting package.json
 * and config files. Priority:
 * 1. package.json scripts.test keyword
 * 2. Config file presence (vitest beats jest)
 * 3. devDependencies
 * 4. Default to vitest
 */
export function detectTestRunner(projectRoot: string): TestRunnerConfig {
  const pkgPath = join(projectRoot, 'package.json');

  let scripts: Record<string, string> = {};
  let devDependencies: Record<string, string> = {};

  if (existsSync(pkgPath)) {
    try {
      const raw = readFileSync(pkgPath, 'utf8');
      const pkg = JSON.parse(raw) as {
        scripts?: Record<string, string>;
        devDependencies?: Record<string, string>;
        dependencies?: Record<string, string>;
      };
      scripts = pkg.scripts ?? {};
      devDependencies = {
        ...(pkg.devDependencies ?? {}),
        ...(pkg.dependencies ?? {}),
      };
    } catch {
      // Malformed package.json — fall through to defaults
    }
  }

  // Determine runner: priority order
  let runner: 'vitest' | 'jest' | 'mocha' = detectRunnerFromSources(
    scripts,
    devDependencies,
    projectRoot
  );

  const config = buildConfig(runner);

  // Check for Playwright E2E
  const playwrightConfigTs = join(projectRoot, 'playwright.config.ts');
  const playwrightConfigJs = join(projectRoot, 'playwright.config.js');
  if (existsSync(playwrightConfigTs) || existsSync(playwrightConfigJs)) {
    config.e2eCommand = 'npx playwright test';
  }

  return config;
}

function detectRunnerFromSources(
  scripts: Record<string, string>,
  devDependencies: Record<string, string>,
  projectRoot: string
): 'vitest' | 'jest' | 'mocha' {
  const testScript = scripts['test'] ?? '';

  // Priority 1: test script keyword
  if (testScript.includes('vitest')) return 'vitest';
  if (testScript.includes('jest')) return 'jest';
  if (testScript.includes('mocha')) return 'mocha';

  // Priority 2: config file presence (vitest beats jest)
  const vitestConfig = join(projectRoot, 'vitest.config.ts');
  const vitestConfigJs = join(projectRoot, 'vitest.config.js');
  const jestConfig = join(projectRoot, 'jest.config.ts');
  const jestConfigJs = join(projectRoot, 'jest.config.js');

  if (existsSync(vitestConfig) || existsSync(vitestConfigJs)) return 'vitest';
  if (existsSync(jestConfig) || existsSync(jestConfigJs)) return 'jest';

  // Priority 3: devDependencies
  if ('vitest' in devDependencies) return 'vitest';
  if ('jest' in devDependencies) return 'jest';
  if ('mocha' in devDependencies) return 'mocha';

  // Default
  return 'vitest';
}

function buildConfig(runner: 'vitest' | 'jest' | 'mocha'): TestRunnerConfig {
  switch (runner) {
    case 'vitest':
      return {
        unitCommand: 'npx vitest run',
        integrationCommand: 'npx vitest run --config vitest.integration.config.ts',
        typecheckCommand: 'npx tsc --noEmit',
      };
    case 'jest':
      return {
        unitCommand: 'npx jest',
        integrationCommand: 'npx jest --config jest.integration.config.ts',
        typecheckCommand: 'npx tsc --noEmit',
      };
    case 'mocha':
      return {
        unitCommand: 'npx mocha',
        integrationCommand: 'npx mocha --config .mocharc.integration.js',
        typecheckCommand: 'npx tsc --noEmit',
      };
  }
}
