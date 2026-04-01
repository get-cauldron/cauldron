import { parseArgs } from 'node:util';
import chalk from 'chalk';
import { sql, eq } from 'drizzle-orm';
import { projects, assetJobs } from '@get-cauldron/shared';
import { bootstrap } from '../bootstrap.js';

interface VerifyFlags {
  json: boolean;
  projectId?: string;
}

/**
 * Verify command — validates operator setup for Cauldron subsystems.
 *
 * Subcommands:
 *   assets   Run sequential health checks for the asset pipeline
 *
 * Usage:
 *   cauldron verify assets --project <id> [--real-comfyui]
 */
export async function verifyCommand(args: string[], flags: VerifyFlags): Promise<void> {
  const subcommand = args[0];

  if (subcommand === 'assets') {
    await verifyAssets(args.slice(1), flags);
  } else {
    console.error(chalk.red('Usage: cauldron verify [assets]'));
    process.exit(1);
  }
}

function pass(message: string): void {
  console.log(chalk.green('[PASS]'), message);
}

function fail(message: string): void {
  console.error(chalk.red('[FAIL]'), message);
}

function warn(message: string): void {
  console.log(chalk.yellow('[WARN]'), message);
}

async function verifyAssets(args: string[], flags: VerifyFlags): Promise<void> {
  const { values: localValues } = parseArgs({
    args,
    allowPositionals: false,
    options: {
      'real-comfyui': { type: 'boolean', default: false },
    },
    strict: false,
  });

  const realComfyui = (localValues['real-comfyui'] as boolean | undefined) ?? false;

  const projectId = flags.projectId;
  if (!projectId) {
    console.error(chalk.red('Error: --project <id> is required for verify assets'));
    process.exit(1);
  }

  const { db } = await bootstrap(process.cwd());

  let anyFailed = false;

  // Check 1: Project exists and settings are readable
  let projectRow: typeof projects.$inferSelect | undefined;
  try {
    const [row] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!row) {
      fail(`Project not found: ${projectId}`);
      anyFailed = true;
    } else {
      projectRow = row;
      pass(`Project found: ${row.name} (${row.id.slice(0, 8)}...)`);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail(`Failed to query project: ${message}`);
    anyFailed = true;
  }

  // Check 2: Asset mode check
  if (projectRow) {
    const assetSettings = (projectRow.settings as { asset?: { mode?: string } } | null)?.asset;
    const mode = assetSettings?.mode ?? 'active';

    if (mode === 'disabled') {
      fail(`Asset mode is 'disabled'. Enable with: cauldron config set asset.mode active --project ${projectId}`);
      anyFailed = true;
    } else if (mode === 'paused') {
      warn(`Asset mode is 'paused'. Jobs will queue but not dispatch. Resume with: cauldron config set asset.mode active --project ${projectId}`);
      pass(`Asset mode: ${mode} (paused — jobs will queue, not dispatch)`);
    } else {
      pass(`Asset mode: ${mode}`);
    }
  } else {
    warn('Skipping asset mode check (project not found)');
  }

  // Check 3: ComfyUI connectivity
  const comfyuiUrl = process.env['COMFYUI_URL'] ?? 'http://localhost:8188';
  const statsUrl = `${comfyuiUrl}/system_stats`;
  try {
    const res = await fetch(statsUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });

    if (res.ok) {
      let detail = '';
      try {
        const body = await res.json() as { system?: { cuda_device_name?: string } };
        const gpuName = body?.system?.cuda_device_name;
        if (gpuName) {
          detail = ` (GPU: ${gpuName})`;
        }
      } catch {
        // JSON parse failure is non-fatal
      }
      pass(`ComfyUI reachable at ${comfyuiUrl}${detail}`);
    } else {
      fail(`ComfyUI returned HTTP ${res.status} at ${statsUrl}. Ensure ComfyUI is running: docker compose up -d comfyui`);
      anyFailed = true;
    }
  } catch {
    fail(`ComfyUI not reachable at ${comfyuiUrl}. Ensure ComfyUI is running: docker compose up -d comfyui`);
    anyFailed = true;
  }

  // Check 4: Database asset_jobs table accessible
  if (projectRow) {
    try {
      const [countResult] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(assetJobs)
        .where(eq(assetJobs.projectId, projectId));

      const count = countResult?.count ?? 0;
      pass(`Database asset_jobs accessible: ${count} job(s) for project`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      fail(`Failed to query asset_jobs table: ${message}`);
      anyFailed = true;
    }
  } else {
    warn('Skipping asset_jobs check (project not found)');
  }

  // Check 5: Asset settings summary
  if (projectRow) {
    const assetSettings = (projectRow.settings as { asset?: {
      mode?: string;
      runtimeUrl?: string;
      artifactsRoot?: string;
      maxConcurrentJobs?: number;
    } } | null)?.asset ?? {};

    console.log('');
    console.log(chalk.cyan('Asset settings summary:'));
    console.log(`  mode:              ${assetSettings.mode ?? 'active (default)'}`);
    console.log(`  runtimeUrl:        ${assetSettings.runtimeUrl ?? 'http://localhost:8188 (default)'}`);
    console.log(`  artifactsRoot:     ${assetSettings.artifactsRoot ?? '.cauldron/artifacts (default)'}`);
    console.log(`  maxConcurrentJobs: ${assetSettings.maxConcurrentJobs ?? 'unlimited (default)'}`);
    pass('Asset settings readable');
  }

  // Check 6 (optional): Real ComfyUI test job
  if (realComfyui) {
    console.log('');
    console.log(chalk.cyan('Running real ComfyUI test job (--real-comfyui)...'));
    console.log(chalk.gray('Submitting 64x64 test generation — requires GPU, may take up to 60 seconds'));

    try {
      const workflowRes = await fetch(`${comfyuiUrl}/prompt`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: {
            '3': {
              class_type: 'KSampler',
              inputs: {
                seed: 42,
                steps: 1,
                cfg: 1,
                sampler_name: 'euler',
                scheduler: 'normal',
                denoise: 1,
                model: ['4', 0],
                positive: ['6', 0],
                negative: ['7', 0],
                latent_image: ['5', 0],
              },
            },
            '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'v1-5-pruned-emaonly.ckpt' } },
            '5': { class_type: 'EmptyLatentImage', inputs: { batch_size: 1, height: 64, width: 64 } },
            '6': { class_type: 'CLIPTextEncode', inputs: { text: 'test', clip: ['4', 1] } },
            '7': { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['4', 1] } },
          },
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (workflowRes.ok) {
        const body = await workflowRes.json() as { prompt_id?: string };
        if (body.prompt_id) {
          pass(`Real ComfyUI test job submitted (prompt_id: ${body.prompt_id})`);
          console.log(chalk.gray('  Note: job is queued but not awaited — check ComfyUI UI for completion'));
        } else {
          fail('ComfyUI accepted job but returned no prompt_id');
          anyFailed = true;
        }
      } else {
        fail(`ComfyUI job submission returned HTTP ${workflowRes.status}`);
        anyFailed = true;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      fail(`Real ComfyUI test job failed: ${message}`);
      anyFailed = true;
    }
  }

  console.log('');
  if (anyFailed) {
    console.error(chalk.red('Asset verification FAILED — address the issues above before running the pipeline'));
    process.exit(1);
  } else {
    console.log(chalk.green('Asset verification PASSED — pipeline is ready'));
  }
}
