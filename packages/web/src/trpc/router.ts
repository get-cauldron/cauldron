import { router, publicProcedure } from './init';
import { projectsRouter } from './routers/projects';
import { costsRouter } from './routers/costs';
import { executionRouter } from './routers/execution';
import { interviewRouter } from './routers/interview';
import { evolutionRouter } from './routers/evolution';

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' })),
  projects: projectsRouter,
  costs: costsRouter,
  execution: executionRouter,
  interview: interviewRouter,
  evolution: evolutionRouter,
});

export type AppRouter = typeof appRouter;
