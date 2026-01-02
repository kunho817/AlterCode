/**
 * WebviewProvider - Central orchestrator for webview communication
 *
 * This is the main coordinator between the extension host and the React webview.
 * It manages:
 * - Webview lifecycle
 * - Message passing
 * - State synchronization
 * - Streaming coordination
 */

import * as vscode from 'vscode';
import { EventBus } from '../infrastructure/EventBus';
import type {
  ExtensionMessage,
  AppState,
  ChatMessage,
  WebviewMission,
  WebviewTask,
  WebviewActivityEntry,
  WebviewQuotaStatus,
  WebviewPendingApproval,
  WebviewSettings,
  ErrorInfo,
  TokenUsage,
} from './messages/ExtensionMessage';
import type { WebviewMessage } from './messages/WebviewMessage';
import { v4 as uuidv4 } from 'uuid';

export class WebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'altercode.chatView';

  private _view?: vscode.WebviewView;
  private _extensionUri: vscode.Uri;
  private _eventBus: EventBus;
  private _state: AppState;
  private _disposables: vscode.Disposable[] = [];

  // Streaming state
  private _currentStreamingMessageId: string | null = null;
  private _abortController: AbortController | null = null;

  constructor(extensionUri: vscode.Uri, eventBus: EventBus) {
    this._extensionUri = extensionUri;
    this._eventBus = eventBus;
    this._state = this._createInitialState();

    this._setupEventListeners();
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, 'out', 'webview'),
        vscode.Uri.joinPath(this._extensionUri, 'webview-ui', 'dist'),
      ],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from webview
    this._disposables.push(
      webviewView.webview.onDidReceiveMessage((message: WebviewMessage) => {
        this._handleWebviewMessage(message);
      })
    );

    // Handle visibility changes
    this._disposables.push(
      webviewView.onDidChangeVisibility(() => {
        if (webviewView.visible) {
          this._sendFullState();
        }
      })
    );

    // Handle disposal
    webviewView.onDidDispose(() => {
      this._disposables.forEach((d) => d.dispose());
      this._disposables = [];
    });
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Post a message to the webview
   */
  public postMessage(message: ExtensionMessage): void {
    if (this._view?.visible) {
      this._view.webview.postMessage(message);
    }
  }

  /**
   * Start a streaming message
   */
  public startStreaming(model: string): string {
    const messageId = uuidv4();
    this._currentStreamingMessageId = messageId;
    this._abortController = new AbortController();

    this._updateState({
      isStreaming: true,
      currentStreamingMessageId: messageId,
    });

    this.postMessage({
      type: 'streamStart',
      messageId,
      model,
    });

    return messageId;
  }

  /**
   * Send a streaming chunk
   */
  public streamChunk(messageId: string, content: string, thinking = false): void {
    if (messageId !== this._currentStreamingMessageId) return;

    this.postMessage({
      type: 'streamChunk',
      messageId,
      content,
      thinking,
    });
  }

  /**
   * Send a tool call notification
   */
  public streamToolCall(messageId: string, tool: string, args: string): string {
    if (messageId !== this._currentStreamingMessageId) return '';

    const toolCallId = uuidv4();
    this.postMessage({
      type: 'streamToolCall',
      messageId,
      tool,
      args,
      toolCallId,
    });

    return toolCallId;
  }

  /**
   * Send a tool result notification
   */
  public streamToolResult(messageId: string, tool: string, result: string, toolCallId: string): void {
    if (messageId !== this._currentStreamingMessageId) return;

    this.postMessage({
      type: 'streamToolResult',
      messageId,
      tool,
      result,
      toolCallId,
    });
  }

  /**
   * End the current streaming message
   */
  public endStreaming(messageId: string, usage?: TokenUsage): void {
    if (messageId !== this._currentStreamingMessageId) return;

    this._currentStreamingMessageId = null;
    this._abortController = null;

    this._updateState({
      isStreaming: false,
      currentStreamingMessageId: null,
    });

    this.postMessage({
      type: 'streamEnd',
      messageId,
      usage,
    });
  }

  /**
   * Send a streaming error
   */
  public streamError(messageId: string, error: ErrorInfo): void {
    if (messageId !== this._currentStreamingMessageId) return;

    this._currentStreamingMessageId = null;
    this._abortController = null;

    this._updateState({
      isStreaming: false,
      currentStreamingMessageId: null,
      currentError: error,
    });

    this.postMessage({
      type: 'streamError',
      messageId,
      error,
    });
  }

  /**
   * Cancel the current streaming operation
   */
  public cancelStreaming(): void {
    if (this._abortController) {
      this._abortController.abort();
    }
  }

  /**
   * Get the abort signal for the current streaming operation
   */
  public getAbortSignal(): AbortSignal | undefined {
    return this._abortController?.signal;
  }

  /**
   * Show an error in the webview
   */
  public showError(error: ErrorInfo): void {
    this._updateState({ currentError: error });
    this.postMessage({
      type: 'error',
      error,
    });
  }

  /**
   * Clear the current error
   */
  public clearError(): void {
    this._updateState({ currentError: null });
    this.postMessage({ type: 'errorClear' });
  }

  /**
   * Show rate limit information
   */
  public showRateLimit(retryAfterMs: number, provider: string): void {
    this._updateState({
      rateLimitInfo: {
        retryAfterMs,
        provider,
        startTime: Date.now(),
      },
    });
    this.postMessage({
      type: 'rateLimitStart',
      retryAfterMs,
      provider,
    });
  }

  /**
   * Clear rate limit information
   */
  public clearRateLimit(): void {
    this._updateState({ rateLimitInfo: null });
    this.postMessage({ type: 'rateLimitEnd' });
  }

  /**
   * Add a chat message
   */
  public addChatMessage(message: ChatMessage): void {
    this._updateState({
      messages: [...this._state.messages, message],
    });
    this._sendFullState();
  }

  /**
   * Clear chat messages
   */
  public clearChatMessages(): void {
    this._updateState({ messages: [] });
    this._sendFullState();
  }

  /**
   * Update quota status
   */
  public updateQuota(status: WebviewQuotaStatus): void {
    this._updateState({ quota: status });
    this.postMessage({
      type: 'quotaUpdated',
      status,
    });
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private _createInitialState(): AppState {
    return {
      messages: [],
      isStreaming: false,
      currentStreamingMessageId: null,
      activeMission: null,
      tasks: [],
      activities: [],
      quota: {
        providers: [],
        totalUsed: 0,
        totalLimit: 100000,
      },
      pendingApprovals: [],
      sidebarTab: 'tasks',
      sidebarCollapsed: false,
      settings: {
        approvalMode: 'step_by_step',
        showQuotaInStatusBar: true,
        notifyOnApprovalRequired: true,
        notifyOnQuotaWarning: true,
        maxDisplayEntries: 100,
        autoResolveSimpleConflicts: true,
      },
      currentError: null,
      rateLimitInfo: null,
    };
  }

  private _updateState(patch: Partial<AppState>): void {
    this._state = { ...this._state, ...patch };
  }

  private _sendFullState(): void {
    this.postMessage({
      type: 'state',
      state: this._state,
    });
  }

  private _setupEventListeners(): void {
    // Listen for mission updates
    this._eventBus.on('mission:created', (event) => {
      const data = event as unknown as { mission: unknown };
      const mission = this._convertMission(data.mission);
      this._updateState({ activeMission: mission });
      this.postMessage({ type: 'missionCreated', mission });
    });

    this._eventBus.on('mission:updated', (event) => {
      const data = event as unknown as { mission: unknown };
      const mission = this._convertMission(data.mission);
      this._updateState({ activeMission: mission });
      this.postMessage({ type: 'missionUpdated', mission });
    });

    // Listen for task updates
    this._eventBus.on('task:created', (event) => {
      const data = event as unknown as { task: unknown };
      const task = this._convertTask(data.task);
      this._updateState({
        tasks: [...this._state.tasks.filter((t) => t.id !== task.id), task],
      });
      this.postMessage({ type: 'taskUpdated', task });
    });

    this._eventBus.on('task:updated', (event) => {
      const data = event as unknown as { task: unknown };
      const task = this._convertTask(data.task);
      this._updateState({
        tasks: this._state.tasks.map((t) => (t.id === task.id ? task : t)),
      });
      this.postMessage({ type: 'taskUpdated', task });
    });

    // Listen for approval events
    this._eventBus.on('approval:requested', (event) => {
      const data = event as unknown as { approval: unknown };
      const approval = this._convertApproval(data.approval);
      this._updateState({
        pendingApprovals: [...this._state.pendingApprovals, approval],
      });
      this.postMessage({ type: 'approvalRequired', approval });
    });

    this._eventBus.on('approval:responded', (event) => {
      const data = event as unknown as { approval: { id: string } };
      this._updateState({
        pendingApprovals: this._state.pendingApprovals.filter(
          (a) => a.id !== data.approval.id
        ),
      });
      this.postMessage({ type: 'approvalResolved', approvalId: data.approval.id });
    });

    // Listen for activity events
    this._eventBus.on('activity:started', (event) => {
      const data = event as unknown as { activity: unknown };
      const activity = this._convertActivity(data.activity);
      this._updateState({
        activities: [activity, ...this._state.activities].slice(0, this._state.settings.maxDisplayEntries),
      });
      this.postMessage({ type: 'activityStarted', activity });
    });

    this._eventBus.on('activity:completed', (event) => {
      const data = event as unknown as { activityId: string; result: string };
      this._updateState({
        activities: this._state.activities.map((a) =>
          a.id === data.activityId ? { ...a, status: 'completed' as const } : a
        ),
      });
      this.postMessage({
        type: 'activityCompleted',
        activityId: data.activityId,
        result: data.result,
      });
    });
  }

  private _handleWebviewMessage(message: WebviewMessage): void {
    switch (message.type) {
      case 'ready':
        this._sendFullState();
        break;

      case 'requestState':
        this._sendFullState();
        break;

      case 'chat:send':
        this._eventBus.emit('chat:message', {
          content: message.content,
          attachments: message.attachments,
        });
        break;

      case 'chat:cancel':
        this.cancelStreaming();
        break;

      case 'chat:clear':
        this.clearChatMessages();
        break;

      case 'approval:respond':
        this._eventBus.emit('approval:respond', {
          approvalId: message.approvalId,
          action: message.action,
        });
        break;

      case 'nav:openFile':
        vscode.commands.executeCommand('vscode.open', vscode.Uri.file(message.path)).then(() => {
          if (message.line) {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
              const position = new vscode.Position(message.line - 1, 0);
              editor.selection = new vscode.Selection(position, position);
              editor.revealRange(new vscode.Range(position, position));
            }
          }
        });
        break;

      case 'settings:setApprovalMode':
        this._updateState({
          settings: { ...this._state.settings, approvalMode: message.mode },
        });
        this._eventBus.emit('settings:approvalMode', { mode: message.mode });
        break;

      case 'nav:showDiff':
        this._showDiff(message.original, message.modified);
        break;
    }
  }

  /**
   * Show a diff view comparing original and modified content
   */
  private async _showDiff(original: string, modified: string): Promise<void> {
    try {
      // Create virtual documents for the diff
      const originalUri = vscode.Uri.parse(`altercode-diff:original`);
      const modifiedUri = vscode.Uri.parse(`altercode-diff:modified`);

      // Register a temporary text document content provider
      const provider = new (class implements vscode.TextDocumentContentProvider {
        private _original: string;
        private _modified: string;

        constructor(original: string, modified: string) {
          this._original = original;
          this._modified = modified;
        }

        provideTextDocumentContent(uri: vscode.Uri): string {
          if (uri.path === 'original') {
            return this._original;
          }
          return this._modified;
        }
      })(original, modified);

      const registration = vscode.workspace.registerTextDocumentContentProvider(
        'altercode-diff',
        provider
      );

      // Open the diff editor
      await vscode.commands.executeCommand(
        'vscode.diff',
        originalUri,
        modifiedUri,
        'AlterCode: Proposed Changes'
      );

      // Clean up registration after a delay
      setTimeout(() => {
        registration.dispose();
      }, 60000); // Keep for 1 minute
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to show diff: ${(error as Error).message}`);
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    // Get URIs for webview assets
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'assets', 'main.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'assets', 'main.css')
    );

    const nonce = this._getNonce();

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource}; img-src ${webview.cspSource} data:;">
    <link href="${styleUri}" rel="stylesheet" />
    <title>AlterCode</title>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
  }

  private _getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  // ============================================================================
  // Type Converters (internal types to webview types)
  // ============================================================================

  private _convertMission(mission: any): WebviewMission {
    return {
      id: mission.id,
      title: mission.title,
      description: mission.description,
      status: mission.status,
      createdAt: mission.createdAt?.toISOString?.() ?? new Date().toISOString(),
      updatedAt: mission.updatedAt?.toISOString?.() ?? new Date().toISOString(),
    };
  }

  private _convertTask(task: any): WebviewTask {
    return {
      id: task.id,
      missionId: task.missionId,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      level: task.level,
      progress: task.progress,
      progressMessage: task.progressMessage,
    };
  }

  private _convertApproval(approval: any): WebviewPendingApproval {
    return {
      id: approval.id,
      taskId: approval.taskId,
      title: approval.title ?? 'Approval Required',
      description: approval.description ?? '',
      changes: (approval.changes ?? []).map((c: any) => ({
        filePath: c.filePath,
        originalContent: c.originalContent,
        modifiedContent: c.modifiedContent,
        diff: c.diff,
        changeType: c.changeType,
      })),
      requestedAt: approval.requestedAt?.toISOString?.() ?? new Date().toISOString(),
    };
  }

  private _convertActivity(activity: any): WebviewActivityEntry {
    return {
      id: activity.id,
      type: activity.type,
      title: activity.title,
      description: activity.description,
      timestamp: activity.timestamp?.toISOString?.() ?? new Date().toISOString(),
      status: activity.status,
      duration: activity.duration,
      metadata: activity.metadata,
    };
  }

  public dispose(): void {
    this._disposables.forEach((d) => d.dispose());
  }
}

/**
 * Factory function to create WebviewProvider
 */
export function createWebviewProvider(
  extensionUri: vscode.Uri,
  eventBus: EventBus
): WebviewProvider {
  return new WebviewProvider(extensionUri, eventBus);
}
