import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import pino from 'pino';
import { db, ensureMigrations } from '@get-cauldron/shared';

// Load project-root .env first (DATABASE_URL, etc.), then ~/.env for API keys as fallback
dotenvConfig(); // loads closest .env (project root or CWD)
dotenvConfig({ path: resolve(homedir(), '.env') }); // ~/.env — won't override existing vars

// Strip stray quotes from env vars — dotenv may leave them depending on .env formatting
for (const key of ['MISTRAL_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'HOLDOUT_ENCRYPTION_KEY']) {
  const val = process.env[key];
  if (val) {
    process.env[key] = val.replace(/^"|"$/g, '');
  }
}
import {
  loadConfig,
  LLMGateway,
  inngest,
  configureSchedulerDeps,
  configureVaultDeps,
  configureEvolutionDeps,
  configureAssetDeps,
  configurePublisher,
  createComfyUIExecutor,
} from '@get-cauldron/engine';
import type { GatewayConfig } from '@get-cauldron/engine';
import type { DbClient } from '@get-cauldron/shared';
import type { Logger } from 'pino';

export interface BootstrapDeps {
  db: DbClient;
  gateway: LLMGateway;
  inngest: typeof inngest;
  logger: Logger;
  config: GatewayConfig;
}

/**
 * Construct all engine dependencies from environment variables.
 * Call this once during application startup before serving any commands.
 *
 * - Runs pending DB migrations (safe to call repeatedly)
 * - Loads cauldron.config.ts from projectRoot (falls back to Cauldron's own config for external projects)
 * - Constructs pino logger (level from LOG_LEVEL env var, default 'info')
 * - Constructs LLMGateway from db + config + logger
 * - Wires configureSchedulerDeps and configureVaultDeps for Inngest handlers
 */
export async function bootstrap(projectRoot: string): Promise<BootstrapDeps> {
  // Ensure DB schema is current before any queries
  await ensureMigrations();

  const config = await loadConfig(projectRoot);
  // Default to 'error' in CLI mode — warn-level failover logs are noise during interactive use
  const logger = pino({ level: process.env['LOG_LEVEL'] ?? 'error' });

  // Validate API keys at startup and warn about unavailable providers
  const gateway = await LLMGateway.create({ db, config, logger, validateKeys: true });

  configureSchedulerDeps({ db, gateway, projectRoot });
  configureVaultDeps({ db, gateway });
  configureEvolutionDeps({ db, gateway });

  // Wire asset generation dependencies (D-07: ComfyUI URL from env, D-10: artifacts in .cauldron/)
  const comfyuiUrl = process.env['COMFYUI_URL'] ?? 'http://localhost:8188';
  const artifactsRoot = resolve(projectRoot, '.cauldron', 'artifacts');
  const executor = createComfyUIExecutor({ baseUrl: comfyuiUrl, logger });
  configureAssetDeps({ db, logger, executor, artifactsRoot });

  const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
  configurePublisher(redisUrl, logger);

  return { db, gateway, inngest, logger, config };
}
