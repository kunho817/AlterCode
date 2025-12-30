/**
 * Quota Tracker
 *
 * Tracks API usage within 5-hour windows for both Claude and GLM.
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  AIProvider,
  QuotaWindow,
  QuotaStatus,
  QuotaConfig,
  UsageMetrics,
  UsageLimits,
  HierarchyLevel,
  LevelUsage,
} from '../types';
import { StateManager } from '../storage/StateManager';
import { Logger } from '../utils/Logger';

const WINDOW_DURATION_MS = 5 * 60 * 60 * 1000; // 5 hours

/**
 * Tracks API quota usage.
 */
export class QuotaTracker extends EventEmitter {
  private readonly stateManager: StateManager;
  private readonly config: QuotaConfig;
  private readonly logger: Logger;

  private windows: Map<AIProvider, QuotaWindow> = new Map();

  constructor(stateManager: StateManager, config: QuotaConfig) {
    super();
    this.stateManager = stateManager;
    this.config = config;
    this.logger = new Logger('QuotaTracker');
  }

  /**
   * Initialize quota tracker.
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing quota tracker...');

    // Load or create windows for each provider
    for (const provider of ['claude', 'glm'] as AIProvider[]) {
      let window = await this.stateManager.getCurrentQuotaWindow(provider);

      if (!window) {
        window = this.createWindow(provider);
        await this.stateManager.saveQuotaWindow(window);
      }

      this.windows.set(provider, window);
    }

    this.logger.info('Quota tracker initialized');
  }

  /**
   * Record API usage.
   */
  recordUsage(
    provider: AIProvider,
    level: HierarchyLevel,
    metrics: { tokensSent: number; tokensReceived: number }
  ): void {
    const window = this.getOrCreateWindow(provider);

    // Update metrics
    window.usage.callCount++;
    window.usage.tokensSent += metrics.tokensSent;
    window.usage.tokensReceived += metrics.tokensReceived;

    // Update level-specific metrics
    if (!window.usage.byLevel[level]) {
      window.usage.byLevel[level] = { callCount: 0, tokensSent: 0, tokensReceived: 0 };
    }
    window.usage.byLevel[level].callCount++;
    window.usage.byLevel[level].tokensSent += metrics.tokensSent;
    window.usage.byLevel[level].tokensReceived += metrics.tokensReceived;

    // Check thresholds
    const status = this.getStatus(provider);

    if (status.status === 'critical') {
      this.emit('exceeded', status);
    } else if (status.status === 'warning') {
      this.emit('warning', status);
    }

    // Persist
    this.stateManager.saveQuotaWindow(window).catch((err) => {
      this.logger.error('Failed to save quota window', err);
    });
  }

  /**
   * Check if we can execute a request.
   */
  canExecute(provider: AIProvider): boolean {
    const status = this.getStatus(provider);
    return status.status !== 'exceeded';
  }

  /**
   * Get quota status for a provider.
   */
  getStatus(provider: AIProvider): QuotaStatus {
    const window = this.getOrCreateWindow(provider);
    const usageRatio = this.calculateUsageRatio(window);

    let status: 'ok' | 'warning' | 'critical' | 'exceeded';
    if (usageRatio >= window.limits.hardStopThreshold) {
      status = 'exceeded';
    } else if (usageRatio >= this.config.warningThreshold) {
      status = usageRatio >= 0.9 ? 'critical' : 'warning';
    } else {
      status = 'ok';
    }

    return {
      provider,
      usageRatio,
      status,
      timeUntilResetMs: window.windowEnd.getTime() - Date.now(),
      currentWindow: window,
    };
  }

  /**
   * Get time until quota reset.
   */
  getTimeUntilReset(provider: AIProvider): number {
    const window = this.getOrCreateWindow(provider);
    return Math.max(0, window.windowEnd.getTime() - Date.now());
  }

  /**
   * Get or create quota window for provider.
   */
  private getOrCreateWindow(provider: AIProvider): QuotaWindow {
    let window = this.windows.get(provider);

    // Check if window is expired
    if (!window || window.windowEnd.getTime() <= Date.now()) {
      window = this.createWindow(provider);
      this.windows.set(provider, window);
      this.stateManager.saveQuotaWindow(window).catch((err) => {
        this.logger.error('Failed to save quota window', err);
      });
      this.emit('reset', { provider });
    }

    return window;
  }

  /**
   * Create a new quota window.
   */
  private createWindow(provider: AIProvider): QuotaWindow {
    const now = new Date();
    const end = new Date(now.getTime() + WINDOW_DURATION_MS);

    return {
      id: uuidv4(),
      provider,
      windowStart: now,
      windowEnd: end,
      windowDurationMs: WINDOW_DURATION_MS,
      usage: this.createEmptyUsage(),
      limits: this.createLimits(),
    };
  }

  /**
   * Create empty usage metrics.
   */
  private createEmptyUsage(): UsageMetrics {
    return {
      callCount: 0,
      tokensSent: 0,
      tokensReceived: 0,
      byLevel: {} as Record<HierarchyLevel, LevelUsage>,
    };
  }

  /**
   * Create usage limits.
   */
  private createLimits(): UsageLimits {
    return {
      maxCalls: null, // Subscription-based, no hard limit
      maxTokens: null,
      warningThreshold: this.config.warningThreshold,
      hardStopThreshold: this.config.hardStopThreshold,
    };
  }

  /**
   * Calculate usage ratio.
   * For subscription-based services, we estimate based on typical usage patterns.
   */
  private calculateUsageRatio(window: QuotaWindow): number {
    // Estimate based on call count within time window
    // Assuming ~100 calls per 5-hour window is "100%" usage
    const estimatedMaxCalls = 100;
    const elapsed = Date.now() - window.windowStart.getTime();
    const windowProgress = elapsed / window.windowDurationMs;
    const expectedCalls = estimatedMaxCalls * windowProgress;

    if (expectedCalls === 0) return 0;
    return Math.min(1, window.usage.callCount / estimatedMaxCalls);
  }
}
