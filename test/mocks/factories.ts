/**
 * Test Factories
 *
 * Factory functions for creating test objects.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Task,
  TaskStatus,
  TaskType,
  TaskPriority,
  HierarchyLevel,
  HierarchyAgent,
  AgentRole,
  AgentStatus,
  AIModel,
  Mission,
  MissionStatus,
  FileChange,
  CodeRegion,
  RegionType,
  VirtualBranch,
  ApprovalMode,
  AgentRequest,
  AgentResponse,
  ExecutionMetrics,
} from '../../src/types';

/**
 * Create a test task.
 */
export function createTask(overrides: Partial<Task> = {}): Task {
  const id = overrides.id || uuidv4();
  const missionId = overrides.missionId || uuidv4();

  return {
    id,
    missionId,
    parentTaskId: null,
    childTaskIds: [],
    level: HierarchyLevel.WORKER,
    assignedAgentId: null,
    type: TaskType.SIMPLE_IMPLEMENTATION,
    status: TaskStatus.PENDING,
    priority: TaskPriority.NORMAL,
    title: `Test Task ${id.substring(0, 8)}`,
    description: 'A test task for unit testing',
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
    output: null,
    dependencies: [],
    createdAt: new Date(),
    startedAt: null,
    completedAt: null,
    metrics: {
      startTime: null,
      endTime: null,
      executionTimeMs: 0,
      tokensSent: 0,
      tokensReceived: 0,
      retryCount: 0,
    },
    ...overrides,
  };
}

/**
 * Create a test agent.
 */
export function createAgent(overrides: Partial<HierarchyAgent> = {}): HierarchyAgent {
  const id = overrides.id || uuidv4();

  return {
    id,
    level: HierarchyLevel.WORKER,
    role: AgentRole.WORKER,
    parentId: null,
    childIds: [],
    status: AgentStatus.IDLE,
    currentTaskId: null,
    model: AIModel.GLM_4_7,
    metrics: {
      tasksCompleted: 0,
      tasksFailed: 0,
      averageExecutionTimeMs: 0,
      tokensSent: 0,
      tokensReceived: 0,
      lastActiveAt: null,
    },
    createdAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a test mission.
 */
export function createMission(overrides: Partial<Mission> = {}): Mission {
  const id = overrides.id || uuidv4();

  return {
    id,
    title: `Test Mission ${id.substring(0, 8)}`,
    description: 'A test mission for unit testing',
    planningDocument: '# Test Plan\n\nThis is a test planning document.',
    status: MissionStatus.PENDING,
    rootTaskIds: [],
    config: {
      approvalMode: ApprovalMode.FULLY_MANUAL,
      maxConcurrentWorkers: 10,
    },
    createdAt: new Date(),
    startedAt: null,
    completedAt: null,
    ...overrides,
  };
}

/**
 * Create a test file change.
 */
export function createFileChange(overrides: Partial<FileChange> = {}): FileChange {
  return {
    filePath: 'src/test/file.ts',
    originalContent: '// original content',
    modifiedContent: '// modified content',
    diff: '--- a/src/test/file.ts\n+++ b/src/test/file.ts\n@@ -1 +1 @@\n-// original content\n+// modified content',
    changeType: 'modify',
    ...overrides,
  };
}

/**
 * Create a test code region.
 */
export function createCodeRegion(overrides: Partial<CodeRegion> = {}): CodeRegion {
  return {
    id: uuidv4(),
    filePath: 'src/test/file.ts',
    type: RegionType.FUNCTION,
    name: 'testFunction',
    startLine: 1,
    endLine: 10,
    dependencies: [],
    modifiedBy: null,
    ...overrides,
  };
}

/**
 * Create a test virtual branch.
 */
export function createVirtualBranch(overrides: Partial<VirtualBranch> = {}): VirtualBranch {
  return {
    id: uuidv4(),
    agentId: uuidv4(),
    taskId: uuidv4(),
    baseSnapshot: JSON.stringify({ timestamp: new Date().toISOString() }),
    changes: [],
    status: 'active',
    createdAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a test agent request.
 */
export function createAgentRequest(overrides: Partial<AgentRequest> = {}): AgentRequest {
  return {
    taskId: uuidv4(),
    prompt: 'Test prompt',
    context: {
      workspaceRoot: '/workspace',
      relevantFiles: [],
      previousDecisions: [],
      constraints: [],
    },
    constraints: {},
    ...overrides,
  };
}

/**
 * Create a test agent response.
 */
export function createAgentResponse(overrides: Partial<AgentResponse> = {}): AgentResponse {
  return {
    taskId: uuidv4(),
    status: 'success',
    result: {
      content: 'Test response content',
    },
    metrics: createExecutionMetrics(),
    ...overrides,
  };
}

/**
 * Create test execution metrics.
 */
export function createExecutionMetrics(overrides: Partial<ExecutionMetrics> = {}): ExecutionMetrics {
  const startTime = new Date();
  const endTime = new Date(startTime.getTime() + 1000);

  return {
    startTime,
    endTime,
    durationMs: 1000,
    tokensSent: 100,
    tokensReceived: 200,
    model: AIModel.GLM_4_7,
    ...overrides,
  };
}

/**
 * Create a sample TypeScript file content.
 */
export function createSampleTypeScriptFile(): string {
  return `import { Logger } from './logger';

interface User {
  id: string;
  name: string;
}

class UserService {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  getUser(id: string): User | null {
    this.logger.info(\`Getting user \${id}\`);
    return null;
  }
}

export function createUserService(logger: Logger): UserService {
  return new UserService(logger);
}

export const DEFAULT_USER: User = {
  id: 'default',
  name: 'Default User',
};
`;
}

/**
 * Wait for a specified time.
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
