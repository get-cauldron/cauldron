// packages/mcp/src/ipc-subscriber.ts
// Source: ioredis 5.x official docs (https://redis.github.io/ioredis/)

import { Redis } from 'ioredis';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Logger } from 'pino';
import { notifyJobStatusChanged } from './resources/job-status.js';

/**
 * Create a dedicated Redis subscriber for job status IPC.
 * Subscribes to cauldron:job-status:* pattern and calls notifyJobStatusChanged
 * on every message. Errors are logged but never thrown.
 * Returns the subscriber instance (caller can call .quit() on shutdown).
 *
 * IMPORTANT: sub.on('error') is registered BEFORE psubscribe to prevent
 * unhandled EventEmitter crash if Redis is unreachable.
 *
 * NOTE: In MCP stdio processes, stdout is the JSON-RPC pipe. All logging
 * uses the pino logger (which writes to stderr) — never console.log or stdout.
 */
export function createJobStatusSubscriber(
  server: McpServer,
  redisUrl: string,
  logger: Logger
): Redis {
  const sub = new Redis(redisUrl);

  // Register error handler FIRST — prevents unhandled EventEmitter crash
  // when Redis connection fails before any listener is attached
  sub.on('error', (err: Error) => {
    // Best-effort — never surface as an error to the MCP client
    logger.warn({ err }, 'IPC subscriber Redis error (non-fatal)');
  });

  // Pattern subscription covers all job IDs with one connection.
  // autoResubscribe is true by default — channels are restored after reconnect.
  sub.psubscribe('cauldron:job-status:*', (err?: Error | null) => {
    if (err) {
      logger.warn({ err }, 'IPC subscriber psubscribe failed (non-fatal)');
    }
  });

  // pmessage fires for pattern subscriptions; message is the jobId string
  // published by ipc-publisher.ts
  sub.on('pmessage', (_pattern: string, _channel: string, message: string) => {
    notifyJobStatusChanged(server, message);
  });

  return sub;
}
