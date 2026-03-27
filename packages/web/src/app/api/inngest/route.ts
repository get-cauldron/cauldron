import { serve } from 'inngest/next';
import { inngest } from '@/inngest/client';
import { pipelineTriggerFunction } from '@/inngest/pipeline-trigger';

/**
 * Inngest serve handler for the Cauldron web app.
 * Registers all Inngest functions so they receive events from the Inngest dev server or cloud.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [pipelineTriggerFunction],
});
