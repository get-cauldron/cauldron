import type { PipelineStage } from './types.js';
import path from 'node:path';

export interface GatewayConfig {
  models: Record<PipelineStage, string[]>;
  budget: { defaultLimitCents: number };
}

export function defineConfig(config: GatewayConfig): GatewayConfig {
  return config;
}

export async function loadConfig(projectRoot: string): Promise<GatewayConfig> {
  const configPath = path.join(projectRoot, 'cauldron.config.ts');
  const mod = await import(configPath);
  return mod.default as GatewayConfig;
}
