import { z } from 'zod';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getAssetJob } from '@get-cauldron/engine';
import type { DbClient } from '@get-cauldron/shared';
import type { Logger } from 'pino';

export interface GetArtifactDeps {
  db: DbClient;
  logger: Logger;
}

export function registerGetArtifactTool(server: McpServer, deps: GetArtifactDeps) {
  server.tool(
    'get-artifact',
    'Retrieve a completed image artifact with file path and provenance metadata. Optionally includes base64-encoded image data.',
    {
      jobId: z.string().describe('The job ID returned by generate-image'),
      includeBase64: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include base64-encoded image data in the response'),
    },
    async (params) => {
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

      if (job.status !== 'completed') {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'Job is not completed',
                jobId: params.jobId,
                status: job.status,
              }),
            },
          ],
        };
      }

      if (!job.artifactPath) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'No artifact path recorded for completed job',
                jobId: params.jobId,
              }),
            },
          ],
        };
      }

      // Read artifact directory and find the image file (everything that isn't a .meta.json sidecar)
      const entries = await readdir(job.artifactPath);
      const imageFilename = entries.find((f) => !f.endsWith('.meta.json'));

      if (!imageFilename) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'No image file found in artifact directory',
                jobId: params.jobId,
                artifactPath: job.artifactPath,
              }),
            },
          ],
        };
      }

      // Read provenance sidecar
      const sidecarPath = join(job.artifactPath, `${imageFilename}.meta.json`);
      const sidecarRaw = await readFile(sidecarPath, 'utf-8');
      const provenance = JSON.parse(sidecarRaw) as Record<string, unknown>;

      const filePath = join(job.artifactPath, imageFilename);

      const response: Record<string, unknown> = {
        jobId: params.jobId,
        filePath,
        provenance,
      };

      if (params.includeBase64) {
        const imageBuffer = await readFile(filePath);
        response['base64'] = imageBuffer.toString('base64');
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(response),
          },
        ],
      };
    }
  );
}
