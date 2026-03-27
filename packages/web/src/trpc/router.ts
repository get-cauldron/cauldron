import { router, publicProcedure } from './init';
import { projectsRouter } from './routers/projects';

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' })),
  projects: projectsRouter,
});

export type AppRouter = typeof appRouter;
