import { initTRPC, TRPCError } from '@trpc/server';
import { cache } from 'react';
import { db } from '@get-cauldron/shared';
import { getEngineDeps } from './engine-deps.js';

export const createTRPCContext = cache(async (req?: Request) => {
  const authenticated = validateApiKey(req);
  return { db, authenticated, getEngineDeps };
});

/**
 * Validate the Authorization Bearer token against CAULDRON_API_KEY env var.
 * If CAULDRON_API_KEY is not set, all requests are allowed (dev mode per D-15 open question 3).
 */
function validateApiKey(req?: Request): boolean {
  const expectedKey = process.env['CAULDRON_API_KEY'];
  if (!expectedKey) {
    // Dev mode: no key configured, allow all requests
    return true;
  }
  if (!req) {
    return false;
  }
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return false;
  }
  const providedKey = authHeader.slice('Bearer '.length);
  return providedKey === expectedKey;
}

const t = initTRPC.context<typeof createTRPCContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Protected procedure — requires valid API key when CAULDRON_API_KEY is set.
 */
export const authenticatedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.authenticated) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid or missing API key' });
  }
  return next({ ctx });
});
