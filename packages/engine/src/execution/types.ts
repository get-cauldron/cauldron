import type { Bead, Seed } from '@cauldron/shared';

// Bead and Seed are imported for documentation purposes; downstream consumers of
// AgentContext may reference them. Suppress unused-import lint via explicit usage below.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _Bead = Bead;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _Seed = Seed;

/** Info about a created worktree */
export interface WorktreeInfo {
  path: string;
  branch: string;
  beadId: string;
}

/** Result of merging a worktree back to main */
export interface MergeResult {
  success: boolean;
  conflicted: boolean;
  conflicts?: string[];
  resolvedByLlm?: boolean;
}

/** Assembled context for an agent */
export interface AgentContext {
  seedExcerpt: string;
  beadSpec: string;
  beadTitle: string;
  codeSnippets: Array<{ qualifiedName: string; code: string; filePath: string }>;
  dependencyOutputs: string[];
  testRunner: TestRunnerConfig;
  systemPrompt: string;
  totalTokenEstimate: number;
  previousErrors?: string[];
}

/** Test runner configuration for the target project */
export interface TestRunnerConfig {
  unitCommand: string;
  integrationCommand: string;
  e2eCommand?: string;        // only present for user-facing beads (D-23)
  typecheckCommand: string;
}

/** Options for the TDD self-healing loop */
export interface TddLoopOptions {
  agentContext: AgentContext;
  worktreePath: string;
  beadId: string;
  projectId: string;
  seedId: string;
  maxIterations: number;      // D-22: default 5
}

/** Result of agent execution */
export interface ExecutionResult {
  success: boolean;
  iterations: number;
  finalErrors?: string[];
  filesModified?: string[];
}

/** Timeout configuration per project */
export interface TimeoutConfig {
  idleMinutes: number;        // D-24: no file writes for N minutes
  softTimeoutPercent: number; // D-24: default 80%
  hardTimeoutMinutes: number; // D-24: absolute max
}

/** Merge queue entry */
export interface MergeQueueEntry {
  beadId: string;
  seedId: string;
  projectId: string;
  branch: string;
  worktreePath: string;
  topologicalOrder: number;
}

/** Token budget allocation for context assembly */
export interface TokenBudget {
  total: number;              // D-10: 200k minus implementation room
  seedExcerpt: number;
  beadSpec: number;
  codeSnippets: number;
  dependencyOutputs: number;
  reserved: number;           // room for agent response
}
