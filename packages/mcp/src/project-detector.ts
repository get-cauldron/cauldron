/**
 * Project root detection and project ID resolution for MCP server context.
 * Walks upward from cwd to find cauldron markers per D-07.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { eq } from 'drizzle-orm';
import { projects } from '@get-cauldron/shared';
import type { DbClient } from '@get-cauldron/shared';

/**
 * Walks upward from startDir until it finds a directory containing either:
 * - `cauldron.config.ts` — project configuration file
 * - `.cauldron/` — hidden project data directory
 *
 * Returns the directory path containing the marker, or null if the filesystem
 * root is reached without finding one.
 */
export function findProjectRoot(startDir: string): string | null {
  let current = startDir;

  while (true) {
    if (existsSync(join(current, 'cauldron.config.ts'))) {
      return current;
    }

    if (existsSync(join(current, '.cauldron'))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      // Reached filesystem root
      return null;
    }

    current = parent;
  }
}

/**
 * Resolves the Cauldron project ID from the project root.
 *
 * Resolution order:
 * 1. Read `.cauldron/project-id` file if present — verifies existence in DB
 * 2. Fall back to most recently created project in the projects table
 *
 * Throws a descriptive error if no project can be found.
 */
export async function resolveProjectId(db: DbClient, projectRoot: string): Promise<string> {
  const projectIdFile = join(projectRoot, '.cauldron', 'project-id');

  if (existsSync(projectIdFile)) {
    const projectId = readFileSync(projectIdFile, 'utf-8').trim();

    // Verify the project exists in the database
    const rows = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (rows.length > 0 && rows[0]) {
      return rows[0].id;
    }

    throw new Error(
      `Project ID from .cauldron/project-id (${projectId}) not found in database. ` +
      `Run 'cauldron project:init' to register this project.`
    );
  }

  // Fall back to most recently created project (single project assumption for local dev)
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .orderBy(projects.createdAt)
    .limit(1);

  if (rows.length > 0 && rows[0]) {
    return rows[0].id;
  }

  throw new Error(
    'No Cauldron project found. Run \'cauldron project:create\' to create a project first.'
  );
}
