import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface CLIConfig {
  serverUrl: string;
  apiKey: string;
  webhookSecret?: string;
}

export function generateApiKey(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Read/write .env file entries.
 * Per D-16: API key must be in .env so the web server can read it via process.env.
 */
export async function writeEnvVar(projectRoot: string, key: string, value: string): Promise<void> {
  const envPath = resolve(projectRoot, '.env');
  let content = '';
  try {
    content = await readFile(envPath, 'utf-8');
  } catch {
    // File doesn't exist yet — will create
  }
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content += (content.endsWith('\n') || content === '' ? '' : '\n') + `${key}=${value}\n`;
  }
  await writeFile(envPath, content, 'utf-8');
}

export async function loadCLIConfig(projectRoot: string): Promise<CLIConfig> {
  const configPath = resolve(projectRoot, 'cauldron.config.ts');
  try {
    const content = await readFile(configPath, 'utf-8');
    const serverUrlMatch = content.match(/serverUrl:\s*['"]([^'"]+)['"]/);
    const apiKeyMatch = content.match(/apiKey:\s*['"]([^'"]+)['"]/);
    return {
      serverUrl: serverUrlMatch?.[1] ?? 'http://localhost:3000',
      apiKey: apiKeyMatch?.[1] ?? '',
    };
  } catch {
    return { serverUrl: 'http://localhost:3000', apiKey: '' };
  }
}

export async function saveCLIConfig(projectRoot: string, config: Partial<CLIConfig>): Promise<void> {
  const configPath = resolve(projectRoot, 'cauldron.config.ts');
  let content = '';
  try {
    content = await readFile(configPath, 'utf-8');
  } catch {
    // File doesn't exist yet — minimal config
    content = `import { defineConfig } from '@cauldron/engine/gateway';\nexport default defineConfig({});\n`;
  }

  // Write api key to .env per D-16 — web server reads from process.env, not cauldron.config.ts
  if (config.apiKey !== undefined) {
    await writeEnvVar(projectRoot, 'CAULDRON_API_KEY', config.apiKey);
  }

  // Inject or update cli section in the config file via regex
  const cliSection = `cli: { serverUrl: '${config.serverUrl ?? 'http://localhost:3000'}', apiKey: '${config.apiKey ?? ''}' }`;
  const cliRegex = /cli:\s*\{[^}]*\}/;
  if (cliRegex.test(content)) {
    content = content.replace(cliRegex, cliSection);
  } else {
    // Append cli key before closing defineConfig brace
    content = content.replace(
      /defineConfig\(\s*\{([\s\S]*?)\}\s*\)/,
      (match, inner) => {
        const trimmed = inner.trimEnd();
        const separator = trimmed.endsWith(',') || trimmed === '' ? '\n  ' : ',\n  ';
        return `defineConfig({${trimmed}${separator}${cliSection}\n})`;
      }
    );
  }
  await writeFile(configPath, content, 'utf-8');
}
