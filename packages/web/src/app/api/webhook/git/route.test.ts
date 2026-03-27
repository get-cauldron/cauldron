import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sign } from '@octokit/webhooks-methods';

// Track mock project data across tests
const mockProjectRows: Array<{ id: string; name: string; settings: Record<string, unknown> | null }> = [];
const mockAppendEvent = vi.fn();

const mockInngestSend = vi.fn().mockResolvedValue({ ids: [] });

vi.mock('@cauldron/shared', () => {
  const fromFn = vi.fn().mockImplementation(() => mockProjectRows);
  const selectFn = vi.fn().mockReturnValue({ from: fromFn });
  return {
    db: { select: selectFn },
    projects: Symbol('projects'),
    events: Symbol('events'),
    appendEvent: mockAppendEvent,
  };
});

vi.mock('../../../../inngest/client.js', () => ({
  inngest: { send: mockInngestSend },
}));

// Dynamic import after mocks are set up
const { POST } = await import('./route.js');

const WEBHOOK_SECRET = 'test-webhook-secret-1234567890abcdef';

const SAMPLE_PUSH_PAYLOAD = {
  ref: 'refs/heads/main',
  repository: {
    full_name: 'acme/my-app',
    html_url: 'https://github.com/acme/my-app',
    clone_url: 'https://github.com/acme/my-app.git',
  },
  head_commit: {
    id: 'abc123def456',
    message: 'feat: add new feature',
  },
  pusher: { name: 'johndoe' },
};

function makeRequest(body: string, headers: Record<string, string>): Request {
  return new Request('http://localhost/api/webhook/git', {
    method: 'POST',
    body,
    headers,
  });
}

async function makeSignedRequest(
  payload: object,
  secret: string,
  eventType = 'push'
): Promise<Request> {
  const body = JSON.stringify(payload);
  const signature = await sign(secret, body);
  return makeRequest(body, {
    'content-type': 'application/json',
    'x-hub-signature-256': signature,
    'x-github-event': eventType,
  });
}

describe('POST /api/webhook/git', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['GITHUB_WEBHOOK_SECRET'] = WEBHOOK_SECRET;
    mockProjectRows.length = 0;
    // Reset mocks
    mockAppendEvent.mockResolvedValue(undefined);
    mockInngestSend.mockResolvedValue({ ids: [] });
  });

  it('returns 500 when GITHUB_WEBHOOK_SECRET is not configured', async () => {
    delete process.env['GITHUB_WEBHOOK_SECRET'];
    const body = JSON.stringify(SAMPLE_PUSH_PAYLOAD);
    const req = makeRequest(body, {
      'content-type': 'application/json',
      'x-hub-signature-256': 'sha256=invalid',
      'x-github-event': 'push',
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const json = await res.json() as { error: string };
    expect(json.error).toContain('not configured');
  });

  it('returns 401 when x-hub-signature-256 header is missing', async () => {
    const body = JSON.stringify(SAMPLE_PUSH_PAYLOAD);
    const req = makeRequest(body, {
      'content-type': 'application/json',
      'x-github-event': 'push',
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json() as { error: string };
    expect(json.error).toContain('signature');
  });

  it('returns 401 when HMAC signature is invalid', async () => {
    const body = JSON.stringify(SAMPLE_PUSH_PAYLOAD);
    const req = makeRequest(body, {
      'content-type': 'application/json',
      'x-hub-signature-256': 'sha256=000badsignature000',
      'x-github-event': 'push',
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 200 with { ok: true } for non-push event (ping)', async () => {
    const req = await makeSignedRequest(
      { zen: 'Keep it logically awesome.' },
      WEBHOOK_SECRET,
      'ping'
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json() as { ok: boolean; event: string };
    expect(json.ok).toBe(true);
    expect(json.event).toBe('ping');
  });

  it('returns 200 and skips when no project matches push repo', async () => {
    // mockProjectRows is empty — no matching project
    const req = await makeSignedRequest(SAMPLE_PUSH_PAYLOAD, WEBHOOK_SECRET, 'push');
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json() as { ok: boolean; skipped: boolean };
    expect(json.ok).toBe(true);
    expect(json.skipped).toBe(true);
  });

  it('extracts repo full_name and head_commit.id from valid push event', async () => {
    mockProjectRows.push({
      id: 'project-uuid-1234',
      name: 'My App',
      settings: { repoUrl: 'https://github.com/acme/my-app' },
    });

    const req = await makeSignedRequest(SAMPLE_PUSH_PAYLOAD, WEBHOOK_SECRET, 'push');
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json() as {
      ok: boolean;
      projectId: string;
      repo: string;
      commitSha: string;
    };
    expect(json.ok).toBe(true);
    expect(json.repo).toBe('acme/my-app');
    expect(json.commitSha).toBe('abc123def456');
    expect(json.projectId).toBe('project-uuid-1234');
  });

  it('calls appendEvent with pipeline_trigger type for valid push', async () => {
    mockProjectRows.push({
      id: 'project-uuid-5678',
      name: 'My App 2',
      settings: { repoUrl: 'https://github.com/acme/my-app.git' },
    });

    const req = await makeSignedRequest(SAMPLE_PUSH_PAYLOAD, WEBHOOK_SECRET, 'push');
    await POST(req);
    expect(mockAppendEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        projectId: 'project-uuid-5678',
        type: 'pipeline_trigger',
        payload: expect.objectContaining({
          source: 'github_push',
          repo: 'acme/my-app',
          commitSha: 'abc123def456',
        }),
      })
    );
    // Verify Inngest event dispatched for pipeline queue logic
    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'cauldron/pipeline.trigger',
        data: expect.objectContaining({
          projectId: 'project-uuid-5678',
          source: 'github_push',
          commitSha: 'abc123def456',
        }),
      })
    );
  });
});
