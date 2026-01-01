/**
 * Execution Coordinator
 *
 * Coordinates execution across all components:
 * - Orchestrates mission phases
 * - Manages task execution flow
 * - Handles agent coordination
 * - Integrates verification and rollback
 */

import {
  IExecutionCoordinatorService,
  IMissionManagerService,
  ITaskManagerService,
  IAgentPoolService,
  IPreflightService,
  IVerificationPipelineService,
  IRollbackService,
  IImpactAnalyzerService,
  IContextSelectorService,
  IEventBus,
  ExecutionPlan,
  ExecutionResult,
  ExecutionProgress,
  ExecutionTaskConfig,
  TaskOutput,
  Mission,
  MissionId,
  Task,
  TaskId,
  FileChange,
  AsyncResult,
  Ok,
  Err,
  ILogger,
  AppError,
  CancellationToken,
  Disposable,
  toFilePath,
  // New service interfaces for integration
  IApprovalService,
  ApprovalMode,
  IVirtualBranchService,
  IMergeEngineService,
  VirtualBranchId,
} from '../types';

/** Maximum retries per task */
const MAX_TASK_RETRIES = 3;

/** Delay between phase transitions (ms) */
const PHASE_TRANSITION_DELAY = 100;

/**
 * Execution Coordinator configuration
 */
export interface ExecutionCoordinatorConfig {
  /** Default approval mode (default: 'step_by_step') */
  readonly defaultApprovalMode?: ApprovalMode;
  /** Skip approval for certain task types */
  readonly skipApprovalFor?: string[];
}

const DEFAULT_COORDINATOR_CONFIG: Required<ExecutionCoordinatorConfig> = {
  defaultApprovalMode: 'step_by_step',
  skipApprovalFor: ['analyze', 'query'],
};

/**
 * Execution Coordinator implementation
 */
export class ExecutionCoordinator implements IExecutionCoordinatorService {
  private readonly missionManager: IMissionManagerService;
  private readonly taskManager: ITaskManagerService;
  private readonly agentPool: IAgentPoolService;
  private readonly preflightChecker: IPreflightService;
  private readonly verificationPipeline: IVerificationPipelineService;
  private readonly rollbackService: IRollbackService;
  private readonly impactAnalyzer: IImpactAnalyzerService;
  private readonly contextSelector: IContextSelectorService;
  private readonly eventBus: IEventBus;
  private readonly logger?: ILogger;
  private readonly config: Required<ExecutionCoordinatorConfig>;

  // Optional: Approval service for change approval workflow
  private readonly approvalService?: IApprovalService;

  // Optional: Virtual branch service for change isolation
  private readonly branchService?: IVirtualBranchService;

  // Optional: Merge engine for conflict detection and resolution
  private readonly mergeEngine?: IMergeEngineService;

  // Track branches created for this execution
  private readonly executionBranches: Map<string, VirtualBranchId[]> = new Map();

  // Active executions
  private activeExecutions: Map<string, {
    missionId: MissionId;
    cancellation: CancellationToken;
    plan: ExecutionPlan;
    progress: ExecutionProgress;
  }> = new Map();

  // Progress handlers
  private progressHandlers: Set<(progress: ExecutionProgress) => void> = new Set();

  constructor(
    missionManager: IMissionManagerService,
    taskManager: ITaskManagerService,
    agentPool: IAgentPoolService,
    preflightChecker: IPreflightService,
    verificationPipeline: IVerificationPipelineService,
    rollbackService: IRollbackService,
    impactAnalyzer: IImpactAnalyzerService,
    contextSelector: IContextSelectorService,
    eventBus: IEventBus,
    logger?: ILogger,
    options?: {
      config?: ExecutionCoordinatorConfig;
      approvalService?: IApprovalService;
      branchService?: IVirtualBranchService;
      mergeEngine?: IMergeEngineService;
    }
  ) {
    this.missionManager = missionManager;
    this.taskManager = taskManager;
    this.agentPool = agentPool;
    this.preflightChecker = preflightChecker;
    this.verificationPipeline = verificationPipeline;
    this.rollbackService = rollbackService;
    this.impactAnalyzer = impactAnalyzer;
    this.contextSelector = contextSelector;
    this.eventBus = eventBus;
    this.logger = logger?.child('ExecutionCoordinator');
    this.config = { ...DEFAULT_COORDINATOR_CONFIG, ...options?.config };
    this.approvalService = options?.approvalService;
    this.branchService = options?.branchService;
    this.mergeEngine = options?.mergeEngine;

    // Set up event listeners
    this.setupEventListeners();
  }

  async execute(
    plan: ExecutionPlan,
    cancellation?: CancellationToken
  ): AsyncResult<ExecutionResult> {
    const startTime = Date.now();
    const executionId = this.generateExecutionId();

    this.logger?.info('Starting execution', {
      executionId,
      missionId: plan.missionId,
      taskCount: plan.tasks.length,
    });

    // Create cancellation token if not provided
    const cancel = cancellation ?? this.createCancellationToken();

    // Initial progress
    const progress: ExecutionProgress = {
      missionId: plan.missionId,
      phase: 'planning',
      tasksCompleted: 0,
      tasksTotal: plan.tasks.length,
      message: 'Starting execution',
      timestamp: new Date(),
    };

    // Store active execution
    this.activeExecutions.set(executionId, {
      missionId: plan.missionId,
      cancellation: cancel,
      plan,
      progress,
    });

    // Notify progress handlers
    this.notifyProgress(progress);

    try {
      // Start mission
      const startResult = await this.missionManager.start(plan.missionId);
      if (!startResult.ok) {
        return Err(startResult.error);
      }

      // Phase 1: Planning
      if (cancel.isCancelled) {
        return this.handleCancellation(executionId, plan.missionId);
      }
      await this.executePlanningPhase(plan, cancel);

      // Phase 2: Validation
      if (cancel.isCancelled) {
        return this.handleCancellation(executionId, plan.missionId);
      }
      const validationResult = await this.executeValidationPhase(plan, cancel);
      if (!validationResult.ok) {
        await this.missionManager.fail(plan.missionId, validationResult.error.message);
        return Err(validationResult.error);
      }

      // Phase 3: Execution
      if (cancel.isCancelled) {
        return this.handleCancellation(executionId, plan.missionId);
      }
      const executionResult = await this.executeExecutionPhase(plan, cancel, executionId);
      if (!executionResult.ok) {
        // Rollback on failure
        await this.handleExecutionFailure(plan.missionId, executionId);
        return Err(executionResult.error);
      }

      // Phase 4: Merge (conflict detection and resolution)
      if (cancel.isCancelled) {
        return this.handleCancellation(executionId, plan.missionId);
      }
      const mergeResult = await this.executeMergePhase(executionId, plan.missionId, cancel);
      if (!mergeResult.ok) {
        // Rollback on merge failure
        await this.handleMergeFailure(plan.missionId, executionId);
        return Err(mergeResult.error);
      }

      // Phase 5: Verification
      if (cancel.isCancelled) {
        return this.handleCancellation(executionId, plan.missionId);
      }
      const verificationResult = await this.executeVerificationPhase(plan, cancel);
      if (!verificationResult.ok) {
        // Rollback on verification failure
        await this.handleVerificationFailure(plan.missionId, executionId);
        return Err(verificationResult.error);
      }

      // Phase 6: Completion
      await this.missionManager.complete(plan.missionId);

      const result: ExecutionResult = {
        success: true,
        missionId: plan.missionId,
        duration: Date.now() - startTime,
        tasksCompleted: plan.tasks.length,
        changes: executionResult.value.changes,
        verification: verificationResult.value as import('../types').VerificationResult,
      };

      this.logger?.info('Execution completed', {
        executionId,
        missionId: plan.missionId,
        duration: result.duration,
      });

      return Ok(result);
    } catch (error) {
      this.logger?.error('Execution failed', error as Error, { executionId });
      await this.missionManager.fail(plan.missionId, (error as Error).message);
      return Err(new AppError('EXECUTION', (error as Error).message));
    } finally {
      this.activeExecutions.delete(executionId);
    }
  }

  async cancel(missionId: MissionId): AsyncResult<void> {
    // Find active execution
    for (const [id, execution] of this.activeExecutions) {
      if (execution.missionId === missionId) {
        execution.cancellation.cancel?.();
        await this.missionManager.cancel(missionId, 'Execution cancelled by user');
        this.activeExecutions.delete(id);
        return Ok(undefined);
      }
    }

    return Err(new AppError('EXECUTION', `No active execution for mission: ${missionId}`));
  }

  getStatus(missionId: MissionId): 'idle' | 'running' | 'paused' {
    for (const execution of this.activeExecutions.values()) {
      if (execution.missionId === missionId) {
        return 'running';
      }
    }
    return 'idle';
  }

  /**
   * Execute planning phase
   */
  private async executePlanningPhase(
    plan: ExecutionPlan,
    cancellation: CancellationToken
  ): Promise<void> {
    this.logger?.debug('Executing planning phase', { missionId: plan.missionId });

    // Analyze impact
    if (plan.changes && plan.changes.length > 0) {
      const impactResult = await this.impactAnalyzer.analyze(plan.changes);
      if (impactResult.ok) {
        await this.eventBus.emit('execution:impactAnalyzed', {
          missionId: plan.missionId,
          analysis: impactResult.value,
        });
      }
    }

    await this.missionManager.advancePhase(plan.missionId);
    await this.delay(PHASE_TRANSITION_DELAY);
  }

  /**
   * Execute validation phase
   */
  private async executeValidationPhase(
    plan: ExecutionPlan,
    cancellation: CancellationToken
  ): AsyncResult<void> {
    this.logger?.debug('Executing validation phase', { missionId: plan.missionId });

    if (plan.changes && plan.changes.length > 0) {
      // Run preflight checks
      const preflightResult = await this.preflightChecker.check({
        changes: plan.changes,
        missionId: plan.missionId,
      });

      if (!preflightResult.ok) {
        return Err(preflightResult.error);
      }

      if (!preflightResult.value.canProceed) {
        return Err(new AppError(
          'VALIDATION',
          `Preflight failed: ${preflightResult.value.errors.join(', ')}`
        ));
      }

      // Emit warnings
      if (preflightResult.value.warnings.length > 0) {
        await this.eventBus.emit('execution:warnings', {
          missionId: plan.missionId,
          warnings: preflightResult.value.warnings,
        });
      }
    }

    await this.missionManager.advancePhase(plan.missionId);
    await this.delay(PHASE_TRANSITION_DELAY);

    return Ok(undefined);
  }

  /**
   * Execute execution phase
   */
  private async executeExecutionPhase(
    plan: ExecutionPlan,
    cancellation: CancellationToken,
    executionId: string
  ): AsyncResult<{ changes: FileChange[] }> {
    this.logger?.debug('Executing execution phase', { missionId: plan.missionId });

    const executedChanges: FileChange[] = [];
    const branchIds: VirtualBranchId[] = [];

    // Create backup point
    if (plan.changes && plan.changes.length > 0) {
      const paths = plan.changes.map((c) => toFilePath(c.path));
      await this.rollbackService.backup(paths, plan.missionId);
    }

    // Execute tasks
    for (const taskConfig of plan.tasks) {
      if (cancellation.isCancelled) {
        return Err(new AppError('CANCELLED', 'Execution cancelled'));
      }

      const taskResult = await this.executeTaskInternal(
        plan.missionId,
        taskConfig,
        cancellation,
        branchIds
      );
      if (!taskResult.ok) {
        return Err(taskResult.error);
      }

      // Collect changes from task
      if (taskResult.value.changes) {
        executedChanges.push(...taskResult.value.changes);
      }
    }

    // Store branches for this execution
    if (branchIds.length > 0) {
      this.executionBranches.set(executionId, branchIds);
    }

    // Request approval for changes (if approval service available and changes exist)
    if (this.approvalService && executedChanges.length > 0) {
      const approvalResult = await this.requestApprovalForChanges(
        plan.missionId,
        executedChanges
      );

      if (!approvalResult.ok) {
        return Err(approvalResult.error);
      }

      // Handle approval result
      if (!approvalResult.value.approved) {
        return Err(new AppError('APPROVAL_REJECTED', 'Changes rejected by user'));
      }

      // If modifications were made, use the modified changes
      if (approvalResult.value.modifications) {
        executedChanges.length = 0;
        executedChanges.push(...this.convertToFileChanges(approvalResult.value.modifications));
      }
    }

    await this.missionManager.advancePhase(plan.missionId);
    await this.delay(PHASE_TRANSITION_DELAY);

    return Ok({ changes: executedChanges });
  }

  /**
   * Request approval for file changes
   */
  private async requestApprovalForChanges(
    missionId: MissionId,
    changes: FileChange[]
  ): AsyncResult<import('../types').ApprovalResult> {
    if (!this.approvalService) {
      // No approval service - auto-approve
      return Ok({
        approved: true,
        mode: 'full_automation' as ApprovalMode,
        automatic: true,
      });
    }

    this.logger?.info('Requesting approval for changes', {
      missionId,
      changeCount: changes.length,
    });

    // Convert FileChange to conflict.FileChange format
    const conflictChanges: import('../types/conflict').FileChange[] = changes.map((c) => ({
      filePath: c.path as import('../types').FilePath,
      originalContent: null,
      modifiedContent: c.content ?? '',
      diff: '',
      changeType: c.type === 'write' ? 'create' as const : 'modify' as const,
    }));

    // Create a pseudo-task for approval
    const pseudoTask = {
      id: `approval-${missionId}` as import('../types').TaskId,
      missionId,
      type: 'approval' as import('../types').TaskType,
      status: 'pending' as import('../types').TaskStatus,
      priority: 'normal' as import('../types').TaskPriority,
      description: `Approve ${changes.length} file change(s)`,
      dependencies: [],
      createdAt: new Date(),
    };

    return this.approvalService.requestApproval(pseudoTask, conflictChanges);
  }

  /**
   * Convert conflict FileChange back to execution FileChange
   */
  private convertToFileChanges(modifications: import('../types/conflict').FileChange[]): FileChange[] {
    return modifications.map((m) => ({
      path: m.filePath,
      type: m.changeType === 'create' ? 'write' as const : 'modify' as const,
      content: m.modifiedContent,
    }));
  }

  /**
   * Execute a task (public interface method)
   */
  async executeTask(task: Task, token?: CancellationToken): AsyncResult<TaskOutput> {
    const startTime = Date.now();
    const cancellation = token ?? this.createCancellationToken();

    try {
      // Select context
      const contextResult = await this.contextSelector.select({
        query: task.description,
        budget: 8000,
      });

      // Execute with agent
      const response = await this.agentPool.execute(
        {
          id: task.id as string,
          type: task.type,
          prompt: task.description,
          context: contextResult.ok ? contextResult.value.items : [],
          systemContext: this.buildSystemContext(task),
        },
        cancellation
      );

      // Return task output
      return Ok({
        response: response.content,
        artifacts: [],
        metrics: {
          tokensUsed: (response.tokenUsage?.total ?? 0) as import('../types').TokenCount,
          processingTime: Date.now() - startTime,
        },
        success: true,
      });
    } catch (error) {
      return Err(new AppError('TASK', (error as Error).message));
    }
  }

  /**
   * Execute a single task (internal method for execution phase)
   */
  private async executeTaskInternal(
    missionId: MissionId,
    taskConfig: ExecutionPlan['tasks'][0],
    cancellation: CancellationToken,
    branchIds: VirtualBranchId[]
  ): AsyncResult<{ changes?: FileChange[] }> {
    // Create task
    const createResult = await this.taskManager.create(missionId, {
      type: taskConfig.type,
      description: taskConfig.description,
      priority: taskConfig.priority,
      dependencies: taskConfig.dependencies,
    });

    if (!createResult.ok) {
      return Err(createResult.error);
    }

    const task = createResult.value;
    let retries = 0;

    // Create virtual branch for this task (if branch service available)
    let branchId: VirtualBranchId | undefined;
    if (this.branchService) {
      const agentId = `agent-${task.id}` as import('../types').AgentId;
      const branchResult = await this.branchService.createBranch(agentId, task.id);
      if (branchResult.ok) {
        branchId = branchResult.value.id;
        branchIds.push(branchId);
        this.logger?.debug('Created virtual branch for task', {
          taskId: task.id,
          branchId,
        });
      }
    }

    while (retries < MAX_TASK_RETRIES) {
      if (cancellation.isCancelled) {
        return Err(new AppError('CANCELLED', 'Task cancelled'));
      }

      // Start task
      const startResult = await this.taskManager.start(task.id);
      if (!startResult.ok) {
        retries++;
        continue;
      }

      // Select context for task
      const contextResult = await this.contextSelector.select({
        query: taskConfig.description,
        budget: taskConfig.tokenBudget ?? 8000,
        priorityFiles: taskConfig.relevantFiles,
      });

      // Execute with agent
      try {
        const response = await this.agentPool.execute(
          {
            id: task.id as string,
            type: taskConfig.type,
            task, // Pass the task for proper tracking
            prompt: taskConfig.prompt ?? taskConfig.description,
            context: contextResult.ok ? contextResult.value.items : [],
            systemContext: this.buildSystemContext(task),
            maxTokens: taskConfig.maxTokens,
          },
          cancellation
        );

        // Parse response for changes
        const changes = this.parseChangesFromResponse(response.content);

        // Record changes to virtual branch (if available)
        if (branchId && this.branchService && changes.length > 0) {
          for (const change of changes) {
            const conflictChange: import('../types/conflict').FileChange = {
              filePath: change.path as import('../types').FilePath,
              originalContent: null,
              modifiedContent: change.content ?? '',
              diff: '',
              changeType: change.type === 'write' ? 'create' : 'modify',
            };
            this.branchService.recordChange(branchId, conflictChange);
          }
          this.logger?.debug('Recorded changes to virtual branch', {
            branchId,
            changeCount: changes.length,
          });
        }

        // Complete task
        await this.taskManager.complete(task.id, {
          success: true,
          output: response.content,
          duration: response.duration,
        });

        await this.missionManager.taskCompleted(missionId, task.id);

        return Ok({ changes });
      } catch (error) {
        retries++;

        if (retries >= MAX_TASK_RETRIES) {
          await this.taskManager.complete(task.id, {
            success: false,
            error: (error as Error).message,
          });
          return Err(new AppError('TASK', `Task failed after ${retries} retries: ${(error as Error).message}`));
        }

        this.logger?.warn('Task failed, retrying', {
          taskId: task.id,
          retry: retries,
          error,
        });
      }
    }

    return Err(new AppError('TASK', 'Task failed'));
  }

  /**
   * Execute verification phase
   */
  private async executeVerificationPhase(
    plan: ExecutionPlan,
    cancellation: CancellationToken
  ): AsyncResult<object> {
    this.logger?.debug('Executing verification phase', { missionId: plan.missionId });

    const verifyResult = await this.verificationPipeline.verify({
      phase: 'post-generation',
      content: {
        type: 'changes',
        changes: plan.changes ?? [],
      },
      options: {
        strictness: 'standard',
      },
      level: 'thorough',
      filePaths: plan.changes?.map((c) => c.path as string),
      contextFile: plan.changes?.[0]?.path as string,
    });

    if (!verifyResult.ok) {
      return Err(verifyResult.error);
    }

    if (!verifyResult.value.valid) {
      return Err(new AppError(
        'VERIFICATION',
        `Verification failed: ${verifyResult.value.summary}`
      ));
    }

    await this.missionManager.advancePhase(plan.missionId);

    return Ok(verifyResult.value);
  }

  /**
   * Execute merge phase - detect and resolve conflicts between branches
   */
  private async executeMergePhase(
    executionId: string,
    missionId: MissionId,
    cancellation: CancellationToken
  ): AsyncResult<void> {
    // Skip if no merge engine or branch service
    if (!this.mergeEngine || !this.branchService) {
      this.logger?.debug('Skipping merge phase - no merge engine or branch service');
      return Ok(undefined);
    }

    const branchIds = this.executionBranches.get(executionId);
    if (!branchIds || branchIds.length === 0) {
      this.logger?.debug('No branches to merge');
      return Ok(undefined);
    }

    this.logger?.info('Executing merge phase', {
      executionId,
      branchCount: branchIds.length,
    });

    // Detect conflicts between all branches
    const conflicts = this.mergeEngine.detectConflicts();

    if (conflicts.length > 0) {
      this.logger?.warn('Conflicts detected', { conflictCount: conflicts.length });

      // Attempt to resolve each conflict
      for (const conflict of conflicts) {
        if (cancellation.isCancelled) {
          return Err(new AppError('CANCELLED', 'Merge cancelled'));
        }

        const resolveResult = await this.mergeEngine.resolveConflict(conflict);
        if (!resolveResult.ok) {
          return Err(new AppError(
            'MERGE_FAILED',
            `Failed to resolve conflict in ${conflict.filePath}: ${resolveResult.error.message}`
          ));
        }

        // Apply the resolution
        const applyResult = await this.mergeEngine.applyResolution(resolveResult.value);
        if (!applyResult.ok) {
          return Err(new AppError(
            'MERGE_FAILED',
            `Failed to apply resolution: ${applyResult.error.message}`
          ));
        }

        this.logger?.info('Conflict resolved', {
          conflictId: conflict.id,
          filePath: conflict.filePath,
          strategy: resolveResult.value.strategy,
        });
      }
    }

    // Merge all branches to apply changes
    for (const branchId of branchIds) {
      const mergeResult = await this.branchService.mergeBranch(branchId);
      if (!mergeResult.ok) {
        this.logger?.error('Failed to merge branch', mergeResult.error, { branchId });
        // Continue with other branches - partial merge is better than none
      } else {
        this.logger?.debug('Branch merged successfully', { branchId });
      }
    }

    await this.missionManager.advancePhase(missionId);
    await this.delay(PHASE_TRANSITION_DELAY);

    return Ok(undefined);
  }

  /**
   * Handle execution failure
   */
  private async handleExecutionFailure(missionId: MissionId, executionId?: string): Promise<void> {
    this.logger?.warn('Handling execution failure, rolling back', { missionId });

    // Abandon any branches created for this execution
    this.cleanupExecutionBranches(executionId);

    await this.missionManager.rollback(missionId);
    await this.missionManager.fail(missionId, 'Execution failed, changes rolled back');
  }

  /**
   * Handle merge failure
   */
  private async handleMergeFailure(missionId: MissionId, executionId?: string): Promise<void> {
    this.logger?.warn('Handling merge failure, rolling back', { missionId });

    // Abandon any branches created for this execution
    this.cleanupExecutionBranches(executionId);

    await this.missionManager.rollback(missionId);
    await this.missionManager.fail(missionId, 'Merge failed, changes rolled back');
  }

  /**
   * Handle verification failure
   */
  private async handleVerificationFailure(missionId: MissionId, executionId?: string): Promise<void> {
    this.logger?.warn('Handling verification failure, rolling back', { missionId });

    // Abandon any branches created for this execution
    this.cleanupExecutionBranches(executionId);

    await this.missionManager.rollback(missionId);
    await this.missionManager.fail(missionId, 'Verification failed, changes rolled back');
  }

  /**
   * Cleanup branches created for an execution
   */
  private cleanupExecutionBranches(executionId?: string): void {
    if (!executionId || !this.branchService) {
      return;
    }

    const branchIds = this.executionBranches.get(executionId);
    if (branchIds) {
      for (const branchId of branchIds) {
        this.branchService.abandonBranch(branchId);
      }
      this.executionBranches.delete(executionId);
      this.logger?.debug('Cleaned up execution branches', {
        executionId,
        branchCount: branchIds.length,
      });
    }
  }

  /**
   * Handle cancellation
   */
  private async handleCancellation(
    executionId: string,
    missionId: MissionId
  ): AsyncResult<ExecutionResult> {
    this.logger?.info('Execution cancelled', { executionId, missionId });

    await this.missionManager.cancel(missionId, 'Execution cancelled');

    return Err(new AppError('CANCELLED', 'Execution cancelled'));
  }

  /**
   * Build system context for agent
   */
  private buildSystemContext(task: Task): string {
    return `You are an AI assistant executing a coding task.

Task Type: ${task.type}
Task Description: ${task.description}
Priority: ${task.priority}

Instructions:
- Follow the project's coding conventions
- Write clean, maintainable code
- Include appropriate error handling
- Explain your changes briefly

Output Format:
- Provide code changes in markdown code blocks
- Tag each block with the file path
- Use unified diff format for modifications`;
  }

  /**
   * Parse file changes from agent response
   */
  private parseChangesFromResponse(response: string): FileChange[] {
    const changes: FileChange[] = [];

    // Look for code blocks with file paths
    const codeBlockRegex = /```(\w+)?\s*(?:\/\/|#)?\s*([^\n]+)\n([\s\S]*?)```/g;

    let match;
    while ((match = codeBlockRegex.exec(response)) !== null) {
      const filePath = match[2]?.trim();
      const content = match[3];

      if (filePath && !filePath.startsWith('//') && !filePath.startsWith('#') && content) {
        changes.push({
          path: toFilePath(filePath),
          type: 'write',
          content,
        });
      }
    }

    return changes;
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    this.eventBus.on('task:completed', async (event) => {
      const { task, result } = event as unknown as { task: Task; result: unknown };
      this.logger?.debug('Task completed event', { taskId: task.id });
    });

    this.eventBus.on('task:failed', async (event) => {
      const { task, error } = event as unknown as { task: Task; error: Error };
      this.logger?.debug('Task failed event', { taskId: task.id, error });
    });
  }

  /**
   * Create cancellation token
   */
  private createCancellationToken(): CancellationToken {
    let cancelled = false;
    const callbacks: Array<() => void> = [];

    return {
      get isCancelled() {
        return cancelled;
      },
      cancel() {
        cancelled = true;
        callbacks.forEach((cb) => cb());
      },
      onCancel(callback: () => void) {
        if (cancelled) {
          callback();
        } else {
          callbacks.push(callback);
        }
      },
    };
  }

  /**
   * Generate execution ID
   */
  private generateExecutionId(): string {
    return `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Subscribe to progress updates
   */
  onProgress(handler: (progress: ExecutionProgress) => void): Disposable {
    this.progressHandlers.add(handler);
    return {
      dispose: () => {
        this.progressHandlers.delete(handler);
      },
    };
  }

  /**
   * Get current progress for a mission
   */
  getCurrentProgress(missionId: MissionId): ExecutionProgress | null {
    for (const execution of this.activeExecutions.values()) {
      if (execution.missionId === missionId) {
        return execution.progress;
      }
    }
    return null;
  }

  /**
   * Notify all progress handlers
   */
  private notifyProgress(progress: ExecutionProgress): void {
    for (const handler of this.progressHandlers) {
      try {
        handler(progress);
      } catch (error) {
        this.logger?.error('Progress handler error', error as Error);
      }
    }
  }

  /**
   * Update progress for an execution
   */
  private updateProgress(
    executionId: string,
    updates: Partial<Omit<ExecutionProgress, 'missionId' | 'timestamp'>>
  ): void {
    const execution = this.activeExecutions.get(executionId);
    if (execution) {
      const progress: ExecutionProgress = {
        ...execution.progress,
        ...updates,
        timestamp: new Date(),
      };
      execution.progress = progress;
      this.notifyProgress(progress);
    }
  }

  /**
   * Get execution statistics
   */
  getStats(): {
    activeExecutions: number;
    taskStats: ReturnType<ITaskManagerService['getStats']>;
    agentStats: ReturnType<IAgentPoolService['getStats']>;
    missionStats: ReturnType<IMissionManagerService['getStats']>;
  } {
    return {
      activeExecutions: this.activeExecutions.size,
      taskStats: this.taskManager.getStats(),
      agentStats: this.agentPool.getStats(),
      missionStats: this.missionManager.getStats(),
    };
  }
}

/**
 * Create an execution coordinator
 */
export function createExecutionCoordinator(
  missionManager: IMissionManagerService,
  taskManager: ITaskManagerService,
  agentPool: IAgentPoolService,
  preflightChecker: IPreflightService,
  verificationPipeline: IVerificationPipelineService,
  rollbackService: IRollbackService,
  impactAnalyzer: IImpactAnalyzerService,
  contextSelector: IContextSelectorService,
  eventBus: IEventBus,
  logger?: ILogger,
  options?: {
    config?: ExecutionCoordinatorConfig;
    approvalService?: IApprovalService;
    branchService?: IVirtualBranchService;
    mergeEngine?: IMergeEngineService;
  }
): IExecutionCoordinatorService {
  return new ExecutionCoordinator(
    missionManager,
    taskManager,
    agentPool,
    preflightChecker,
    verificationPipeline,
    rollbackService,
    impactAnalyzer,
    contextSelector,
    eventBus,
    logger,
    options
  );
}
