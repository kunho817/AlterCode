/**
 * VirtualBranchManager Unit Tests
 */

import { VirtualBranchManager } from '../../../src/conflict/VirtualBranchManager';
import { createFileChange, createVirtualBranch } from '../../mocks/factories';

describe('VirtualBranchManager', () => {
  let branchManager: VirtualBranchManager;

  beforeEach(() => {
    branchManager = new VirtualBranchManager('/workspace');
  });

  afterEach(() => {
    branchManager.dispose();
  });

  describe('createBranch', () => {
    it('should create a new virtual branch', async () => {
      const branch = await branchManager.createBranch('agent-1', 'task-1');

      expect(branch).toBeDefined();
      expect(branch.id).toBeDefined();
      expect(branch.agentId).toBe('agent-1');
      expect(branch.taskId).toBe('task-1');
      expect(branch.status).toBe('active');
      expect(branch.changes).toEqual([]);
    });

    it('should track branch by agent and task', async () => {
      const branch = await branchManager.createBranch('agent-1', 'task-1');

      const byAgent = branchManager.getBranchForAgent('agent-1');
      const byTask = branchManager.getBranchForTask('task-1');

      expect(byAgent?.id).toBe(branch.id);
      expect(byTask?.id).toBe(branch.id);
    });
  });

  describe('recordChange', () => {
    it('should record a file change in a branch', async () => {
      const branch = await branchManager.createBranch('agent-1', 'task-1');
      const change = createFileChange({ filePath: 'src/test.ts' });

      branchManager.recordChange(branch.id, change);

      expect(branch.changes.length).toBe(1);
      expect(branch.changes[0].filePath).toBe('src/test.ts');
    });

    it('should update existing change for same file', async () => {
      const branch = await branchManager.createBranch('agent-1', 'task-1');

      const change1 = createFileChange({
        filePath: 'src/test.ts',
        modifiedContent: 'content v1',
      });
      const change2 = createFileChange({
        filePath: 'src/test.ts',
        modifiedContent: 'content v2',
      });

      branchManager.recordChange(branch.id, change1);
      branchManager.recordChange(branch.id, change2);

      expect(branch.changes.length).toBe(1);
      expect(branch.changes[0].modifiedContent).toBe('content v2');
    });

    it('should throw for inactive branch', async () => {
      const branch = await branchManager.createBranch('agent-1', 'task-1');
      branchManager.abandonBranch(branch.id);

      const change = createFileChange();

      expect(() => branchManager.recordChange(branch.id, change)).toThrow();
    });
  });

  describe('recordChanges', () => {
    it('should record multiple changes', async () => {
      const branch = await branchManager.createBranch('agent-1', 'task-1');

      const changes = [
        createFileChange({ filePath: 'src/file1.ts' }),
        createFileChange({ filePath: 'src/file2.ts' }),
        createFileChange({ filePath: 'src/file3.ts' }),
      ];

      branchManager.recordChanges(branch.id, changes);

      expect(branch.changes.length).toBe(3);
    });
  });

  describe('getModifiedFiles', () => {
    it('should return list of modified files', async () => {
      const branch = await branchManager.createBranch('agent-1', 'task-1');

      branchManager.recordChanges(branch.id, [
        createFileChange({ filePath: 'src/a.ts' }),
        createFileChange({ filePath: 'src/b.ts' }),
      ]);

      const files = branchManager.getModifiedFiles(branch.id);

      expect(files).toContain('src/a.ts');
      expect(files).toContain('src/b.ts');
    });
  });

  describe('hasConflicts', () => {
    it('should detect conflicts between branches', async () => {
      const branch1 = await branchManager.createBranch('agent-1', 'task-1');
      const branch2 = await branchManager.createBranch('agent-2', 'task-2');

      branchManager.recordChange(branch1.id, createFileChange({
        filePath: 'src/shared.ts',
      }));
      branchManager.recordChange(branch2.id, createFileChange({
        filePath: 'src/shared.ts',
      }));

      expect(branchManager.hasConflicts(branch1.id, branch2.id)).toBe(true);
    });

    it('should not detect conflicts for different files', async () => {
      const branch1 = await branchManager.createBranch('agent-1', 'task-1');
      const branch2 = await branchManager.createBranch('agent-2', 'task-2');

      branchManager.recordChange(branch1.id, createFileChange({
        filePath: 'src/file1.ts',
      }));
      branchManager.recordChange(branch2.id, createFileChange({
        filePath: 'src/file2.ts',
      }));

      expect(branchManager.hasConflicts(branch1.id, branch2.id)).toBe(false);
    });
  });

  describe('getConflictingFiles', () => {
    it('should return list of conflicting files', async () => {
      const branch1 = await branchManager.createBranch('agent-1', 'task-1');
      const branch2 = await branchManager.createBranch('agent-2', 'task-2');

      branchManager.recordChanges(branch1.id, [
        createFileChange({ filePath: 'src/shared.ts' }),
        createFileChange({ filePath: 'src/unique1.ts' }),
      ]);
      branchManager.recordChanges(branch2.id, [
        createFileChange({ filePath: 'src/shared.ts' }),
        createFileChange({ filePath: 'src/unique2.ts' }),
      ]);

      const conflicts = branchManager.getConflictingFiles(branch1.id, branch2.id);

      expect(conflicts).toEqual(['src/shared.ts']);
    });
  });

  describe('getBranchDiff', () => {
    it('should generate combined diff for all changes', async () => {
      const branch = await branchManager.createBranch('agent-1', 'task-1');

      // Provide custom change without pre-populated diff so it gets generated
      branchManager.recordChange(branch.id, {
        filePath: 'src/myfile.ts',
        originalContent: 'old content',
        modifiedContent: 'new content',
        changeType: 'modify',
        diff: '', // Empty diff forces generation
      });

      const diff = branchManager.getBranchDiff(branch.id);

      expect(diff).toContain('src/myfile.ts');
      expect(diff).toContain('old content');
      expect(diff).toContain('new content');
    });
  });

  describe('abandonBranch', () => {
    it('should mark branch as abandoned', async () => {
      const branch = await branchManager.createBranch('agent-1', 'task-1');

      branchManager.abandonBranch(branch.id);

      expect(branch.status).toBe('abandoned');
    });
  });

  describe('deleteBranch', () => {
    it('should remove branch from tracking', async () => {
      const branch = await branchManager.createBranch('agent-1', 'task-1');

      branchManager.deleteBranch(branch.id);

      expect(branchManager.getBranch(branch.id)).toBeNull();
      expect(branchManager.getBranchForAgent('agent-1')).toBeNull();
      expect(branchManager.getBranchForTask('task-1')).toBeNull();
    });
  });

  describe('getActiveBranches', () => {
    it('should return only active branches', async () => {
      const branch1 = await branchManager.createBranch('agent-1', 'task-1');
      const branch2 = await branchManager.createBranch('agent-2', 'task-2');
      const branch3 = await branchManager.createBranch('agent-3', 'task-3');

      branchManager.abandonBranch(branch2.id);

      const active = branchManager.getActiveBranches();

      expect(active.length).toBe(2);
      expect(active.find(b => b.id === branch2.id)).toBeUndefined();
    });
  });

  describe('getStats', () => {
    it('should return branch statistics', async () => {
      const branch1 = await branchManager.createBranch('agent-1', 'task-1');
      const branch2 = await branchManager.createBranch('agent-2', 'task-2');

      branchManager.recordChanges(branch1.id, [
        createFileChange({ filePath: 'src/a.ts' }),
        createFileChange({ filePath: 'src/b.ts' }),
      ]);
      branchManager.recordChanges(branch2.id, [
        createFileChange({ filePath: 'src/a.ts' }), // Same file
        createFileChange({ filePath: 'src/c.ts' }),
      ]);

      const stats = branchManager.getStats();

      expect(stats.activeBranches).toBe(2);
      expect(stats.totalChanges).toBe(4);
      expect(stats.modifiedFiles).toBe(3); // a.ts, b.ts, c.ts
    });
  });
});
