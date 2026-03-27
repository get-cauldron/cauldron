import { serve } from 'inngest/hono';
import { Hono } from 'hono';
import {
  inngest as engineInngest,
  handleBeadDispatchRequested,
  handleBeadCompleted,
  handleMergeRequested,
  handleEvolutionConverged,
  handleEvolutionStarted,
} from '@cauldron/engine';

/**
 * All 5 engine Inngest functions served via the cauldron-engine client.
 * Exported as a constant so the smoke test can verify function count.
 */
export const ENGINE_FUNCTIONS = [
  handleBeadDispatchRequested,
  handleBeadCompleted,
  handleMergeRequested,
  handleEvolutionConverged,
  handleEvolutionStarted,
] as const;

/**
 * Create a Hono app that serves the cauldron-engine Inngest functions.
 * Mount this on the CLI server AFTER bootstrap() has configured all deps.
 * No lazy initialization needed — bootstrap runs first.
 */
export function createInngestApp(): Hono {
  const app = new Hono();

  const handler = serve({
    client: engineInngest,
    functions: [...ENGINE_FUNCTIONS],
  });

  // Mount at /api/inngest so the Inngest dev server discovers engine functions here
  app.on(['GET', 'POST', 'PUT'], '/api/inngest', handler);
  return app;
}
