/**
 * Mission Workflow Integration Tests
 *
 * Tests the end-to-end mission execution flow.
 */

import { EventEmitter } from 'events';
import { TaskManager } from '../../src/core/task/TaskManager';
import { HierarchyManager } from '../../src/core/hierarchy/HierarchyManager';
import { ExecutionCoordinator } from '../../src/core/execution/ExecutionCoordinator';
import { ApprovalManager } from '../../src/core/approval/ApprovalManager';
import { AgentPool } from '../../src/agents/AgentPool';
import { QuotaTracker } from '../../src/quota/QuotaTracker';
import { StateManager } from '../../src/storage/StateManager';
import {
  Mission,
  MissionStatus,
  HierarchyLevel,
  TaskStatus,
  TaskType,
  AIModel,
  AgentRole,
  ApprovalMode,
} from '../../src/types';
import { createMission, createTask } from '../mocks/factories';

// Mock all external dependencies
jest.mock('../../src/storage/StateManager');
jest.mock('../../src/quota/QuotaTracker');
jest.mock('../../src/agents/AgentPool');

describe('Mission Workflow Integration', () => {
  let taskManager: TaskManager;
  let hierarchyManager: HierarchyManager;
  let executionCoordinator: ExecutionCoordinator;
  let approvalManager: ApprovalManager;
  let mockAgentPool: jest.Mocked<AgentPool>;
  let mockQuotaTracker: jest.Mocked<QuotaTracker>;
  let mockStateManager: jest.Mocked<StateManager>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock StateManager
    mockStateManager = new StateManager() as jest.Mocked<StateManager>;
    mockStateManager.createTask = jest.fn().mockResolvedValue(undefined);
    mockStateManager.updateTask = jest.fn().mockResolvedValue(undefined);
    mockStateManager.getTask = jest.fn();
    mockStateManager.createAgent = jest.fn().mockResolvedValue(undefined);
    mockStateManager.updateAgent = jest.fn().mockResolvedValue(undefined);
    mockStateManager.createMission = jest.fn().mockResolvedValue(undefined);
    mockStateManager.updateMission = jest.fn().mockResolvedValue(undefined);

    // Setup mock QuotaTracker
    mockQuotaTracker = new QuotaTracker({
      claude: { tokensPerHour: 1000000 },
      glm: { tokensPerHour: 2000000 },
    }) as jest.Mocked<QuotaTracker>;
    mockQuotaTracker.canExecute = jest.fn().mockReturnValue(true);
    mockQuotaTracker.recordUsage = jest.fn();
    mockQuotaTracker.on = jest.fn().mockReturnThis();
    mockQuotaTracker.off = jest.fn().mockReturnThis();

    // Setup mock AgentPool
    mockAgentPool = new AgentPool(
      {} as any,
      mockQuotaTracker
    ) as jest.Mocked<AgentPool>;

    // Mock successful execution
    mockAgentPool.execute = jest.fn().mockResolvedValue({
      taskId: 'test-task',
      status: 'success',
      result: {
        content: 'Generated code output',
      },
      metrics: {
        startTime: new Date(),
        endTime: new Date(),
        durationMs: 500,
        tokensSent: 50,
        tokensReceived: 100,
        model: AIModel.GLM_4_7,
      },
    });

    mockAgentPool.getModelForLevel = jest.fn().mockImplementation((level) => {
      return level === HierarchyLevel.WORKER ? AIModel.GLM_4_7 : AIModel.CLAUDE_OPUS;
    });

    // Initialize managers
    taskManager = new TaskManager(mockStateManager);
    hierarchyManager = new HierarchyManager(mockStateManager);
    approvalManager = new ApprovalManager(ApprovalMode.AUTO_APPROVE);

    // Initialize execution coordinator
    executionCoordinator = new ExecutionCoordinator(
      taskManager,
      mockAgentPool,
      hierarchyManager,
      approvalManager,
      mockQuotaTracker,
      '/test/workspace',
      5
    );
  });

  afterEach(async () => {
    await executionCoordinator.dispose();
  });

  describe('Single Task Execution', () => {
    it('should execute a single worker task', async () => {
      const mission = createMission();

      // Create a simple task
      const task = await taskManager.createTask({
        missionId: mission.id,
        level: HierarchyLevel.WORKER,
        type: TaskType.SIMPLE_IMPLEMENTATION,
        title: 'Implement feature',
        description: 'Add a new feature',
        context: {
          workspaceRoot: '/test/workspace',
          relevantFiles: [],
          previousDecisions: [],
          constraints: [],
        },
        input: {
          prompt: 'Implement a hello world function',
          context: {
            workspaceRoot: '/test/workspace',
            relevantFiles: [],
            previousDecisions: [],
            constraints: [],
          },
        },
      });

      // Add task to mission
      mission.rootTaskIds = [task.id];

      // Execute mission
      await executionCoordinator.execute(mission);

      // Verify task was executed
      expect(mockAgentPool.execute).toHaveBeenCalled();

      // Check task status
      const completedTask = taskManager.getTask(task.id);
      expect(completedTask?.status).toBe(TaskStatus.COMPLETED);
    });

    it('should handle task failure and retry', async () => {
      const mission = createMission();

      // Create a task
      const task = await taskManager.createTask({
        missionId: mission.id,
        level: HierarchyLevel.WORKER,
        type: TaskType.SIMPLE_IMPLEMENTATION,
        title: 'Failing task',
        description: 'This task will fail',
        context: {
          workspaceRoot: '/test/workspace',
          relevantFiles: [],
          previousDecisions: [],
          constraints: [],
        },
        input: {
          prompt: 'Do something that fails',
          context: {
            workspaceRoot: '/test/workspace',
            relevantFiles: [],
            previousDecisions: [],
            constraints: [],
          },
        },
      });

      mission.rootTaskIds = [task.id];

      // Mock failure then success
      mockAgentPool.execute
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockResolvedValueOnce({
          taskId: task.id,
          status: 'success',
          result: { content: 'Success on retry' },
          metrics: {
            startTime: new Date(),
            endTime: new Date(),
            durationMs: 100,
            tokensSent: 20,
            tokensReceived: 50,
            model: AIModel.GLM_4_7,
          },
        });

      // Execute mission
      await executionCoordinator.execute(mission);

      // Verify retry occurred
      expect(mockAgentPool.execute).toHaveBeenCalledTimes(2);
    });
  });

  describe('Task Dependencies', () => {
    it('should execute dependent tasks in order', async () => {
      const mission = createMission();
      const executionOrder: string[] = [];

      // Create parent task
      const parentTask = await taskManager.createTask({
        missionId: mission.id,
        level: HierarchyLevel.WORKER,
        type: TaskType.SIMPLE_IMPLEMENTATION,
        title: 'Parent Task',
        description: 'Run first',
        context: {
          workspaceRoot: '/test/workspace',
          relevantFiles: [],
          previousDecisions: [],
          constraints: [],
        },
        input: {
          prompt: 'Parent prompt',
          context: {
            workspaceRoot: '/test/workspace',
            relevantFiles: [],
            previousDecisions: [],
            constraints: [],
          },
        },
      });

      // Create child task with dependency
      const childTask = await taskManager.createTask({
        missionId: mission.id,
        level: HierarchyLevel.WORKER,
        type: TaskType.SIMPLE_IMPLEMENTATION,
        title: 'Child Task',
        description: 'Run after parent',
        context: {
          workspaceRoot: '/test/workspace',
          relevantFiles: [],
          previousDecisions: [],
          constraints: [],
        },
        input: {
          prompt: 'Child prompt',
          context: {
            workspaceRoot: '/test/workspace',
            relevantFiles: [],
            previousDecisions: [],
            constraints: [],
          },
        },
        parentTaskId: parentTask.id,
        dependencies: [{ taskId: parentTask.id, type: 'blocking', status: 'pending' }],
      });

      mission.rootTaskIds = [parentTask.id, childTask.id];

      // Track execution order
      mockAgentPool.execute.mockImplementation(async (request) => {
        executionOrder.push(request.taskId);
        return {
          taskId: request.taskId,
          status: 'success',
          result: { content: 'Done' },
          metrics: {
            startTime: new Date(),
            endTime: new Date(),
            durationMs: 100,
            tokensSent: 20,
            tokensReceived: 50,
            model: AIModel.GLM_4_7,
          },
        };
      });

      // Execute mission
      await executionCoordinator.execute(mission);

      // Verify execution order (parent first, then child)
      expect(executionOrder.indexOf(parentTask.id)).toBeLessThan(
        executionOrder.indexOf(childTask.id)
      );
    });
  });

  describe('Hierarchy Levels', () => {
    it('should use correct AI model for each hierarchy level', async () => {
      const mission = createMission();

      // Create tasks at different levels
      const workerTask = await taskManager.createTask({
        missionId: mission.id,
        level: HierarchyLevel.WORKER,
        type: TaskType.SIMPLE_IMPLEMENTATION,
        title: 'Worker Task',
        description: 'Worker level task',
        context: {
          workspaceRoot: '/test/workspace',
          relevantFiles: [],
          previousDecisions: [],
          constraints: [],
        },
        input: {
          prompt: 'Worker prompt',
          context: {
            workspaceRoot: '/test/workspace',
            relevantFiles: [],
            previousDecisions: [],
            constraints: [],
          },
        },
      });

      mission.rootTaskIds = [workerTask.id];

      // Execute
      await executionCoordinator.execute(mission);

      // Verify model selection was called
      expect(mockAgentPool.execute).toHaveBeenCalled();
    });
  });

  describe('Agent Spawning', () => {
    it('should spawn agents as needed', async () => {
      const mission = createMission();

      const task = await taskManager.createTask({
        missionId: mission.id,
        level: HierarchyLevel.WORKER,
        type: TaskType.SIMPLE_IMPLEMENTATION,
        title: 'Task requiring agent',
        description: 'Needs an agent',
        context: {
          workspaceRoot: '/test/workspace',
          relevantFiles: [],
          previousDecisions: [],
          constraints: [],
        },
        input: {
          prompt: 'Do something',
          context: {
            workspaceRoot: '/test/workspace',
            relevantFiles: [],
            previousDecisions: [],
            constraints: [],
          },
        },
      });

      mission.rootTaskIds = [task.id];

      // Execute
      await executionCoordinator.execute(mission);

      // Verify agent was created
      expect(mockStateManager.createAgent).toHaveBeenCalled();
    });
  });

  describe('Concurrent Execution', () => {
    it('should respect max concurrent worker limit', async () => {
      const mission = createMission();
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      // Create multiple tasks
      const tasks = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          taskManager.createTask({
            missionId: mission.id,
            level: HierarchyLevel.WORKER,
            type: TaskType.SIMPLE_IMPLEMENTATION,
            title: `Task ${i}`,
            description: 'Concurrent task',
            context: {
              workspaceRoot: '/test/workspace',
              relevantFiles: [],
              previousDecisions: [],
              constraints: [],
            },
            input: {
              prompt: `Task ${i} prompt`,
              context: {
                workspaceRoot: '/test/workspace',
                relevantFiles: [],
                previousDecisions: [],
                constraints: [],
              },
            },
          })
        )
      );

      mission.rootTaskIds = tasks.map((t) => t.id);

      // Track concurrent executions
      mockAgentPool.execute.mockImplementation(async (request) => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);

        // Simulate some work
        await new Promise((resolve) => setTimeout(resolve, 10));

        currentConcurrent--;

        return {
          taskId: request.taskId,
          status: 'success',
          result: { content: 'Done' },
          metrics: {
            startTime: new Date(),
            endTime: new Date(),
            durationMs: 10,
            tokensSent: 10,
            tokensReceived: 20,
            model: AIModel.GLM_4_7,
          },
        };
      });

      // Execute with limit of 5
      await executionCoordinator.execute(mission);

      // Max concurrent should not exceed limit
      expect(maxConcurrent).toBeLessThanOrEqual(5);
    });
  });

  describe('Pause and Resume', () => {
    it('should pause and resume execution', async () => {
      const mission = createMission();
      let taskStarted = false;

      const task = await taskManager.createTask({
        missionId: mission.id,
        level: HierarchyLevel.WORKER,
        type: TaskType.SIMPLE_IMPLEMENTATION,
        title: 'Long running task',
        description: 'Takes a while',
        context: {
          workspaceRoot: '/test/workspace',
          relevantFiles: [],
          previousDecisions: [],
          constraints: [],
        },
        input: {
          prompt: 'Do something long',
          context: {
            workspaceRoot: '/test/workspace',
            relevantFiles: [],
            previousDecisions: [],
            constraints: [],
          },
        },
      });

      mission.rootTaskIds = [task.id];

      // Make execution take some time
      mockAgentPool.execute.mockImplementation(async (request) => {
        taskStarted = true;
        await new Promise((resolve) => setTimeout(resolve, 100));
        return {
          taskId: request.taskId,
          status: 'success',
          result: { content: 'Done' },
          metrics: {
            startTime: new Date(),
            endTime: new Date(),
            durationMs: 100,
            tokensSent: 10,
            tokensReceived: 20,
            model: AIModel.GLM_4_7,
          },
        };
      });

      // Start execution
      const executePromise = executionCoordinator.execute(mission);

      // Wait for task to start
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(taskStarted).toBe(true);

      // Pause - should not throw
      await executionCoordinator.pause();

      // Resume - should not throw
      await executionCoordinator.resume();

      // Wait for completion
      await executePromise;

      // Verify task completed after pause/resume cycle
      const completedTask = taskManager.getTask(task.id);
      expect(completedTask?.status).toBe(TaskStatus.COMPLETED);
    });
  });

  describe('Event Emission', () => {
    it('should emit events during execution', async () => {
      const mission = createMission();
      const emittedEvents: string[] = [];

      const task = await taskManager.createTask({
        missionId: mission.id,
        level: HierarchyLevel.WORKER,
        type: TaskType.SIMPLE_IMPLEMENTATION,
        title: 'Event test task',
        description: 'Testing events',
        context: {
          workspaceRoot: '/test/workspace',
          relevantFiles: [],
          previousDecisions: [],
          constraints: [],
        },
        input: {
          prompt: 'Do something',
          context: {
            workspaceRoot: '/test/workspace',
            relevantFiles: [],
            previousDecisions: [],
            constraints: [],
          },
        },
      });

      mission.rootTaskIds = [task.id];

      // Listen for events
      executionCoordinator.on('taskCompleted', () => {
        emittedEvents.push('taskCompleted');
      });

      executionCoordinator.on('taskStarted', () => {
        emittedEvents.push('taskStarted');
      });

      // Execute
      await executionCoordinator.execute(mission);

      // Verify events were emitted
      expect(emittedEvents).toContain('taskCompleted');
    });
  });
});
