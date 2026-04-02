import { LLMGateway, loadConfig } from '@get-cauldron/engine';
import type { GatewayConfig } from '@get-cauldron/engine';
import { db } from '@get-cauldron/shared';

// Minimal structural type compatible with pino.Logger for the web layer.
// The web package does not run pino transports; this keeps the dep surface lean.
type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
  debug: (...args: unknown[]) => void;
  trace: (...args: unknown[]) => void;
  fatal: (obj: unknown, msg?: string) => void;
  child: (...args: unknown[]) => Logger;
};

// ────────────────────────────────────────────────────────────────────────────
// Engine dependency factory for tRPC context
//
// Provides a lazy, cached gateway/config/logger tuple.
// Mutations call `await ctx.getEngineDeps()` only when they need engine deps.
// This avoids gateway construction on read-only queries.
// ────────────────────────────────────────────────────────────────────────────

let _gateway: LLMGateway | null = null;
let _config: GatewayConfig | null = null;
let _logger: Logger | null = null;

/**
 * Returns a pino-compatible logger that routes to console.
 * The web process does not run pino transports — this keeps the web package
 * free from pino transport configuration while remaining structurally compatible.
 */
export function makeConsoleLogger(): Logger {
  const logger = {
    info: (obj: unknown, msg?: string) => console.log('[engine]', msg ?? obj),
    warn: (obj: unknown, msg?: string) => console.warn('[engine]', msg ?? obj),
    error: (obj: unknown, msg?: string) => console.error('[engine]', msg ?? obj),
    debug: () => {},
    trace: () => {},
    fatal: (obj: unknown, msg?: string) => console.error('[engine:fatal]', msg ?? obj),
    child: () => makeConsoleLogger(),
  } as unknown as Logger;
  return logger;
}

/**
 * Lazy engine dependency factory.
 * Results are cached at module level — calling it twice returns the same instances.
 * validateKeys: false so the web layer does not fail on missing API keys at startup.
 *
 * logger is typed as `any` to avoid pulling pino into the web package's type
 * surface — the structural shape is compatible, and InterviewFSM accepts it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- logger typed as any to avoid pulling pino into the web package's type surface; structural shape is compatible with pino.Logger
export async function getEngineDeps(): Promise<{
  gateway: LLMGateway;
  config: GatewayConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pino.Logger structural type cannot be satisfied without adding pino as a direct web dependency; `any` is the approved boundary escape hatch (Phase 10 decision)
  logger: any;
}> {
  if (_gateway && _config && _logger) {
    return { gateway: _gateway, config: _config, logger: _logger };
  }

  // Allow live tests to inject a config without needing loadConfig to work in Next.js
  const configOverride = process.env['CAULDRON_CONFIG_OVERRIDE'];
  if (configOverride) {
    _config = JSON.parse(configOverride) as GatewayConfig;
  } else {
    const projectRoot = process.env['CAULDRON_PROJECT_ROOT'] ?? process.cwd();
    try {
      _config = await loadConfig(projectRoot);
    } catch {
      const { defineConfig } = await import('@get-cauldron/engine');
      _config = defineConfig({
        models: {
          interview: ['claude-sonnet-4-6', 'mistral-large-latest'],
          holdout: ['gemini-2.5-pro', 'mistral-large-latest'],
          implementation: ['claude-sonnet-4-6', 'mistral-large-latest'],
          evaluation: ['gemini-2.5-pro', 'claude-sonnet-4-6'],
          decomposition: ['claude-sonnet-4-6', 'mistral-large-latest'],
          context_assembly: ['mistral-small-latest', 'ollama:qwen3-30b-a3b'],
          conflict_resolution: ['claude-sonnet-4-6', 'mistral-large-latest'],
        },
        budget: { defaultLimitCents: 500 },
        selfBuild: true,
      });
      console.warn('[engine-deps] cauldron.config.ts import failed — using built-in defaults');
    }
  }
  _logger = makeConsoleLogger();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- _logger is structurally compatible with pino.Logger; cast required because LLMGateway.create expects the pino type directly
  _gateway = await LLMGateway.create({ db, config: _config, logger: _logger as any, validateKeys: false });

  return { gateway: _gateway, config: _config, logger: _logger };
}

/**
 * Reset cached engine deps. Used in tests to provide fresh mocks per test.
 */
export function resetEngineDeps(): void {
  _gateway = null;
  _config = null;
  _logger = null;
}
