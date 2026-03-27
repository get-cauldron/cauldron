import { db } from '@cauldron/shared';
import { events } from '@cauldron/shared';
import { eq, gt, and, asc } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params; // Next.js 16: params is async

  // Support Last-Event-ID from header OR query param (EventSource reconnect)
  const lastEventIdHeader = request.headers.get('last-event-id');
  const url = new URL(request.url);
  const lastEventIdParam = url.searchParams.get('lastEventId');
  const since = parseInt(lastEventIdHeader ?? lastEventIdParam ?? '0', 10) || 0;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // lastSeq tracks the highest sequence number seen — starts at `since` (from Last-Event-ID)
      // and advances through replay and polling to prevent duplicate delivery.
      let lastSeq = since;

      // 1. Replay missed events from sequence number
      try {
        const missed = await db
          .select()
          .from(events)
          .where(
            and(eq(events.projectId, projectId), gt(events.sequenceNumber, since))
          )
          .orderBy(asc(events.sequenceNumber));

        for (const event of missed) {
          const payload = {
            id: event.id,
            projectId: event.projectId,
            seedId: event.seedId ?? null,
            beadId: event.beadId ?? null,
            type: event.type,
            payload: event.payload,
            sequenceNumber: event.sequenceNumber,
            createdAt: event.occurredAt.toISOString(),
          };
          const data = `id: ${event.sequenceNumber}\nevent: pipeline\ndata: ${JSON.stringify(payload)}\n\n`;
          controller.enqueue(encoder.encode(data));
          lastSeq = event.sequenceNumber;
        }
      } catch (err) {
        // Log but don't crash — connection might still be useful for live events
        console.error('[SSE] Replay error:', err);
      }

      // 2. Poll for new events every 2 seconds
      // PostgreSQL LISTEN does not work over connection pools —
      // a dedicated long-lived connection is required per SSE subscriber.
      // Use polling (every 2 seconds) querying new events by sequenceNumber.
      // This is pragmatic for v1. LISTEN/NOTIFY upgrade is a future optimization
      // when concurrent SSE subscribers warrant dedicated DB connections.

      const pollInterval = setInterval(async () => {
        try {
          const newEvents = await db
            .select()
            .from(events)
            .where(
              and(
                eq(events.projectId, projectId),
                gt(events.sequenceNumber, lastSeq)
              )
            )
            .orderBy(asc(events.sequenceNumber));

          for (const event of newEvents) {
            const payload = {
              id: event.id,
              projectId: event.projectId,
              seedId: event.seedId ?? null,
              beadId: event.beadId ?? null,
              type: event.type,
              payload: event.payload,
              sequenceNumber: event.sequenceNumber,
              createdAt: event.occurredAt.toISOString(),
            };
            const data = `id: ${event.sequenceNumber}\nevent: pipeline\ndata: ${JSON.stringify(payload)}\n\n`;
            controller.enqueue(encoder.encode(data));
            lastSeq = event.sequenceNumber;
          }
        } catch {
          // Swallow poll errors — connection might be closing
        }
      }, 2000);

      // Send keepalive comment every 30s to prevent proxy timeouts
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        } catch {
          // Stream closed
        }
      }, 30000);

      // Cleanup on disconnect
      request.signal.addEventListener('abort', () => {
        clearInterval(pollInterval);
        clearInterval(keepalive);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}
