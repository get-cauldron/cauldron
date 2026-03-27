import type { DbClient, Seed } from '@get-cauldron/shared';
import type { ConvergenceSignal, ConvergenceSignalType, GapAnalysis, EvolutionContext } from './types.js';
import {
  MAX_GENERATIONS,
  ONTOLOGY_SIMILARITY_THRESHOLD,
  STAGNATION_WINDOW,
  REPETITIVE_FEEDBACK_THRESHOLD,
} from './types.js';
import { computeEmbedding, cosineSimilarity, jaccardSimilarity } from './embeddings.js';
import { getSeedLineage } from '../interview/crystallizer.js';

type EmbeddingFn = (text: string) => Promise<number[]>;

/**
 * EVOL-09: Hard cap — halt if generation >= MAX_GENERATIONS (30).
 */
export function checkHardCap(generation: number): ConvergenceSignal {
  const fired = generation >= MAX_GENERATIONS;
  return {
    type: 'hard_cap',
    fired,
    detail: fired
      ? `Generation ${generation} reached hard cap of ${MAX_GENERATIONS}`
      : `Generation ${generation} is below hard cap of ${MAX_GENERATIONS}`,
  };
}

/**
 * EVOL-06: Stagnation — halt if the last STAGNATION_WINDOW seeds all have the same score.
 */
export function checkStagnation(lineage: Seed[]): ConvergenceSignal {
  if (lineage.length < STAGNATION_WINDOW) {
    return {
      type: 'stagnation',
      fired: false,
      detail: `Lineage has ${lineage.length} seeds; need ${STAGNATION_WINDOW} for stagnation check`,
    };
  }

  const lastN = lineage.slice(-STAGNATION_WINDOW);
  const scores = lastN.map((s) => {
    const ec = s.evolutionContext as EvolutionContext | null;
    return ec?.score ?? null;
  });

  const allPresent = scores.every((sc) => sc !== null);
  if (!allPresent) {
    return {
      type: 'stagnation',
      fired: false,
      detail: 'Some seeds in stagnation window are missing evolution context scores',
    };
  }

  const first = scores[0]!;
  const allSame = scores.every((sc) => Math.abs(sc! - first) < 0.001);

  return {
    type: 'stagnation',
    fired: allSame,
    detail: allSame
      ? `Score unchanged at ${first} for last ${STAGNATION_WINDOW} generations`
      : `Scores vary across last ${STAGNATION_WINDOW} generations: ${scores.join(', ')}`,
  };
}

/**
 * EVOL-05: Ontology stability — halt if both Jaccard and cosine similarity
 * of acceptance criteria are >= ONTOLOGY_SIMILARITY_THRESHOLD across 2 consecutive generations.
 */
export async function checkOntologyStability(params: {
  currentSeed: Seed;
  previousSeed: Seed;
  computeEmbeddingFn?: EmbeddingFn;
}): Promise<ConvergenceSignal> {
  const { currentSeed, previousSeed, computeEmbeddingFn = computeEmbedding } = params;

  const currentACs = Array.isArray(currentSeed.acceptanceCriteria)
    ? (currentSeed.acceptanceCriteria as string[])
    : [];
  const previousACs = Array.isArray(previousSeed.acceptanceCriteria)
    ? (previousSeed.acceptanceCriteria as string[])
    : [];

  const currentSet = new Set(currentACs.map(String));
  const previousSet = new Set(previousACs.map(String));

  const jaccard = jaccardSimilarity(currentSet, previousSet);

  if (jaccard < ONTOLOGY_SIMILARITY_THRESHOLD) {
    return {
      type: 'ontology_stability',
      fired: false,
      detail: `Jaccard similarity ${jaccard.toFixed(3)} below threshold ${ONTOLOGY_SIMILARITY_THRESHOLD}`,
    };
  }

  // Only compute embeddings if Jaccard passed (expensive)
  const currentText = currentACs.join(' ');
  const previousText = previousACs.join(' ');

  const [currentEmbed, previousEmbed] = await Promise.all([
    computeEmbeddingFn(currentText),
    computeEmbeddingFn(previousText),
  ]);

  const cosine = cosineSimilarity(currentEmbed, previousEmbed);
  const fired = cosine >= ONTOLOGY_SIMILARITY_THRESHOLD;

  return {
    type: 'ontology_stability',
    fired,
    detail: fired
      ? `Ontology stable: Jaccard=${jaccard.toFixed(3)}, cosine=${cosine.toFixed(3)}`
      : `Cosine similarity ${cosine.toFixed(3)} below threshold ${ONTOLOGY_SIMILARITY_THRESHOLD} (Jaccard=${jaccard.toFixed(3)})`,
  };
}

/**
 * EVOL-07: Oscillation — halt if current seed's AC embedding is similar (>= threshold)
 * to a grandparent (period-2), great-grandparent (period-3), or great-great-grandparent (period-4).
 */
export async function checkOscillation(params: {
  lineage: Seed[];
  currentIndex: number;
  computeEmbeddingFn?: EmbeddingFn;
}): Promise<ConvergenceSignal> {
  const { lineage, currentIndex, computeEmbeddingFn = computeEmbedding } = params;

  const current = lineage[currentIndex];
  if (!current) {
    return {
      type: 'oscillation',
      fired: false,
      detail: 'Current seed not found in lineage',
    };
  }

  const currentACs = Array.isArray(current.acceptanceCriteria)
    ? (current.acceptanceCriteria as string[])
    : [];
  const currentEmbed = await computeEmbeddingFn(currentACs.join(' '));

  for (const period of [2, 3, 4]) {
    const ancestorIndex = currentIndex - period;
    if (ancestorIndex < 0) continue;

    const ancestor = lineage[ancestorIndex];
    if (!ancestor) continue;

    const ancestorACs = Array.isArray(ancestor.acceptanceCriteria)
      ? (ancestor.acceptanceCriteria as string[])
      : [];
    const ancestorEmbed = await computeEmbeddingFn(ancestorACs.join(' '));

    const similarity = cosineSimilarity(currentEmbed, ancestorEmbed);
    if (similarity >= ONTOLOGY_SIMILARITY_THRESHOLD) {
      return {
        type: 'oscillation',
        fired: true,
        detail: `Period-${period} oscillation detected: cosine similarity=${similarity.toFixed(3)} to ancestor at index ${ancestorIndex}`,
      };
    }
  }

  return {
    type: 'oscillation',
    fired: false,
    detail: 'No oscillation detected across periods 2, 3, 4',
  };
}

/**
 * EVOL-08: Repetitive feedback — halt if >= 70% of current gap IDs appear in previous generation.
 */
export function checkRepetitiveFeedback(params: {
  currentGaps: GapAnalysis[];
  previousGaps: GapAnalysis[];
}): ConvergenceSignal {
  const { currentGaps, previousGaps } = params;

  if (currentGaps.length === 0 || previousGaps.length === 0) {
    return {
      type: 'repetitive_feedback',
      fired: false,
      detail:
        currentGaps.length === 0
          ? 'No current gaps to compare'
          : 'No previous gaps to compare against',
    };
  }

  const previousGapIds = new Set(previousGaps.map((g) => g.gapId));
  const matchingCount = currentGaps.filter((g) => previousGapIds.has(g.gapId)).length;
  const overlapRatio = matchingCount / currentGaps.length;

  const fired = overlapRatio >= REPETITIVE_FEEDBACK_THRESHOLD;

  return {
    type: 'repetitive_feedback',
    fired,
    detail: fired
      ? `${(overlapRatio * 100).toFixed(0)}% of gap IDs repeated from previous generation (>= ${REPETITIVE_FEEDBACK_THRESHOLD * 100}% threshold)`
      : `Only ${(overlapRatio * 100).toFixed(0)}% of gap IDs repeated (below ${REPETITIVE_FEEDBACK_THRESHOLD * 100}% threshold)`,
  };
}

export interface ConvergenceResult {
  halt: boolean;
  signal?: ConvergenceSignal;
}

/**
 * EVOL-05 to EVOL-09, D-09: Master convergence check.
 * Checks all 5 signals in priority order — any-of semantics (first match halts).
 * Priority: hard_cap > stagnation > ontology_stability > oscillation > repetitive_feedback
 */
export async function checkConvergence(params: {
  db: DbClient;
  seedId: string;
  currentGeneration: number;
  currentScore: number;
  currentGaps: GapAnalysis[];
  computeEmbeddingFn?: EmbeddingFn;
}): Promise<ConvergenceResult> {
  const { db, seedId, currentGeneration, currentScore, currentGaps, computeEmbeddingFn } = params;

  // 1. Hard cap — no DB access needed
  const hardCap = checkHardCap(currentGeneration);
  if (hardCap.fired) {
    return { halt: true, signal: hardCap };
  }

  // Fetch lineage for remaining checks
  const lineage = await getSeedLineage(db, seedId);

  // 2. Stagnation
  const stagnation = checkStagnation(lineage);
  if (stagnation.fired) {
    return { halt: true, signal: stagnation };
  }

  // 3. Ontology stability (requires 2+ seeds)
  if (lineage.length >= 2) {
    const current = lineage[lineage.length - 1]!;
    const previous = lineage[lineage.length - 2]!;
    const ontology = await checkOntologyStability({
      currentSeed: current,
      previousSeed: previous,
      computeEmbeddingFn,
    });
    if (ontology.fired) {
      return { halt: true, signal: ontology };
    }
  }

  // 4. Oscillation (requires 3+ seeds)
  if (lineage.length >= 3) {
    const oscillation = await checkOscillation({
      lineage,
      currentIndex: lineage.length - 1,
      computeEmbeddingFn,
    });
    if (oscillation.fired) {
      return { halt: true, signal: oscillation };
    }
  }

  // 5. Repetitive feedback (requires previous seed with evolution context)
  if (lineage.length >= 2) {
    const previousSeed = lineage[lineage.length - 2]!;
    const previousEc = previousSeed.evolutionContext as EvolutionContext | null;
    const previousGaps = previousEc?.gapAnalysis ?? [];

    const repetitive = checkRepetitiveFeedback({
      currentGaps,
      previousGaps,
    });
    if (repetitive.fired) {
      return { halt: true, signal: repetitive };
    }
  }

  return { halt: false };
}

// Re-export constants for consumers
export { MAX_GENERATIONS, ONTOLOGY_SIMILARITY_THRESHOLD, REPETITIVE_FEEDBACK_THRESHOLD };
