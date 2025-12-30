/**
 * AlterCode Core
 *
 * Central orchestration class that coordinates all AlterCode subsystems.
 */

import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import {
  AlterCodeConfig,
  Mission,
  MissionStatus,
  HiveState,
  QuotaStatus,
  QuickAction,
  AIProvider,
  AlterCodeEvent,
  EventType,
  HierarchyAgent,
  Task,
  PendingApproval,
} from '../types';
import { HierarchyManager } from './hierarchy/HierarchyManager';
import { TaskManager } from './task/TaskManager';
import { ExecutionCoordinator } from './execution/ExecutionCoordinator';
import { Sovereign } from './sovereign/Sovereign';
import { AgentPool } from '../agents/AgentPool';
import { StateManager } from '../storage/StateManager';
import { QuotaTracker } from '../quota/QuotaTracker';
import { ApprovalManager } from './approval/ApprovalManager';
import { ApprovalUI } from '../ui/ApprovalUI';
import { Logger } from '../utils/Logger';

/**
 * Central orchestration class for AlterCode.
 */
export class AlterCodeCore extends EventEmitter {
  private readonly context: vscode.ExtensionContext;
  private readonly config: AlterCodeConfig;
  private readonly logger: Logger;

  // Subsystems
  private hierarchyManager!: HierarchyManager;
  private taskManager!: TaskManager;
  private executionCoordinator!: ExecutionCoordinator;
  private sovereign!: Sovereign;
  private agentPool!: AgentPool;
  private stateManager!: StateManager;
  private quotaTracker!: QuotaTracker;
  private approvalManager!: ApprovalManager;
  private approvalUI!: ApprovalUI;

  // State
  private activeMission: Mission | null = null;
  private initialized: boolean = false;

  constructor(context: vscode.ExtensionContext, config: AlterCodeConfig) {
    super();
    this.context = context;
    this.config = config;
    this.logger = new Logger('AlterCodeCore');
  }

  /**
   * Initialize all subsystems.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('AlterCodeCore already initialized');
      return;
    }

    this.logger.info('Initializing AlterCode subsystems...');

    try {
      // Initialize storage first
      this.stateManager = new StateManager(this.context, this.config.storage);
      await this.stateManager.initialize();

      // Initialize quota tracking
      this.quotaTracker = new QuotaTracker(this.stateManager, this.config.quota);
      await this.quotaTracker.initialize();

      // Initialize agent pool
      this.agentPool = new AgentPool(this.config, this.quotaTracker);
      await this.agentPool.initialize();

      // Initialize hierarchy manager
      this.hierarchyManager = new HierarchyManager(this.stateManager);

      // Initialize task manager
      this.taskManager = new TaskManager(this.stateManager);

      // Initialize approval manager and UI
      this.approvalManager = new ApprovalManager(this.config.approvalMode);
      this.approvalUI = new ApprovalUI(this.approvalManager);

      // Initialize execution coordinator
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
      this.executionCoordinator = new ExecutionCoordinator(
        this.taskManager,
        this.agentPool,
        this.hierarchyManager,
        this.approvalManager,
        this.quotaTracker,
        workspaceRoot,
        this.config.hierarchy.maxConcurrentWorkers
      );

      // Initialize sovereign (Level 0)
      this.sovereign = new Sovereign(
        this.agentPool,
        this.taskManager,
        this.hierarchyManager
      );

      // Set up event forwarding
      this.setupEventForwarding();

      this.initialized = true;
      this.logger.info('AlterCode subsystems initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize AlterCode subsystems', error);
      throw error;
    }
  }

  /**
   * Dispose all subsystems.
   */
  async dispose(): Promise<void> {
    this.logger.info('Disposing AlterCode subsystems...');

    if (this.activeMission) {
      await this.cancelMission(this.activeMission.id);
    }

    await this.executionCoordinator?.dispose();
    await this.agentPool?.dispose();
    await this.stateManager?.close();
    this.approvalUI?.dispose();

    this.initialized = false;
    this.logger.info('AlterCode subsystems disposed');
  }

  /**
   * Submit a planning document to start a new mission.
   * @param document The planning document content
   * @param options.planOnly If true, only plan without executing (for Planning mode)
   */
  async submitPlanningDocument(
    document: string,
    options: { planOnly?: boolean } = {}
  ): Promise<Mission> {
    this.ensureInitialized();

    if (this.activeMission && this.activeMission.status === MissionStatus.EXECUTING) {
      throw new Error('A mission is already in progress. Please pause or cancel it first.');
    }

    this.logger.info(`Submitting planning document (planOnly: ${options.planOnly ?? false})...`);

    // Update approval mode from current config
    this.approvalManager.setApprovalMode(this.config.approvalMode);

    // Create mission
    const mission = await this.sovereign.createMission(document);

    // Apply current config to mission
    mission.config.approvalMode = this.config.approvalMode;
    mission.config.maxConcurrentWorkers = this.config.hierarchy.maxConcurrentWorkers;

    // Save mission to state manager (required before startMission can find it)
    await this.stateManager.createMission(mission);

    this.activeMission = mission;

    // Emit event
    this.emitEvent(EventType.MISSION_CREATED, { mission });

    // In planOnly mode, run planning phase (decompose but don't execute workers)
    if (options.planOnly) {
      this.logger.info('Planning-only mode: Running planning phase...');
      await this.runPlanningPhase(mission.id);
    } else {
      // Full execution mode
      await this.startMission(mission.id);
    }

    return mission;
  }

  /**
   * Run planning phase only (decompose tasks down to WORKER level, then stop).
   */
  async runPlanningPhase(missionId: string): Promise<void> {
    this.ensureInitialized();

    const mission = await this.stateManager.getMission(missionId);
    if (!mission) {
      throw new Error(`Mission not found: ${missionId}`);
    }

    this.logger.info(`Running planning phase for mission: ${missionId}`);

    mission.status = MissionStatus.PLANNING;
    await this.stateManager.updateMission(mission);

    this.activeMission = mission;
    this.emitEvent(EventType.MISSION_STARTED, { mission });

    // Run planning (decompose all levels except WORKER)
    this.executionCoordinator
      .planOnly(mission)
      .then(async () => {
        this.logger.info(`Planning phase completed: ${missionId}`);
        mission.status = MissionStatus.PLANNED;
        await this.stateManager.updateMission(mission);
        this.emitEvent(EventType.MISSION_PAUSED, { mission }); // Use paused event to trigger UI update
      })
      .catch((error) => {
        this.logger.error(`Planning phase failed: ${missionId}`, error);
        this.handleMissionFailure(mission, error);
      });
  }

  /**
   * Execute a planned mission (run WORKER tasks).
   * Call this after planning phase completes to start actual execution.
   */
  async executePlan(missionId: string): Promise<void> {
    this.ensureInitialized();

    const mission = await this.stateManager.getMission(missionId);
    if (!mission) {
      throw new Error(`Mission not found: ${missionId}`);
    }

    if (mission.status !== MissionStatus.PLANNED && mission.status !== MissionStatus.PAUSED) {
      throw new Error(`Mission is not in planned state: ${mission.status}`);
    }

    this.logger.info(`Executing planned mission: ${missionId}`);

    // Start full execution (will run WORKER tasks)
    await this.startMission(missionId);
  }

  /**
   * Start or resume a mission.
   */
  async startMission(missionId: string): Promise<void> {
    this.ensureInitialized();

    const mission = await this.stateManager.getMission(missionId);
    if (!mission) {
      throw new Error(`Mission not found: ${missionId}`);
    }

    this.logger.info(`Starting mission: ${missionId}`);

    mission.status = MissionStatus.EXECUTING;
    mission.startedAt = mission.startedAt || new Date();
    await this.stateManager.updateMission(mission);

    this.activeMission = mission;
    this.emitEvent(EventType.MISSION_STARTED, { mission });

    // Start execution
    this.executionCoordinator
      .execute(mission)
      .then(async () => {
        // Mission completed successfully
        this.logger.info(`Mission execution completed: ${missionId}`);
        await this.handleMissionCompletion(mission);
      })
      .catch((error) => {
        this.logger.error(`Mission execution failed: ${missionId}`, error);
        this.handleMissionFailure(mission, error);
      });
  }

  /**
   * Pause the current mission.
   */
  async pauseMission(missionId: string): Promise<void> {
    this.ensureInitialized();

    const mission = await this.stateManager.getMission(missionId);
    if (!mission) {
      throw new Error(`Mission not found: ${missionId}`);
    }

    this.logger.info(`Pausing mission: ${missionId}`);

    await this.executionCoordinator.pause();

    mission.status = MissionStatus.PAUSED;
    await this.stateManager.updateMission(mission);

    this.emitEvent(EventType.MISSION_PAUSED, { mission });
  }

  /**
   * Resume a paused mission.
   */
  async resumeMission(missionId: string): Promise<void> {
    this.ensureInitialized();

    const mission = await this.stateManager.getMission(missionId);
    if (!mission) {
      throw new Error(`Mission not found: ${missionId}`);
    }

    if (mission.status !== MissionStatus.PAUSED) {
      throw new Error(`Mission is not paused: ${missionId}`);
    }

    this.logger.info(`Resuming mission: ${missionId}`);

    mission.status = MissionStatus.EXECUTING;
    await this.stateManager.updateMission(mission);

    this.emitEvent(EventType.MISSION_RESUMED, { mission });

    await this.executionCoordinator.resume();
  }

  /**
   * Cancel the current mission.
   */
  async cancelMission(missionId: string): Promise<void> {
    this.ensureInitialized();

    const mission = await this.stateManager.getMission(missionId);
    if (!mission) {
      throw new Error(`Mission not found: ${missionId}`);
    }

    this.logger.info(`Cancelling mission: ${missionId}`);

    await this.executionCoordinator.cancel();

    mission.status = MissionStatus.CANCELLED;
    mission.completedAt = new Date();
    await this.stateManager.updateMission(mission);

    if (this.activeMission?.id === missionId) {
      this.activeMission = null;
    }

    this.emitEvent(EventType.MISSION_CANCELLED, { mission });
  }

  /**
   * Execute a quick action (review, refactor, explain).
   */
  async quickAction(action: QuickAction): Promise<void> {
    this.ensureInitialized();

    this.logger.info(`Executing quick action: ${action.action} on ${action.filePath}`);

    // Create a mini-mission for the quick action
    const prompt = this.buildQuickActionPrompt(action);
    await this.submitPlanningDocument(prompt);
  }

  /**
   * Get the currently active mission.
   */
  getActiveMission(): Mission | null {
    return this.activeMission;
  }

  /**
   * Get current hive state for UI.
   */
  getHiveState(): HiveState {
    return {
      activeMission: this.activeMission,
      agents: this.hierarchyManager?.getActiveAgents() ?? [],
      taskQueue: this.taskManager?.getPendingTasks() ?? [],
      runningTasks: this.taskManager?.getRunningTasks() ?? [],
      completedTasks: this.taskManager?.getCompletedTasks() ?? [],
      quotaStatus: this.getQuotaStatus(),
      pendingApprovals: this.approvalManager?.getPendingApprovals() ?? [],
    };
  }

  /**
   * Get quota status for all providers.
   */
  getQuotaStatus(): Record<AIProvider, QuotaStatus> {
    if (!this.quotaTracker) {
      return {
        claude: this.createDefaultQuotaStatus('claude'),
        glm: this.createDefaultQuotaStatus('glm'),
      };
    }

    return {
      claude: this.quotaTracker.getStatus('claude'),
      glm: this.quotaTracker.getStatus('glm'),
    };
  }

  /**
   * Respond to an approval request.
   */
  async respondToApproval(
    approvalId: string,
    response: { approved: boolean; modifications?: unknown }
  ): Promise<void> {
    this.ensureInitialized();

    await this.approvalManager.respond(approvalId, response);
  }

  /**
   * Subscribe to state changes.
   */
  onStateChange(callback: (state: HiveState) => void): vscode.Disposable {
    const handler = () => callback(this.getHiveState());

    this.on('stateChange', handler);

    return new vscode.Disposable(() => {
      this.off('stateChange', handler);
    });
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('AlterCodeCore is not initialized');
    }
  }

  private setupEventForwarding(): void {
    // Forward events from subsystems
    this.executionCoordinator.on('taskCompleted', (task: Task) => {
      this.emitEvent(EventType.TASK_COMPLETED, { task });
      this.emit('stateChange');
    });

    this.executionCoordinator.on('taskFailed', (task: Task, error: Error) => {
      this.emitEvent(EventType.TASK_FAILED, { task, error });
      this.emit('stateChange');
    });

    this.quotaTracker.on('warning', (status: QuotaStatus) => {
      this.emitEvent(EventType.QUOTA_WARNING, { status });
    });

    this.quotaTracker.on('exceeded', (status: QuotaStatus) => {
      this.emitEvent(EventType.QUOTA_EXCEEDED, { status });
    });

    this.approvalManager.on('requested', (approval: PendingApproval) => {
      this.emitEvent(EventType.APPROVAL_REQUESTED, { approval });
    });
  }

  private emitEvent<T>(type: EventType, payload: T): void {
    const event: AlterCodeEvent<T> = {
      type,
      timestamp: new Date(),
      payload,
    };
    this.emit(type, event);
    this.emit('event', event);
    // Always emit stateChange so UI updates
    this.emit('stateChange');
  }

  private async handleMissionCompletion(mission: Mission): Promise<void> {
    mission.status = MissionStatus.COMPLETED;
    mission.completedAt = new Date();
    await this.stateManager.updateMission(mission);

    // Clear active mission
    if (this.activeMission?.id === mission.id) {
      this.activeMission = null;
    }

    this.emitEvent(EventType.MISSION_COMPLETED, { mission });
    this.logger.info(`Mission completed successfully: ${mission.id}`);
  }

  private async handleMissionFailure(mission: Mission, error: Error): Promise<void> {
    mission.status = MissionStatus.FAILED;
    mission.completedAt = new Date();
    await this.stateManager.updateMission(mission);

    if (this.activeMission?.id === mission.id) {
      this.activeMission = null;
    }

    this.emitEvent(EventType.MISSION_FAILED, { mission, error });
  }

  private buildQuickActionPrompt(action: QuickAction): string {
    const actionDescriptions: Record<string, string> = {
      review: 'Review the following code for issues, best practices, and potential improvements',
      refactor: 'Refactor the following code to improve its quality, readability, and maintainability',
      explain: 'Explain what the following code does in detail',
      test: 'Generate comprehensive tests for the following code',
    };

    const description = actionDescriptions[action.action] || 'Analyze the following code';

    return `
# Quick Action: ${action.action.charAt(0).toUpperCase() + action.action.slice(1)}

## File
${action.filePath}${action.startLine !== undefined ? `:${action.startLine}-${action.endLine}` : ''}

## Task
${description}

## Code
\`\`\`
${action.content}
\`\`\`
`.trim();
  }

  private createDefaultQuotaStatus(provider: AIProvider): QuotaStatus {
    return {
      provider,
      usageRatio: 0,
      status: 'ok',
      timeUntilResetMs: 5 * 60 * 60 * 1000, // 5 hours
      currentWindow: {
        id: 'default',
        provider,
        windowStart: new Date(),
        windowEnd: new Date(Date.now() + 5 * 60 * 60 * 1000),
        windowDurationMs: 5 * 60 * 60 * 1000,
        usage: {
          callCount: 0,
          tokensSent: 0,
          tokensReceived: 0,
          byLevel: {} as Record<number, { callCount: number; tokensSent: number; tokensReceived: number }>,
        },
        limits: {
          maxCalls: null,
          maxTokens: null,
          warningThreshold: 0.8,
          hardStopThreshold: 0.95,
        },
      },
    };
  }
}
