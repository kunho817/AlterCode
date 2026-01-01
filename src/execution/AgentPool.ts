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
  // New service interfaces
  IQuotaTrackerService,
  IAgentActivityService,
  IVirtualBranchService,
  ActivityEntryId,
  HierarchyLevel,
  TaskId,
  MissionId,
} from '../types';

/** Maximum agents in pool */
const MAX_AGENTS = 5;

/** Agent idle timeout (30 seconds) */
const AGENT_IDLE_TIMEOUT = 30 * 1000;

/** Request timeout (2 minutes) */
const REQUEST_TIMEOUT = 2 * 60 * 1000;

/**
 * Agent Pool configuration
 */
export interface AgentPoolConfig {
  /** Maximum agents in pool (default: 5) */
  readonly maxAgents?: number;
  /** Agent idle timeout in ms (default: 30000) */
  readonly idleTimeoutMs?: number;
  /** Request timeout in ms (default: 120000) */
  readonly requestTimeoutMs?: number;
  /** Min interval between requests in ms (default: 100) */
  readonly minRequestIntervalMs?: number;
}

const DEFAULT_POOL_CONFIG: Required<AgentPoolConfig> = {
  maxAgents: MAX_AGENTS,
  idleTimeoutMs: AGENT_IDLE_TIMEOUT,
  requestTimeoutMs: REQUEST_TIMEOUT,
  minRequestIntervalMs: 100,
};

/**
 * Agent Pool implementation
 */
export class AgentPool implements IAgentPoolService {
  private readonly llmAdapter: ILLMAdapter;
  private readonly tokenBudget: ITokenBudgetService;
  private readonly eventBus: IEventBus;
  private readonly logger?: ILogger;
  private readonly config: Required<AgentPoolConfig>;

  // New integrated services (optional for backward compatibility)
  private readonly quotaTracker?: IQuotaTrackerService;
  private readonly activityService?: IAgentActivityService;
  private readonly branchService?: IVirtualBranchService;

  // Agent storage
  private agents: Map<string, PoolAgent> = new Map();

  // Request queue
  private requestQueue: Array<{
    request: AgentRequest;
    resolve: (result: AgentResponse) => void;
    reject: (error: Error) => void;
    cancellation?: CancellationToken;
    activityEntryId?: ActivityEntryId;
  }> = [];

  // Rate limiting
  private requestsInFlight: number = 0;
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 100; // ms between requests

  constructor(
    llmAdapter: ILLMAdapter,
    tokenBudget: ITokenBudgetService,
    eventBus: IEventBus,
    logger?: ILogger,
    options?: {
      config?: AgentPoolConfig;
      quotaTracker?: IQuotaTrackerService;
      activityService?: IAgentActivityService;
      branchService?: IVirtualBranchService;
    }
  ) {
    this.llmAdapter = llmAdapter;
    this.tokenBudget = tokenBudget;
    this.eventBus = eventBus;
    this.logger = logger?.child('AgentPool');
    this.config = { ...DEFAULT_POOL_CONFIG, ...options?.config };

    // New services (optional)
    this.quotaTracker = options?.quotaTracker;
    this.activityService = options?.activityService;
    this.branchService = options?.branchService;

    this.minRequestInterval = this.config.minRequestIntervalMs;

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
    if (this.agents.size < this.config.maxAgents) {
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
    // Check quota before queuing (if quota tracker available)
    if (this.quotaTracker && !this.quotaTracker.canExecute('claude')) {
      throw new AppError('QUOTA_EXCEEDED', 'API quota exceeded. Please wait for quota reset.');
    }

    return new Promise((resolve, reject) => {
      // Check cancellation
      if (cancellation?.isCancelled) {
        reject(new AppError('CANCELLED', 'Request cancelled'));
        return;
      }

      // Record activity start (if activity service available)
      let activityEntryId: ActivityEntryId | undefined;
      if (this.activityService && request.task) {
        const agentId = request.agentId ?? this.generateAgentId();
        activityEntryId = this.activityService.recordStart(
          request.task.missionId,
          agentId,
          request.task.id,
          request.prompt.substring(0, 500) // Truncate for storage
        );
      }

      // Add to queue
      this.requestQueue.push({
        request,
        resolve,
        reject,
        cancellation,
        activityEntryId,
      });

      // Set timeout
      setTimeout(() => {
        const index = this.requestQueue.findIndex((r) => r.request === request);
        if (index >= 0) {
          const removed = this.requestQueue.splice(index, 1)[0];

          // Record activity failure on timeout
          if (removed?.activityEntryId && this.activityService) {
            this.activityService.recordFailure(removed.activityEntryId, 'Request timed out');
          }

          reject(new AppError('TIMEOUT', 'Request timed out'));
        }
      }, this.config.requestTimeoutMs);

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
        // Record activity failure on cancellation
        if (queued.activityEntryId && this.activityService) {
          this.activityService.recordFailure(queued.activityEntryId, 'Request cancelled');
        }
        queued.reject(new AppError('CANCELLED', 'Request cancelled'));
        await this.release(agent.id);
        continue;
      }

      // Create virtual branch for this task if branch service available
      if (this.branchService && queued.request.task) {
        const existingBranch = this.branchService.getBranchForAgent(agent.id);
        if (!existingBranch) {
          await this.branchService.createBranch(agent.id, queued.request.task.id);
        }
      }

      // Execute request
      this.lastRequestTime = Date.now();
      this.requestsInFlight++;

      try {
        const response = await this.executeRequest(agent, queued.request, queued.activityEntryId);
        queued.resolve(response);
      } catch (error) {
        agent.errorCount++;

        // Record activity failure
        if (queued.activityEntryId && this.activityService) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.activityService.recordFailure(queued.activityEntryId, errorMessage);
        }

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
  private async executeRequest(
    agent: PoolAgent,
    request: AgentRequest,
    activityEntryId?: ActivityEntryId
  ): Promise<AgentResponse> {
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

      const duration = Date.now() - startTime;
      const promptTokens = llmResponse.usage?.promptTokens ?? 0;
      const completionTokens = llmResponse.usage?.completionTokens ?? 0;
      const totalTokens = llmResponse.usage?.totalTokens ?? 0;

      // Record quota usage (if quota tracker available)
      if (this.quotaTracker && request.task?.level) {
        this.quotaTracker.recordUsage('claude', request.task.level, {
          sent: promptTokens,
          received: completionTokens,
        });
      }

      // Record activity completion (if activity service available)
      if (activityEntryId && this.activityService) {
        this.activityService.recordComplete(activityEntryId, llmResponse.content, {
          durationMs: duration,
          tokensSent: promptTokens,
          tokensReceived: completionTokens,
        });
      }

      // Build response
      const response: AgentResponse = {
        content: llmResponse.content,
        agentId: agent.id,
        requestId: request.id,
        duration,
        tokenUsage: {
          prompt: promptTokens,
          completion: completionTokens,
          total: totalTokens,
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
    }, this.config.idleTimeoutMs);
  }

  /**
   * Cleanup idle agents
   */
  private cleanupIdleAgents(): void {
    const now = Date.now();

    for (const [id, agent] of this.agents) {
      if (
        agent.status === 'idle' &&
        now - agent.lastActiveAt.getTime() > this.config.idleTimeoutMs &&
        this.agents.size > 1 // Keep at least one agent
      ) {
        // Abandon virtual branch if exists
        if (this.branchService) {
          const branch = this.branchService.getBranchForAgent(agent.id);
          if (branch) {
            this.branchService.abandonBranch(branch.id);
          }
        }

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
  logger?: ILogger,
  options?: {
    config?: AgentPoolConfig;
    quotaTracker?: IQuotaTrackerService;
    activityService?: IAgentActivityService;
    branchService?: IVirtualBranchService;
  }
): IAgentPoolService {
  return new AgentPool(llmAdapter, tokenBudget, eventBus, logger, options);
}
