import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @hono/node-server serve function
const mockServer = { close: vi.fn() };
const mockServe = vi.fn().mockReturnValue(mockServer);
vi.mock('@hono/node-server', () => ({ serve: mockServe }));

// Mock bootstrap to resolve immediately without DB/network deps
const mockBootstrap = vi.fn().mockResolvedValue({});
vi.mock('../bootstrap.js', () => ({ bootstrap: mockBootstrap }));

// Mock createInngestApp to return a fake Hono app with a .fetch property
const mockFetch = vi.fn();
const mockApp = { fetch: mockFetch };
const mockCreateInngestApp = vi.fn().mockReturnValue(mockApp);
vi.mock('../inngest-serve.js', () => ({ createInngestApp: mockCreateInngestApp }));

describe('engine-server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockServe.mockReturnValue(mockServer);
    mockBootstrap.mockResolvedValue({});
    mockCreateInngestApp.mockReturnValue(mockApp);
  });

  it('calls bootstrap, then createInngestApp, then serve with port 3001', async () => {
    const { startEngineServer } = await import('../engine-server.js');

    const result = await startEngineServer('/test/project');

    // bootstrap called first
    expect(mockBootstrap).toHaveBeenCalledWith('/test/project');

    // createInngestApp called after bootstrap
    expect(mockCreateInngestApp).toHaveBeenCalled();

    // serve called with the app's fetch and default port
    expect(mockServe).toHaveBeenCalledWith(
      expect.objectContaining({
        fetch: mockFetch,
        port: 3001,
      })
    );

    expect(result).toBe(mockServer);
  });

  it('passes custom port when specified', async () => {
    const { startEngineServer } = await import('../engine-server.js');

    await startEngineServer('/test/project', 4000);

    expect(mockServe).toHaveBeenCalledWith(
      expect.objectContaining({
        port: 4000,
      })
    );
  });
});
