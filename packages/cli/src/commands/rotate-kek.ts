import { parseArgs } from 'node:util';
import chalk from 'chalk';
import { rotateKek, retireKek, initKekVersion, kekFingerprint } from '@get-cauldron/engine';
import { bootstrap } from '../bootstrap.js';

interface RotateKekFlags {
  json: boolean;
}

/**
 * rotate-kek command — manages KEK (Key Encryption Key) rotation for the holdout vault.
 *
 * Modes:
 *   --init                       Register current HOLDOUT_ENCRYPTION_KEY as version 1
 *   (default)                    Rotate to a new KEK (re-encrypt all vault DEKs)
 *   --retire-old --old-version N Retire the old KEK version after confirming no vault rows reference it
 *
 * Keys are always read from environment variables, never from CLI args.
 *
 * Usage:
 *   cauldron rotate-kek --init [--label <label>]
 *   cauldron rotate-kek [--new-key-env HOLDOUT_ENCRYPTION_KEY_NEW] [--label <label>]
 *   cauldron rotate-kek --retire-old --old-version <N>
 */
export async function rotateKekCommand(args: string[], flags: RotateKekFlags): Promise<void> {
  const { values } = parseArgs({
    args,
    allowPositionals: false,
    options: {
      'init': { type: 'boolean', default: false },
      'retire-old': { type: 'boolean', default: false },
      'old-version': { type: 'string' },
      'new-key-env': { type: 'string', default: 'HOLDOUT_ENCRYPTION_KEY_NEW' },
      'label': { type: 'string' },
    },
    strict: false,
  });

  const isInit = (values['init'] as boolean | undefined) ?? false;
  const isRetireOld = (values['retire-old'] as boolean | undefined) ?? false;
  const oldVersionStr = values['old-version'] as string | undefined;
  const newKeyEnv = (values['new-key-env'] as string | undefined) ?? 'HOLDOUT_ENCRYPTION_KEY_NEW';
  const label = values['label'] as string | undefined;

  if (isInit) {
    await runInit({ label, flags });
  } else if (isRetireOld) {
    await runRetireOld({ oldVersionStr, flags });
  } else {
    await runRotate({ newKeyEnv, label, flags });
  }
}

// ─── Mode 1: --init ───────────────────────────────────────────────────────────

async function runInit(params: { label: string | undefined; flags: RotateKekFlags }): Promise<void> {
  const { label, flags } = params;

  const keyB64 = process.env['HOLDOUT_ENCRYPTION_KEY'];
  if (!keyB64) {
    console.error(chalk.red('Error: HOLDOUT_ENCRYPTION_KEY must be set'));
    process.exit(1);
  }

  let kek: Buffer;
  try {
    kek = Buffer.from(keyB64, 'base64');
  } catch {
    console.error(chalk.red('Error: HOLDOUT_ENCRYPTION_KEY is not valid base64'));
    process.exit(1);
  }

  if (kek.length !== 32) {
    console.error(chalk.red(`Error: HOLDOUT_ENCRYPTION_KEY must decode to exactly 32 bytes, got ${kek.length}`));
    process.exit(1);
  }

  const isoDate = new Date().toISOString().split('T')[0];
  const resolvedLabel = label ?? `v1-${isoDate}`;

  try {
    const { db } = await bootstrap(process.cwd());
    const version = await initKekVersion(db, { kek, label: resolvedLabel });
    const fingerprint = kekFingerprint(kek);

    if (flags.json) {
      console.log(JSON.stringify({ version, fingerprint, label: resolvedLabel }));
    } else {
      console.log(chalk.green(`KEK version ${version} registered (fingerprint: ${fingerprint.slice(0, 16)}...)`));
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`Error: ${message}`));
    process.exit(1);
  }
}

// ─── Mode 2: Default rotation ─────────────────────────────────────────────────

async function runRotate(params: {
  newKeyEnv: string;
  label: string | undefined;
  flags: RotateKekFlags;
}): Promise<void> {
  const { newKeyEnv, label, flags } = params;

  const oldKeyB64 = process.env['HOLDOUT_ENCRYPTION_KEY'];
  if (!oldKeyB64) {
    console.error(chalk.red('Error: HOLDOUT_ENCRYPTION_KEY must be set (current key)'));
    process.exit(1);
  }

  const newKeyB64 = process.env[newKeyEnv];
  if (!newKeyB64) {
    console.error(chalk.red(`Error: ${newKeyEnv} must be set (new key). Use --new-key-env to specify a different env var name.`));
    process.exit(1);
  }

  let oldKek: Buffer;
  let newKek: Buffer;
  try {
    oldKek = Buffer.from(oldKeyB64, 'base64');
  } catch {
    console.error(chalk.red('Error: HOLDOUT_ENCRYPTION_KEY is not valid base64'));
    process.exit(1);
  }
  try {
    newKek = Buffer.from(newKeyB64, 'base64');
  } catch {
    console.error(chalk.red(`Error: ${newKeyEnv} is not valid base64`));
    process.exit(1);
  }

  if (oldKek.length !== 32) {
    console.error(chalk.red(`Error: HOLDOUT_ENCRYPTION_KEY must decode to exactly 32 bytes, got ${oldKek.length}`));
    process.exit(1);
  }
  if (newKek.length !== 32) {
    console.error(chalk.red(`Error: ${newKeyEnv} must decode to exactly 32 bytes, got ${newKek.length}`));
    process.exit(1);
  }

  try {
    const { db } = await bootstrap(process.cwd());

    const isoDate = new Date().toISOString().split('T')[0];
    // Label will use the version number once we know it — placeholder resolved after rotation
    const newKekLabel = label ?? `kek-${isoDate}`;

    console.log(chalk.cyan('Rotating KEK...'));
    const startMs = Date.now();

    const result = await rotateKek(db, { oldKek, newKek, newKekLabel });

    const durationMs = Date.now() - startMs;

    console.log(chalk.green(`Rotating KEK: v${result.oldKekVersion} -> v${result.newKekVersion}`));
    console.log(chalk.green(`Re-encrypted ${result.rowsRotated} vault rows in ${durationMs}ms`));
    console.log('');
    console.log(chalk.yellow('Next steps:'));
    console.log(chalk.yellow(`  1. Set HOLDOUT_ENCRYPTION_KEY to the new key value`));
    console.log(chalk.yellow(`  2. Optionally set HOLDOUT_ENCRYPTION_KEY_PREV to the old key for dual-key window safety.`));
    console.log(chalk.yellow(`  3. After confirming all in-flight evaluations are complete, run:`));
    console.log(chalk.yellow(`     cauldron rotate-kek --retire-old --old-version ${result.oldKekVersion}`));

    if (flags.json) {
      console.log(JSON.stringify(result));
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`Error: ${message}`));
    process.exit(1);
  }
}

// ─── Mode 3: --retire-old ─────────────────────────────────────────────────────

async function runRetireOld(params: {
  oldVersionStr: string | undefined;
  flags: RotateKekFlags;
}): Promise<void> {
  const { oldVersionStr, flags } = params;

  if (!oldVersionStr) {
    console.error(chalk.red('Error: --old-version <N> is required with --retire-old'));
    process.exit(1);
  }

  const kekVersion = parseInt(oldVersionStr as string, 10);
  if (isNaN(kekVersion) || kekVersion < 1) {
    console.error(chalk.red(`Error: --old-version must be a positive integer, got: ${oldVersionStr}`));
    process.exit(1);
  }

  try {
    const { db } = await bootstrap(process.cwd());
    await retireKek(db, { kekVersion });

    if (flags.json) {
      console.log(JSON.stringify({ retired: true, version: kekVersion }));
    } else {
      console.log(chalk.green(`KEK version ${kekVersion} retired. You may now unset HOLDOUT_ENCRYPTION_KEY_PREV.`));
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`Error: ${message}`));
    process.exit(1);
  }
}
