/**
 * Hierarchy Manager
 *
 * Manages the agent hierarchy, including spawning, tracking, and lifecycle management.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  HierarchyAgent,
  HierarchyLevel,
  AgentRole,
  AgentStatus,
  SpawnConfig,
  SpawnConstraints,
  AIModel,
  AgentMetrics,
} from '../../types';
import { StateManager } from '../../storage/StateManager';
import { Logger } from '../../utils/Logger';

/**
 * Default spawn constraints per hierarchy level.
 */
const DEFAULT_SPAWN_CONSTRAINTS: Record<HierarchyLevel, SpawnConstraints> = {
  [HierarchyLevel.SOVEREIGN]: { maxConcurrent: 1, quotaThreshold: 0.1, taskQueueThreshold: 1 },
  [HierarchyLevel.ARCHITECT]: { maxConcurrent: 10, quotaThreshold: 0.15, taskQueueThreshold: 1 },
  [HierarchyLevel.STRATEGIST]: { maxConcurrent: 20, quotaThreshold: 0.2, taskQueueThreshold: 2 },
  [HierarchyLevel.TEAM_LEAD]: { maxConcurrent: 50, quotaThreshold: 0.2, taskQueueThreshold: 3 },
  [HierarchyLevel.SPECIALIST]: { maxConcurrent: 100, quotaThreshold: 0.25, taskQueueThreshold: 2 },
  [HierarchyLevel.WORKER]: { maxConcurrent: Infinity, quotaThreshold: 0.3, taskQueueThreshold: 1 },
};

/**
 * Model assignment per hierarchy level.
 */
const LEVEL_MODELS: Record<HierarchyLevel, AIModel> = {
  [HierarchyLevel.SOVEREIGN]: AIModel.CLAUDE_OPUS,
  [HierarchyLevel.ARCHITECT]: AIModel.CLAUDE_OPUS,
  [HierarchyLevel.STRATEGIST]: AIModel.CLAUDE_OPUS,
  [HierarchyLevel.TEAM_LEAD]: AIModel.CLAUDE_OPUS,
  [HierarchyLevel.SPECIALIST]: AIModel.CLAUDE_OPUS, // Can be overridden to GLM based on complexity
  [HierarchyLevel.WORKER]: AIModel.GLM_4_7,
};

/**
 * Manages the agent hierarchy.
 */
export class HierarchyManager {
  private readonly stateManager: StateManager;
  private readonly logger: Logger;
  private readonly agents: Map<string, HierarchyAgent>;
  private readonly agentsByLevel: Map<HierarchyLevel, Set<string>>;
  private sovereignId: string | null = null;

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
    this.logger = new Logger('HierarchyManager');
    this.agents = new Map();
    this.agentsByLevel = new Map();

    // Initialize level sets
    for (const level of Object.values(HierarchyLevel)) {
      if (typeof level === 'number') {
        this.agentsByLevel.set(level, new Set());
      }
    }
  }

  /**
   * Spawn a new agent at the specified level.
   */
  async spawnAgent(config: SpawnConfig): Promise<HierarchyAgent> {
    const { level, parentId, role, initialTaskId, modelPreference } = config;

    // Check spawn constraints
    const constraints = this.getSpawnConstraints(level);
    const currentCount = this.getAgentCountAtLevel(level);

    if (currentCount >= constraints.maxConcurrent) {
      throw new Error(
        `Cannot spawn agent at level ${HierarchyLevel[level]}: maximum concurrent agents (${constraints.maxConcurrent}) reached`
      );
    }

    // Determine model
    let model = LEVEL_MODELS[level];
    if (modelPreference === 'claude') {
      model = AIModel.CLAUDE_OPUS;
    } else if (modelPreference === 'glm') {
      model = AIModel.GLM_4_7;
    }

    // Create agent
    const agent: HierarchyAgent = {
      id: uuidv4(),
      level,
      role,
      parentId,
      childIds: [],
      status: AgentStatus.IDLE,
      currentTaskId: initialTaskId || null,
      model,
      metrics: this.createEmptyMetrics(),
      createdAt: new Date(),
    };

    // Register agent
    this.agents.set(agent.id, agent);
    this.agentsByLevel.get(level)?.add(agent.id);

    // Update parent's child list
    if (parentId) {
      const parent = this.agents.get(parentId);
      if (parent) {
        parent.childIds.push(agent.id);
      }
    }

    // Track sovereign
    if (level === HierarchyLevel.SOVEREIGN) {
      this.sovereignId = agent.id;
    }

    // Persist
    await this.stateManager.createAgent(agent);

    this.logger.info(
      `Spawned agent: ${agent.id} (${role}, Level ${level})`
    );

    return agent;
  }

  /**
   * Get an agent by ID.
   */
  getAgent(id: string): HierarchyAgent | null {
    return this.agents.get(id) || null;
  }

  /**
   * Get the sovereign agent.
   */
  getSovereign(): HierarchyAgent | null {
    if (this.sovereignId) {
      return this.agents.get(this.sovereignId) || null;
    }
    return null;
  }

  /**
   * Get all agents at a specific level.
   */
  getAgentsAtLevel(level: HierarchyLevel): HierarchyAgent[] {
    const agentIds = this.agentsByLevel.get(level) || new Set();
    return Array.from(agentIds)
      .map((id) => this.agents.get(id))
      .filter((agent): agent is HierarchyAgent => agent !== undefined);
  }

  /**
   * Get all active (non-terminated) agents.
   */
  getActiveAgents(): HierarchyAgent[] {
    return Array.from(this.agents.values()).filter(
      (agent) => agent.status !== AgentStatus.TERMINATED
    );
  }

  /**
   * Get children of an agent.
   */
  getChildren(agentId: string): HierarchyAgent[] {
    const agent = this.agents.get(agentId);
    if (!agent) return [];

    return agent.childIds
      .map((id) => this.agents.get(id))
      .filter((child): child is HierarchyAgent => child !== undefined);
  }

  /**
   * Update agent status.
   */
  async updateAgentStatus(agentId: string, status: AgentStatus): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    agent.status = status;
    if (status !== AgentStatus.IDLE) {
      agent.metrics.lastActiveAt = new Date();
    }

    await this.stateManager.updateAgent(agent);
  }

  /**
   * Assign a task to an agent.
   */
  async assignTask(agentId: string, taskId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    agent.currentTaskId = taskId;
    agent.status = AgentStatus.BUSY;
    agent.metrics.lastActiveAt = new Date();

    await this.stateManager.updateAgent(agent);
  }

  /**
   * Complete a task for an agent.
   */
  async completeTask(agentId: string, success: boolean): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    if (success) {
      agent.metrics.tasksCompleted++;
    } else {
      agent.metrics.tasksFailed++;
    }

    agent.currentTaskId = null;
    agent.status = AgentStatus.IDLE;
    agent.metrics.lastActiveAt = new Date();

    await this.stateManager.updateAgent(agent);
  }

  /**
   * Update agent metrics after execution.
   */
  async updateMetrics(
    agentId: string,
    executionTimeMs: number,
    tokensSent: number,
    tokensReceived: number
  ): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    // Update running averages
    const totalTasks = agent.metrics.tasksCompleted + agent.metrics.tasksFailed;
    if (totalTasks > 0) {
      agent.metrics.averageExecutionTimeMs =
        (agent.metrics.averageExecutionTimeMs * totalTasks + executionTimeMs) / (totalTasks + 1);
    } else {
      agent.metrics.averageExecutionTimeMs = executionTimeMs;
    }

    agent.metrics.tokensSent += tokensSent;
    agent.metrics.tokensReceived += tokensReceived;

    await this.stateManager.updateAgent(agent);
  }

  /**
   * Terminate an agent and optionally its children.
   */
  async terminateAgent(agentId: string, terminateChildren: boolean = false): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    // Terminate children first if requested
    if (terminateChildren) {
      for (const childId of agent.childIds) {
        await this.terminateAgent(childId, true);
      }
    }

    // Update status
    agent.status = AgentStatus.TERMINATED;
    await this.stateManager.updateAgent(agent);

    // Remove from level tracking
    this.agentsByLevel.get(agent.level)?.delete(agentId);

    // Remove from parent's child list
    if (agent.parentId) {
      const parent = this.agents.get(agent.parentId);
      if (parent) {
        parent.childIds = parent.childIds.filter((id) => id !== agentId);
      }
    }

    this.logger.info(`Terminated agent: ${agentId}`);
  }

  /**
   * Find an idle agent at the specified level.
   */
  findIdleAgent(level: HierarchyLevel): HierarchyAgent | null {
    const agents = this.getAgentsAtLevel(level);
    return agents.find((agent) => agent.status === AgentStatus.IDLE) || null;
  }

  /**
   * Find or spawn an agent for the given level.
   */
  async findOrSpawnAgent(
    level: HierarchyLevel,
    role: AgentRole,
    parentId: string | null
  ): Promise<HierarchyAgent> {
    // First try to find an idle agent
    const idleAgent = this.findIdleAgent(level);
    if (idleAgent) {
      return idleAgent;
    }

    // Check if we can spawn a new one
    const constraints = this.getSpawnConstraints(level);
    const currentCount = this.getAgentCountAtLevel(level);

    if (currentCount < constraints.maxConcurrent) {
      return this.spawnAgent({ level, role, parentId });
    }

    // Wait for an agent to become available
    return this.waitForIdleAgent(level);
  }

  /**
   * Get spawn constraints for a level.
   */
  getSpawnConstraints(level: HierarchyLevel): SpawnConstraints {
    return DEFAULT_SPAWN_CONSTRAINTS[level];
  }

  /**
   * Get the count of agents at a level.
   */
  getAgentCountAtLevel(level: HierarchyLevel): number {
    return this.agentsByLevel.get(level)?.size || 0;
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  private createEmptyMetrics(): AgentMetrics {
    return {
      tasksCompleted: 0,
      tasksFailed: 0,
      averageExecutionTimeMs: 0,
      tokensSent: 0,
      tokensReceived: 0,
      lastActiveAt: null,
    };
  }

  private async waitForIdleAgent(level: HierarchyLevel): Promise<HierarchyAgent> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const idleAgent = this.findIdleAgent(level);
        if (idleAgent) {
          clearInterval(checkInterval);
          resolve(idleAgent);
        }
      }, 100);
    });
  }
}
