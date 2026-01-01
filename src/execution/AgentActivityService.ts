/**
 * Agent Activity Service
 *
 * Tracks agent execution activities for monitoring and debugging:
 * - Records thinking → completed/failed lifecycle
 * - Stores prompt and response (truncated)
 * - Tracks duration and token metrics
 * - Per-mission activity logs with circular buffer
 */

import {
  IAgentActivityService,
  AgentActivityEntry,
  ActivityMetrics,
  ActivityStats,
  ActivityConfig,
  DEFAULT_ACTIVITY_CONFIG,
  ActivityEntryId,
  MissionId,
  AgentId,
  TaskId,
  createActivityEntryId,
  IEventBus,
  ILogger,
} from '../types';

/**
 * Agent Activity Service Implementation
 */
export class AgentActivityService implements IAgentActivityService {
  private readonly eventBus: IEventBus;
  private readonly logger?: ILogger;
  private readonly config: Required<ActivityConfig>;

  /** Entries per mission */
  private readonly entries: Map<MissionId, AgentActivityEntry[]> = new Map();

  /** Entry lookup by ID */
  private readonly entryById: Map<ActivityEntryId, AgentActivityEntry> = new Map();

  constructor(
    eventBus: IEventBus,
    config?: ActivityConfig,
    logger?: ILogger
  ) {
    this.eventBus = eventBus;
    this.config = { ...DEFAULT_ACTIVITY_CONFIG, ...config };
    this.logger = logger?.child('AgentActivityService');
  }

  /**
   * Record the start of an agent activity
   */
  recordStart(
    missionId: MissionId,
    agentId: AgentId,
    taskId: TaskId,
    prompt: string
  ): ActivityEntryId {
    const id = createActivityEntryId();

    const entry: AgentActivityEntry = {
      id,
      missionId,
      agentId,
      taskId,
      timestamp: new Date(),
      status: 'thinking',
      prompt: this.truncate(prompt, this.config.maxPromptLength),
    };

    // Store entry
    this.addEntry(missionId, entry);
    this.entryById.set(id, entry);

    // Emit event
    this.eventBus.emit('activity:started', {
      type: 'activity:started',
      entry,
      timestamp: new Date(),
    });

    this.logger?.debug('Activity started', {
      id,
      agentId,
      taskId,
      missionId,
    });

    return id;
  }

  /**
   * Record successful completion of an activity
   */
  recordComplete(
    entryId: ActivityEntryId,
    response: string,
    metrics: ActivityMetrics
  ): void {
    const entry = this.entryById.get(entryId);
    if (!entry) {
      this.logger?.warn('Entry not found for completion', { entryId });
      return;
    }

    // Update entry (mutable fields)
    entry.status = 'completed';
    entry.response = this.truncate(response, this.config.maxResponseLength);
    entry.metrics = metrics;

    // Emit event
    this.eventBus.emit('activity:completed', {
      type: 'activity:completed',
      entry,
      metrics,
      timestamp: new Date(),
    });

    this.logger?.debug('Activity completed', {
      entryId,
      durationMs: metrics.durationMs,
      tokensSent: metrics.tokensSent,
      tokensReceived: metrics.tokensReceived,
    });
  }

  /**
   * Record failure of an activity
   */
  recordFailure(entryId: ActivityEntryId, error: string): void {
    const entry = this.entryById.get(entryId);
    if (!entry) {
      this.logger?.warn('Entry not found for failure', { entryId });
      return;
    }

    // Update entry (mutable fields)
    entry.status = 'failed';
    entry.error = error;

    // Emit event
    this.eventBus.emit('activity:failed', {
      type: 'activity:failed',
      entry,
      error,
      timestamp: new Date(),
    });

    this.logger?.debug('Activity failed', { entryId, error });
  }

  /**
   * Get all entries for a mission
   */
  getEntries(missionId: MissionId): AgentActivityEntry[] {
    return this.entries.get(missionId) ?? [];
  }

  /**
   * Get recent entries across all missions
   */
  getRecentEntries(limit: number = 20): AgentActivityEntry[] {
    const allEntries: AgentActivityEntry[] = [];

    for (const missionEntries of this.entries.values()) {
      allEntries.push(...missionEntries);
    }

    // Sort by timestamp descending (most recent first)
    allEntries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return allEntries.slice(0, limit);
  }

  /**
   * Get count of currently active (thinking) activities
   */
  getActiveCount(): number {
    let count = 0;

    for (const missionEntries of this.entries.values()) {
      for (const entry of missionEntries) {
        if (entry.status === 'thinking') {
          count++;
        }
      }
    }

    return count;
  }

  /**
   * Get statistics for a mission
   */
  getStats(missionId: MissionId): ActivityStats {
    const missionEntries = this.entries.get(missionId) ?? [];

    let activeCount = 0;
    let completedCount = 0;
    let failedCount = 0;
    let totalDuration = 0;
    let totalTokensSent = 0;
    let totalTokensReceived = 0;
    let durationsCount = 0;

    for (const entry of missionEntries) {
      switch (entry.status) {
        case 'thinking':
          activeCount++;
          break;
        case 'completed':
          completedCount++;
          if (entry.metrics) {
            totalDuration += entry.metrics.durationMs;
            totalTokensSent += entry.metrics.tokensSent;
            totalTokensReceived += entry.metrics.tokensReceived;
            durationsCount++;
          }
          break;
        case 'failed':
          failedCount++;
          break;
      }
    }

    return {
      totalCount: missionEntries.length,
      activeCount,
      completedCount,
      failedCount,
      avgDurationMs: durationsCount > 0 ? totalDuration / durationsCount : 0,
      totalTokensSent,
      totalTokensReceived,
    };
  }

  /**
   * Clear all entries for a mission
   */
  clearMission(missionId: MissionId): void {
    const missionEntries = this.entries.get(missionId);
    if (missionEntries) {
      // Remove from entryById map
      for (const entry of missionEntries) {
        this.entryById.delete(entry.id);
      }
    }
    this.entries.delete(missionId);

    this.logger?.debug('Cleared mission activities', { missionId });
  }

  /**
   * Clear all entries
   */
  clearAll(): void {
    this.entries.clear();
    this.entryById.clear();

    this.logger?.debug('Cleared all activities');
  }

  /**
   * Add entry to mission's collection with circular buffer behavior
   */
  private addEntry(missionId: MissionId, entry: AgentActivityEntry): void {
    let missionEntries = this.entries.get(missionId);

    if (!missionEntries) {
      missionEntries = [];
      this.entries.set(missionId, missionEntries);
    }

    missionEntries.push(entry);

    // Circular buffer: remove oldest if exceeded limit
    while (missionEntries.length > this.config.maxEntriesPerMission) {
      const removed = missionEntries.shift();
      if (removed) {
        this.entryById.delete(removed.id);
      }
    }
  }

  /**
   * Truncate text to max length
   */
  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength - 3) + '...';
  }
}

/**
 * Create a new agent activity service
 */
export function createAgentActivityService(
  eventBus: IEventBus,
  config?: ActivityConfig,
  logger?: ILogger
): IAgentActivityService {
  return new AgentActivityService(eventBus, config, logger);
}
