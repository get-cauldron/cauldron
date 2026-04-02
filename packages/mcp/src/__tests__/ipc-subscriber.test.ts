import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock notifyJobStatusChanged from job-status resource
vi.mock('../resources/job-status.js', () => ({
  registerJobStatusResource: vi.fn(),
  notifyJobStatusChanged: vi.fn(),
}));

// Track call order for ordering verification
type MockCall = { type: 'on' | 'psubscribe'; args: unknown[] };
let callOrder: MockCall[] = [];
let mockPmessageHandler: ((pattern: string, channel: string, message: string) => void) | null = null;
let mockErrorHandler: ((err: Error) => void) | null = null;
let mockPsubscribeCallback: ((err: Error | null) => void) | null = null;

const mockPsubscribe = vi.fn().mockImplementation(
  (_pattern: string, callback: (err: Error | null) => void) => {
    callOrder.push({ type: 'psubscribe', args: [_pattern] });
    mockPsubscribeCallback = callback;
  }
);
const mockOn = vi.fn().mockImplementation((event: string, handler: unknown) => {
  callOrder.push({ type: 'on', args: [event] });
  if (event === 'error') {
    mockErrorHandler = handler as (err: Error) => void;
  } else if (event === 'pmessage') {
    mockPmessageHandler = handler as (pattern: string, channel: string, message: string) => void;
  }
  return { psubscribe: mockPsubscribe, on: mockOn };
});
const mockQuit = vi.fn();

vi.mock('ioredis', () => {
  class MockRedis {
    on = mockOn;
    psubscribe = mockPsubscribe;
    quit = mockQuit;
  }
  return { default: MockRedis, Redis: MockRedis };
});

describe('ipc-subscriber', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    callOrder = [];
    mockPmessageHandler = null;
    mockErrorHandler = null;
    mockPsubscribeCallback = null;
  });

  it('Test 1: createJobStatusSubscriber calls psubscribe with pattern "cauldron:job-status:*"', async () => {
    const { createJobStatusSubscriber } = await import('../ipc-subscriber.js');
    const mockServer = {} as any;
    const mockLogger = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() };

    createJobStatusSubscriber(mockServer, 'redis://localhost:6379', mockLogger as any);

    expect(mockPsubscribe).toHaveBeenCalledWith('cauldron:job-status:*', expect.any(Function));
  });

  it('Test 2: pmessage event triggers notifyJobStatusChanged(server, jobId) with the message content', async () => {
    const { createJobStatusSubscriber } = await import('../ipc-subscriber.js');
    const { notifyJobStatusChanged } = await import('../resources/job-status.js');
    const mockServer = { _id: 'test-server' } as any;
    const mockLogger = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() };

    createJobStatusSubscriber(mockServer, 'redis://localhost:6379', mockLogger as any);

    // Simulate a pmessage event
    expect(mockPmessageHandler).not.toBeNull();
    mockPmessageHandler!('cauldron:job-status:*', 'cauldron:job-status:job-123', 'job-123');

    expect(notifyJobStatusChanged).toHaveBeenCalledWith(mockServer, 'job-123');
  });

  it('Test 3: error listener is registered before psubscribe is called (order verification)', async () => {
    const { createJobStatusSubscriber } = await import('../ipc-subscriber.js');
    const mockServer = {} as any;
    const mockLogger = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() };

    createJobStatusSubscriber(mockServer, 'redis://localhost:6379', mockLogger as any);

    // Find the positions of 'on' with 'error' and 'psubscribe' in the call order
    const errorListenerIndex = callOrder.findIndex(
      (c) => c.type === 'on' && c.args[0] === 'error'
    );
    const psubscribeIndex = callOrder.findIndex((c) => c.type === 'psubscribe');

    expect(errorListenerIndex).toBeGreaterThanOrEqual(0);
    expect(psubscribeIndex).toBeGreaterThanOrEqual(0);
    // Error listener must come BEFORE psubscribe
    expect(errorListenerIndex).toBeLessThan(psubscribeIndex);
  });

  it('Test 4: Redis connection error is logged via logger.warn, not thrown', async () => {
    const { createJobStatusSubscriber } = await import('../ipc-subscriber.js');
    const mockServer = {} as any;
    const mockLogger = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() };

    createJobStatusSubscriber(mockServer, 'redis://localhost:6379', mockLogger as any);

    // Simulate a Redis error event
    expect(mockErrorHandler).not.toBeNull();
    const testError = new Error('ECONNREFUSED');

    // Should not throw
    expect(() => mockErrorHandler!(testError)).not.toThrow();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: testError }),
      expect.any(String)
    );
  });

  it('Test 5: psubscribe failure is logged via logger.warn, not thrown', async () => {
    const { createJobStatusSubscriber } = await import('../ipc-subscriber.js');
    const mockServer = {} as any;
    const mockLogger = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() };

    createJobStatusSubscriber(mockServer, 'redis://localhost:6379', mockLogger as any);

    // Simulate psubscribe callback with error
    expect(mockPsubscribeCallback).not.toBeNull();
    const psubError = new Error('NOAUTH Authentication required');

    // Should not throw
    expect(() => mockPsubscribeCallback!(psubError)).not.toThrow();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: psubError }),
      expect.any(String)
    );
  });
});
