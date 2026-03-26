import pino from 'pino';
import { db } from '@cauldron/shared';
import {
  loadConfig,
  LLMGateway,
  inngest,
  configureSchedulerDeps,
  configureVaultDeps,
} from '@cauldron/engine';
import type { GatewayConfig } from '@cauldron/engine';
import type { DbClient } from '@cauldron/shared';
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
 * - Loads cauldron.config.ts from projectRoot
 * - Constructs pino logger (level from LOG_LEVEL env var, default 'info')
 * - Constructs LLMGateway from db + config + logger
 * - Wires configureSchedulerDeps and configureVaultDeps for Inngest handlers
 */
export async function bootstrap(projectRoot: string): Promise<BootstrapDeps> {
  const config = await loadConfig(projectRoot);
  const logger = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });
  const gateway = new LLMGateway({ db, config, logger });

  configureSchedulerDeps({ db, gateway, projectRoot });
  configureVaultDeps({ db, gateway });

  return { db, gateway, inngest, logger, config };
}
