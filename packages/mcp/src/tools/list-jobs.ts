import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { listAssetJobs } from '@get-cauldron/engine';
import type { DbClient } from '@get-cauldron/shared';
import type { AssetJobStatus } from '@get-cauldron/engine';
import type { Logger } from 'pino';

export interface ListJobsDeps {
  db: DbClient;
  logger: Logger;
}

export function registerListJobsTool(server: McpServer, deps: ListJobsDeps) {
  server.tool(
    'list-jobs',
    'List image generation jobs. Returns the last 50 by default, filterable by status. Includes project name and key timestamps.',
    {
      status: z
        .string()
        .optional()
        .describe('Filter by job status: pending, claimed, active, completed, failed, canceled'),
      limit: z
        .number()
        .int()
        .optional()
        .describe('Maximum number of jobs to return (default 50)'),
      offset: z.number().int().optional().describe('Number of jobs to skip for pagination'),
    },
    async (params) => {
      const results = await listAssetJobs(deps.db, {
        status: params.status as AssetJobStatus | undefined,
        limit: params.limit,
        offset: params.offset,
      });

      const jobs = results.map(({ job, projectName }) => ({
        jobId: job.id,
        projectName,
        status: job.status,
        prompt: job.prompt.slice(0, 80),
        createdAt: job.createdAt,
        completedAt: job.completedAt,
      }));

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(jobs),
          },
        ],
      };
    }
  );
}
