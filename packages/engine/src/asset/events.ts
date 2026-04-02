import { NonRetriableError, type InngestFunction } from 'inngest';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { inngest } from '../holdout/events.js'; // Reuse cauldron-engine client — do NOT create a second Inngest client
import type { DbClient } from '@get-cauldron/shared';
import type { Logger } from 'pino';
import type { AssetExecutor, AssetOutputMetadata, ArtifactSidecar } from './types.js';
import {
  getAssetJob,
  claimJob,
  updateJobStatus,
  completeJob,
  failJob,
  appendAssetEvent,
} from './job-store.js';
import { writeArtifact } from './artifact-writer.js';
import { publishJobStatusChanged } from './ipc-publisher.js';

/**
 * Module-level dependencies for the asset event handlers.
 * Configured via configureAssetDeps() — must be called before Inngest handlers run.
 */
interface AssetDeps {
  db: DbClient;
  logger: Logger;
  executor: AssetExecutor;
  artifactsRoot: string;
  /**
   * Optional callback fired after each job state transition.
   * Callers (e.g. MCP server) can wire notifyJobStatusChanged here
   * so push notifications reach subscribed MCP clients.
   */
  onJobStatusChanged?: (jobId: string) => void;
}

let assetDeps: AssetDeps | null = null;

/**
 * Configure the database, logger, executor, and artifacts root used by the asset Inngest handlers.
 * Call this during application startup before Inngest begins serving functions.
 */
export function configureAssetDeps(deps: AssetDeps): void {
  assetDeps = deps;
}

function getAssetDepsOrThrow(): AssetDeps {
  if (!assetDeps) {
    throw new Error(
      'Asset dependencies not configured. Call configureAssetDeps() before using asset event handlers.'
    );
  }
  return assetDeps;
}

const DEFAULT_POLL_TIMEOUT = 300_000; // 5 minutes (D-17)
const DEFAULT_POLL_INTERVAL = 3_000; // 3 seconds between polls

/**
 * Poll ComfyUI until generation is done or timeout is exceeded.
 * Extracted for readability since polling loop needs several conditionals.
 */
async function pollUntilDone(
  executor: AssetExecutor,
  promptId: string,
  timeout: number,
  interval: number
): Promise<{ images: Array<{ filename: string; subfolder: string; type: string }> }> {
  const startTime = Date.now();

  while (true) {
    const result = await executor.checkStatus(promptId);

    if (result.done && result.outputs) {
      return result.outputs;
    }

    const elapsed = Date.now() - startTime;
    if (elapsed >= timeout) {
      throw new NonRetriableError('Asset generation timed out after 5 minutes');
    }

    // Only wait if we're not immediately done
    if (interval > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, interval));
    }
  }
}

/**
 * The core asset generation handler logic — extracted for testability.
 * Tests call this directly with a mock step object instead of using Inngest's test harness.
 *
 * Implements 3 durable steps:
 * Step 1 — submit-to-comfyui: claim job, transition to active, submit to ComfyUI
 * Step 2 — poll-completion: poll ComfyUI until generation finishes or times out
 * Step 3 — collect-artifacts: download image, write artifact + sidecar, complete job
 */
export async function generateAssetHandler(
  {
    event,
    step,
  }: {
    event: { data: { jobId: string; projectId: string } };
    step: { run: <T>(name: string, callback: () => Promise<T>) => Promise<T> };
  },
  pollTimeout: number = DEFAULT_POLL_TIMEOUT,
  pollInterval: number = DEFAULT_POLL_INTERVAL
): Promise<{ jobId: string; status: string }> {
  const { jobId, projectId } = event.data;
  const { db, logger, executor, artifactsRoot, onJobStatusChanged } = getAssetDepsOrThrow();

  // Track version across steps for optimistic concurrency
  let currentVersion = 0;

  // Step 1: Claim job and submit to ComfyUI
  const comfyuiPromptId = await step.run('submit-to-comfyui', async () => {
    try {
      // Get current job state to obtain version for optimistic concurrency
      const job = await getAssetJob(db, jobId);
      if (!job) {
        throw new Error(`Asset job not found: ${jobId}`);
      }

      // Transition pending -> claimed (D-01: optimistic concurrency via version)
      const claimed = await claimJob(db, jobId, job.version);
      currentVersion = claimed.version;

      // Transition claimed -> active
      const active = await updateJobStatus(db, jobId, 'active', claimed.version);
      currentVersion = active.version;

      // Submit to ComfyUI executor
      const promptId = await executor.submitJob({
        jobId,
        projectId: job.projectId,
        prompt: job.prompt,
        negativePrompt: job.negativePrompt ?? undefined,
        width: job.width ?? undefined,
        height: job.height ?? undefined,
        seed: job.seed ?? undefined,
        steps: job.steps ?? undefined,
        guidanceScale: job.guidanceScale ?? undefined,
        extras: (job.extras as Record<string, unknown>) ?? {},
      });

      // Record the active state event
      await appendAssetEvent(db, {
        projectId,
        jobId,
        type: 'asset_job_active',
        extra: { comfyuiPromptId: promptId },
      });
      onJobStatusChanged?.(jobId);
      await publishJobStatusChanged(jobId);

      logger.info({ jobId, comfyuiPromptId: promptId }, 'Asset job submitted to ComfyUI');
      return promptId;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await failJob(db, jobId, currentVersion, message);
      await appendAssetEvent(db, { projectId, jobId, type: 'asset_job_failed', extra: { reason: message } });
      onJobStatusChanged?.(jobId);
      await publishJobStatusChanged(jobId);
      throw err;
    }
  });

  // Step 2: Poll ComfyUI until generation is done (or timeout)
  const outputs = await step.run('poll-completion', async () => {
    try {
      return await pollUntilDone(executor, comfyuiPromptId, pollTimeout, pollInterval);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await failJob(db, jobId, currentVersion, message);
      await appendAssetEvent(db, { projectId, jobId, type: 'asset_job_failed', extra: { reason: message } });
      onJobStatusChanged?.(jobId);
      await publishJobStatusChanged(jobId);
      throw err;
    }
  });

  // Step 3: Download image, write artifact, complete job
  await step.run('collect-artifacts', async () => {
    try {
      const image = outputs.images[0];
      if (!image) {
        throw new Error('No images returned from ComfyUI generation');
      }

      const imageBuffer = await executor.getArtifact(outputs, image.filename);

      const generatedAt = new Date().toISOString();
      const sidecar: ArtifactSidecar = {
        jobId,
        projectId,
        prompt: '', // will be filled from job below
        model: 'flux2_dev',
        seed: 0,
        width: 1024,
        height: 1024,
        steps: 20,
        guidanceScale: 3.5,
        generatedAt,
        executorAdapter: 'comfyui',
        comfyuiPromptId,
        imageFilename: image.filename,
      };

      // Get latest job state for sidecar metadata
      const job = await getAssetJob(db, jobId);
      if (job) {
        sidecar.prompt = job.prompt;
        sidecar.seed = job.seed ?? 0;
        sidecar.width = job.width ?? 1024;
        sidecar.height = job.height ?? 1024;
        sidecar.steps = job.steps ?? 20;
        sidecar.guidanceScale = job.guidanceScale ?? 3.5;
        if (job.negativePrompt) sidecar.negativePrompt = job.negativePrompt;
        currentVersion = job.version;
      }

      const artifactPath = await writeArtifact({
        artifactsRoot,
        jobId,
        projectId,
        imageBuffer,
        imageFilename: image.filename,
        sidecar,
      });

      // D-20: Auto-deliver to destination when set in extras
      const destination = (job?.extras as Record<string, unknown> | null)?.destination as string | undefined;
      if (destination && typeof destination === 'string') {
        // D-19: Create destination directory recursively
        await mkdir(dirname(destination), { recursive: true });
        // D-17: Copy image to destination (both copies exist; artifact dir is source of truth)
        await copyFile(join(artifactPath, image.filename), destination);
        // D-18: Provenance sidecar stays in artifact dir only — NOT copied to destination
        logger.info({ jobId, destination }, 'Asset delivered to destination');
      }

      const outputMetadata: AssetOutputMetadata = {
        imageFilename: image.filename,
        comfyuiPromptId,
        width: sidecar.width,
        height: sidecar.height,
        model: sidecar.model,
        generatedAt,
      };

      await completeJob(db, jobId, currentVersion, { artifactPath, outputMetadata });

      await appendAssetEvent(db, {
        projectId,
        jobId,
        type: 'asset_job_completed',
        extra: { artifactPath, imageFilename: image.filename },
      });
      onJobStatusChanged?.(jobId);
      await publishJobStatusChanged(jobId);

      logger.info({ jobId, artifactPath }, 'Asset generation completed');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await failJob(db, jobId, currentVersion, message);
      await appendAssetEvent(db, { projectId, jobId, type: 'asset_job_failed', extra: { reason: message } });
      onJobStatusChanged?.(jobId);
      await publishJobStatusChanged(jobId);
      throw err;
    }
  });

  return { jobId, status: 'completed' };
}

/**
 * Inngest function wrapper for the asset generation handler.
 * Listens for 'asset/generate.requested' events and runs the full
 * submit -> poll -> collect pipeline with 3 retries (D-15).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- InngestFunction<any> avoids TS2883 from Inngest v4's deeply-nested generic chain
export const handleAssetGenerate: InngestFunction<any, any, any, any> = inngest.createFunction(
  { id: 'asset/generate', triggers: [{ event: 'asset/generate.requested' }], retries: 3 },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ctx narrowing handled inside generateAssetHandler; SDK context type not exported
  (ctx) => generateAssetHandler(ctx as any)
);
