import { anthropic } from '@ai-sdk/anthropic';
import { mistral } from '@ai-sdk/mistral';
import { ollama } from 'ai-sdk-ollama';
import { google } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';
import type { ProviderFamily } from './types.js';

export const MODEL_FAMILY_MAP: Record<string, ProviderFamily> = {
  'claude-sonnet-4-6': 'anthropic',
  'claude-opus-4-6': 'anthropic',
  'claude-opus-4-5': 'anthropic',
  'claude-haiku-4-5': 'anthropic',
  'mistral-large-latest': 'mistral',
  'mistral-small-latest': 'mistral',
  'codestral-latest': 'mistral',
  'gemini-3.1-pro-preview': 'google',
  'gemini-2.5-pro': 'google',
  'gemini-2.5-flash': 'google',
};

export function getProviderFamily(modelId: string): ProviderFamily {
  if (modelId.startsWith('ollama:')) return 'ollama';
  const family = MODEL_FAMILY_MAP[modelId];
  if (!family) throw new Error(`Unknown model ID: '${modelId}'. Add it to MODEL_FAMILY_MAP in providers.ts`);
  return family;
}

export function resolveModel(modelId: string): LanguageModel {
  const family = getProviderFamily(modelId);
  switch (family) {
    case 'anthropic': return anthropic(modelId);
    case 'mistral': return mistral(modelId);
    case 'ollama': return ollama(modelId.slice('ollama:'.length));
    case 'google': return google(modelId);
  }
}
