import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

/**
 * Key isolation integration test per D-12.
 *
 * Proves that a child process WITHOUT HOLDOUT_ENCRYPTION_KEY in its env
 * cannot call unsealPayload — it exits with code 42 (our sentinel for key-missing error).
 *
 * This validates the security property: implementation agents running without the
 * key cannot decrypt holdout vault contents even if they try to import the crypto module.
 *
 * Uses tsx to run TypeScript source directly, avoiding the need for a pre-built dist.
 */
describe('key isolation', () => {
  it('child process without HOLDOUT_ENCRYPTION_KEY exits with code 42', () => {
    // From: src/holdout/__tests__/ -> go up 3 levels to reach packages/engine/
    const engineRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../..'
    );

    const cryptoModulePath = path.join(engineRoot, 'src/holdout/crypto.js');
    // tsx is in the root node_modules (monorepo), 2 levels up from packages/engine/
    const tsxBin = path.join(engineRoot, '../../node_modules/.bin/tsx');

    // Write a temp script that imports crypto and tries to call unsealPayload
    const script = `
import { unsealPayload } from '${cryptoModulePath}';

const fakeSealed = {
  ciphertext: 'aaaa',
  iv: 'bbbb',
  authTag: 'cccc',
  encryptedDek: 'dddd:eeee:ffff',
};

try {
  unsealPayload(fakeSealed);
  // Should not reach here — key is not set
  process.exit(0);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes('HOLDOUT_ENCRYPTION_KEY')) {
    process.exit(42); // Expected: key missing sentinel exit code
  }
  // Different error (e.g., decryption failure) — key might have been present
  process.exit(1);
}
`;

    const tmpFile = path.join(os.tmpdir(), `key-isolation-${Date.now()}.ts`);
    fs.writeFileSync(tmpFile, script, 'utf8');

    try {
      const result = spawnSync(tsxBin, [tmpFile], {
        encoding: 'utf8',
        cwd: engineRoot,
        env: {
          PATH: process.env['PATH'],
          HOME: process.env['HOME'],
          // Explicitly DO NOT pass HOLDOUT_ENCRYPTION_KEY
        },
        timeout: 15000,
      });

      // The child process should exit with code 42 because HOLDOUT_ENCRYPTION_KEY is absent
      // in its environment, causing getKek() to throw with the expected message
      expect(result.status).toBe(42);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});
