/**
 * MCP server dependency wiring.
 * Mirrors CLI bootstrap but scoped to asset deps only — no LLM gateway needed.
 *
 * CRITICAL: Logger MUST write to stderr (fd 2), NOT stdout.
 * stdout is the JSON-RPC transport pipe for MCP stdio communication.
 * Any output to stdout that isn't valid JSON-RPC will corrupt the protocol.
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import pino from 'pino';
import { db, ensureMigrations } from '@get-cauldron/shared';
import {
  inngest,
  configureAssetDeps,
  createComfyUIExecutor,
} from '@get-cauldron/engine';
import type { DbClient } from '@get-cauldron/shared';
import type { Logger } from 'pino';

// Load .env files — project-local first, then ~/.env as fallback for API keys
dotenvConfig();
dotenvConfig({ path: resolve(homedir(), '.env') });

export interface McpBootstrapDeps {
  db: DbClient;
  logger: Logger;
  inngest: typeof inngest;
  redisUrl: string;
}

/**
 * Bootstrap MCP server dependencies.
 *
 * - Runs pending DB migrations
 * - Creates pino logger writing to stderr (fd 2) — stdout is MCP's JSON-RPC pipe
 * - Creates ComfyUI executor from COMFYUI_URL env var
 * - Wires configureAssetDeps for Inngest asset handlers
 *
 * Unlike CLI bootstrap, does NOT configure scheduler, vault, or evolution deps
 * since the MCP server only needs the asset generation pipeline.
 */
export async function bootstrapMcp(projectRoot: string): Promise<McpBootstrapDeps> {
  await ensureMigrations();

  // CRITICAL: pino must write to stderr, NOT stdout (Pitfall 1 from research)
  // stdout is the JSON-RPC transport pipe for MCP stdio
  const logger = pino(
    { level: process.env['LOG_LEVEL'] ?? 'error' },
    pino.destination({ dest: 2, sync: false }) // fd 2 = stderr
  );

  const comfyuiUrl = process.env['COMFYUI_URL'] ?? 'http://localhost:8188';
  const artifactsRoot = resolve(projectRoot, '.cauldron', 'artifacts');
  const executor = createComfyUIExecutor({ baseUrl: comfyuiUrl, logger });
  configureAssetDeps({ db, logger, executor, artifactsRoot });

  const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';

  return { db, logger, inngest, redisUrl };
}
