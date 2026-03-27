import { router, publicProcedure } from './init';

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' })),
});

export type AppRouter = typeof appRouter;
