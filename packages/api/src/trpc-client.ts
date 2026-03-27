import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@cauldron/trpc-types';

export function createCLIClient(serverUrl: string, apiKey: string) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${serverUrl}/api/trpc`,
        headers() {
          return { Authorization: `Bearer ${apiKey}` };
        },
      }),
    ],
  });
}

export type CLIClient = ReturnType<typeof createCLIClient>;
