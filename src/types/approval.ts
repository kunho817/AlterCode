/**
 * Approval Types
 *
 * Types for the approval workflow:
 * - Three approval modes (manual, step-by-step, automation)
 * - Pending approvals and responses
 * - Per-level overrides
 */

import {
  ApprovalId,
  TaskId,
  MissionId,
  AsyncResult,
} from './common';
import { FileChange } from './conflict';
import { Task, HierarchyLevel } from './execution';

// ============================================================================
// Approval Modes
// ============================================================================

/** Approval mode determining how changes are approved */
export type ApprovalMode =
  | 'fully_manual'      // Always prompt for every change
  | 'step_by_step'      // Auto-approve except at hierarchy boundaries
  | 'full_automation';  // Auto-approve all changes

/** Approval status for a pending approval */
export type ApprovalStatus =
  | 'pending'   // Awaiting user response
  | 'approved'  // User approved
  | 'rejected'  // User rejected
  | 'modified'  // User approved with modifications
  | 'timeout';  // Timed out waiting for response

/** Approval action taken by user */
export type ApprovalAction =
  | 'approve'  // Approve the changes
  | 'reject'   // Reject the changes
  | 'modify'   // Approve with modifications
  | 'skip';    // Skip this change (continue without applying)

// ============================================================================
// Approval Response
// ============================================================================

/** User's response to an approval request */
export interface ApprovalResponse {
  /** Whether the changes were approved */
  readonly approved: boolean;
  /** Action taken */
  readonly action: ApprovalAction;
  /** Modified file changes (if action is 'modify') */
  readonly modifications?: FileChange[];
  /** Optional comment from user */
  readonly comment?: string;
}

// ============================================================================
// Pending Approval
// ============================================================================

/** A pending approval request */
export interface PendingApproval {
  /** Unique identifier */
  readonly id: ApprovalId;
  /** Task requesting approval */
  readonly taskId: TaskId;
  /** Mission this approval belongs to */
  readonly missionId: MissionId;
  /** Changes to be approved */
  readonly changes: FileChange[];
  /** Current approval mode */
  readonly mode: ApprovalMode;
  /** Current status (mutable) */
  status: ApprovalStatus;
  /** When the request was made */
  readonly requestedAt: Date;
  /** When the user responded (mutable) */
  respondedAt: Date | null;
  /** User's response (mutable, added when responded) */
  response?: ApprovalResponse;
}

// ============================================================================
// Approval Result
// ============================================================================

/** Result of an approval request */
export interface ApprovalResult {
  /** Whether the changes were approved */
  readonly approved: boolean;
  /** Mode used for this approval */
  readonly mode: ApprovalMode;
  /** Whether approval was automatic (no user prompt) */
  readonly automatic: boolean;
  /** Action taken (if user responded) */
  readonly action?: ApprovalAction;
  /** Modified changes (if modifications were made) */
  readonly modifications?: FileChange[];
}

// ============================================================================
// Approval Configuration
// ============================================================================

/** Approval service configuration */
export interface ApprovalConfig {
  /** Default approval mode */
  readonly defaultMode?: ApprovalMode;
  /** Timeout for user response in milliseconds (default: 30 minutes) */
  readonly timeoutMs?: number;
  /** Hierarchy levels that trigger step-by-step approval boundaries */
  readonly boundaryLevels?: HierarchyLevel[];
}

/** Default approval configuration */
export const DEFAULT_APPROVAL_CONFIG: Required<ApprovalConfig> = {
  defaultMode: 'step_by_step',
  timeoutMs: 30 * 60 * 1000, // 30 minutes
  boundaryLevels: ['lord', 'overlord'], // Boundaries at Lord and Overlord levels
};

/** Hierarchy boundary levels for step-by-step mode */
export const HIERARCHY_BOUNDARY_LEVELS: HierarchyLevel[] = ['lord', 'overlord'];

// ============================================================================
// Approval Events
// ============================================================================

/** Approval requested event */
export interface ApprovalRequestedEvent {
  readonly type: 'approval:requested';
  readonly approval: PendingApproval;
  readonly timestamp: Date;
}

/** Approval responded event */
export interface ApprovalRespondedEvent {
  readonly type: 'approval:responded';
  readonly approvalId: ApprovalId;
  readonly result: ApprovalResult;
  readonly timestamp: Date;
}

/** Approval timeout event */
export interface ApprovalTimeoutEvent {
  readonly type: 'approval:timeout';
  readonly approvalId: ApprovalId;
  readonly timestamp: Date;
}

/** All approval event types */
export type ApprovalEvent =
  | ApprovalRequestedEvent
  | ApprovalRespondedEvent
  | ApprovalTimeoutEvent;

// ============================================================================
// Level Override
// ============================================================================

/** Override approval mode for a specific hierarchy level */
export interface LevelOverride {
  readonly level: HierarchyLevel;
  readonly mode: ApprovalMode;
}

// ============================================================================
// Service Interface
// ============================================================================

/** Approval service interface */
export interface IApprovalService {
  /**
   * Set the current approval mode
   * @param mode - Approval mode to set
   */
  setApprovalMode(mode: ApprovalMode): void;

  /**
   * Get the current approval mode
   * @returns Current approval mode
   */
  getApprovalMode(): ApprovalMode;

  /**
   * Request approval for changes
   * @param task - Task requesting approval
   * @param changes - File changes to approve
   * @returns Approval result (may block waiting for user)
   */
  requestApproval(task: Task, changes: FileChange[]): AsyncResult<ApprovalResult>;

  /**
   * Respond to a pending approval
   * @param approvalId - Approval to respond to
   * @param response - User's response
   */
  respond(approvalId: ApprovalId, response: ApprovalResponse): AsyncResult<void>;

  /**
   * Get all pending approvals
   * @returns Array of pending approvals
   */
  getPendingApprovals(): PendingApproval[];

  /**
   * Get a specific pending approval
   * @param approvalId - Approval identifier
   * @returns Pending approval or null
   */
  getPendingApproval(approvalId: ApprovalId): PendingApproval | null;

  /**
   * Set approval mode override for a hierarchy level
   * @param level - Hierarchy level
   * @param mode - Approval mode to use for this level
   */
  setLevelOverride(level: HierarchyLevel, mode: ApprovalMode): void;

  /**
   * Clear approval mode override for a hierarchy level
   * @param level - Hierarchy level to clear
   */
  clearLevelOverride(level: HierarchyLevel): void;

  /**
   * Get effective approval mode for a task
   * Considers level overrides
   * @param task - Task to check
   * @returns Effective approval mode
   */
  getEffectiveMode(task: Task): ApprovalMode;

  /**
   * Check if a task is at a hierarchy boundary
   * (Used for step-by-step mode)
   * @param task - Task to check
   * @returns true if at boundary
   */
  isAtHierarchyBoundary(task: Task): boolean;

  /**
   * Cancel a pending approval
   * @param approvalId - Approval to cancel
   */
  cancelApproval(approvalId: ApprovalId): void;

  /**
   * Clear all pending approvals
   */
  clearAll(): void;
}
