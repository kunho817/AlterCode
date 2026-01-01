/**
 * MergeEngineService Unit Tests
 */

import {
  MergeEngineService,
  createMergeEngineService,
} from '../../../src/protocol/MergeEngineService';
import {
  IVirtualBranchService,
  ISemanticAnalyzerService,
  ILLMAdapter,
  VirtualBranch,
  VirtualBranchId,
  FilePath,
  CodeRegion,
  LineNumber,
  Ok,
} from '../../../src/types';
import { FileChange } from '../../../src/types/conflict';
import {
  createMockEventBus,
  createAgentId,
  createTaskId,
  createFilePath,
  createBranchId,
  createLineNumber,
} from '../testUtils';

// Helper to create a branch
function createMockBranch(
  id: string,
  agentId: string,
  taskId: string,
  changes: FileChange[] = []
): VirtualBranch {
  return {
    id: createBranchId(id),
    agentId: createAgentId(agentId),
    taskId: createTaskId(taskId),
    baseSnapshot: new Date().toISOString(),
    changes,
    status: 'active',
    createdAt: new Date(),
  };
}

// Mock SemanticAnalyzerService
function createMockSemanticAnalyzer(): ISemanticAnalyzerService {
  return {
    analyzeFile: jest.fn((filePath: FilePath, content: string): CodeRegion[] => {
      // Return a simple region for the entire file
      const lines = content.split('\n').length;
      return [{
        id: `region-${filePath}`,
        filePath,
        type: 'function',
        name: 'testFunction',
        startLine: 1 as LineNumber,
        endLine: lines as LineNumber,
        dependencies: [],
        modifiedBy: null,
      }];
    }),
    regionsOverlap: jest.fn((r1: CodeRegion, r2: CodeRegion): boolean => {
      // Check if line ranges overlap
      return r1.startLine <= r2.endLine && r2.startLine <= r1.endLine;
    }),
    findRegionsAtPosition: jest.fn(() => []),
    getMostSpecificRegion: jest.fn(() => null),
    getDependentRegions: jest.fn(() => []),
    assignRegionsToWorkers: jest.fn(() => new Map()),
    isSupported: jest.fn(() => true),
    getSupportedExtensions: jest.fn(() => ['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go']),
  };
}

// Mock VirtualBranchService
function createMockBranchService(): IVirtualBranchService & {
  mockBranches: VirtualBranch[];
} {
  const mockBranches: VirtualBranch[] = [];

  return {
    mockBranches,
    createBranch: jest.fn(async () => Ok(createMockBranch('b1', 'a1', 't1'))),
    getBranch: jest.fn((id: VirtualBranchId) => mockBranches.find((b) => b.id === id) ?? null),
    getBranchForAgent: jest.fn(() => null),
    getBranchForTask: jest.fn(() => null),
    recordChange: jest.fn(),
    recordChanges: jest.fn(),
    hasConflicts: jest.fn(() => false),
    getConflictingFiles: jest.fn((id1: VirtualBranchId, id2: VirtualBranchId): FilePath[] => {
      const b1 = mockBranches.find((b) => b.id === id1);
      const b2 = mockBranches.find((b) => b.id === id2);
      if (!b1 || !b2) return [];

      const files1 = new Set(b1.changes.map((c) => c.filePath));
      const conflicts: FilePath[] = [];
      for (const change of b2.changes) {
        if (files1.has(change.filePath)) {
          conflicts.push(change.filePath);
        }
      }
      return conflicts;
    }),
    mergeBranch: jest.fn(async () => Ok(undefined)),
    abandonBranch: jest.fn(),
    getActiveBranches: jest.fn(() => mockBranches.filter((b) => b.status === 'active')),
    getStats: jest.fn(() => ({ activeBranches: 0, totalChanges: 0, modifiedFiles: 0 })),
    snapshotFile: jest.fn(async () => ({ filePath: '' as FilePath, content: '', takenAt: new Date() })),
    getOriginalContent: jest.fn(() => null),
  };
}

// Mock LLM Adapter
function createMockLLMAdapter(): ILLMAdapter {
  return {
    complete: jest.fn(async () => Ok({
      content: '```\nmerged code content\n```',
      model: 'test-model',
      finishReason: 'stop',
      duration: 100,
    })),
    stream: jest.fn(async function* () {
      yield { content: 'test', done: true };
    }),
    completeWithTools: jest.fn(async () => Ok({
      response: { content: '', model: '', finishReason: '', duration: 0 },
      toolCalls: [],
    })),
    getConfig: jest.fn(() => ({ model: 'test', maxTokens: 1000, temperature: 0.5 })),
    setConfig: jest.fn(),
  };
}

describe('MergeEngineService', () => {
  let eventBus: ReturnType<typeof createMockEventBus>;
  let branchService: ReturnType<typeof createMockBranchService>;
  let semanticAnalyzer: ReturnType<typeof createMockSemanticAnalyzer>;
  let llmAdapter: ReturnType<typeof createMockLLMAdapter>;
  let service: MergeEngineService;

  beforeEach(() => {
    eventBus = createMockEventBus();
    branchService = createMockBranchService();
    semanticAnalyzer = createMockSemanticAnalyzer();
    llmAdapter = createMockLLMAdapter();
    service = new MergeEngineService(branchService, semanticAnalyzer, llmAdapter, eventBus);
  });

  afterEach(() => {
    service.clearConflicts();
    branchService.mockBranches.length = 0;
  });

  describe('detectConflicts', () => {
    it('should return empty array when no active branches', () => {
      const conflicts = service.detectConflicts();
      expect(conflicts).toEqual([]);
    });

    it('should return empty array when no conflicts between branches', () => {
      const branch1 = createMockBranch('b1', 'a1', 't1', [
        { filePath: createFilePath('/src/file1.ts'), originalContent: 'a', modifiedContent: 'b', diff: '', changeType: 'modify' },
      ]);
      const branch2 = createMockBranch('b2', 'a2', 't2', [
        { filePath: createFilePath('/src/file2.ts'), originalContent: 'c', modifiedContent: 'd', diff: '', changeType: 'modify' },
      ]);
      branchService.mockBranches.push(branch1, branch2);

      const conflicts = service.detectConflicts();
      expect(conflicts).toEqual([]);
    });

    it('should detect conflicts when branches modify same file', () => {
      const commonFile = createFilePath('/src/common.ts');
      const branch1 = createMockBranch('b1', 'a1', 't1', [
        { filePath: commonFile, originalContent: 'original', modifiedContent: 'version1', diff: '', changeType: 'modify' },
      ]);
      const branch2 = createMockBranch('b2', 'a2', 't2', [
        { filePath: commonFile, originalContent: 'original', modifiedContent: 'version2', diff: '', changeType: 'modify' },
      ]);
      branchService.mockBranches.push(branch1, branch2);

      const conflicts = service.detectConflicts();

      expect(conflicts.length).toBe(1);
      expect(conflicts[0]!.filePath).toBe(commonFile);
      expect(conflicts[0]!.branch1.id).toBe(branch1.id);
      expect(conflicts[0]!.branch2.id).toBe(branch2.id);
    });

    it('should emit conflict:detected event when conflicts found', () => {
      const commonFile = createFilePath('/src/common.ts');
      const branch1 = createMockBranch('b1', 'a1', 't1', [
        { filePath: commonFile, originalContent: 'a', modifiedContent: 'b', diff: '', changeType: 'modify' },
      ]);
      const branch2 = createMockBranch('b2', 'a2', 't2', [
        { filePath: commonFile, originalContent: 'a', modifiedContent: 'c', diff: '', changeType: 'modify' },
      ]);
      branchService.mockBranches.push(branch1, branch2);

      service.detectConflicts();

      const detectedEvent = eventBus.emittedEvents.find((e) => e.event === 'conflict:detected');
      expect(detectedEvent).toBeDefined();
    });
  });

  describe('hasConflicts', () => {
    it('should return false when no conflicts', () => {
      expect(service.hasConflicts()).toBe(false);
    });

    it('should return true after detecting conflicts', () => {
      const commonFile = createFilePath('/src/common.ts');
      const branch1 = createMockBranch('b1', 'a1', 't1', [
        { filePath: commonFile, originalContent: 'a', modifiedContent: 'b', diff: '', changeType: 'modify' },
      ]);
      const branch2 = createMockBranch('b2', 'a2', 't2', [
        { filePath: commonFile, originalContent: 'a', modifiedContent: 'c', diff: '', changeType: 'modify' },
      ]);
      branchService.mockBranches.push(branch1, branch2);

      service.detectConflicts();

      expect(service.hasConflicts()).toBe(true);
    });
  });

  describe('getActiveConflicts', () => {
    it('should return empty array when no conflicts', () => {
      expect(service.getActiveConflicts()).toEqual([]);
    });

    it('should return all detected conflicts', () => {
      const commonFile = createFilePath('/src/common.ts');
      const branch1 = createMockBranch('b1', 'a1', 't1', [
        { filePath: commonFile, originalContent: 'a', modifiedContent: 'b', diff: '', changeType: 'modify' },
      ]);
      const branch2 = createMockBranch('b2', 'a2', 't2', [
        { filePath: commonFile, originalContent: 'a', modifiedContent: 'c', diff: '', changeType: 'modify' },
      ]);
      branchService.mockBranches.push(branch1, branch2);

      service.detectConflicts();

      const conflicts = service.getActiveConflicts();
      expect(conflicts.length).toBe(1);
    });
  });

  describe('resolveConflict', () => {
    it('should resolve conflict automatically when possible', async () => {
      const commonFile = createFilePath('/src/common.ts');
      // Non-overlapping changes - can be auto-merged
      const branch1 = createMockBranch('b1', 'a1', 't1', [
        { filePath: commonFile, originalContent: 'line1\nline2\nline3', modifiedContent: 'line1\nmodified2\nline3', diff: '', changeType: 'modify' },
      ]);
      const branch2 = createMockBranch('b2', 'a2', 't2', [
        { filePath: commonFile, originalContent: 'line1\nline2\nline3', modifiedContent: 'line1\nline2\nmodified3', diff: '', changeType: 'modify' },
      ]);
      branchService.mockBranches.push(branch1, branch2);

      const conflicts = service.detectConflicts();
      expect(conflicts.length).toBe(1);

      const result = await service.resolveConflict(conflicts[0]!);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.strategy).toBe('auto');
      }
    });

    it('should emit conflict:resolved event on successful resolution', async () => {
      const commonFile = createFilePath('/src/common.ts');
      const branch1 = createMockBranch('b1', 'a1', 't1', [
        { filePath: commonFile, originalContent: 'line1\nline2', modifiedContent: 'line1\nmodified', diff: '', changeType: 'modify' },
      ]);
      const branch2 = createMockBranch('b2', 'a2', 't2', [
        { filePath: commonFile, originalContent: 'line1\nline2', modifiedContent: 'line1\nalsomodified', diff: '', changeType: 'modify' },
      ]);
      branchService.mockBranches.push(branch1, branch2);

      const conflicts = service.detectConflicts();
      eventBus.emittedEvents.length = 0;

      await service.resolveConflict(conflicts[0]!);

      const resolvedEvent = eventBus.emittedEvents.find((e) => e.event === 'conflict:resolved');
      expect(resolvedEvent).toBeDefined();
    });

    it('should fall back to manual when auto and AI fail', async () => {
      const commonFile = createFilePath('/src/common.ts');
      // Overlapping changes - cannot be auto-merged
      const branch1 = createMockBranch('b1', 'a1', 't1', [
        { filePath: commonFile, originalContent: 'same\nline', modifiedContent: 'different1\nline', diff: '', changeType: 'modify' },
      ]);
      const branch2 = createMockBranch('b2', 'a2', 't2', [
        { filePath: commonFile, originalContent: 'same\nline', modifiedContent: 'different2\nline', diff: '', changeType: 'modify' },
      ]);
      branchService.mockBranches.push(branch1, branch2);

      // Create service without LLM adapter
      const serviceNoAI = new MergeEngineService(branchService, semanticAnalyzer, null, eventBus);
      const conflicts = serviceNoAI.detectConflicts();

      const result = await serviceNoAI.resolveConflict(conflicts[0]!);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.strategy).toBe('manual');
      }
    });
  });

  describe('applyResolution', () => {
    it('should apply resolution to branch', async () => {
      const commonFile = createFilePath('/src/common.ts');
      const branch1 = createMockBranch('b1', 'a1', 't1', [
        { filePath: commonFile, originalContent: 'original', modifiedContent: 'version1', diff: '', changeType: 'modify' },
      ]);
      const branch2 = createMockBranch('b2', 'a2', 't2', [
        { filePath: commonFile, originalContent: 'original', modifiedContent: 'version2', diff: '', changeType: 'modify' },
      ]);
      branchService.mockBranches.push(branch1, branch2);

      const conflicts = service.detectConflicts();
      const resolveResult = await service.resolveConflict(conflicts[0]!);

      expect(resolveResult.ok).toBe(true);
      if (!resolveResult.ok) return;

      const applyResult = await service.applyResolution(resolveResult.value);

      expect(applyResult.ok).toBe(true);
      expect(branchService.recordChange).toHaveBeenCalled();
    });

    it('should fail for unknown conflict', async () => {
      const result = await service.applyResolution({
        conflictId: 'unknown' as any,
        resolvedContent: 'content',
        resolvedBy: 'test',
        strategy: 'manual',
      });

      expect(result.ok).toBe(false);
    });

    it('should remove conflict after applying resolution', async () => {
      const commonFile = createFilePath('/src/common.ts');
      const branch1 = createMockBranch('b1', 'a1', 't1', [
        { filePath: commonFile, originalContent: 'a', modifiedContent: 'b', diff: '', changeType: 'modify' },
      ]);
      const branch2 = createMockBranch('b2', 'a2', 't2', [
        { filePath: commonFile, originalContent: 'a', modifiedContent: 'c', diff: '', changeType: 'modify' },
      ]);
      branchService.mockBranches.push(branch1, branch2);

      service.detectConflicts();
      expect(service.hasConflicts()).toBe(true);

      const conflicts = service.getActiveConflicts();
      const resolveResult = await service.resolveConflict(conflicts[0]!);

      if (resolveResult.ok) {
        await service.applyResolution(resolveResult.value);
      }

      expect(service.hasConflicts()).toBe(false);
    });
  });

  describe('clearConflicts', () => {
    it('should clear all conflicts', () => {
      const commonFile = createFilePath('/src/common.ts');
      const branch1 = createMockBranch('b1', 'a1', 't1', [
        { filePath: commonFile, originalContent: 'a', modifiedContent: 'b', diff: '', changeType: 'modify' },
      ]);
      const branch2 = createMockBranch('b2', 'a2', 't2', [
        { filePath: commonFile, originalContent: 'a', modifiedContent: 'c', diff: '', changeType: 'modify' },
      ]);
      branchService.mockBranches.push(branch1, branch2);

      service.detectConflicts();
      expect(service.hasConflicts()).toBe(true);

      service.clearConflicts();

      expect(service.hasConflicts()).toBe(false);
      expect(service.getActiveConflicts()).toEqual([]);
    });
  });

  describe('createMergeEngineService factory', () => {
    it('should create a new instance', () => {
      const mergeEngine = createMergeEngineService(
        branchService,
        semanticAnalyzer,
        llmAdapter,
        eventBus
      );
      expect(mergeEngine).toBeInstanceOf(MergeEngineService);
    });

    it('should work without LLM adapter', () => {
      const mergeEngine = createMergeEngineService(
        branchService,
        semanticAnalyzer,
        null,
        eventBus
      );
      expect(mergeEngine).toBeInstanceOf(MergeEngineService);
    });
  });
});
