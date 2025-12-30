/**
 * MergeEngine Unit Tests
 */

import { MergeEngine } from '../../../src/conflict/MergeEngine';
import { SemanticAnalyzer } from '../../../src/conflict/SemanticAnalyzer';
import { VirtualBranchManager } from '../../../src/conflict/VirtualBranchManager';
import { createFileChange, createVirtualBranch } from '../../mocks/factories';
import { EventType } from '../../../src/types';

describe('MergeEngine', () => {
  let mergeEngine: MergeEngine;
  let semanticAnalyzer: SemanticAnalyzer;
  let branchManager: VirtualBranchManager;

  beforeEach(() => {
    semanticAnalyzer = new SemanticAnalyzer();
    branchManager = new VirtualBranchManager('/workspace');
    mergeEngine = new MergeEngine(semanticAnalyzer, branchManager);
  });

  afterEach(() => {
    branchManager.dispose();
    mergeEngine.dispose();
  });

  describe('detectConflicts', () => {
    it('should detect conflicts between branches modifying same file', async () => {
      const branch1 = await branchManager.createBranch('agent-1', 'task-1');
      const branch2 = await branchManager.createBranch('agent-2', 'task-2');

      branchManager.recordChange(branch1.id, createFileChange({
        filePath: 'src/shared.ts',
        originalContent: 'original',
        modifiedContent: 'modified by branch 1',
      }));

      branchManager.recordChange(branch2.id, createFileChange({
        filePath: 'src/shared.ts',
        originalContent: 'original',
        modifiedContent: 'modified by branch 2',
      }));

      const conflicts = mergeEngine.detectConflicts();

      expect(conflicts.length).toBe(1);
      expect(conflicts[0].filePath).toBe('src/shared.ts');
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

      const conflicts = mergeEngine.detectConflicts();

      expect(conflicts.length).toBe(0);
    });

    it('should emit CONFLICT_DETECTED event', async () => {
      const branch1 = await branchManager.createBranch('agent-1', 'task-1');
      const branch2 = await branchManager.createBranch('agent-2', 'task-2');

      branchManager.recordChange(branch1.id, createFileChange({
        filePath: 'src/shared.ts',
      }));
      branchManager.recordChange(branch2.id, createFileChange({
        filePath: 'src/shared.ts',
      }));

      const handler = jest.fn();
      mergeEngine.on(EventType.CONFLICT_DETECTED, handler);

      mergeEngine.detectConflicts();

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('resolveConflict', () => {
    it('should auto-merge when only one side changed a line', async () => {
      const branch1 = await branchManager.createBranch('agent-1', 'task-1');
      const branch2 = await branchManager.createBranch('agent-2', 'task-2');

      const baseContent = `line 1
line 2
line 3`;

      branchManager.recordChange(branch1.id, createFileChange({
        filePath: 'src/test.ts',
        originalContent: baseContent,
        modifiedContent: `line 1 - modified by branch 1
line 2
line 3`,
      }));

      branchManager.recordChange(branch2.id, createFileChange({
        filePath: 'src/test.ts',
        originalContent: baseContent,
        modifiedContent: `line 1
line 2
line 3 - modified by branch 2`,
      }));

      const conflicts = mergeEngine.detectConflicts();
      expect(conflicts.length).toBe(1);

      const resolution = await mergeEngine.resolveConflict(conflicts[0]);

      expect(resolution.strategy).toBe('auto');
      expect(resolution.resolvedContent).toContain('modified by branch 1');
      expect(resolution.resolvedContent).toContain('modified by branch 2');
    });

    it('should return manual resolution for true conflicts', async () => {
      const branch1 = await branchManager.createBranch('agent-1', 'task-1');
      const branch2 = await branchManager.createBranch('agent-2', 'task-2');

      const baseContent = `line 1`;

      branchManager.recordChange(branch1.id, createFileChange({
        filePath: 'src/test.ts',
        originalContent: baseContent,
        modifiedContent: `branch 1 version`,
      }));

      branchManager.recordChange(branch2.id, createFileChange({
        filePath: 'src/test.ts',
        originalContent: baseContent,
        modifiedContent: `branch 2 version`,
      }));

      const conflicts = mergeEngine.detectConflicts();
      const resolution = await mergeEngine.resolveConflict(conflicts[0]);

      expect(resolution.strategy).toBe('manual');
      expect(resolution.resolvedContent).toContain('<<<<<<< BRANCH1 (ours)');
      expect(resolution.resolvedContent).toContain('>>>>>>> BRANCH2 (theirs)');
    });
  });

  describe('applyResolution', () => {
    it('should apply resolution to branch', async () => {
      const branch1 = await branchManager.createBranch('agent-1', 'task-1');
      const branch2 = await branchManager.createBranch('agent-2', 'task-2');

      branchManager.recordChange(branch1.id, createFileChange({
        filePath: 'src/test.ts',
        originalContent: 'original',
        modifiedContent: 'branch 1',
      }));

      branchManager.recordChange(branch2.id, createFileChange({
        filePath: 'src/test.ts',
        originalContent: 'original',
        modifiedContent: 'branch 2',
      }));

      const conflicts = mergeEngine.detectConflicts();
      const resolution = await mergeEngine.resolveConflict(conflicts[0]);

      await mergeEngine.applyResolution(resolution);

      // Conflict should be removed
      expect(mergeEngine.hasConflicts()).toBe(false);
    });

    it('should emit CONFLICT_RESOLVED event', async () => {
      const branch1 = await branchManager.createBranch('agent-1', 'task-1');
      const branch2 = await branchManager.createBranch('agent-2', 'task-2');

      branchManager.recordChange(branch1.id, createFileChange({
        filePath: 'src/test.ts',
      }));
      branchManager.recordChange(branch2.id, createFileChange({
        filePath: 'src/test.ts',
      }));

      const handler = jest.fn();
      mergeEngine.on(EventType.CONFLICT_RESOLVED, handler);

      const conflicts = mergeEngine.detectConflicts();
      const resolution = await mergeEngine.resolveConflict(conflicts[0]);
      await mergeEngine.applyResolution(resolution);

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('getActiveConflicts', () => {
    it('should return all active conflicts', async () => {
      const branch1 = await branchManager.createBranch('agent-1', 'task-1');
      const branch2 = await branchManager.createBranch('agent-2', 'task-2');

      branchManager.recordChanges(branch1.id, [
        createFileChange({ filePath: 'src/file1.ts' }),
        createFileChange({ filePath: 'src/file2.ts' }),
      ]);

      branchManager.recordChanges(branch2.id, [
        createFileChange({ filePath: 'src/file1.ts' }),
        createFileChange({ filePath: 'src/file2.ts' }),
      ]);

      mergeEngine.detectConflicts();

      const active = mergeEngine.getActiveConflicts();
      expect(active.length).toBe(2);
    });
  });

  describe('hasConflicts', () => {
    it('should return true when conflicts exist', async () => {
      const branch1 = await branchManager.createBranch('agent-1', 'task-1');
      const branch2 = await branchManager.createBranch('agent-2', 'task-2');

      branchManager.recordChange(branch1.id, createFileChange({
        filePath: 'src/shared.ts',
      }));
      branchManager.recordChange(branch2.id, createFileChange({
        filePath: 'src/shared.ts',
      }));

      mergeEngine.detectConflicts();

      expect(mergeEngine.hasConflicts()).toBe(true);
    });

    it('should return false when no conflicts', () => {
      expect(mergeEngine.hasConflicts()).toBe(false);
    });
  });

  describe('clearConflicts', () => {
    it('should remove all active conflicts', async () => {
      const branch1 = await branchManager.createBranch('agent-1', 'task-1');
      const branch2 = await branchManager.createBranch('agent-2', 'task-2');

      branchManager.recordChange(branch1.id, createFileChange({
        filePath: 'src/shared.ts',
      }));
      branchManager.recordChange(branch2.id, createFileChange({
        filePath: 'src/shared.ts',
      }));

      mergeEngine.detectConflicts();
      expect(mergeEngine.hasConflicts()).toBe(true);

      mergeEngine.clearConflicts();
      expect(mergeEngine.hasConflicts()).toBe(false);
    });
  });

  describe('escalateConflict', () => {
    it('should emit escalation event', async () => {
      const branch1 = await branchManager.createBranch('agent-1', 'task-1');
      const branch2 = await branchManager.createBranch('agent-2', 'task-2');

      branchManager.recordChange(branch1.id, createFileChange({
        filePath: 'src/shared.ts',
      }));
      branchManager.recordChange(branch2.id, createFileChange({
        filePath: 'src/shared.ts',
      }));

      const handler = jest.fn();
      mergeEngine.on('conflictEscalated', handler);

      const conflicts = mergeEngine.detectConflicts();
      mergeEngine.escalateConflict(conflicts[0], 3); // Escalate to TEAM_LEAD

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          conflict: conflicts[0],
          level: 3,
        })
      );
    });
  });
});
