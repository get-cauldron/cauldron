import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getAssetJob } from '@get-cauldron/engine';
import type { DbClient } from '@get-cauldron/shared';

export function registerJobStatusResource(server: McpServer, deps: { db: DbClient }) {
  server.resource(
    'job-status',
    new ResourceTemplate('cauldron://jobs/{jobId}/status', { list: undefined }),
    async (uri, { jobId }) => {
      const job = await getAssetJob(deps.db, jobId as string);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({
              jobId,
              status: job?.status ?? 'not_found',
              createdAt: job?.createdAt,
              updatedAt: job?.updatedAt,
              artifactPath: job?.artifactPath,
            }),
          },
        ],
      };
    }
  );
}

/**
 * Notify subscribed clients that a job status has changed.
 * Call this after job state transitions if the server reference is available.
 */
export function notifyJobStatusChanged(server: McpServer, jobId: string): void {
  // Access the underlying low-level Server to send resource update notifications
  // The McpServer high-level class tracks subscriptions automatically
  (server as unknown as { server?: { sendResourceUpdated?: (args: { uri: string }) => void } })
    .server?.sendResourceUpdated?.({
      uri: `cauldron://jobs/${jobId}/status`,
    });
}
