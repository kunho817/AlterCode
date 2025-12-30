/**
 * HierarchyManager Unit Tests
 */

import { HierarchyManager } from '../../../src/core/hierarchy/HierarchyManager';
import { StateManager } from '../../../src/storage/StateManager';
import { createAgent } from '../../mocks/factories';
import { HierarchyLevel, AgentRole, AgentStatus, AIModel } from '../../../src/types';

// Mock StateManager
jest.mock('../../../src/storage/StateManager');

describe('HierarchyManager', () => {
  let hierarchyManager: HierarchyManager;
  let mockStateManager: jest.Mocked<StateManager>;

  beforeEach(() => {
    mockStateManager = new StateManager() as jest.Mocked<StateManager>;
    mockStateManager.createAgent = jest.fn().mockResolvedValue(undefined);
    mockStateManager.updateAgent = jest.fn().mockResolvedValue(undefined);
    mockStateManager.getAgent = jest.fn();

    hierarchyManager = new HierarchyManager(mockStateManager);
  });

  describe('spawnAgent', () => {
    it('should spawn a WORKER agent', async () => {
      const agent = await hierarchyManager.spawnAgent({
        level: HierarchyLevel.WORKER,
        role: AgentRole.WORKER,
        parentId: null,
      });

      expect(agent).toBeDefined();
      expect(agent.id).toBeDefined();
      expect(agent.level).toBe(HierarchyLevel.WORKER);
      expect(agent.role).toBe(AgentRole.WORKER);
      expect(agent.status).toBe(AgentStatus.IDLE);
      expect(agent.model).toBe(AIModel.GLM_4_7);
    });

    it('should spawn an ARCHITECT agent', async () => {
      const agent = await hierarchyManager.spawnAgent({
        level: HierarchyLevel.ARCHITECT,
        role: AgentRole.FRONTEND_ARCHITECT,
        parentId: null,
      });

      expect(agent.level).toBe(HierarchyLevel.ARCHITECT);
      expect(agent.role).toBe(AgentRole.FRONTEND_ARCHITECT);
      expect(agent.model).toBe(AIModel.CLAUDE_OPUS);
    });

    it('should spawn agent with parent', async () => {
      const parent = await hierarchyManager.spawnAgent({
        level: HierarchyLevel.TEAM_LEAD,
        role: AgentRole.TEAM_LEAD,
        parentId: null,
      });

      const child = await hierarchyManager.spawnAgent({
        level: HierarchyLevel.WORKER,
        role: AgentRole.WORKER,
        parentId: parent.id,
      });

      expect(child.parentId).toBe(parent.id);
      expect(parent.childIds).toContain(child.id);
    });

    it('should use model preference when specified', async () => {
      const agent = await hierarchyManager.spawnAgent({
        level: HierarchyLevel.WORKER,
        role: AgentRole.WORKER,
        parentId: null,
        modelPreference: 'claude',
      });

      expect(agent.model).toBe(AIModel.CLAUDE_OPUS);
    });
  });

  describe('findOrSpawnAgent', () => {
    it('should find an idle agent', async () => {
      // Spawn an idle worker
      const existingAgent = await hierarchyManager.spawnAgent({
        level: HierarchyLevel.WORKER,
        role: AgentRole.WORKER,
        parentId: null,
      });

      // Try to find or spawn
      const agent = await hierarchyManager.findOrSpawnAgent(
        HierarchyLevel.WORKER,
        AgentRole.WORKER,
        null
      );

      expect(agent.id).toBe(existingAgent.id);
    });

    it('should spawn new agent when none idle', async () => {
      // Spawn a busy worker
      const busyAgent = await hierarchyManager.spawnAgent({
        level: HierarchyLevel.WORKER,
        role: AgentRole.WORKER,
        parentId: null,
      });
      await hierarchyManager.updateAgentStatus(busyAgent.id, AgentStatus.BUSY);

      // Try to find or spawn - should create new
      const agent = await hierarchyManager.findOrSpawnAgent(
        HierarchyLevel.WORKER,
        AgentRole.WORKER,
        null
      );

      expect(agent.id).not.toBe(busyAgent.id);
      expect(agent.status).toBe(AgentStatus.IDLE);
    });
  });

  describe('getAgent', () => {
    it('should get agent by ID', async () => {
      const spawned = await hierarchyManager.spawnAgent({
        level: HierarchyLevel.WORKER,
        role: AgentRole.WORKER,
        parentId: null,
      });

      const agent = hierarchyManager.getAgent(spawned.id);

      expect(agent).toBeDefined();
      expect(agent?.id).toBe(spawned.id);
    });

    it('should return null for unknown agent', () => {
      const agent = hierarchyManager.getAgent('unknown-id');
      expect(agent).toBeNull();
    });
  });

  describe('getAgentsAtLevel', () => {
    it('should get all agents at a level', async () => {
      await hierarchyManager.spawnAgent({
        level: HierarchyLevel.WORKER,
        role: AgentRole.WORKER,
        parentId: null,
      });
      await hierarchyManager.spawnAgent({
        level: HierarchyLevel.WORKER,
        role: AgentRole.WORKER,
        parentId: null,
      });
      await hierarchyManager.spawnAgent({
        level: HierarchyLevel.ARCHITECT,
        role: AgentRole.FRONTEND_ARCHITECT,
        parentId: null,
      });

      const workers = hierarchyManager.getAgentsAtLevel(HierarchyLevel.WORKER);
      expect(workers.length).toBe(2);

      const architects = hierarchyManager.getAgentsAtLevel(HierarchyLevel.ARCHITECT);
      expect(architects.length).toBe(1);
    });
  });

  describe('assignTask', () => {
    it('should assign a task to an agent', async () => {
      const agent = await hierarchyManager.spawnAgent({
        level: HierarchyLevel.WORKER,
        role: AgentRole.WORKER,
        parentId: null,
      });

      await hierarchyManager.assignTask(agent.id, 'task-123');

      expect(agent.currentTaskId).toBe('task-123');
      expect(agent.status).toBe(AgentStatus.BUSY);
    });

    it('should throw for unknown agent', async () => {
      await expect(
        hierarchyManager.assignTask('unknown-id', 'task-123')
      ).rejects.toThrow();
    });
  });

  describe('completeTask', () => {
    it('should complete task and update metrics', async () => {
      const agent = await hierarchyManager.spawnAgent({
        level: HierarchyLevel.WORKER,
        role: AgentRole.WORKER,
        parentId: null,
      });

      await hierarchyManager.assignTask(agent.id, 'task-123');
      await hierarchyManager.completeTask(agent.id, true);

      expect(agent.currentTaskId).toBeNull();
      expect(agent.status).toBe(AgentStatus.IDLE);
      expect(agent.metrics.tasksCompleted).toBe(1);
      expect(agent.metrics.tasksFailed).toBe(0);
    });

    it('should track failed tasks', async () => {
      const agent = await hierarchyManager.spawnAgent({
        level: HierarchyLevel.WORKER,
        role: AgentRole.WORKER,
        parentId: null,
      });

      await hierarchyManager.assignTask(agent.id, 'task-123');
      await hierarchyManager.completeTask(agent.id, false);

      expect(agent.metrics.tasksCompleted).toBe(0);
      expect(agent.metrics.tasksFailed).toBe(1);
    });
  });

  describe('terminateAgent', () => {
    it('should terminate an agent', async () => {
      const agent = await hierarchyManager.spawnAgent({
        level: HierarchyLevel.WORKER,
        role: AgentRole.WORKER,
        parentId: null,
      });

      await hierarchyManager.terminateAgent(agent.id);

      expect(agent.status).toBe(AgentStatus.TERMINATED);
    });

    it('should cascade termination to children when requested', async () => {
      const parent = await hierarchyManager.spawnAgent({
        level: HierarchyLevel.TEAM_LEAD,
        role: AgentRole.TEAM_LEAD,
        parentId: null,
      });

      const child = await hierarchyManager.spawnAgent({
        level: HierarchyLevel.WORKER,
        role: AgentRole.WORKER,
        parentId: parent.id,
      });

      await hierarchyManager.terminateAgent(parent.id, true);

      expect(parent.status).toBe(AgentStatus.TERMINATED);
      expect(child.status).toBe(AgentStatus.TERMINATED);
    });
  });

  describe('getActiveAgents', () => {
    it('should get all non-terminated agents', async () => {
      const agent1 = await hierarchyManager.spawnAgent({
        level: HierarchyLevel.WORKER,
        role: AgentRole.WORKER,
        parentId: null,
      });
      const agent2 = await hierarchyManager.spawnAgent({
        level: HierarchyLevel.WORKER,
        role: AgentRole.WORKER,
        parentId: null,
      });
      const agent3 = await hierarchyManager.spawnAgent({
        level: HierarchyLevel.WORKER,
        role: AgentRole.WORKER,
        parentId: null,
      });

      await hierarchyManager.terminateAgent(agent3.id);

      const active = hierarchyManager.getActiveAgents();
      expect(active.length).toBe(2);
    });
  });

  describe('getChildren', () => {
    it('should return children of an agent', async () => {
      const parent = await hierarchyManager.spawnAgent({
        level: HierarchyLevel.TEAM_LEAD,
        role: AgentRole.TEAM_LEAD,
        parentId: null,
      });

      const child1 = await hierarchyManager.spawnAgent({
        level: HierarchyLevel.WORKER,
        role: AgentRole.WORKER,
        parentId: parent.id,
      });

      const child2 = await hierarchyManager.spawnAgent({
        level: HierarchyLevel.WORKER,
        role: AgentRole.WORKER,
        parentId: parent.id,
      });

      const children = hierarchyManager.getChildren(parent.id);
      expect(children.length).toBe(2);
      expect(children.map(c => c.id)).toContain(child1.id);
      expect(children.map(c => c.id)).toContain(child2.id);
    });

    it('should return empty array for agent with no children', async () => {
      const agent = await hierarchyManager.spawnAgent({
        level: HierarchyLevel.WORKER,
        role: AgentRole.WORKER,
        parentId: null,
      });

      const children = hierarchyManager.getChildren(agent.id);
      expect(children.length).toBe(0);
    });
  });

  describe('updateAgentStatus', () => {
    it('should update agent status', async () => {
      const agent = await hierarchyManager.spawnAgent({
        level: HierarchyLevel.WORKER,
        role: AgentRole.WORKER,
        parentId: null,
      });

      await hierarchyManager.updateAgentStatus(agent.id, AgentStatus.BUSY);

      expect(agent.status).toBe(AgentStatus.BUSY);
    });

    it('should throw for unknown agent', async () => {
      await expect(
        hierarchyManager.updateAgentStatus('unknown-id', AgentStatus.BUSY)
      ).rejects.toThrow();
    });
  });

  describe('getSpawnConstraints', () => {
    it('should return spawn constraints for a level', () => {
      const constraints = hierarchyManager.getSpawnConstraints(HierarchyLevel.WORKER);

      expect(constraints).toBeDefined();
      expect(constraints.maxConcurrent).toBe(Infinity);
    });

    it('should have stricter constraints for higher levels', () => {
      const sovereignConstraints = hierarchyManager.getSpawnConstraints(HierarchyLevel.SOVEREIGN);
      const workerConstraints = hierarchyManager.getSpawnConstraints(HierarchyLevel.WORKER);

      expect(sovereignConstraints.maxConcurrent).toBeLessThan(workerConstraints.maxConcurrent);
    });
  });
});
