import { EventSource } from 'eventsource';
import chalk from 'chalk';
import { getBeadColor, formatJson } from '../output.js';

interface PipelineEvent {
  id: string;
  projectId: string;
  seedId: string | null;
  beadId: string | null;
  type: string;
  payload: Record<string, unknown>;
  sequenceNumber: number;
  createdAt: string;
}

export interface LogsFlags {
  json: boolean;
  projectId?: string;
  serverUrl: string;
  apiKey: string;
}

/**
 * `cauldron logs` — streams pipeline events in real-time via SSE.
 *
 * Per D-07 and D-13: behaves like `docker logs -f` with colored per-bead prefixes.
 * Connects directly to /api/events/[projectId] — bypasses tRPC client per plan pitfall 3.
 *
 * Usage: cauldron logs <project-id> [--bead <bead-id>] [--json]
 */
export function logsCommand(
  _client: unknown,
  args: string[],
  flags: LogsFlags
): void {
  const projectId = flags.projectId ?? args.filter(a => !a.startsWith('--'))[0];
  if (!projectId) {
    console.error('Usage: cauldron logs <project-id> [--bead <id>] [--json]');
    process.exit(1);
  }

  // Parse --bead flag from args
  const beadIdx = args.indexOf('--bead');
  const beadFilter = beadIdx !== -1 ? args[beadIdx + 1] : undefined;

  const url = `${flags.serverUrl}/api/events/${projectId}`;
  const apiKey = flags.apiKey;

  // eventsource v4 uses a custom fetch wrapper for auth headers (no `headers` init option)
  const es = new EventSource(url, {
    fetch: (fetchUrl, init) =>
      fetch(fetchUrl, {
        ...init,
        headers: {
          ...init.headers,
          Authorization: `Bearer ${apiKey}`,
        },
      } as RequestInit),
  });

  console.log(chalk.hex('#00d4aa')(`Streaming logs for project ${projectId}...`));
  if (beadFilter) {
    console.log(chalk.gray(`Filtering to bead: ${beadFilter}`));
  }
  console.log(chalk.gray('Press Ctrl+C to stop.\n'));

  es.addEventListener('pipeline', (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data) as PipelineEvent;

      // Apply bead filter
      if (beadFilter && data.beadId !== beadFilter) return;

      if (flags.json) {
        console.log(formatJson(data));
        return;
      }

      // Color-coded bead prefix (per D-13)
      const beadName = data.beadId ? data.beadId.slice(0, 8) : 'system';
      const color = getBeadColor(beadName);
      const prefix = chalk.hex(color)(`[${beadName}]`);

      // Timestamp
      const ts = chalk.gray(new Date(data.createdAt).toLocaleTimeString());

      // Event type with status coloring
      const typeStr = data.type.includes('fail')
        ? chalk.red(data.type)
        : data.type.includes('complete')
          ? chalk.hex('#00d4aa')(data.type)
          : chalk.white(data.type);

      // Payload summary (truncate to 120 chars)
      const payloadStr = data.payload
        ? chalk.gray(JSON.stringify(data.payload).slice(0, 120))
        : '';

      console.log(`${ts} ${prefix} ${typeStr} ${payloadStr}`);
    } catch {
      // Ignore malformed events
    }
  });

  es.onerror = () => {
    // EventSource auto-reconnects; only log if connection fully closed
    if (es.readyState === EventSource.CLOSED) {
      console.error(chalk.red('Connection lost. Retrying...'));
    }
  };

  // Clean SIGINT/SIGTERM handling
  const cleanup = () => {
    es.close();
    console.log(chalk.gray('\nStream closed.'));
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Keep alive — EventSource event loop keeps process running
}
