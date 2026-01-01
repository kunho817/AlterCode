/**
 * PerformanceMonitorService Unit Tests
 */

import {
  PerformanceMonitorService,
  createPerformanceMonitor,
} from '../../../src/infrastructure/PerformanceMonitorService';
import { PerformanceMonitorConfig } from '../../../src/types';

describe('PerformanceMonitorService', () => {
  let service: PerformanceMonitorService;

  beforeEach(() => {
    service = new PerformanceMonitorService();
  });

  afterEach(() => {
    service.clearStats();
  });

  describe('start and end', () => {
    it('should start and end timing an operation', () => {
      const id = service.start('testOperation');
      const duration = service.end(id);

      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('should return different IDs for each start', () => {
      const id1 = service.start('op1');
      const id2 = service.start('op2');

      expect(id1).not.toBe(id2);
    });

    it('should return 0 for unknown entry IDs', () => {
      const duration = service.end('unknown-id' as any);
      expect(duration).toBe(0);
    });

    it('should track duration correctly', async () => {
      const id = service.start('delayedOperation');

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      const duration = service.end(id);
      expect(duration).toBeGreaterThanOrEqual(10);
    });
  });

  describe('measure (async)', () => {
    it('should measure async function execution time', async () => {
      const result = await service.measure('asyncOp', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'done';
      });

      expect(result).toBe('done');

      const stats = service.getStats('asyncOp');
      expect(stats).toBeDefined();
      expect(stats!.count).toBe(1);
      expect(stats!.avgMs).toBeGreaterThanOrEqual(10);
    });

    it('should record stats even if function throws', async () => {
      await expect(
        service.measure('failingOp', async () => {
          throw new Error('test error');
        })
      ).rejects.toThrow('test error');

      const stats = service.getStats('failingOp');
      expect(stats).toBeDefined();
      expect(stats!.count).toBe(1);
    });
  });

  describe('measureSync', () => {
    it('should measure sync function execution time', () => {
      const result = service.measureSync('syncOp', () => {
        // Simulate some work
        let sum = 0;
        for (let i = 0; i < 1000; i++) {
          sum += i;
        }
        return sum;
      });

      expect(result).toBe(499500); // sum of 0-999

      const stats = service.getStats('syncOp');
      expect(stats).toBeDefined();
      expect(stats!.count).toBe(1);
    });

    it('should record stats even if sync function throws', () => {
      expect(() => {
        service.measureSync('failingSyncOp', () => {
          throw new Error('sync error');
        });
      }).toThrow('sync error');

      const stats = service.getStats('failingSyncOp');
      expect(stats).toBeDefined();
      expect(stats!.count).toBe(1);
    });
  });

  describe('getStats', () => {
    it('should return undefined for unknown operations', () => {
      const stats = service.getStats('unknown');
      expect(stats).toBeUndefined();
    });

    it('should return aggregated stats for an operation', () => {
      // Execute operation multiple times
      for (let i = 0; i < 3; i++) {
        const id = service.start('repeatedOp');
        service.end(id);
      }

      const stats = service.getStats('repeatedOp');
      expect(stats).toBeDefined();
      expect(stats!.name).toBe('repeatedOp');
      expect(stats!.count).toBe(3);
      expect(stats!.totalMs).toBeGreaterThanOrEqual(0);
      expect(stats!.avgMs).toBe(stats!.totalMs / 3);
    });

    it('should calculate min and max correctly', async () => {
      // Fast operation
      service.measureSync('minMaxOp', () => {});

      // Slower operation
      await service.measure('minMaxOp', async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      const stats = service.getStats('minMaxOp');
      expect(stats!.count).toBe(2);
      expect(stats!.minMs).toBeLessThan(stats!.maxMs);
      expect(stats!.maxMs).toBeGreaterThanOrEqual(20);
    });
  });

  describe('getAllStats', () => {
    it('should return empty array when no stats', () => {
      const allStats = service.getAllStats();
      expect(allStats).toEqual([]);
    });

    it('should return all operation stats', () => {
      service.measureSync('op1', () => {});
      service.measureSync('op2', () => {});
      service.measureSync('op3', () => {});

      const allStats = service.getAllStats();
      expect(allStats.length).toBe(3);
    });

    it('should sort by total time descending', async () => {
      // Fast operation
      service.measureSync('fastOp', () => {});

      // Slower operation
      await service.measure('slowOp', async () => {
        await new Promise((resolve) => setTimeout(resolve, 15));
      });

      const allStats = service.getAllStats();
      expect(allStats[0]!.name).toBe('slowOp');
      expect(allStats[1]!.name).toBe('fastOp');
    });
  });

  describe('getReport', () => {
    it('should return message when no data', () => {
      const report = service.getReport();
      expect(report).toBe('No performance data collected');
    });

    it('should generate formatted report', () => {
      service.measureSync('testOp1', () => {});
      service.measureSync('testOp2', () => {});

      const report = service.getReport();

      expect(report).toContain('Operation');
      expect(report).toContain('Count');
      expect(report).toContain('testOp1');
      expect(report).toContain('testOp2');
      expect(report).toContain('│');
      expect(report).toContain('─');
    });
  });

  describe('clearStats', () => {
    it('should clear all stats', () => {
      service.measureSync('op1', () => {});
      service.measureSync('op2', () => {});

      expect(service.getAllStats().length).toBe(2);

      service.clearStats();

      expect(service.getAllStats().length).toBe(0);
    });

    it('should clear active entries', () => {
      const id = service.start('activeOp');

      service.clearStats();

      // After clearing, end should return 0
      const duration = service.end(id);
      expect(duration).toBe(0);
    });
  });

  describe('isEnabled', () => {
    it('should return true by default', () => {
      expect(service.isEnabled()).toBe(true);
    });

    it('should return false when disabled', () => {
      const disabledService = new PerformanceMonitorService({ enabled: false });
      expect(disabledService.isEnabled()).toBe(false);
    });
  });

  describe('disabled mode', () => {
    let disabledService: PerformanceMonitorService;

    beforeEach(() => {
      disabledService = new PerformanceMonitorService({ enabled: false });
    });

    it('should not record stats when disabled', () => {
      const id = disabledService.start('disabledOp');
      disabledService.end(id);

      const stats = disabledService.getStats('disabledOp');
      expect(stats).toBeUndefined();
    });

    it('should return 0 from end when disabled', () => {
      const id = disabledService.start('disabledOp');
      const duration = disabledService.end(id);
      expect(duration).toBe(0);
    });

    it('should still execute measure functions when disabled', async () => {
      const result = await disabledService.measure('asyncOp', async () => 'result');
      expect(result).toBe('result');
    });
  });

  describe('memory management', () => {
    it('should limit entries to maxEntries', () => {
      const limitedService = new PerformanceMonitorService({ maxEntries: 3 });

      // Start 5 operations without ending
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        ids.push(limitedService.start(`op${i}`));
      }

      // Older entries should be evicted, newer should still work
      // End the last one (should still be tracked)
      const lastDuration = limitedService.end(ids[4] as any);
      expect(lastDuration).toBeGreaterThanOrEqual(0);

      // First entries may have been evicted
      const firstDuration = limitedService.end(ids[0] as any);
      expect(firstDuration).toBe(0); // Entry was evicted
    });
  });

  describe('createPerformanceMonitor factory', () => {
    it('should create a new instance', () => {
      const monitor = createPerformanceMonitor();
      expect(monitor).toBeInstanceOf(PerformanceMonitorService);
    });

    it('should accept custom config', () => {
      const config: PerformanceMonitorConfig = {
        enabled: true,
        slowOperationThresholdMs: 500,
        maxEntries: 50,
      };
      const monitor = createPerformanceMonitor(config);
      expect(monitor.isEnabled()).toBe(true);
    });
  });
});
