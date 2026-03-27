/**
 * Route constants for E2E tests.
 *
 * Centralizes all URL patterns so tests don't hard-code paths.
 * Update here when routes change — tests stay consistent.
 */
export const ROUTES = {
  /** Projects list page */
  projects: '/projects',
  /** New project creation page */
  newProject: '/projects/new',
  /** Socratic interview page for a project */
  interview: (id: string) => `/projects/${id}/interview`,
  /** Bead execution DAG visualization for a project */
  execution: (id: string) => `/projects/${id}/execution`,
  /** Evolution loop timeline for a project */
  evolution: (id: string) => `/projects/${id}/evolution`,
  /** LLM cost breakdown for a project */
  costs: (id: string) => `/projects/${id}/costs`,
  /** Project settings (model overrides, budget, archive) */
  settings: (id: string) => `/projects/${id}/settings`,
} as const;
