// packages/engine/src/asset/ipc-publisher.ts
// Source: ioredis 5.x official docs (https://redis.github.io/ioredis/)

import { Redis } from 'ioredis';
import type { Logger } from 'pino';

let publisher: Redis | null = null;

/**
 * Configure the module-level Redis publisher used for cross-process IPC.
 * Must be called during application startup before publishJobStatusChanged is used.
 * Idempotent — subsequent calls are silently ignored.
 */
export function configurePublisher(redisUrl: string, logger: Logger): void {
  if (publisher) return; // idempotent — already configured
  publisher = new Redis(redisUrl, {
    lazyConnect: false,
    maxRetriesPerRequest: 3,
    enableOfflineQueue: false,
  });
  // MUST register error listener before any operation to prevent unhandled crash
  publisher.on('error', (err: Error) => {
    // Best-effort — log but never throw; IPC failures must not crash the engine
    logger.warn({ err }, 'IPC publisher Redis error (non-fatal)');
  });
}

/**
 * Publish a job status change to the Redis IPC channel.
 * Best-effort — errors are swallowed. Returns void, never throws.
 * If publisher is not configured, returns silently.
 */
export async function publishJobStatusChanged(jobId: string): Promise<void> {
  if (!publisher) return; // Not configured — silently skip
  const p = publisher;
  try {
    // Swallow all errors — push is best-effort, DB pull is the correctness path
    await p.publish(`cauldron:job-status:${jobId}`, jobId);
  } catch {
    // Swallow — push is best-effort
  }
}
