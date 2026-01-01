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
      state.quota = {
        claude: {
          status: claudeStatus.status,
          usageRatio: claudeStatus.usageRatio,
          timeUntilResetMs: claudeStatus.timeUntilResetMs,
        },
      };

      // Add GLM status if available
      try {
        const glmStatus = this.quotaTracker.getStatus('glm');
        state.quota.glm = {
          status: glmStatus.status,
          usageRatio: glmStatus.usageRatio,
          timeUntilResetMs: glmStatus.timeUntilResetMs,
        };
      } catch {
        // GLM not tracked
      }
    }

    // Add activity info if service available
    if (this.activityService) {
      const recentEntries = this.activityService.getRecentEntries(10);
      state.activity = {
        activeCount: this.activityService.getActiveCount(),
        recentEntries: recentEntries.map((e) => ({
          id: e.id as string,
          agentId: e.agentId as string,
          status: e.status,
          timestamp: e.timestamp,
        })),
      };
    }

    // Add pending approvals count if service available
    if (this.approvalService) {
      state.pendingApprovals = this.approvalService.getPendingApprovals().length;
    }

    // Add active branches count if service available
    if (this.branchService) {
      state.activeBranches = this.branchService.getActiveBranches().length;
    }

    // Add active conflicts count if merge engine available
    if (this.mergeEngine) {
      state.activeConflicts = this.mergeEngine.getActiveConflicts().length;
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

    // Return with mission for further execution
    return Ok({
      response: `I'll work on that. Mission created: ${missionResult.value.id}. Ready to plan the implementation.`,
      mission: missionResult.value,
    });
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
