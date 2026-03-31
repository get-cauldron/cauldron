export class AssetJobError extends Error {
  constructor(message: string, public readonly jobId?: string) {
    super(message);
    this.name = 'AssetJobError';
  }
}

export class ComfyUIError extends Error {
  constructor(message: string, public readonly statusCode?: number) {
    super(message);
    this.name = 'ComfyUIError';
  }
}

export class DuplicateIdempotencyKeyError extends Error {
  constructor(public readonly existingJobId: string) {
    super(`Duplicate idempotency key — existing job: ${existingJobId}`);
    this.name = 'DuplicateIdempotencyKeyError';
  }
}
