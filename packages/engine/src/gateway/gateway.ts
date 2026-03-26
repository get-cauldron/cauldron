import {
  streamText as aiStreamText,
  generateText as aiGenerateText,
  generateObject as aiGenerateObject,
  streamObject as aiStreamObject,
  type LanguageModelUsage,
  type ModelMessage,
} from 'ai';
import type { Logger } from 'pino';
import type { z } from 'zod';
import { CircuitBreaker } from './circuit-breaker.js';
import { executeWithFailover } from './failover.js';
import { enforceDiversity } from './diversity.js';
import { getProviderFamily } from './providers.js';
import { calculateCostCents } from './pricing.js';
import { checkBudget } from './budget.js';
import { validateProviderKeys } from './validation.js';
import type { GatewayCallOptions, GatewayObjectOptions, PipelineStage, ProviderFamily } from './types.js';
import type { GatewayConfig } from './config.js';
import type { FailoverAttempt } from './errors.js';
import { llmUsage, type ProjectSettings } from '@cauldron/shared';
import { appendEvent } from '@cauldron/shared';
import type { DbClient } from '@cauldron/shared';

const STAGE_PREAMBLES: Record<PipelineStage, string> = {
  interview:
    "You are a Socratic interviewer for Cauldron, an AI software development platform. Ask clarifying questions to understand the user's project goals, constraints, and success criteria.",
  holdout:
    'You are generating adversarial test scenarios for software. Your tests must be thorough, edge-case-aware, and designed to catch implementation shortcuts.',
  implementation:
    "You are a software implementation agent for Cauldron. Write production-quality code that satisfies the bead specification. Follow the project's coding conventions.",
  evaluation:
    'You are evaluating whether built software meets its stated goal. Assess goal attainment separately from spec compliance. Be critical and specific.',
};

export interface LLMGatewayOptions {
  db: DbClient;
  config: GatewayConfig;
  logger: Logger;
  projectSettings?: ProjectSettings;
}

export class LLMGateway {
  private readonly db: DbClient;
  private readonly config: GatewayConfig;
  private readonly logger: Logger;
  private readonly projectSettings: ProjectSettings | undefined;
  private readonly circuitBreaker = new CircuitBreaker();

  constructor(options: LLMGatewayOptions) {
    this.db = options.db;
    this.config = options.config;
    this.logger = options.logger;
    this.projectSettings = options.projectSettings;
  }

  /**
   * Validated factory method: constructs an LLMGateway and optionally validates
   * API keys for all configured provider families before returning.
   * Satisfies D-12: startup key validation at construction time.
   */
  static async create(
    options: LLMGatewayOptions & { validateKeys?: boolean }
  ): Promise<LLMGateway> {
    const gateway = new LLMGateway(options);
    if (options.validateKeys !== false) {
      const allModels = Object.values(options.config.models).flat();
      await validateProviderKeys(allModels, options.logger);
    }
    return gateway;
  }

  private resolveModelChain(stage: PipelineStage): string[] {
    const chain = this.projectSettings?.models?.[stage] ?? this.config.models[stage];
    if (!chain || chain.length === 0) {
      throw new Error(`No models configured for stage: ${stage}`);
    }
    return chain;
  }

  private buildSystemPrompt(stage: PipelineStage, callerSystem?: string): string {
    const preamble = STAGE_PREAMBLES[stage];
    return callerSystem ? `${preamble}\n\n${callerSystem}` : preamble;
  }

  private getImplementerFamily(): ProviderFamily {
    const chain = this.resolveModelChain('implementation');
    return getProviderFamily(chain[0]!);
  }

  private makeFailoverCallback(options: GatewayCallOptions) {
    return (attempt: FailoverAttempt) => {
      this.logger.warn({ ...attempt, stage: options.stage }, 'LLM gateway failover');
      this.recordFailoverEventAsync(options.projectId, options.stage, attempt);
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async streamText(options: GatewayCallOptions): Promise<any> {
    const budgetLimit = this.projectSettings?.budgetLimitCents ?? this.config.budget.defaultLimitCents;
    await checkBudget(this.db, options.projectId, budgetLimit);

    const modelChain = this.resolveModelChain(options.stage);
    const systemPrompt = this.buildSystemPrompt(options.stage, options.system);

    if (options.stage === 'holdout') {
      const implementerChain = this.resolveModelChain('implementation');
      enforceDiversity(modelChain[0]!, implementerChain[0]!);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = options.tools as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolChoice = options.toolChoice as any;

    return executeWithFailover({
      modelChain,
      stage: options.stage,
      circuitBreaker: this.circuitBreaker,
      implementerFamily: options.stage === 'holdout' ? this.getImplementerFamily() : undefined,
      execute: (model, modelId) => {
        const onFinish = ({ usage }: { usage: LanguageModelUsage }) => {
          this.recordUsageAsync(options, modelId, usage);
        };
        const common = { model, system: systemPrompt, tools, toolChoice, maxOutputTokens: options.maxTokens, temperature: options.temperature, maxRetries: 0 as const, onFinish };
        const result = options.messages && options.messages.length > 0
          ? aiStreamText({ ...common, messages: options.messages as ModelMessage[] })
          : aiStreamText({ ...common, prompt: options.prompt ?? '' });
        return Promise.resolve(result);
      },
      onFailover: this.makeFailoverCallback(options),
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async generateText(options: GatewayCallOptions): Promise<any> {
    const budgetLimit = this.projectSettings?.budgetLimitCents ?? this.config.budget.defaultLimitCents;
    await checkBudget(this.db, options.projectId, budgetLimit);

    const modelChain = this.resolveModelChain(options.stage);
    const systemPrompt = this.buildSystemPrompt(options.stage, options.system);

    if (options.stage === 'holdout') {
      const implementerChain = this.resolveModelChain('implementation');
      enforceDiversity(modelChain[0]!, implementerChain[0]!);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = options.tools as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolChoice = options.toolChoice as any;

    return executeWithFailover({
      modelChain,
      stage: options.stage,
      circuitBreaker: this.circuitBreaker,
      implementerFamily: options.stage === 'holdout' ? this.getImplementerFamily() : undefined,
      execute: async (model, modelId) => {
        const common = { model, system: systemPrompt, tools, toolChoice, maxOutputTokens: options.maxTokens, temperature: options.temperature, maxRetries: 0 as const };
        const result = options.messages && options.messages.length > 0
          ? await aiGenerateText({ ...common, messages: options.messages as ModelMessage[] })
          : await aiGenerateText({ ...common, prompt: options.prompt ?? '' });
        this.recordUsageAsync(options, modelId, result.usage);
        return result;
      },
      onFailover: this.makeFailoverCallback(options),
    });
  }

  async generateObject<T extends z.ZodType>(options: GatewayObjectOptions<T>) {
    const budgetLimit = this.projectSettings?.budgetLimitCents ?? this.config.budget.defaultLimitCents;
    await checkBudget(this.db, options.projectId, budgetLimit);

    const modelChain = this.resolveModelChain(options.stage);
    const systemPrompt = this.buildSystemPrompt(options.stage, options.system);

    if (options.stage === 'holdout') {
      const implementerChain = this.resolveModelChain('implementation');
      enforceDiversity(modelChain[0]!, implementerChain[0]!);
    }

    return executeWithFailover({
      modelChain,
      stage: options.stage,
      circuitBreaker: this.circuitBreaker,
      implementerFamily: options.stage === 'holdout' ? this.getImplementerFamily() : undefined,
      execute: async (model, modelId) => {
        const common = { model, schema: options.schema, schemaName: options.schemaName, schemaDescription: options.schemaDescription, system: systemPrompt, maxOutputTokens: options.maxTokens, temperature: options.temperature, maxRetries: 0 as const };
        const result = options.messages && options.messages.length > 0
          ? await aiGenerateObject({ ...common, messages: options.messages as ModelMessage[] })
          : await aiGenerateObject({ ...common, prompt: options.prompt ?? '' });
        this.recordUsageAsync(options, modelId, result.usage);
        return result;
      },
      onFailover: this.makeFailoverCallback(options),
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async streamObject<T extends z.ZodType>(options: GatewayObjectOptions<T>): Promise<any> {
    const budgetLimit = this.projectSettings?.budgetLimitCents ?? this.config.budget.defaultLimitCents;
    await checkBudget(this.db, options.projectId, budgetLimit);

    const modelChain = this.resolveModelChain(options.stage);
    const systemPrompt = this.buildSystemPrompt(options.stage, options.system);

    if (options.stage === 'holdout') {
      const implementerChain = this.resolveModelChain('implementation');
      enforceDiversity(modelChain[0]!, implementerChain[0]!);
    }

    return executeWithFailover({
      modelChain,
      stage: options.stage,
      circuitBreaker: this.circuitBreaker,
      implementerFamily: options.stage === 'holdout' ? this.getImplementerFamily() : undefined,
      execute: (model, modelId) => {
        const onFinish = ({ usage }: { usage: LanguageModelUsage }) => {
          this.recordUsageAsync(options, modelId, usage);
        };
        const common = { model, schema: options.schema, schemaName: options.schemaName, schemaDescription: options.schemaDescription, system: systemPrompt, maxOutputTokens: options.maxTokens, temperature: options.temperature, maxRetries: 0 as const, onFinish };
        const result = options.messages && options.messages.length > 0
          ? aiStreamObject({ ...common, messages: options.messages as ModelMessage[] })
          : aiStreamObject({ ...common, prompt: options.prompt ?? '' });
        return Promise.resolve(result);
      },
      onFailover: this.makeFailoverCallback(options),
    });
  }

  private recordUsageAsync(
    options: GatewayCallOptions,
    modelId: string,
    usage: LanguageModelUsage
  ): void {
    void this.writeUsage(options, modelId, usage).catch((err) =>
      this.logger.error({ err }, 'Failed to record LLM usage')
    );
  }

  private async writeUsage(
    options: GatewayCallOptions,
    modelId: string,
    usage: LanguageModelUsage
  ): Promise<void> {
    const promptTokens = usage.inputTokens ?? 0;
    const completionTokens = usage.outputTokens ?? 0;
    const costCents = calculateCostCents(modelId, promptTokens, completionTokens);

    await this.db.insert(llmUsage).values({
      projectId: options.projectId,
      beadId: options.beadId,
      evolutionCycle: options.evolutionCycle,
      stage: options.stage,
      model: modelId,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      costCents,
    });

    await appendEvent(this.db, {
      projectId: options.projectId,
      type: 'gateway_call_completed',
      payload: {
        stage: options.stage,
        model: modelId,
        promptTokens,
        completionTokens,
        costCents,
      },
    });
  }

  private recordFailoverEventAsync(
    projectId: string,
    stage: PipelineStage,
    attempt: FailoverAttempt
  ): void {
    void appendEvent(this.db, {
      projectId,
      type: 'gateway_failover',
      payload: {
        stage,
        fromModel: attempt.model,
        reason: attempt.error,
        statusCode: attempt.statusCode,
      },
    }).catch((err) => this.logger.error({ err }, 'Failed to record failover event'));
  }
}
