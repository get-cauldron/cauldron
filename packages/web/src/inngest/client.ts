import { Inngest } from 'inngest';

/**
 * Inngest client for the Cauldron web app.
 * Shared by all web-layer Inngest functions (pipeline triggers, etc.).
 */
export const inngest = new Inngest({
  id: 'cauldron-web',
  isDev: process.env['NODE_ENV'] === 'development',
});
