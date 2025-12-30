/**
 * Task Manager
 *
 * Manages task lifecycle, including creation, assignment, and completion.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Task,
  TaskStatus,
  TaskType,
  TaskPriority,
  TaskContext,
  TaskInput,
  TaskOutput,
  TaskDependency,
  TaskMetrics,
  HierarchyLevel,
} from '../../types';
import { StateManager } from '../../storage/StateManager';
import { Logger } from '../../utils/Logger';

/**
 * Configuration for creating a task.
 */
export interface TaskConfig {
  missionId: string;
  parentTaskId?: string;
  level: HierarchyLevel;
  type: TaskType;
  priority?: TaskPriority;
  title: string;
  description: string;
  context: TaskContext;
  input: TaskInput;
  dependencies?: TaskDependency[];
}

/**
 * Manages task lifecycle.
 */
export class TaskManager {
  private readonly stateManager: StateManager;
  private readonly logger: Logger;
  private readonly tasks: Map<string, Task>;
  private readonly tasksByMission: Map<string, Set<string>>;
  private readonly tasksByStatus: Map<TaskStatus, Set<string>>;

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
    this.logger = new Logger('TaskManager');
    this.tasks = new Map();
    this.tasksByMission = new Map();
    this.tasksByStatus = new Map();

    // Initialize status sets
    for (const status of Object.values(TaskStatus)) {
      this.tasksByStatus.set(status, new Set());
    }
  }

  /**
   * Create a new task.
   */
  async createTask(config: TaskConfig): Promise<Task> {
    const task: Task = {
      id: uuidv4(),
      missionId: config.missionId,
      parentTaskId: config.parentTaskId || null,
      childTaskIds: [],
      level: config.level,
      assignedAgentId: null,
      type: config.type,
      status: TaskStatus.PENDING,
      priority: config.priority || TaskPriority.NORMAL,
      title: config.title,
      description: config.description,
      context: config.context,
      input: config.input,
      output: null,
      dependencies: config.dependencies || [],
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      metrics: this.createEmptyMetrics(),
    };

    // Register task
    this.tasks.set(task.id, task);
    this.tasksByStatus.get(TaskStatus.PENDING)?.add(task.id);

    // Add to mission tracking
    if (!this.tasksByMission.has(config.missionId)) {
      this.tasksByMission.set(config.missionId, new Set());
    }
    this.tasksByMission.get(config.missionId)?.add(task.id);

    // Update parent's child list
    if (config.parentTaskId) {
      const parent = this.tasks.get(config.parentTaskId);
      if (parent) {
        parent.childTaskIds.push(task.id);
      }
    }

    // Persist
    await this.stateManager.createTask(task);

    this.logger.debug(`Created task: ${task.id} (${task.title})`);

    return task;
  }

  /**
   * Get a task by ID.
   */
  getTask(id: string): Task | null {
    return this.tasks.get(id) || null;
  }

  /**
   * Get all tasks for a mission.
   */
  getTasksForMission(missionId: string): Task[] {
    const taskIds = this.tasksByMission.get(missionId) || new Set();
    return Array.from(taskIds)
      .map((id) => this.tasks.get(id))
      .filter((task): task is Task => task !== undefined);
  }

  /**
   * Get tasks by status.
   */
  getTasksByStatus(status: TaskStatus): Task[] {
    const taskIds = this.tasksByStatus.get(status) || new Set();
    return Array.from(taskIds)
      .map((id) => this.tasks.get(id))
      .filter((task): task is Task => task !== undefined);
  }

  /**
   * Get pending tasks.
   */
  getPendingTasks(): Task[] {
    return this.getTasksByStatus(TaskStatus.PENDING);
  }

  /**
   * Get running tasks.
   */
  getRunningTasks(): Task[] {
    return this.getTasksByStatus(TaskStatus.RUNNING);
  }

  /**
   * Get completed tasks.
   */
  getCompletedTasks(): Task[] {
    return this.getTasksByStatus(TaskStatus.COMPLETED);
  }

  /**
   * Get child tasks of a task.
   */
  getChildTasks(taskId: string): Task[] {
    const task = this.tasks.get(taskId);
    if (!task) return [];

    return task.childTaskIds
      .map((id) => this.tasks.get(id))
      .filter((child): child is Task => child !== undefined);
  }

  /**
   * Get tasks at a specific hierarchy level.
   */
  getTasksAtLevel(missionId: string, level: HierarchyLevel): Task[] {
    return this.getTasksForMission(missionId).filter((task) => task.level === level);
  }

  /**
   * Update task status.
   */
  async updateTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // Remove from old status set
    this.tasksByStatus.get(task.status)?.delete(taskId);

    // Update status
    task.status = status;

    // Add to new status set
    this.tasksByStatus.get(status)?.add(taskId);

    // Update timestamps
    if (status === TaskStatus.RUNNING && !task.startedAt) {
      task.startedAt = new Date();
    } else if (
      status === TaskStatus.COMPLETED ||
      status === TaskStatus.FAILED ||
      status === TaskStatus.CANCELLED
    ) {
      task.completedAt = new Date();
      if (task.startedAt) {
        task.metrics.executionTimeMs = task.completedAt.getTime() - task.startedAt.getTime();
      }
    }

    await this.stateManager.updateTask(task);
  }

  /**
   * Assign a task to an agent.
   */
  async assignTask(taskId: string, agentId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    task.assignedAgentId = agentId;
    await this.updateTaskStatus(taskId, TaskStatus.ASSIGNED);
  }

  /**
   * Start a task.
   */
  async startTask(taskId: string): Promise<void> {
    await this.updateTaskStatus(taskId, TaskStatus.RUNNING);
  }

  /**
   * Complete a task with output.
   */
  async completeTask(taskId: string, output: TaskOutput): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    task.output = output;
    task.metrics.tokensSent = output.metrics.tokensSent;
    task.metrics.tokensReceived = output.metrics.tokensReceived;

    await this.updateTaskStatus(taskId, TaskStatus.COMPLETED);

    // Update dependent tasks
    await this.updateDependencies(taskId);
  }

  /**
   * Fail a task.
   */
  async failTask(taskId: string, error: Error): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    task.metrics.retryCount++;

    // Check if retries are exhausted
    const maxRetries = 3;
    if (task.metrics.retryCount >= maxRetries) {
      await this.updateTaskStatus(taskId, TaskStatus.FAILED);
      this.logger.error(`Task failed after ${maxRetries} retries: ${taskId}`, error);
    } else {
      // Reset to pending for retry
      await this.updateTaskStatus(taskId, TaskStatus.PENDING);
      this.logger.warn(`Task failed, retrying (${task.metrics.retryCount}/${maxRetries}): ${taskId}`);
    }
  }

  /**
   * Cancel a task.
   */
  async cancelTask(taskId: string): Promise<void> {
    await this.updateTaskStatus(taskId, TaskStatus.CANCELLED);
  }

  /**
   * Check if a task's dependencies are satisfied.
   */
  areDependenciesSatisfied(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    return task.dependencies.every((dep) => {
      if (dep.type === 'informational') return true;

      const depTask = this.tasks.get(dep.taskId);
      return depTask?.status === TaskStatus.COMPLETED;
    });
  }

  /**
   * Get the next task ready for execution.
   */
  getNextReadyTask(level?: HierarchyLevel): Task | null {
    const pendingTasks = this.getPendingTasks()
      .filter((task) => {
        if (level !== undefined && task.level !== level) return false;
        return this.areDependenciesSatisfied(task.id);
      })
      .sort((a, b) => b.priority - a.priority);

    return pendingTasks[0] || null;
  }

  /**
   * Get tasks ready for execution at any level.
   */
  getReadyTasks(): Task[] {
    return this.getPendingTasks()
      .filter((task) => this.areDependenciesSatisfied(task.id))
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Calculate mission progress.
   */
  getMissionProgress(missionId: string): { completed: number; total: number; percentage: number } {
    const tasks = this.getTasksForMission(missionId);
    const completed = tasks.filter(
      (t) =>
        t.status === TaskStatus.COMPLETED ||
        t.status === TaskStatus.MERGED
    ).length;

    return {
      completed,
      total: tasks.length,
      percentage: tasks.length > 0 ? (completed / tasks.length) * 100 : 0,
    };
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  private createEmptyMetrics(): TaskMetrics {
    return {
      startTime: null,
      endTime: null,
      executionTimeMs: 0,
      tokensSent: 0,
      tokensReceived: 0,
      retryCount: 0,
    };
  }

  private async updateDependencies(completedTaskId: string): Promise<void> {
    // Find all tasks that depend on the completed task
    for (const task of this.tasks.values()) {
      for (const dep of task.dependencies) {
        if (dep.taskId === completedTaskId) {
          dep.status = 'satisfied';
        }
      }
    }
  }
}
