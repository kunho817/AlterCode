/**
 * State Manager
 *
 * Manages persistent storage using SQLite and LevelDB.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import {
  Mission,
  Task,
  HierarchyAgent,
  QuotaWindow,
  StorageConfig,
} from '../types';
import { Logger } from '../utils/Logger';

// Note: In the actual implementation, these would use better-sqlite3 and level
// For the skeleton, we'll use in-memory storage

/**
 * Manages persistent state storage.
 */
export class StateManager {
  private readonly context: vscode.ExtensionContext;
  private readonly config: StorageConfig;
  private readonly logger: Logger;

  // In-memory storage (placeholder for SQLite + LevelDB)
  private missions: Map<string, Mission> = new Map();
  private tasks: Map<string, Task> = new Map();
  private agents: Map<string, HierarchyAgent> = new Map();
  private quotaWindows: Map<string, QuotaWindow> = new Map();

  private initialized: boolean = false;

  constructor(context: vscode.ExtensionContext, config: StorageConfig) {
    this.context = context;
    this.config = config;
    this.logger = new Logger('StateManager');
  }

  /**
   * Initialize storage.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.logger.info('Initializing state manager...');

    // Set up paths
    const storagePath = this.context.globalStorageUri.fsPath;
    this.config.databasePath = path.join(storagePath, 'altercode.db');
    this.config.cachePath = path.join(storagePath, 'cache');

    // TODO: Initialize SQLite database
    // TODO: Initialize LevelDB cache
    // TODO: Run migrations

    this.initialized = true;
    this.logger.info('State manager initialized');
  }

  /**
   * Close storage connections.
   */
  async close(): Promise<void> {
    this.logger.info('Closing state manager...');
    // TODO: Close database connections
    this.initialized = false;
  }

  // =========================================================================
  // Mission Operations
  // =========================================================================

  async createMission(mission: Mission): Promise<void> {
    this.missions.set(mission.id, mission);
  }

  async getMission(id: string): Promise<Mission | null> {
    return this.missions.get(id) || null;
  }

  async updateMission(mission: Mission): Promise<void> {
    this.missions.set(mission.id, mission);
  }

  async deleteMission(id: string): Promise<void> {
    this.missions.delete(id);
  }

  async listMissions(): Promise<Mission[]> {
    return Array.from(this.missions.values());
  }

  // =========================================================================
  // Task Operations
  // =========================================================================

  async createTask(task: Task): Promise<void> {
    this.tasks.set(task.id, task);
  }

  async getTask(id: string): Promise<Task | null> {
    return this.tasks.get(id) || null;
  }

  async updateTask(task: Task): Promise<void> {
    this.tasks.set(task.id, task);
  }

  async deleteTask(id: string): Promise<void> {
    this.tasks.delete(id);
  }

  async getTasksForMission(missionId: string): Promise<Task[]> {
    return Array.from(this.tasks.values()).filter(
      (task) => task.missionId === missionId
    );
  }

  // =========================================================================
  // Agent Operations
  // =========================================================================

  async createAgent(agent: HierarchyAgent): Promise<void> {
    this.agents.set(agent.id, agent);
  }

  async getAgent(id: string): Promise<HierarchyAgent | null> {
    return this.agents.get(id) || null;
  }

  async updateAgent(agent: HierarchyAgent): Promise<void> {
    this.agents.set(agent.id, agent);
  }

  async deleteAgent(id: string): Promise<void> {
    this.agents.delete(id);
  }

  async getActiveAgents(): Promise<HierarchyAgent[]> {
    return Array.from(this.agents.values()).filter(
      (agent) => agent.status !== 'terminated'
    );
  }

  // =========================================================================
  // Quota Operations
  // =========================================================================

  async saveQuotaWindow(window: QuotaWindow): Promise<void> {
    this.quotaWindows.set(window.id, window);
  }

  async getQuotaWindow(id: string): Promise<QuotaWindow | null> {
    return this.quotaWindows.get(id) || null;
  }

  async getCurrentQuotaWindow(provider: string): Promise<QuotaWindow | null> {
    const now = Date.now();
    for (const window of this.quotaWindows.values()) {
      if (
        window.provider === provider &&
        window.windowStart.getTime() <= now &&
        window.windowEnd.getTime() > now
      ) {
        return window;
      }
    }
    return null;
  }

  // =========================================================================
  // Cache Operations (Hot Path)
  // =========================================================================

  async cacheValue<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    // TODO: Implement LevelDB caching
    this.context.globalState.update(`cache:${key}`, {
      value,
      expiresAt: ttlMs ? Date.now() + ttlMs : null,
    });
  }

  async getCachedValue<T>(key: string): Promise<T | null> {
    const cached = this.context.globalState.get<{ value: T; expiresAt: number | null }>(
      `cache:${key}`
    );

    if (!cached) return null;
    if (cached.expiresAt && cached.expiresAt < Date.now()) {
      await this.context.globalState.update(`cache:${key}`, undefined);
      return null;
    }

    return cached.value;
  }

  async deleteCachedValue(key: string): Promise<void> {
    await this.context.globalState.update(`cache:${key}`, undefined);
  }
}
