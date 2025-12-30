/**
 * Virtual Branch Manager
 *
 * Manages virtual branches for tracking file changes per agent/task.
 * Provides isolation so multiple workers can make changes without conflicts.
 */

import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import { createTwoFilesPatch } from 'diff';
import { VirtualBranch, FileChange, CodeRegion } from '../types';
import { Logger } from '../utils/Logger';

/**
 * Snapshot of a file at a point in time.
 */
interface FileSnapshot {
  filePath: string;
  content: string;
  takenAt: Date;
}

/**
 * Manages virtual branches for change isolation.
 */
export class VirtualBranchManager {
  private readonly logger: Logger;
  private readonly workspaceRoot: string;

  private branches: Map<string, VirtualBranch> = new Map();
  private fileSnapshots: Map<string, FileSnapshot> = new Map();
  private branchByAgent: Map<string, string> = new Map();
  private branchByTask: Map<string, string> = new Map();

  constructor(workspaceRoot: string) {
    this.logger = new Logger('VirtualBranchManager');
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Create a new virtual branch for an agent/task.
   */
  async createBranch(agentId: string, taskId: string): Promise<VirtualBranch> {
    const branchId = uuidv4();

    // Get current file states as base snapshot
    const baseSnapshot = await this.takeWorkspaceSnapshot();

    const branch: VirtualBranch = {
      id: branchId,
      agentId,
      taskId,
      baseSnapshot: JSON.stringify(baseSnapshot),
      changes: [],
      status: 'active',
      createdAt: new Date(),
    };

    this.branches.set(branchId, branch);
    this.branchByAgent.set(agentId, branchId);
    this.branchByTask.set(taskId, branchId);

    this.logger.info(`Created virtual branch ${branchId} for agent ${agentId.substring(0, 8)}`);
    return branch;
  }

  /**
   * Record a file change in a branch.
   */
  recordChange(branchId: string, change: FileChange): void {
    const branch = this.branches.get(branchId);
    if (!branch) {
      throw new Error(`Branch not found: ${branchId}`);
    }

    if (branch.status !== 'active') {
      throw new Error(`Branch ${branchId} is not active (status: ${branch.status})`);
    }

    // Check if we already have a change for this file
    const existingIndex = branch.changes.findIndex(c => c.filePath === change.filePath);

    if (existingIndex >= 0) {
      // Replace existing change
      branch.changes[existingIndex] = change;
      this.logger.debug(`Updated change for ${change.filePath} in branch ${branchId.substring(0, 8)}`);
    } else {
      // Add new change
      branch.changes.push(change);
      this.logger.debug(`Recorded change for ${change.filePath} in branch ${branchId.substring(0, 8)}`);
    }
  }

  /**
   * Record multiple changes in a branch.
   */
  recordChanges(branchId: string, changes: FileChange[]): void {
    for (const change of changes) {
      this.recordChange(branchId, change);
    }
  }

  /**
   * Get a branch by ID.
   */
  getBranch(branchId: string): VirtualBranch | null {
    return this.branches.get(branchId) || null;
  }

  /**
   * Get branch for an agent.
   */
  getBranchForAgent(agentId: string): VirtualBranch | null {
    const branchId = this.branchByAgent.get(agentId);
    if (!branchId) return null;
    return this.branches.get(branchId) || null;
  }

  /**
   * Get branch for a task.
   */
  getBranchForTask(taskId: string): VirtualBranch | null {
    const branchId = this.branchByTask.get(taskId);
    if (!branchId) return null;
    return this.branches.get(branchId) || null;
  }

  /**
   * Get all active branches.
   */
  getActiveBranches(): VirtualBranch[] {
    return Array.from(this.branches.values()).filter(b => b.status === 'active');
  }

  /**
   * Generate diff for a branch (all changes combined).
   */
  getBranchDiff(branchId: string): string {
    const branch = this.branches.get(branchId);
    if (!branch) {
      throw new Error(`Branch not found: ${branchId}`);
    }

    const diffs: string[] = [];

    for (const change of branch.changes) {
      if (change.diff) {
        diffs.push(change.diff);
      } else {
        // Generate diff
        const diff = createTwoFilesPatch(
          `a/${change.filePath}`,
          `b/${change.filePath}`,
          change.originalContent || '',
          change.modifiedContent,
          'original',
          'modified'
        );
        diffs.push(diff);
      }
    }

    return diffs.join('\n');
  }

  /**
   * Get files modified by a branch.
   */
  getModifiedFiles(branchId: string): string[] {
    const branch = this.branches.get(branchId);
    if (!branch) return [];
    return branch.changes.map(c => c.filePath);
  }

  /**
   * Check if branches have conflicting changes.
   */
  hasConflicts(branchId1: string, branchId2: string): boolean {
    const files1 = new Set(this.getModifiedFiles(branchId1));
    const files2 = this.getModifiedFiles(branchId2);

    return files2.some(f => files1.has(f));
  }

  /**
   * Get conflicting files between two branches.
   */
  getConflictingFiles(branchId1: string, branchId2: string): string[] {
    const files1 = new Set(this.getModifiedFiles(branchId1));
    return this.getModifiedFiles(branchId2).filter(f => files1.has(f));
  }

  /**
   * Merge a branch's changes into the workspace.
   */
  async mergeBranch(branchId: string): Promise<{ success: boolean; errors: string[] }> {
    const branch = this.branches.get(branchId);
    if (!branch) {
      return { success: false, errors: [`Branch not found: ${branchId}`] };
    }

    const errors: string[] = [];

    for (const change of branch.changes) {
      try {
        await this.applyChange(change);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`Failed to apply ${change.filePath}: ${msg}`);
      }
    }

    if (errors.length === 0) {
      branch.status = 'merged';
      this.logger.info(`Successfully merged branch ${branchId.substring(0, 8)}`);
      return { success: true, errors: [] };
    } else {
      this.logger.error(`Failed to merge branch ${branchId.substring(0, 8)}: ${errors.join('; ')}`);
      return { success: false, errors };
    }
  }

  /**
   * Apply a single file change.
   */
  private async applyChange(change: FileChange): Promise<void> {
    const absolutePath = this.resolvePath(change.filePath);
    const fileUri = vscode.Uri.file(absolutePath);

    switch (change.changeType) {
      case 'create':
      case 'modify':
        // Ensure directory exists
        const dirPath = absolutePath.substring(0, absolutePath.lastIndexOf('\\'));
        try {
          await vscode.workspace.fs.createDirectory(vscode.Uri.file(dirPath));
        } catch {
          // Directory might already exist
        }
        const content = Buffer.from(change.modifiedContent, 'utf-8');
        await vscode.workspace.fs.writeFile(fileUri, content);
        break;

      case 'delete':
        await vscode.workspace.fs.delete(fileUri);
        break;
    }
  }

  /**
   * Abandon a branch (discard changes).
   */
  abandonBranch(branchId: string): void {
    const branch = this.branches.get(branchId);
    if (!branch) {
      throw new Error(`Branch not found: ${branchId}`);
    }

    branch.status = 'abandoned';
    this.logger.info(`Abandoned branch ${branchId.substring(0, 8)}`);
  }

  /**
   * Clean up a branch (remove from tracking).
   */
  deleteBranch(branchId: string): void {
    const branch = this.branches.get(branchId);
    if (branch) {
      this.branchByAgent.delete(branch.agentId);
      this.branchByTask.delete(branch.taskId);
      this.branches.delete(branchId);
      this.logger.debug(`Deleted branch ${branchId.substring(0, 8)}`);
    }
  }

  /**
   * Get branches that modify a specific file.
   */
  getBranchesModifyingFile(filePath: string): VirtualBranch[] {
    return this.getActiveBranches().filter(branch =>
      branch.changes.some(c => c.filePath === filePath)
    );
  }

  /**
   * Get branches that modify any of the given regions.
   */
  getBranchesModifyingRegions(regions: CodeRegion[]): VirtualBranch[] {
    const filePaths = new Set(regions.map(r => r.filePath));
    return this.getActiveBranches().filter(branch =>
      branch.changes.some(c => filePaths.has(c.filePath))
    );
  }

  /**
   * Take a snapshot of the current workspace.
   */
  private async takeWorkspaceSnapshot(): Promise<Record<string, string>> {
    // For now, we just record the timestamp
    // In a full implementation, we'd track file hashes
    return {
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Snapshot a specific file.
   */
  async snapshotFile(filePath: string): Promise<FileSnapshot> {
    const existing = this.fileSnapshots.get(filePath);
    if (existing) {
      return existing;
    }

    try {
      const absolutePath = this.resolvePath(filePath);
      const fileUri = vscode.Uri.file(absolutePath);
      const contentBuffer = await vscode.workspace.fs.readFile(fileUri);
      const content = Buffer.from(contentBuffer).toString('utf-8');

      const snapshot: FileSnapshot = {
        filePath,
        content,
        takenAt: new Date(),
      };

      this.fileSnapshots.set(filePath, snapshot);
      return snapshot;
    } catch {
      // File doesn't exist yet
      return {
        filePath,
        content: '',
        takenAt: new Date(),
      };
    }
  }

  /**
   * Get the original content of a file from snapshot.
   */
  getOriginalContent(filePath: string): string | null {
    const snapshot = this.fileSnapshots.get(filePath);
    return snapshot ? snapshot.content : null;
  }

  /**
   * Clear all file snapshots.
   */
  clearSnapshots(): void {
    this.fileSnapshots.clear();
  }

  /**
   * Resolve a relative path to absolute.
   */
  private resolvePath(filePath: string): string {
    if (filePath.startsWith('/') || filePath.includes(':')) {
      return filePath;
    }
    return `${this.workspaceRoot}\\${filePath.replace(/\//g, '\\')}`;
  }

  /**
   * Get statistics about active branches.
   */
  getStats(): {
    activeBranches: number;
    totalChanges: number;
    modifiedFiles: number;
  } {
    const active = this.getActiveBranches();
    const allFiles = new Set<string>();

    let totalChanges = 0;
    for (const branch of active) {
      totalChanges += branch.changes.length;
      for (const change of branch.changes) {
        allFiles.add(change.filePath);
      }
    }

    return {
      activeBranches: active.length,
      totalChanges,
      modifiedFiles: allFiles.size,
    };
  }

  /**
   * Dispose and clean up.
   */
  dispose(): void {
    this.branches.clear();
    this.fileSnapshots.clear();
    this.branchByAgent.clear();
    this.branchByTask.clear();
  }
}
