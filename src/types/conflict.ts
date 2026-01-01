/**
 * Conflict Types
 *
 * Types for conflict detection and resolution:
 * - Virtual branches for change isolation
 * - File changes and snapshots
 * - Merge conflicts and resolutions
 * - Code regions for semantic analysis
 */

import {
  VirtualBranchId,
  ConflictId,
  AgentId,
  TaskId,
  FilePath,
  LineNumber,
  AsyncResult,
} from './common';

// ============================================================================
// Change Types
// ============================================================================

/** Type of file change */
export type ChangeType = 'create' | 'modify' | 'delete';

/** Virtual branch status */
export type BranchStatus = 'active' | 'merged' | 'abandoned';

/** Merge resolution strategy */
export type MergeStrategy = 'auto' | 'manual' | 'ai_assisted';

// ============================================================================
// File Changes
// ============================================================================

/** Represents a change to a file */
export interface FileChange {
  /** Absolute path to the file */
  readonly filePath: FilePath;
  /** Original content (null for new files) */
  readonly originalContent: string | null;
  /** Modified content */
  readonly modifiedContent: string;
  /** Unified diff */
  readonly diff: string;
  /** Type of change */
  readonly changeType: ChangeType;
  /** Affected code regions (optional) */
  readonly regions?: string[];
}

/** Create a file change */
export function createFileChange(
  filePath: FilePath,
  originalContent: string | null,
  modifiedContent: string,
  changeType: ChangeType
): FileChange {
  return {
    filePath,
    originalContent,
    modifiedContent,
    diff: '', // Computed separately
    changeType,
  };
}

// ============================================================================
// File Snapshots
// ============================================================================

/** Snapshot of a file at a point in time */
export interface FileSnapshot {
  /** Absolute path to the file */
  readonly filePath: FilePath;
  /** File content at snapshot time */
  readonly content: string;
  /** When the snapshot was taken */
  readonly takenAt: Date;
}

// ============================================================================
// Virtual Branches
// ============================================================================

/** Virtual branch for isolated change tracking */
export interface VirtualBranch {
  /** Unique branch identifier */
  readonly id: VirtualBranchId;
  /** Agent that owns this branch */
  readonly agentId: AgentId;
  /** Task this branch is for */
  readonly taskId: TaskId;
  /** Base snapshot identifier */
  readonly baseSnapshot: string;
  /** Changes made in this branch (mutable) */
  changes: FileChange[];
  /** Branch status (mutable) */
  status: BranchStatus;
  /** When the branch was created */
  readonly createdAt: Date;
}

/** Virtual branch statistics */
export interface BranchStats {
  /** Number of active branches */
  readonly activeBranches: number;
  /** Total changes across all branches */
  readonly totalChanges: number;
  /** Number of modified files */
  readonly modifiedFiles: number;
}

// ============================================================================
// Code Regions
// ============================================================================

/** Type of code region */
export type RegionType =
  | 'imports'
  | 'type_definition'
  | 'interface'
  | 'class'
  | 'function'
  | 'variable'
  | 'export'
  | 'other';

/** A semantic region of code */
export interface CodeRegion {
  /** Unique region identifier */
  readonly id: string;
  /** File containing this region */
  readonly filePath: FilePath;
  /** Type of code construct */
  readonly type: RegionType;
  /** Name of the construct (function name, class name, etc.) */
  readonly name: string;
  /** Starting line number */
  readonly startLine: LineNumber;
  /** Ending line number */
  readonly endLine: LineNumber;
  /** Dependencies (identifiers used by this region) */
  readonly dependencies: string[];
  /** Agent that modified this region (mutable, null if unmodified) */
  modifiedBy: AgentId | null;
}

// ============================================================================
// Conflict Markers
// ============================================================================

/** Conflict marker indicating conflicting lines */
export interface ConflictMarker {
  /** Start line of the conflict */
  readonly startLine: LineNumber;
  /** End line of the conflict */
  readonly endLine: LineNumber;
  /** Start of "ours" section */
  readonly oursStart: LineNumber;
  /** End of "ours" section */
  readonly oursEnd: LineNumber;
  /** Start of "theirs" section */
  readonly theirsStart: LineNumber;
  /** End of "theirs" section */
  readonly theirsEnd: LineNumber;
}

// ============================================================================
// Merge Conflicts
// ============================================================================

/** A merge conflict between two branches */
export interface MergeConflict {
  /** Unique conflict identifier */
  readonly id: ConflictId;
  /** File with the conflict */
  readonly filePath: FilePath;
  /** Original (base) content */
  readonly baseContent: string;
  /** First branch involved */
  readonly branch1: VirtualBranch;
  /** Second branch involved */
  readonly branch2: VirtualBranch;
  /** Conflicting code regions */
  readonly conflictingRegions: CodeRegion[];
}

/** Input for three-way merge */
export interface MergeInput {
  /** Base (original) content */
  readonly base: string;
  /** "Ours" content (branch 1) */
  readonly ours: string;
  /** "Theirs" content (branch 2) */
  readonly theirs: string;
}

/** Result of a merge attempt */
export interface MergeResult {
  /** Whether the merge succeeded without conflicts */
  readonly success: boolean;
  /** Merged content (may contain conflict markers if not successful) */
  readonly content: string;
  /** Conflict markers if any */
  readonly conflicts: ConflictMarker[];
}

// ============================================================================
// Merge Resolution
// ============================================================================

/** Resolution of a merge conflict */
export interface MergeResolution {
  /** Conflict that was resolved */
  readonly conflictId: ConflictId;
  /** Resolved content */
  readonly resolvedContent: string;
  /** Who/what resolved it */
  readonly resolvedBy: string;
  /** Strategy used for resolution */
  readonly strategy: MergeStrategy;
}

// ============================================================================
// Conflict Events
// ============================================================================

/** Conflict detected event */
export interface ConflictDetectedEvent {
  readonly type: 'conflict:detected';
  readonly conflicts: MergeConflict[];
  readonly timestamp: Date;
}

/** Conflict resolved event */
export interface ConflictResolvedEvent {
  readonly type: 'conflict:resolved';
  readonly resolution: MergeResolution;
  readonly timestamp: Date;
}

/** Branch created event */
export interface BranchCreatedEvent {
  readonly type: 'branch:created';
  readonly branch: VirtualBranch;
  readonly timestamp: Date;
}

/** Branch merged event */
export interface BranchMergedEvent {
  readonly type: 'branch:merged';
  readonly branch: VirtualBranch;
  readonly timestamp: Date;
}

/** Branch abandoned event */
export interface BranchAbandonedEvent {
  readonly type: 'branch:abandoned';
  readonly branch: VirtualBranch;
  readonly timestamp: Date;
}

/** All conflict/branch event types */
export type ConflictEvent =
  | ConflictDetectedEvent
  | ConflictResolvedEvent
  | BranchCreatedEvent
  | BranchMergedEvent
  | BranchAbandonedEvent;

// ============================================================================
// Service Interfaces
// ============================================================================

/** Virtual branch service interface */
export interface IVirtualBranchService {
  /**
   * Create a new virtual branch for an agent/task
   * @param agentId - Agent that owns the branch
   * @param taskId - Task this branch is for
   * @returns The created branch
   */
  createBranch(agentId: AgentId, taskId: TaskId): AsyncResult<VirtualBranch>;

  /**
   * Get a branch by ID
   * @param branchId - Branch identifier
   * @returns Branch or null if not found
   */
  getBranch(branchId: VirtualBranchId): VirtualBranch | null;

  /**
   * Get branch for an agent
   * @param agentId - Agent identifier
   * @returns Branch or null if not found
   */
  getBranchForAgent(agentId: AgentId): VirtualBranch | null;

  /**
   * Get branch for a task
   * @param taskId - Task identifier
   * @returns Branch or null if not found
   */
  getBranchForTask(taskId: TaskId): VirtualBranch | null;

  /**
   * Record a file change in a branch
   * @param branchId - Branch to record in
   * @param change - File change to record
   */
  recordChange(branchId: VirtualBranchId, change: FileChange): void;

  /**
   * Record multiple file changes
   * @param branchId - Branch to record in
   * @param changes - File changes to record
   */
  recordChanges(branchId: VirtualBranchId, changes: FileChange[]): void;

  /**
   * Check if two branches have conflicts
   * @param branchId1 - First branch
   * @param branchId2 - Second branch
   * @returns true if branches have conflicts
   */
  hasConflicts(branchId1: VirtualBranchId, branchId2: VirtualBranchId): boolean;

  /**
   * Get files that conflict between two branches
   * @param branchId1 - First branch
   * @param branchId2 - Second branch
   * @returns Array of conflicting file paths
   */
  getConflictingFiles(branchId1: VirtualBranchId, branchId2: VirtualBranchId): FilePath[];

  /**
   * Merge a branch (apply changes to filesystem)
   * @param branchId - Branch to merge
   * @returns Success or failure
   */
  mergeBranch(branchId: VirtualBranchId): AsyncResult<void>;

  /**
   * Abandon a branch (discard changes)
   * @param branchId - Branch to abandon
   */
  abandonBranch(branchId: VirtualBranchId): void;

  /**
   * Get all active branches
   * @returns Array of active branches
   */
  getActiveBranches(): VirtualBranch[];

  /**
   * Get branch statistics
   * @returns Branch statistics
   */
  getStats(): BranchStats;

  /**
   * Snapshot a file
   * @param filePath - File to snapshot
   * @returns File snapshot
   */
  snapshotFile(filePath: FilePath): Promise<FileSnapshot>;

  /**
   * Get original content of a file
   * @param filePath - File path
   * @returns Original content or null
   */
  getOriginalContent(filePath: FilePath): string | null;
}

/** Merge engine service interface */
export interface IMergeEngineService {
  /**
   * Detect conflicts across all active branches
   * @returns Array of detected conflicts
   */
  detectConflicts(): MergeConflict[];

  /**
   * Create a conflict between two branches for a file
   * @param branch1 - First branch
   * @param branch2 - Second branch
   * @param filePath - File with conflict
   * @returns Conflict or null if no conflict exists
   */
  createConflict(
    branch1: VirtualBranch,
    branch2: VirtualBranch,
    filePath: FilePath
  ): MergeConflict | null;

  /**
   * Resolve a conflict
   * Uses cascade: auto → AI-assisted → manual
   * @param conflict - Conflict to resolve
   * @returns Resolution
   */
  resolveConflict(conflict: MergeConflict): AsyncResult<MergeResolution>;

  /**
   * Apply a resolution
   * @param resolution - Resolution to apply
   */
  applyResolution(resolution: MergeResolution): AsyncResult<void>;

  /**
   * Check if there are any active conflicts
   * @returns true if conflicts exist
   */
  hasConflicts(): boolean;

  /**
   * Get all active conflicts
   * @returns Array of active conflicts
   */
  getActiveConflicts(): MergeConflict[];

  /**
   * Get a specific conflict
   * @param conflictId - Conflict identifier
   * @returns Conflict or null
   */
  getConflict(conflictId: ConflictId): MergeConflict | null;

  /**
   * Clear all active conflicts
   */
  clearConflicts(): void;
}

/** Semantic analyzer service interface */
export interface ISemanticAnalyzerService {
  /**
   * Analyze a file and identify code regions
   * @param filePath - Path to the file
   * @param content - File content
   * @returns Array of code regions
   */
  analyzeFile(filePath: FilePath, content: string): CodeRegion[];

  /**
   * Check if two regions overlap
   * @param r1 - First region
   * @param r2 - Second region
   * @returns true if regions overlap
   */
  regionsOverlap(r1: CodeRegion, r2: CodeRegion): boolean;

  /**
   * Find all regions at a specific position
   * @param filePath - File to search
   * @param line - Line number
   * @param regions - Regions to search
   * @returns Matching regions
   */
  findRegionsAtPosition(
    filePath: FilePath,
    line: LineNumber,
    regions: CodeRegion[]
  ): CodeRegion[];

  /**
   * Get the most specific region at a position
   * @param filePath - File to search
   * @param line - Line number
   * @param regions - Regions to search
   * @returns Most specific region or null
   */
  getMostSpecificRegion(
    filePath: FilePath,
    line: LineNumber,
    regions: CodeRegion[]
  ): CodeRegion | null;

  /**
   * Assign regions to workers to minimize conflicts
   * @param regions - Regions to assign
   * @param workerCount - Number of workers
   * @returns Map of worker index to regions
   */
  assignRegionsToWorkers(
    regions: CodeRegion[],
    workerCount: number
  ): Map<number, CodeRegion[]>;

  /**
   * Get regions that depend on a given region
   * @param region - Region to check
   * @param allRegions - All regions
   * @returns Dependent regions
   */
  getDependentRegions(region: CodeRegion, allRegions: CodeRegion[]): CodeRegion[];

  /**
   * Check if a file type is supported for analysis
   * @param filePath - File to check
   * @returns true if supported
   */
  isSupported(filePath: FilePath): boolean;

  /**
   * Get list of supported file extensions
   * @returns Array of extensions
   */
  getSupportedExtensions(): string[];
}
