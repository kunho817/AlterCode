/**
 * Mission Manager
 *
 * High-level mission coordination:
 * - Mission lifecycle management
 * - Progress tracking
 * - State machine for mission phases
 * - Mission persistence
 */

import {
  IMissionManagerService,
  Mission,
  MissionId,
  MissionStatus,
  MissionPhase,
  MissionConfig,
  MissionProgress,
  ITaskManagerService,
  IRollbackService,
  IEventBus,
  AsyncResult,
  Ok,
  Err,
  ILogger,
  AppError,
  toMissionId,
  TaskId,
} from '../types';

/** Mission phases in order */
const PHASE_ORDER: MissionPhase[] = [
  'planning',
  'validation',
  'execution',
  'verification',
  'completion',
];

/** Phase transition rules */
const VALID_TRANSITIONS: Record<MissionPhase, MissionPhase[]> = {
  planning: ['validation', 'completion'], // Can skip to completion if planning fails
  validation: ['execution', 'planning'], // Can go back to planning
  execution: ['verification', 'planning'], // Can rollback to planning
  verification: ['completion', 'execution'], // Can retry execution
  completion: [], // Terminal state
};

/**
 * Mission Manager implementation
 */
export class MissionManager implements IMissionManagerService {
  private readonly taskManager: ITaskManagerService;
  private readonly rollbackService: IRollbackService;
  private readonly eventBus: IEventBus;
  private readonly logger?: ILogger;

  // Mission storage
  private missions: Map<string, Mission> = new Map();

  // Mission progress
  private progress: Map<string, MissionProgress> = new Map();

  constructor(
    taskManager: ITaskManagerService,
    rollbackService: IRollbackService,
    eventBus: IEventBus,
    logger?: ILogger
  ) {
    this.taskManager = taskManager;
    this.rollbackService = rollbackService;
    this.eventBus = eventBus;
    this.logger = logger?.child('MissionManager');
  }

  async create(config: MissionConfig): AsyncResult<Mission> {
    const missionId = this.generateMissionId();

    const mission: Mission = {
      id: missionId,
      title: config.title,
      description: config.description,
      status: 'pending',
      phase: 'planning',
      priority: config.priority ?? 'normal',
      scope: config.scope,
      constraints: config.constraints ?? [],
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: config.metadata ?? {},
    };

    this.missions.set(missionId as string, mission);

    // Initialize progress
    this.progress.set(missionId as string, {
      missionId,
      phase: 'planning',
      phaseProgress: 0,
      overallProgress: 0,
      tasksTotal: 0,
      tasksCompleted: 0,
      startedAt: null,
      estimatedCompletion: null,
    });

    this.logger?.info('Mission created', {
      missionId,
      title: config.title,
      priority: mission.priority,
    });

    await this.eventBus.emit('mission:created', { mission });

    return Ok(mission);
  }

  async start(missionId: MissionId): AsyncResult<void> {
    const mission = this.missions.get(missionId as string);

    if (!mission) {
      return Err(new AppError('MISSION', `Mission not found: ${missionId}`));
    }

    if (mission.status !== 'pending') {
      return Err(new AppError('MISSION', `Mission cannot be started: ${mission.status}`));
    }

    mission.status = 'active';
    mission.startedAt = new Date();
    mission.updatedAt = new Date();

    const progress = this.progress.get(missionId as string)!;
    progress.startedAt = new Date();

    this.logger?.info('Mission started', { missionId });

    await this.eventBus.emit('mission:started', { mission });

    return Ok(undefined);
  }

  async complete(missionId: MissionId): AsyncResult<void> {
    const mission = this.missions.get(missionId as string);

    if (!mission) {
      return Err(new AppError('MISSION', `Mission not found: ${missionId}`));
    }

    if (mission.status !== 'active') {
      return Err(new AppError('MISSION', `Mission not active: ${mission.status}`));
    }

    mission.status = 'completed';
    mission.phase = 'completion';
    mission.completedAt = new Date();
    mission.updatedAt = new Date();

    const progress = this.progress.get(missionId as string)!;
    progress.phase = 'completion';
    progress.phaseProgress = 100;
    progress.overallProgress = 100;

    this.logger?.info('Mission completed', {
      missionId,
      duration: mission.completedAt.getTime() - (mission.startedAt?.getTime() ?? 0),
    });

    await this.eventBus.emit('mission:completed', { mission });

    return Ok(undefined);
  }

  async fail(missionId: MissionId, error: string): AsyncResult<void> {
    const mission = this.missions.get(missionId as string);

    if (!mission) {
      return Err(new AppError('MISSION', `Mission not found: ${missionId}`));
    }

    mission.status = 'failed';
    mission.completedAt = new Date();
    mission.updatedAt = new Date();
    mission.metadata = mission.metadata ?? {};
    mission.metadata.failureReason = error;

    this.logger?.error('Mission failed', new Error(error), { missionId });

    await this.eventBus.emit('mission:failed', { mission, error });

    return Ok(undefined);
  }

  async cancel(missionId: MissionId, reason?: string): AsyncResult<void> {
    const mission = this.missions.get(missionId as string);

    if (!mission) {
      return Err(new AppError('MISSION', `Mission not found: ${missionId}`));
    }

    if (mission.status === 'completed' || mission.status === 'cancelled') {
      return Err(new AppError('MISSION', `Mission already finished: ${mission.status}`));
    }

    // Cancel all tasks
    const tasks = this.taskManager.getByMission(missionId);
    for (const task of tasks) {
      if (task.status === 'pending' || task.status === 'running') {
        await this.taskManager.cancel(task.id, 'Mission cancelled');
      }
    }

    mission.status = 'cancelled';
    mission.completedAt = new Date();
    mission.updatedAt = new Date();
    mission.metadata = mission.metadata ?? {};
    mission.metadata.cancelReason = reason;

    this.logger?.info('Mission cancelled', { missionId, reason });

    await this.eventBus.emit('mission:cancelled', { mission, reason });

    return Ok(undefined);
  }

  async advancePhase(missionId: MissionId): AsyncResult<void> {
    const mission = this.missions.get(missionId as string);

    if (!mission) {
      return Err(new AppError('MISSION', `Mission not found: ${missionId}`));
    }

    const currentPhase = mission.phase ?? 'planning';
    const currentIndex = PHASE_ORDER.indexOf(currentPhase);
    if (currentIndex >= PHASE_ORDER.length - 1) {
      return Err(new AppError('MISSION', 'Already at final phase'));
    }

    const nextPhase = PHASE_ORDER[currentIndex + 1];
    if (!nextPhase) {
      return Err(new AppError('MISSION', 'No next phase available'));
    }

    // Validate transition
    if (!VALID_TRANSITIONS[currentPhase].includes(nextPhase)) {
      return Err(new AppError('MISSION', `Invalid phase transition: ${currentPhase} -> ${nextPhase}`));
    }

    const previousPhase = currentPhase;
    mission.phase = nextPhase;
    mission.updatedAt = new Date();

    // Update progress
    const progress = this.progress.get(missionId as string)!;
    progress.phase = nextPhase;
    progress.phaseProgress = 0;
    progress.overallProgress = ((currentIndex + 1) / PHASE_ORDER.length) * 100;

    this.logger?.info('Mission phase advanced', {
      missionId,
      from: previousPhase,
      to: nextPhase,
    });

    await this.eventBus.emit('mission:phaseChanged', {
      mission,
      previousPhase,
      newPhase: nextPhase,
    });

    return Ok(undefined);
  }

  get(missionId: MissionId): Mission | null {
    return this.missions.get(missionId as string) ?? null;
  }

  getMission(missionId: MissionId): Mission | null {
    return this.get(missionId);
  }

  getStatus(missionId: MissionId): MissionStatus | undefined {
    return this.missions.get(missionId as string)?.status;
  }

  getProgress(missionId: MissionId): MissionProgress {
    return this.progress.get(missionId as string) ?? {
      tasksTotal: 0,
      tasksCompleted: 0,
    };
  }

  getActiveMissions(): Mission[] {
    return this.getActive();
  }

  getMissionsByStatus(status: MissionStatus): Mission[] {
    return Array.from(this.missions.values()).filter((m) => m.status === status);
  }

  async pause(missionId: MissionId): AsyncResult<void> {
    const mission = this.missions.get(missionId as string);
    if (!mission) {
      return Err(new AppError('MISSION', `Mission not found: ${missionId}`));
    }
    if (mission.status !== 'active' && mission.status !== 'running') {
      return Err(new AppError('MISSION', `Mission not running: ${mission.status}`));
    }
    mission.status = 'paused';
    mission.updatedAt = new Date();
    await this.eventBus.emit('mission:paused', { mission });
    return Ok(undefined);
  }

  async resume(missionId: MissionId): AsyncResult<void> {
    const mission = this.missions.get(missionId as string);
    if (!mission) {
      return Err(new AppError('MISSION', `Mission not found: ${missionId}`));
    }
    if (mission.status !== 'paused') {
      return Err(new AppError('MISSION', `Mission not paused: ${mission.status}`));
    }
    mission.status = 'active';
    mission.updatedAt = new Date();
    await this.eventBus.emit('mission:resumed', { mission });
    return Ok(undefined);
  }

  async setResult(missionId: MissionId, result: import('../types').MissionResult): AsyncResult<void> {
    const mission = this.missions.get(missionId as string);
    if (!mission) {
      return Err(new AppError('MISSION', `Mission not found: ${missionId}`));
    }
    mission.result = result;
    mission.updatedAt = new Date();
    return Ok(undefined);
  }

  async createMission(intentId: import('../types').IntentId, mode: import('../types').MissionMode): AsyncResult<Mission> {
    return this.create({
      title: `Mission from intent ${intentId}`,
      description: '',
      metadata: { intentId, mode },
    });
  }

  getAll(): Mission[] {
    return Array.from(this.missions.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  getActive(): Mission[] {
    return Array.from(this.missions.values())
      .filter((m) => m.status === 'active')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Update mission progress
   */
  async updateProgress(
    missionId: MissionId,
    updates: Partial<MissionProgress>
  ): AsyncResult<void> {
    const progress = this.progress.get(missionId as string);

    if (!progress) {
      return Err(new AppError('MISSION', `Mission not found: ${missionId}`));
    }

    Object.assign(progress, updates);

    await this.eventBus.emit('mission:progressUpdated', { missionId, progress });

    return Ok(undefined);
  }

  /**
   * Rollback mission to previous phase
   */
  async rollback(missionId: MissionId): AsyncResult<void> {
    const mission = this.missions.get(missionId as string);

    if (!mission) {
      return Err(new AppError('MISSION', `Mission not found: ${missionId}`));
    }

    // Get rollback history
    const rollbackHistory = this.rollbackService.getHistory(missionId);

    if (rollbackHistory.length === 0) {
      return Err(new AppError('MISSION', 'No rollback points available'));
    }

    // Rollback to most recent point
    const latestPoint = rollbackHistory[0];
    if (!latestPoint) {
      return Err(new AppError('MISSION', 'No rollback points available'));
    }
    const rollbackResult = await this.rollbackService.rollback(latestPoint.id);

    if (!rollbackResult.ok) {
      return Err(rollbackResult.error);
    }

    // Go back to planning phase
    const previousPhase = mission.phase;
    mission.phase = 'planning';
    mission.updatedAt = new Date();

    const progress = this.progress.get(missionId as string)!;
    progress.phase = 'planning';
    progress.phaseProgress = 0;

    const filesRestored = rollbackResult.value;

    this.logger?.info('Mission rolled back', {
      missionId,
      from: previousPhase,
      filesRestored: filesRestored.length,
    });

    this.eventBus.emit('mission:rolledBack', {
      mission,
      previousPhase,
      filesRestored,
    });

    return Ok(undefined);
  }

  /**
   * Add task to mission
   */
  async addTask(
    missionId: MissionId,
    taskConfig: Parameters<typeof this.taskManager.create>[1]
  ): AsyncResult<TaskId> {
    const mission = this.missions.get(missionId as string);

    if (!mission) {
      return Err(new AppError('MISSION', `Mission not found: ${missionId}`));
    }

    const taskResult = await this.taskManager.create(missionId, taskConfig);

    if (!taskResult.ok) {
      return Err(taskResult.error);
    }

    // Update progress
    const progress = this.progress.get(missionId as string)!;
    progress.tasksTotal++;

    return Ok(taskResult.value.id);
  }

  /**
   * Mark task as completed and update mission progress
   */
  async taskCompleted(missionId: MissionId, taskId: TaskId): AsyncResult<void> {
    const progress = this.progress.get(missionId as string);

    if (!progress) {
      return Err(new AppError('MISSION', `Mission not found: ${missionId}`));
    }

    progress.tasksCompleted++;

    // Update phase progress
    if (progress.tasksTotal > 0) {
      progress.phaseProgress = (progress.tasksCompleted / progress.tasksTotal) * 100;
    }

    // Estimate completion
    if (progress.startedAt) {
      const elapsed = Date.now() - progress.startedAt.getTime();
      const rate = progress.tasksCompleted / elapsed;
      const remaining = progress.tasksTotal - progress.tasksCompleted;
      progress.estimatedCompletion = new Date(Date.now() + remaining / rate);
    }

    await this.eventBus.emit('mission:progressUpdated', { missionId, progress });

    return Ok(undefined);
  }

  /**
   * Generate unique mission ID
   */
  private generateMissionId(): MissionId {
    return toMissionId(`mission-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  }

  /**
   * Get mission statistics
   */
  getStats(): {
    total: number;
    pending: number;
    active: number;
    completed: number;
    failed: number;
    cancelled: number;
  } {
    const missions = Array.from(this.missions.values());

    return {
      total: missions.length,
      pending: missions.filter((m) => m.status === 'pending').length,
      active: missions.filter((m) => m.status === 'active').length,
      completed: missions.filter((m) => m.status === 'completed').length,
      failed: missions.filter((m) => m.status === 'failed').length,
      cancelled: missions.filter((m) => m.status === 'cancelled').length,
    };
  }

  /**
   * Clear completed missions
   */
  clearCompleted(): void {
    for (const [id, mission] of this.missions) {
      if (mission.status === 'completed' || mission.status === 'cancelled') {
        this.missions.delete(id);
        this.progress.delete(id);
        this.taskManager.clearCompleted(mission.id);
      }
    }

    this.logger?.info('Cleared completed missions');
  }

  /**
   * Export mission for persistence
   */
  export(missionId: MissionId): object | undefined {
    const mission = this.missions.get(missionId as string);
    const progress = this.progress.get(missionId as string);

    if (!mission) return undefined;

    return {
      mission,
      progress,
      tasks: this.taskManager.getByMission(missionId),
    };
  }
}

/**
 * Create a mission manager
 */
export function createMissionManager(
  taskManager: ITaskManagerService,
  rollbackService: IRollbackService,
  eventBus: IEventBus,
  logger?: ILogger
): IMissionManagerService {
  return new MissionManager(taskManager, rollbackService, eventBus, logger);
}
