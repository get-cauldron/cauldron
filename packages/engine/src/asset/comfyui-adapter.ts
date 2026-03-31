import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AssetExecutor, AssetJobParams, ExecutorOutputs } from './types.js';
import { ComfyUIError } from './errors.js';
import type { Logger } from 'pino';

// TODO(phase-19): validate workflow node IDs against running ComfyUI instance

/**
 * Load the FLUX.2 dev workflow template from the shared package.
 * The template uses placeholder strings for variable substitution.
 *
 * The file is at packages/shared/src/workflows/flux-dev.json.
 * This file lives at packages/engine/src/asset/comfyui-adapter.ts,
 * so we resolve 3 levels up (src/asset -> src -> engine -> packages)
 * then down into shared/src/workflows/.
 */
function loadWorkflowTemplate(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  // packages/engine/src/asset  →  ../../../shared/src/workflows/flux-dev.json
  const templatePath = resolve(__dirname, '../../../shared/src/workflows/flux-dev.json');
  return readFileSync(templatePath, 'utf-8');
}

/**
 * Substitute all template placeholders with actual values.
 * Numeric placeholders are inserted as numbers (not strings) so the resulting
 * JSON, when parsed, produces the correct types expected by ComfyUI.
 */
function substituteTemplate(
  template: string,
  params: AssetJobParams & { jobId: string }
): Record<string, unknown> {
  const seed = params.seed ?? Math.floor(Math.random() * 2147483647);
  const steps = params.steps ?? 20;
  const width = params.width ?? 1024;
  const height = params.height ?? 1024;
  const guidanceScale = params.guidanceScale ?? 3.5;
  const negativePrompt = params.negativePrompt ?? '';

  // Replace string placeholders (kept as quoted strings in template)
  // Replace numeric placeholders (quoted in template, become unquoted numbers)
  const result = template
    .replace(/"{{PROMPT}}"/g, JSON.stringify(params.prompt))
    .replace(/"{{NEGATIVE_PROMPT}}"/g, JSON.stringify(negativePrompt))
    .replace(/"{{SEED}}"/g, String(seed))
    .replace(/"{{STEPS}}"/g, String(steps))
    .replace(/"{{WIDTH}}"/g, String(width))
    .replace(/"{{HEIGHT}}"/g, String(height))
    .replace(/"{{GUIDANCE_SCALE}}"/g, String(guidanceScale));

  return JSON.parse(result) as Record<string, unknown>;
}

/**
 * Create a ComfyUI HTTP API executor that implements the AssetExecutor interface.
 *
 * @param opts.baseUrl - Base URL of the ComfyUI server (e.g. "http://localhost:8188")
 * @param opts.logger - Pino logger instance
 * @returns AssetExecutor implementation backed by ComfyUI
 */
export function createComfyUIExecutor(opts: {
  baseUrl: string;
  logger: Logger;
}): AssetExecutor {
  const { baseUrl, logger } = opts;

  // Load template once at creation time
  const workflowTemplate = loadWorkflowTemplate();

  return {
    async submitJob(params: AssetJobParams & { jobId: string }): Promise<string> {
      const workflow = substituteTemplate(workflowTemplate, params);

      logger.info({ jobId: params.jobId }, 'Submitting job to ComfyUI');

      const resp = await fetch(`${baseUrl}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: workflow }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new ComfyUIError(
          `ComfyUI /prompt returned ${resp.status}: ${text}`,
          resp.status
        );
      }

      const data = (await resp.json()) as { prompt_id: string };
      logger.info({ jobId: params.jobId, promptId: data.prompt_id }, 'ComfyUI job submitted');
      return data.prompt_id;
    },

    async checkStatus(
      executorPromptId: string
    ): Promise<{ done: boolean; outputs?: ExecutorOutputs }> {
      const resp = await fetch(`${baseUrl}/history/${executorPromptId}`, {
        method: 'GET',
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new ComfyUIError(
          `ComfyUI /history returned ${resp.status}: ${text}`,
          resp.status
        );
      }

      const history = (await resp.json()) as Record<
        string,
        {
          outputs: Record<
            string,
            { images: Array<{ filename: string; subfolder: string; type: string }> }
          >;
        }
      >;

      if (!history[executorPromptId]) {
        return { done: false };
      }

      // Collect all images from all output nodes
      const nodeOutputs = history[executorPromptId].outputs;
      const images: Array<{ filename: string; subfolder: string; type: string }> = [];
      for (const nodeOutput of Object.values(nodeOutputs)) {
        if (nodeOutput.images) {
          images.push(...nodeOutput.images);
        }
      }

      return { done: true, outputs: { images } };
    },

    async getArtifact(outputs: ExecutorOutputs, filename: string): Promise<Buffer> {
      // Find the image entry matching the requested filename
      const imageEntry = outputs.images.find((img) => img.filename === filename);
      const subfolder = imageEntry?.subfolder ?? '';
      const type = imageEntry?.type ?? 'output';

      const url = `${baseUrl}/view?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder)}&type=${encodeURIComponent(type)}`;

      const resp = await fetch(url, { method: 'GET' });

      if (!resp.ok) {
        const text = await resp.text();
        throw new ComfyUIError(
          `ComfyUI /view returned ${resp.status}: ${text}`,
          resp.status
        );
      }

      return Buffer.from(await resp.arrayBuffer());
    },
  };
}
