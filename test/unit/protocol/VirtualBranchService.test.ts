/**
 * VirtualBranchService Unit Tests
 */

import {
  VirtualBranchService,
  createVirtualBranchService,
} from '../../../src/protocol/VirtualBranchService';
import { VirtualBranchId } from '../../../src/types';
import { FileChange } from '../../../src/types/conflict';
import {
  createMockEventBus,
  createMockFileSystem,
  createAgentId,
  createTaskId,
  createFilePath,
  createBranchId,
} from '../testUtils';

describe('VirtualBranchService', () => {
  let eventBus: ReturnType<typeof createMockEventBus>;
  let fileSystem: ReturnType<typeof createMockFileSystem>;
  let service: VirtualBranchService;

  beforeEach(() => {
    eventBus = createMockEventBus();
    fileSystem = createMockFileSystem();
    service = new VirtualBranchService(fileSystem, eventBus);
  });

  afterEach(() => {
    service.dispose();
  });

  describe('createBranch', () => {
    it('should create a new branch', async () => {
      const agentId = createAgentId('agent-1');
      const taskId = createTaskId('task-1');

      const result = await service.createBranch(agentId, taskId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.agentId).toBe(agentId);
        expect(result.value.taskId).toBe(taskId);
        expect(result.value.status).toBe('active');
        expect(result.value.changes).toEqual([]);
      }
    });

    it('should emit branch:created event', async () => {
      const agentId = createAgentId('agent-1');
      const taskId = createTaskId('task-1');

      await service.createBranch(agentId, taskId);

      const createdEvent = eventBus.emittedEvents.find((e) => e.event === 'branch:created');
      expect(createdEvent).toBeDefined();
    });

    it('should return different IDs for different branches', async () => {
      const result1 = await service.createBranch(createAgentId('agent-1'), createTaskId('task-1'));
      const result2 = await service.createBranch(createAgentId('agent-2'), createTaskId('task-2'));

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      if (result1.ok && result2.ok) {
        expect(result1.value.id).not.toBe(result2.value.id);
      }
    });
  });

  describe('getBranch', () => {
    it('should return null for unknown branch ID', () => {
      const branch = service.getBranch('unknown' as VirtualBranchId);
      expect(branch).toBeNull();
    });

    it('should return the branch by ID', async () => {
      const agentId = createAgentId('agent-1');
      const taskId = createTaskId('task-1');

      const result = await service.createBranch(agentId, taskId);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const branch = service.getBranch(result.value.id);
      expect(branch).not.toBeNull();
      expect(branch!.id).toBe(result.value.id);
    });
  });

  describe('getBranchForAgent', () => {
    it('should return null for unknown agent', () => {
      const branch = service.getBranchForAgent(createAgentId('unknown'));
      expect(branch).toBeNull();
    });

    it('should return branch for agent', async () => {
      const agentId = createAgentId('agent-1');
      const taskId = createTaskId('task-1');

      await service.createBranch(agentId, taskId);

      const branch = service.getBranchForAgent(agentId);
      expect(branch).not.toBeNull();
      expect(branch!.agentId).toBe(agentId);
    });
  });

  describe('getBranchForTask', () => {
    it('should return null for unknown task', () => {
      const branch = service.getBranchForTask(createTaskId('unknown'));
      expect(branch).toBeNull();
    });

    it('should return branch for task', async () => {
      const agentId = createAgentId('agent-1');
      const taskId = createTaskId('task-1');

      await service.createBranch(agentId, taskId);

      const branch = service.getBranchForTask(taskId);
      expect(branch).not.toBeNull();
      expect(branch!.taskId).toBe(taskId);
    });
  });

  describe('recordChange', () => {
    it('should record a change in a branch', async () => {
      const agentId = createAgentId('agent-1');
      const taskId = createTaskId('task-1');

      const result = await service.createBranch(agentId, taskId);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const change: FileChange = {
        filePath: createFilePath('/src/test.ts'),
        originalContent: 'original',
        modifiedContent: 'modified',
        diff: 'diff',
        changeType: 'modify',
      };

      service.recordChange(result.value.id, change);

      const branch = service.getBranch(result.value.id);
      expect(branch!.changes.length).toBe(1);
      expect(branch!.changes[0]!.filePath).toBe('/src/test.ts');
    });

    it('should replace existing change for same file', async () => {
      const agentId = createAgentId('agent-1');
      const taskId = createTaskId('task-1');

      const result = await service.createBranch(agentId, taskId);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const change1: FileChange = {
        filePath: createFilePath('/src/test.ts'),
        originalContent: 'original',
        modifiedContent: 'modified v1',
        diff: 'diff1',
        changeType: 'modify',
      };

      const change2: FileChange = {
        filePath: createFilePath('/src/test.ts'),
        originalContent: 'original',
        modifiedContent: 'modified v2',
        diff: 'diff2',
        changeType: 'modify',
      };

      service.recordChange(result.value.id, change1);
      service.recordChange(result.value.id, change2);

      const branch = service.getBranch(result.value.id);
      expect(branch!.changes.length).toBe(1);
      expect(branch!.changes[0]!.modifiedContent).toBe('modified v2');
    });

    it('should not record change for non-active branch', async () => {
      const agentId = createAgentId('agent-1');
      const taskId = createTaskId('task-1');

      const result = await service.createBranch(agentId, taskId);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Abandon the branch
      service.abandonBranch(result.value.id);

      const change: FileChange = {
        filePath: createFilePath('/src/test.ts'),
        originalContent: 'original',
        modifiedContent: 'modified',
        diff: 'diff',
        changeType: 'modify',
      };

      service.recordChange(result.value.id, change);

      const branch = service.getBranch(result.value.id);
      expect(branch!.changes.length).toBe(0);
    });
  });

  describe('recordChanges', () => {
    it('should record multiple changes', async () => {
      const agentId = createAgentId('agent-1');
      const taskId = createTaskId('task-1');

      const result = await service.createBranch(agentId, taskId);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const changes: FileChange[] = [
        {
          filePath: createFilePath('/src/file1.ts'),
          originalContent: 'original1',
          modifiedContent: 'modified1',
          diff: 'diff1',
          changeType: 'modify',
        },
        {
          filePath: createFilePath('/src/file2.ts'),
          originalContent: null,
          modifiedContent: 'new content',
          diff: 'diff2',
          changeType: 'create',
        },
      ];

      service.recordChanges(result.value.id, changes);

      const branch = service.getBranch(result.value.id);
      expect(branch!.changes.length).toBe(2);
    });
  });

  describe('hasConflicts', () => {
    it('should return false when no conflicts', async () => {
      const result1 = await service.createBranch(createAgentId('agent-1'), createTaskId('task-1'));
      const result2 = await service.createBranch(createAgentId('agent-2'), createTaskId('task-2'));

      expect(result1.ok && result2.ok).toBe(true);
      if (!result1.ok || !result2.ok) return;

      service.recordChange(result1.value.id, {
        filePath: createFilePath('/src/file1.ts'),
        originalContent: 'a',
        modifiedContent: 'b',
        diff: '',
        changeType: 'modify',
      });

      service.recordChange(result2.value.id, {
        filePath: createFilePath('/src/file2.ts'),
        originalContent: 'c',
        modifiedContent: 'd',
        diff: '',
        changeType: 'modify',
      });

      expect(service.hasConflicts(result1.value.id, result2.value.id)).toBe(false);
    });

    it('should return true when branches modify same file', async () => {
      const result1 = await service.createBranch(createAgentId('agent-1'), createTaskId('task-1'));
      const result2 = await service.createBranch(createAgentId('agent-2'), createTaskId('task-2'));

      expect(result1.ok && result2.ok).toBe(true);
      if (!result1.ok || !result2.ok) return;

      const commonFile = createFilePath('/src/common.ts');

      service.recordChange(result1.value.id, {
        filePath: commonFile,
        originalContent: 'original',
        modifiedContent: 'modified v1',
        diff: '',
        changeType: 'modify',
      });

      service.recordChange(result2.value.id, {
        filePath: commonFile,
        originalContent: 'original',
        modifiedContent: 'modified v2',
        diff: '',
        changeType: 'modify',
      });

      expect(service.hasConflicts(result1.value.id, result2.value.id)).toBe(true);
    });
  });

  describe('getConflictingFiles', () => {
    it('should return empty array when no conflicts', async () => {
      const result1 = await service.createBranch(createAgentId('agent-1'), createTaskId('task-1'));
      const result2 = await service.createBranch(createAgentId('agent-2'), createTaskId('task-2'));

      expect(result1.ok && result2.ok).toBe(true);
      if (!result1.ok || !result2.ok) return;

      const conflicts = service.getConflictingFiles(result1.value.id, result2.value.id);
      expect(conflicts).toEqual([]);
    });

    it('should return conflicting file paths', async () => {
      const result1 = await service.createBranch(createAgentId('agent-1'), createTaskId('task-1'));
      const result2 = await service.createBranch(createAgentId('agent-2'), createTaskId('task-2'));

      expect(result1.ok && result2.ok).toBe(true);
      if (!result1.ok || !result2.ok) return;

      const commonFile = createFilePath('/src/common.ts');

      service.recordChange(result1.value.id, {
        filePath: commonFile,
        originalContent: 'original',
        modifiedContent: 'v1',
        diff: '',
        changeType: 'modify',
      });

      service.recordChange(result2.value.id, {
        filePath: commonFile,
        originalContent: 'original',
        modifiedContent: 'v2',
        diff: '',
        changeType: 'modify',
      });

      const conflicts = service.getConflictingFiles(result1.value.id, result2.value.id);
      expect(conflicts).toContain(commonFile);
    });
  });

  describe('mergeBranch', () => {
    it('should apply changes to filesystem', async () => {
      const agentId = createAgentId('agent-1');
      const taskId = createTaskId('task-1');

      const result = await service.createBranch(agentId, taskId);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      service.recordChange(result.value.id, {
        filePath: createFilePath('/src/new-file.ts'),
        originalContent: null,
        modifiedContent: 'new content',
        diff: '',
        changeType: 'create',
      });

      const mergeResult = await service.mergeBranch(result.value.id);
      expect(mergeResult.ok).toBe(true);

      expect(fileSystem.writeFile).toHaveBeenCalledWith('/src/new-file.ts', 'new content');
    });

    it('should update branch status to merged', async () => {
      const agentId = createAgentId('agent-1');
      const taskId = createTaskId('task-1');

      const result = await service.createBranch(agentId, taskId);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      await service.mergeBranch(result.value.id);

      const branch = service.getBranch(result.value.id);
      expect(branch!.status).toBe('merged');
    });

    it('should emit branch:merged event', async () => {
      const agentId = createAgentId('agent-1');
      const taskId = createTaskId('task-1');

      const result = await service.createBranch(agentId, taskId);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      eventBus.emittedEvents.length = 0;

      await service.mergeBranch(result.value.id);

      const mergedEvent = eventBus.emittedEvents.find((e) => e.event === 'branch:merged');
      expect(mergedEvent).toBeDefined();
    });

    it('should fail for non-existent branch', async () => {
      const mergeResult = await service.mergeBranch('unknown' as VirtualBranchId);
      expect(mergeResult.ok).toBe(false);
    });

    it('should fail for non-active branch', async () => {
      const agentId = createAgentId('agent-1');
      const taskId = createTaskId('task-1');

      const result = await service.createBranch(agentId, taskId);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      service.abandonBranch(result.value.id);

      const mergeResult = await service.mergeBranch(result.value.id);
      expect(mergeResult.ok).toBe(false);
    });
  });

  describe('abandonBranch', () => {
    it('should mark branch as abandoned', async () => {
      const agentId = createAgentId('agent-1');
      const taskId = createTaskId('task-1');

      const result = await service.createBranch(agentId, taskId);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      service.abandonBranch(result.value.id);

      const branch = service.getBranch(result.value.id);
      expect(branch!.status).toBe('abandoned');
    });

    it('should emit branch:abandoned event', async () => {
      const agentId = createAgentId('agent-1');
      const taskId = createTaskId('task-1');

      const result = await service.createBranch(agentId, taskId);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      eventBus.emittedEvents.length = 0;

      service.abandonBranch(result.value.id);

      const abandonedEvent = eventBus.emittedEvents.find((e) => e.event === 'branch:abandoned');
      expect(abandonedEvent).toBeDefined();
    });
  });

  describe('getActiveBranches', () => {
    it('should return empty array when no branches', () => {
      const activeBranches = service.getActiveBranches();
      expect(activeBranches).toEqual([]);
    });

    it('should return only active branches', async () => {
      await service.createBranch(createAgentId('agent-1'), createTaskId('task-1'));
      const result2 = await service.createBranch(createAgentId('agent-2'), createTaskId('task-2'));
      await service.createBranch(createAgentId('agent-3'), createTaskId('task-3'));

      if (result2.ok) {
        service.abandonBranch(result2.value.id);
      }

      const activeBranches = service.getActiveBranches();
      expect(activeBranches.length).toBe(2);
    });
  });

  describe('getStats', () => {
    it('should return zero stats when no branches', () => {
      const stats = service.getStats();
      expect(stats.activeBranches).toBe(0);
      expect(stats.totalChanges).toBe(0);
      expect(stats.modifiedFiles).toBe(0);
    });

    it('should calculate correct statistics', async () => {
      const result1 = await service.createBranch(createAgentId('agent-1'), createTaskId('task-1'));
      const result2 = await service.createBranch(createAgentId('agent-2'), createTaskId('task-2'));

      expect(result1.ok && result2.ok).toBe(true);
      if (!result1.ok || !result2.ok) return;

      service.recordChange(result1.value.id, {
        filePath: createFilePath('/src/file1.ts'),
        originalContent: 'a',
        modifiedContent: 'b',
        diff: '',
        changeType: 'modify',
      });

      service.recordChange(result2.value.id, {
        filePath: createFilePath('/src/file2.ts'),
        originalContent: 'c',
        modifiedContent: 'd',
        diff: '',
        changeType: 'modify',
      });

      const stats = service.getStats();
      expect(stats.activeBranches).toBe(2);
      expect(stats.totalChanges).toBe(2);
      expect(stats.modifiedFiles).toBe(2);
    });
  });

  describe('snapshotFile', () => {
    it('should create a snapshot of a file', async () => {
      const filePath = createFilePath('/src/test.ts');
      fileSystem.files.set(filePath, 'file content');

      const snapshot = await service.snapshotFile(filePath);

      expect(snapshot.filePath).toBe(filePath);
      expect(snapshot.content).toBe('file content');
    });

    it('should return cached snapshot', async () => {
      const filePath = createFilePath('/src/test.ts');
      fileSystem.files.set(filePath, 'file content');

      await service.snapshotFile(filePath);
      fileSystem.files.set(filePath, 'updated content');

      const snapshot = await service.snapshotFile(filePath);

      expect(snapshot.content).toBe('file content'); // Original cached content
    });

    it('should handle non-existent files', async () => {
      const filePath = createFilePath('/src/missing.ts');

      const snapshot = await service.snapshotFile(filePath);

      expect(snapshot.content).toBe('');
    });
  });

  describe('getOriginalContent', () => {
    it('should return null for unknown file', () => {
      const content = service.getOriginalContent(createFilePath('/unknown.ts'));
      expect(content).toBeNull();
    });

    it('should return snapshotted content', async () => {
      const filePath = createFilePath('/src/test.ts');
      fileSystem.files.set(filePath, 'original content');

      await service.snapshotFile(filePath);

      const content = service.getOriginalContent(filePath);
      expect(content).toBe('original content');
    });
  });

  describe('deleteBranch', () => {
    it('should remove branch from all maps', async () => {
      const agentId = createAgentId('agent-1');
      const taskId = createTaskId('task-1');

      const result = await service.createBranch(agentId, taskId);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      service.deleteBranch(result.value.id);

      expect(service.getBranch(result.value.id)).toBeNull();
      expect(service.getBranchForAgent(agentId)).toBeNull();
      expect(service.getBranchForTask(taskId)).toBeNull();
    });
  });

  describe('createVirtualBranchService factory', () => {
    it('should create a new instance', () => {
      const branchService = createVirtualBranchService(fileSystem, eventBus);
      expect(branchService).toBeInstanceOf(VirtualBranchService);
    });
  });
});
