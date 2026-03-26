import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @cauldron/shared to prevent DATABASE_URL import-time error
vi.mock('@cauldron/shared', () => ({
  seeds: {},
  beads: {},
}));

// Mock the KnowledgeGraphAdapter
vi.mock('../../intelligence/adapter.js', () => ({
  KnowledgeGraphAdapter: vi.fn(),
}));

// Mock node:fs for detectTestRunner
vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue('{}'),
}));

import { ContextAssembler } from '../context-assembler.js';
import type { KnowledgeGraphAdapter } from '../../intelligence/adapter.js';
import type { LLMGateway } from '../../gateway/gateway.js';
import type { Bead } from '@cauldron/shared';
import type { Seed } from '@cauldron/shared';

function makeMockKG(): KnowledgeGraphAdapter {
  return {
    searchGraph: vi.fn().mockResolvedValue({
      total: 2,
      results: [
        { name: 'createUser', qualified_name: 'src/users.createUser', label: 'function', file_path: 'src/users.ts', in_degree: 3, out_degree: 1 },
        { name: 'hashPassword', qualified_name: 'src/auth.hashPassword', label: 'function', file_path: 'src/auth.ts', in_degree: 1, out_degree: 2 },
      ],
      has_more: false,
    }),
    traceCallPath: vi.fn().mockResolvedValue({
      function: 'createUser',
      direction: 'both',
      callers: [{ name: 'registerUser', qualified_name: 'src/register.registerUser', hop: 1 }],
      callees: [{ name: 'hashPassword', qualified_name: 'src/auth.hashPassword', hop: 1 }],
    }),
    getCodeSnippet: vi.fn().mockResolvedValue({
      name: 'createUser',
      qualified_name: 'src/users.createUser',
      code: 'export function createUser(email: string) { return { email }; }',
      file_path: 'src/users.ts',
      start_line: 1,
      end_line: 3,
    }),
    indexRepository: vi.fn(),
    detectChanges: vi.fn(),
    repoPath: '/test/repo',
    projectName: 'test-repo',
  } as unknown as KnowledgeGraphAdapter;
}

function makeMockGateway(): LLMGateway {
  return {
    generateObject: vi.fn().mockResolvedValue({
      object: {
        symbols: [
          { qualified_name: 'src/users.createUser', reason: 'directly implements the bead goal' },
        ],
      },
    }),
  } as unknown as LLMGateway;
}

function makeBead(overrides: Partial<Bead> = {}): Bead {
  return {
    id: 'bead-uuid-1234',
    seedId: 'seed-uuid-5678',
    moleculeId: null,
    title: 'Implement user creation endpoint',
    spec: 'Create a POST /users endpoint that accepts email and password, hashes the password, and stores the user in the database.',
    status: 'pending',
    estimatedTokens: 5000,
    agentAssignment: null,
    claimedAt: null,
    completedAt: null,
    version: 1,
    coversCriteria: ['AC-01', 'AC-02'],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as Bead;
}

function makeSeed(overrides: Partial<Seed> = {}): Seed {
  return {
    id: 'seed-uuid-5678',
    projectId: 'project-uuid-abcd',
    parentId: null,
    interviewId: null,
    version: 1,
    status: 'crystallized',
    goal: 'Build a user authentication system with signup, login, and JWT tokens.',
    constraints: ['Use TypeScript', 'Store passwords as bcrypt hashes', 'JWT expiry 24h'],
    acceptanceCriteria: ['AC-01', 'AC-02', 'AC-03'],
    ontologySchema: {},
    evaluationPrinciples: [],
    exitConditions: {},
    ambiguityScore: 0.05,
    crystallizedAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  } as unknown as Seed;
}

describe('ContextAssembler', () => {
  let knowledgeGraph: KnowledgeGraphAdapter;
  let gateway: LLMGateway;
  let assembler: ContextAssembler;

  beforeEach(() => {
    vi.clearAllMocks();
    knowledgeGraph = makeMockKG();
    gateway = makeMockGateway();
    assembler = new ContextAssembler(knowledgeGraph, gateway);
  });

  it('assembleContext produces AgentContext with seedExcerpt containing seed.goal', async () => {
    const bead = makeBead();
    const seed = makeSeed();

    const ctx = await assembler.assemble({
      bead,
      seed,
      projectId: 'project-uuid-abcd',
      projectRoot: '/test/project',
    });

    expect(ctx.seedExcerpt).toContain(seed.goal);
  });

  it('assembleContext seedExcerpt contains seed constraints', async () => {
    const bead = makeBead();
    const seed = makeSeed();

    const ctx = await assembler.assemble({
      bead,
      seed,
      projectId: 'project-uuid-abcd',
      projectRoot: '/test/project',
    });

    expect(ctx.seedExcerpt).toContain('TypeScript');
  });

  it('assembleContext scopes acceptanceCriteria to only those in bead.coversCriteria', async () => {
    const bead = makeBead({ coversCriteria: ['AC-01'] });
    const seed = makeSeed({
      acceptanceCriteria: ['AC-01', 'AC-02', 'AC-03'],
    });

    const ctx = await assembler.assemble({
      bead,
      seed,
      projectId: 'project-uuid-abcd',
      projectRoot: '/test/project',
    });

    expect(ctx.seedExcerpt).toContain('AC-01');
    expect(ctx.seedExcerpt).not.toContain('AC-03');
  });

  it('assembleContext queries knowledge graph with keywords from bead spec', async () => {
    const bead = makeBead();
    const seed = makeSeed();

    await assembler.assemble({
      bead,
      seed,
      projectId: 'project-uuid-abcd',
      projectRoot: '/test/project',
    });

    expect(knowledgeGraph.searchGraph).toHaveBeenCalled();
    const call = (knowledgeGraph.searchGraph as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call).toHaveProperty('name_pattern');
    expect(typeof call.name_pattern).toBe('string');
    expect(call.name_pattern.length).toBeGreaterThan(0);
  });

  it('assembleContext fetches code snippets for pruned symbols', async () => {
    const bead = makeBead();
    const seed = makeSeed();

    const ctx = await assembler.assemble({
      bead,
      seed,
      projectId: 'project-uuid-abcd',
      projectRoot: '/test/project',
    });

    expect(knowledgeGraph.getCodeSnippet).toHaveBeenCalled();
    expect(ctx.codeSnippets.length).toBeGreaterThan(0);
    expect(ctx.codeSnippets[0]).toHaveProperty('code');
    expect(ctx.codeSnippets[0]).toHaveProperty('qualifiedName');
  });

  it('assembleContext includes system prompt with implementer role and TDD instructions', async () => {
    const bead = makeBead();
    const seed = makeSeed();

    const ctx = await assembler.assemble({
      bead,
      seed,
      projectId: 'project-uuid-abcd',
      projectRoot: '/test/project',
    });

    expect(ctx.systemPrompt).toContain('implementation agent');
    expect(ctx.systemPrompt.toLowerCase()).toContain('test');
  });

  it('assembleContext calls gateway with context_assembly stage for LLM pruning', async () => {
    const bead = makeBead();
    const seed = makeSeed();

    await assembler.assemble({
      bead,
      seed,
      projectId: 'project-uuid-abcd',
      projectRoot: '/test/project',
    });

    expect(gateway.generateObject).toHaveBeenCalled();
    const call = (gateway.generateObject as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.stage).toBe('context_assembly');
    expect(call.projectId).toBe('project-uuid-abcd');
  });

  it('totalTokenEstimate stays within 180k budget', async () => {
    const bead = makeBead();
    const seed = makeSeed();

    const ctx = await assembler.assemble({
      bead,
      seed,
      projectId: 'project-uuid-abcd',
      projectRoot: '/test/project',
    });

    expect(ctx.totalTokenEstimate).toBeLessThanOrEqual(180_000);
  });

  it('applyTokenBudget trims code snippets when budget exceeded', () => {
    // Access private method via type cast for testing
    const assemblerAny = assembler as unknown as {
      applyTokenBudget: (
        context: {
          seedExcerpt: string;
          beadSpec: string;
          codeSnippets: Array<{ qualifiedName: string; code: string; filePath: string }>;
          dependencyOutputs: string[];
          systemPrompt: string;
        },
        budget: number
      ) => { trimmedContext: unknown; totalTokenEstimate: number };
    };

    // Create a context that exceeds budget
    const largeCode = 'x'.repeat(100_000);
    const context = {
      seedExcerpt: 'Goal: test',
      beadSpec: 'Implement something',
      codeSnippets: [
        { qualifiedName: 'a.b', code: largeCode, filePath: 'a.ts' },
        { qualifiedName: 'c.d', code: largeCode, filePath: 'c.ts' },
      ],
      dependencyOutputs: [],
      systemPrompt: 'You are an agent',
    };

    const result = assemblerAny.applyTokenBudget(context, 5_000);
    expect(result.totalTokenEstimate).toBeLessThanOrEqual(5_000 * 1.5); // allows some slack for trimming
  });

  it('extractKeywords filters stop words and short words', () => {
    const assemblerAny = assembler as unknown as {
      extractKeywords: (spec: string, title: string) => string[];
    };

    const keywords = assemblerAny.extractKeywords(
      'Create a POST endpoint for user registration with email validation',
      'User registration endpoint'
    );

    // Stop words and short words should be filtered
    expect(keywords).not.toContain('a');
    expect(keywords).not.toContain('the');
    expect(keywords).not.toContain('for');
    expect(keywords).not.toContain('with');

    // Meaningful keywords should be present
    expect(keywords.some(k => k.toLowerCase().includes('user') || k.toLowerCase().includes('endpoint') || k.toLowerCase().includes('registration'))).toBe(true);
  });
});
