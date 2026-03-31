import { eq, and } from 'drizzle-orm';
import { assetJobs, appendEvent } from '@get-cauldron/shared';
import type { DbClient } from '@get-cauldron/shared';
import type { AssetJobParams, AssetJobHandle, AssetOutputMetadata } from './types.js';
import { AssetJobError } from './errors.js';

/**
 * Submit a new asset generation job.
 * Returns immediately with a job handle — never blocks on generation.
 * If an idempotencyKey is provided and a matching job already exists,
 * returns the existing job with duplicate: true.
 */
export async function submitAssetJob({
  db,
  params,
}: {
  db: DbClient;
  params: AssetJobParams;
}): Promise<AssetJobHandle> {
  try {
    const [job] = await db
      .insert(assetJobs)
      .values({
        projectId: params.projectId,
        prompt: params.prompt,
        negativePrompt: params.negativePrompt ?? null,
        width: params.width ?? null,
        height: params.height ?? null,
        seed: params.seed ?? null,
        steps: params.steps ?? null,
        guidanceScale: params.guidanceScale ?? null,
        idempotencyKey: params.idempotencyKey ?? null,
        extras: params.extras ?? {},
      })
      .returning();

    return {
      jobId: job!.id,
      status: job!.status,
      duplicate: false,
    };
  } catch (err: unknown) {
    // Postgres unique constraint violation (idempotency_key)
    if (
      err !== null &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === '23505' &&
      params.idempotencyKey
    ) {
      // Fetch the existing job
      const [existing] = await db
        .select()
        .from(assetJobs)
        .where(
          and(
            eq(assetJobs.projectId, params.projectId),
            eq(assetJobs.idempotencyKey, params.idempotencyKey)
          )
        )
        .limit(1);

      return {
        jobId: existing!.id,
        status: existing!.status,
        duplicate: true,
      };
    }
    throw err;
  }
}

/**
 * Claim a pending job for processing.
 * Uses optimistic concurrency — throws if version doesn't match.
 * Transitions: pending -> claimed.
 */
export async function claimJob(
  db: DbClient,
  jobId: string,
  expectedVersion: number
): Promise<typeof assetJobs.$inferSelect> {
  const [updated] = await db
    .update(assetJobs)
    .set({
      status: 'claimed',
      claimedAt: new Date(),
      updatedAt: new Date(),
      version: expectedVersion + 1,
    })
    .where(
      and(
        eq(assetJobs.id, jobId),
        eq(assetJobs.version, expectedVersion),
        eq(assetJobs.status, 'pending')
      )
    )
    .returning();

  if (!updated) {
    throw new AssetJobError(
      'Optimistic concurrency conflict or invalid state for claim',
      jobId
    );
  }

  return updated;
}

/**
 * Update the status of a job, incrementing version for optimistic concurrency.
 * Throws AssetJobError if the version doesn't match (stale update).
 */
export async function updateJobStatus(
  db: DbClient,
  jobId: string,
  status: 'pending' | 'claimed' | 'active' | 'completed' | 'failed' | 'canceled',
  expectedVersion: number
): Promise<typeof assetJobs.$inferSelect> {
  const [updated] = await db
    .update(assetJobs)
    .set({
      status,
      updatedAt: new Date(),
      version: expectedVersion + 1,
    })
    .where(
      and(
        eq(assetJobs.id, jobId),
        eq(assetJobs.version, expectedVersion)
      )
    )
    .returning();

  if (!updated) {
    throw new AssetJobError(
      'Optimistic concurrency conflict',
      jobId
    );
  }

  return updated;
}

/**
 * Mark a job as completed with artifact path and output metadata.
 */
export async function completeJob(
  db: DbClient,
  jobId: string,
  expectedVersion: number,
  result: {
    artifactPath: string;
    outputMetadata: AssetOutputMetadata;
  }
): Promise<typeof assetJobs.$inferSelect> {
  const [updated] = await db
    .update(assetJobs)
    .set({
      status: 'completed',
      completedAt: new Date(),
      updatedAt: new Date(),
      version: expectedVersion + 1,
      artifactPath: result.artifactPath,
      outputMetadata: result.outputMetadata,
    })
    .where(
      and(
        eq(assetJobs.id, jobId),
        eq(assetJobs.version, expectedVersion)
      )
    )
    .returning();

  if (!updated) {
    throw new AssetJobError('Optimistic concurrency conflict on complete', jobId);
  }

  return updated;
}

/**
 * Mark a job as failed with a reason.
 */
export async function failJob(
  db: DbClient,
  jobId: string,
  expectedVersion: number,
  failureReason: string
): Promise<typeof assetJobs.$inferSelect> {
  const [updated] = await db
    .update(assetJobs)
    .set({
      status: 'failed',
      failureReason,
      completedAt: new Date(),
      updatedAt: new Date(),
      version: expectedVersion + 1,
    })
    .where(
      and(
        eq(assetJobs.id, jobId),
        eq(assetJobs.version, expectedVersion)
      )
    )
    .returning();

  if (!updated) {
    throw new AssetJobError('Optimistic concurrency conflict on fail', jobId);
  }

  return updated;
}

/**
 * Cancel a job (soft delete per D-03).
 */
export async function cancelJob(
  db: DbClient,
  jobId: string
): Promise<typeof assetJobs.$inferSelect> {
  const [updated] = await db
    .update(assetJobs)
    .set({
      status: 'canceled',
      updatedAt: new Date(),
    })
    .where(eq(assetJobs.id, jobId))
    .returning();

  if (!updated) {
    throw new AssetJobError('Job not found for cancellation', jobId);
  }

  return updated;
}

/**
 * Retrieve a job by ID. Returns null if not found.
 */
export async function getAssetJob(
  db: DbClient,
  jobId: string
): Promise<typeof assetJobs.$inferSelect | null> {
  const [job] = await db
    .select()
    .from(assetJobs)
    .where(eq(assetJobs.id, jobId))
    .limit(1);

  return job ?? null;
}

/**
 * Retrieve a job by project ID and idempotency key. Returns null if not found.
 */
export async function getAssetJobByIdempotencyKey(
  db: DbClient,
  projectId: string,
  idempotencyKey: string
): Promise<typeof assetJobs.$inferSelect | null> {
  const [job] = await db
    .select()
    .from(assetJobs)
    .where(
      and(
        eq(assetJobs.projectId, projectId),
        eq(assetJobs.idempotencyKey, idempotencyKey)
      )
    )
    .limit(1);

  return job ?? null;
}

/**
 * Append an asset lifecycle event to the shared event store.
 */
export async function appendAssetEvent(
  db: DbClient,
  options: {
    projectId: string;
    jobId: string;
    type:
      | 'asset_job_submitted'
      | 'asset_job_active'
      | 'asset_job_completed'
      | 'asset_job_failed'
      | 'asset_job_canceled';
    extra?: Record<string, unknown>;
  }
): Promise<void> {
  await appendEvent(db, {
    projectId: options.projectId,
    type: options.type,
    payload: {
      jobId: options.jobId,
      ...options.extra,
    },
  });
}
