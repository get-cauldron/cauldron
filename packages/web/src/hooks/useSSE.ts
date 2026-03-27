'use client';
import { useEffect, useRef, useCallback, useState } from 'react';

interface UseSSEOptions {
  enabled?: boolean;
}

export function useSSE<T>(
  url: string | null,
  onEvent: (event: T) => void,
  options: UseSSEOptions = {}
) {
  const { enabled = true } = options;
  const esRef = useRef<EventSource | null>(null);
  const lastIdRef = useRef<number>(0);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(() => {
    if (!url || !enabled) return;
    // Close existing connection
    esRef.current?.close();

    const fullUrl =
      lastIdRef.current > 0 ? `${url}?lastEventId=${lastIdRef.current}` : url;

    const es = new EventSource(fullUrl);
    esRef.current = es;

    es.addEventListener('pipeline', (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data) as T;
        const id = parseInt(e.lastEventId, 10);
        if (!isNaN(id)) lastIdRef.current = id;
        onEventRef.current(parsed);
      } catch {
        /* ignore parse errors */
      }
    });

    es.onopen = () => {
      setConnected(true);
      setError(null);
    };

    es.onerror = () => {
      setConnected(false);
      setError('Live updates paused — reconnecting...');
      // EventSource auto-reconnects; browser handles retry
    };
  }, [url, enabled]);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, [connect]);

  return { connected, error };
}
