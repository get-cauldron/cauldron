import { router, publicProcedure } from './init';
import { projectsRouter } from './routers/projects';
import { costsRouter } from './routers/costs';

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' })),
  projects: projectsRouter,
  costs: costsRouter,
});

export type AppRouter = typeof appRouter;
