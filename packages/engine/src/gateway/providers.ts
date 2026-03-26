import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';
import type { ProviderFamily } from './types.js';

export const MODEL_FAMILY_MAP: Record<string, ProviderFamily> = {
  'claude-sonnet-4-6': 'anthropic',
  'claude-opus-4-5': 'anthropic',
  'claude-haiku-4-5': 'anthropic',
  'gpt-4o': 'openai',
  'gpt-4o-mini': 'openai',
  'gpt-4.1': 'openai',
  'gpt-4.1-mini': 'openai',
  'gemini-2.5-pro': 'google',
  'gemini-2.5-flash': 'google',
  'gemini-2.0-flash': 'google',
};

export function getProviderFamily(modelId: string): ProviderFamily {
  const family = MODEL_FAMILY_MAP[modelId];
  if (!family) throw new Error(`Unknown model ID: '${modelId}'. Add it to MODEL_FAMILY_MAP in providers.ts`);
  return family;
}

export function resolveModel(modelId: string): LanguageModel {
  const family = getProviderFamily(modelId);
  switch (family) {
    case 'anthropic': return anthropic(modelId);
    case 'openai': return openai(modelId);
    case 'google': return google(modelId);
  }
}
