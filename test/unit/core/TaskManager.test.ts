/**
 * TaskManager Unit Tests
 */

import { TaskManager } from '../../../src/core/task/TaskManager';
import { StateManager } from '../../../src/storage/StateManager';
import { createTask, createMission } from '../../mocks/factories';
import { TaskStatus, TaskPriority, HierarchyLevel, TaskType, AIModel } from '../../../src/types';

// Mock StateManager
jest.mock('../../../src/storage/StateManager');

describe('TaskManager', () => {
  let taskManager: TaskManager;
  let mockStateManager: jest.Mocked<StateManager>;

  beforeEach(() => {
    mockStateManager = new StateManager() as jest.Mocked<StateManager>;
    mockStateManager.createTask = jest.fn().mockResolvedValue(undefined);
    mockStateManager.updateTask = jest.fn().mockResolvedValue(undefined);
    mockStateManager.getTask = jest.fn();
    mockStateManager.getTasks = jest.fn().mockResolvedValue([]);

    taskManager = new TaskManager(mockStateManager);
  });

  describe('createTask', () => {
    it('should create a task with default values', async () => {
      const mission = createMission();
      const task = await taskManager.createTask({
        missionId: mission.id,
        level: HierarchyLevel.WORKER,
        type: TaskType.SIMPLE_IMPLEMENTATION,
        title: 'Test Task',
        description: 'Test description',
        context: {
          workspaceRoot: '/workspace',
          relevantFiles: [],
          previousDecisions: [],
          constraints: [],
        },
        input: {
          prompt: 'Test prompt',
          context: {
            workspaceRoot: '/workspace',
            relevantFiles: [],
            previousDecisions: [],
            constraints: [],
          },
        },
      });

      expect(task).toBeDefined();
      expect(task.id).toBeDefined();
      expect(task.missionId).toBe(mission.id);
      expect(task.level).toBe(HierarchyLevel.WORKER);
      expect(task.title).toBe('Test Task');
      expect(task.status).toBe(TaskStatus.PENDING);
      expect(task.priority).toBe(TaskPriority.NORMAL);
    });

    it('should create a task with custom priority', async () => {
      const mission = createMission();
      const task = await taskManager.createTask({
        missionId: mission.id,
        level: HierarchyLevel.ARCHITECT,
        type: TaskType.ARCHITECTURE_DECISION,
        title: 'Critical Task',
        description: 'Critical task description',
        context: {
          workspaceRoot: '/workspace',
          relevantFiles: [],
          previousDecisions: [],
          constraints: [],
        },
        input: {
          prompt: 'Critical prompt',
          context: {
            workspaceRoot: '/workspace',
            relevantFiles: [],
            previousDecisions: [],
            constraints: [],
          },
        },
        priority: TaskPriority.CRITICAL,
      });

      expect(task.priority).toBe(TaskPriority.CRITICAL);
    });

    it('should create a task with parent', async () => {
      const mission = createMission();

      // Create parent task first
      const parentTask = await taskManager.createTask({
        missionId: mission.id,
        level: HierarchyLevel.ARCHITECT,
        type: TaskType.DOMAIN_DESIGN,
        title: 'Parent Task',
        description: 'Parent',
        context: {
          workspaceRoot: '/workspace',
          relevantFiles: [],
          previousDecisions: [],
          constraints: [],
        },
        input: {
          prompt: 'Parent prompt',
          context: {
            workspaceRoot: '/workspace',
            relevantFiles: [],
            previousDecisions: [],
            constraints: [],
          },
        },
      });

      const childTask = await taskManager.createTask({
        missionId: mission.id,
        level: HierarchyLevel.WORKER,
        type: TaskType.SIMPLE_IMPLEMENTATION,
        title: 'Child Task',
        description: 'Child',
        context: {
          workspaceRoot: '/workspace',
          relevantFiles: [],
          previousDecisions: [],
          constraints: [],
        },
        input: {
          prompt: 'Child prompt',
          context: {
            workspaceRoot: '/workspace',
            relevantFiles: [],
            previousDecisions: [],
            constraints: [],
          },
        },
        parentTaskId: parentTask.id,
      });

      expect(childTask.parentTaskId).toBe(parentTask.id);
    });
  });

  describe('task status transitions', () => {
    it('should start a task', async () => {
      const task = createTask({ status: TaskStatus.PENDING });
      taskManager['tasks'].set(task.id, task);

      await taskManager.startTask(task.id);

      expect(task.status).toBe(TaskStatus.RUNNING);
      expect(task.startedAt).toBeDefined();
    });

    it('should complete a task', async () => {
      const task = createTask({ status: TaskStatus.RUNNING });
      taskManager['tasks'].set(task.id, task);

      const output = {
        result: 'Task completed',
        fileChanges: [],
        decisions: [],
        metrics: {
          startTime: new Date(),
          endTime: new Date(),
          durationMs: 1000,
          tokensSent: 100,
          tokensReceived: 200,
          model: AIModel.GLM_4_7,
        },
      };

      await taskManager.completeTask(task.id, output);

      expect(task.status).toBe(TaskStatus.COMPLETED);
      expect(task.completedAt).toBeDefined();
      expect(task.output).toEqual(output);
    });

    it('should fail a task', async () => {
      const task = createTask({ status: TaskStatus.RUNNING });
      taskManager['tasks'].set(task.id, task);

      const error = new Error('Task failed');
      await taskManager.failTask(task.id, error);

      // First failure should reset to pending for retry
      expect(task.status).toBe(TaskStatus.PENDING);
      expect(task.metrics.retryCount).toBe(1);
    });

    it('should cancel a task', async () => {
      const task = createTask({ status: TaskStatus.RUNNING });
      taskManager['tasks'].set(task.id, task);

      await taskManager.cancelTask(task.id);

      expect(task.status).toBe(TaskStatus.CANCELLED);
    });
  });

  describe('task assignment', () => {
    it('should assign a task to an agent', async () => {
      const task = createTask({ status: TaskStatus.PENDING });
      taskManager['tasks'].set(task.id, task);

      await taskManager.assignTask(task.id, 'agent-123');

      expect(task.assignedAgentId).toBe('agent-123');
      expect(task.status).toBe(TaskStatus.ASSIGNED);
    });
  });

  describe('task queries', () => {
    beforeEach(() => {
      // Add tasks with various states
      const pendingTask = createTask({ status: TaskStatus.PENDING });
      const runningTask = createTask({ status: TaskStatus.RUNNING });
      const completedTask = createTask({ status: TaskStatus.COMPLETED });

      taskManager['tasks'].set(pendingTask.id, pendingTask);
      taskManager['tasks'].set(runningTask.id, runningTask);
      taskManager['tasks'].set(completedTask.id, completedTask);

      // Update status tracking
      taskManager['tasksByStatus'].get(TaskStatus.PENDING)?.add(pendingTask.id);
      taskManager['tasksByStatus'].get(TaskStatus.RUNNING)?.add(runningTask.id);
      taskManager['tasksByStatus'].get(TaskStatus.COMPLETED)?.add(completedTask.id);
    });

    it('should get pending tasks', () => {
      const pending = taskManager.getPendingTasks();
      expect(pending.length).toBe(1);
      expect(pending[0]!.status).toBe(TaskStatus.PENDING);
    });

    it('should get running tasks', () => {
      const running = taskManager.getRunningTasks();
      expect(running.length).toBe(1);
      expect(running[0]!.status).toBe(TaskStatus.RUNNING);
    });

    it('should get completed tasks', () => {
      const completed = taskManager.getCompletedTasks();
      expect(completed.length).toBe(1);
      expect(completed[0]!.status).toBe(TaskStatus.COMPLETED);
    });

    it('should get ready tasks (pending with no blocking deps)', () => {
      const ready = taskManager.getReadyTasks();
      expect(ready.length).toBe(1);
    });
  });

  describe('dependencies', () => {
    it('should create task with dependencies', async () => {
      const mission = createMission();

      const task1 = await taskManager.createTask({
        missionId: mission.id,
        level: HierarchyLevel.WORKER,
        type: TaskType.SIMPLE_IMPLEMENTATION,
        title: 'Task 1',
        description: 'First task',
        context: {
          workspaceRoot: '/workspace',
          relevantFiles: [],
          previousDecisions: [],
          constraints: [],
        },
        input: {
          prompt: 'Task 1 prompt',
          context: {
            workspaceRoot: '/workspace',
            relevantFiles: [],
            previousDecisions: [],
            constraints: [],
          },
        },
      });

      const task2 = await taskManager.createTask({
        missionId: mission.id,
        level: HierarchyLevel.WORKER,
        type: TaskType.SIMPLE_IMPLEMENTATION,
        title: 'Task 2',
        description: 'Second task that depends on first',
        context: {
          workspaceRoot: '/workspace',
          relevantFiles: [],
          previousDecisions: [],
          constraints: [],
        },
        input: {
          prompt: 'Task 2 prompt',
          context: {
            workspaceRoot: '/workspace',
            relevantFiles: [],
            previousDecisions: [],
            constraints: [],
          },
        },
        dependencies: [{ taskId: task1.id, type: 'blocking', status: 'pending' }],
      });

      expect(task2.dependencies.length).toBe(1);
      expect(task2.dependencies[0]!.taskId).toBe(task1.id);
      expect(task2.dependencies[0]!.type).toBe('blocking');
    });

    it('should check if dependencies are satisfied', async () => {
      const task1 = createTask({ status: TaskStatus.COMPLETED });
      const task2 = createTask({
        dependencies: [{ taskId: task1.id, type: 'blocking', status: 'pending' }],
      });

      taskManager['tasks'].set(task1.id, task1);
      taskManager['tasks'].set(task2.id, task2);

      const satisfied = taskManager.areDependenciesSatisfied(task2.id);
      expect(satisfied).toBe(true);
    });

    it('should not satisfy dependencies when task is incomplete', async () => {
      const task1 = createTask({ status: TaskStatus.RUNNING });
      const task2 = createTask({
        dependencies: [{ taskId: task1.id, type: 'blocking', status: 'pending' }],
      });

      taskManager['tasks'].set(task1.id, task1);
      taskManager['tasks'].set(task2.id, task2);

      const satisfied = taskManager.areDependenciesSatisfied(task2.id);
      expect(satisfied).toBe(false);
    });
  });

  describe('mission progress', () => {
    it('should calculate mission progress', () => {
      const missionId = 'mission-1';

      const task1 = createTask({ missionId, status: TaskStatus.COMPLETED });
      const task2 = createTask({ missionId, status: TaskStatus.RUNNING });
      const task3 = createTask({ missionId, status: TaskStatus.PENDING });

      taskManager['tasks'].set(task1.id, task1);
      taskManager['tasks'].set(task2.id, task2);
      taskManager['tasks'].set(task3.id, task3);

      // Add to mission tracking
      taskManager['tasksByMission'].set(missionId, new Set([task1.id, task2.id, task3.id]));

      const progress = taskManager.getMissionProgress(missionId);

      expect(progress.total).toBe(3);
      expect(progress.completed).toBe(1);
      expect(progress.percentage).toBeCloseTo(33.33, 1);
    });
  });

  describe('getTask', () => {
    it('should return task by id', () => {
      const task = createTask();
      taskManager['tasks'].set(task.id, task);

      const found = taskManager.getTask(task.id);
      expect(found).toBeDefined();
      expect(found?.id).toBe(task.id);
    });

    it('should return null for unknown task', () => {
      const found = taskManager.getTask('unknown-id');
      expect(found).toBeNull();
    });
  });

  describe('getNextReadyTask', () => {
    it('should return highest priority ready task', () => {
      const lowPriorityTask = createTask({
        status: TaskStatus.PENDING,
        priority: TaskPriority.LOW,
      });
      const highPriorityTask = createTask({
        status: TaskStatus.PENDING,
        priority: TaskPriority.HIGH,
      });

      taskManager['tasks'].set(lowPriorityTask.id, lowPriorityTask);
      taskManager['tasks'].set(highPriorityTask.id, highPriorityTask);
      taskManager['tasksByStatus'].get(TaskStatus.PENDING)?.add(lowPriorityTask.id);
      taskManager['tasksByStatus'].get(TaskStatus.PENDING)?.add(highPriorityTask.id);

      const nextTask = taskManager.getNextReadyTask();
      expect(nextTask?.id).toBe(highPriorityTask.id);
    });

    it('should filter by level when specified', () => {
      const workerTask = createTask({
        status: TaskStatus.PENDING,
        level: HierarchyLevel.WORKER,
      });
      const architectTask = createTask({
        status: TaskStatus.PENDING,
        level: HierarchyLevel.ARCHITECT,
      });

      taskManager['tasks'].set(workerTask.id, workerTask);
      taskManager['tasks'].set(architectTask.id, architectTask);
      taskManager['tasksByStatus'].get(TaskStatus.PENDING)?.add(workerTask.id);
      taskManager['tasksByStatus'].get(TaskStatus.PENDING)?.add(architectTask.id);

      const nextTask = taskManager.getNextReadyTask(HierarchyLevel.WORKER);
      expect(nextTask?.level).toBe(HierarchyLevel.WORKER);
    });
  });
});
