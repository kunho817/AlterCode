/**
 * QuotaTrackerService Unit Tests
 */

import {
  QuotaTrackerService,
  createQuotaTrackerService,
} from '../../../src/infrastructure/QuotaTrackerService';
import {
  QuotaConfig,
  QUOTA_WINDOW_DURATION_MS,
} from '../../../src/types';
import { createMockEventBus } from '../testUtils';

describe('QuotaTrackerService', () => {
  let eventBus: ReturnType<typeof createMockEventBus>;
  let service: QuotaTrackerService;

  beforeEach(() => {
    eventBus = createMockEventBus();
    service = new QuotaTrackerService(eventBus);
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const result = await service.initialize();
      expect(result.ok).toBe(true);
    });

    it('should create windows for all providers on initialization', async () => {
      await service.initialize();

      const claudeStatus = service.getStatus('claude');
      const glmStatus = service.getStatus('glm');

      expect(claudeStatus.provider).toBe('claude');
      expect(glmStatus.provider).toBe('glm');
      expect(claudeStatus.status).toBe('ok');
      expect(glmStatus.status).toBe('ok');
    });
  });

  describe('recordUsage', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should record usage for a provider', () => {
      service.recordUsage('claude', 'sovereign', { sent: 100, received: 50 });

      const status = service.getStatus('claude');
      expect(status.currentWindow.usage.callCount).toBe(1);
      expect(status.currentWindow.usage.tokensSent).toBe(100);
      expect(status.currentWindow.usage.tokensReceived).toBe(50);
    });

    it('should accumulate multiple usages', () => {
      service.recordUsage('claude', 'sovereign', { sent: 100, received: 50 });
      service.recordUsage('claude', 'lord', { sent: 200, received: 100 });
      service.recordUsage('claude', 'worker', { sent: 50, received: 25 });

      const status = service.getStatus('claude');
      expect(status.currentWindow.usage.callCount).toBe(3);
      expect(status.currentWindow.usage.tokensSent).toBe(350);
      expect(status.currentWindow.usage.tokensReceived).toBe(175);
    });

    it('should track usage by hierarchy level', () => {
      service.recordUsage('claude', 'sovereign', { sent: 100, received: 50 });
      service.recordUsage('claude', 'sovereign', { sent: 100, received: 50 });
      service.recordUsage('claude', 'worker', { sent: 50, received: 25 });

      const status = service.getStatus('claude');
      const sovereignUsage = status.currentWindow.usage.byLevel['sovereign'];
      const workerUsage = status.currentWindow.usage.byLevel['worker'];

      expect(sovereignUsage?.callCount).toBe(2);
      expect(sovereignUsage?.tokensSent).toBe(200);
      expect(workerUsage?.callCount).toBe(1);
      expect(workerUsage?.tokensSent).toBe(50);
    });

    it('should track usage separately per provider', () => {
      service.recordUsage('claude', 'sovereign', { sent: 100, received: 50 });
      service.recordUsage('glm', 'worker', { sent: 200, received: 100 });

      const claudeStatus = service.getStatus('claude');
      const glmStatus = service.getStatus('glm');

      expect(claudeStatus.currentWindow.usage.callCount).toBe(1);
      expect(glmStatus.currentWindow.usage.callCount).toBe(1);
    });
  });

  describe('quota status levels', () => {
    let serviceWithLowThreshold: QuotaTrackerService;

    beforeEach(async () => {
      // Create service with low threshold for easier testing
      const config: QuotaConfig = {
        warningThreshold: 0.5,
        hardStopThreshold: 0.8,
        estimatedMaxCalls: 10, // Low for testing
      };
      serviceWithLowThreshold = new QuotaTrackerService(eventBus, config);
      await serviceWithLowThreshold.initialize();
    });

    it('should return ok status when usage is below warning threshold', () => {
      // 4 calls out of 10 = 0.4, below 0.5 warning threshold
      for (let i = 0; i < 4; i++) {
        serviceWithLowThreshold.recordUsage('claude', 'worker', { sent: 10, received: 5 });
      }

      const status = serviceWithLowThreshold.getStatus('claude');
      expect(status.status).toBe('ok');
      expect(status.usageRatio).toBeLessThan(0.5);
    });

    it('should return warning status when usage exceeds warning threshold', () => {
      // 6 calls out of 10 = 0.6, above 0.5 warning but below 0.8 hard stop
      for (let i = 0; i < 6; i++) {
        serviceWithLowThreshold.recordUsage('claude', 'worker', { sent: 10, received: 5 });
      }

      const status = serviceWithLowThreshold.getStatus('claude');
      // Ratio should be around 0.6 (6/10)
      expect(status.usageRatio).toBeGreaterThanOrEqual(0.5);
      expect(status.usageRatio).toBeLessThan(0.8);
      expect(status.status).toBe('warning');
    });

    it('should return critical status when usage is very high', async () => {
      // Create a service with specific thresholds where 90%+ triggers critical
      const criticalConfig: QuotaConfig = {
        warningThreshold: 0.8,
        hardStopThreshold: 0.99, // Set high to avoid exceeded
        estimatedMaxCalls: 10,
      };
      const criticalService = new QuotaTrackerService(eventBus, criticalConfig);
      await criticalService.initialize();

      // 9 calls out of 10 = 0.9, above warning (0.8) and >= 0.9, below 0.99
      for (let i = 0; i < 9; i++) {
        criticalService.recordUsage('claude', 'worker', { sent: 10, received: 5 });
      }

      const status = criticalService.getStatus('claude');
      // Ratio should be 0.9, >= warning (0.8) and >= 0.9, so critical
      expect(status.usageRatio).toBeGreaterThanOrEqual(0.9);
      expect(status.usageRatio).toBeLessThan(0.99);
      expect(status.status).toBe('critical');
    });

    it('should return exceeded status when usage exceeds hard stop threshold', () => {
      // 9 calls out of 10 = 0.9, above 0.8 hard stop threshold
      for (let i = 0; i < 9; i++) {
        serviceWithLowThreshold.recordUsage('claude', 'worker', { sent: 10, received: 5 });
      }

      const status = serviceWithLowThreshold.getStatus('claude');
      expect(status.status).toBe('exceeded');
    });
  });

  describe('canExecute', () => {
    let serviceWithLowThreshold: QuotaTrackerService;

    beforeEach(async () => {
      const config: QuotaConfig = {
        warningThreshold: 0.5,
        hardStopThreshold: 0.8,
        estimatedMaxCalls: 10,
      };
      serviceWithLowThreshold = new QuotaTrackerService(eventBus, config);
      await serviceWithLowThreshold.initialize();
    });

    it('should return true when quota is ok', () => {
      expect(serviceWithLowThreshold.canExecute('claude')).toBe(true);
    });

    it('should return true when quota is at warning level', () => {
      // 6 calls = warning
      for (let i = 0; i < 6; i++) {
        serviceWithLowThreshold.recordUsage('claude', 'worker', { sent: 10, received: 5 });
      }

      expect(serviceWithLowThreshold.canExecute('claude')).toBe(true);
    });

    it('should return false when quota is exceeded', () => {
      // 9 calls = exceeded
      for (let i = 0; i < 9; i++) {
        serviceWithLowThreshold.recordUsage('claude', 'worker', { sent: 10, received: 5 });
      }

      expect(serviceWithLowThreshold.canExecute('claude')).toBe(false);
    });

    it('should check per provider', () => {
      // Exceed claude quota
      for (let i = 0; i < 9; i++) {
        serviceWithLowThreshold.recordUsage('claude', 'worker', { sent: 10, received: 5 });
      }

      expect(serviceWithLowThreshold.canExecute('claude')).toBe(false);
      expect(serviceWithLowThreshold.canExecute('glm')).toBe(true);
    });
  });

  describe('event emission', () => {
    let serviceWithLowThreshold: QuotaTrackerService;

    beforeEach(async () => {
      const config: QuotaConfig = {
        warningThreshold: 0.5,
        hardStopThreshold: 0.8,
        estimatedMaxCalls: 10,
      };
      serviceWithLowThreshold = new QuotaTrackerService(eventBus, config);
      await serviceWithLowThreshold.initialize();
      eventBus.emittedEvents.length = 0; // Clear initialization events
    });

    it('should emit quota:warning when warning threshold is crossed', () => {
      // 6 calls = 0.6 ratio, above 0.5 warning but below 0.8 hard stop
      for (let i = 0; i < 6; i++) {
        serviceWithLowThreshold.recordUsage('claude', 'worker', { sent: 10, received: 5 });
      }

      // Verify we're in warning status
      const status = serviceWithLowThreshold.getStatus('claude');
      expect(status.usageRatio).toBeGreaterThanOrEqual(0.5);
      expect(status.usageRatio).toBeLessThan(0.8);
      expect(status.status).toBe('warning');

      const warningEvent = eventBus.emittedEvents.find((e) => e.event === 'quota:warning');
      expect(warningEvent).toBeDefined();
      expect((warningEvent?.payload as { provider: string }).provider).toBe('claude');
    });

    it('should emit quota:exceeded when hard stop threshold is crossed', () => {
      // Exceed the threshold
      for (let i = 0; i < 9; i++) {
        serviceWithLowThreshold.recordUsage('claude', 'worker', { sent: 10, received: 5 });
      }

      const exceededEvent = eventBus.emittedEvents.find((e) => e.event === 'quota:exceeded');
      expect(exceededEvent).toBeDefined();
      expect((exceededEvent?.payload as { provider: string }).provider).toBe('claude');
    });
  });

  describe('getTimeUntilReset', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should return time until window reset', () => {
      const timeUntilReset = service.getTimeUntilReset('claude');

      // Should be close to the full window duration (5 hours)
      expect(timeUntilReset).toBeGreaterThan(0);
      expect(timeUntilReset).toBeLessThanOrEqual(QUOTA_WINDOW_DURATION_MS);
    });
  });

  describe('getAllStatuses', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should return statuses for all providers', () => {
      const statuses = service.getAllStatuses();

      expect(statuses.size).toBe(2);
      expect(statuses.has('claude')).toBe(true);
      expect(statuses.has('glm')).toBe(true);
    });
  });

  describe('createQuotaTrackerService factory', () => {
    it('should create a new instance', () => {
      const tracker = createQuotaTrackerService(eventBus);
      expect(tracker).toBeInstanceOf(QuotaTrackerService);
    });

    it('should accept custom config', async () => {
      const config: QuotaConfig = {
        warningThreshold: 0.6,
        hardStopThreshold: 0.9,
        estimatedMaxCalls: 100,
      };
      const tracker = createQuotaTrackerService(eventBus, config);
      await tracker.initialize();

      // Config should be applied (we can verify by checking thresholds behavior)
      expect(tracker).toBeInstanceOf(QuotaTrackerService);
    });
  });
});
