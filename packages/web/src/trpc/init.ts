import { initTRPC } from '@trpc/server';
import { cache } from 'react';
import { db } from '@cauldron/shared';

export const createTRPCContext = cache(async () => {
  return { db };
});

const t = initTRPC.context<typeof createTRPCContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
