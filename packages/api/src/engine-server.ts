import { serve } from '@hono/node-server';
import { bootstrap } from './bootstrap.js';
import { createInngestApp } from './inngest-serve.js';

/**
 * Start the engine Inngest server.
 *
 * Calls bootstrap() to configure all engine deps (scheduler, vault, evolution),
 * then creates the Hono Inngest app and serves it via @hono/node-server on port 3001.
 * The Inngest dev server polls http://host.docker.internal:3001/api/inngest to
 * discover and invoke the 5 engine functions.
 */
export async function startEngineServer(
  projectRoot: string,
  port = 3001,
): Promise<ReturnType<typeof serve>> {
  await bootstrap(projectRoot);

  const app = createInngestApp();

  const server = serve({ fetch: app.fetch, port });

  console.log(`Engine Inngest server listening on port ${port}`);

  return server;
}

// Direct execution via `tsx src/engine-server.ts`
if (process.argv[1]?.endsWith('engine-server') || process.argv[1]?.endsWith('engine-server.ts')) {
  startEngineServer(process.cwd()).catch((err) => {
    console.error('Failed to start engine server:', err);
    process.exit(1);
  });
}
