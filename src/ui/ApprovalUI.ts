/**
 * Approval UI
 *
 * VS Code UI components for the approval workflow:
 * - Quick pick for approval actions
 * - Built-in diff viewer for change review
 * - Synthetic document provider for showing diffs
 */

import * as vscode from 'vscode';
import {
  PendingApproval,
  ApprovalResponse,
  ApprovalAction,
  ApprovalId,
  IEventBus,
  IApprovalService,
  ILogger,
} from '../types';
import { FileChange } from '../types/conflict';

/**
 * Approval UI implementation
 */
export class ApprovalUI implements vscode.Disposable {
  private readonly approvalService: IApprovalService;
  private readonly eventBus: IEventBus;
  private readonly logger?: ILogger;
  private readonly disposables: vscode.Disposable[] = [];

  /** Content provider for original (before) documents */
  private readonly originalProvider: ApprovalDocumentProvider;

  /** Content provider for modified (after) documents */
  private readonly modifiedProvider: ApprovalDocumentProvider;

  constructor(
    approvalService: IApprovalService,
    eventBus: IEventBus,
    logger?: ILogger
  ) {
    this.approvalService = approvalService;
    this.eventBus = eventBus;
    this.logger = logger?.child('ApprovalUI');

    // Register document providers
    this.originalProvider = new ApprovalDocumentProvider();
    this.modifiedProvider = new ApprovalDocumentProvider();

    this.disposables.push(
      vscode.workspace.registerTextDocumentContentProvider(
        'altercode-original',
        this.originalProvider
      )
    );

    this.disposables.push(
      vscode.workspace.registerTextDocumentContentProvider(
        'altercode-modified',
        this.modifiedProvider
      )
    );

    // Subscribe to approval events
    this.subscribeToEvents();
  }

  /**
   * Subscribe to approval events from event bus
   */
  private subscribeToEvents(): void {
    this.eventBus.on('approval:requested', async (event) => {
      const { approval } = event as unknown as { approval: PendingApproval };
      await this.showApprovalPrompt(approval);
    });
  }

  /**
   * Show approval prompt to user
   */
  async showApprovalPrompt(approval: PendingApproval): Promise<void> {
    this.logger?.info('Showing approval prompt', {
      approvalId: approval.id,
      changeCount: approval.changes.length,
    });

    // Build quick pick items
    const items: ApprovalQuickPickItem[] = [
      {
        label: '$(check) Approve All',
        description: `Approve all ${approval.changes.length} change(s)`,
        action: 'approve',
      },
      {
        label: '$(eye) Review Changes',
        description: 'View each change in diff editor before deciding',
        action: 'review',
      },
      {
        label: '$(close) Reject All',
        description: 'Reject all changes',
        action: 'reject',
      },
      {
        label: '$(debug-step-over) Skip',
        description: 'Skip this approval (do not apply changes)',
        action: 'skip',
      },
    ];

    const selected = await vscode.window.showQuickPick(items, {
      title: 'AlterCode: Approval Required',
      placeHolder: `Review ${approval.changes.length} file change(s) before applying`,
      ignoreFocusOut: true,
    });

    if (!selected) {
      // User cancelled - treat as skip
      await this.respond(approval.id, {
        approved: false,
        action: 'skip',
        comment: 'User cancelled approval dialog',
      });
      return;
    }

    switch (selected.action) {
      case 'approve':
        await this.respond(approval.id, {
          approved: true,
          action: 'approve',
        });
        break;

      case 'reject':
        await this.respond(approval.id, {
          approved: false,
          action: 'reject',
        });
        break;

      case 'skip':
        await this.respond(approval.id, {
          approved: false,
          action: 'skip',
        });
        break;

      case 'review':
        await this.reviewChanges(approval);
        break;
    }
  }

  /**
   * Review changes one by one in diff editor
   */
  async reviewChanges(approval: PendingApproval): Promise<void> {
    const changes = [...approval.changes];
    const approvedChanges: FileChange[] = [];
    const rejectedChanges: FileChange[] = [];

    for (let i = 0; i < changes.length; i++) {
      const change = changes[i];
      if (!change) continue;

      const action = await this.reviewSingleChange(change, i + 1, changes.length);

      if (action === 'approve') {
        approvedChanges.push(change);
      } else if (action === 'reject') {
        rejectedChanges.push(change);
      } else if (action === 'approve_all') {
        // Approve remaining
        approvedChanges.push(change, ...changes.slice(i + 1).filter((c): c is FileChange => !!c));
        break;
      } else if (action === 'reject_all') {
        // Reject remaining
        rejectedChanges.push(change, ...changes.slice(i + 1).filter((c): c is FileChange => !!c));
        break;
      } else if (action === 'cancel') {
        // Cancel review - skip all remaining
        await this.respond(approval.id, {
          approved: false,
          action: 'skip',
          comment: 'User cancelled during review',
        });
        return;
      }
    }

    // Determine final result
    if (rejectedChanges.length === 0) {
      // All approved
      await this.respond(approval.id, {
        approved: true,
        action: 'approve',
        comment: `Approved all ${approvedChanges.length} change(s)`,
      });
    } else if (approvedChanges.length === 0) {
      // All rejected
      await this.respond(approval.id, {
        approved: false,
        action: 'reject',
        comment: `Rejected all ${rejectedChanges.length} change(s)`,
      });
    } else {
      // Mixed - partial approval (apply only approved changes)
      await this.respond(approval.id, {
        approved: true,
        action: 'modify',
        modifications: approvedChanges,
        comment: `Approved ${approvedChanges.length}, rejected ${rejectedChanges.length}`,
      });
    }
  }

  /**
   * Review a single change in diff editor
   */
  async reviewSingleChange(
    change: FileChange,
    index: number,
    total: number
  ): Promise<'approve' | 'reject' | 'approve_all' | 'reject_all' | 'cancel'> {
    // Register content for diff
    const fileId = `${Date.now()}-${index}`;
    const originalContent = change.originalContent ?? '';
    const modifiedContent = change.modifiedContent;

    this.originalProvider.setContent(fileId, originalContent);
    this.modifiedProvider.setContent(fileId, modifiedContent);

    // Create URIs
    const fileName = this.getFileName(change.filePath as string);
    const originalUri = vscode.Uri.parse(`altercode-original:/${fileId}/${fileName}`);
    const modifiedUri = vscode.Uri.parse(`altercode-modified:/${fileId}/${fileName}`);

    // Show diff
    await vscode.commands.executeCommand(
      'vscode.diff',
      originalUri,
      modifiedUri,
      `AlterCode: ${fileName} (${index}/${total}) - ${change.changeType}`
    );

    // Show quick pick for action
    const items: ApprovalQuickPickItem[] = [
      {
        label: '$(check) Approve',
        description: 'Approve this change',
        action: 'approve',
      },
      {
        label: '$(close) Reject',
        description: 'Reject this change',
        action: 'reject',
      },
      {
        label: '$(check-all) Approve All Remaining',
        description: `Approve this and ${total - index} more`,
        action: 'approve_all',
      },
      {
        label: '$(close-all) Reject All Remaining',
        description: `Reject this and ${total - index} more`,
        action: 'reject_all',
      },
      {
        label: '$(stop) Cancel Review',
        description: 'Cancel and skip all changes',
        action: 'cancel',
      },
    ];

    const selected = await vscode.window.showQuickPick(items, {
      title: `Review Change ${index}/${total}`,
      placeHolder: `${change.changeType}: ${fileName}`,
      ignoreFocusOut: true,
    });

    // Close diff editor
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

    // Clean up content
    this.originalProvider.removeContent(fileId);
    this.modifiedProvider.removeContent(fileId);

    if (!selected) {
      return 'cancel';
    }

    return selected.action as 'approve' | 'reject' | 'approve_all' | 'reject_all' | 'cancel';
  }

  /**
   * Send response to approval service
   */
  private async respond(approvalId: ApprovalId, response: ApprovalResponse): Promise<void> {
    const result = await this.approvalService.respond(approvalId, response);

    if (!result.ok) {
      this.logger?.error('Failed to respond to approval', result.error, { approvalId });
      vscode.window.showErrorMessage(`Failed to respond to approval: ${result.error.message}`);
    } else {
      this.logger?.info('Approval responded', { approvalId, action: response.action });

      // Show notification
      if (response.approved) {
        vscode.window.showInformationMessage('Changes approved');
      } else if (response.action === 'skip') {
        vscode.window.showWarningMessage('Changes skipped');
      } else {
        vscode.window.showWarningMessage('Changes rejected');
      }
    }
  }

  /**
   * Get file name from path
   */
  private getFileName(filePath: string): string {
    return filePath.split(/[/\\]/).pop() ?? filePath;
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}

/**
 * Quick pick item with action
 */
interface ApprovalQuickPickItem extends vscode.QuickPickItem {
  action: string;
}

/**
 * Document content provider for approval diffs
 */
class ApprovalDocumentProvider implements vscode.TextDocumentContentProvider {
  private readonly content: Map<string, string> = new Map();
  private readonly onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();

  readonly onDidChange = this.onDidChangeEmitter.event;

  /**
   * Set content for a file ID
   */
  setContent(fileId: string, content: string): void {
    this.content.set(fileId, content);
  }

  /**
   * Remove content for a file ID
   */
  removeContent(fileId: string): void {
    this.content.delete(fileId);
  }

  /**
   * Provide text document content
   */
  provideTextDocumentContent(uri: vscode.Uri): string {
    // Extract file ID from path (format: /fileId/filename)
    const parts = uri.path.split('/');
    const fileId = parts[1] ?? '';

    return this.content.get(fileId) ?? '';
  }
}

/**
 * Create and register approval UI
 */
export function createApprovalUI(
  approvalService: IApprovalService,
  eventBus: IEventBus,
  logger?: ILogger
): ApprovalUI {
  return new ApprovalUI(approvalService, eventBus, logger);
}
