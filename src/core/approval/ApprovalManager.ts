/**
 * Approval Manager
 *
 * Manages the approval workflow for code changes.
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  ApprovalMode,
  ApprovalStatus,
  PendingApproval,
  ApprovalResponse,
  ApprovalResult,
  Task,
  FileChange,
  HierarchyLevel,
} from '../../types';
import { Logger } from '../../utils/Logger';

/**
 * Manages approval workflows.
 */
export class ApprovalManager extends EventEmitter {
  private readonly defaultMode: ApprovalMode;
  private readonly logger: Logger;

  private pendingApprovals: Map<string, PendingApproval> = new Map();
  private domainOverrides: Map<string, ApprovalMode> = new Map();
  private levelOverrides: Map<HierarchyLevel, ApprovalMode> = new Map();

  constructor(defaultMode: ApprovalMode) {
    super();
    this.defaultMode = defaultMode;
    this.logger = new Logger('ApprovalManager');
  }

  /**
   * Request approval for changes.
   */
  async requestApproval(
    task: Task,
    changes: FileChange[]
  ): Promise<ApprovalResult> {
    const mode = this.getEffectiveMode(task);

    this.logger.debug(`Requesting approval for task ${task.id} with mode ${mode}`);

    switch (mode) {
      case ApprovalMode.FULL_AUTOMATION:
        return { approved: true, mode, automatic: true };

      case ApprovalMode.STEP_BY_STEP:
        if (this.isHierarchyBoundary(task)) {
          return this.promptApproval(task, changes, mode);
        }
        return { approved: true, mode, automatic: true };

      case ApprovalMode.FULLY_MANUAL:
      default:
        return this.promptApproval(task, changes, mode);
    }
  }

  /**
   * Respond to an approval request.
   */
  async respond(
    approvalId: string,
    response: { approved: boolean; modifications?: unknown }
  ): Promise<void> {
    const approval = this.pendingApprovals.get(approvalId);
    if (!approval) {
      throw new Error(`Approval not found: ${approvalId}`);
    }

    approval.status = response.approved
      ? ApprovalStatus.APPROVED
      : ApprovalStatus.REJECTED;
    approval.respondedAt = new Date();
    approval.response = {
      approved: response.approved,
      action: response.approved ? 'approve' : 'reject',
      modifications: response.modifications as FileChange[] | undefined,
    };

    this.emit(`response:${approvalId}`, {
      approved: response.approved,
      mode: approval.mode,
      automatic: false,
      action: approval.response.action,
      modifications: approval.response.modifications,
    } as ApprovalResult);

    this.pendingApprovals.delete(approvalId);
  }

  /**
   * Get pending approvals.
   */
  getPendingApprovals(): PendingApproval[] {
    return Array.from(this.pendingApprovals.values());
  }

  /**
   * Set domain override.
   */
  setDomainOverride(domain: string, mode: ApprovalMode): void {
    this.domainOverrides.set(domain, mode);
  }

  /**
   * Set level override.
   */
  setLevelOverride(level: HierarchyLevel, mode: ApprovalMode): void {
    this.levelOverrides.set(level, mode);
  }

  /**
   * Get effective mode for a task.
   */
  private getEffectiveMode(task: Task): ApprovalMode {
    // Check level override first
    if (this.levelOverrides.has(task.level)) {
      return this.levelOverrides.get(task.level)!;
    }

    // Check domain override
    const domain = this.getDomainForTask(task);
    if (domain && this.domainOverrides.has(domain)) {
      return this.domainOverrides.get(domain)!;
    }

    return this.defaultMode;
  }

  /**
   * Prompt for user approval.
   */
  private async promptApproval(
    task: Task,
    changes: FileChange[],
    mode: ApprovalMode
  ): Promise<ApprovalResult> {
    const approval: PendingApproval = {
      id: uuidv4(),
      taskId: task.id,
      changes,
      mode,
      status: ApprovalStatus.PENDING,
      requestedAt: new Date(),
      respondedAt: null,
    };

    this.pendingApprovals.set(approval.id, approval);
    this.emit('requested', approval);

    return new Promise((resolve) => {
      this.once(`response:${approval.id}`, (result: ApprovalResult) => {
        resolve(result);
      });

      // Timeout after 30 minutes
      setTimeout(() => {
        if (this.pendingApprovals.has(approval.id)) {
          approval.status = ApprovalStatus.TIMEOUT;
          this.pendingApprovals.delete(approval.id);
          resolve({
            approved: false,
            mode,
            automatic: false,
            action: 'skip',
          });
        }
      }, 30 * 60 * 1000);
    });
  }

  /**
   * Check if task is at a hierarchy boundary.
   */
  private isHierarchyBoundary(task: Task): boolean {
    // Consider transitions between major levels as boundaries
    return (
      task.level === HierarchyLevel.ARCHITECT ||
      task.level === HierarchyLevel.STRATEGIST
    );
  }

  /**
   * Get domain for a task.
   */
  private getDomainForTask(task: Task): string | null {
    // Extract domain from task context or type
    // This is a simplified implementation
    if (task.title.toLowerCase().includes('frontend')) return 'frontend';
    if (task.title.toLowerCase().includes('backend')) return 'backend';
    return null;
  }
}
