import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { submitAssetJob } from '@get-cauldron/engine';
import { getDefaultsForUse, composePrompt } from '../defaults.js';
import { INTENDED_USES } from '../types.js';
import type { DbClient } from '@get-cauldron/shared';
import type { Logger } from 'pino';

export interface GenerateImageDeps {
  db: DbClient;
  inngest: { send: (event: { name: string; data: Record<string, unknown> }) => Promise<unknown> };
  projectId: string;
  logger: Logger;
}

/**
 * Core handler extracted for testability.
 * Submits a job to the DB, fires the Inngest event, and returns the job handle response.
 */
export async function handleGenerateImage(
  params: {
    prompt: string;
    styleGuidance?: string;
    referenceImages?: string[];
    intendedUse?: (typeof INTENDED_USES)[number];
    destination?: string;
    width?: number;
    height?: number;
    steps?: number;
    seed?: number;
    negativePrompt?: string;
    guidanceScale?: number;
    idempotencyKey?: string;
  },
  deps: GenerateImageDeps
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const defaults = getDefaultsForUse(params.intendedUse);
  const composedPrompt = composePrompt(params.prompt, params.styleGuidance);

  const handle = await submitAssetJob({
    db: deps.db,
    params: {
      projectId: deps.projectId,
      prompt: composedPrompt,
      negativePrompt: params.negativePrompt,
      width: params.width ?? defaults.width,
      height: params.height ?? defaults.height,
      steps: params.steps ?? defaults.steps,
      seed: params.seed,
      guidanceScale: params.guidanceScale,
      idempotencyKey: params.idempotencyKey,
      extras: {
        styleGuidance: params.styleGuidance,
        referenceImages: params.referenceImages,
        intendedUse: params.intendedUse,
        destination: params.destination,
        originalPrompt: params.prompt,
      },
    },
  });

  // Fire Inngest event to trigger async generation (per D-05)
  await deps.inngest.send({
    name: 'asset/generate.requested',
    data: { jobId: handle.jobId, projectId: deps.projectId },
  });

  deps.logger.info({ jobId: handle.jobId, duplicate: handle.duplicate }, 'generate-image: job submitted');

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          jobId: handle.jobId,
          status: handle.status,
          duplicate: handle.duplicate,
          message: handle.duplicate
            ? 'Duplicate request — returning existing job'
            : 'Generation started. Use check-job-status to monitor progress.',
        }),
      },
    ],
  };
}

export function registerGenerateImageTool(server: McpServer, deps: GenerateImageDeps) {
  server.tool(
    'generate-image',
    'Submit an async image generation request to the local FLUX.2 dev runtime. Returns a job handle immediately — use check-job-status to poll progress. Use get-artifact to retrieve the completed image.',
    {
      prompt: z.string().describe('What to generate — describe the image content'),
      styleGuidance: z
        .string()
        .optional()
        .describe(
          'Visual style direction (e.g. "watercolor", "photorealistic", "flat design"). Composed into the prompt separately for provenance tracking'
        ),
      referenceImages: z
        .array(z.string())
        .optional()
        .describe('File paths to reference images for style or content guidance'),
      intendedUse: z
        .enum(INTENDED_USES)
        .optional()
        .describe(
          'Intended use — drives smart defaults for dimensions and quality. Options: hero-image (1024x768), icon (512x512, higher steps), texture (1024x1024), avatar (512x512), background (1920x1080), other (1024x1024)'
        ),
      destination: z
        .string()
        .optional()
        .describe('Target file path where the completed image will be automatically delivered'),
      width: z
        .number()
        .int()
        .optional()
        .describe('Image width in pixels — overrides intendedUse default'),
      height: z
        .number()
        .int()
        .optional()
        .describe('Image height in pixels — overrides intendedUse default'),
      steps: z
        .number()
        .int()
        .optional()
        .describe('Diffusion steps — overrides intendedUse default. Higher = better quality, slower'),
      seed: z.number().int().optional().describe('Random seed for reproducibility'),
      negativePrompt: z
        .string()
        .optional()
        .describe('What to avoid in the generated image'),
      guidanceScale: z
        .number()
        .optional()
        .describe('Classifier-free guidance scale (default 3.5)'),
      idempotencyKey: z
        .string()
        .optional()
        .describe('Unique key to prevent duplicate submissions'),
    },
    async (params) => handleGenerateImage(params, deps)
  );
}
