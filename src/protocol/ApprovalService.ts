/**
 * Approval Service
 *
 * Manages the approval workflow for code changes:
 * - Three modes: fully_manual, step_by_step, full_automation
 * - Per-level overrides
 * - Pending approval tracking with timeout
 * - Event-driven for UI integration
 */

import {
  IApprovalService,
  ApprovalMode,
  ApprovalStatus,
  ApprovalResult,
  ApprovalResponse,
  PendingApproval,
  ApprovalConfig,
  DEFAULT_APPROVAL_CONFIG,
  HIERARCHY_BOUNDARY_LEVELS,
  ApprovalId,
  createApprovalId,
  AsyncResult,
  Result,
  Ok,
  Err,
  AppError,
  IEventBus,
  ILogger,
} from '../types';

import { FileChange } from '../types/conflict';
import { Task, HierarchyLevel } from '../types/execution';

/**
 * Approval Service Implementation
 */
export class ApprovalService implements IApprovalService {
  private readonly eventBus: IEventBus;
  private readonly logger?: ILogger;
  private readonly config: Required<ApprovalConfig>;

  /** Current approval mode */
  private currentMode: ApprovalMode;

  /** Per-level mode overrides */
  private readonly levelOverrides: Map<HierarchyLevel, ApprovalMode> = new Map();

  /** Pending approvals by ID */
  private readonly pendingApprovals: Map<ApprovalId, PendingApproval> = new Map();

  /** Resolve functions for waiting approval requests */
  private readonly waitingResolvers: Map<ApprovalId, (result: ApprovalResult) => void> = new Map();

  /** Timeout handles */
  private readonly timeoutHandles: Map<ApprovalId, ReturnType<typeof setTimeout>> = new Map();

  constructor(
    eventBus: IEventBus,
    config?: ApprovalConfig,
    logger?: ILogger
  ) {
    this.eventBus = eventBus;
    this.config = { ...DEFAULT_APPROVAL_CONFIG, ...config };
    this.currentMode = this.config.defaultMode;
    this.logger = logger?.child('ApprovalService');
  }

  /**
   * Set the current approval mode
   */
  setApprovalMode(mode: ApprovalMode): void {
    this.currentMode = mode;
    this.logger?.info('Approval mode changed', { mode });
  }

  /**
   * Get the current approval mode
   */
  getApprovalMode(): ApprovalMode {
    return this.currentMode;
  }

  /**
   * Request approval for changes
   */
  async requestApproval(task: Task, changes: FileChange[]): AsyncResult<ApprovalResult> {
    const effectiveMode = this.getEffectiveMode(task);

    this.logger?.info('Approval requested', {
      taskId: task.id,
      mode: effectiveMode,
      changeCount: changes.length,
    });

    // Full automation: auto-approve
    if (effectiveMode === 'full_automation') {
      const result: ApprovalResult = {
        approved: true,
        mode: effectiveMode,
        automatic: true,
      };
      return Ok(result);
    }

    // Step-by-step: auto-approve unless at hierarchy boundary
    if (effectiveMode === 'step_by_step') {
      if (!this.isAtHierarchyBoundary(task)) {
        const result: ApprovalResult = {
          approved: true,
          mode: effectiveMode,
          automatic: true,
        };
        return Ok(result);
      }
      // At boundary - fall through to prompt user
    }

    // Fully manual or step-by-step at boundary: wait for user
    return this.waitForUserApproval(task, changes, effectiveMode);
  }

  /**
   * Respond to a pending approval
   */
  async respond(approvalId: ApprovalId, response: ApprovalResponse): AsyncResult<void> {
    const pending = this.pendingApprovals.get(approvalId);
    if (!pending) {
      return Err(new AppError('APPROVAL_NOT_FOUND', `Approval ${approvalId} not found`));
    }

    // Update pending approval
    pending.status = this.responseToStatus(response);
    pending.respondedAt = new Date();
    pending.response = response;

    // Clear timeout
    const timeoutHandle = this.timeoutHandles.get(approvalId);
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      this.timeoutHandles.delete(approvalId);
    }

    // Create result
    const result: ApprovalResult = {
      approved: response.approved,
      mode: pending.mode,
      automatic: false,
      action: response.action,
      modifications: response.modifications,
    };

    // Resolve waiting request
    const resolver = this.waitingResolvers.get(approvalId);
    if (resolver) {
      resolver(result);
      this.waitingResolvers.delete(approvalId);
    }

    // Emit event
    this.eventBus.emit('approval:responded', {
      type: 'approval:responded',
      approvalId,
      result,
      timestamp: new Date(),
    });

    this.logger?.info('Approval responded', {
      approvalId,
      approved: response.approved,
      action: response.action,
    });

    return Ok(undefined);
  }

  /**
   * Get all pending approvals
   */
  getPendingApprovals(): PendingApproval[] {
    return Array.from(this.pendingApprovals.values()).filter(
      (a) => a.status === 'pending'
    );
  }

  /**
   * Get a specific pending approval
   */
  getPendingApproval(approvalId: ApprovalId): PendingApproval | null {
    return this.pendingApprovals.get(approvalId) ?? null;
  }

  /**
   * Set approval mode override for a hierarchy level
   */
  setLevelOverride(level: HierarchyLevel, mode: ApprovalMode): void {
    this.levelOverrides.set(level, mode);
    this.logger?.debug('Level override set', { level, mode });
  }

  /**
   * Clear approval mode override for a hierarchy level
   */
  clearLevelOverride(level: HierarchyLevel): void {
    this.levelOverrides.delete(level);
    this.logger?.debug('Level override cleared', { level });
  }

  /**
   * Get effective approval mode for a task
   */
  getEffectiveMode(task: Task): ApprovalMode {
    // Check for level-specific override
    if (task.level) {
      const levelOverride = this.levelOverrides.get(task.level);
      if (levelOverride) {
        return levelOverride;
      }
    }

    // Use current mode
    return this.currentMode;
  }

  /**
   * Check if a task is at a hierarchy boundary
   */
  isAtHierarchyBoundary(task: Task): boolean {
    if (!task.level) {
      return false;
    }
    return this.config.boundaryLevels.includes(task.level);
  }

  /**
   * Cancel a pending approval
   */
  cancelApproval(approvalId: ApprovalId): void {
    const pending = this.pendingApprovals.get(approvalId);
    if (!pending) {
      return;
    }

    // Update status
    pending.status = 'rejected';
    pending.respondedAt = new Date();

    // Clear timeout
    const timeoutHandle = this.timeoutHandles.get(approvalId);
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      this.timeoutHandles.delete(approvalId);
    }

    // Resolve with rejection
    const resolver = this.waitingResolvers.get(approvalId);
    if (resolver) {
      resolver({
        approved: false,
        mode: pending.mode,
        automatic: false,
        action: 'reject',
      });
      this.waitingResolvers.delete(approvalId);
    }

    this.logger?.info('Approval cancelled', { approvalId });
  }

  /**
   * Clear all pending approvals
   */
  clearAll(): void {
    // Cancel all pending
    for (const [approvalId] of this.pendingApprovals) {
      this.cancelApproval(approvalId);
    }

    this.pendingApprovals.clear();
    this.waitingResolvers.clear();

    // Clear all timeouts
    for (const handle of this.timeoutHandles.values()) {
      clearTimeout(handle);
    }
    this.timeoutHandles.clear();

    this.logger?.debug('All approvals cleared');
  }

  /**
   * Wait for user approval
   */
  private async waitForUserApproval(
    task: Task,
    changes: FileChange[],
    mode: ApprovalMode
  ): AsyncResult<ApprovalResult> {
    const approvalId = createApprovalId();

    const pending: PendingApproval = {
      id: approvalId,
      taskId: task.id,
      missionId: task.missionId,
      changes,
      mode,
      status: 'pending',
      requestedAt: new Date(),
      respondedAt: null,
    };

    this.pendingApprovals.set(approvalId, pending);

    // Emit request event (for UI to pick up)
    this.eventBus.emit('approval:requested', {
      type: 'approval:requested',
      approval: pending,
      timestamp: new Date(),
    });

    this.logger?.info('Waiting for user approval', {
      approvalId,
      taskId: task.id,
      changeCount: changes.length,
    });

    // Create promise that resolves when user responds
    return new Promise<Result<ApprovalResult, AppError>>((resolve) => {
      // Store resolver for later
      this.waitingResolvers.set(approvalId, (result) => {
        resolve(Ok(result));
      });

      // Set timeout
      const timeoutHandle = setTimeout(() => {
        this.handleTimeout(approvalId);
        resolve(Err(new AppError('APPROVAL_TIMEOUT', `Approval ${approvalId} timed out`)));
      }, this.config.timeoutMs);

      this.timeoutHandles.set(approvalId, timeoutHandle);
    });
  }

  /**
   * Handle approval timeout
   */
  private handleTimeout(approvalId: ApprovalId): void {
    const pending = this.pendingApprovals.get(approvalId);
    if (!pending || pending.status !== 'pending') {
      return;
    }

    pending.status = 'timeout';
    pending.respondedAt = new Date();

    this.waitingResolvers.delete(approvalId);
    this.timeoutHandles.delete(approvalId);

    this.eventBus.emit('approval:timeout', {
      type: 'approval:timeout',
      approvalId,
      timestamp: new Date(),
    });

    this.logger?.warn('Approval timed out', { approvalId });
  }

  /**
   * Convert response to status
   */
  private responseToStatus(response: ApprovalResponse): ApprovalStatus {
    switch (response.action) {
      case 'approve':
        return 'approved';
      case 'reject':
        return 'rejected';
      case 'modify':
        return 'modified';
      case 'skip':
        return 'rejected';
      default:
        return response.approved ? 'approved' : 'rejected';
    }
  }
}

/**
 * Create a new approval service
 */
export function createApprovalService(
  eventBus: IEventBus,
  config?: ApprovalConfig,
  logger?: ILogger
): IApprovalService {
  return new ApprovalService(eventBus, config, logger);
}
