/**
 * SSE (Server-Sent Events) mock helpers for component tests.
 *
 * Provides a mock EventSource implementation that supports programmatic
 * event emission, allowing tests to trigger SSE messages without a real server.
 *
 * Usage:
 *   const sse = installEventSourceMock();
 *   // render component that uses EventSource
 *   sse.emit('message', { type: 'bead_completed', beadId: '123' });
 *   // assert component updated
 */
import { vi } from 'vitest';

export interface EventSourceMock {
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  readyState: number;
  /** Emit a message to all registered listeners for the given event type */
  emit(type: string, data: unknown): void;
}

/**
 * Create a standalone EventSource mock instance.
 * The instance tracks registered listeners and supports programmatic event emission.
 */
export function createEventSourceMock(): EventSourceMock {
  const listeners: Record<string, ((e: MessageEvent) => void)[]> = {};

  const instance: EventSourceMock = {
    addEventListener: vi.fn((type: string, cb: (e: MessageEvent) => void) => {
      listeners[type] = listeners[type] ?? [];
      listeners[type]!.push(cb);
    }),
    removeEventListener: vi.fn(),
    close: vi.fn(),
    readyState: 1,
    emit(type: string, data: unknown) {
      listeners[type]?.forEach((cb) =>
        cb({ data: JSON.stringify(data) } as MessageEvent)
      );
    },
  };

  return instance;
}

/**
 * Install an EventSource mock as a global stub.
 * Returns the mock instance so tests can emit events.
 *
 * Clean up with `vi.unstubAllGlobals()` in afterEach.
 */
export function installEventSourceMock(): EventSourceMock {
  const mock = createEventSourceMock();
  vi.stubGlobal('EventSource', vi.fn(() => mock));
  return mock;
}
