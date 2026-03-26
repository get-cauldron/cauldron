import type { PipelineStage, ProviderFamily } from './types.js';

export interface FailoverAttempt {
  model: string;
  provider: ProviderFamily;
  error: string;
  statusCode?: number;
  timestamp: Date;
}

export class GatewayExhaustedError extends Error {
  public readonly attempts: FailoverAttempt[];
  public readonly stage: PipelineStage;
  constructor(stage: PipelineStage, attempts: FailoverAttempt[]) {
    super(`All providers exhausted for stage '${stage}' after ${attempts.length} attempt(s)`);
    this.name = 'GatewayExhaustedError';
    this.stage = stage;
    this.attempts = attempts;
  }
}

export class BudgetExceededError extends Error {
  public readonly projectId: string;
  public readonly limitCents: number;
  public readonly currentCents: number;
  constructor(projectId: string, limitCents: number, currentCents: number) {
    super(`Project '${projectId}' budget exceeded: ${currentCents} cents used of ${limitCents} cent limit`);
    this.name = 'BudgetExceededError';
    this.projectId = projectId;
    this.limitCents = limitCents;
    this.currentCents = currentCents;
  }
}

export class DiversityViolationError extends Error {
  public readonly holdoutModel: string;
  public readonly implementerModel: string;
  public readonly family: ProviderFamily;
  constructor(holdoutModel: string, implementerModel: string, family: ProviderFamily) {
    super(`Cross-model diversity violation: holdout '${holdoutModel}' and implementer '${implementerModel}' are both '${family}'`);
    this.name = 'DiversityViolationError';
    this.holdoutModel = holdoutModel;
    this.implementerModel = implementerModel;
    this.family = family;
  }
}
