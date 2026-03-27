import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';

// ---- Hoisted mocks (vi.hoisted is required for variables used inside vi.mock factories) ----
const {
  mockAddEventListener,
  mockClose,
  mockEventSourceInstance,
  MockEventSource,
  capturedState,
} = vi.hoisted(() => {
  const mockAddEventListener = vi.fn();
  const mockClose = vi.fn();
  const mockEventSourceInstance = {
    addEventListener: mockAddEventListener,
    close: mockClose,
    onerror: null as ((ev: unknown) => unknown) | null,
    readyState: 1,
    CLOSED: 2,
  };

  const capturedState = {
    url: undefined as string | undefined,
    fetchFn: undefined as ((url: string | URL, init: Record<string, unknown>) => Promise<unknown>) | undefined,
  };

  const MockEventSource = vi.fn(
    function (this: unknown, url: string | URL, init?: { fetch?: typeof capturedState.fetchFn }) {
      capturedState.url = typeof url === 'string' ? url : url.toString();
      capturedState.fetchFn = init?.fetch;
      // Assign CLOSED constant on mock instance
      Object.assign(mockEventSourceInstance, { CLOSED: 2, readyState: 1 });
      return mockEventSourceInstance;
    }
  );
  // Add static CLOSED constant
  (MockEventSource as unknown as Record<string, unknown>).CLOSED = 2;
  (MockEventSource as unknown as Record<string, unknown>).OPEN = 1;
  (MockEventSource as unknown as Record<string, unknown>).CONNECTING = 0;

  return { mockAddEventListener, mockClose, mockEventSourceInstance, MockEventSource, capturedState };
});

vi.mock('eventsource', () => ({
  EventSource: MockEventSource,
}));

// ---- Mock output.ts ----
vi.mock('../output.js', () => ({
  getBeadColor: vi.fn(() => '#00d4aa'),
  formatJson: vi.fn((data: unknown) => JSON.stringify(data, null, 2)),
}));

// ---- Mock chalk to strip color codes in assertions ----
vi.mock('chalk', () => {
  const identity = (s: unknown) => String(s);
  const chainable: Record<string, unknown> = {};
  const hexReturn = identity;
  chainable.hex = () => identity;
  chainable.gray = identity;
  chainable.red = identity;
  chainable.white = identity;
  const chalk = {
    hex: () => identity,
    gray: identity,
    red: identity,
    white: identity,
  };
  return { default: chalk };
});

// Import after mocks
import { logsCommand } from './logs.js';

// ---- Helper: dispatch a synthetic pipeline event ----
function dispatchPipelineEvent(data: Record<string, unknown>) {
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
    capturedState.url = undefined;
    capturedState.fetchFn = undefined;
    mockEventSourceInstance.readyState = 1;

    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: string | number | null) => {
      throw new Error('process.exit called');
    });
    processSigintHandlers = [];
    vi.spyOn(process, 'on').mockImplementation((event: string | symbol, handler: (...args: unknown[]) => void) => {
      if (event === 'SIGINT' || event === 'SIGTERM') {
        processSigintHandlers.push(handler as () => void);
      }
      return process;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('connects EventSource to the correct URL with projectId', async () => {
    logsCommand(null, [], BASE_FLAGS);
    await Promise.resolve();

    expect(MockEventSource).toHaveBeenCalledOnce();
    expect(capturedState.url).toBe('http://localhost:3000/api/events/proj-123');
  });

  it('injects Authorization header via custom fetch wrapper', async () => {
    logsCommand(null, [], BASE_FLAGS);
    await Promise.resolve();

    expect(capturedState.fetchFn).toBeDefined();

    // Call the custom fetch wrapper and verify Authorization is injected
    let injectedHeaders: Record<string, string> | undefined;

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

    const globalFetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(innerFetch as unknown as typeof fetch);

    await capturedState.fetchFn!('http://test', {
      headers: { Accept: 'text/event-stream' },
    } as Record<string, unknown>).catch(() => {});

    globalFetchSpy.mockRestore();

    expect(injectedHeaders).toBeDefined();
    expect(injectedHeaders!['Authorization']).toBe('Bearer test-api-key');
  });

  it('renders pipeline event with beadId as [bead-prefix] event_type payload', async () => {
    logsCommand(null, [], BASE_FLAGS);
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
    logsCommand(null, [], BASE_FLAGS);
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
    logsCommand(null, ['--bead', 'bead-target'], BASE_FLAGS);
    await Promise.resolve();

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

    const skippedLogs = consoleSpy.mock.calls.filter(
      (args: unknown[]) => typeof args[0] === 'string' && (args[0] as string).includes('bead_started')
    );
    expect(skippedLogs).toHaveLength(0);

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
      (args: unknown[]) => typeof args[0] === 'string' && (args[0] as string).includes('bead_completed')
    );
    expect(matchingLogs.length).toBeGreaterThan(0);
  });

  it('SIGINT handler calls es.close()', async () => {
    logsCommand(null, [], BASE_FLAGS);
    await Promise.resolve();

    expect(processSigintHandlers.length).toBeGreaterThan(0);

    // Trigger SIGINT — should call es.close() then process.exit
    expect(() => processSigintHandlers[0]!()).toThrow('process.exit called');
    expect(mockClose).toHaveBeenCalledOnce();
  });

  it('--json flag outputs raw JSON per event via formatJson', async () => {
    const jsonFlags = { ...BASE_FLAGS, json: true };
    logsCommand(null, [], jsonFlags);
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

    const { formatJson } = await import('../output.js');
    expect(formatJson).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'bead_completed' })
    );
  });

  it('exits with error if no projectId provided', () => {
    const flagsNoProject = { json: false, serverUrl: 'http://localhost:3000', apiKey: 'key' };

    expect(() => logsCommand(null, [], flagsNoProject as LogsFlags)).toThrow('process.exit called');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Usage')
    );
  });
});

// Export type used in test
import type { LogsFlags } from './logs.js';
