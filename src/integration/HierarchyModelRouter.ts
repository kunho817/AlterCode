/**
 * Hierarchy Model Router
 *
 * Routes AI requests to appropriate models based on hierarchy level:
 * - Sovereign, Lord, Overlord → Claude Opus (strategic/tactical decisions)
 * - Worker → GLM-4 (code implementation tasks)
 *
 * This implements the original design where:
 * - Non-Worker layers use Opus for complex reasoning
 * - Worker layer uses GLM-4 for cost-effective code generation
 */

import {
  ILLMAdapter,
  LLMRequest,
  LLMResponse,
  LLMStreamChunk,
  LLMConfig,
  ToolDefinition,
  ToolCall,
  AsyncResult,
  Ok,
  Err,
  ILogger,
  AppError,
  HierarchyLevel,
  AIModel,
} from '../types';
import { ClaudeAdapter } from './ClaudeAdapter';
import { GLMAdapter } from './GLMAdapter';

/**
 * Configuration for hierarchy-based model routing
 */
export interface HierarchyModelConfig {
  /** Claude API key for Opus/Sonnet models */
  claudeApiKey: string;
  /** GLM API key for GLM-4 models */
  glmApiKey: string;
  /** Model to use for Sovereign level (default: claude-opus) */
  sovereignModel?: AIModel;
  /** Model to use for Lord level (default: claude-opus) */
  lordModel?: AIModel;
  /** Model to use for Overlord level (default: claude-sonnet) */
  overlordModel?: AIModel;
  /** Model to use for Worker level (default: glm-4) */
  workerModel?: AIModel;
  /** Fallback model if primary fails */
  fallbackModel?: AIModel;
  /** Enable fallback on error */
  enableFallback?: boolean;
}

/**
 * Model mapping for each hierarchy level
 */
const DEFAULT_HIERARCHY_MODELS: Record<HierarchyLevel, AIModel> = {
  sovereign: 'claude-opus',
  lord: 'claude-opus',
  overlord: 'claude-sonnet',
  worker: 'glm-4',
};

/**
 * Claude model name mapping
 */
const CLAUDE_MODEL_NAMES: Record<string, string> = {
  'claude-opus': 'claude-opus-4-20250514',
  'claude-sonnet': 'claude-sonnet-4-20250514',
  'claude-haiku': 'claude-haiku-3-20250307',
};

/**
 * Hierarchy Model Router
 *
 * Automatically routes requests to the appropriate AI model based on
 * the hierarchy level of the requesting agent.
 */
export class HierarchyModelRouter implements ILLMAdapter {
  private readonly config: Required<HierarchyModelConfig>;
  private readonly logger?: ILogger;
  private readonly adapters: Map<AIModel, ILLMAdapter> = new Map();
  private readonly hierarchyModels: Record<HierarchyLevel, AIModel>;

  // Current context
  private currentLevel: HierarchyLevel = 'worker';

  // Metrics
  private requestsByLevel: Record<HierarchyLevel, number> = {
    sovereign: 0,
    lord: 0,
    overlord: 0,
    worker: 0,
  };
  private fallbackCount: number = 0;

  constructor(config: HierarchyModelConfig, logger?: ILogger) {
    this.config = {
      ...config,
      sovereignModel: config.sovereignModel ?? DEFAULT_HIERARCHY_MODELS.sovereign,
      lordModel: config.lordModel ?? DEFAULT_HIERARCHY_MODELS.lord,
      overlordModel: config.overlordModel ?? DEFAULT_HIERARCHY_MODELS.overlord,
      workerModel: config.workerModel ?? DEFAULT_HIERARCHY_MODELS.worker,
      fallbackModel: config.fallbackModel ?? 'claude-sonnet',
      enableFallback: config.enableFallback ?? true,
    };

    this.hierarchyModels = {
      sovereign: this.config.sovereignModel,
      lord: this.config.lordModel,
      overlord: this.config.overlordModel,
      worker: this.config.workerModel,
    };

    this.logger = logger?.child('HierarchyModelRouter');
    this.initializeAdapters();
  }

  /**
   * Initialize adapters for each unique model
   */
  private initializeAdapters(): void {
    const uniqueModels = new Set<AIModel>([
      this.config.sovereignModel,
      this.config.lordModel,
      this.config.overlordModel,
      this.config.workerModel,
      this.config.fallbackModel,
    ]);

    for (const model of uniqueModels) {
      if (this.adapters.has(model)) continue;

      if (model.startsWith('claude-')) {
        const claudeModel = CLAUDE_MODEL_NAMES[model] ?? model;
        this.adapters.set(
          model,
          new ClaudeAdapter(this.config.claudeApiKey, { model: claudeModel }, this.logger)
        );
        this.logger?.debug('Initialized Claude adapter', { model: claudeModel });
      } else if (model.startsWith('glm-')) {
        this.adapters.set(
          model,
          new GLMAdapter(this.config.glmApiKey, { model }, this.logger)
        );
        this.logger?.debug('Initialized GLM adapter', { model });
      }
    }
  }

  /**
   * Set the current hierarchy level for routing
   */
  setHierarchyLevel(level: HierarchyLevel): void {
    this.currentLevel = level;
    this.logger?.debug('Hierarchy level set', { level });
  }

  /**
   * Get current hierarchy level
   */
  getHierarchyLevel(): HierarchyLevel {
    return this.currentLevel;
  }

  /**
   * Get the model for a specific hierarchy level
   */
  getModelForLevel(level: HierarchyLevel): AIModel {
    return this.hierarchyModels[level];
  }

  /**
   * Get the adapter for current hierarchy level
   */
  private getAdapter(): ILLMAdapter {
    const model = this.hierarchyModels[this.currentLevel];
    const adapter = this.adapters.get(model);

    if (!adapter) {
      throw new AppError('LLM', `No adapter available for model: ${model}`);
    }

    return adapter;
  }

  /**
   * Get fallback adapter
   */
  private getFallbackAdapter(): ILLMAdapter | null {
    if (!this.config.enableFallback) return null;

    const adapter = this.adapters.get(this.config.fallbackModel);
    return adapter ?? null;
  }

  async complete(request: LLMRequest): AsyncResult<LLMResponse> {
    this.requestsByLevel[this.currentLevel]++;

    const model = this.hierarchyModels[this.currentLevel];
    this.logger?.info('Routing completion request', {
      level: this.currentLevel,
      model,
      promptLength: request.prompt.length,
    });

    try {
      const adapter = this.getAdapter();
      const result = await adapter.complete(request);

      if (result.ok) {
        return result;
      }

      // Try fallback if enabled
      if (this.config.enableFallback) {
        this.logger?.warn('Primary model failed, trying fallback', {
          primaryModel: model,
          fallbackModel: this.config.fallbackModel,
          error: result.error,
        });

        const fallbackAdapter = this.getFallbackAdapter();
        if (fallbackAdapter) {
          this.fallbackCount++;
          return await fallbackAdapter.complete(request);
        }
      }

      return result;
    } catch (error) {
      this.logger?.error('Completion routing failed', error as Error);
      return Err(new AppError('LLM', `Routing failed: ${(error as Error).message}`));
    }
  }

  async *stream(request: LLMRequest): AsyncGenerator<LLMStreamChunk> {
    this.requestsByLevel[this.currentLevel]++;

    const model = this.hierarchyModels[this.currentLevel];
    this.logger?.info('Routing stream request', {
      level: this.currentLevel,
      model,
    });

    const adapter = this.getAdapter();
    yield* adapter.stream(request);
  }

  async completeWithTools(
    request: LLMRequest,
    tools: ToolDefinition[]
  ): AsyncResult<{ response: LLMResponse; toolCalls: ToolCall[] }> {
    this.requestsByLevel[this.currentLevel]++;

    const model = this.hierarchyModels[this.currentLevel];
    this.logger?.info('Routing tool completion request', {
      level: this.currentLevel,
      model,
      toolCount: tools.length,
    });

    try {
      const adapter = this.getAdapter();
      const result = await adapter.completeWithTools(request, tools);

      if (result.ok) {
        return result;
      }

      // Try fallback if enabled
      if (this.config.enableFallback) {
        this.logger?.warn('Primary model failed for tools, trying fallback', {
          primaryModel: model,
          fallbackModel: this.config.fallbackModel,
        });

        const fallbackAdapter = this.getFallbackAdapter();
        if (fallbackAdapter) {
          this.fallbackCount++;
          return await fallbackAdapter.completeWithTools(request, tools);
        }
      }

      return result;
    } catch (error) {
      this.logger?.error('Tool completion routing failed', error as Error);
      return Err(new AppError('LLM', `Tool routing failed: ${(error as Error).message}`));
    }
  }

  getConfig(): LLMConfig {
    const adapter = this.getAdapter();
    return adapter.getConfig();
  }

  setConfig(config: Partial<LLMConfig>): void {
    // Apply config to all adapters
    for (const adapter of this.adapters.values()) {
      adapter.setConfig(config);
    }
  }

  /**
   * Get routing statistics
   */
  getStats(): {
    requestsByLevel: Record<HierarchyLevel, number>;
    fallbackCount: number;
    currentLevel: HierarchyLevel;
    currentModel: AIModel;
  } {
    return {
      requestsByLevel: { ...this.requestsByLevel },
      fallbackCount: this.fallbackCount,
      currentLevel: this.currentLevel,
      currentModel: this.hierarchyModels[this.currentLevel],
    };
  }

  /**
   * Update model for a specific hierarchy level
   */
  updateLevelModel(level: HierarchyLevel, model: AIModel): void {
    this.hierarchyModels[level] = model;

    // Ensure adapter exists for new model
    if (!this.adapters.has(model)) {
      if (model.startsWith('claude-')) {
        const claudeModel = CLAUDE_MODEL_NAMES[model] ?? model;
        this.adapters.set(
          model,
          new ClaudeAdapter(this.config.claudeApiKey, { model: claudeModel }, this.logger)
        );
      } else if (model.startsWith('glm-')) {
        this.adapters.set(
          model,
          new GLMAdapter(this.config.glmApiKey, { model }, this.logger)
        );
      }
    }

    this.logger?.info('Level model updated', { level, model });
  }

  /**
   * Check if a specific model is available
   */
  async isModelAvailable(model: AIModel): Promise<boolean> {
    const adapter = this.adapters.get(model);
    if (!adapter) return false;

    try {
      // Try a minimal request to check availability
      const result = await adapter.complete({
        prompt: 'Hello',
        maxTokens: 5,
      });
      return result.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get all configured adapters
   */
  getAdapters(): Map<AIModel, ILLMAdapter> {
    return new Map(this.adapters);
  }
}

/**
 * Create a hierarchy model router
 */
export function createHierarchyModelRouter(
  config: HierarchyModelConfig,
  logger?: ILogger
): HierarchyModelRouter {
  return new HierarchyModelRouter(config, logger);
}

/**
 * Create a router with default configuration
 */
export function createDefaultHierarchyRouter(
  claudeApiKey: string,
  glmApiKey: string,
  logger?: ILogger
): HierarchyModelRouter {
  return new HierarchyModelRouter(
    {
      claudeApiKey,
      glmApiKey,
      sovereignModel: 'claude-opus',
      lordModel: 'claude-opus',
      overlordModel: 'claude-sonnet',
      workerModel: 'glm-4',
      fallbackModel: 'claude-sonnet',
      enableFallback: true,
    },
    logger
  );
}
