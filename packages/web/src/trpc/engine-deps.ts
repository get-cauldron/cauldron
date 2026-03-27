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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getEngineDeps(): Promise<{
  gateway: LLMGateway;
  config: GatewayConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logger: any;
}> {
  if (_gateway && _config && _logger) {
    return { gateway: _gateway, config: _config, logger: _logger };
  }

  const projectRoot = process.env['CAULDRON_PROJECT_ROOT'] ?? process.cwd();
  _config = await loadConfig(projectRoot);
  _logger = makeConsoleLogger();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
