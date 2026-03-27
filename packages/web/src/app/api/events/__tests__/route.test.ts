import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @get-cauldron/shared to avoid DATABASE_URL errors at import time
// (Phase 03 decision: vi.mock('@get-cauldron/shared') required in engine unit tests
// that import modules with @get-cauldron/shared dependencies)
vi.mock('@get-cauldron/shared', () => ({
  db: {},
  events: {},
}));

// Also mock drizzle-orm operators used in the route
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  gt: vi.fn(),
  and: vi.fn(),
  asc: vi.fn(),
}));

import { GET } from '../[projectId]/route.js';

describe('GET /api/events/[projectId]', () => {
  const originalEnv = process.env['CAULDRON_API_KEY'];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['CAULDRON_API_KEY'];
    } else {
      process.env['CAULDRON_API_KEY'] = originalEnv;
    }
  });

  it('returns 401 when CAULDRON_API_KEY is set and no Authorization header is present', async () => {
    process.env['CAULDRON_API_KEY'] = 'test-key';

    const request = new Request('http://localhost/api/events/proj-1');
    const response = await GET(request, {
      params: Promise.resolve({ projectId: 'proj-1' }),
    });

    expect(response.status).toBe(401);
  });

  it('returns 401 when CAULDRON_API_KEY is set and Authorization header has wrong key', async () => {
    process.env['CAULDRON_API_KEY'] = 'test-key';

    const request = new Request('http://localhost/api/events/proj-1', {
      headers: { Authorization: 'Bearer wrong-key' },
    });
    const response = await GET(request, {
      params: Promise.resolve({ projectId: 'proj-1' }),
    });

    expect(response.status).toBe(401);
  });

  it('does NOT return 401 when CAULDRON_API_KEY is unset (dev mode)', async () => {
    delete process.env['CAULDRON_API_KEY'];

    const request = new Request('http://localhost/api/events/proj-1');
    const response = await GET(request, {
      params: Promise.resolve({ projectId: 'proj-1' }),
    });

    expect(response.status).not.toBe(401);
  });

  it('does NOT return 401 when CAULDRON_API_KEY is set and correct Bearer token is provided', async () => {
    process.env['CAULDRON_API_KEY'] = 'test-key';

    const request = new Request('http://localhost/api/events/proj-1', {
      headers: { Authorization: 'Bearer test-key' },
    });
    const response = await GET(request, {
      params: Promise.resolve({ projectId: 'proj-1' }),
    });

    expect(response.status).not.toBe(401);
  });
});
