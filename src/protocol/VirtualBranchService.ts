/**
 * Virtual Branch Service
 *
 * Manages isolated virtual branches for tracking file changes per agent/task:
 * - Create branches for parallel work isolation
 * - Record file changes per branch
 * - Detect conflicts between branches
 * - Merge branches to filesystem
 */

import {
  IVirtualBranchService,
  VirtualBranch,
  FileSnapshot,
  BranchStats,
  VirtualBranchId,
  AgentId,
  TaskId,
  FilePath,
  createVirtualBranchId,
  AsyncResult,
  Ok,
  Err,
  AppError,
  IFileSystem,
  IEventBus,
  ILogger,
} from '../types';

// Import FileChange from conflict module directly
import { FileChange } from '../types/conflict';

/**
 * Virtual Branch Service Implementation
 */
export class VirtualBranchService implements IVirtualBranchService {
  private readonly fileSystem: IFileSystem;
  private readonly eventBus: IEventBus;
  private readonly logger?: ILogger;

  /** All branches by ID */
  private readonly branches: Map<VirtualBranchId, VirtualBranch> = new Map();

  /** Branch lookup by agent */
  private readonly branchByAgent: Map<AgentId, VirtualBranchId> = new Map();

  /** Branch lookup by task */
  private readonly branchByTask: Map<TaskId, VirtualBranchId> = new Map();

  /** File snapshots */
  private readonly fileSnapshots: Map<FilePath, FileSnapshot> = new Map();

  constructor(
    fileSystem: IFileSystem,
    eventBus: IEventBus,
    logger?: ILogger
  ) {
    this.fileSystem = fileSystem;
    this.eventBus = eventBus;
    this.logger = logger?.child('VirtualBranchService');
  }

  /**
   * Create a new virtual branch for an agent/task
   */
  async createBranch(agentId: AgentId, taskId: TaskId): AsyncResult<VirtualBranch> {
    const id = createVirtualBranchId();

    const branch: VirtualBranch = {
      id,
      agentId,
      taskId,
      baseSnapshot: new Date().toISOString(),
      changes: [],
      status: 'active',
      createdAt: new Date(),
    };

    // Store branch
    this.branches.set(id, branch);
    this.branchByAgent.set(agentId, id);
    this.branchByTask.set(taskId, id);

    // Emit event
    this.eventBus.emit('branch:created', {
      type: 'branch:created',
      branch,
      timestamp: new Date(),
    });

    this.logger?.info('Branch created', { id, agentId, taskId });

    return Ok(branch);
  }

  /**
   * Get a branch by ID
   */
  getBranch(branchId: VirtualBranchId): VirtualBranch | null {
    return this.branches.get(branchId) ?? null;
  }

  /**
   * Get branch for an agent
   */
  getBranchForAgent(agentId: AgentId): VirtualBranch | null {
    const branchId = this.branchByAgent.get(agentId);
    return branchId ? this.branches.get(branchId) ?? null : null;
  }

  /**
   * Get branch for a task
   */
  getBranchForTask(taskId: TaskId): VirtualBranch | null {
    const branchId = this.branchByTask.get(taskId);
    return branchId ? this.branches.get(branchId) ?? null : null;
  }

  /**
   * Record a file change in a branch
   */
  recordChange(branchId: VirtualBranchId, change: FileChange): void {
    const branch = this.branches.get(branchId);
    if (!branch) {
      this.logger?.warn('Branch not found for recording change', { branchId });
      return;
    }

    if (branch.status !== 'active') {
      this.logger?.warn('Cannot record change to non-active branch', {
        branchId,
        status: branch.status,
      });
      return;
    }

    // Replace existing change for same file or add new
    const existingIndex = branch.changes.findIndex(
      (c) => c.filePath === change.filePath
    );

    if (existingIndex >= 0) {
      branch.changes[existingIndex] = change;
    } else {
      branch.changes.push(change);
    }

    this.logger?.debug('Change recorded', {
      branchId,
      filePath: change.filePath,
      changeType: change.changeType,
    });
  }

  /**
   * Record multiple file changes
   */
  recordChanges(branchId: VirtualBranchId, changes: FileChange[]): void {
    for (const change of changes) {
      this.recordChange(branchId, change);
    }
  }

  /**
   * Check if two branches have conflicts (modify same files)
   */
  hasConflicts(branchId1: VirtualBranchId, branchId2: VirtualBranchId): boolean {
    const conflictingFiles = this.getConflictingFiles(branchId1, branchId2);
    return conflictingFiles.length > 0;
  }

  /**
   * Get files that conflict between two branches
   */
  getConflictingFiles(branchId1: VirtualBranchId, branchId2: VirtualBranchId): FilePath[] {
    const branch1 = this.branches.get(branchId1);
    const branch2 = this.branches.get(branchId2);

    if (!branch1 || !branch2) {
      return [];
    }

    const files1 = new Set(branch1.changes.map((c) => c.filePath));
    const files2 = new Set(branch2.changes.map((c) => c.filePath));

    const conflicts: FilePath[] = [];
    for (const file of files1) {
      if (files2.has(file)) {
        conflicts.push(file);
      }
    }

    return conflicts;
  }

  /**
   * Merge a branch (apply changes to filesystem)
   */
  async mergeBranch(branchId: VirtualBranchId): AsyncResult<void> {
    const branch = this.branches.get(branchId);
    if (!branch) {
      return Err(new AppError('BRANCH_NOT_FOUND', `Branch ${branchId} not found`));
    }

    if (branch.status !== 'active') {
      return Err(new AppError('INVALID_BRANCH_STATUS', `Branch ${branchId} is ${branch.status}`));
    }

    this.logger?.info('Merging branch', { branchId, changeCount: branch.changes.length });

    const errors: string[] = [];

    for (const change of branch.changes) {
      try {
        await this.applyChange(change);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${change.filePath}: ${message}`);
        this.logger?.error('Failed to apply change', error as Error, { filePath: change.filePath });
      }
    }

    if (errors.length > 0) {
      return Err(new AppError('MERGE_FAILED', `Failed to apply changes: ${errors.join(', ')}`));
    }

    // Update branch status
    branch.status = 'merged';

    // Emit event
    this.eventBus.emit('branch:merged', {
      type: 'branch:merged',
      branch,
      timestamp: new Date(),
    });

    this.logger?.info('Branch merged', { branchId });

    return Ok(undefined);
  }

  /**
   * Abandon a branch (discard changes)
   */
  abandonBranch(branchId: VirtualBranchId): void {
    const branch = this.branches.get(branchId);
    if (!branch) {
      this.logger?.warn('Branch not found for abandoning', { branchId });
      return;
    }

    branch.status = 'abandoned';

    // Emit event
    this.eventBus.emit('branch:abandoned', {
      type: 'branch:abandoned',
      branch,
      timestamp: new Date(),
    });

    this.logger?.info('Branch abandoned', { branchId });
  }

  /**
   * Get all active branches
   */
  getActiveBranches(): VirtualBranch[] {
    return Array.from(this.branches.values()).filter((b) => b.status === 'active');
  }

  /**
   * Get branch statistics
   */
  getStats(): BranchStats {
    const activeBranches = this.getActiveBranches();
    const modifiedFiles = new Set<string>();
    let totalChanges = 0;

    for (const branch of activeBranches) {
      totalChanges += branch.changes.length;
      for (const change of branch.changes) {
        modifiedFiles.add(change.filePath as string);
      }
    }

    return {
      activeBranches: activeBranches.length,
      totalChanges,
      modifiedFiles: modifiedFiles.size,
    };
  }

  /**
   * Snapshot a file
   */
  async snapshotFile(filePath: FilePath): Promise<FileSnapshot> {
    // Check cache
    const existing = this.fileSnapshots.get(filePath);
    if (existing) {
      return existing;
    }

    // Read file content
    let content = '';
    try {
      if (await this.fileSystem.exists(filePath)) {
        content = await this.fileSystem.readFile(filePath);
      }
    } catch (error) {
      this.logger?.debug('File not found for snapshot', { filePath });
    }

    const snapshot: FileSnapshot = {
      filePath,
      content,
      takenAt: new Date(),
    };

    this.fileSnapshots.set(filePath, snapshot);
    return snapshot;
  }

  /**
   * Get original content of a file
   */
  getOriginalContent(filePath: FilePath): string | null {
    const snapshot = this.fileSnapshots.get(filePath);
    return snapshot?.content ?? null;
  }

  /**
   * Apply a file change to the filesystem
   */
  private async applyChange(change: FileChange): Promise<void> {
    const dirPath = this.fileSystem.dirname(change.filePath);

    switch (change.changeType) {
      case 'create':
      case 'modify':
        // Ensure directory exists
        if (!(await this.fileSystem.exists(dirPath))) {
          await this.fileSystem.mkdir(dirPath, true);
        }
        await this.fileSystem.writeFile(change.filePath, change.modifiedContent);
        break;

      case 'delete':
        if (await this.fileSystem.exists(change.filePath)) {
          await this.fileSystem.deleteFile(change.filePath);
        }
        break;
    }
  }

  /**
   * Delete a branch and cleanup maps
   */
  deleteBranch(branchId: VirtualBranchId): void {
    const branch = this.branches.get(branchId);
    if (!branch) return;

    this.branches.delete(branchId);
    this.branchByAgent.delete(branch.agentId);
    this.branchByTask.delete(branch.taskId);
  }

  /**
   * Clear all snapshots
   */
  clearSnapshots(): void {
    this.fileSnapshots.clear();
  }

  /**
   * Dispose and cleanup
   */
  dispose(): void {
    this.branches.clear();
    this.branchByAgent.clear();
    this.branchByTask.clear();
    this.fileSnapshots.clear();
  }
}

/**
 * Create a new virtual branch service
 */
export function createVirtualBranchService(
  fileSystem: IFileSystem,
  eventBus: IEventBus,
  logger?: ILogger
): IVirtualBranchService {
  return new VirtualBranchService(fileSystem, eventBus, logger);
}
