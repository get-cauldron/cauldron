import { verify } from '@octokit/webhooks-methods';
import { db } from '@get-cauldron/shared';
import { projects } from '@get-cauldron/shared';
import { appendEvent } from '@get-cauldron/shared';
import { inngest } from '../../../../inngest/client.js';

export const runtime = 'nodejs';

interface GitHubPushPayload {
  ref: string;
  repository: {
    full_name: string;
    html_url: string;
    clone_url: string;
  };
  head_commit: {
    id: string;
    message: string;
  } | null;
  pusher: { name: string };
}

export async function POST(req: Request) {
  const secret = process.env['GITHUB_WEBHOOK_SECRET'];
  if (!secret) {
    return Response.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  // MUST use req.text() — signature covers raw body bytes
  const body = await req.text();
  const sig = req.headers.get('x-hub-signature-256') ?? '';

  if (!sig) {
    return Response.json({ error: 'Missing x-hub-signature-256 header' }, { status: 401 });
  }

  const valid = await verify(secret, body, sig);
  if (!valid) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const eventType = req.headers.get('x-github-event');
  if (eventType !== 'push') {
    // Accept ping and other events gracefully
    return Response.json({ ok: true, event: eventType });
  }

  const payload = JSON.parse(body) as GitHubPushPayload;
  const repoFullName = payload.repository.full_name;
  const commitSha = payload.head_commit?.id ?? 'unknown';
  const branch = payload.ref.replace('refs/heads/', '');

  // Find project matching this repo
  const allProjects = await db.select().from(projects);
  const matchingProject = allProjects.find((p) => {
    const settings = p.settings as Record<string, unknown> | null;
    const repoUrl = settings?.repoUrl as string | undefined;
    if (!repoUrl) return false;
    return repoUrl.includes(repoFullName);
  });

  if (!matchingProject) {
    return Response.json({
      ok: true,
      skipped: true,
      reason: `No project configured for repo ${repoFullName}`,
    });
  }

  // Append pipeline_trigger event for audit trail
  await appendEvent(db, {
    projectId: matchingProject.id,
    beadId: null,
    type: 'pipeline_trigger',
    payload: {
      source: 'github_push',
      repo: repoFullName,
      branch,
      commitSha,
      pusher: payload.pusher.name,
    },
  });

  // Dispatch to Inngest — the consumer handles active-pipeline detection and queuing per D-11
  await inngest.send({
    name: 'cauldron/pipeline.trigger',
    data: {
      projectId: matchingProject.id,
      source: 'github_push',
      repo: repoFullName,
      branch,
      commitSha,
    },
  });

  return Response.json({
    ok: true,
    projectId: matchingProject.id,
    repo: repoFullName,
    branch,
    commitSha,
  });
}
