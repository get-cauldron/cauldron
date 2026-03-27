import { z } from 'zod';
import type { LLMGateway } from '../gateway/gateway.js';
import type { Seed } from '@get-cauldron/shared';
import type { GapAnalysis, LateralThinkingProposal } from './types.js';

export const PERSONAS = ['contrarian', 'hacker', 'simplifier', 'researcher', 'architect'] as const;
export type Persona = typeof PERSONAS[number];

const PERSONA_PROMPTS: Record<Persona, string> = {
  contrarian:
    'Challenge every assumption in the current approach. Propose the opposite of what failed. If the current spec is complex, propose radical simplicity. If it is simple, propose depth.',
  hacker:
    'Find the fastest, most pragmatic path to the goal. Cut unnecessary abstractions. Propose the minimal viable approach that would actually work.',
  simplifier:
    'Remove complexity. Merge overlapping criteria. Identify what can be eliminated entirely. The best code is no code.',
  researcher:
    'What proven patterns or libraries solve this problem? Propose an approach grounded in established solutions, not invention.',
  architect:
    'Rethink the structural decomposition. Maybe the molecule/bead boundaries are wrong. Propose a different way to organize the work.',
};

/**
 * LLM-safe proposal schema — no min/max/int constraints per D-Zod-LLM compatibility rule.
 */
const ProposalSchema = z.object({
  goal: z.string(),
  constraints: z.array(z.object({ constraint: z.string() })),
  acceptanceCriteria: z.array(z.object({ criterion: z.string() })),
  rationale: z.string(),
});

/**
 * Meta-judge schema — selects or merges proposals from 5 personas.
 */
const MetaJudgeSchema = z.object({
  selectedPersona: z.string().nullable(),
  mergedProposal: ProposalSchema.nullable(),
  reasoning: z.string(),
  viable: z.boolean(),
});

/**
 * Generate a lateral thinking proposal from a single persona.
 * Calls gateway.generateObject at stage 'evaluation' with persona-specific prompt.
 */
export async function generatePersonaProposal(params: {
  gateway: LLMGateway;
  persona: Persona;
  seed: Seed;
  gapAnalysis: GapAnalysis[];
  projectId: string;
  seedId: string;
}): Promise<LateralThinkingProposal> {
  const { gateway, persona, seed, gapAnalysis, projectId, seedId } = params;

  const gapSummary = gapAnalysis
    .map(g => `- [${g.dimension}] score=${g.score}: ${g.description}`)
    .join('\n');

  const acSummary = Array.isArray(seed.acceptanceCriteria)
    ? (seed.acceptanceCriteria as unknown[]).map((ac, i) => `  ${i + 1}. ${JSON.stringify(ac)}`).join('\n')
    : String(seed.acceptanceCriteria);

  const prompt = [
    `PERSONA: ${persona.toUpperCase()}`,
    `DIRECTIVE: ${PERSONA_PROMPTS[persona]}`,
    '',
    `CURRENT SEED GOAL: ${seed.goal}`,
    '',
    `CURRENT ACCEPTANCE CRITERIA:`,
    acSummary,
    '',
    `GAP ANALYSIS (what failed):`,
    gapSummary,
    '',
    `Based on your persona's perspective, propose a radically different approach to achieve the goal.`,
    `Focus on what the current approach got wrong and how your perspective would fix it.`,
  ].join('\n');

  const result = await gateway.generateObject({
    projectId,
    seedId,
    stage: 'evaluation',
    schema: ProposalSchema,
    schemaName: 'LateralThinkingProposal',
    schemaDescription: `A proposal from the ${persona} persona for breaking out of evolutionary stagnation`,
    system: PERSONA_PROMPTS[persona],
    prompt,
  });

  return {
    persona,
    goal: result.object.goal,
    constraints: result.object.constraints,
    acceptanceCriteria: result.object.acceptanceCriteria,
    rationale: result.object.rationale,
  };
}

/**
 * Meta-judge evaluates all 5 persona proposals and selects the best or merges complementary ideas.
 * Returns null if no proposal is viable (triggers escalation path in the FSM).
 */
export async function metaJudgeSelect(params: {
  gateway: LLMGateway;
  proposals: LateralThinkingProposal[];
  originalSeed: Seed;
  projectId: string;
  seedId: string;
}): Promise<LateralThinkingProposal | null> {
  const { gateway, proposals, originalSeed, projectId, seedId } = params;

  const proposalSummary = proposals
    .map(
      (p, i) =>
        `PROPOSAL ${i + 1} — ${p.persona} (${p.persona.toUpperCase()}):\n` +
        `  Goal: ${p.goal}\n` +
        `  Rationale: ${p.rationale}`
    )
    .join('\n\n');

  const prompt = [
    `META-JUDGE EVALUATION`,
    ``,
    `ORIGINAL GOAL: ${originalSeed.goal}`,
    ``,
    `You have received 5 lateral thinking proposals from different creative personas:`,
    ``,
    proposalSummary,
    ``,
    `TASK: Evaluate these proposals and either:`,
    `  1. Select the single most promising proposal that would break the evolutionary stagnation.`,
    `  2. Merge complementary ideas from multiple proposals into a stronger combined approach.`,
    `  3. If none of the proposals are viable (all are too risky, incoherent, or unlikely to improve on current failures), set viable=false.`,
    ``,
    `Be critical. Only set viable=true if you genuinely believe the selected/merged approach`,
    `would succeed where the current approach has failed.`,
  ].join('\n');

  const result = await gateway.generateObject({
    projectId,
    seedId,
    stage: 'evaluation',
    schema: MetaJudgeSchema,
    schemaName: 'MetaJudgeSelection',
    schemaDescription: 'Meta-judge selection or merge of lateral thinking proposals',
    prompt,
  });

  if (!result.object.viable || !result.object.mergedProposal) {
    return null;
  }

  const merged = result.object.mergedProposal;
  const selectedPersona = result.object.selectedPersona ?? 'meta-judge';

  return {
    persona: selectedPersona,
    goal: merged.goal,
    constraints: merged.constraints,
    acceptanceCriteria: merged.acceptanceCriteria,
    rationale: merged.rationale,
  };
}

/**
 * Run all 5 lateral thinking personas in parallel and have a meta-judge select the best proposal.
 *
 * Per D-14: personas run in parallel via Promise.all with step.run durability per persona.
 * Per D-15: meta-judge receives all 5 proposals and selects or merges.
 * Per D-16: returns null when no viable proposal exists — the FSM uses this to trigger human escalation.
 */
export async function runLateralThinking(params: {
  step: { run: <T>(name: string, fn: () => Promise<T>) => Promise<T> };
  gateway: LLMGateway;
  seed: Seed;
  gapAnalysis: GapAnalysis[];
  projectId: string;
  seedId: string;
}): Promise<LateralThinkingProposal | null> {
  const { step, gateway, seed, gapAnalysis, projectId, seedId } = params;

  // Run all 5 personas in parallel via step.run for Inngest durability
  const proposals = await Promise.all(
    PERSONAS.map(persona =>
      step.run(`lateral-thinking-${persona}`, () =>
        generatePersonaProposal({
          gateway,
          persona,
          seed,
          gapAnalysis,
          projectId,
          seedId,
        })
      )
    )
  );

  // Meta-judge selects the best proposal or merges complementary ideas
  const selected = await step.run('lateral-thinking-meta-judge', () =>
    metaJudgeSelect({
      gateway,
      proposals,
      originalSeed: seed,
      projectId,
      seedId,
    })
  );

  return selected;
}
