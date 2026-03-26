import type { PipelineStage } from './types.js';
import path from 'node:path';

export interface GatewayConfig {
  models: Record<PipelineStage, string[]>;
  budget: { defaultLimitCents: number };
  perspectiveModels?: Partial<Record<string, string>>; // D-10: PerspectiveName → model ID
  scoringModel?: string; // D-18: fast/cheap model for ambiguity scoring
  selfBuild?: boolean; // D-15: activates engine snapshot + migration review gates when building Cauldron itself
}

export function defineConfig(config: GatewayConfig): GatewayConfig {
  return config;
}

export async function loadConfig(projectRoot: string): Promise<GatewayConfig> {
  const configPath = path.join(projectRoot, 'cauldron.config.ts');
  const mod = await import(configPath);
  return mod.default as GatewayConfig;
}
