import { embed } from 'ai';
import { mistral } from '@ai-sdk/mistral';
import { createHash } from 'node:crypto';

export async function computeEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: mistral.embedding('mistral-embed'),
    value: text,
  });
  return embedding;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    magA += a[i]! * a[i]!;
    magB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

export function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

export function hashGapId(dimension: string, description: string): string {
  return createHash('sha256').update(`${dimension}:${description}`).digest('hex');
}
