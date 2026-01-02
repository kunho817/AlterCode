/**
 * ApprovalService Unit Tests
 */

import {
  ApprovalService,
  createApprovalService,
} from '../../../src/protocol/ApprovalService';
import {
  ApprovalConfig,
  ApprovalId,
} from '../../../src/types';
import { FileChange } from '../../../src/types/conflict';
import { Task, HierarchyLevel } from '../../../src/types/execution';
import {
  createMockEventBus,
  createTaskId,
  createMissionId,
  createFilePath,
} from '../testUtils';

// Helper to create a mock task
function createMockTask(options?: Partial<Task>): Task {
  return {
    id: createTaskId('task-1'),
    missionId: createMissionId('mission-1'),
    title: 'Test Task',
    description: 'A test task',
    type: 'implement',
    status: 'pending',
    priority: 'normal',
    level: 'worker',
    createdAt: new Date(),
    updatedAt: new Date(),
    dependencies: [],
    ...options,
  };
}

// Helper to create mock file changes
function createMockChanges(): FileChange[] {
  return [
    {
      filePath: createFilePath('/src/test.ts'),
      originalContent: 'original',
      modifiedContent: 'modified',
      diff: 'diff',
      changeType: 'modify',
    },
  ];
}

describe('ApprovalService', () => {
  let eventBus: ReturnType<typeof createMockEventBus>;
  let service: ApprovalService;

  beforeEach(() => {
    eventBus = createMockEventBus();
    service = new ApprovalService(eventBus);
  });

  afterEach(async () => {
    service.clearAll();
    // Allow pending promises to settle before next test
    await new Promise((resolve) => setImmediate(resolve));
  });

  describe('setApprovalMode / getApprovalMode', () => {
    it('should default to step_by_step mode', () => {
      expect(service.getApprovalMode()).toBe('step_by_step');
    });

    it('should set and get approval mode', () => {
      service.setApprovalMode('full_automation');
      expect(service.getApprovalMode()).toBe('full_automation');

      service.setApprovalMode('fully_manual');
      expect(service.getApprovalMode()).toBe('fully_manual');
    });
  });

  describe('requestApproval - full_automation mode', () => {
    beforeEach(() => {
      service.setApprovalMode('full_automation');
    });

    it('should auto-approve all requests', async () => {
      const task = createMockTask();
      const changes = createMockChanges();

      const result = await service.requestApproval(task, changes);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.approved).toBe(true);
        expect(result.value.automatic).toBe(true);
        expect(result.value.mode).toBe('full_automation');
      }
    });

    it('should not emit approval:requested event', async () => {
      const task = createMockTask();
      const changes = createMockChanges();

      await service.requestApproval(task, changes);

      const requestEvent = eventBus.emittedEvents.find((e) => e.event === 'approval:requested');
      expect(requestEvent).toBeUndefined();
    });
  });

  describe('requestApproval - step_by_step mode', () => {
    beforeEach(() => {
      service.setApprovalMode('step_by_step');
    });

    it('should auto-approve non-boundary tasks', async () => {
      const task = createMockTask({ level: 'worker' as HierarchyLevel });
      const changes = createMockChanges();

      const result = await service.requestApproval(task, changes);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.approved).toBe(true);
        expect(result.value.automatic).toBe(true);
      }
    });

    it('should wait for approval at boundary levels', async () => {
      // lord is a boundary level by default
      const task = createMockTask({ level: 'lord' as HierarchyLevel });
      const changes = createMockChanges();

      // Start the approval request (don't await it yet)
      const approvalPromise = service.requestApproval(task, changes);

      // Wait for event to be emitted
      await new Promise((r) => setTimeout(r, 10));

      const requestEvent = eventBus.emittedEvents.find((e) => e.event === 'approval:requested');
      expect(requestEvent).toBeDefined();

      // Get the pending approval
      const pendingApprovals = service.getPendingApprovals();
      expect(pendingApprovals.length).toBe(1);

      // Respond to approve
      const approvalId = pendingApprovals[0]!.id;
      await service.respond(approvalId, {
        approved: true,
        action: 'approve',
      });

      const result = await approvalPromise;
      expect(result.ok).toBe(true);
    });
  });

  describe('requestApproval - fully_manual mode', () => {
    beforeEach(() => {
      service.setApprovalMode('fully_manual');
    });

    it('should always wait for user approval', async () => {
      const task = createMockTask();
      const changes = createMockChanges();

      // Start the approval request
      const approvalPromise = service.requestApproval(task, changes);

      // Wait for event
      await new Promise((r) => setTimeout(r, 10));

      const requestEvent = eventBus.emittedEvents.find((e) => e.event === 'approval:requested');
      expect(requestEvent).toBeDefined();

      // Get pending and respond
      const pendingApprovals = service.getPendingApprovals();
      const approvalId = pendingApprovals[0]!.id;
      await service.respond(approvalId, {
        approved: true,
        action: 'approve',
      });

      const result = await approvalPromise;
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.automatic).toBe(false);
      }
    });
  });

  describe('respond', () => {
    beforeEach(() => {
      service.setApprovalMode('fully_manual');
    });

    it('should resolve pending approval with approve', async () => {
      const task = createMockTask();
      const changes = createMockChanges();

      const approvalPromise = service.requestApproval(task, changes);

      await new Promise((r) => setTimeout(r, 10));

      const pendingApprovals = service.getPendingApprovals();
      const approvalId = pendingApprovals[0]!.id;

      await service.respond(approvalId, {
        approved: true,
        action: 'approve',
      });

      const result = await approvalPromise;
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.approved).toBe(true);
        expect(result.value.action).toBe('approve');
      }
    });

    it('should resolve pending approval with reject', async () => {
      const task = createMockTask();
      const changes = createMockChanges();

      const approvalPromise = service.requestApproval(task, changes);

      await new Promise((r) => setTimeout(r, 10));

      const pendingApprovals = service.getPendingApprovals();
      const approvalId = pendingApprovals[0]!.id;

      await service.respond(approvalId, {
        approved: false,
        action: 'reject',
        comment: 'Not approved',
      });

      const result = await approvalPromise;
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.approved).toBe(false);
        expect(result.value.action).toBe('reject');
      }
    });

    it('should emit approval:responded event', async () => {
      const task = createMockTask();
      const changes = createMockChanges();

      service.requestApproval(task, changes);

      await new Promise((r) => setTimeout(r, 10));

      const pendingApprovals = service.getPendingApprovals();
      const approvalId = pendingApprovals[0]!.id;

      eventBus.emittedEvents.length = 0;

      await service.respond(approvalId, {
        approved: true,
        action: 'approve',
      });

      const respondedEvent = eventBus.emittedEvents.find((e) => e.event === 'approval:responded');
      expect(respondedEvent).toBeDefined();
    });

    it('should fail for unknown approval ID', async () => {
      const result = await service.respond('unknown' as ApprovalId, {
        approved: true,
        action: 'approve',
      });

      expect(result.ok).toBe(false);
    });

    it('should update pending approval status', async () => {
      const task = createMockTask();
      const changes = createMockChanges();

      service.requestApproval(task, changes);

      await new Promise((r) => setTimeout(r, 10));

      const pendingApprovals = service.getPendingApprovals();
      const approvalId = pendingApprovals[0]!.id;

      await service.respond(approvalId, {
        approved: true,
        action: 'approve',
      });

      const pending = service.getPendingApproval(approvalId);
      expect(pending?.status).toBe('approved');
      expect(pending?.respondedAt).not.toBeNull();
    });
  });

  describe('getPendingApprovals', () => {
    beforeEach(() => {
      service.setApprovalMode('fully_manual');
    });

    it('should return empty array when no pending approvals', () => {
      expect(service.getPendingApprovals()).toEqual([]);
    });

    it('should return only pending approvals', async () => {
      const task1 = createMockTask({ id: createTaskId('task-1') });
      const task2 = createMockTask({ id: createTaskId('task-2') });
      const changes = createMockChanges();

      service.requestApproval(task1, changes);
      service.requestApproval(task2, changes);

      await new Promise((r) => setTimeout(r, 10));

      const pendingBefore = service.getPendingApprovals();
      expect(pendingBefore.length).toBe(2);

      // Respond to first
      await service.respond(pendingBefore[0]!.id, {
        approved: true,
        action: 'approve',
      });

      const pendingAfter = service.getPendingApprovals();
      expect(pendingAfter.length).toBe(1);
    });
  });

  describe('setLevelOverride / clearLevelOverride', () => {
    it('should set level override', () => {
      service.setLevelOverride('worker' as HierarchyLevel, 'full_automation');

      const task = createMockTask({ level: 'worker' as HierarchyLevel });
      expect(service.getEffectiveMode(task)).toBe('full_automation');
    });

    it('should clear level override', () => {
      service.setLevelOverride('worker' as HierarchyLevel, 'full_automation');
      service.clearLevelOverride('worker' as HierarchyLevel);

      const task = createMockTask({ level: 'worker' as HierarchyLevel });
      expect(service.getEffectiveMode(task)).toBe(service.getApprovalMode());
    });

    it('should override global mode', async () => {
      service.setApprovalMode('fully_manual');
      service.setLevelOverride('worker' as HierarchyLevel, 'full_automation');

      const task = createMockTask({ level: 'worker' as HierarchyLevel });
      const changes = createMockChanges();

      const result = await service.requestApproval(task, changes);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.approved).toBe(true);
        expect(result.value.automatic).toBe(true);
      }
    });
  });

  describe('getEffectiveMode', () => {
    it('should return global mode by default', () => {
      const task = createMockTask();
      expect(service.getEffectiveMode(task)).toBe('step_by_step');
    });

    it('should return level override if set', () => {
      service.setLevelOverride('worker' as HierarchyLevel, 'fully_manual');

      const task = createMockTask({ level: 'worker' as HierarchyLevel });
      expect(service.getEffectiveMode(task)).toBe('fully_manual');
    });
  });

  describe('isAtHierarchyBoundary', () => {
    it('should return true for boundary levels', () => {
      // lord and overlord are boundary levels by default
      const lordTask = createMockTask({ level: 'lord' as HierarchyLevel });
      const overlordTask = createMockTask({ level: 'overlord' as HierarchyLevel });

      expect(service.isAtHierarchyBoundary(lordTask)).toBe(true);
      expect(service.isAtHierarchyBoundary(overlordTask)).toBe(true);
    });

    it('should return false for non-boundary levels', () => {
      const workerTask = createMockTask({ level: 'worker' as HierarchyLevel });
      expect(service.isAtHierarchyBoundary(workerTask)).toBe(false);
    });

    it('should return false for tasks without level', () => {
      const task = createMockTask({ level: undefined });
      expect(service.isAtHierarchyBoundary(task)).toBe(false);
    });
  });

  describe('cancelApproval', () => {
    beforeEach(() => {
      service.setApprovalMode('fully_manual');
    });

    it('should cancel a pending approval', async () => {
      const task = createMockTask();
      const changes = createMockChanges();

      const approvalPromise = service.requestApproval(task, changes);

      await new Promise((r) => setTimeout(r, 10));

      const pendingApprovals = service.getPendingApprovals();
      const approvalId = pendingApprovals[0]!.id;

      service.cancelApproval(approvalId);

      const result = await approvalPromise;
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.approved).toBe(false);
        expect(result.value.action).toBe('reject');
      }
    });

    it('should update pending approval status to rejected', async () => {
      const task = createMockTask();
      const changes = createMockChanges();

      service.requestApproval(task, changes);

      await new Promise((r) => setTimeout(r, 10));

      const pendingApprovals = service.getPendingApprovals();
      const approvalId = pendingApprovals[0]!.id;

      service.cancelApproval(approvalId);

      const pending = service.getPendingApproval(approvalId);
      expect(pending?.status).toBe('rejected');
    });
  });

  describe('clearAll', () => {
    beforeEach(() => {
      service.setApprovalMode('fully_manual');
    });

    it('should clear all pending approvals', async () => {
      const task1 = createMockTask({ id: createTaskId('task-1') });
      const task2 = createMockTask({ id: createTaskId('task-2') });
      const changes = createMockChanges();

      service.requestApproval(task1, changes);
      service.requestApproval(task2, changes);

      await new Promise((r) => setTimeout(r, 10));

      expect(service.getPendingApprovals().length).toBe(2);

      service.clearAll();
    // Allow pending promises to settle before next test
    await new Promise((resolve) => setImmediate(resolve));

      expect(service.getPendingApprovals().length).toBe(0);
    });
  });

  describe('timeout behavior', () => {
    it('should timeout after configured duration', async () => {
      const config: ApprovalConfig = { timeoutMs: 50 };
      const shortTimeoutService = new ApprovalService(eventBus, config);
      shortTimeoutService.setApprovalMode('fully_manual');

      const task = createMockTask();
      const changes = createMockChanges();

      const result = await shortTimeoutService.requestApproval(task, changes);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('APPROVAL_TIMEOUT');
      }

      shortTimeoutService.clearAll();
    });

    it('should emit approval:timeout event', async () => {
      const config: ApprovalConfig = { timeoutMs: 50 };
      const shortTimeoutService = new ApprovalService(eventBus, config);
      shortTimeoutService.setApprovalMode('fully_manual');

      const task = createMockTask();
      const changes = createMockChanges();

      await shortTimeoutService.requestApproval(task, changes);

      const timeoutEvent = eventBus.emittedEvents.find((e) => e.event === 'approval:timeout');
      expect(timeoutEvent).toBeDefined();

      shortTimeoutService.clearAll();
    });
  });

  describe('createApprovalService factory', () => {
    it('should create a new instance', () => {
      const approvalService = createApprovalService(eventBus);
      expect(approvalService).toBeInstanceOf(ApprovalService);
    });

    it('should accept custom config', () => {
      const config: ApprovalConfig = {
        defaultMode: 'full_automation',
        timeoutMs: 30000,
      };
      const approvalService = createApprovalService(eventBus, config);
      expect(approvalService.getApprovalMode()).toBe('full_automation');
    });
  });
});
