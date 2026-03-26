import { z } from 'zod';
import type { AgentContext, TestRunnerConfig } from './types.js';
import { detectTestRunner } from './test-detector.js';
import type { KnowledgeGraphAdapter } from '../intelligence/adapter.js';
import type { LLMGateway } from '../gateway/gateway.js';
import type { Bead, Seed } from '@cauldron/shared';

/** Token estimate: words * 1.3 */
function estimateTokens(text: string): number {
  if (!text) return 0;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return Math.ceil(wordCount * 1.3);
}

/** Zod schema for LLM pruning response (D-07) */
const PrunedSymbolsSchema = z.object({
  symbols: z.array(
    z.object({
      qualified_name: z.string(),
      reason: z.string(),
    })
  ),
});

/** Stop words filtered from keyword extraction */
const STOP_WORDS = new Set([
  'the', 'is', 'a', 'an', 'to', 'for', 'in', 'of', 'on', 'at', 'by',
  'and', 'or', 'but', 'not', 'with', 'that', 'this', 'it', 'be',
  'are', 'was', 'were', 'has', 'have', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'can', 'from',
  'as', 'its', 'which', 'who', 'what', 'when', 'where', 'how', 'all',
  'each', 'only', 'then', 'than', 'so', 'into', 'also', 'through',
  'if', 'up', 'out', 'about', 'after', 'before', 'between', 'over',
  'under', 'per', 'any', 'via', 'their', 'them', 'they', 'we', 'you',
  'he', 'she', 'me', 'my', 'our', 'your', 'his', 'her',
]);

/**
 * Assembles context for an implementation agent.
 * Queries the knowledge graph, scopes seed excerpts to bead criteria,
 * prunes candidates via LLM, and applies a 180k token budget.
 */
export class ContextAssembler {
  constructor(
    private readonly knowledgeGraph: KnowledgeGraphAdapter,
    private readonly gateway: LLMGateway
  ) {}

  /**
   * Assemble context for a bead execution.
   * Returns a fully-scoped AgentContext within the 180k token budget.
   */
  async assemble(options: {
    bead: Bead;
    seed: Seed;
    projectId: string;
    projectRoot: string;
    dependencyOutputs?: string[];
  }): Promise<AgentContext> {
    const { bead, seed, projectId, projectRoot, dependencyOutputs = [] } = options;

    // Step 1: Extract keywords from bead spec and title
    const keywords = this.extractKeywords(bead.spec, bead.title);

    // Step 2: Query knowledge graph for candidate symbols
    const searchResult = await this.knowledgeGraph.searchGraph({
      name_pattern: keywords.join('|'),
    });
    const candidates = searchResult.results.slice(0, 20);

    // Step 3: Trace call paths for each candidate (1-hop dependencies)
    const tracePromises = candidates.map((symbol) =>
      this.knowledgeGraph.traceCallPath(symbol.name, 'both').catch(() => null)
    );
    const traces = await Promise.all(tracePromises);

    // Step 4: LLM pruning pass (D-07) — identify truly relevant symbols
    const prunedSymbols = await this.pruneSymbols({
      beadSpec: bead.spec,
      candidates,
      projectId,
    });

    // Step 5: Fetch code snippets for pruned symbols
    const snippetPromises = prunedSymbols.map((sym) =>
      this.knowledgeGraph.getCodeSnippet(sym.qualified_name).catch(() => null)
    );
    const snippetResults = await Promise.all(snippetPromises);
    const codeSnippets = snippetResults
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .map((s) => ({
        qualifiedName: s.qualified_name,
        code: s.code,
        filePath: s.file_path,
        // Annotate with hop info from traces for budget trimming
        _hop: this.getHopForSymbol(s.qualified_name, traces),
      }));

    // Step 6: Build seed excerpt scoped to bead's coversCriteria
    const seedExcerpt = this.buildSeedExcerpt(seed, bead.coversCriteria as string[]);

    // Step 7: Build system prompt
    const systemPrompt = this.buildSystemPrompt();

    // Step 8: Detect test runner
    const testRunner = this.buildTestRunner(bead, projectRoot);

    // Step 9: Apply token budget with priority trimming
    const { trimmedContext, totalTokenEstimate } = this.applyTokenBudget(
      {
        seedExcerpt,
        beadSpec: bead.spec,
        codeSnippets: codeSnippets.map(({ _hop: _h, ...rest }) => rest),
        dependencyOutputs,
        systemPrompt,
      },
      180_000
    );

    return {
      seedExcerpt: trimmedContext.seedExcerpt,
      beadSpec: trimmedContext.beadSpec,
      beadTitle: bead.title,
      codeSnippets: trimmedContext.codeSnippets,
      dependencyOutputs: trimmedContext.dependencyOutputs,
      testRunner,
      systemPrompt: trimmedContext.systemPrompt,
      totalTokenEstimate,
    };
  }

  /**
   * Extract keywords from bead spec and title for knowledge graph queries.
   * Returns top 15 meaningful terms by frequency, filtered of stop words.
   */
  extractKeywords(spec: string, title: string): string[] {
    const combined = `${title} ${spec}`;
    const words = combined
      .split(/[\s\p{P}]+/u)
      .map((w) => w.toLowerCase())
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

    // Count frequency
    const freq = new Map<string, number>();
    for (const word of words) {
      freq.set(word, (freq.get(word) ?? 0) + 1);
    }

    // Sort by frequency, deduplicate (Map guarantees uniqueness), return top 15
    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([word]) => word);
  }

  /**
   * Build a scoped seed excerpt for a bead.
   * Includes all constraints (cross-cutting per D-09) but only matching acceptanceCriteria.
   */
  buildSeedExcerpt(seed: Seed, coversCriteria: string[]): string {
    const constraints = seed.constraints as string[];
    const acceptanceCriteria = seed.acceptanceCriteria as string[];

    const constraintLines =
      constraints.length > 0
        ? constraints.map((c) => `- ${c}`).join('\n')
        : '(none)';

    // Filter acceptance criteria to only those in coversCriteria
    const relevantCriteria = acceptanceCriteria.filter((ac) =>
      coversCriteria.some((cc) => ac === cc || ac.startsWith(cc))
    );
    const criteriaLines =
      relevantCriteria.length > 0
        ? relevantCriteria.map((ac) => `- ${ac}`).join('\n')
        : '(none scoped to this bead)';

    return [
      `## Goal`,
      seed.goal,
      ``,
      `## Constraints`,
      constraintLines,
      ``,
      `## Acceptance Criteria (relevant to this bead)`,
      criteriaLines,
    ].join('\n');
  }

  /**
   * Build the system prompt for the implementation agent.
   * Covers role, TDD approach, constraints, output format, anti-mocking, error handling.
   */
  buildSystemPrompt(): string {
    return [
      'You are an implementation agent for Cauldron. You write production-quality TypeScript code.',
      '',
      'Write tests FIRST from the bead specification, then implement until all tests pass.',
      '',
      'You may only create or modify files relative to the current working directory. No git push, no deletion outside scope, no network calls except through the provided LLM gateway.',
      '',
      'Respond with code blocks prefixed with the file path:',
      '```typescript',
      '// path/to/file.ts',
      '```',
      '',
      'Prefer real integrations over mocks. Only mock true external services (third-party APIs, payment providers).',
      '',
      'If tests fail, read the error output carefully and modify your implementation. Do not modify tests to make them pass — fix the implementation.',
    ].join('\n');
  }

  /**
   * Apply the 180k token budget with priority-based trimming (D-10).
   * Trim order: (1) distant code snippets (hop > 1), (2) truncate to signatures, (3) truncate dependency outputs.
   */
  applyTokenBudget(
    context: {
      seedExcerpt: string;
      beadSpec: string;
      codeSnippets: Array<{ qualifiedName: string; code: string; filePath: string }>;
      dependencyOutputs: string[];
      systemPrompt: string;
    },
    budget: number = 180_000
  ): {
    trimmedContext: Omit<AgentContext, 'testRunner' | 'previousErrors' | 'beadTitle'>;
    totalTokenEstimate: number;
  } {
    let codeSnippets = [...context.codeSnippets];
    let dependencyOutputs = [...context.dependencyOutputs];

    function calcTotal(): number {
      return (
        estimateTokens(context.seedExcerpt) +
        estimateTokens(context.beadSpec) +
        estimateTokens(context.systemPrompt) +
        codeSnippets.reduce((sum, s) => sum + estimateTokens(s.code), 0) +
        dependencyOutputs.reduce((sum, d) => sum + estimateTokens(d), 0)
      );
    }

    let total = calcTotal();

    // Step 1: Remove snippets that came from hop > 1 (distant dependencies)
    if (total > budget) {
      codeSnippets = codeSnippets.filter((s) => {
        const annotated = s as typeof s & { _hop?: number };
        return (annotated._hop ?? 1) <= 1;
      });
      total = calcTotal();
    }

    // Step 2: Truncate remaining code snippets to function signatures only
    if (total > budget) {
      codeSnippets = codeSnippets.map((s) => ({
        ...s,
        code: extractSignature(s.code),
      }));
      total = calcTotal();
    }

    // Step 3: Truncate dependency outputs
    if (total > budget) {
      const outputBudget = Math.max(
        0,
        budget -
          estimateTokens(context.seedExcerpt) -
          estimateTokens(context.beadSpec) -
          estimateTokens(context.systemPrompt) -
          codeSnippets.reduce((sum, s) => sum + estimateTokens(s.code), 0)
      );
      const outputText = dependencyOutputs.join('\n');
      const truncated = truncateToTokens(outputText, outputBudget);
      dependencyOutputs = truncated ? [truncated] : [];
      total = calcTotal();
    }

    return {
      trimmedContext: {
        seedExcerpt: context.seedExcerpt,
        beadSpec: context.beadSpec,
        codeSnippets,
        dependencyOutputs,
        systemPrompt: context.systemPrompt,
        totalTokenEstimate: total,
      },
      totalTokenEstimate: total,
    };
  }

  // --- Private helpers ---

  private async pruneSymbols(options: {
    beadSpec: string;
    candidates: Array<{ name: string; qualified_name: string; label: string; file_path: string }>;
    projectId: string;
  }): Promise<Array<{ qualified_name: string; reason: string }>> {
    if (options.candidates.length === 0) return [];

    const prompt = buildPruningPrompt(options.beadSpec, options.candidates);

    try {
      const result = await this.gateway.generateObject({
        stage: 'context_assembly',
        schema: PrunedSymbolsSchema,
        projectId: options.projectId,
        prompt,
        temperature: 0,
      });
      return result.object.symbols;
    } catch {
      // If pruning fails, fall back to returning all candidates
      return options.candidates.map((c) => ({
        qualified_name: c.qualified_name,
        reason: 'fallback: pruning unavailable',
      }));
    }
  }

  private getHopForSymbol(
    qualifiedName: string,
    traces: Array<{
      callers?: Array<{ qualified_name: string; hop: number }>;
      callees?: Array<{ qualified_name: string; hop: number }>;
    } | null>
  ): number {
    for (const trace of traces) {
      if (!trace) continue;
      const inCallers = trace.callers?.find((h) => h.qualified_name === qualifiedName);
      if (inCallers) return inCallers.hop;
      const inCallees = trace.callees?.find((h) => h.qualified_name === qualifiedName);
      if (inCallees) return inCallees.hop;
    }
    return 1; // Default to direct hop
  }

  private buildTestRunner(bead: Bead, projectRoot: string): TestRunnerConfig {
    const config = detectTestRunner(projectRoot);
    const spec = `${bead.spec} ${bead.title}`.toLowerCase();
    const isUserFacing =
      spec.includes('ui') ||
      spec.includes('api') ||
      spec.includes('cli') ||
      spec.includes('endpoint') ||
      spec.includes('page') ||
      spec.includes('form') ||
      spec.includes('route');

    if (!isUserFacing) {
      // D-23: only include e2eCommand for user-facing beads
      const { e2eCommand: _, ...rest } = config;
      void _;
      return rest as TestRunnerConfig;
    }
    return config;
  }
}

// --- Module-level helpers ---

function buildPruningPrompt(
  beadSpec: string,
  candidates: Array<{ name: string; qualified_name: string; label: string; file_path: string }>
): string {
  const candidateList = candidates
    .map((c) => `- ${c.qualified_name} (${c.label}) in ${c.file_path}`)
    .join('\n');

  return [
    'Given the following bead specification, identify which code symbols are truly relevant.',
    'Return only symbols directly needed for implementing the bead.',
    '',
    '## Bead Specification',
    beadSpec,
    '',
    '## Candidate Symbols',
    candidateList,
  ].join('\n');
}

function extractSignature(code: string): string {
  // Extract just the function/class signature (first line or export declaration)
  const lines = code.split('\n');
  const sigLines: string[] = [];
  for (const line of lines) {
    sigLines.push(line);
    // Stop after the opening brace of the body
    if (line.includes('{') && !line.includes('//')) {
      sigLines.push('  // ... (truncated for token budget)');
      sigLines.push('}');
      break;
    }
  }
  return sigLines.join('\n');
}

function truncateToTokens(text: string, maxTokens: number): string {
  const words = text.split(/\s+/);
  const maxWords = Math.floor(maxTokens / 1.3);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(' ') + '\n... (truncated for token budget)';
}
