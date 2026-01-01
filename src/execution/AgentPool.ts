/**
 * Agent Pool
 *
 * Manages a pool of AI agents for task execution:
 * - Agent lifecycle management
 * - Load balancing
 * - Rate limiting and quota management
 * - Agent health monitoring
 */

import {
  IAgentPoolService,
  PoolAgent,
  AgentId,
  AgentStatus,
  AgentRequest,
  AgentResponse,
  ILLMAdapter,
  ITokenBudgetService,
  IEventBus,
  AsyncResult,
  Ok,
  Err,
  ILogger,
  AppError,
  toAgentId,
  CancellationToken,
  isOk,
} from '../types';

/** Maximum agents in pool */
const MAX_AGENTS = 5;

/** Agent idle timeout (30 seconds) */
const AGENT_IDLE_TIMEOUT = 30 * 1000;

/** Request timeout (2 minutes) */
const REQUEST_TIMEOUT = 2 * 60 * 1000;

/**
 * Agent Pool implementation
 */
export class AgentPool implements IAgentPoolService {
  private readonly llmAdapter: ILLMAdapter;
  private readonly tokenBudget: ITokenBudgetService;
  private readonly eventBus: IEventBus;
  private readonly logger?: ILogger;

  // Agent storage
  private agents: Map<string, PoolAgent> = new Map();

  // Request queue
  private requestQueue: Array<{
    request: AgentRequest;
    resolve: (result: AgentResponse) => void;
    reject: (error: Error) => void;
    cancellation?: CancellationToken;
  }> = [];

  // Rate limiting
  private requestsInFlight: number = 0;
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 100; // ms between requests

  constructor(
    llmAdapter: ILLMAdapter,
    tokenBudget: ITokenBudgetService,
    eventBus: IEventBus,
    logger?: ILogger
  ) {
    this.llmAdapter = llmAdapter;
    this.tokenBudget = tokenBudget;
    this.eventBus = eventBus;
    this.logger = logger?.child('AgentPool');

    // Start processing loop
    this.startProcessingLoop();
  }

  async acquire(): AsyncResult<PoolAgent> {
    // Try to find an idle agent
    const idleAgent = this.findIdleAgent();
    if (idleAgent) {
      idleAgent.status = 'busy';
      idleAgent.lastActiveAt = new Date();
      return Ok(idleAgent);
    }

    // Create new agent if under limit
    if (this.agents.size < MAX_AGENTS) {
      const agent = this.createAgent();
      agent.status = 'busy';
      return Ok(agent);
    }

    // No agents available
    return Err(new AppError('AGENT', 'No agents available'));
  }

  async release(agentId: AgentId): AsyncResult<void> {
    const agent = this.agents.get(agentId as string);

    if (!agent) {
      return Err(new AppError('AGENT', `Agent not found: ${agentId}`));
    }

    agent.status = 'idle';
    agent.lastActiveAt = new Date();

    this.logger?.debug('Agent released', { agentId });

    // Process queued requests
    await this.processQueue();

    return Ok(undefined);
  }

  async execute(
    request: AgentRequest,
    cancellation?: CancellationToken
  ): Promise<AgentResponse> {
    return new Promise((resolve, reject) => {
      // Check cancellation
      if (cancellation?.isCancelled) {
        reject(new AppError('CANCELLED', 'Request cancelled'));
        return;
      }

      // Add to queue
      this.requestQueue.push({
        request,
        resolve,
        reject,
        cancellation,
      });

      // Set timeout
      setTimeout(() => {
        const index = this.requestQueue.findIndex((r) => r.request === request);
        if (index >= 0) {
          this.requestQueue.splice(index, 1);
          reject(new AppError('TIMEOUT', 'Request timed out'));
        }
      }, REQUEST_TIMEOUT);

      // Trigger processing
      this.processQueue();
    });
  }

  getStatus(agentId: AgentId): AgentStatus | undefined {
    return this.agents.get(agentId as string)?.status;
  }

  getAll(): PoolAgent[] {
    return Array.from(this.agents.values());
  }

  getAvailableCount(): number {
    return Array.from(this.agents.values()).filter((a) => a.status === 'idle').length;
  }

  /**
   * Find an idle agent
   */
  private findIdleAgent(): PoolAgent | undefined {
    for (const agent of this.agents.values()) {
      if (agent.status === 'idle') {
        return agent;
      }
    }
    return undefined;
  }

  /**
   * Create a new agent
   */
  private createAgent(): PoolAgent {
    const agentId = this.generateAgentId();

    const agent: PoolAgent = {
      id: agentId,
      status: 'idle',
      createdAt: new Date(),
      lastActiveAt: new Date(),
      requestCount: 0,
      tokenCount: 0,
      errorCount: 0,
    };

    this.agents.set(agentId as string, agent);

    this.logger?.info('Agent created', { agentId });

    return agent;
  }

  /**
   * Process request queue
   */
  private async processQueue(): Promise<void> {
    while (this.requestQueue.length > 0) {
      // Check rate limiting
      const now = Date.now();
      if (now - this.lastRequestTime < this.minRequestInterval) {
        await this.delay(this.minRequestInterval - (now - this.lastRequestTime));
      }

      // Get an agent
      const agentResult = await this.acquire();
      if (!agentResult.ok) {
        break; // No agents available
      }

      const agent = agentResult.value;

      // Get next request
      const queued = this.requestQueue.shift();
      if (!queued) {
        await this.release(agent.id);
        break;
      }

      // Check cancellation
      if (queued.cancellation?.isCancelled) {
        queued.reject(new AppError('CANCELLED', 'Request cancelled'));
        await this.release(agent.id);
        continue;
      }

      // Execute request
      this.lastRequestTime = Date.now();
      this.requestsInFlight++;

      try {
        const response = await this.executeRequest(agent, queued.request);
        queued.resolve(response);
      } catch (error) {
        agent.errorCount++;
        queued.reject(error as Error);
      } finally {
        this.requestsInFlight--;
        await this.release(agent.id);
      }
    }
  }

  /**
   * Execute a request with an agent
   */
  private async executeRequest(agent: PoolAgent, request: AgentRequest): Promise<AgentResponse> {
    const startTime = Date.now();

    this.logger?.debug('Executing request', {
      agentId: agent.id,
      type: request.type,
    });

    // Check token budget
    const estimatedTokens = this.estimateTokens(request);
    if (this.tokenBudget.canAllocate && !this.tokenBudget.canAllocate('agent', estimatedTokens)) {
      throw new AppError('QUOTA', 'Token budget exceeded');
    }

    try {
      // Build prompt
      const prompt = this.buildPrompt(request);

      // Call LLM
      const llmResult = await this.llmAdapter.complete({
        prompt,
        maxTokens: request.maxTokens ?? 4096,
        temperature: request.temperature ?? 0.7,
        stopSequences: request.stopSequences,
      });

      // Handle Result type
      if (!llmResult.ok) {
        throw new AppError('LLM_ERROR', llmResult.error?.message ?? 'LLM request failed');
      }
      const llmResponse = llmResult.value;

      // Update agent stats
      agent.requestCount++;
      agent.tokenCount += llmResponse.usage?.totalTokens ?? 0;
      agent.lastActiveAt = new Date();

      // Build response
      const response: AgentResponse = {
        content: llmResponse.content,
        agentId: agent.id,
        requestId: request.id,
        duration: Date.now() - startTime,
        tokenUsage: {
          prompt: llmResponse.usage?.promptTokens ?? 0,
          completion: llmResponse.usage?.completionTokens ?? 0,
          total: llmResponse.usage?.totalTokens ?? 0,
        },
        metadata: {
          model: llmResponse.model,
          finishReason: llmResponse.finishReason,
        },
      };

      this.logger?.debug('Request completed', {
        agentId: agent.id,
        duration: response.duration,
        tokens: response.tokenUsage?.total,
      });

      await this.eventBus.emit('agent:response', { agent, response });

      return response;
    } catch (error) {
      this.logger?.error('Request failed', error as Error, { agentId: agent.id });
      throw error;
    }
  }

  /**
   * Build prompt from request
   */
  private buildPrompt(request: AgentRequest): string {
    const parts: string[] = [];

    // System context
    if (request.systemContext) {
      parts.push(`<system>\n${request.systemContext}\n</system>`);
    }

    // Context - handle both array and ContextSelection formats
    if (request.context) {
      if (Array.isArray(request.context)) {
        if (request.context.length > 0) {
          parts.push('<context>');
          for (const ctx of request.context) {
            parts.push(`<${ctx.type} path="${ctx.path ?? ''}">`);
            parts.push(ctx.content);
            parts.push(`</${ctx.type}>`);
          }
          parts.push('</context>');
        }
      } else {
        // ContextSelection object - serialize files
        const selection = request.context;
        if (selection.files && selection.files.length > 0) {
          parts.push('<context>');
          for (const file of selection.files) {
            parts.push(`<file path="${file.path}">`);
            parts.push(file.content);
            parts.push('</file>');
          }
          parts.push('</context>');
        }
      }
    }

    // Task
    parts.push('<task>');
    parts.push(request.prompt);
    parts.push('</task>');

    return parts.join('\n\n');
  }

  /**
   * Estimate token count for a request
   */
  private estimateTokens(request: AgentRequest): number {
    let text = request.prompt;

    if (request.systemContext) {
      text += request.systemContext;
    }

    if (request.context) {
      if (Array.isArray(request.context)) {
        for (const ctx of request.context) {
          text += ctx.content;
        }
      } else {
        // ContextSelection
        for (const file of request.context.files || []) {
          text += file.content;
        }
      }
    }

    // Rough estimate: ~4 chars per token + response buffer
    return Math.ceil(text.length / 4) + (request.maxTokens ?? 4096);
  }

  /**
   * Generate unique agent ID
   */
  private generateAgentId(): AgentId {
    return toAgentId(`agent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  }

  /**
   * Start background processing loop
   */
  private startProcessingLoop(): void {
    setInterval(() => {
      this.cleanupIdleAgents();
    }, AGENT_IDLE_TIMEOUT);
  }

  /**
   * Cleanup idle agents
   */
  private cleanupIdleAgents(): void {
    const now = Date.now();

    for (const [id, agent] of this.agents) {
      if (
        agent.status === 'idle' &&
        now - agent.lastActiveAt.getTime() > AGENT_IDLE_TIMEOUT &&
        this.agents.size > 1 // Keep at least one agent
      ) {
        this.agents.delete(id);
        this.logger?.debug('Removed idle agent', { agentId: id });
      }
    }
  }

  /**
   * Delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    totalAgents: number;
    idleAgents: number;
    busyAgents: number;
    queueLength: number;
    totalRequests: number;
    totalTokens: number;
    totalErrors: number;
  } {
    const agents = Array.from(this.agents.values());

    return {
      totalAgents: agents.length,
      idleAgents: agents.filter((a) => a.status === 'idle').length,
      busyAgents: agents.filter((a) => a.status === 'busy').length,
      queueLength: this.requestQueue.length,
      totalRequests: agents.reduce((sum, a) => sum + a.requestCount, 0),
      totalTokens: agents.reduce((sum, a) => sum + a.tokenCount, 0),
      totalErrors: agents.reduce((sum, a) => sum + a.errorCount, 0),
    };
  }

  /**
   * Set rate limiting parameters
   */
  setRateLimit(requestsPerSecond: number): void {
    this.minRequestInterval = 1000 / requestsPerSecond;
    this.logger?.info('Rate limit set', { requestsPerSecond });
  }

  /**
   * Shutdown pool
   */
  async shutdown(): Promise<void> {
    // Reject all queued requests
    for (const queued of this.requestQueue) {
      queued.reject(new AppError('SHUTDOWN', 'Agent pool shutting down'));
    }
    this.requestQueue = [];

    // Clear agents
    this.agents.clear();

    this.logger?.info('Agent pool shutdown complete');
  }
}

/**
 * Create an agent pool
 */
export function createAgentPool(
  llmAdapter: ILLMAdapter,
  tokenBudget: ITokenBudgetService,
  eventBus: IEventBus,
  logger?: ILogger
): IAgentPoolService {
  return new AgentPool(llmAdapter, tokenBudget, eventBus, logger);
}
