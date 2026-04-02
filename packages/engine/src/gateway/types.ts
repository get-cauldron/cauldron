import type { LanguageModelUsage } from 'ai';
import type { z } from 'zod';

export type PipelineStage = 'interview' | 'holdout' | 'implementation' | 'evaluation' | 'decomposition' | 'context_assembly' | 'conflict_resolution';
export type ProviderFamily = 'anthropic' | 'mistral' | 'ollama' | 'google';

export type CapabilityLevel = 'strong' | 'moderate' | 'weak';
export type CapabilityDimension = 'coding' | 'reasoning' | 'instruction-following' | 'creativity' | 'speed';

export interface GatewayCallOptions {
  projectId: string;
  stage: PipelineStage;
  messages?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  prompt?: string;
  system?: string;
  beadId?: string;
  seedId?: string;
  evolutionCycle?: number;
  tools?: Record<string, unknown>;
  toolChoice?: 'auto' | 'none' | 'required' | { type: 'tool'; toolName: string };
  maxTokens?: number;
  temperature?: number;
  /** Override the model chain for this call. When set, uses this single model instead of the stage's configured chain. */
  modelOverride?: string;
}

export interface GatewayObjectOptions<T extends z.ZodType> extends GatewayCallOptions {
  schema: T;
  schemaName?: string;
  schemaDescription?: string;
}

export interface GatewayCallResult {
  model: string;
  providerFamily: ProviderFamily;
  failoverAttempts: number;
}

export interface UsageRecord {
  projectId: string;
  stage: PipelineStage;
  model: string;
  beadId?: string;
  evolutionCycle?: number;
  usage: LanguageModelUsage;
}
