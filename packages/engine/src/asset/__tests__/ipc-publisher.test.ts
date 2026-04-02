import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to track instances created and their methods
// vi.mock hoisting means we declare mocks at the top level
const mockPublish = vi.fn();
const mockOn = vi.fn();
const mockQuit = vi.fn();

let mockRedisConstructorCallCount = 0;

vi.mock('ioredis', () => {
  class MockRedis {
    publish = mockPublish;
    on = mockOn;
    quit = mockQuit;
    constructor() {
      mockRedisConstructorCallCount++;
    }
  }
  // Export both default and named "Redis" since production code uses: import { Redis } from 'ioredis'
  return { default: MockRedis, Redis: MockRedis };
});

describe('ipc-publisher', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRedisConstructorCallCount = 0;
  });

  it('Test 1: publishJobStatusChanged calls redis.publish with channel "cauldron:job-status:{jobId}" and jobId as message when publisher is configured', async () => {
    const { configurePublisher, publishJobStatusChanged } = await import('../ipc-publisher.js');
    const mockLogger = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() };
    configurePublisher('redis://localhost:6379', mockLogger as any);

    mockPublish.mockResolvedValue(1);
    await publishJobStatusChanged('job-abc-123');

    expect(mockPublish).toHaveBeenCalledWith('cauldron:job-status:job-abc-123', 'job-abc-123');
  });

  it('Test 2: publishJobStatusChanged returns without error when publisher is null (configurePublisher never called)', async () => {
    const { publishJobStatusChanged } = await import('../ipc-publisher.js');

    // Should not throw even though publisher was never configured
    await expect(publishJobStatusChanged('job-xyz')).resolves.toBeUndefined();
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('Test 3: publishJobStatusChanged swallows errors when redis.publish rejects -- does not throw', async () => {
    const { configurePublisher, publishJobStatusChanged } = await import('../ipc-publisher.js');
    const mockLogger = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() };
    configurePublisher('redis://localhost:6379', mockLogger as any);

    mockPublish.mockRejectedValue(new Error('Redis ECONNREFUSED'));

    // Must not throw despite Redis failure
    await expect(publishJobStatusChanged('job-fail')).resolves.toBeUndefined();
  });

  it('Test 4: configurePublisher is idempotent -- calling twice does not create a second Redis instance', async () => {
    const { configurePublisher } = await import('../ipc-publisher.js');
    const mockLogger = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() };

    configurePublisher('redis://localhost:6379', mockLogger as any);
    configurePublisher('redis://localhost:6379', mockLogger as any);

    // Only one Redis instance should have been created
    expect(mockRedisConstructorCallCount).toBe(1);
  });

  it('Test 5: configurePublisher registers an error listener on the Redis client', async () => {
    const { configurePublisher } = await import('../ipc-publisher.js');
    const mockLogger = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() };

    configurePublisher('redis://localhost:6379', mockLogger as any);

    expect(mockOn).toHaveBeenCalledWith('error', expect.any(Function));
  });
});
