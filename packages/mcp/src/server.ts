import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DbClient } from '@get-cauldron/shared';
import type { Logger } from 'pino';
import { registerGenerateImageTool } from './tools/generate-image.js';
import { registerCheckJobStatusTool } from './tools/check-job-status.js';
import { registerGetArtifactTool } from './tools/get-artifact.js';
import { registerListJobsTool } from './tools/list-jobs.js';
import { registerJobStatusResource, notifyJobStatusChanged } from './resources/job-status.js';

export interface McpServerDeps {
  db: DbClient;
  inngest: { send: (event: { name: string; data: Record<string, unknown> }) => Promise<unknown> };
  projectId: string;
  logger: Logger;
}

export function createMcpServer(deps: McpServerDeps): McpServer {
  const server = new McpServer({
    name: 'cauldron-mcp',
    version: '0.1.0',
  });

  registerGenerateImageTool(server, deps);
  registerCheckJobStatusTool(server, deps);
  registerGetArtifactTool(server, deps);
  registerListJobsTool(server, deps);
  registerJobStatusResource(server, { db: deps.db });

  return server;
}

/**
 * Create a job status notification callback bound to a running McpServer.
 * Pass the returned function to configureAssetDeps as `onJobStatusChanged` so
 * Inngest handlers can fire MCP push notifications after job state transitions
 * without taking a direct dependency on the MCP server package.
 *
 * @example
 * ```typescript
 * const server = createMcpServer(deps);
 * const notifier = createJobStatusNotifier(server);
 * configureAssetDeps({ ...assetDeps, onJobStatusChanged: notifier });
 * ```
 */
export function createJobStatusNotifier(server: McpServer): (jobId: string) => void {
  return (jobId: string) => notifyJobStatusChanged(server, jobId);
}
