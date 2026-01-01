/**
 * Activity Types
 *
 * Types for agent activity tracking:
 * - Agent execution history (thinking → completed/failed)
 * - Prompt and response recording
 * - Duration and token metrics
 * - Per-mission activity logs
 */

import {
  ActivityEntryId,
  MissionId,
  AgentId,
  TaskId,
} from './common';

// ============================================================================
// Activity Status
// ============================================================================

/** Agent activity status */
export type ActivityStatus = 'thinking' | 'completed' | 'failed';

// ============================================================================
// Activity Metrics
// ============================================================================

/** Metrics for a completed agent activity */
export interface ActivityMetrics {
  /** Execution duration in milliseconds */
  readonly durationMs: number;
  /** Tokens sent to the model */
  readonly tokensSent: number;
  /** Tokens received from the model */
  readonly tokensReceived: number;
}

// ============================================================================
// Activity Entry
// ============================================================================

/** Agent activity entry representing one execution cycle */
export interface AgentActivityEntry {
  /** Unique identifier for this entry */
  readonly id: ActivityEntryId;
  /** Agent that performed the activity */
  readonly agentId: AgentId;
  /** Task being executed */
  readonly taskId: TaskId;
  /** Mission this activity belongs to */
  readonly missionId: MissionId;
  /** When the activity was recorded */
  readonly timestamp: Date;
  /** Current status (mutable) */
  status: ActivityStatus;
  /** Input prompt (truncated for display) */
  readonly prompt?: string;
  /** Agent response (mutable, added on completion) */
  response?: string;
  /** Error message (mutable, added on failure) */
  error?: string;
  /** Execution metrics (mutable, added on completion) */
  metrics?: ActivityMetrics;
}

// ============================================================================
// Activity Configuration
// ============================================================================

/** Activity tracker configuration */
export interface ActivityConfig {
  /** Maximum entries to keep per mission (default: 100) */
  readonly maxEntriesPerMission?: number;
  /** Maximum prompt length for storage (default: 500) */
  readonly maxPromptLength?: number;
  /** Maximum response length for storage (default: 1000) */
  readonly maxResponseLength?: number;
}

/** Default activity configuration */
export const DEFAULT_ACTIVITY_CONFIG: Required<ActivityConfig> = {
  maxEntriesPerMission: 100,
  maxPromptLength: 500,
  maxResponseLength: 1000,
};

// ============================================================================
// Activity Events
// ============================================================================

/** Activity started event */
export interface ActivityStartedEvent {
  readonly type: 'activity:started';
  readonly entry: AgentActivityEntry;
  readonly timestamp: Date;
}

/** Activity completed event */
export interface ActivityCompletedEvent {
  readonly type: 'activity:completed';
  readonly entry: AgentActivityEntry;
  readonly metrics: ActivityMetrics;
  readonly timestamp: Date;
}

/** Activity failed event */
export interface ActivityFailedEvent {
  readonly type: 'activity:failed';
  readonly entry: AgentActivityEntry;
  readonly error: string;
  readonly timestamp: Date;
}

/** All activity event types */
export type ActivityEvent =
  | ActivityStartedEvent
  | ActivityCompletedEvent
  | ActivityFailedEvent;

// ============================================================================
// Activity Statistics
// ============================================================================

/** Activity statistics for a mission */
export interface ActivityStats {
  /** Total activities recorded */
  readonly totalCount: number;
  /** Activities currently in 'thinking' state */
  readonly activeCount: number;
  /** Successfully completed activities */
  readonly completedCount: number;
  /** Failed activities */
  readonly failedCount: number;
  /** Average duration in milliseconds */
  readonly avgDurationMs: number;
  /** Total tokens sent */
  readonly totalTokensSent: number;
  /** Total tokens received */
  readonly totalTokensReceived: number;
}

// ============================================================================
// Service Interface
// ============================================================================

/** Agent activity service interface */
export interface IAgentActivityService {
  /**
   * Record the start of an agent activity
   * @param missionId - Mission this activity belongs to
   * @param agentId - Agent performing the activity
   * @param taskId - Task being executed
   * @param prompt - Input prompt
   * @returns Entry ID for tracking
   */
  recordStart(
    missionId: MissionId,
    agentId: AgentId,
    taskId: TaskId,
    prompt: string
  ): ActivityEntryId;

  /**
   * Record successful completion of an activity
   * @param entryId - Entry ID from recordStart
   * @param response - Agent response
   * @param metrics - Execution metrics
   */
  recordComplete(
    entryId: ActivityEntryId,
    response: string,
    metrics: ActivityMetrics
  ): void;

  /**
   * Record failure of an activity
   * @param entryId - Entry ID from recordStart
   * @param error - Error message
   */
  recordFailure(entryId: ActivityEntryId, error: string): void;

  /**
   * Get all entries for a mission
   * @param missionId - Mission to get entries for
   * @returns Array of activity entries
   */
  getEntries(missionId: MissionId): AgentActivityEntry[];

  /**
   * Get recent entries across all missions
   * @param limit - Maximum entries to return (default: 20)
   * @returns Array of recent entries, sorted by timestamp descending
   */
  getRecentEntries(limit?: number): AgentActivityEntry[];

  /**
   * Get count of currently active (thinking) activities
   * @returns Number of active activities
   */
  getActiveCount(): number;

  /**
   * Get statistics for a mission
   * @param missionId - Mission to get stats for
   * @returns Activity statistics
   */
  getStats(missionId: MissionId): ActivityStats;

  /**
   * Clear all entries for a mission
   * @param missionId - Mission to clear
   */
  clearMission(missionId: MissionId): void;

  /**
   * Clear all entries
   */
  clearAll(): void;
}
