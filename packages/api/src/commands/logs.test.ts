import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';

// ---- Mock eventsource BEFORE importing logs ----
const mockAddEventListener = vi.fn();
const mockClose = vi.fn();
const mockEventSourceInstance = {
  addEventListener: mockAddEventListener,
  close: mockClose,
  onerror: null as ((ev: unknown) => unknown) | null,
  readyState: 1,
};

let capturedUrl: string | undefined;
let capturedFetch: ((url: string | URL, init: Record<string, unknown>) => Promise<unknown>) | undefined;

const MockEventSource = vi.fn(
  (url: string | URL, init?: { fetch?: typeof capturedFetch }) => {
    capturedUrl = typeof url === 'string' ? url : url.toString();
    capturedFetch = init?.fetch;
    return mockEventSourceInstance;
  }
);

vi.mock('eventsource', () => ({
  EventSource: MockEventSource,
}));

// ---- Mock output.ts ----
vi.mock('../output.js', () => ({
  getBeadColor: vi.fn(() => '#00d4aa'),
  formatJson: vi.fn((data: unknown) => JSON.stringify(data, null, 2)),
}));

// ---- Mock chalk to avoid color codes in assertions ----
vi.mock('chalk', () => {
  const identity = (s: unknown) => String(s);
  const hexChain = { hex: () => hexChain, gray: identity, red: identity, white: identity };
  const hexFn = () => identity;
  const chalk = {
    hex: () => identity,
    gray: identity,
    red: identity,
    white: identity,
  };
  return { default: chalk };
});

// Now import after mocks are set up
import { logsCommand } from './logs.js';

// ---- Helper: dispatch a synthetic pipeline event ----
function dispatchPipelineEvent(data: Record<string, unknown>) {
  // Find the 'pipeline' listener registered via addEventListener
  const call = mockAddEventListener.mock.calls.find(
    (c: unknown[]) => c[0] === 'pipeline'
  );
  if (!call) throw new Error('pipeline listener not registered');
  const listener = call[1] as (event: { data: string }) => void;
  listener({ data: JSON.stringify(data) });
}

const BASE_FLAGS = {
  json: false,
  projectId: 'proj-123',
  serverUrl: 'http://localhost:3000',
  apiKey: 'test-api-key',
};

describe('logsCommand', () => {
  let consoleSpy: MockInstance;
  let consoleErrorSpy: MockInstance;
  let processExitSpy: MockInstance;
  let processSigintHandlers: Array<() => void>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    processSigintHandlers = [];
    vi.spyOn(process, 'on').mockImplementation((event: string | symbol, handler: (...args: unknown[]) => void) => {
      if (event === 'SIGINT' || event === 'SIGTERM') {
        processSigintHandlers.push(handler as () => void);
      }
      return process;
    });
    mockEventSourceInstance.readyState = 1;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('connects EventSource to the correct URL with projectId', async () => {
    // Do not await — logsCommand keeps process alive via EventSource
    logsCommand({ client: null as never } as never, [], BASE_FLAGS);
    // Allow microtask to run
    await Promise.resolve();

    expect(MockEventSource).toHaveBeenCalledOnce();
    expect(capturedUrl).toBe('http://localhost:3000/api/events/proj-123');
  });

  it('injects Authorization header via custom fetch wrapper', async () => {
    logsCommand({ client: null as never } as never, [], BASE_FLAGS);
    await Promise.resolve();

    // capturedFetch must be defined
    expect(capturedFetch).toBeDefined();

    // Call it with a mock fetch that records headers
    let recordedHeaders: Record<string, string> | undefined;
    const fakeFetch = vi.fn(async (_url: unknown, init: { headers?: Record<string, string> }) => {
      recordedHeaders = init.headers;
      // Return a minimal Response-like that satisfies EventSourceFetchInit
      return {
        status: 200,
        url: String(_url),
        redirected: false,
        headers: { get: () => 'text/event-stream' },
        body: { getReader: () => ({ read: async () => ({ done: true }), cancel: async () => {} }) },
      };
    });

    // Wrap the captured fetch to verify it injects auth header
    if (capturedFetch) {
      await capturedFetch('http://test', {
        headers: { Accept: 'text/event-stream' },
        fetch: fakeFetch,
      }).catch(() => {});
    }

    // The custom fetch injected into EventSource must pass Authorization header
    // We verify capturedFetch merges Authorization into the headers
    // by checking what it would call the underlying fetch with
    // Instead: call the injected fetch wrapper directly with an inner fakeFetch
    // The simplest test: the custom fetch takes (url, init) and adds Authorization
    // We re-invoke with control over the underlying fetch
    let injectedHeaders: Record<string, string> | undefined;

    const wrapperFetch = capturedFetch!;

    // Create a fake underlying fetch
    const innerFetch = vi.fn(async (url: unknown, init: Record<string, unknown>) => {
      injectedHeaders = init.headers as Record<string, string>;
      return {
        status: 200,
        url: String(url),
        redirected: false,
        headers: { get: () => 'text/event-stream' },
        body: { getReader: () => ({ read: async () => ({ done: true }), cancel: async () => {} }) },
      };
    });

    // The wrapper must call inner fetch with the Authorization header
    // Rebuild logs with a custom innerFetch injected
    // Since we can't re-inject, we trust the wrapper calls globalThis.fetch with headers
    // Instead, just test that the wrapper adds the Authorization header by checking
    // the headers in the init passed to the inner fetch reference
    // We test this by checking the wrapper's fetch call against a spy on globalThis.fetch
    const globalFetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(innerFetch as typeof fetch);

    await wrapperFetch('http://test', { headers: { Accept: 'text/event-stream' } }).catch(() => {});

    globalFetchSpy.mockRestore();

    expect(injectedHeaders).toBeDefined();
    expect(injectedHeaders!['Authorization']).toBe('Bearer test-api-key');
  });

  it('renders pipeline event with beadId as [bead-prefix] event_type payload', async () => {
    logsCommand({ client: null as never } as never, [], BASE_FLAGS);
    await Promise.resolve();

    dispatchPipelineEvent({
      id: 'evt-1',
      projectId: 'proj-123',
      seedId: null,
      beadId: 'bead-abcdef01',
      type: 'bead_started',
      payload: { message: 'starting' },
      sequenceNumber: 1,
      createdAt: new Date('2026-01-01T00:00:00Z').toISOString(),
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('bead-abc')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('bead_started')
    );
  });

  it('renders pipeline event without beadId as [system] prefix', async () => {
    logsCommand({ client: null as never } as never, [], BASE_FLAGS);
    await Promise.resolve();

    dispatchPipelineEvent({
      id: 'evt-2',
      projectId: 'proj-123',
      seedId: null,
      beadId: null,
      type: 'merge_started',
      payload: {},
      sequenceNumber: 2,
      createdAt: new Date().toISOString(),
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('system')
    );
  });

  it('--bead filter skips events with non-matching beadId', async () => {
    const flags = { ...BASE_FLAGS, beadFilter: 'bead-target' };
    logsCommand({ client: null as never } as never, ['--bead', 'bead-target'], BASE_FLAGS);
    await Promise.resolve();

    // Reset console spy to only track calls after setup
    consoleSpy.mockClear();

    // Dispatch event with a DIFFERENT beadId — should be skipped
    dispatchPipelineEvent({
      id: 'evt-3',
      projectId: 'proj-123',
      seedId: null,
      beadId: 'bead-other',
      type: 'bead_started',
      payload: {},
      sequenceNumber: 3,
      createdAt: new Date().toISOString(),
    });

    // console.log should NOT have been called for this filtered-out event
    // (no timestamp/prefix log for filtered events)
    const eventLogs = consoleSpy.mock.calls.filter(
      args => typeof args[0] === 'string' && args[0].includes('bead_started')
    );
    expect(eventLogs).toHaveLength(0);

    // Dispatch event with MATCHING beadId — should render
    consoleSpy.mockClear();
    dispatchPipelineEvent({
      id: 'evt-4',
      projectId: 'proj-123',
      seedId: null,
      beadId: 'bead-target',
      type: 'bead_completed',
      payload: {},
      sequenceNumber: 4,
      createdAt: new Date().toISOString(),
    });

    const matchingLogs = consoleSpy.mock.calls.filter(
      args => typeof args[0] === 'string' && args[0].includes('bead_completed')
    );
    expect(matchingLogs.length).toBeGreaterThan(0);
  });

  it('SIGINT handler calls es.close()', async () => {
    logsCommand({ client: null as never } as never, [], BASE_FLAGS);
    await Promise.resolve();

    expect(processSigintHandlers.length).toBeGreaterThan(0);

    // Trigger SIGINT
    expect(() => processSigintHandlers[0]!()).toThrow('process.exit called');
    expect(mockClose).toHaveBeenCalledOnce();
  });

  it('--json flag outputs raw JSON per event', async () => {
    const jsonFlags = { ...BASE_FLAGS, json: true };
    logsCommand({ client: null as never } as never, [], jsonFlags);
    await Promise.resolve();

    consoleSpy.mockClear();

    const eventData = {
      id: 'evt-5',
      projectId: 'proj-123',
      seedId: null,
      beadId: 'bead-xyz',
      type: 'bead_completed',
      payload: { result: 'ok' },
      sequenceNumber: 5,
      createdAt: new Date().toISOString(),
    };

    dispatchPipelineEvent(eventData);

    // formatJson should have been called with the event data
    const { formatJson } = await import('../output.js');
    expect(formatJson).toHaveBeenCalledWith(expect.objectContaining({ type: 'bead_completed' }));
  });

  it('exits with error if no projectId provided', async () => {
    const flagsNoProject = { json: false, serverUrl: 'http://localhost:3000', apiKey: 'key' };

    expect(() => logsCommand({ client: null as never } as never, [], flagsNoProject as never)).toThrow(
      'process.exit called'
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Usage')
    );
  });
});
