/**
 * Hierarchy Model Router
 *
 * Routes AI requests to appropriate models based on hierarchy level:
 * - Sovereign, Lord, Overlord → Claude Opus (strategic/tactical decisions)
 * - Worker → GLM-4.7 (code implementation tasks)
 *
 * Supports two Claude modes:
 * - API mode: Direct Anthropic API with API key
 * - CLI mode: Claude Code CLI tool
 *
 * Original design implementation:
 * - Non-Worker layers always use Opus for complex reasoning
 * - Worker layer uses GLM-4.7 for cost-effective code generation
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
} from '../types';
import { ClaudeAdapter } from './ClaudeAdapter';
import { ClaudeCodeAdapter } from './ClaudeCodeAdapter';
import { GLMAdapter } from './GLMAdapter';

/** Claude access mode */
export type ClaudeMode = 'api' | 'cli';

/**
 * Configuration for hierarchy-based model routing
 */
export interface HierarchyModelConfig {
  /** How to access Claude: 'api' for direct API, 'cli' for Claude Code */
  claudeMode: ClaudeMode;
  /** Claude API key (required if claudeMode is 'api') */
  claudeApiKey?: string;
  /** Claude Code CLI path (optional, default: 'claude') */
  claudeCliPath?: string;
  /** GLM API key for Worker level */
  glmApiKey: string;
  /** Enable fallback to GLM if Claude fails */
  enableFallback?: boolean;
  /** Working directory for Claude Code CLI */
  workingDirectory?: string;
}

/**
 * Hierarchy Model Router
 *
 * Automatically routes requests to the appropriate AI model based on
 * the hierarchy level of the requesting agent.
 *
 * Hierarchy → Model mapping:
 * - Sovereign → Claude Opus
 * - Lord → Claude Opus
 * - Overlord → Claude Opus
 * - Worker → GLM-4
 */
export class HierarchyModelRouter implements ILLMAdapter {
  private readonly config: HierarchyModelConfig;
  private readonly logger?: ILogger;
  private readonly claudeAdapter: ILLMAdapter;
  private readonly glmAdapter: ILLMAdapter;

  // Current context
  // Default to sovereign for chat (uses Claude Opus)
  private currentLevel: HierarchyLevel = 'sovereign';

  // Metrics
  private requestsByLevel: Record<HierarchyLevel, number> = {
    sovereign: 0,
    lord: 0,
    overlord: 0,
    worker: 0,
  };
  private fallbackCount: number = 0;

  constructor(config: HierarchyModelConfig, logger?: ILogger) {
    this.config = config;
    this.logger = logger?.child('HierarchyModelRouter');

    // Initialize Claude adapter based on mode
    if (config.claudeMode === 'cli') {
      this.claudeAdapter = new ClaudeCodeAdapter(
        {
          cliPath: config.claudeCliPath,
          workingDirectory: config.workingDirectory,
        },
        this.logger
      );
      this.logger?.info('Using Claude Code CLI for Opus');
    } else {
      if (!config.claudeApiKey) {
        throw new AppError('CONFIG', 'Claude API key required when claudeMode is "api"');
      }
      this.claudeAdapter = new ClaudeAdapter(
        config.claudeApiKey,
        { model: 'claude-opus-4-20250514' }, // Always Opus
        this.logger
      );
      this.logger?.info('Using Claude API for Opus');
    }

    // Initialize GLM adapter for Worker level
    this.glmAdapter = new GLMAdapter(
      config.glmApiKey,
      { model: 'glm-4.7' },
      this.logger
    );
    this.logger?.info('Using GLM-4.7 for Worker level');
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
   * Get the appropriate adapter for current hierarchy level
   */
  private getAdapter(): ILLMAdapter {
    // Worker uses GLM-4.7, all others use Claude Opus
    if (this.currentLevel === 'worker') {
      return this.glmAdapter;
    }
    return this.claudeAdapter;
  }

  /**
   * Get model name for current level
   */
  private getModelName(): string {
    if (this.currentLevel === 'worker') {
      return 'glm-4.7';
    }
    return 'claude-opus';
  }

  async complete(request: LLMRequest): AsyncResult<LLMResponse> {
    this.requestsByLevel[this.currentLevel]++;

    const modelName = this.getModelName();
    this.logger?.info('Routing completion request', {
      level: this.currentLevel,
      model: modelName,
      promptLength: request.prompt.length,
    });

    try {
      const adapter = this.getAdapter();
      const result = await adapter.complete(request);

      if (result.ok) {
        return result;
      }

      // Try fallback if enabled and not already using GLM
      if (this.config.enableFallback && this.currentLevel !== 'worker') {
        this.logger?.warn('Claude failed, falling back to GLM', {
          level: this.currentLevel,
          error: result.error,
        });

        this.fallbackCount++;
        return await this.glmAdapter.complete(request);
      }

      return result;
    } catch (error) {
      this.logger?.error('Completion routing failed', error as Error);

      // Try fallback on exception
      if (this.config.enableFallback && this.currentLevel !== 'worker') {
        this.logger?.warn('Claude threw exception, falling back to GLM');
        this.fallbackCount++;
        return await this.glmAdapter.complete(request);
      }

      return Err(new AppError('LLM', `Routing failed: ${(error as Error).message}`));
    }
  }

  async *stream(request: LLMRequest): AsyncGenerator<LLMStreamChunk> {
    this.requestsByLevel[this.currentLevel]++;

    const modelName = this.getModelName();
    this.logger?.info('Routing stream request', {
      level: this.currentLevel,
      model: modelName,
    });

    const adapter = this.getAdapter();
    yield* adapter.stream(request);
  }

  async completeWithTools(
    request: LLMRequest,
    tools: ToolDefinition[]
  ): AsyncResult<{ response: LLMResponse; toolCalls: ToolCall[] }> {
    this.requestsByLevel[this.currentLevel]++;

    const modelName = this.getModelName();
    this.logger?.info('Routing tool completion request', {
      level: this.currentLevel,
      model: modelName,
      toolCount: tools.length,
    });

    try {
      const adapter = this.getAdapter();
      const result = await adapter.completeWithTools(request, tools);

      if (result.ok) {
        return result;
      }

      // Try fallback if enabled and not already using GLM
      if (this.config.enableFallback && this.currentLevel !== 'worker') {
        this.logger?.warn('Claude tool completion failed, falling back to GLM', {
          level: this.currentLevel,
        });

        this.fallbackCount++;
        return await this.glmAdapter.completeWithTools(request, tools);
      }

      return result;
    } catch (error) {
      this.logger?.error('Tool completion routing failed', error as Error);

      if (this.config.enableFallback && this.currentLevel !== 'worker') {
        this.logger?.warn('Claude threw exception, falling back to GLM');
        this.fallbackCount++;
        return await this.glmAdapter.completeWithTools(request, tools);
      }

      return Err(new AppError('LLM', `Tool routing failed: ${(error as Error).message}`));
    }
  }

  getConfig(): LLMConfig {
    const adapter = this.getAdapter();
    return adapter.getConfig();
  }

  setConfig(config: Partial<LLMConfig>): void {
    this.claudeAdapter.setConfig(config);
    this.glmAdapter.setConfig(config);
  }

  /**
   * Get routing statistics
   */
  getStats(): {
    requestsByLevel: Record<HierarchyLevel, number>;
    fallbackCount: number;
    currentLevel: HierarchyLevel;
    currentModel: string;
    claudeMode: ClaudeMode;
  } {
    return {
      requestsByLevel: { ...this.requestsByLevel },
      fallbackCount: this.fallbackCount,
      currentLevel: this.currentLevel,
      currentModel: this.getModelName(),
      claudeMode: this.config.claudeMode,
    };
  }

  /**
   * Get Claude mode (api or cli)
   */
  getClaudeMode(): ClaudeMode {
    return this.config.claudeMode;
  }

  /**
   * Check if Claude Code CLI is available (only relevant in CLI mode)
   */
  async isClaudeCliAvailable(): Promise<boolean> {
    if (this.config.claudeMode !== 'cli') {
      return false;
    }
    return (this.claudeAdapter as ClaudeCodeAdapter).isAvailable();
  }

  /**
   * Get Claude adapter directly
   */
  getClaudeAdapter(): ILLMAdapter {
    return this.claudeAdapter;
  }

  /**
   * Get GLM adapter directly
   */
  getGLMAdapter(): ILLMAdapter {
    return this.glmAdapter;
  }
}

/**
 * Create a hierarchy model router with API mode
 */
export function createHierarchyModelRouter(
  config: HierarchyModelConfig,
  logger?: ILogger
): HierarchyModelRouter {
  return new HierarchyModelRouter(config, logger);
}

/**
 * Create a hierarchy model router with Claude API
 */
export function createApiModeRouter(
  claudeApiKey: string,
  glmApiKey: string,
  logger?: ILogger
): HierarchyModelRouter {
  return new HierarchyModelRouter(
    {
      claudeMode: 'api',
      claudeApiKey,
      glmApiKey,
      enableFallback: true,
    },
    logger
  );
}

/**
 * Create a hierarchy model router with Claude Code CLI
 */
export function createCliModeRouter(
  glmApiKey: string,
  claudeCliPath?: string,
  workingDirectory?: string,
  logger?: ILogger
): HierarchyModelRouter {
  return new HierarchyModelRouter(
    {
      claudeMode: 'cli',
      claudeCliPath,
      glmApiKey,
      enableFallback: true,
      workingDirectory,
    },
    logger
  );
}
