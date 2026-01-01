/**
 * Performance Monitor Service
 *
 * Lightweight utility for measuring execution times and tracking
 * aggregated performance metrics:
 * - Manual start/end timing
 * - Wrapped timing with measure/measureSync
 * - Aggregated statistics per operation
 * - Slow operation warnings
 */

import {
  IPerformanceMonitor,
  PerfStats,
  PerformanceMonitorConfig,
  DEFAULT_PERFORMANCE_MONITOR_CONFIG,
  PerfEntryId,
  createPerfEntryId,
  ILogger,
} from '../types';

/** Internal performance entry */
interface PerfEntry {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
}

/** Mutable stats for aggregation */
interface MutablePerfStats {
  name: string;
  count: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
}

/**
 * Performance Monitor Service Implementation
 */
export class PerformanceMonitorService implements IPerformanceMonitor {
  private readonly logger?: ILogger;
  private readonly config: Required<PerformanceMonitorConfig>;

  /** Active timing entries */
  private readonly entries: Map<string, PerfEntry> = new Map();

  /** Aggregated statistics per operation */
  private readonly stats: Map<string, MutablePerfStats> = new Map();

  constructor(config?: PerformanceMonitorConfig, logger?: ILogger) {
    this.config = { ...DEFAULT_PERFORMANCE_MONITOR_CONFIG, ...config };
    this.logger = logger?.child('PerformanceMonitor');
  }

  /**
   * Start timing an operation
   */
  start(name: string): PerfEntryId {
    if (!this.config.enabled) {
      return name as PerfEntryId;
    }

    const id = createPerfEntryId();

    const entry: PerfEntry = {
      name,
      startTime: performance.now(),
    };

    this.entries.set(id, entry);

    // Memory cleanup if too many entries
    if (this.entries.size > this.config.maxEntries) {
      const firstKey = this.entries.keys().next().value;
      if (firstKey) {
        this.entries.delete(firstKey);
      }
    }

    return id;
  }

  /**
   * End timing an operation
   */
  end(id: PerfEntryId): number {
    if (!this.config.enabled) {
      return 0;
    }

    const entry = this.entries.get(id);
    if (!entry) {
      return 0;
    }

    const endTime = performance.now();
    const duration = endTime - entry.startTime;

    // Update aggregated stats
    this.updateStats(entry.name, duration);

    // Log slow operations
    if (duration > this.config.slowOperationThresholdMs) {
      this.logger?.warn(`Slow operation: ${entry.name} took ${duration.toFixed(2)}ms`);
    }

    // Cleanup entry
    this.entries.delete(id);

    return duration;
  }

  /**
   * Measure an async operation
   */
  async measure<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const id = this.start(name);
    try {
      return await fn();
    } finally {
      this.end(id);
    }
  }

  /**
   * Measure a sync operation
   */
  measureSync<T>(name: string, fn: () => T): T {
    const id = this.start(name);
    try {
      return fn();
    } finally {
      this.end(id);
    }
  }

  /**
   * Get stats for a specific operation
   */
  getStats(name: string): PerfStats | undefined {
    const stats = this.stats.get(name);
    if (!stats) {
      return undefined;
    }
    return { ...stats };
  }

  /**
   * Get all stats sorted by total time (descending)
   */
  getAllStats(): PerfStats[] {
    return Array.from(this.stats.values())
      .map((s) => ({ ...s }))
      .sort((a, b) => b.totalMs - a.totalMs);
  }

  /**
   * Get a formatted performance report
   */
  getReport(): string {
    const allStats = this.getAllStats();

    if (allStats.length === 0) {
      return 'No performance data collected';
    }

    // Header
    const lines: string[] = [
      '┌─────────────────────────────────────┬───────┬──────────┬─────────┬─────────┬─────────┐',
      '│ Operation                           │ Count │ Total(ms)│ Avg(ms) │ Min(ms) │ Max(ms) │',
      '├─────────────────────────────────────┼───────┼──────────┼─────────┼─────────┼─────────┤',
    ];

    // Data rows
    for (const stat of allStats) {
      const name = stat.name.substring(0, 35).padEnd(35);
      const count = stat.count.toString().padStart(5);
      const total = stat.totalMs.toFixed(0).padStart(8);
      const avg = stat.avgMs.toFixed(2).padStart(7);
      const min = stat.minMs.toFixed(2).padStart(7);
      const max = stat.maxMs.toFixed(2).padStart(7);

      lines.push(`│ ${name} │${count} │${total} │${avg} │${min} │${max} │`);
    }

    // Footer
    lines.push(
      '└─────────────────────────────────────┴───────┴──────────┴─────────┴─────────┴─────────┘'
    );

    return lines.join('\n');
  }

  /**
   * Clear all stats
   */
  clearStats(): void {
    this.stats.clear();
    this.entries.clear();
  }

  /**
   * Check if monitoring is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Update aggregated statistics for an operation
   */
  private updateStats(name: string, duration: number): void {
    const existing = this.stats.get(name);

    if (!existing) {
      // First time seeing this operation
      this.stats.set(name, {
        name,
        count: 1,
        totalMs: duration,
        avgMs: duration,
        minMs: duration,
        maxMs: duration,
      });
    } else {
      // Update existing stats
      existing.count++;
      existing.totalMs += duration;
      existing.avgMs = existing.totalMs / existing.count;
      existing.minMs = Math.min(existing.minMs, duration);
      existing.maxMs = Math.max(existing.maxMs, duration);
    }
  }
}

/**
 * Create a new performance monitor service
 */
export function createPerformanceMonitor(
  config?: PerformanceMonitorConfig,
  logger?: ILogger
): IPerformanceMonitor {
  return new PerformanceMonitorService(config, logger);
}
