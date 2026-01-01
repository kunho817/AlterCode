/**
 * Mission Control Panel
 *
 * VS Code WebView panel for mission visualization:
 * - Mission status display
 * - Task progress tracking
 * - Agent activity monitoring
 * - Impact analysis visualization
 */

import * as vscode from 'vscode';
import {
  HiveState,
  Mission,
  MissionProgress,
  Task,
  IEventBus,
  ILogger,
} from '../types';

/**
 * Mission Control Panel implementation
 */
export class MissionControlPanel {
  public static currentPanel: MissionControlPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly eventBus: IEventBus;
  private readonly logger?: ILogger;
  private disposables: vscode.Disposable[] = [];
  private state: HiveState | null = null;

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    eventBus: IEventBus,
    logger?: ILogger
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.eventBus = eventBus;
    this.logger = logger?.child('MissionControlPanel');

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

    // Subscribe to events
    this.subscribeToEvents();
  }

  /**
   * Create or show the panel
   */
  public static createOrShow(
    extensionUri: vscode.Uri,
    eventBus: IEventBus,
    logger?: ILogger
  ): MissionControlPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If panel exists, show it
    if (MissionControlPanel.currentPanel) {
      MissionControlPanel.currentPanel.panel.reveal(column);
      return MissionControlPanel.currentPanel;
    }

    // Create new panel
    const panel = vscode.window.createWebviewPanel(
      'altercodeMissionControl',
      'AlterCode Mission Control',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
      }
    );

    MissionControlPanel.currentPanel = new MissionControlPanel(
      panel,
      extensionUri,
      eventBus,
      logger
    );

    return MissionControlPanel.currentPanel;
  }

  /**
   * Update state and refresh UI
   */
  public updateState(state: HiveState): void {
    this.state = state;
    this.panel.webview.postMessage({
      type: 'stateUpdate',
      payload: state,
    });
  }

  /**
   * Handle messages from webview
   */
  private handleMessage(message: any): void {
    switch (message.type) {
      case 'cancelMission':
        this.eventBus.emit('ui:cancelMission', { missionId: message.missionId });
        break;

      case 'retryTask':
        this.eventBus.emit('ui:retryTask', { taskId: message.taskId });
        break;

      case 'viewDetails':
        this.eventBus.emit('ui:viewDetails', { type: message.detailType, id: message.id });
        break;

      case 'refresh':
        this.eventBus.emit('ui:refresh', {});
        break;

      default:
        this.logger?.warn('Unknown message type', { type: message.type });
    }
  }

  /**
   * Subscribe to core events
   */
  private subscribeToEvents(): void {
    this.eventBus.on('mission:created', async (event) => {
      const { mission } = event as unknown as { mission: Mission };
      this.panel.webview.postMessage({
        type: 'missionCreated',
        payload: mission,
      });
    });

    this.eventBus.on('mission:progressUpdated', async (event) => {
      const { missionId, progress } = event as unknown as { missionId: string; progress: MissionProgress };
      this.panel.webview.postMessage({
        type: 'progressUpdate',
        payload: { missionId, progress },
      });
    });

    this.eventBus.on('task:started', async (event) => {
      const { task } = event as unknown as { task: Task };
      this.panel.webview.postMessage({
        type: 'taskStarted',
        payload: task,
      });
    });

    this.eventBus.on('task:completed', async (event) => {
      const { task, result } = event as unknown as { task: Task; result: unknown };
      this.panel.webview.postMessage({
        type: 'taskCompleted',
        payload: { task, result },
      });
    });

    this.eventBus.on('execution:warnings', async (event) => {
      const { warnings } = event as unknown as { warnings: string[] };
      this.panel.webview.postMessage({
        type: 'warnings',
        payload: warnings,
      });
    });
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
  <title>Mission Control</title>
  <style>
    :root {
      --bg-primary: var(--vscode-editor-background);
      --bg-secondary: var(--vscode-sideBar-background);
      --text-primary: var(--vscode-editor-foreground);
      --text-secondary: var(--vscode-descriptionForeground);
      --accent: var(--vscode-button-background);
      --border: var(--vscode-panel-border);
      --success: #4caf50;
      --warning: #ff9800;
      --error: #f44336;
      --info: #2196f3;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--text-primary);
      background: var(--bg-primary);
      padding: 16px;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }

    .header h1 {
      font-size: 18px;
      font-weight: 500;
    }

    .header-actions button {
      background: var(--accent);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 12px;
      margin-bottom: 20px;
    }

    .stat-card {
      background: var(--bg-secondary);
      padding: 12px;
      border-radius: 6px;
      text-align: center;
    }

    .stat-value {
      font-size: 24px;
      font-weight: bold;
      color: var(--accent);
    }

    .stat-label {
      font-size: 11px;
      color: var(--text-secondary);
      margin-top: 4px;
    }

    .section {
      margin-bottom: 20px;
    }

    .section-header {
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .mission-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .mission-card {
      background: var(--bg-secondary);
      border-radius: 6px;
      padding: 12px;
      border-left: 3px solid var(--accent);
    }

    .mission-card.active {
      border-left-color: var(--success);
    }

    .mission-card.failed {
      border-left-color: var(--error);
    }

    .mission-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 8px;
    }

    .mission-title {
      font-weight: 500;
      font-size: 13px;
    }

    .mission-status {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 10px;
      background: var(--accent);
      color: white;
    }

    .mission-status.active { background: var(--success); }
    .mission-status.failed { background: var(--error); }
    .mission-status.cancelled { background: var(--warning); }

    .progress-bar {
      height: 4px;
      background: var(--border);
      border-radius: 2px;
      overflow: hidden;
      margin: 8px 0;
    }

    .progress-fill {
      height: 100%;
      background: var(--accent);
      transition: width 0.3s ease;
    }

    .mission-meta {
      display: flex;
      gap: 12px;
      font-size: 11px;
      color: var(--text-secondary);
    }

    .task-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
      max-height: 200px;
      overflow-y: auto;
    }

    .task-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      background: var(--bg-secondary);
      border-radius: 4px;
      font-size: 12px;
    }

    .task-status-icon {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--text-secondary);
    }

    .task-status-icon.running {
      background: var(--info);
      animation: pulse 1s infinite;
    }

    .task-status-icon.completed { background: var(--success); }
    .task-status-icon.failed { background: var(--error); }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .empty-state {
      text-align: center;
      padding: 40px 20px;
      color: var(--text-secondary);
    }

    .empty-state svg {
      width: 48px;
      height: 48px;
      opacity: 0.5;
      margin-bottom: 12px;
    }

    .warnings-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .warning-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
      background: rgba(255, 152, 0, 0.1);
      border-radius: 4px;
      font-size: 12px;
      color: var(--warning);
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🐝 Mission Control</h1>
    <div class="header-actions">
      <button onclick="refresh()">Refresh</button>
    </div>
  </div>

  <div class="stats-grid" id="stats">
    <div class="stat-card">
      <div class="stat-value" id="activeMissions">0</div>
      <div class="stat-label">Active Missions</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" id="completedMissions">0</div>
      <div class="stat-label">Completed</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" id="runningTasks">0</div>
      <div class="stat-label">Running Tasks</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" id="totalTasks">0</div>
      <div class="stat-label">Total Tasks</div>
    </div>
  </div>

  <div class="section">
    <div class="section-header">Active Missions</div>
    <div class="mission-list" id="missionList">
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
        <div>No active missions</div>
        <div style="font-size: 11px; margin-top: 4px;">Start a new mission to see it here</div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-header">Recent Tasks</div>
    <div class="task-list" id="taskList">
      <div class="empty-state" style="padding: 20px;">
        <div>No tasks yet</div>
      </div>
    </div>
  </div>

  <div class="section" id="warningsSection" style="display: none;">
    <div class="section-header">⚠️ Warnings</div>
    <div class="warnings-list" id="warningsList"></div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    let state = {
      activeMissions: [],
      stats: { missions: { total: 0, active: 0, completed: 0 } },
      tasks: [],
      warnings: []
    };

    // Handle messages from extension
    window.addEventListener('message', event => {
      const message = event.data;

      switch (message.type) {
        case 'stateUpdate':
          state = message.payload;
          updateUI();
          break;

        case 'missionCreated':
          state.activeMissions.push(message.payload);
          updateUI();
          break;

        case 'progressUpdate':
          updateMissionProgress(message.payload);
          break;

        case 'taskStarted':
        case 'taskCompleted':
          updateTaskList(message.payload);
          break;

        case 'warnings':
          state.warnings = message.payload;
          updateWarnings();
          break;
      }
    });

    function updateUI() {
      // Update stats
      document.getElementById('activeMissions').textContent = state.stats?.missions?.active ?? 0;
      document.getElementById('completedMissions').textContent = state.stats?.missions?.completed ?? 0;
      document.getElementById('runningTasks').textContent = state.tasks?.filter(t => t.status === 'running').length ?? 0;
      document.getElementById('totalTasks').textContent = state.tasks?.length ?? 0;

      // Update mission list
      const missionList = document.getElementById('missionList');
      if (state.activeMissions && state.activeMissions.length > 0) {
        missionList.innerHTML = state.activeMissions.map(renderMission).join('');
      } else {
        missionList.innerHTML = renderEmptyState();
      }

      // Update task list
      const taskList = document.getElementById('taskList');
      if (state.tasks && state.tasks.length > 0) {
        taskList.innerHTML = state.tasks.slice(0, 10).map(renderTask).join('');
      }
    }

    function renderMission(mission) {
      const progress = mission.progress?.overallProgress ?? 0;
      return \`
        <div class="mission-card \${mission.status}">
          <div class="mission-header">
            <div class="mission-title">\${escapeHtml(mission.title)}</div>
            <span class="mission-status \${mission.status}">\${mission.status}</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: \${progress}%"></div>
          </div>
          <div class="mission-meta">
            <span>Phase: \${mission.phase}</span>
            <span>Progress: \${Math.round(progress)}%</span>
          </div>
        </div>
      \`;
    }

    function renderTask(task) {
      return \`
        <div class="task-item">
          <div class="task-status-icon \${task.status}"></div>
          <span>\${escapeHtml(task.description)}</span>
        </div>
      \`;
    }

    function renderEmptyState() {
      return \`
        <div class="empty-state">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
          <div>No active missions</div>
          <div style="font-size: 11px; margin-top: 4px;">Start a new mission to see it here</div>
        </div>
      \`;
    }

    function updateMissionProgress({ missionId, progress }) {
      const mission = state.activeMissions.find(m => m.id === missionId);
      if (mission) {
        mission.progress = progress;
        updateUI();
      }
    }

    function updateTaskList(payload) {
      const task = payload.task || payload;
      const existingIndex = state.tasks?.findIndex(t => t.id === task.id) ?? -1;

      if (existingIndex >= 0) {
        state.tasks[existingIndex] = task;
      } else {
        state.tasks = state.tasks || [];
        state.tasks.unshift(task);
      }

      updateUI();
    }

    function updateWarnings() {
      const section = document.getElementById('warningsSection');
      const list = document.getElementById('warningsList');

      if (state.warnings.length > 0) {
        section.style.display = 'block';
        list.innerHTML = state.warnings.map(w => \`
          <div class="warning-item">⚠️ \${escapeHtml(w)}</div>
        \`).join('');
      } else {
        section.style.display = 'none';
      }
    }

    function refresh() {
      vscode.postMessage({ type: 'refresh' });
    }

    function cancelMission(missionId) {
      vscode.postMessage({ type: 'cancelMission', missionId });
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Initial UI update
    updateUI();
  </script>
</body>
</html>`;
  }

  /**
   * Dispose the panel
   */
  public dispose(): void {
    MissionControlPanel.currentPanel = undefined;

    this.panel.dispose();

    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
