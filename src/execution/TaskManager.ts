/**
 * Task Manager
 *
 * Manages task lifecycle and execution:
 * - Task queue management
 * - Priority scheduling
 * - Dependency resolution
 * - Status tracking
 */

import {
  ITaskManagerService,
  Task,
  TaskId,
  MissionId,
  TaskStatus,
  TaskPriority,
  TaskResult,
  TaskDependency,
  IEventBus,
  AsyncResult,
  Ok,
  Err,
  ILogger,
  AppError,
  toTaskId,
  CancellationToken,
} from '../types';

/** Maximum concurrent tasks */
const MAX_CONCURRENT_TASKS = 10;

/** Task timeout (5 minutes) */
const TASK_TIMEOUT = 5 * 60 * 1000;

/**
 * Task Manager implementation
 */
export class TaskManager implements ITaskManagerService {
  private readonly eventBus: IEventBus;
  private readonly logger?: ILogger;

  // Task storage
  private tasks: Map<string, Task> = new Map();

  // Queue by priority
  private queue: Task[] = [];

  // Running tasks
  private running: Set<string> = new Set();

  // Task results
  private results: Map<string, TaskResult> = new Map();

  // Cancellation tokens
  private cancellations: Map<string, CancellationToken> = new Map();

  constructor(eventBus: IEventBus, logger?: ILogger) {
    this.eventBus = eventBus;
    this.logger = logger?.child('TaskManager');
  }

  async create(
    missionId: MissionId,
    config: {
      type: Task['type'];
      description: string;
      priority?: TaskPriority;
      dependencies?: TaskDependency[];
      metadata?: Record<string, unknown>;
    }
  ): AsyncResult<Task> {
    const taskId = this.generateTaskId();

    const task: Task = {
      id: taskId,
      missionId,
      type: config.type,
      description: config.description,
      status: 'pending',
      priority: config.priority ?? 'normal',
      dependencies: config.dependencies ?? [],
      metadata: config.metadata ?? {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.tasks.set(taskId as string, task);
    this.addToQueue(task);

    this.logger?.info('Task created', {
      taskId,
      missionId,
      type: config.type,
      priority: task.priority,
    });

    await this.eventBus.emit('task:created', { task });

    return Ok(task);
  }

  async start(taskId: TaskId): AsyncResult<void> {
    const task = this.tasks.get(taskId as string);

    if (!task) {
      return Err(new AppError('TASK', `Task not found: ${taskId}`));
    }

    if (task.status !== 'pending' && task.status !== 'blocked') {
      return Err(new AppError('TASK', `Task cannot be started: ${task.status}`));
    }

    // Check dependencies
    if (!this.areDependenciesMet(task)) {
      task.status = 'blocked';
      task.updatedAt = new Date();
      return Err(new AppError('TASK', 'Task dependencies not met'));
    }

    // Check concurrent limit
    if (this.running.size >= MAX_CONCURRENT_TASKS) {
      return Err(new AppError('TASK', 'Maximum concurrent tasks reached'));
    }

    // Create cancellation token
    const cancellation = this.createCancellationToken(taskId as string);
    this.cancellations.set(taskId as string, cancellation);

    // Update status
    task.status = 'running';
    task.startedAt = new Date();
    task.updatedAt = new Date();

    this.running.add(taskId as string);
    this.removeFromQueue(taskId);

    this.logger?.info('Task started', { taskId, missionId: task.missionId });

    await this.eventBus.emit('task:started', { task });

    // Set timeout
    setTimeout(() => {
      if (task.status === 'running') {
        this.handleTimeout(taskId);
      }
    }, TASK_TIMEOUT);

    return Ok(undefined);
  }

  async complete(taskId: TaskId, result: TaskResult): AsyncResult<void> {
    const task = this.tasks.get(taskId as string);

    if (!task) {
      return Err(new AppError('TASK', `Task not found: ${taskId}`));
    }

    if (task.status !== 'running') {
      return Err(new AppError('TASK', `Task not running: ${task.status}`));
    }

    // Store result
    this.results.set(taskId as string, result);

    // Update status
    task.status = result.success ? 'completed' : 'failed';
    task.completedAt = new Date();
    task.updatedAt = new Date();

    this.running.delete(taskId as string);
    this.cancellations.delete(taskId as string);

    this.logger?.info('Task completed', {
      taskId,
      success: result.success,
      duration: task.completedAt.getTime() - (task.startedAt?.getTime() ?? 0),
    });

    await this.eventBus.emit('task:completed', { task, result });

    // Check if any blocked tasks can now run
    await this.checkBlockedTasks();

    return Ok(undefined);
  }

  async cancel(taskId: TaskId, reason?: string): AsyncResult<void> {
    const task = this.tasks.get(taskId as string);

    if (!task) {
      return Err(new AppError('TASK', `Task not found: ${taskId}`));
    }

    if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
      return Err(new AppError('TASK', `Task already finished: ${task.status}`));
    }

    // Cancel via token if running
    const cancellation = this.cancellations.get(taskId as string);
    if (cancellation?.cancel) {
      cancellation.cancel();
    }

    // Update status
    task.status = 'cancelled';
    task.updatedAt = new Date();
    task.metadata = task.metadata ?? {};
    task.metadata.cancelReason = reason;

    this.running.delete(taskId as string);
    this.removeFromQueue(taskId);
    this.cancellations.delete(taskId as string);

    this.logger?.info('Task cancelled', { taskId, reason });

    await this.eventBus.emit('task:cancelled', { task, reason });

    return Ok(undefined);
  }

  get(taskId: TaskId): Task | undefined {
    return this.tasks.get(taskId as string);
  }

  getByMission(missionId: MissionId): Task[] {
    return Array.from(this.tasks.values())
      .filter((t) => t.missionId === missionId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  getStatus(taskId: TaskId): TaskStatus | undefined {
    return this.tasks.get(taskId as string)?.status;
  }

  getResult(taskId: TaskId): TaskResult | undefined {
    return this.results.get(taskId as string);
  }

  getCancellationToken(taskId: TaskId): CancellationToken | undefined {
    return this.cancellations.get(taskId as string);
  }

  /**
   * Add task to priority queue
   */
  private addToQueue(task: Task): void {
    this.queue.push(task);
    this.sortQueue();
  }

  /**
   * Remove task from queue
   */
  private removeFromQueue(taskId: TaskId): void {
    this.queue = this.queue.filter((t) => t.id !== taskId);
  }

  /**
   * Sort queue by priority
   */
  private sortQueue(): void {
    const priorityOrder: Record<TaskPriority, number> = {
      critical: 0,
      high: 1,
      normal: 2,
      low: 3,
    };

    this.queue.sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
  }

  /**
   * Check if task dependencies are met
   */
  private areDependenciesMet(task: Task): boolean {
    for (const dep of task.dependencies) {
      const depTask = this.tasks.get(dep.taskId as string);

      if (!depTask) {
        return false;
      }

      if (dep.type === 'required' && depTask.status !== 'completed') {
        return false;
      }

      if (dep.type === 'soft' && depTask.status === 'running') {
        return false;
      }
    }

    return true;
  }

  /**
   * Check blocked tasks and update their status
   */
  private async checkBlockedTasks(): Promise<void> {
    for (const task of this.tasks.values()) {
      if (task.status === 'blocked' && this.areDependenciesMet(task)) {
        task.status = 'pending';
        task.updatedAt = new Date();
        this.addToQueue(task);

        await this.eventBus.emit('task:unblocked', { task });
      }
    }
  }

  /**
   * Handle task timeout
   */
  private async handleTimeout(taskId: TaskId): Promise<void> {
    const task = this.tasks.get(taskId as string);

    if (!task || task.status !== 'running') {
      return;
    }

    this.logger?.warn('Task timed out', { taskId });

    await this.complete(taskId, {
      success: false,
      error: 'Task timed out',
      duration: TASK_TIMEOUT,
    });
  }

  /**
   * Create cancellation token
   */
  private createCancellationToken(taskId: string): CancellationToken {
    let cancelled = false;
    const callbacks: Array<() => void> = [];

    return {
      get isCancelled() {
        return cancelled;
      },
      cancel() {
        cancelled = true;
        for (const cb of callbacks) {
          try {
            cb();
          } catch {
            // Ignore callback errors
          }
        }
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
   * Generate unique task ID
   */
  private generateTaskId(): TaskId {
    return toTaskId(`task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  }

  /**
   * Get next task to execute
   */
  getNext(): Task | undefined {
    for (const task of this.queue) {
      if (task.status === 'pending' && this.areDependenciesMet(task)) {
        return task;
      }
    }
    return undefined;
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
  } {
    const tasks = Array.from(this.tasks.values());

    return {
      total: tasks.length,
      pending: tasks.filter((t) => t.status === 'pending').length,
      running: tasks.filter((t) => t.status === 'running').length,
      completed: tasks.filter((t) => t.status === 'completed').length,
      failed: tasks.filter((t) => t.status === 'failed').length,
      cancelled: tasks.filter((t) => t.status === 'cancelled').length,
    };
  }

  /**
   * Clear completed tasks for a mission
   */
  clearCompleted(missionId: MissionId): void {
    for (const [id, task] of this.tasks) {
      if (
        task.missionId === missionId &&
        (task.status === 'completed' || task.status === 'cancelled')
      ) {
        this.tasks.delete(id);
        this.results.delete(id);
      }
    }
  }

  /**
   * Retry a failed task
   */
  async retry(taskId: TaskId): AsyncResult<Task> {
    const originalTask = this.tasks.get(taskId as string);

    if (!originalTask) {
      return Err(new AppError('TASK', `Task not found: ${taskId}`));
    }

    if (originalTask.status !== 'failed') {
      return Err(new AppError('TASK', 'Only failed tasks can be retried'));
    }

    // Create new task based on original
    const originalMetadata = originalTask.metadata ?? {};
    return this.create(originalTask.missionId, {
      type: originalTask.type,
      description: originalTask.description,
      priority: originalTask.priority,
      dependencies: originalTask.dependencies,
      metadata: {
        ...originalMetadata,
        retriedFrom: taskId,
        retryCount: ((originalMetadata.retryCount as number) ?? 0) + 1,
      },
    });
  }
}

/**
 * Create a task manager
 */
export function createTaskManager(eventBus: IEventBus, logger?: ILogger): ITaskManagerService {
  return new TaskManager(eventBus, logger);
}
