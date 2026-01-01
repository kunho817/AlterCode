/**
 * Execution Layer
 *
 * Re-exports all execution layer implementations:
 * - TaskManager
 * - AgentPool
 * - MissionManager
 * - ExecutionCoordinator
 */

// Task Manager
export { TaskManager, createTaskManager } from './TaskManager';

// Agent Pool
export { AgentPool, createAgentPool, AgentPoolConfig } from './AgentPool';

// Mission Manager
export { MissionManager, createMissionManager } from './MissionManager';

// Execution Coordinator
export {
  ExecutionCoordinator,
  createExecutionCoordinator,
  ExecutionCoordinatorConfig,
} from './ExecutionCoordinator';

// Agent Activity
export {
  AgentActivityService,
  createAgentActivityService,
} from './AgentActivityService';
