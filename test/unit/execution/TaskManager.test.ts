/**
 * TaskManager Unit Tests
 */

import { TaskManager } from '../../../src/execution/TaskManager';
import { EventBus } from '../../../src/infrastructure/EventBus';
import {
  IEventBus,
  ILogger,
  MissionId,
  TaskId,
  Task,
  toMissionId,
} from '../../../src/types';

// Mock logger
const createMockLogger = (): ILogger => ({
  component: 'Test',
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  child: jest.fn().mockReturnThis(),
});

describe('TaskManager', () => {
  let taskManager: TaskManager;
  let eventBus: IEventBus;
  let logger: ILogger;

  const testMissionId = toMissionId('mission-test-123');

  beforeEach(() => {
    eventBus = new EventBus();
    logger = createMockLogger();
    taskManager = new TaskManager(eventBus, logger);
  });

  describe('create', () => {
    it('should create a task successfully', async () => {
      const result = await taskManager.create(testMissionId, {
        type: 'analyze',
        description: 'Test task',
        priority: 'normal',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.missionId).toBe(testMissionId);
        expect(result.value.description).toBe('Test task');
        expect(result.value.status).toBe('pending');
        expect(result.value.type).toBe('analyze');
      }
    });

    it('should assign unique task IDs', async () => {
      const result1 = await taskManager.create(testMissionId, {
        type: 'analyze',
        description: 'Task 1',
      });
      const result2 = await taskManager.create(testMissionId, {
        type: 'analyze',
        description: 'Task 2',
      });

      expect(result1.ok && result2.ok).toBe(true);
      if (result1.ok && result2.ok) {
        expect(result1.value.id).not.toBe(result2.value.id);
      }
    });

    it('should emit task:created event', async () => {
      const eventHandler = jest.fn();
      eventBus.on('task:created', eventHandler);

      await taskManager.create(testMissionId, {
        type: 'analyze',
        description: 'Test task',
      });

      await new Promise(resolve => setTimeout(resolve, 10));
      expect(eventHandler).toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('should return task by ID', async () => {
      const createResult = await taskManager.create(testMissionId, {
        type: 'analyze',
        description: 'Test task',
      });

      expect(createResult.ok).toBe(true);
      if (createResult.ok) {
        const task = taskManager.get(createResult.value.id);
        expect(task).toBeDefined();
        expect(task?.description).toBe('Test task');
      }
    });

    it('should return undefined for non-existent task', () => {
      const task = taskManager.get('non-existent' as TaskId);
      expect(task).toBeUndefined();
    });
  });

  describe('getByMission', () => {
    it('should return all tasks for a mission', async () => {
      await taskManager.create(testMissionId, { type: 'analyze', description: 'Task 1' });
      await taskManager.create(testMissionId, { type: 'plan', description: 'Task 2' });

      const otherMissionId = toMissionId('mission-other');
      await taskManager.create(otherMissionId, { type: 'analyze', description: 'Other task' });

      const tasks = taskManager.getByMission(testMissionId);

      expect(tasks).toHaveLength(2);
      expect(tasks.every(t => t.missionId === testMissionId)).toBe(true);
    });

    it('should return empty array for mission with no tasks', () => {
      const tasks = taskManager.getByMission(toMissionId('empty-mission'));
      expect(tasks).toHaveLength(0);
    });
  });

  describe('start', () => {
    it('should start a pending task', async () => {
      const createResult = await taskManager.create(testMissionId, {
        type: 'analyze',
        description: 'Test task',
      });

      expect(createResult.ok).toBe(true);
      if (createResult.ok) {
        const startResult = await taskManager.start(createResult.value.id);
        expect(startResult.ok).toBe(true);

        const task = taskManager.get(createResult.value.id);
        expect(task?.status).toBe('running');
        expect(task?.startedAt).toBeDefined();
      }
    });

    it('should fail to start non-existent task', async () => {
      const result = await taskManager.start('non-existent' as TaskId);
      expect(result.ok).toBe(false);
    });

    it('should fail to start already running task', async () => {
      const createResult = await taskManager.create(testMissionId, {
        type: 'analyze',
        description: 'Test task',
      });

      expect(createResult.ok).toBe(true);
      if (createResult.ok) {
        await taskManager.start(createResult.value.id);
        const secondStart = await taskManager.start(createResult.value.id);
        expect(secondStart.ok).toBe(false);
      }
    });
  });

  describe('complete', () => {
    it('should complete a running task with success', async () => {
      const createResult = await taskManager.create(testMissionId, {
        type: 'analyze',
        description: 'Test task',
      });

      expect(createResult.ok).toBe(true);
      if (createResult.ok) {
        await taskManager.start(createResult.value.id);
        const completeResult = await taskManager.complete(createResult.value.id, {
          success: true,
          output: 'Task output',
        });

        expect(completeResult.ok).toBe(true);

        const task = taskManager.get(createResult.value.id);
        expect(task?.status).toBe('completed');
        expect(task?.completedAt).toBeDefined();
      }
    });

    it('should mark task as failed when success is false', async () => {
      const createResult = await taskManager.create(testMissionId, {
        type: 'analyze',
        description: 'Test task',
      });

      expect(createResult.ok).toBe(true);
      if (createResult.ok) {
        await taskManager.start(createResult.value.id);
        const completeResult = await taskManager.complete(createResult.value.id, {
          success: false,
          error: 'Task failed',
        });

        expect(completeResult.ok).toBe(true);

        const task = taskManager.get(createResult.value.id);
        expect(task?.status).toBe('failed');
        expect(task?.completedAt).toBeDefined();
      }
    });

    it('should fail to complete non-running task', async () => {
      const createResult = await taskManager.create(testMissionId, {
        type: 'analyze',
        description: 'Test task',
      });

      expect(createResult.ok).toBe(true);
      if (createResult.ok) {
        // Task is still pending, not running
        const completeResult = await taskManager.complete(createResult.value.id, {
          success: true,
        });
        expect(completeResult.ok).toBe(false);
      }
    });
  });

  describe('cancel', () => {
    it('should cancel a pending task', async () => {
      const createResult = await taskManager.create(testMissionId, {
        type: 'analyze',
        description: 'Test task',
      });

      expect(createResult.ok).toBe(true);
      if (createResult.ok) {
        const cancelResult = await taskManager.cancel(createResult.value.id, 'Cancelled by test');

        expect(cancelResult.ok).toBe(true);

        const task = taskManager.get(createResult.value.id);
        expect(task?.status).toBe('cancelled');
      }
    });

    it('should cancel a running task', async () => {
      const createResult = await taskManager.create(testMissionId, {
        type: 'analyze',
        description: 'Test task',
      });

      expect(createResult.ok).toBe(true);
      if (createResult.ok) {
        await taskManager.start(createResult.value.id);
        const cancelResult = await taskManager.cancel(createResult.value.id, 'Cancelled by test');

        expect(cancelResult.ok).toBe(true);

        const task = taskManager.get(createResult.value.id);
        expect(task?.status).toBe('cancelled');
      }
    });

    it('should fail to cancel completed task', async () => {
      const createResult = await taskManager.create(testMissionId, {
        type: 'analyze',
        description: 'Test task',
      });

      expect(createResult.ok).toBe(true);
      if (createResult.ok) {
        await taskManager.start(createResult.value.id);
        await taskManager.complete(createResult.value.id, { success: true });

        const cancelResult = await taskManager.cancel(createResult.value.id, 'Too late');
        expect(cancelResult.ok).toBe(false);
      }
    });
  });

  describe('getStats', () => {
    it('should return correct task statistics', async () => {
      // Create tasks in various states
      const task1 = await taskManager.create(testMissionId, { type: 'analyze', description: 'Pending' });
      const task2 = await taskManager.create(testMissionId, { type: 'analyze', description: 'Running' });
      const task3 = await taskManager.create(testMissionId, { type: 'analyze', description: 'Completed' });
      const task4 = await taskManager.create(testMissionId, { type: 'analyze', description: 'Failed' });

      if (task2.ok) await taskManager.start(task2.value.id);
      if (task3.ok) {
        await taskManager.start(task3.value.id);
        await taskManager.complete(task3.value.id, { success: true });
      }
      if (task4.ok) {
        await taskManager.start(task4.value.id);
        await taskManager.complete(task4.value.id, { success: false, error: 'Error' });
      }

      const stats = taskManager.getStats();

      expect(stats.total).toBe(4);
      expect(stats.pending).toBe(1);
      expect(stats.running).toBe(1);
      expect(stats.completed).toBe(1);
      expect(stats.failed).toBe(1);
    });
  });

  describe('clearCompleted', () => {
    it('should remove completed and cancelled tasks', async () => {
      const task1 = await taskManager.create(testMissionId, { type: 'analyze', description: 'Completed' });
      const task2 = await taskManager.create(testMissionId, { type: 'analyze', description: 'Pending' });
      const task3 = await taskManager.create(testMissionId, { type: 'analyze', description: 'Cancelled' });

      if (task1.ok) {
        await taskManager.start(task1.value.id);
        await taskManager.complete(task1.value.id, { success: true });
      }
      if (task3.ok) {
        await taskManager.cancel(task3.value.id, 'Cancelled');
      }

      taskManager.clearCompleted(testMissionId);

      const tasks = taskManager.getByMission(testMissionId);
      expect(tasks).toHaveLength(1);
      expect(tasks[0]?.status).toBe('pending');
    });
  });

  describe('getResult', () => {
    it('should return task result after completion', async () => {
      const createResult = await taskManager.create(testMissionId, {
        type: 'analyze',
        description: 'Test task',
      });

      expect(createResult.ok).toBe(true);
      if (createResult.ok) {
        await taskManager.start(createResult.value.id);
        await taskManager.complete(createResult.value.id, {
          success: true,
          output: 'Task output',
        });

        const result = taskManager.getResult(createResult.value.id);
        expect(result).toBeDefined();
        expect(result?.success).toBe(true);
        expect(result?.output).toBe('Task output');
      }
    });
  });

  describe('getNext', () => {
    it('should return next pending task', async () => {
      await taskManager.create(testMissionId, { type: 'analyze', description: 'Task 1' });
      await taskManager.create(testMissionId, { type: 'plan', description: 'Task 2' });

      const next = taskManager.getNext();

      expect(next).toBeDefined();
      expect(next?.description).toBe('Task 1');
    });

    it('should respect priority ordering', async () => {
      await taskManager.create(testMissionId, { type: 'analyze', description: 'Low', priority: 'low' });
      await taskManager.create(testMissionId, { type: 'analyze', description: 'High', priority: 'high' });

      const next = taskManager.getNext();

      expect(next?.description).toBe('High');
    });
  });

  describe('retry', () => {
    it('should create new task from failed task', async () => {
      const createResult = await taskManager.create(testMissionId, {
        type: 'analyze',
        description: 'Will fail',
      });

      expect(createResult.ok).toBe(true);
      if (createResult.ok) {
        await taskManager.start(createResult.value.id);
        await taskManager.complete(createResult.value.id, { success: false, error: 'Failed' });

        const retryResult = await taskManager.retry(createResult.value.id);

        expect(retryResult.ok).toBe(true);
        if (retryResult.ok) {
          expect(retryResult.value.description).toBe('Will fail');
          expect(retryResult.value.status).toBe('pending');
          expect(retryResult.value.id).not.toBe(createResult.value.id);
        }
      }
    });

    it('should fail to retry non-failed task', async () => {
      const createResult = await taskManager.create(testMissionId, {
        type: 'analyze',
        description: 'Test',
      });

      expect(createResult.ok).toBe(true);
      if (createResult.ok) {
        const retryResult = await taskManager.retry(createResult.value.id);
        expect(retryResult.ok).toBe(false);
      }
    });
  });
});
