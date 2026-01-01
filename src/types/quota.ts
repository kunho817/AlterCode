/**
 * Quota Types
 *
 * Types for API usage quota tracking:
 * - Per-provider usage metrics (Claude/GLM)
 * - 5-hour rolling windows
 * - Level-specific usage tracking
 * - Warning and hard-stop thresholds
 */

import {
  QuotaWindowId,
  AsyncResult,
} from './common';
import { HierarchyLevel } from './execution';

// ============================================================================
// Provider Types
// ============================================================================

/** AI provider identifier */
export type AIProvider = 'claude' | 'glm';

// ============================================================================
// Usage Metrics
// ============================================================================

/** Usage metrics for a specific hierarchy level */
export interface LevelUsage {
  readonly callCount: number;
  readonly tokensSent: number;
  readonly tokensReceived: number;
}

/** Aggregate usage metrics for a quota window */
export interface UsageMetrics {
  readonly callCount: number;
  readonly tokensSent: number;
  readonly tokensReceived: number;
  readonly byLevel: Partial<Record<HierarchyLevel, LevelUsage>>;
}

/** Create empty usage metrics */
export function createEmptyUsageMetrics(): UsageMetrics {
  return {
    callCount: 0,
    tokensSent: 0,
    tokensReceived: 0,
    byLevel: {},
  };
}

// ============================================================================
// Usage Limits
// ============================================================================

/** Quota limits and thresholds */
export interface UsageLimits {
  /** Maximum API calls per window (null = subscription-based, no hard limit) */
  readonly maxCalls: number | null;
  /** Maximum tokens per window (null = subscription-based, no hard limit) */
  readonly maxTokens: number | null;
  /** Warning threshold as ratio (0.8 = 80% usage) */
  readonly warningThreshold: number;
  /** Hard stop threshold as ratio (0.95 = 95% usage) */
  readonly hardStopThreshold: number;
}

/** Default quota limits */
export const DEFAULT_USAGE_LIMITS: UsageLimits = {
  maxCalls: null, // Subscription-based
  maxTokens: null, // Subscription-based
  warningThreshold: 0.8,
  hardStopThreshold: 0.95,
};

// ============================================================================
// Quota Window
// ============================================================================

/** 5-hour rolling window duration in milliseconds */
export const QUOTA_WINDOW_DURATION_MS = 5 * 60 * 60 * 1000; // 5 hours

/** Quota tracking window */
export interface QuotaWindow {
  readonly id: QuotaWindowId;
  readonly provider: AIProvider;
  readonly windowStart: Date;
  readonly windowEnd: Date;
  readonly windowDurationMs: number;
  /** Mutable usage metrics (updated during window lifetime) */
  usage: UsageMetrics;
  readonly limits: UsageLimits;
}

// ============================================================================
// Quota Status
// ============================================================================

/** Quota status level */
export type QuotaStatusLevel = 'ok' | 'warning' | 'critical' | 'exceeded';

/** Current quota status for a provider */
export interface QuotaStatus {
  readonly provider: AIProvider;
  /** Current usage ratio (0.0 to 1.0) */
  readonly usageRatio: number;
  /** Status level based on thresholds */
  readonly status: QuotaStatusLevel;
  /** Milliseconds until window resets */
  readonly timeUntilResetMs: number;
  /** Current quota window */
  readonly currentWindow: QuotaWindow;
}

// ============================================================================
// Quota Configuration
// ============================================================================

/** Quota tracker configuration */
export interface QuotaConfig {
  /** Warning threshold ratio (default: 0.8) */
  readonly warningThreshold?: number;
  /** Hard stop threshold ratio (default: 0.95) */
  readonly hardStopThreshold?: number;
  /** Estimated max calls per window for ratio calculation */
  readonly estimatedMaxCalls?: number;
  /** Enable usage prediction (future feature) */
  readonly enablePrediction?: boolean;
}

/** Default quota configuration */
export const DEFAULT_QUOTA_CONFIG: Required<QuotaConfig> = {
  warningThreshold: 0.8,
  hardStopThreshold: 0.95,
  estimatedMaxCalls: 100, // Estimated 100 calls per 5-hour window
  enablePrediction: false,
};

// ============================================================================
// Token Recording
// ============================================================================

/** Token usage for a single API call */
export interface TokenUsageRecord {
  readonly sent: number;
  readonly received: number;
}

// ============================================================================
// Quota Events
// ============================================================================

/** Quota warning event data */
export interface QuotaWarningEvent {
  readonly type: 'quota:warning';
  readonly provider: AIProvider;
  readonly usageRatio: number;
  readonly timeUntilResetMs: number;
  readonly timestamp: Date;
}

/** Quota exceeded event data */
export interface QuotaExceededEvent {
  readonly type: 'quota:exceeded';
  readonly provider: AIProvider;
  readonly usageRatio: number;
  readonly timeUntilResetMs: number;
  readonly timestamp: Date;
}

/** Quota reset event data */
export interface QuotaResetEvent {
  readonly type: 'quota:reset';
  readonly provider: AIProvider;
  readonly previousWindow: QuotaWindow;
  readonly newWindow: QuotaWindow;
  readonly timestamp: Date;
}

/** All quota event types */
export type QuotaEvent = QuotaWarningEvent | QuotaExceededEvent | QuotaResetEvent;

// ============================================================================
// Service Interface
// ============================================================================

/** Quota tracker service interface */
export interface IQuotaTrackerService {
  /** Initialize the quota tracker */
  initialize(): AsyncResult<void>;

  /**
   * Record API usage
   * @param provider - The AI provider used
   * @param level - The hierarchy level making the call
   * @param tokens - Token counts for the call
   */
  recordUsage(
    provider: AIProvider,
    level: HierarchyLevel,
    tokens: TokenUsageRecord
  ): void;

  /**
   * Check if execution is allowed for a provider
   * @param provider - The AI provider to check
   * @returns true if quota allows execution
   */
  canExecute(provider: AIProvider): boolean;

  /**
   * Get current quota status for a provider
   * @param provider - The AI provider
   * @returns Current quota status
   */
  getStatus(provider: AIProvider): QuotaStatus;

  /**
   * Get time until quota window resets
   * @param provider - The AI provider
   * @returns Milliseconds until reset
   */
  getTimeUntilReset(provider: AIProvider): number;

  /**
   * Get all provider statuses
   * @returns Map of provider to status
   */
  getAllStatuses(): Map<AIProvider, QuotaStatus>;
}
