import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getAssetJob } from '@get-cauldron/engine';
import type { DbClient } from '@get-cauldron/shared';
import type { Logger } from 'pino';

export interface CheckJobStatusDeps {
  db: DbClient;
  logger: Logger;
}

/**
 * Core handler extracted for testability.
 * Returns job status, timestamps, and estimated progress.
 */
export async function handleCheckJobStatus(
  params: { jobId: string },
  deps: CheckJobStatusDeps
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const job = await getAssetJob(deps.db, params.jobId);

  if (!job) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ error: 'Job not found', jobId: params.jobId }),
        },
      ],
    };
  }

  // Calculate estimated progress (0-100)
  let estimatedProgress: number | null = null;
  if (job.status === 'completed') {
    estimatedProgress = 100;
  } else if (job.status !== 'failed' && job.status !== 'canceled') {
    // Estimate based on elapsed time vs. typical 120s generation time
    const elapsedMs = Date.now() - job.createdAt.getTime();
    estimatedProgress = Math.min(95, Math.round((elapsedMs / 120_000) * 100));
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          jobId: job.id,
          status: job.status,
          estimatedProgress,
          createdAt: job.createdAt,
          claimedAt: job.claimedAt,
          completedAt: job.completedAt,
          artifactPath: job.artifactPath,
          failureReason: job.failureReason,
        }),
      },
    ],
  };
}

export function registerCheckJobStatusTool(server: McpServer, deps: CheckJobStatusDeps) {
  server.tool(
    'check-job-status',
    'Check the status of an image generation job. Returns status, timestamps, and estimated progress.',
    {
      jobId: z.string().describe('The job ID returned by generate-image'),
    },
    async (params) => handleCheckJobStatus(params, deps)
  );
}
