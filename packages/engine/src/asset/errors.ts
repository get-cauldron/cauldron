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

export class AssetModeDisabledError extends Error {
  constructor(public readonly projectId: string) {
    super(`Asset generation is disabled for project '${projectId}'`);
    this.name = 'AssetModeDisabledError';
  }
}

export class AssetModePausedError extends Error {
  constructor(public readonly projectId: string) {
    super(`Asset generation is paused for project '${projectId}'. Jobs will not be dispatched.`);
    this.name = 'AssetModePausedError';
  }
}

export class AssetConcurrencyLimitError extends Error {
  constructor(
    public readonly projectId: string,
    public readonly limit: number,
    public readonly current: number,
  ) {
    super(`Asset concurrency limit reached for project '${projectId}': ${current}/${limit} active jobs`);
    this.name = 'AssetConcurrencyLimitError';
  }
}
