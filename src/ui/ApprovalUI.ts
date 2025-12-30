/**
 * Approval UI
 *
 * Handles VS Code UI for approving code changes.
 * Shows diffs and prompts for user approval.
 */

import * as vscode from 'vscode';
import { FileChange, PendingApproval } from '../types';
import { ApprovalManager } from '../core/approval/ApprovalManager';
import { Logger } from '../utils/Logger';

/**
 * Manages the approval UI in VS Code.
 */
export class ApprovalUI {
  private readonly approvalManager: ApprovalManager;
  private readonly logger: Logger;
  private readonly contentProviders: Map<string, vscode.Disposable> = new Map();

  constructor(approvalManager: ApprovalManager) {
    this.approvalManager = approvalManager;
    this.logger = new Logger('ApprovalUI');

    // Listen for approval requests
    this.approvalManager.on('requested', (approval: PendingApproval) => {
      this.showApprovalPrompt(approval);
    });
  }

  /**
   * Show approval prompt for pending changes.
   */
  async showApprovalPrompt(approval: PendingApproval): Promise<void> {
    const { changes, taskId } = approval;

    this.logger.info(`Showing approval prompt for ${changes.length} changes`);

    // Build message
    const changesDescription = changes
      .map((c) => `• ${c.changeType.toUpperCase()}: ${c.filePath}`)
      .join('\n');

    const message = `AlterCode wants to make ${changes.length} file change(s):\n\n${changesDescription}`;

    // Show quick pick with options
    const items: vscode.QuickPickItem[] = [
      {
        label: '$(check) Approve All',
        description: 'Apply all changes',
        detail: 'Accept all proposed file modifications',
      },
      {
        label: '$(eye) Review Changes',
        description: 'View diffs before deciding',
        detail: 'Opens each change in the diff editor',
      },
      {
        label: '$(x) Reject All',
        description: 'Discard all changes',
        detail: 'Cancel the proposed modifications',
      },
    ];

    const selected = await vscode.window.showQuickPick(items, {
      title: `Approve Changes? (Task: ${taskId.substring(0, 8)})`,
      placeHolder: 'Select an action',
    });

    if (!selected) {
      // User cancelled - treat as skip
      await this.approvalManager.respond(approval.id, { approved: false });
      return;
    }

    switch (selected.label) {
      case '$(check) Approve All':
        await this.approvalManager.respond(approval.id, { approved: true });
        break;

      case '$(eye) Review Changes':
        await this.showDiffReview(approval);
        break;

      case '$(x) Reject All':
        await this.approvalManager.respond(approval.id, { approved: false });
        break;
    }
  }

  /**
   * Show diff review for each change.
   */
  async showDiffReview(approval: PendingApproval): Promise<void> {
    const { changes } = approval;

    // Register content providers for this approval
    this.registerContentProviders(approval.id, changes);

    // Review each change
    for (let i = 0; i < changes.length; i++) {
      const change = changes[i];

      // Show diff
      await this.showDiff(approval.id, change, i, changes.length);

      // Ask for individual approval
      const action = await vscode.window.showInformationMessage(
        `Change ${i + 1}/${changes.length}: ${change.changeType.toUpperCase()} ${change.filePath}`,
        { modal: true },
        'Approve',
        'Reject',
        'Approve All Remaining',
        'Reject All Remaining'
      );

      if (action === 'Approve All Remaining') {
        // Approve all remaining
        await this.approvalManager.respond(approval.id, { approved: true });
        break;
      } else if (action === 'Reject All Remaining' || !action) {
        // Reject all remaining or cancelled
        await this.approvalManager.respond(approval.id, { approved: false });
        break;
      } else if (action === 'Reject') {
        // Reject this change and continue
        // For now, reject the whole batch (future: per-file approval)
        await this.approvalManager.respond(approval.id, { approved: false });
        break;
      }
      // 'Approve' continues to next change
    }

    // Clean up
    this.unregisterContentProviders(approval.id);

    // If we went through all changes without breaking, approve
    if (changes.length > 0) {
      await this.approvalManager.respond(approval.id, { approved: true });
    }
  }

  /**
   * Show a diff for a single file change.
   */
  private async showDiff(
    approvalId: string,
    change: FileChange,
    index: number,
    total: number
  ): Promise<void> {
    const originalUri = vscode.Uri.parse(
      `altercode-approval-original:${approvalId}/${index}`
    );
    const modifiedUri = vscode.Uri.parse(
      `altercode-approval-modified:${approvalId}/${index}`
    );

    const title = `${change.filePath} (${index + 1}/${total}) - ${change.changeType}`;

    await vscode.commands.executeCommand('vscode.diff', originalUri, modifiedUri, title);
  }

  /**
   * Register content providers for approval diffs.
   */
  private registerContentProviders(approvalId: string, changes: FileChange[]): void {
    // Original content provider
    const originalProvider = vscode.workspace.registerTextDocumentContentProvider(
      'altercode-approval-original',
      {
        provideTextDocumentContent: (uri: vscode.Uri): string => {
          const parts = uri.path.split('/');
          const index = parseInt(parts[parts.length - 1], 10);
          return changes[index]?.originalContent || '';
        },
      }
    );

    // Modified content provider
    const modifiedProvider = vscode.workspace.registerTextDocumentContentProvider(
      'altercode-approval-modified',
      {
        provideTextDocumentContent: (uri: vscode.Uri): string => {
          const parts = uri.path.split('/');
          const index = parseInt(parts[parts.length - 1], 10);
          return changes[index]?.modifiedContent || '';
        },
      }
    );

    this.contentProviders.set(`${approvalId}-original`, originalProvider);
    this.contentProviders.set(`${approvalId}-modified`, modifiedProvider);
  }

  /**
   * Unregister content providers.
   */
  private unregisterContentProviders(approvalId: string): void {
    const originalDisposable = this.contentProviders.get(`${approvalId}-original`);
    const modifiedDisposable = this.contentProviders.get(`${approvalId}-modified`);

    originalDisposable?.dispose();
    modifiedDisposable?.dispose();

    this.contentProviders.delete(`${approvalId}-original`);
    this.contentProviders.delete(`${approvalId}-modified`);
  }

  /**
   * Dispose the approval UI.
   */
  dispose(): void {
    for (const disposable of this.contentProviders.values()) {
      disposable.dispose();
    }
    this.contentProviders.clear();
  }
}
