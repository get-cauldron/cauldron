import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @trpc/client so we don't need a real server
vi.mock('@trpc/client', () => ({
  createTRPCClient: vi.fn((opts: { links: unknown[] }) => {
    // Capture links for inspection
    return { _opts: opts, health: { query: vi.fn() } };
  }),
  httpBatchLink: vi.fn((opts: { url: string; headers: () => Record<string, string> }) => ({
    _type: 'httpBatchLink',
    url: opts.url,
    headers: opts.headers,
  })),
}));

import { createCLIClient } from './trpc-client.js';
import { createTRPCClient, httpBatchLink } from '@trpc/client';

describe('createCLIClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a tRPC client with health.query method', () => {
    const client = createCLIClient('http://localhost:3000', 'test-key');
    expect(client).toBeDefined();
    expect(client.health).toBeDefined();
    expect(typeof client.health.query).toBe('function');
  });

  it('configures httpBatchLink with the correct URL', () => {
    createCLIClient('http://localhost:3000', 'my-api-key');
    expect(httpBatchLink).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'http://localhost:3000/api/trpc' })
    );
  });

  it('injects Authorization Bearer header via httpBatchLink headers callback', () => {
    createCLIClient('http://localhost:3000', 'my-secret-key');
    const linkOpts = vi.mocked(httpBatchLink).mock.calls[0]![0] as unknown as {
      headers: () => Record<string, string>;
    };
    const headers = linkOpts.headers();
    expect(headers['Authorization']).toBe('Bearer my-secret-key');
  });
});

// Test isServerRunning separately
describe('isServerRunning', () => {
  it('returns false when fetch throws (no server)', async () => {
    const { isServerRunning } = await import('./server-check.js');
    // Override fetch to throw a network error
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    try {
      const result = await isServerRunning('http://localhost:19999');
      expect(result).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('returns true when fetch returns ok', async () => {
    const { isServerRunning } = await import('./server-check.js');
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
    try {
      const result = await isServerRunning('http://localhost:3000');
      expect(result).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
