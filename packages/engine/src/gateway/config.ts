import type { PipelineStage, ProviderFamily, CapabilityLevel, CapabilityDimension } from './types.js';
import path from 'node:path';

export interface CLIConfigSection {
  serverUrl?: string;
  apiKey?: string;
}

export interface GatewayConfig {
  models: Record<PipelineStage, string[]>;
  budget: { defaultLimitCents: number };
  perspectiveModels?: Partial<Record<string, string>>; // D-10: PerspectiveName → model ID
  scoringModel?: string; // D-18: fast/cheap model for ambiguity scoring
  selfBuild?: boolean; // D-15: activates engine snapshot + migration review gates when building Cauldron itself
  cli?: CLIConfigSection; // D-14: CLI server URL and API key for tRPC client
  providerCapabilities?: Partial<Record<ProviderFamily, Partial<Record<CapabilityDimension, CapabilityLevel>>>>; // D-14: per-provider capability tags
}

export function defineConfig(config: GatewayConfig): GatewayConfig {
  return config;
}

export async function loadConfig(projectRoot: string): Promise<GatewayConfig> {
  const configPath = process.env['CAULDRON_CONFIG_PATH'] || path.join(projectRoot, 'cauldron.config.ts');
  try {
    // Dynamic import with variable path — only used by CLI, not by Next.js webpack.
    // webpackIgnore comment prevents "Critical dependency" warning in web bundle.
    const mod = await import(/* webpackIgnore: true */ configPath);
    return mod.default as GatewayConfig;
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ERR_MODULE_NOT_FOUND') {
      // External projects without cauldron.config.ts — fall back to Cauldron's own config
      const cauldronRoot = path.resolve(import.meta.dirname, '..', '..', '..', '..');
      if (cauldronRoot !== projectRoot) {
        return loadConfig(cauldronRoot);
      }
    }
    throw err;
  }
}
