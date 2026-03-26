import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Read GSD planning artifacts from .planning/ directory (D-07, D-10).
 *
 * Reads PROJECT.md, REQUIREMENTS.md, and any phase-specific CONTEXT.md files.
 * Returns a concatenated string with section headers for injecting into the
 * interview FSM as prior context.
 *
 * @param projectRoot - Root directory of the project (where .planning/ lives)
 * @param phaseId - Optional phase ID prefix for filtering phase-specific CONTEXT.md files.
 *                  e.g. "06.1" will match phases dirs starting with "06.1" and read CONTEXT.md.
 * @returns Concatenated string of all found artifacts, or empty string if none found
 */
export async function readPlanningArtifacts(
  projectRoot: string,
  phaseId?: string,
): Promise<string> {
  const planningDir = join(projectRoot, '.planning');

  // Try to read each file — return empty string if .planning/ does not exist
  let project = '';
  let requirements = '';
  let context = '';

  // Check if .planning/ directory exists at all
  try {
    readdirSync(planningDir);
  } catch {
    // .planning/ directory does not exist — return empty
    return '';
  }

  try {
    project = readFileSync(join(planningDir, 'PROJECT.md'), 'utf-8');
  } catch {
    // PROJECT.md missing — continue without it
  }

  try {
    requirements = readFileSync(join(planningDir, 'REQUIREMENTS.md'), 'utf-8');
  } catch {
    // REQUIREMENTS.md missing — continue without it
  }

  // Read phase-specific CONTEXT.md if phaseId provided
  if (phaseId) {
    try {
      const phasesDir = join(planningDir, 'phases');
      const entries = readdirSync(phasesDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith(phaseId)) {
          const phaseContextPath = join(phasesDir, entry.name, `${phaseId}-CONTEXT.md`);
          try {
            context = readFileSync(phaseContextPath, 'utf-8');
            break; // Use the first matching phase directory
          } catch {
            // CONTEXT.md not found in this phase dir — continue
          }
        }
      }
    } catch {
      // phases/ directory does not exist — continue without phase context
    }
  }

  // Build concatenated output with section headers
  const parts: string[] = [];

  if (project) {
    parts.push(`## Project Context\n${project}`);
  }

  if (requirements) {
    parts.push(`## Requirements\n${requirements}`);
  }

  if (context) {
    parts.push(`## Phase Decisions\n${context}`);
  }

  return parts.join('\n\n');
}

/**
 * Extract requirement IDs from a requirements document (D-10).
 *
 * Matches IDs matching pattern /[A-Z]+-\d+/g
 * e.g. EVOL-01, WEB-03, AUTH-12, D-07
 *
 * @param requirementsContent - The content of a requirements file
 * @returns Array of unique requirement IDs found
 */
export function extractRequirementIds(requirementsContent: string): string[] {
  const matches = requirementsContent.match(/[A-Z]+-\d+/g);
  if (!matches) return [];
  // Deduplicate while preserving order
  return [...new Set(matches)];
}
