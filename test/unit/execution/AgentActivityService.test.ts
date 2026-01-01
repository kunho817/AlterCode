/**
 * AgentActivityService Unit Tests
 */

import {
  AgentActivityService,
  createAgentActivityService,
} from '../../../src/execution/AgentActivityService';
import {
  ActivityConfig,
  ActivityMetrics,
} from '../../../src/types';
import {
  createMockEventBus,
  createMissionId,
  createAgentId,
  createTaskId,
} from '../testUtils';

describe('AgentActivityService', () => {
  let eventBus: ReturnType<typeof createMockEventBus>;
  let service: AgentActivityService;

  beforeEach(() => {
    eventBus = createMockEventBus();
    service = new AgentActivityService(eventBus);
  });

  afterEach(() => {
    service.clearAll();
  });

  describe('recordStart', () => {
    it('should create and return an activity entry ID', () => {
      const missionId = createMissionId('mission-1');
      const agentId = createAgentId('agent-1');
      const taskId = createTaskId('task-1');

      const entryId = service.recordStart(missionId, agentId, taskId, 'Test prompt');

      expect(entryId).toBeDefined();
      expect(typeof entryId).toBe('string');
    });

    it('should emit activity:started event', () => {
      const missionId = createMissionId('mission-1');
      const agentId = createAgentId('agent-1');
      const taskId = createTaskId('task-1');

      service.recordStart(missionId, agentId, taskId, 'Test prompt');

      const startedEvent = eventBus.emittedEvents.find((e) => e.event === 'activity:started');
      expect(startedEvent).toBeDefined();
      expect((startedEvent!.payload as any).entry.status).toBe('thinking');
    });

    it('should create entry with thinking status', () => {
      const missionId = createMissionId('mission-1');
      const agentId = createAgentId('agent-1');
      const taskId = createTaskId('task-1');

      service.recordStart(missionId, agentId, taskId, 'Test prompt');

      const entries = service.getEntries(missionId);
      expect(entries.length).toBe(1);
      expect(entries[0]!.status).toBe('thinking');
      expect(entries[0]!.agentId).toBe(agentId);
      expect(entries[0]!.taskId).toBe(taskId);
    });

    it('should truncate long prompts', () => {
      const config: ActivityConfig = { maxPromptLength: 20 };
      const shortService = new AgentActivityService(eventBus, config);

      const missionId = createMissionId('mission-1');
      const agentId = createAgentId('agent-1');
      const taskId = createTaskId('task-1');
      const longPrompt = 'This is a very long prompt that should be truncated';

      shortService.recordStart(missionId, agentId, taskId, longPrompt);

      const entries = shortService.getEntries(missionId);
      expect(entries[0]!.prompt!.length).toBeLessThanOrEqual(20);
      expect(entries[0]!.prompt!.endsWith('...')).toBe(true);
    });
  });

  describe('recordComplete', () => {
    it('should update entry status to completed', () => {
      const missionId = createMissionId('mission-1');
      const agentId = createAgentId('agent-1');
      const taskId = createTaskId('task-1');

      const entryId = service.recordStart(missionId, agentId, taskId, 'Test prompt');

      const metrics: ActivityMetrics = {
        durationMs: 1000,
        tokensSent: 100,
        tokensReceived: 50,
      };

      service.recordComplete(entryId, 'Response text', metrics);

      const entries = service.getEntries(missionId);
      expect(entries[0]!.status).toBe('completed');
      expect(entries[0]!.response).toBe('Response text');
      expect(entries[0]!.metrics).toEqual(metrics);
    });

    it('should emit activity:completed event', () => {
      const missionId = createMissionId('mission-1');
      const agentId = createAgentId('agent-1');
      const taskId = createTaskId('task-1');

      const entryId = service.recordStart(missionId, agentId, taskId, 'Test prompt');
      eventBus.emittedEvents.length = 0; // Clear start event

      const metrics: ActivityMetrics = {
        durationMs: 1000,
        tokensSent: 100,
        tokensReceived: 50,
      };

      service.recordComplete(entryId, 'Response', metrics);

      const completedEvent = eventBus.emittedEvents.find((e) => e.event === 'activity:completed');
      expect(completedEvent).toBeDefined();
    });

    it('should handle unknown entry ID gracefully', () => {
      const metrics: ActivityMetrics = {
        durationMs: 1000,
        tokensSent: 100,
        tokensReceived: 50,
      };

      // Should not throw
      service.recordComplete('unknown-id' as any, 'Response', metrics);
    });
  });

  describe('recordFailure', () => {
    it('should update entry status to failed', () => {
      const missionId = createMissionId('mission-1');
      const agentId = createAgentId('agent-1');
      const taskId = createTaskId('task-1');

      const entryId = service.recordStart(missionId, agentId, taskId, 'Test prompt');

      service.recordFailure(entryId, 'Something went wrong');

      const entries = service.getEntries(missionId);
      expect(entries[0]!.status).toBe('failed');
      expect(entries[0]!.error).toBe('Something went wrong');
    });

    it('should emit activity:failed event', () => {
      const missionId = createMissionId('mission-1');
      const agentId = createAgentId('agent-1');
      const taskId = createTaskId('task-1');

      const entryId = service.recordStart(missionId, agentId, taskId, 'Test prompt');
      eventBus.emittedEvents.length = 0; // Clear start event

      service.recordFailure(entryId, 'Error message');

      const failedEvent = eventBus.emittedEvents.find((e) => e.event === 'activity:failed');
      expect(failedEvent).toBeDefined();
    });
  });

  describe('getEntries', () => {
    it('should return empty array for unknown mission', () => {
      const entries = service.getEntries(createMissionId('unknown'));
      expect(entries).toEqual([]);
    });

    it('should return all entries for a mission', () => {
      const missionId = createMissionId('mission-1');

      service.recordStart(missionId, createAgentId('agent-1'), createTaskId('task-1'), 'Prompt 1');
      service.recordStart(missionId, createAgentId('agent-2'), createTaskId('task-2'), 'Prompt 2');
      service.recordStart(missionId, createAgentId('agent-3'), createTaskId('task-3'), 'Prompt 3');

      const entries = service.getEntries(missionId);
      expect(entries.length).toBe(3);
    });

    it('should not return entries from other missions', () => {
      const mission1 = createMissionId('mission-1');
      const mission2 = createMissionId('mission-2');

      service.recordStart(mission1, createAgentId('agent-1'), createTaskId('task-1'), 'Prompt 1');
      service.recordStart(mission2, createAgentId('agent-2'), createTaskId('task-2'), 'Prompt 2');

      const entries1 = service.getEntries(mission1);
      const entries2 = service.getEntries(mission2);

      expect(entries1.length).toBe(1);
      expect(entries2.length).toBe(1);
    });
  });

  describe('getRecentEntries', () => {
    it('should return entries sorted by timestamp descending', async () => {
      const missionId = createMissionId('mission-1');

      service.recordStart(missionId, createAgentId('agent-1'), createTaskId('task-1'), 'First');
      await new Promise((r) => setTimeout(r, 10));
      service.recordStart(missionId, createAgentId('agent-2'), createTaskId('task-2'), 'Second');
      await new Promise((r) => setTimeout(r, 10));
      service.recordStart(missionId, createAgentId('agent-3'), createTaskId('task-3'), 'Third');

      const recent = service.getRecentEntries(10);

      expect(recent[0]!.prompt).toBe('Third');
      expect(recent[1]!.prompt).toBe('Second');
      expect(recent[2]!.prompt).toBe('First');
    });

    it('should limit results to specified count', () => {
      const missionId = createMissionId('mission-1');

      for (let i = 0; i < 10; i++) {
        service.recordStart(missionId, createAgentId(`agent-${i}`), createTaskId(`task-${i}`), `Prompt ${i}`);
      }

      const recent = service.getRecentEntries(5);
      expect(recent.length).toBe(5);
    });

    it('should return entries from all missions', () => {
      service.recordStart(createMissionId('mission-1'), createAgentId('agent-1'), createTaskId('task-1'), 'P1');
      service.recordStart(createMissionId('mission-2'), createAgentId('agent-2'), createTaskId('task-2'), 'P2');

      const recent = service.getRecentEntries(10);
      expect(recent.length).toBe(2);
    });
  });

  describe('getActiveCount', () => {
    it('should return 0 when no activities', () => {
      expect(service.getActiveCount()).toBe(0);
    });

    it('should count entries with thinking status', () => {
      const missionId = createMissionId('mission-1');

      service.recordStart(missionId, createAgentId('agent-1'), createTaskId('task-1'), 'P1');
      service.recordStart(missionId, createAgentId('agent-2'), createTaskId('task-2'), 'P2');
      service.recordStart(missionId, createAgentId('agent-3'), createTaskId('task-3'), 'P3');

      expect(service.getActiveCount()).toBe(3);
    });

    it('should not count completed or failed entries', () => {
      const missionId = createMissionId('mission-1');

      const entry1 = service.recordStart(missionId, createAgentId('agent-1'), createTaskId('task-1'), 'P1');
      const entry2 = service.recordStart(missionId, createAgentId('agent-2'), createTaskId('task-2'), 'P2');
      service.recordStart(missionId, createAgentId('agent-3'), createTaskId('task-3'), 'P3');

      service.recordComplete(entry1, 'Done', { durationMs: 100, tokensSent: 10, tokensReceived: 5 });
      service.recordFailure(entry2, 'Error');

      expect(service.getActiveCount()).toBe(1);
    });
  });

  describe('getStats', () => {
    it('should return zero stats for unknown mission', () => {
      const stats = service.getStats(createMissionId('unknown'));

      expect(stats.totalCount).toBe(0);
      expect(stats.activeCount).toBe(0);
      expect(stats.completedCount).toBe(0);
      expect(stats.failedCount).toBe(0);
    });

    it('should calculate correct statistics', () => {
      const missionId = createMissionId('mission-1');

      const entry1 = service.recordStart(missionId, createAgentId('agent-1'), createTaskId('task-1'), 'P1');
      const entry2 = service.recordStart(missionId, createAgentId('agent-2'), createTaskId('task-2'), 'P2');
      service.recordStart(missionId, createAgentId('agent-3'), createTaskId('task-3'), 'P3');

      service.recordComplete(entry1, 'Done', { durationMs: 100, tokensSent: 50, tokensReceived: 25 });
      service.recordFailure(entry2, 'Error');

      const stats = service.getStats(missionId);

      expect(stats.totalCount).toBe(3);
      expect(stats.activeCount).toBe(1);
      expect(stats.completedCount).toBe(1);
      expect(stats.failedCount).toBe(1);
      expect(stats.avgDurationMs).toBe(100);
      expect(stats.totalTokensSent).toBe(50);
      expect(stats.totalTokensReceived).toBe(25);
    });

    it('should calculate average duration correctly', () => {
      const missionId = createMissionId('mission-1');

      const entry1 = service.recordStart(missionId, createAgentId('agent-1'), createTaskId('task-1'), 'P1');
      const entry2 = service.recordStart(missionId, createAgentId('agent-2'), createTaskId('task-2'), 'P2');

      service.recordComplete(entry1, 'Done', { durationMs: 100, tokensSent: 10, tokensReceived: 5 });
      service.recordComplete(entry2, 'Done', { durationMs: 200, tokensSent: 20, tokensReceived: 10 });

      const stats = service.getStats(missionId);

      expect(stats.avgDurationMs).toBe(150);
    });
  });

  describe('clearMission', () => {
    it('should remove all entries for a mission', () => {
      const missionId = createMissionId('mission-1');

      service.recordStart(missionId, createAgentId('agent-1'), createTaskId('task-1'), 'P1');
      service.recordStart(missionId, createAgentId('agent-2'), createTaskId('task-2'), 'P2');

      expect(service.getEntries(missionId).length).toBe(2);

      service.clearMission(missionId);

      expect(service.getEntries(missionId).length).toBe(0);
    });

    it('should not affect other missions', () => {
      const mission1 = createMissionId('mission-1');
      const mission2 = createMissionId('mission-2');

      service.recordStart(mission1, createAgentId('agent-1'), createTaskId('task-1'), 'P1');
      service.recordStart(mission2, createAgentId('agent-2'), createTaskId('task-2'), 'P2');

      service.clearMission(mission1);

      expect(service.getEntries(mission1).length).toBe(0);
      expect(service.getEntries(mission2).length).toBe(1);
    });
  });

  describe('circular buffer behavior', () => {
    it('should limit entries per mission', () => {
      const config: ActivityConfig = { maxEntriesPerMission: 3 };
      const limitedService = new AgentActivityService(eventBus, config);

      const missionId = createMissionId('mission-1');

      // Add more entries than the limit
      for (let i = 0; i < 5; i++) {
        limitedService.recordStart(missionId, createAgentId(`agent-${i}`), createTaskId(`task-${i}`), `Prompt ${i}`);
      }

      const entries = limitedService.getEntries(missionId);
      expect(entries.length).toBe(3);

      // Should keep the newest entries
      expect(entries[0]!.prompt).toBe('Prompt 2');
      expect(entries[1]!.prompt).toBe('Prompt 3');
      expect(entries[2]!.prompt).toBe('Prompt 4');
    });
  });

  describe('createAgentActivityService factory', () => {
    it('should create a new instance', () => {
      const activityService = createAgentActivityService(eventBus);
      expect(activityService).toBeInstanceOf(AgentActivityService);
    });

    it('should accept custom config', () => {
      const config: ActivityConfig = {
        maxEntriesPerMission: 50,
        maxPromptLength: 500,
      };
      const activityService = createAgentActivityService(eventBus, config);
      expect(activityService).toBeInstanceOf(AgentActivityService);
    });
  });
});
