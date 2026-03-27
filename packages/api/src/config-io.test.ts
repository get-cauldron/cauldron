import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { generateApiKey, writeEnvVar, loadCLIConfig } from './config-io.js';
import { colorStatus, formatJson } from './output.js';

describe('generateApiKey', () => {
  it('returns a 64-char hex string', () => {
    const key = generateApiKey();
    expect(key).toHaveLength(64);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates unique keys on successive calls', () => {
    const k1 = generateApiKey();
    const k2 = generateApiKey();
    expect(k1).not.toBe(k2);
  });
});

describe('writeEnvVar', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'cauldron-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('creates .env with KEY=value when file is missing', async () => {
    await writeEnvVar(tmpDir, 'TEST_KEY', 'test_value');
    const { readFile } = await import('node:fs/promises');
    const content = await readFile(join(tmpDir, '.env'), 'utf-8');
    expect(content).toContain('TEST_KEY=test_value');
  });

  it('appends KEY=value to existing .env', async () => {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(tmpDir, '.env'), 'EXISTING_KEY=existing_value\n', 'utf-8');
    await writeEnvVar(tmpDir, 'NEW_KEY', 'new_value');
    const { readFile } = await import('node:fs/promises');
    const content = await readFile(join(tmpDir, '.env'), 'utf-8');
    expect(content).toContain('EXISTING_KEY=existing_value');
    expect(content).toContain('NEW_KEY=new_value');
  });

  it('updates existing KEY= line if key already present in .env', async () => {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(tmpDir, '.env'), 'CAULDRON_API_KEY=old_key\n', 'utf-8');
    await writeEnvVar(tmpDir, 'CAULDRON_API_KEY', 'new_key');
    const { readFile } = await import('node:fs/promises');
    const content = await readFile(join(tmpDir, '.env'), 'utf-8');
    expect(content).not.toContain('old_key');
    expect(content).toContain('CAULDRON_API_KEY=new_key');
    // Only one occurrence of the key
    const matches = content.match(/CAULDRON_API_KEY=/g);
    expect(matches).toHaveLength(1);
  });
});

describe('loadCLIConfig', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'cauldron-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('returns default config when file is missing', async () => {
    const config = await loadCLIConfig(tmpDir);
    expect(config.serverUrl).toBe('http://localhost:3000');
    expect(config.apiKey).toBe('');
  });

  it('reads serverUrl and apiKey from config file', async () => {
    const { writeFile } = await import('node:fs/promises');
    const configContent = `
export default defineConfig({
  cli: {
    serverUrl: 'http://localhost:4000',
    apiKey: 'my-test-api-key',
  },
});
`;
    await writeFile(join(tmpDir, 'cauldron.config.ts'), configContent, 'utf-8');
    const config = await loadCLIConfig(tmpDir);
    expect(config.serverUrl).toBe('http://localhost:4000');
    expect(config.apiKey).toBe('my-test-api-key');
  });
});

describe('colorStatus', () => {
  it('maps completed to teal (includes COMPLETED text)', () => {
    const result = colorStatus('completed');
    expect(result).toContain('COMPLETED');
  });

  it('maps failed to red (includes FAILED text)', () => {
    const result = colorStatus('failed');
    expect(result).toContain('FAILED');
  });

  it('maps active to amber (includes ACTIVE text)', () => {
    const result = colorStatus('active');
    expect(result).toContain('ACTIVE');
  });

  it('returns white for unknown status', () => {
    const result = colorStatus('unknown-status');
    expect(result).toContain('UNKNOWN-STATUS');
  });
});

describe('formatJson', () => {
  it('returns JSON.stringify with 2-space indent', () => {
    const data = { key: 'value', nested: { a: 1 } };
    const result = formatJson(data);
    expect(result).toBe(JSON.stringify(data, null, 2));
  });

  it('handles arrays', () => {
    const data = [1, 2, 3];
    const result = formatJson(data);
    expect(result).toBe(JSON.stringify(data, null, 2));
  });
});
