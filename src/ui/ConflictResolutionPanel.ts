/**
 * Conflict Resolution Panel
 *
 * Dedicated webview panel for viewing and resolving merge conflicts:
 * - List of active conflicts
 * - Three-way diff viewer (base, ours, theirs)
 * - Resolution options: Auto-merge, AI-assist, Manual
 * - Apply resolution workflow
 */

import * as vscode from 'vscode';
import {
  MergeConflict,
  MergeResolution,
  IMergeEngineService,
  IEventBus,
  ILogger,
  ConflictId,
} from '../types';

/**
 * Conflict Resolution Panel implementation
 */
export class ConflictResolutionPanel {
  public static currentPanel: ConflictResolutionPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly mergeEngine: IMergeEngineService;
  private readonly eventBus: IEventBus;
  private readonly logger?: ILogger;
  private disposables: vscode.Disposable[] = [];
  private selectedConflictId: ConflictId | null = null;

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    mergeEngine: IMergeEngineService,
    eventBus: IEventBus,
    logger?: ILogger
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.mergeEngine = mergeEngine;
    this.eventBus = eventBus;
    this.logger = logger?.child('ConflictResolutionPanel');

    // Set up panel
    this.panel.webview.html = this.getHtmlContent();

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      (message) => this.handleMessage(message),
      null,
      this.disposables
    );

    // Handle disposal
    this.panel.onDidDispose(
      () => this.dispose(),
      null,
      this.disposables
    );

    // Subscribe to conflict events
    this.subscribeToEvents();

    // Initial update
    this.refreshConflicts();
  }

  /**
   * Create or show the panel
   */
  public static createOrShow(
    extensionUri: vscode.Uri,
    mergeEngine: IMergeEngineService,
    eventBus: IEventBus,
    logger?: ILogger
  ): ConflictResolutionPanel {
    const column = vscode.ViewColumn.Beside;

    // If panel exists, show it
    if (ConflictResolutionPanel.currentPanel) {
      ConflictResolutionPanel.currentPanel.panel.reveal(column);
      ConflictResolutionPanel.currentPanel.refreshConflicts();
      return ConflictResolutionPanel.currentPanel;
    }

    // Create new panel
    const panel = vscode.window.createWebviewPanel(
      'altercodeConflictResolution',
      'Conflict Resolution',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
      }
    );

    ConflictResolutionPanel.currentPanel = new ConflictResolutionPanel(
      panel,
      extensionUri,
      mergeEngine,
      eventBus,
      logger
    );

    return ConflictResolutionPanel.currentPanel;
  }

  /**
   * Refresh conflicts list
   */
  public refreshConflicts(): void {
    const conflicts = this.mergeEngine.getActiveConflicts();
    this.panel.webview.postMessage({
      type: 'conflictsUpdate',
      conflicts: conflicts.map(c => this.serializeConflict(c)),
    });
  }

  /**
   * Select a specific conflict
   */
  public selectConflict(conflictId: ConflictId): void {
    this.selectedConflictId = conflictId;
    const conflict = this.mergeEngine.getConflict(conflictId);
    if (conflict) {
      this.panel.webview.postMessage({
        type: 'conflictSelected',
        conflict: this.serializeConflictDetail(conflict),
      });
    }
  }

  /**
   * Serialize conflict for webview (list view)
   */
  private serializeConflict(conflict: MergeConflict): unknown {
    return {
      id: conflict.id,
      filePath: conflict.filePath,
      branch1AgentId: conflict.branch1.agentId,
      branch2AgentId: conflict.branch2.agentId,
      regionCount: conflict.conflictingRegions.length,
    };
  }

  /**
   * Serialize conflict with full detail for webview
   */
  private serializeConflictDetail(conflict: MergeConflict): unknown {
    const change1 = conflict.branch1.changes.find(c => c.filePath === conflict.filePath);
    const change2 = conflict.branch2.changes.find(c => c.filePath === conflict.filePath);

    return {
      id: conflict.id,
      filePath: conflict.filePath,
      branch1: {
        agentId: conflict.branch1.agentId,
        taskId: conflict.branch1.taskId,
        content: change1?.modifiedContent || '',
      },
      branch2: {
        agentId: conflict.branch2.agentId,
        taskId: conflict.branch2.taskId,
        content: change2?.modifiedContent || '',
      },
      baseContent: conflict.baseContent,
      conflictingRegions: conflict.conflictingRegions.map(r => ({
        name: r.name,
        type: r.type,
        startLine: r.startLine,
        endLine: r.endLine,
      })),
    };
  }

  /**
   * Handle messages from webview
   */
  private async handleMessage(message: { type: string; [key: string]: unknown }): Promise<void> {
    switch (message.type) {
      case 'selectConflict':
        this.selectConflict(message.conflictId as ConflictId);
        break;

      case 'resolveAuto':
        await this.resolveConflict(message.conflictId as ConflictId, 'auto');
        break;

      case 'resolveAI':
        await this.resolveConflict(message.conflictId as ConflictId, 'ai');
        break;

      case 'resolveManual':
        await this.openInEditor(message.conflictId as ConflictId);
        break;

      case 'applyResolution':
        await this.applyManualResolution(
          message.conflictId as ConflictId,
          message.content as string
        );
        break;

      case 'refresh':
        this.refreshConflicts();
        break;

      case 'openFile':
        await this.openFileInEditor(message.filePath as string);
        break;
    }
  }

  /**
   * Resolve conflict with specified strategy
   */
  private async resolveConflict(conflictId: ConflictId, strategy: 'auto' | 'ai'): Promise<void> {
    const conflict = this.mergeEngine.getConflict(conflictId);
    if (!conflict) {
      vscode.window.showErrorMessage('Conflict not found');
      return;
    }

    this.panel.webview.postMessage({ type: 'resolving', conflictId });

    try {
      const result = await this.mergeEngine.resolveConflict(conflict);

      if (result.ok) {
        const resolution = result.value;

        if (resolution.strategy === 'manual') {
          // Auto/AI failed, show in editor
          this.panel.webview.postMessage({
            type: 'resolutionResult',
            conflictId,
            success: false,
            message: 'Automatic resolution failed. Manual resolution required.',
            content: resolution.resolvedContent,
          });
        } else {
          // Apply the resolution
          const applyResult = await this.mergeEngine.applyResolution(resolution);

          if (applyResult.ok) {
            vscode.window.showInformationMessage(
              `Conflict resolved using ${resolution.strategy} strategy`
            );
            this.refreshConflicts();
          } else {
            vscode.window.showErrorMessage(`Failed to apply resolution: ${applyResult.error.message}`);
          }
        }
      } else {
        vscode.window.showErrorMessage(`Resolution failed: ${result.error.message}`);
        this.panel.webview.postMessage({
          type: 'resolutionResult',
          conflictId,
          success: false,
          message: result.error.message,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Resolution error: ${message}`);
    }
  }

  /**
   * Open conflict file in editor for manual resolution
   */
  private async openInEditor(conflictId: ConflictId): Promise<void> {
    const conflict = this.mergeEngine.getConflict(conflictId);
    if (!conflict) return;

    const uri = vscode.Uri.file(conflict.filePath as string);
    await vscode.window.showTextDocument(uri);
  }

  /**
   * Open file in editor
   */
  private async openFileInEditor(filePath: string): Promise<void> {
    const uri = vscode.Uri.file(filePath);
    await vscode.window.showTextDocument(uri);
  }

  /**
   * Apply manual resolution with user-provided content
   */
  private async applyManualResolution(conflictId: ConflictId, content: string): Promise<void> {
    const resolution: MergeResolution = {
      conflictId,
      resolvedContent: content,
      resolvedBy: 'user',
      strategy: 'manual',
    };

    const result = await this.mergeEngine.applyResolution(resolution);

    if (result.ok) {
      vscode.window.showInformationMessage('Manual resolution applied');
      this.refreshConflicts();
    } else {
      vscode.window.showErrorMessage(`Failed to apply: ${result.error.message}`);
    }
  }

  /**
   * Subscribe to conflict events
   */
  private subscribeToEvents(): void {
    this.eventBus.on('conflict:detected', () => {
      this.refreshConflicts();
    });

    this.eventBus.on('conflict:resolved', () => {
      this.refreshConflicts();
    });
  }

  /**
   * Dispose panel
   */
  public dispose(): void {
    ConflictResolutionPanel.currentPanel = undefined;

    this.panel.dispose();

    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  /**
   * Get HTML content for webview
   */
  private getHtmlContent(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Conflict Resolution</title>
  <style>
    :root {
      --bg-primary: var(--vscode-editor-background, #1e1e1e);
      --bg-secondary: var(--vscode-sideBar-background, #252526);
      --bg-tertiary: var(--vscode-input-background, #3c3c3c);
      --text-primary: var(--vscode-editor-foreground, #cccccc);
      --text-secondary: var(--vscode-descriptionForeground, #8b8b8b);
      --text-muted: var(--vscode-disabledForeground, #6b6b6b);
      --border: var(--vscode-widget-border, #454545);
      --accent: var(--vscode-button-background, #0e639c);
      --accent-hover: var(--vscode-button-hoverBackground, #1177bb);
      --success: var(--vscode-terminal-ansiGreen, #4ec9b0);
      --warning: var(--vscode-terminal-ansiYellow, #dcdcaa);
      --error: var(--vscode-terminal-ansiRed, #f14c4c);
      --info: var(--vscode-terminal-ansiBlue, #3794ff);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: var(--bg-primary);
      color: var(--text-primary);
      font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
      font-size: 13px;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* Header */
    .header {
      background: var(--bg-secondary);
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .header-title {
      font-size: 14px;
      font-weight: 600;
    }

    .header-actions {
      display: flex;
      gap: 8px;
    }

    .btn {
      background: var(--accent);
      color: white;
      border: none;
      padding: 6px 12px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 12px;
    }

    .btn:hover { background: var(--accent-hover); }
    .btn.secondary { background: var(--bg-tertiary); color: var(--text-primary); }
    .btn.success { background: var(--success); color: #000; }
    .btn.warning { background: var(--warning); color: #000; }
    .btn.danger { background: var(--error); }

    /* Main Layout */
    .main {
      flex: 1;
      display: flex;
      overflow: hidden;
    }

    /* Conflict List */
    .conflict-list {
      width: 280px;
      background: var(--bg-secondary);
      border-right: 1px solid var(--border);
      overflow-y: auto;
    }

    .conflict-list-header {
      padding: 12px;
      font-weight: 600;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .conflict-count {
      background: var(--error);
      color: white;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
    }

    .conflict-item {
      padding: 12px;
      border-bottom: 1px solid var(--border);
      cursor: pointer;
      transition: background 0.1s;
    }

    .conflict-item:hover { background: var(--bg-tertiary); }
    .conflict-item.selected { background: var(--accent); }

    .conflict-file {
      font-weight: 500;
      margin-bottom: 4px;
      word-break: break-all;
    }

    .conflict-meta {
      font-size: 11px;
      color: var(--text-secondary);
    }

    .conflict-agents {
      display: flex;
      gap: 8px;
      margin-top: 4px;
    }

    .agent-badge {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 3px;
      background: var(--bg-tertiary);
    }

    /* Detail Panel */
    .detail-panel {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .detail-header {
      padding: 12px 16px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .detail-file {
      font-weight: 600;
    }

    .resolution-actions {
      display: flex;
      gap: 8px;
    }

    /* Three-way diff */
    .diff-container {
      flex: 1;
      display: flex;
      overflow: hidden;
    }

    .diff-pane {
      flex: 1;
      display: flex;
      flex-direction: column;
      border-right: 1px solid var(--border);
      overflow: hidden;
    }

    .diff-pane:last-child { border-right: none; }

    .diff-pane-header {
      padding: 8px 12px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border);
      font-weight: 500;
      font-size: 12px;
    }

    .diff-pane-header.base { color: var(--text-secondary); }
    .diff-pane-header.ours { color: var(--success); }
    .diff-pane-header.theirs { color: var(--info); }

    .diff-content {
      flex: 1;
      overflow: auto;
      padding: 8px;
      font-family: var(--vscode-editor-font-family, 'Consolas', monospace);
      font-size: 12px;
      white-space: pre-wrap;
      word-break: break-all;
    }

    /* Conflict regions */
    .regions-panel {
      padding: 12px;
      background: var(--bg-secondary);
      border-top: 1px solid var(--border);
    }

    .regions-title {
      font-weight: 600;
      margin-bottom: 8px;
    }

    .region-item {
      display: flex;
      gap: 8px;
      padding: 4px 0;
      font-size: 12px;
    }

    .region-type {
      padding: 2px 6px;
      background: var(--bg-tertiary);
      border-radius: 3px;
      font-size: 10px;
    }

    /* Empty state */
    .empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: var(--text-secondary);
    }

    .empty-state-title {
      font-size: 16px;
      margin-bottom: 8px;
    }

    .empty-state-subtitle {
      font-size: 12px;
      color: var(--text-muted);
    }

    /* Loading */
    .loading {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px;
    }

    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Manual edit */
    .manual-edit {
      display: none;
      flex-direction: column;
      flex: 1;
      overflow: hidden;
    }

    .manual-edit.active { display: flex; }

    .manual-edit-header {
      padding: 12px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .manual-textarea {
      flex: 1;
      background: var(--bg-primary);
      color: var(--text-primary);
      border: none;
      padding: 12px;
      font-family: var(--vscode-editor-font-family, 'Consolas', monospace);
      font-size: 12px;
      resize: none;
    }

    .manual-textarea:focus { outline: none; }
  </style>
</head>
<body>
  <div class="header">
    <span class="header-title">Conflict Resolution</span>
    <div class="header-actions">
      <button class="btn secondary" onclick="refresh()">Refresh</button>
    </div>
  </div>

  <div class="main">
    <div class="conflict-list">
      <div class="conflict-list-header">
        <span>Conflicts</span>
        <span class="conflict-count" id="conflictCount">0</span>
      </div>
      <div id="conflictListItems"></div>
    </div>

    <div class="detail-panel" id="detailPanel">
      <div class="empty-state" id="emptyState">
        <div class="empty-state-title">No conflict selected</div>
        <div class="empty-state-subtitle">Select a conflict from the list to view details</div>
      </div>

      <div id="conflictDetail" style="display: none; flex: 1; flex-direction: column;">
        <div class="detail-header">
          <span class="detail-file" id="detailFile">-</span>
          <div class="resolution-actions">
            <button class="btn success" onclick="resolveAuto()" id="btnAuto">Auto Merge</button>
            <button class="btn warning" onclick="resolveAI()" id="btnAI">AI Assist</button>
            <button class="btn secondary" onclick="resolveManual()" id="btnManual">Manual</button>
          </div>
        </div>

        <div class="diff-container" id="diffContainer">
          <div class="diff-pane">
            <div class="diff-pane-header base">Base (Original)</div>
            <div class="diff-content" id="diffBase"></div>
          </div>
          <div class="diff-pane">
            <div class="diff-pane-header ours">Ours (Agent 1)</div>
            <div class="diff-content" id="diffOurs"></div>
          </div>
          <div class="diff-pane">
            <div class="diff-pane-header theirs">Theirs (Agent 2)</div>
            <div class="diff-content" id="diffTheirs"></div>
          </div>
        </div>

        <div class="manual-edit" id="manualEdit">
          <div class="manual-edit-header">
            <span>Manual Resolution</span>
            <div>
              <button class="btn secondary" onclick="cancelManual()">Cancel</button>
              <button class="btn success" onclick="applyManual()">Apply Resolution</button>
            </div>
          </div>
          <textarea class="manual-textarea" id="manualTextarea" placeholder="Edit the resolved content here..."></textarea>
        </div>

        <div class="regions-panel" id="regionsPanel">
          <div class="regions-title">Conflicting Regions</div>
          <div id="regionsList"></div>
        </div>
      </div>

      <div id="loadingState" style="display: none;" class="loading">
        <div class="spinner"></div>
        <span>Resolving conflict...</span>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    let conflicts = [];
    let selectedConflict = null;
    let isResolving = false;

    // Handle messages from extension
    window.addEventListener('message', event => {
      const message = event.data;

      switch (message.type) {
        case 'conflictsUpdate':
          conflicts = message.conflicts || [];
          renderConflictList();
          break;

        case 'conflictSelected':
          selectedConflict = message.conflict;
          renderConflictDetail();
          break;

        case 'resolving':
          showLoading(true);
          break;

        case 'resolutionResult':
          showLoading(false);
          if (!message.success && message.content) {
            // Show in manual edit mode
            showManualEdit(message.content);
          }
          break;
      }
    });

    function renderConflictList() {
      const container = document.getElementById('conflictListItems');
      document.getElementById('conflictCount').textContent = conflicts.length.toString();

      if (conflicts.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-subtitle">No active conflicts</div></div>';
        return;
      }

      container.innerHTML = conflicts.map(c => {
        const isSelected = selectedConflict && selectedConflict.id === c.id;
        const fileName = c.filePath.split(/[\\/]/).pop();

        return \`
          <div class="conflict-item \${isSelected ? 'selected' : ''}" onclick="selectConflict('\${c.id}')">
            <div class="conflict-file">\${escapeHtml(fileName)}</div>
            <div class="conflict-meta">\${c.regionCount} conflicting region(s)</div>
            <div class="conflict-agents">
              <span class="agent-badge">\${escapeHtml(c.branch1AgentId)}</span>
              <span>vs</span>
              <span class="agent-badge">\${escapeHtml(c.branch2AgentId)}</span>
            </div>
          </div>
        \`;
      }).join('');
    }

    function renderConflictDetail() {
      const emptyState = document.getElementById('emptyState');
      const detail = document.getElementById('conflictDetail');
      const manualEdit = document.getElementById('manualEdit');

      if (!selectedConflict) {
        emptyState.style.display = 'flex';
        detail.style.display = 'none';
        return;
      }

      emptyState.style.display = 'none';
      detail.style.display = 'flex';
      manualEdit.classList.remove('active');
      document.getElementById('diffContainer').style.display = 'flex';

      // Set file name
      document.getElementById('detailFile').textContent = selectedConflict.filePath;

      // Set diff content
      document.getElementById('diffBase').textContent = selectedConflict.baseContent || '(empty)';
      document.getElementById('diffOurs').textContent = selectedConflict.branch1.content || '(empty)';
      document.getElementById('diffTheirs').textContent = selectedConflict.branch2.content || '(empty)';

      // Update headers with agent IDs
      const oursHeader = document.querySelector('.diff-pane-header.ours');
      const theirsHeader = document.querySelector('.diff-pane-header.theirs');
      oursHeader.textContent = \`Ours (\${selectedConflict.branch1.agentId})\`;
      theirsHeader.textContent = \`Theirs (\${selectedConflict.branch2.agentId})\`;

      // Render regions
      const regionsContainer = document.getElementById('regionsList');
      if (selectedConflict.conflictingRegions && selectedConflict.conflictingRegions.length > 0) {
        regionsContainer.innerHTML = selectedConflict.conflictingRegions.map(r => \`
          <div class="region-item">
            <span class="region-type">\${r.type}</span>
            <span>\${escapeHtml(r.name)}</span>
            <span style="color: var(--text-muted);">lines \${r.startLine}-\${r.endLine}</span>
          </div>
        \`).join('');
      } else {
        regionsContainer.innerHTML = '<div style="color: var(--text-muted);">No specific regions identified</div>';
      }

      // Update list selection
      renderConflictList();
    }

    function selectConflict(id) {
      vscode.postMessage({ type: 'selectConflict', conflictId: id });
    }

    function resolveAuto() {
      if (!selectedConflict || isResolving) return;
      vscode.postMessage({ type: 'resolveAuto', conflictId: selectedConflict.id });
    }

    function resolveAI() {
      if (!selectedConflict || isResolving) return;
      vscode.postMessage({ type: 'resolveAI', conflictId: selectedConflict.id });
    }

    function resolveManual() {
      if (!selectedConflict) return;
      vscode.postMessage({ type: 'resolveManual', conflictId: selectedConflict.id });
    }

    function showManualEdit(content) {
      document.getElementById('diffContainer').style.display = 'none';
      document.getElementById('regionsPanel').style.display = 'none';
      const manualEdit = document.getElementById('manualEdit');
      manualEdit.classList.add('active');
      document.getElementById('manualTextarea').value = content;
    }

    function cancelManual() {
      document.getElementById('diffContainer').style.display = 'flex';
      document.getElementById('regionsPanel').style.display = 'block';
      document.getElementById('manualEdit').classList.remove('active');
    }

    function applyManual() {
      if (!selectedConflict) return;
      const content = document.getElementById('manualTextarea').value;
      vscode.postMessage({
        type: 'applyResolution',
        conflictId: selectedConflict.id,
        content: content,
      });
    }

    function refresh() {
      vscode.postMessage({ type: 'refresh' });
    }

    function showLoading(show) {
      isResolving = show;
      document.getElementById('loadingState').style.display = show ? 'flex' : 'none';
      document.getElementById('btnAuto').disabled = show;
      document.getElementById('btnAI').disabled = show;
      document.getElementById('btnManual').disabled = show;
    }

    function escapeHtml(text) {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Initial render
    renderConflictList();
  </script>
</body>
</html>`;
  }
}

/**
 * Create conflict resolution panel
 */
export function createConflictResolutionPanel(
  extensionUri: vscode.Uri,
  mergeEngine: IMergeEngineService,
  eventBus: IEventBus,
  logger?: ILogger
): ConflictResolutionPanel {
  return ConflictResolutionPanel.createOrShow(extensionUri, mergeEngine, eventBus, logger);
}
