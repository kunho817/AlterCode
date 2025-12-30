/**
 * Agent Pool
 *
 * Manages AI agent instances for Claude Code and GLM-4.7.
 */

import {
  AIModel,
  AIProvider,
  AgentRequest,
  AgentResponse,
  AlterCodeConfig,
  HierarchyLevel,
} from '../types';
import { ClaudeAgent } from './claude/ClaudeAgent';
import { GLMAgent } from './glm/GLMAgent';
import { QuotaTracker } from '../quota/QuotaTracker';
import { Logger } from '../utils/Logger';

/**
 * AI Agent interface.
 */
export interface AIAgent {
  id: string;
  provider: AIProvider;
  model: AIModel;
  execute(request: AgentRequest): Promise<AgentResponse>;
  cancel(): void;
}

/**
 * Manages AI agent instances.
 */
export class AgentPool {
  private readonly config: AlterCodeConfig;
  private readonly quotaTracker: QuotaTracker;
  private readonly logger: Logger;

  private claudeAgent: ClaudeAgent | null = null;
  private glmAgent: GLMAgent | null = null;

  private activeRequests: Map<string, { agent: AIAgent; cancel: () => void }>;

  constructor(config: AlterCodeConfig, quotaTracker: QuotaTracker) {
    this.config = config;
    this.quotaTracker = quotaTracker;
    this.logger = new Logger('AgentPool');
    this.activeRequests = new Map();
  }

  /**
   * Initialize agent pool.
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing agent pool...');

    // Initialize Claude agent
    this.claudeAgent = new ClaudeAgent(this.config.claude);

    // Initialize GLM agent (if configured)
    if (this.isGLMAvailable()) {
      this.glmAgent = new GLMAgent(this.config.glm);
      this.logger.info('GLM agent initialized - Workers will use GLM-4.7');
    } else {
      this.logger.info('GLM not configured - Workers will use Claude (set altercode.glm.apiKey to enable GLM)');
    }

    this.logger.info('Agent pool initialized');
  }

  /**
   * Dispose agent pool.
   */
  async dispose(): Promise<void> {
    this.logger.info('Disposing agent pool...');

    // Cancel all active requests
    for (const [requestId, { cancel }] of this.activeRequests) {
      cancel();
      this.activeRequests.delete(requestId);
    }

    this.claudeAgent = null;
    this.glmAgent = null;

    this.logger.info('Agent pool disposed');
  }

  /**
   * Execute a request with the appropriate agent based on hierarchy level.
   */
  async execute(
    request: AgentRequest,
    level: HierarchyLevel,
    agentId: string
  ): Promise<AgentResponse> {
    console.log('[AgentPool] execute called, level:', level, 'agentId:', agentId);

    // Determine which model to use
    const model = this.getModelForLevel(level);
    const provider = this.getProviderForModel(model);
    console.log('[AgentPool] Using model:', model, 'provider:', provider);

    // Check quota
    if (!this.quotaTracker.canExecute(provider)) {
      throw new Error(`Quota exceeded for ${provider}`);
    }

    // Get agent
    const agent = this.getAgentForProvider(provider);
    if (!agent) {
      throw new Error(`No agent available for ${provider}`);
    }

    this.logger.debug(
      `Executing request ${request.taskId} with ${provider} (Level ${level})`
    );

    // Track active request
    let cancelled = false;
    const cancelFn = () => {
      cancelled = true;
      agent.cancel();
    };
    this.activeRequests.set(request.taskId, { agent, cancel: cancelFn });

    try {
      // Execute request
      const response = await agent.execute(request);

      // Record usage
      this.quotaTracker.recordUsage(provider, level, {
        tokensSent: response.metrics.tokensSent,
        tokensReceived: response.metrics.tokensReceived,
      });

      return response;
    } catch (error) {
      if (cancelled) {
        throw new Error('Request cancelled');
      }
      throw error;
    } finally {
      this.activeRequests.delete(request.taskId);
    }
  }

  /**
   * Execute with a specific model.
   */
  async executeWithModel(
    request: AgentRequest,
    model: AIModel,
    level: HierarchyLevel
  ): Promise<AgentResponse> {
    const provider = this.getProviderForModel(model);

    if (!this.quotaTracker.canExecute(provider)) {
      throw new Error(`Quota exceeded for ${provider}`);
    }

    const agent = this.getAgentForProvider(provider);
    if (!agent) {
      throw new Error(`No agent available for ${provider}`);
    }

    const response = await agent.execute(request);

    this.quotaTracker.recordUsage(provider, level, {
      tokensSent: response.metrics.tokensSent,
      tokensReceived: response.metrics.tokensReceived,
    });

    return response;
  }

  /**
   * Cancel a request.
   */
  cancelRequest(taskId: string): void {
    const request = this.activeRequests.get(taskId);
    if (request) {
      request.cancel();
      this.activeRequests.delete(taskId);
    }
  }

  /**
   * Get the model for a hierarchy level.
   */
  getModelForLevel(level: HierarchyLevel): AIModel {
    switch (level) {
      case HierarchyLevel.SOVEREIGN:
      case HierarchyLevel.ARCHITECT:
      case HierarchyLevel.STRATEGIST:
      case HierarchyLevel.TEAM_LEAD:
        return AIModel.CLAUDE_OPUS;
      case HierarchyLevel.SPECIALIST:
        // Specialists can use either model based on task complexity
        // This is determined by the caller
        return AIModel.CLAUDE_OPUS;
      case HierarchyLevel.WORKER:
        // Use GLM if configured, otherwise fallback to Claude
        return this.isGLMAvailable() ? AIModel.GLM_4_7 : AIModel.CLAUDE_OPUS;
      default:
        return this.isGLMAvailable() ? AIModel.GLM_4_7 : AIModel.CLAUDE_OPUS;
    }
  }

  /**
   * Check if GLM is available (has API key configured).
   */
  private isGLMAvailable(): boolean {
    return this.config.glm.apiKey.length > 0;
  }

  /**
   * Get the provider for a model.
   */
  getProviderForModel(model: AIModel): AIProvider {
    switch (model) {
      case AIModel.CLAUDE_OPUS:
        return 'claude';
      case AIModel.GLM_4_7:
        return 'glm';
      default:
        return 'glm';
    }
  }

  /**
   * Get agent for a provider.
   */
  private getAgentForProvider(provider: AIProvider): AIAgent | null {
    switch (provider) {
      case 'claude':
        return this.claudeAgent;
      case 'glm':
        return this.glmAgent;
      default:
        return null;
    }
  }
}
