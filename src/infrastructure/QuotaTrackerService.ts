/**
 * Quota Tracker Service
 *
 * Tracks API usage within 5-hour rolling windows for Claude and GLM providers:
 * - Per-provider usage metrics
 * - Level-specific usage tracking
 * - Warning and hard-stop thresholds
 * - Automatic window reset on expiry
 */

import {
  IQuotaTrackerService,
  AIProvider,
  QuotaWindow,
  QuotaStatus,
  QuotaStatusLevel,
  UsageMetrics,
  UsageLimits,
  TokenUsageRecord,
  QuotaConfig,
  DEFAULT_QUOTA_CONFIG,
  QUOTA_WINDOW_DURATION_MS,
  createEmptyUsageMetrics,
  DEFAULT_USAGE_LIMITS,
  createQuotaWindowId,
  IEventBus,
  ILogger,
  HierarchyLevel,
  AsyncResult,
  Ok,
} from '../types';

/** Usage history entry for tracking over time */
export interface UsageHistoryEntry {
  timestamp: Date;
  provider: AIProvider;
  callCount: number;
  tokensSent: number;
  tokensReceived: number;
  usageRatio: number;
}

/** Maximum history entries to keep per provider */
const MAX_HISTORY_ENTRIES = 12;

/** Minimum interval between history entries (5 minutes) */
const HISTORY_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Quota Tracker Service Implementation
 *
 * Manages API usage quotas with 5-hour rolling windows per provider.
 */
export class QuotaTrackerService implements IQuotaTrackerService {
  private readonly eventBus: IEventBus;
  private readonly logger?: ILogger;
  private readonly config: Required<QuotaConfig>;

  /** Quota windows per provider */
  private windows: Map<AIProvider, QuotaWindow> = new Map();

  /** Usage history per provider */
  private usageHistory: Map<AIProvider, UsageHistoryEntry[]> = new Map();

  /** Last history recording time per provider */
  private lastHistoryTime: Map<AIProvider, number> = new Map();

  /** Providers to track */
  private readonly providers: AIProvider[] = ['claude', 'glm'];

  constructor(
    eventBus: IEventBus,
    config?: QuotaConfig,
    logger?: ILogger
  ) {
    this.eventBus = eventBus;
    this.config = { ...DEFAULT_QUOTA_CONFIG, ...config };
    this.logger = logger?.child('QuotaTrackerService');
  }

  /**
   * Initialize the quota tracker
   */
  async initialize(): AsyncResult<void> {
    this.logger?.info('Initializing quota tracker');

    // Create initial windows for each provider
    for (const provider of this.providers) {
      this.getOrCreateWindow(provider);
    }

    this.logger?.info('Quota tracker initialized', {
      providers: this.providers,
      windowDurationMs: QUOTA_WINDOW_DURATION_MS,
    });

    return Ok(undefined);
  }

  /**
   * Record API usage for a provider
   */
  recordUsage(
    provider: AIProvider,
    level: HierarchyLevel,
    tokens: TokenUsageRecord
  ): void {
    const window = this.getOrCreateWindow(provider);

    // Update overall metrics
    window.usage = {
      ...window.usage,
      callCount: window.usage.callCount + 1,
      tokensSent: window.usage.tokensSent + tokens.sent,
      tokensReceived: window.usage.tokensReceived + tokens.received,
    };

    // Update level-specific metrics
    const currentLevelUsage = window.usage.byLevel[level] ?? {
      callCount: 0,
      tokensSent: 0,
      tokensReceived: 0,
    };

    window.usage = {
      ...window.usage,
      byLevel: {
        ...window.usage.byLevel,
        [level]: {
          callCount: currentLevelUsage.callCount + 1,
          tokensSent: currentLevelUsage.tokensSent + tokens.sent,
          tokensReceived: currentLevelUsage.tokensReceived + tokens.received,
        },
      },
    };

    this.logger?.debug('Recorded usage', {
      provider,
      level,
      tokens,
      totalCalls: window.usage.callCount,
    });

    // Record history entry if enough time has passed
    this.maybeRecordHistory(provider, window);

    // Check thresholds and emit events
    const status = this.getStatus(provider);

    if (status.status === 'exceeded' || status.status === 'critical') {
      this.eventBus.emit('quota:exceeded', {
        type: 'quota:exceeded',
        provider,
        usageRatio: status.usageRatio,
        timeUntilResetMs: status.timeUntilResetMs,
        timestamp: new Date(),
      });
      this.logger?.warn('Quota exceeded', { provider, status });
    } else if (status.status === 'warning') {
      this.eventBus.emit('quota:warning', {
        type: 'quota:warning',
        provider,
        usageRatio: status.usageRatio,
        timeUntilResetMs: status.timeUntilResetMs,
        timestamp: new Date(),
      });
      this.logger?.warn('Quota warning', { provider, status });
    }
  }

  /**
   * Check if execution is allowed for a provider
   */
  canExecute(provider: AIProvider): boolean {
    const status = this.getStatus(provider);
    return status.status !== 'exceeded';
  }

  /**
   * Get current quota status for a provider
   */
  getStatus(provider: AIProvider): QuotaStatus {
    const window = this.getOrCreateWindow(provider);
    const usageRatio = this.calculateUsageRatio(window);
    const status = this.determineStatus(usageRatio, window.limits);
    const timeUntilResetMs = Math.max(0, window.windowEnd.getTime() - Date.now());

    return {
      provider,
      usageRatio,
      status,
      timeUntilResetMs,
      currentWindow: window,
    };
  }

  /**
   * Get time until quota window resets
   */
  getTimeUntilReset(provider: AIProvider): number {
    const window = this.getOrCreateWindow(provider);
    return Math.max(0, window.windowEnd.getTime() - Date.now());
  }

  /**
   * Get all provider statuses
   */
  getAllStatuses(): Map<AIProvider, QuotaStatus> {
    const statuses = new Map<AIProvider, QuotaStatus>();
    for (const provider of this.providers) {
      statuses.set(provider, this.getStatus(provider));
    }
    return statuses;
  }

  /**
   * Get usage history for a provider
   */
  getUsageHistory(provider: AIProvider): UsageHistoryEntry[] {
    return this.usageHistory.get(provider) ?? [];
  }

  /**
   * Get usage history for all providers
   */
  getAllUsageHistory(): Map<AIProvider, UsageHistoryEntry[]> {
    const history = new Map<AIProvider, UsageHistoryEntry[]>();
    for (const provider of this.providers) {
      history.set(provider, this.getUsageHistory(provider));
    }
    return history;
  }

  /**
   * Record a history entry if enough time has passed
   */
  private maybeRecordHistory(provider: AIProvider, window: QuotaWindow): void {
    const now = Date.now();
    const lastTime = this.lastHistoryTime.get(provider) ?? 0;

    // Only record if enough time has passed
    if (now - lastTime < HISTORY_INTERVAL_MS) {
      return;
    }

    const usageRatio = this.calculateUsageRatio(window);
    const entry: UsageHistoryEntry = {
      timestamp: new Date(),
      provider,
      callCount: window.usage.callCount,
      tokensSent: window.usage.tokensSent,
      tokensReceived: window.usage.tokensReceived,
      usageRatio,
    };

    // Get or create history array
    let history = this.usageHistory.get(provider);
    if (!history) {
      history = [];
      this.usageHistory.set(provider, history);
    }

    // Add entry and trim to max size
    history.push(entry);
    if (history.length > MAX_HISTORY_ENTRIES) {
      history.shift();
    }

    this.lastHistoryTime.set(provider, now);

    // Emit history update event
    this.eventBus.emit('quota:historyUpdated', {
      type: 'quota:historyUpdated',
      provider,
      history: [...history],
      timestamp: new Date(),
    });

    this.logger?.debug('Recorded usage history', {
      provider,
      entryCount: history.length,
      usageRatio,
    });
  }

  /**
   * Get or create a quota window for a provider
   */
  private getOrCreateWindow(provider: AIProvider): QuotaWindow {
    const existing = this.windows.get(provider);
    const now = Date.now();

    // Return existing if still valid
    if (existing && existing.windowEnd.getTime() > now) {
      return existing;
    }

    // Create new window (old one expired or doesn't exist)
    const previousWindow = existing;
    const newWindow = this.createWindow(provider);
    this.windows.set(provider, newWindow);

    // Emit reset event if replacing an existing window
    if (previousWindow) {
      this.eventBus.emit('quota:reset', {
        type: 'quota:reset',
        provider,
        previousWindow,
        newWindow,
        timestamp: new Date(),
      });
      this.logger?.info('Quota window reset', { provider });
    }

    return newWindow;
  }

  /**
   * Create a new quota window
   */
  private createWindow(provider: AIProvider): QuotaWindow {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + QUOTA_WINDOW_DURATION_MS);

    return {
      id: createQuotaWindowId(),
      provider,
      windowStart: now,
      windowEnd,
      windowDurationMs: QUOTA_WINDOW_DURATION_MS,
      usage: createEmptyUsageMetrics(),
      limits: {
        ...DEFAULT_USAGE_LIMITS,
        warningThreshold: this.config.warningThreshold,
        hardStopThreshold: this.config.hardStopThreshold,
      },
    };
  }

  /**
   * Calculate usage ratio based on estimated max calls
   */
  private calculateUsageRatio(window: QuotaWindow): number {
    // Simple ratio: current calls / max calls (capped at 1.0)
    // This gives a straightforward percentage of quota used
    if (this.config.estimatedMaxCalls <= 0) {
      return 0;
    }

    return Math.min(1.0, window.usage.callCount / this.config.estimatedMaxCalls);
  }

  /**
   * Determine status level based on usage ratio and limits
   */
  private determineStatus(usageRatio: number, limits: UsageLimits): QuotaStatusLevel {
    if (usageRatio >= limits.hardStopThreshold) {
      return 'exceeded';
    }
    if (usageRatio >= limits.warningThreshold && usageRatio >= 0.9) {
      return 'critical';
    }
    if (usageRatio >= limits.warningThreshold) {
      return 'warning';
    }
    return 'ok';
  }
}

/**
 * Create a new quota tracker service
 */
export function createQuotaTrackerService(
  eventBus: IEventBus,
  config?: QuotaConfig,
  logger?: ILogger
): IQuotaTrackerService {
  return new QuotaTrackerService(eventBus, config, logger);
}
