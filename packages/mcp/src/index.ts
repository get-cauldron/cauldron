#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { bootstrapMcp } from './bootstrap.js';
import { findProjectRoot, resolveProjectId } from './project-detector.js';
import { createMcpServer } from './server.js';
import { createJobStatusSubscriber } from './ipc-subscriber.js';

async function main() {
  // D-07: Auto-detect project from cwd
  const projectRoot = findProjectRoot(process.cwd());
  if (!projectRoot) {
    // Write to stderr — never stdout in stdio MCP server
    process.stderr.write(
      'Error: Not inside a Cauldron project. Expected cauldron.config.ts or .cauldron/ in a parent directory.\n'
    );
    process.exit(1);
  }

  const { db, logger, inngest, redisUrl } = await bootstrapMcp(projectRoot);

  // Resolve project ID from filesystem marker or DB fallback
  const projectId = await resolveProjectId(db, projectRoot);

  // Check Inngest dev server health (non-blocking warning per research Pitfall 3)
  try {
    const resp = await fetch('http://localhost:8288/v1/health', {
      signal: AbortSignal.timeout(2000),
    });
    if (!resp.ok) {
      logger.warn('Inngest dev server returned non-OK status. Image generation may not process.');
    }
  } catch {
    process.stderr.write(
      'Warning: Inngest dev server not reachable at localhost:8288. Image generation jobs will be submitted but not processed until Inngest is running.\n'
    );
  }

  const server = createMcpServer({ db, inngest, projectId, logger });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Start Redis subscriber for cross-process push notifications (best-effort)
  createJobStatusSubscriber(server, redisUrl, logger);

  // CRITICAL: No console.log after this point — stdout is the JSON-RPC pipe
  logger.info({ projectRoot, projectId }, 'Cauldron MCP server started');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
