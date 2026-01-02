/**
 * AlterCode Core
 *
 * Main orchestrator that ties all layers together:
 * - Service initialization and lifecycle
 * - Request routing
 * - State management
 * - Event coordination
 */

import {
  IServiceContainer,
  IEventBus,
  ILogger,
  IFileSystem,
  ICache,
  IDatabase,
  IConfigManager,
  IProjectSnapshotService,
  ISemanticIndexService,
  IConventionExtractorService,
  IErrorMemoryService,
  ITokenBudgetService,
  IContextSelectorService,
  IProgressiveDisclosureService,
  IConversationCompressorService,
  IFileValidatorService,
  ISymbolResolverService,
  IAPICheckerService,
  IDependencyVerifierService,
  IVerificationPipelineService,
  IIntentParserService,
  IScopeGuardService,
  IPreflightCheckerService,
  IRollbackService,
  IImpactAnalyzerService,
  ITaskManager,
  IAgentPool,
  IMissionManager,
  IExecutionCoordinator,
  ILLMAdapter,
  // New service interfaces
  IQuotaTrackerService,
  IPerformanceMonitor,
  IAgentActivityService,
  IVirtualBranchService,
  IMergeEngineService,
  ISemanticAnalyzerService,
  IApprovalService,
  AlterCodeConfig,
  HiveState,
  Mission,
  MissionConfig,
  ExecutionPlan,
  ExecutionResult,
  UserIntent,
  FilePath,
  MissionId,
  AsyncResult,
  Ok,
  Err,
  AppError,
  CancellationToken,
  toFilePath,
  ServiceToken,
} from '../types';

import { createServiceToken } from '../infrastructure';

// Service tokens for DI
export const SERVICE_TOKENS = {
  Logger: createServiceToken<ILogger>('Logger'),
  EventBus: createServiceToken<IEventBus>('EventBus'),
  FileSystem: createServiceToken<IFileSystem>('FileSystem'),
  Cache: createServiceToken<ICache>('Cache'),
  Database: createServiceToken<IDatabase>('Database'),
  ConfigManager: createServiceToken<IConfigManager>('ConfigManager'),
  ProjectSnapshot: createServiceToken<IProjectSnapshotService>('ProjectSnapshot'),
  SemanticIndex: createServiceToken<ISemanticIndexService>('SemanticIndex'),
  ConventionExtractor: createServiceToken<IConventionExtractorService>('ConventionExtractor'),
  ErrorMemory: createServiceToken<IErrorMemoryService>('ErrorMemory'),
  TokenBudget: createServiceToken<ITokenBudgetService>('TokenBudget'),
  ContextSelector: createServiceToken<IContextSelectorService>('ContextSelector'),
  ProgressiveDisclosure: createServiceToken<IProgressiveDisclosureService>('ProgressiveDisclosure'),
  ConversationCompressor: createServiceToken<IConversationCompressorService>('ConversationCompressor'),
  FileValidator: createServiceToken<IFileValidatorService>('FileValidator'),
  SymbolResolver: createServiceToken<ISymbolResolverService>('SymbolResolver'),
  APIChecker: createServiceToken<IAPICheckerService>('APIChecker'),
  DependencyVerifier: createServiceToken<IDependencyVerifierService>('DependencyVerifier'),
  VerificationPipeline: createServiceToken<IVerificationPipelineService>('VerificationPipeline'),
  IntentParser: createServiceToken<IIntentParserService>('IntentParser'),
  ScopeGuard: createServiceToken<IScopeGuardService>('ScopeGuard'),
  PreflightChecker: createServiceToken<IPreflightCheckerService>('PreflightChecker'),
  Rollback: createServiceToken<IRollbackService>('Rollback'),
  ImpactAnalyzer: createServiceToken<IImpactAnalyzerService>('ImpactAnalyzer'),
  TaskManager: createServiceToken<ITaskManager>('TaskManager'),
  AgentPool: createServiceToken<IAgentPool>('AgentPool'),
  MissionManager: createServiceToken<IMissionManager>('MissionManager'),
  ExecutionCoordinator: createServiceToken<IExecutionCoordinator>('ExecutionCoordinator'),
  LLMAdapter: createServiceToken<ILLMAdapter>('LLMAdapter'),
  HierarchyModelRouter: createServiceToken<ILLMAdapter>('HierarchyModelRouter'),

  // New service tokens for migrated features
  QuotaTracker: createServiceToken<IQuotaTrackerService>('QuotaTracker'),
  PerformanceMonitor: createServiceToken<IPerformanceMonitor>('PerformanceMonitor'),
  AgentActivity: createServiceToken<IAgentActivityService>('AgentActivity'),
  VirtualBranch: createServiceToken<IVirtualBranchService>('VirtualBranch'),
  MergeEngine: createServiceToken<IMergeEngineService>('MergeEngine'),
  SemanticAnalyzer: createServiceToken<ISemanticAnalyzerService>('SemanticAnalyzer'),
  ApprovalService: createServiceToken<IApprovalService>('ApprovalService'),
};

/**
 * AlterCode Core implementation
 */
export class AlterCodeCore {
  private readonly container: IServiceContainer;
  private readonly config: AlterCodeConfig;
  private readonly logger: ILogger;
  private readonly eventBus: IEventBus;

  // Cached service references
  private missionManager!: IMissionManager;
  private executionCoordinator!: IExecutionCoordinator;
  private intentParser!: IIntentParserService;
  private semanticIndex!: ISemanticIndexService;
  private projectSnapshot!: IProjectSnapshotService;

  // New service references (optional - may not be available)
  private quotaTracker?: IQuotaTrackerService;
  private activityService?: IAgentActivityService;
  private approvalService?: IApprovalService;
  private branchService?: IVirtualBranchService;
  private mergeEngine?: IMergeEngineService;

  // State
  private initialized: boolean = false;
  private currentMission: Mission | null = null;

  constructor(container: IServiceContainer, config: AlterCodeConfig) {
    this.container = container;
    this.config = config;
    this.logger = container.resolve(SERVICE_TOKENS.Logger);
    this.eventBus = container.resolve(SERVICE_TOKENS.EventBus);
  }

  /**
   * Initialize the core
   */
  async initialize(): AsyncResult<void> {
    if (this.initialized) {
      return Ok(undefined);
    }

    this.logger.info('Initializing AlterCode Core', {
      projectRoot: this.config.projectRoot,
    });

    try {
      // Resolve core services
      this.missionManager = this.container.resolve(SERVICE_TOKENS.MissionManager);
      this.executionCoordinator = this.container.resolve(SERVICE_TOKENS.ExecutionCoordinator);
      this.intentParser = this.container.resolve(SERVICE_TOKENS.IntentParser);
      this.semanticIndex = this.container.resolve(SERVICE_TOKENS.SemanticIndex);
      this.projectSnapshot = this.container.resolve(SERVICE_TOKENS.ProjectSnapshot);

      // Resolve new services (optional - may fail if not registered)
      try {
        this.quotaTracker = this.container.resolve(SERVICE_TOKENS.QuotaTracker);
        this.logger.debug('QuotaTracker service resolved');
      } catch {
        this.logger.debug('QuotaTracker service not available');
      }

      try {
        this.activityService = this.container.resolve(SERVICE_TOKENS.AgentActivity);
        this.logger.debug('AgentActivity service resolved');
      } catch {
        this.logger.debug('AgentActivity service not available');
      }

      try {
        this.approvalService = this.container.resolve(SERVICE_TOKENS.ApprovalService);
        this.logger.debug('ApprovalService resolved');
      } catch {
        this.logger.debug('ApprovalService not available');
      }

      try {
        this.branchService = this.container.resolve(SERVICE_TOKENS.VirtualBranch);
        this.logger.debug('VirtualBranch service resolved');
      } catch {
        this.logger.debug('VirtualBranch service not available');
      }

      try {
        this.mergeEngine = this.container.resolve(SERVICE_TOKENS.MergeEngine);
        this.logger.debug('MergeEngine service resolved');
      } catch {
        this.logger.debug('MergeEngine service not available');
      }

      // Initialize quota tracker
      if (this.quotaTracker) {
        const quotaResult = await this.quotaTracker.initialize();
        if (!quotaResult.ok) {
          this.logger.warn('Quota tracker initialization failed', { error: quotaResult.error });
        }
      }

      // Initialize semantic index
      const indexResult = await this.semanticIndex.index(this.config.projectRoot);
      if (!indexResult.ok) {
        this.logger.warn('Initial indexing failed', { error: indexResult.error });
      }

      // Take initial snapshot
      const snapshotResult = await this.projectSnapshot.capture();
      if (!snapshotResult.ok) {
        this.logger.warn('Initial snapshot failed', { error: snapshotResult.error });
      }

      // Set up event handlers
      this.setupEventHandlers();

      this.initialized = true;
      this.logger.info('AlterCode Core initialized');

      await this.eventBus.emit('core:initialized', { config: this.config });

      return Ok(undefined);
    } catch (error) {
      this.logger.error('Initialization failed', error as Error);
      return Err(new AppError('CORE', `Initialization failed: ${(error as Error).message}`));
    }
  }

  /**
   * Process a user message
   */
  async processMessage(
    message: string,
    context?: { currentFile?: FilePath }
  ): AsyncResult<{ response: string; mission?: Mission }> {
    if (!this.initialized) {
      const initResult = await this.initialize();
      if (!initResult.ok) {
        return Err(initResult.error);
      }
    }

    this.logger.info('Processing message', { messageLength: message.length });

    try {
      // Parse intent
      const intent = this.intentParser.parse(message, context);

      await this.eventBus.emit('core:intentParsed', { intent });

      // Handle based on intent type
      switch (intent.type) {
        case 'query':
          return this.handleQuery(message, intent);

        case 'analyze':
          return this.handleAnalysis(message, intent);

        case 'create':
        case 'modify':
        case 'delete':
          return this.handleCodeChange(message, intent, context);

        default:
          return this.handleGeneral(message, intent);
      }
    } catch (error) {
      this.logger.error('Message processing failed', error as Error);
      return Err(new AppError('CORE', `Processing failed: ${(error as Error).message}`));
    }
  }

  /**
   * Stream a message response
   *
   * Yields stream chunks for real-time UI updates:
   * - text: Content tokens
   * - thinking: Extended thinking content
   * - tool_use: Tool call requests
   * - tool_result: Tool execution results
   * - usage: Token usage stats
   * - error: Error information
   * - done: Stream completion
   */
  async *streamMessage(
    message: string,
    options?: {
      currentFile?: FilePath;
      abortSignal?: AbortSignal;
      enableThinking?: boolean;
    }
  ): AsyncGenerator<import('./streaming').StreamChunk> {
    if (!this.initialized) {
      const initResult = await this.initialize();
      if (!initResult.ok) {
        yield {
          type: 'error',
          code: 'INIT_ERROR',
          message: initResult.error.message,
          retryable: true,
        };
        return;
      }
    }

    this.logger.info('Starting streaming message', { messageLength: message.length });

    try {
      // Get the LLM adapter
      const llmAdapter = this.container.resolve(SERVICE_TOKENS.LLMAdapter);

      // Parse intent for context
      const intent = this.intentParser.parse(message, { currentFile: options?.currentFile });
      await this.eventBus.emit('core:intentParsed', { intent });

      // Build the prompt with context
      const contextPrompt = await this.buildContextPrompt(message, intent, options?.currentFile);

      // Create the LLM request
      const request = {
        prompt: contextPrompt,
        systemPrompt: this.buildSystemPrompt(intent),
        maxTokens: 4096,
      };

      // Stream from the LLM adapter
      const stream = llmAdapter.stream(request);

      let totalContent = '';

      for await (const chunk of stream) {
        // Check for abort
        if (options?.abortSignal?.aborted) {
          yield { type: 'done' };
          return;
        }

        // Handle rate limits from the adapter
        if ('error' in chunk && (chunk as any).error?.includes('rate limit')) {
          const retryMatch = (chunk as any).error.match(/retry after (\d+)/i);
          const retryAfterMs = retryMatch ? parseInt(retryMatch[1], 10) * 1000 : 60000;

          yield {
            type: 'rate_limit',
            retryAfterMs,
            provider: 'claude',
          };

          // Wait and retry
          await this.delay(retryAfterMs);
          continue;
        }

        // Yield text content
        if (chunk.content) {
          totalContent += chunk.content;
          yield {
            type: 'text',
            content: chunk.content,
          };
        }

        // Yield usage on completion
        if (chunk.done && chunk.usage) {
          yield {
            type: 'usage',
            promptTokens: chunk.usage.promptTokens,
            completionTokens: chunk.usage.completionTokens,
            totalTokens: chunk.usage.totalTokens,
          };

          // Update quota tracker
          const quotaTracker = this.getOptionalService(SERVICE_TOKENS.QuotaTracker);
          if (quotaTracker) {
            quotaTracker.recordUsage('claude', 'lord', {
              inputTokens: chunk.usage.promptTokens,
              outputTokens: chunk.usage.completionTokens,
            });
          }
        }
      }

      // Emit completion event
      await this.eventBus.emit('core:streamCompleted', {
        contentLength: totalContent.length,
      });

      yield { type: 'done' };
    } catch (error) {
      this.logger.error('Stream message failed', error as Error);

      // Categorize the error
      const errorMessage = (error as Error).message.toLowerCase();
      let code = 'UNKNOWN_ERROR';
      let retryable = true;

      if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
        code = 'RATE_LIMIT';
      } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
        code = 'NETWORK_ERROR';
      } else if (errorMessage.includes('timeout')) {
        code = 'TIMEOUT';
        retryable = true;
      } else if (errorMessage.includes('token') && errorMessage.includes('limit')) {
        code = 'CONTEXT_OVERFLOW';
        retryable = false;
      } else if (errorMessage.includes('api') || errorMessage.includes('key')) {
        code = 'PROVIDER_ERROR';
        retryable = false;
      }

      yield {
        type: 'error',
        code,
        message: (error as Error).message,
        retryable,
      };
    }
  }

  /**
   * Build context-aware prompt for the LLM
   */
  private async buildContextPrompt(
    message: string,
    intent: UserIntent,
    currentFile?: FilePath
  ): Promise<string> {
    const parts: string[] = [];

    // Add current file context if available
    if (currentFile) {
      try {
        const fileSystem = this.container.resolve(SERVICE_TOKENS.FileSystem);
        const fileContent = await fileSystem.readFile(currentFile);
        parts.push(`Current file: ${currentFile}\n\`\`\`\n${fileContent}\n\`\`\``);
      } catch {
        // File not readable, skip
      }
    }

    // Add intent context - extract file targets
    const fileTargets = intent.targets.filter((t) => t.type === 'file');
    if (fileTargets.length > 0) {
      parts.push(`Target files: ${fileTargets.map((t) => t.name).join(', ')}`);
    }

    // Add the user message
    parts.push(`User request: ${message}`);

    return parts.join('\n\n');
  }

  /**
   * Build system prompt based on intent
   */
  private buildSystemPrompt(intent: UserIntent): string {
    const basePrompt = `You are AlterCode, an AI coding assistant focused on reliability and verification.
Your responses should be clear, accurate, and actionable.`;

    switch (intent.type) {
      case 'query':
        return `${basePrompt}\nYou are answering a question about code. Be concise and precise.`;
      case 'analyze':
        return `${basePrompt}\nYou are analyzing code. Identify issues, patterns, and suggest improvements.`;
      case 'create':
      case 'modify':
        return `${basePrompt}\nYou are helping write or modify code. Follow best practices and ensure correctness.`;
      default:
        return basePrompt;
    }
  }

  /**
   * Get optional service (returns undefined if not registered)
   */
  private getOptionalService<T>(token: ServiceToken<T>): T | undefined {
    try {
      return this.container.resolve(token);
    } catch {
      return undefined;
    }
  }

  /**
   * Delay helper for rate limit handling
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Create and start a mission
   */
  async createMission(config: MissionConfig): AsyncResult<Mission> {
    if (!this.initialized) {
      const initResult = await this.initialize();
      if (!initResult.ok) {
        return Err(initResult.error);
      }
    }

    this.logger.info('Creating mission', { title: config.title });

    const result = await this.missionManager.create(config);
    if (!result.ok) {
      return Err(result.error);
    }

    this.currentMission = result.value;

    await this.eventBus.emit('core:missionCreated', { mission: result.value });

    return Ok(result.value);
  }

  /**
   * Execute a mission plan
   */
  async executePlan(
    plan: ExecutionPlan,
    cancellation?: CancellationToken
  ): AsyncResult<ExecutionResult> {
    if (!this.initialized) {
      return Err(new AppError('CORE', 'Core not initialized'));
    }

    this.logger.info('Executing plan', {
      missionId: plan.missionId,
      taskCount: plan.tasks.length,
    });

    const result = await this.executionCoordinator.execute(plan, cancellation);

    if (result.ok) {
      await this.eventBus.emit('core:executionCompleted', { result: result.value });
    } else {
      await this.eventBus.emit('core:executionFailed', { error: result.error });
    }

    return result;
  }

  /**
   * Cancel current execution
   */
  async cancelExecution(): AsyncResult<void> {
    if (!this.currentMission) {
      return Err(new AppError('CORE', 'No active mission'));
    }

    return this.executionCoordinator.cancel(this.currentMission.id);
  }

  /**
   * Get current state
   */
  getState(): HiveState {
    const missionStats = this.missionManager?.getStats();
    const activeMissions = this.missionManager?.getActive() ?? [];

    const state: HiveState = {
      initialized: this.initialized,
      projectRoot: this.config.projectRoot,
      currentMission: this.currentMission,
      activeMissions,
      stats: {
        missions: missionStats ?? { total: 0, pending: 0, active: 0, completed: 0, failed: 0, cancelled: 0 },
      },
    };

    // Add quota status if tracker available
    if (this.quotaTracker) {
      const claudeStatus = this.quotaTracker.getStatus('claude');
      const claudeWindow = claudeStatus.currentWindow;
      state.quota = {
        claude: {
          status: claudeStatus.status,
          usageRatio: claudeStatus.usageRatio,
          timeUntilResetMs: claudeStatus.timeUntilResetMs,
          callCount: claudeWindow?.usage.callCount ?? 0,
          tokensSent: claudeWindow?.usage.tokensSent ?? 0,
          tokensReceived: claudeWindow?.usage.tokensReceived ?? 0,
          byLevel: claudeWindow?.usage.byLevel ?? {},
        },
      };

      // Add GLM status if available
      try {
        const glmStatus = this.quotaTracker.getStatus('glm');
        const glmWindow = glmStatus.currentWindow;
        state.quota.glm = {
          status: glmStatus.status,
          usageRatio: glmStatus.usageRatio,
          timeUntilResetMs: glmStatus.timeUntilResetMs,
          callCount: glmWindow?.usage.callCount ?? 0,
          tokensSent: glmWindow?.usage.tokensSent ?? 0,
          tokensReceived: glmWindow?.usage.tokensReceived ?? 0,
          byLevel: glmWindow?.usage.byLevel ?? {},
        };
      } catch {
        // GLM not tracked
      }

      // Add usage history
      const quotaService = this.quotaTracker as { getUsageHistory?: (provider: string) => unknown[] };
      if (quotaService.getUsageHistory) {
        state.usageHistory = {
          claude: quotaService.getUsageHistory('claude') ?? [],
          glm: quotaService.getUsageHistory('glm') ?? [],
        };
      }
    }

    // Add full activity entries if service available
    if (this.activityService) {
      const recentEntries = this.activityService.getRecentEntries(50);
      state.activities = recentEntries.map((e) => ({
        id: e.id as string,
        agentId: e.agentId as string,
        level: e.level,
        status: e.status,
        prompt: e.prompt,
        response: e.response,
        error: e.error,
        duration: e.duration,
        timestamp: e.timestamp,
        metrics: e.metrics,
      }));
      state.activity = {
        activeCount: this.activityService.getActiveCount(),
        recentEntries: state.activities.slice(0, 10),
      };
    }

    // Add full pending approvals if service available
    if (this.approvalService) {
      const approvals = this.approvalService.getPendingApprovals();
      state.pendingApprovals = approvals.map((a) => ({
        id: a.id as string,
        taskId: a.taskId as string,
        missionId: a.missionId as string,
        changes: a.changes,
        mode: a.mode,
        status: a.status,
        requestedAt: a.requestedAt,
      }));
    }

    // Add active branches count if service available
    if (this.branchService) {
      state.activeBranches = this.branchService.getActiveBranches().length;
    }

    // Add full conflicts if merge engine available
    if (this.mergeEngine) {
      const conflicts = this.mergeEngine.getActiveConflicts();
      state.conflicts = conflicts.map((c) => ({
        id: c.id as string,
        filePath: c.filePath as string,
        branch1: { agentId: c.branch1.agentId as string },
        branch2: { agentId: c.branch2.agentId as string },
        conflictingRegions: c.conflictingRegions,
      }));
      state.activeConflicts = conflicts.length;
    }

    // Add performance stats if monitor available
    if (this.performanceMonitor) {
      const perfStats = this.performanceMonitor.getStats();
      state.performance = {
        stats: perfStats.map((s) => ({
          name: s.name,
          count: s.count,
          totalMs: s.totalMs,
          avgMs: s.avgMs,
          minMs: s.minMs,
          maxMs: s.maxMs,
        })),
      };
    }

    // Add rollback points count to missions
    if (this.rollbackService && state.activeMissions) {
      state.activeMissions = state.activeMissions.map((m) => ({
        ...m,
        rollbackPoints: this.rollbackService?.getHistory(m.id as MissionId).length ?? 0,
      }));
    }

    return state;
  }

  /**
   * Get service from container
   */
  getService<T>(token: ServiceToken<T>): T {
    return this.container.resolve(token);
  }

  /**
   * Handle query intent
   */
  private async handleQuery(
    message: string,
    intent: UserIntent
  ): AsyncResult<{ response: string }> {
    // Search semantic index for relevant information
    const searchResults = this.semanticIndex.search(message, { limit: 10 });

    if (searchResults.length === 0) {
      return Ok({
        response: "I couldn't find relevant information in the codebase. Could you be more specific?",
      });
    }

    // Build response with search results
    const response = this.formatSearchResults(searchResults, message);
    return Ok({ response });
  }

  /**
   * Handle analysis intent
   */
  private async handleAnalysis(
    message: string,
    intent: UserIntent
  ): AsyncResult<{ response: string; mission?: Mission }> {
    // Create analysis mission
    const missionResult = await this.createMission({
      title: `Analysis: ${message.slice(0, 50)}...`,
      description: message,
      priority: 'normal',
      scope: {
        files: intent.targets.filter((t) => t.type === 'file').map((t) => t.name),
      },
    });

    if (!missionResult.ok) {
      return Ok({ response: `Failed to create analysis mission: ${missionResult.error.message}` });
    }

    return Ok({
      response: `I'll analyze this for you. Mission created: ${missionResult.value.id}`,
      mission: missionResult.value,
    });
  }

  /**
   * Handle code change intent
   */
  private async handleCodeChange(
    message: string,
    intent: UserIntent,
    context?: { currentFile?: FilePath }
  ): AsyncResult<{ response: string; mission?: Mission }> {
    // Create mission for code changes
    const missionResult = await this.createMission({
      title: `${intent.type}: ${message.slice(0, 50)}...`,
      description: message,
      priority: 'normal',
      scope: {
        files: intent.targets.filter((t) => t.type === 'file').map((t) => t.name),
      },
      constraints: intent.constraints.map((c) => ({
        type: c.type,
        value: c.value,
      })),
    });

    if (!missionResult.ok) {
      return Ok({ response: `Failed to create mission: ${missionResult.error.message}` });
    }

    const mission = missionResult.value;

    // Generate execution plan using Sovereign level agent
    const planResult = await this.generateExecutionPlan(mission, intent, context);
    if (!planResult.ok) {
      return Ok({
        response: `Mission created (${mission.id}) but planning failed: ${planResult.error.message}`,
        mission,
      });
    }

    // Execute the plan through the agent hierarchy
    const executionResult = await this.executePlan(planResult.value);
    if (!executionResult.ok) {
      return Ok({
        response: `Mission ${mission.id} execution failed: ${executionResult.error.message}. Changes have been rolled back.`,
        mission,
      });
    }

    // Return success with mission details
    const result = executionResult.value;
    const changesCount = result.changes?.length ?? 0;
    return Ok({
      response: `Mission completed successfully! ${changesCount} file(s) modified.${
        result.rollbackId ? ` Rollback ID: ${result.rollbackId}` : ''
      }`,
      mission,
    });
  }

  /**
   * Generate execution plan from mission using Sovereign-level agent
   * The Sovereign agent analyzes the mission and creates a structured plan
   * with tasks that will be executed by lower-level agents.
   */
  private async generateExecutionPlan(
    mission: Mission,
    intent: UserIntent,
    context?: { currentFile?: FilePath }
  ): AsyncResult<ExecutionPlan> {
    this.logger.info('Generating execution plan', { missionId: mission.id });

    try {
      // Get the LLM adapter (HierarchyModelRouter)
      const llmAdapter = this.container.resolve(SERVICE_TOKENS.LLMAdapter);

      // Set to Sovereign level for strategic planning
      if (typeof (llmAdapter as any).setHierarchyLevel === 'function') {
        (llmAdapter as any).setHierarchyLevel('sovereign');
      }

      // Build planning prompt for Sovereign agent
      const planningPrompt = this.buildPlanningPrompt(mission, intent, context);

      // Get plan from Sovereign agent
      const response = await llmAdapter.complete({
        prompt: planningPrompt,
        systemPrompt: `You are a Sovereign-level AI agent responsible for strategic mission planning.
Your task is to analyze the mission and break it down into executable tasks.

Respond with a JSON plan containing tasks. Each task should have:
- type: "analyze" | "plan" | "implement" | "review" | "test" | "fix"
- description: What needs to be done
- priority: "critical" | "high" | "normal" | "low"
- relevantFiles: Array of file paths relevant to this task

Return ONLY valid JSON in this format:
{
  "tasks": [
    { "type": "analyze", "description": "...", "priority": "high", "relevantFiles": [] },
    { "type": "implement", "description": "...", "priority": "normal", "relevantFiles": ["path/to/file.ts"] }
  ]
}`,
        maxTokens: 2048,
      });

      if (!response.ok) {
        return Err(response.error);
      }

      // Parse the plan from the response
      const planTasks = this.parsePlanFromResponse(response.value.content);

      const plan: ExecutionPlan = {
        missionId: mission.id,
        tasks: planTasks,
      };

      this.logger.info('Execution plan generated', {
        missionId: mission.id,
        taskCount: planTasks.length,
      });

      return Ok(plan);
    } catch (error) {
      this.logger.error('Plan generation failed', error as Error);
      return Err(new AppError('PLANNING', `Failed to generate plan: ${(error as Error).message}`));
    }
  }

  /**
   * Build the planning prompt for Sovereign agent
   */
  private buildPlanningPrompt(
    mission: Mission,
    intent: UserIntent,
    context?: { currentFile?: FilePath }
  ): string {
    const parts = [
      `# Mission: ${mission.title}`,
      ``,
      `## Description`,
      mission.description,
      ``,
      `## Intent Type: ${intent.type}`,
      ``,
    ];

    if (intent.targets.length > 0) {
      parts.push(`## Targets`);
      intent.targets.forEach((t) => parts.push(`- ${t.type}: ${t.name}`));
      parts.push(``);
    }

    if (intent.constraints.length > 0) {
      parts.push(`## Constraints`);
      intent.constraints.forEach((c) => parts.push(`- ${c.type}: ${c.value}`));
      parts.push(``);
    }

    if (context?.currentFile) {
      parts.push(`## Context`);
      parts.push(`Current file: ${context.currentFile}`);
      parts.push(``);
    }

    parts.push(`## Task`);
    parts.push(`Analyze this mission and create an execution plan with specific tasks.`);
    parts.push(`Break down the work into discrete steps that can be executed by worker agents.`);

    return parts.join('\n');
  }

  /**
   * Parse execution tasks from LLM response
   */
  private parsePlanFromResponse(content: string): ExecutionPlan['tasks'] {
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        this.logger.warn('No JSON found in plan response, using default task');
        return this.getDefaultTasks();
      }

      const parsed = JSON.parse(jsonMatch[0]);
      if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
        return this.getDefaultTasks();
      }

      // Validate and normalize tasks
      return parsed.tasks.map((task: any) => ({
        type: task.type || 'implement',
        description: task.description || 'Execute task',
        priority: task.priority || 'normal',
        relevantFiles: task.relevantFiles || [],
        prompt: task.prompt,
        dependencies: task.dependencies,
      }));
    } catch (error) {
      this.logger.warn('Failed to parse plan JSON', { error: (error as Error).message });
      return this.getDefaultTasks();
    }
  }

  /**
   * Get default tasks when plan parsing fails
   */
  private getDefaultTasks(): ExecutionPlan['tasks'] {
    return [
      {
        type: 'analyze',
        description: 'Analyze the codebase and understand current state',
        priority: 'high',
      },
      {
        type: 'implement',
        description: 'Implement the requested changes',
        priority: 'normal',
      },
      {
        type: 'review',
        description: 'Review changes for correctness and quality',
        priority: 'normal',
      },
    ];
  }

  /**
   * Handle general intent
   */
  private async handleGeneral(
    message: string,
    intent: UserIntent
  ): AsyncResult<{ response: string }> {
    // For general queries, provide helpful guidance
    return Ok({
      response: `I understand you want to "${message}". I can help you with:
- Analyzing code and finding patterns
- Creating or modifying files
- Refactoring and improving code quality
- Finding and fixing issues

What would you like me to do?`,
    });
  }

  /**
   * Format search results
   */
  private formatSearchResults(
    results: Array<{ symbol: any; score: number }>,
    query: string
  ): string {
    const lines: string[] = [`Found ${results.length} relevant items for "${query}":\n`];

    for (const result of results.slice(0, 5)) {
      const { symbol, score } = result;
      lines.push(`- **${symbol.name}** (${symbol.kind})`);
      lines.push(`  Location: ${symbol.location.file}:${symbol.location.line}`);
      if (symbol.documentation) {
        lines.push(`  ${symbol.documentation.slice(0, 100)}...`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Set up event handlers
   */
  private setupEventHandlers(): void {
    // Mission events
    this.eventBus.on('mission:completed', async (event) => {
      const { mission } = event as unknown as { mission: Mission };
      this.logger.info('Mission completed', { missionId: mission.id });
      if (this.currentMission?.id === mission.id) {
        this.currentMission = null;
      }
    });

    this.eventBus.on('mission:failed', async (event) => {
      const { mission, error } = event as unknown as { mission: Mission; error: Error };
      this.logger.error('Mission failed', error, { missionId: mission.id });
      if (this.currentMission?.id === mission.id) {
        this.currentMission = null;
      }
    });

    // Execution events
    this.eventBus.on('execution:warnings', async (event) => {
      const { warnings } = event as unknown as { warnings: string[] };
      this.logger.warn('Execution warnings', { count: warnings.length, warnings });
    });

    // Quota events
    this.eventBus.on('quota:warning', async (event) => {
      const { provider, usageRatio } = event as unknown as { provider: string; usageRatio: number };
      this.logger.warn('Quota warning', { provider, usageRatio: `${(usageRatio * 100).toFixed(1)}%` });
    });

    this.eventBus.on('quota:exceeded', async (event) => {
      const { provider } = event as unknown as { provider: string };
      this.logger.error('Quota exceeded', new Error(`${provider} quota exceeded`), { provider });
    });

    this.eventBus.on('quota:reset', async (event) => {
      const { provider } = event as unknown as { provider: string };
      this.logger.info('Quota reset', { provider });
    });

    // Approval events
    this.eventBus.on('approval:requested', async (event) => {
      const { approval } = event as unknown as { approval: { id: string; changes: unknown[] } };
      this.logger.info('Approval requested', {
        approvalId: approval.id,
        changeCount: approval.changes.length,
      });
    });

    this.eventBus.on('approval:responded', async (event) => {
      const { approvalId, result } = event as unknown as {
        approvalId: string;
        result: { approved: boolean; action?: string };
      };
      this.logger.info('Approval responded', {
        approvalId,
        approved: result.approved,
        action: result.action,
      });
    });

    // Branch events
    this.eventBus.on('branch:created', async (event) => {
      const { branchId, agentId } = event as unknown as { branchId: string; agentId: string };
      this.logger.debug('Virtual branch created', { branchId, agentId });
    });

    this.eventBus.on('branch:merged', async (event) => {
      const { branchId } = event as unknown as { branchId: string };
      this.logger.debug('Virtual branch merged', { branchId });
    });

    // Conflict events
    this.eventBus.on('conflict:detected', async (event) => {
      const { conflictId, filePath } = event as unknown as { conflictId: string; filePath: string };
      this.logger.warn('Conflict detected', { conflictId, filePath });
    });

    this.eventBus.on('conflict:resolved', async (event) => {
      const { conflictId, strategy } = event as unknown as { conflictId: string; strategy: string };
      this.logger.info('Conflict resolved', { conflictId, strategy });
    });
  }

  /**
   * Shutdown the core
   */
  async shutdown(): AsyncResult<void> {
    this.logger.info('Shutting down AlterCode Core');

    try {
      // Cancel any active mission
      if (this.currentMission) {
        await this.missionManager.cancel(this.currentMission.id, 'Core shutdown');
      }

      // Emit shutdown event
      await this.eventBus.emit('core:shutdown', {});

      this.initialized = false;
      this.logger.info('AlterCode Core shutdown complete');

      return Ok(undefined);
    } catch (error) {
      this.logger.error('Shutdown failed', error as Error);
      return Err(new AppError('CORE', `Shutdown failed: ${(error as Error).message}`));
    }
  }
}

/**
 * Create AlterCode Core instance
 */
export function createAlterCodeCore(
  container: IServiceContainer,
  config: AlterCodeConfig
): AlterCodeCore {
  return new AlterCodeCore(container, config);
}
