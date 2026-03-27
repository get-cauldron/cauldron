import { describe, it, expect } from 'vitest';
import { parseArgs } from 'node:util';

/**
 * Test the --project-id flag precedence logic extracted from cli.ts.
 * This mirrors the exact parseArgs config and ?? chain in cli.ts main().
 */
function resolveFlags(argv: string[], env: Record<string, string | undefined> = {}) {
  const { values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      json: { type: 'boolean', default: false },
      project: { type: 'string' },
      'project-id': { type: 'string' },
    },
    strict: false,
  });
  return {
    json: (values['json'] as boolean | undefined) ?? false,
    projectId:
      (values['project-id'] as string | undefined) ??
      (values['project'] as string | undefined) ??
      env['CAULDRON_PROJECT_ID'],
  };
}

describe('kill command --project-id flag resolution', () => {
  it('resolves projectId from --project-id flag', () => {
    const flags = resolveFlags(['kill', '--project-id', 'my-proj']);
    expect(flags.projectId).toBe('my-proj');
  });

  it('--project-id takes precedence over --project when both are provided', () => {
    const flags = resolveFlags(['kill', '--project-id', 'proj-a', '--project', 'proj-b']);
    expect(flags.projectId).toBe('proj-a');
  });

  it('falls back to --project when only --project is provided (backward compatible)', () => {
    const flags = resolveFlags(['kill', '--project', 'proj-b']);
    expect(flags.projectId).toBe('proj-b');
  });

  it('falls back to CAULDRON_PROJECT_ID env var when neither flag is provided', () => {
    const flags = resolveFlags(['kill'], { CAULDRON_PROJECT_ID: 'env-proj' });
    expect(flags.projectId).toBe('env-proj');
  });
});
