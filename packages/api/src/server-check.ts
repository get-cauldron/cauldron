import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

export async function isServerRunning(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/api/trpc/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function startDevServer(projectRoot: string): Promise<void> {
  const webDir = resolve(projectRoot, 'packages', 'web');
  const proc = spawn('pnpm', ['dev'], { cwd: webDir, detached: true, stdio: 'ignore' });
  // CRITICAL: unref() prevents CLI process from hanging after the command completes
  proc.unref();
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (await isServerRunning('http://localhost:3000')) return;
  }
  throw new Error('Dev server did not start within 30s');
}
