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

      case 'exportActivity':
        this.exportActivityToJson(message.activities);
        break;

      case 'approveTask':
        vscode.commands.executeCommand('altercode.showPendingApprovals');
        break;

      case 'setApprovalMode':
        vscode.commands.executeCommand('altercode.setApprovalMode');
        break;

      default:
        this.logger?.warn('Unknown message type', { type: message.type });
    }
  }

  /**
   * Export activity data to JSON file
   */
  private async exportActivityToJson(activities: unknown[]): Promise<void> {
    const content = JSON.stringify(activities, null, 2);
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file('altercode-activity.json'),
      filters: { 'JSON': ['json'] },
    });

    if (uri) {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
      vscode.window.showInformationMessage(`Activity exported to ${uri.fsPath}`);
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
      --input-bg: var(--vscode-input-background);
      --input-border: var(--vscode-input-border);
      --success: #4caf50;
      --warning: #ff9800;
      --error: #f44336;
      --info: #2196f3;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

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
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }

    .header h1 { font-size: 18px; font-weight: 500; }

    .header-actions button {
      background: var(--accent);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }

    /* Tab Navigation */
    .tabs {
      display: flex;
      gap: 0;
      margin-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }

    .tab {
      padding: 8px 16px;
      cursor: pointer;
      border: none;
      background: transparent;
      color: var(--text-secondary);
      font-size: 13px;
      border-bottom: 2px solid transparent;
      transition: all 0.2s;
    }

    .tab:hover { color: var(--text-primary); }
    .tab.active {
      color: var(--accent);
      border-bottom-color: var(--accent);
    }

    .tab-content { display: none; }
    .tab-content.active { display: block; }

    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
      gap: 12px;
      margin-bottom: 20px;
    }

    .stat-card {
      background: var(--bg-secondary);
      padding: 12px;
      border-radius: 6px;
      text-align: center;
    }

    .stat-value { font-size: 24px; font-weight: bold; color: var(--accent); }
    .stat-label { font-size: 11px; color: var(--text-secondary); margin-top: 4px; }

    /* Section */
    .section { margin-bottom: 20px; }
    .section-header {
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    /* Mission Cards */
    .mission-list { display: flex; flex-direction: column; gap: 8px; }
    .mission-card {
      background: var(--bg-secondary);
      border-radius: 6px;
      padding: 12px;
      border-left: 3px solid var(--accent);
    }
    .mission-card.active { border-left-color: var(--success); }
    .mission-card.failed { border-left-color: var(--error); }

    .mission-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 8px;
    }
    .mission-title { font-weight: 500; font-size: 13px; }
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

    /* Task List */
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
      flex-shrink: 0;
    }
    .task-status-icon.running { background: var(--info); animation: pulse 1s infinite; }
    .task-status-icon.completed { background: var(--success); }
    .task-status-icon.failed { background: var(--error); }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    /* Empty State */
    .empty-state {
      text-align: center;
      padding: 40px 20px;
      color: var(--text-secondary);
    }
    .empty-state svg { width: 48px; height: 48px; opacity: 0.5; margin-bottom: 12px; }

    /* Warnings */
    .warnings-list { display: flex; flex-direction: column; gap: 4px; }
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

    /* Activity Tab Styles */
    .activity-controls {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }

    .activity-controls select,
    .activity-controls input {
      background: var(--input-bg);
      border: 1px solid var(--input-border);
      color: var(--text-primary);
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
    }

    .activity-controls input { flex: 1; min-width: 150px; }

    .activity-controls button {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      color: var(--text-primary);
      padding: 4px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }
    .activity-controls button:hover { background: var(--accent); }

    .activity-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 400px;
      overflow-y: auto;
    }

    .activity-item {
      background: var(--bg-secondary);
      border-radius: 6px;
      padding: 10px;
      font-size: 12px;
    }

    .activity-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 6px;
    }

    .activity-agent {
      font-weight: 500;
      color: var(--accent);
    }

    .activity-time { color: var(--text-secondary); font-size: 11px; }

    .activity-content {
      color: var(--text-secondary);
      font-size: 11px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .activity-metrics {
      display: flex;
      gap: 12px;
      margin-top: 6px;
      font-size: 10px;
      color: var(--text-secondary);
    }

    /* Quota Section */
    .quota-section {
      background: var(--bg-secondary);
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 16px;
    }

    .quota-provider {
      margin-bottom: 12px;
    }

    .quota-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }

    .quota-name { font-weight: 500; font-size: 13px; }
    .quota-percentage { font-size: 12px; color: var(--accent); }

    .quota-bar {
      height: 8px;
      background: var(--border);
      border-radius: 4px;
      overflow: hidden;
    }

    .quota-fill {
      height: 100%;
      transition: width 0.3s ease;
    }
    .quota-fill.ok { background: var(--success); }
    .quota-fill.warning { background: var(--warning); }
    .quota-fill.critical, .quota-fill.exceeded { background: var(--error); }

    .quota-meta {
      display: flex;
      gap: 12px;
      margin-top: 6px;
      font-size: 10px;
      color: var(--text-secondary);
    }

    /* Approval Badge */
    .approval-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: var(--warning);
      color: white;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 10px;
      cursor: pointer;
    }

    /* Settings Section */
    .settings-section { margin-bottom: 20px; }
    .settings-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px;
      background: var(--bg-secondary);
      border-radius: 4px;
      margin-bottom: 8px;
    }
    .settings-label { font-size: 12px; }
    .settings-value {
      font-size: 11px;
      color: var(--text-secondary);
      background: var(--input-bg);
      padding: 2px 8px;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Mission Control</h1>
    <div class="header-actions">
      <button onclick="refresh()">Refresh</button>
    </div>
  </div>

  <div class="tabs">
    <button class="tab active" onclick="switchTab('missions')">Missions</button>
    <button class="tab" onclick="switchTab('activity')">Activity</button>
    <button class="tab" onclick="switchTab('settings')">Settings</button>
  </div>

  <!-- Missions Tab -->
  <div id="missions-tab" class="tab-content active">
    <div class="stats-grid" id="stats">
      <div class="stat-card">
        <div class="stat-value" id="activeMissions">0</div>
        <div class="stat-label">Active</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="completedMissions">0</div>
        <div class="stat-label">Completed</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="runningTasks">0</div>
        <div class="stat-label">Running</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="pendingApprovals">0</div>
        <div class="stat-label">Approvals</div>
      </div>
    </div>

    <div class="section" id="approvalsSection" style="display: none;">
      <div class="section-header">
        Pending Approvals
        <span class="approval-badge" onclick="showApprovals()">Review All</span>
      </div>
      <div class="task-list" id="approvalsList"></div>
    </div>

    <div class="section">
      <div class="section-header">Active Missions</div>
      <div class="mission-list" id="missionList"></div>
    </div>

    <div class="section">
      <div class="section-header">Recent Tasks</div>
      <div class="task-list" id="taskList"></div>
    </div>

    <div class="section" id="warningsSection" style="display: none;">
      <div class="section-header">Warnings</div>
      <div class="warnings-list" id="warningsList"></div>
    </div>
  </div>

  <!-- Activity Tab -->
  <div id="activity-tab" class="tab-content">
    <div class="activity-controls">
      <select id="activityFilter" onchange="filterActivity()">
        <option value="all">All Activities</option>
        <option value="thinking">Thinking</option>
        <option value="completed">Completed</option>
        <option value="failed">Failed</option>
      </select>
      <input type="text" id="activitySearch" placeholder="Search activities..." oninput="filterActivity()">
      <button onclick="exportActivity()">Export JSON</button>
    </div>

    <div class="section">
      <div class="section-header">
        <span>Activity Log</span>
        <span id="activityCount" style="font-size: 11px; color: var(--text-secondary);">0 entries</span>
      </div>
      <div class="activity-list" id="activityList"></div>
    </div>

    <div class="section">
      <div class="section-header">Performance Summary</div>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value" id="avgDuration">0s</div>
          <div class="stat-label">Avg Duration</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="totalTokens">0</div>
          <div class="stat-label">Total Tokens</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="successRate">0%</div>
          <div class="stat-label">Success Rate</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Settings Tab -->
  <div id="settings-tab" class="tab-content">
    <div class="section">
      <div class="section-header">API Quota</div>
      <div class="quota-section" id="quotaSection">
        <div class="quota-provider">
          <div class="quota-header">
            <span class="quota-name">Claude</span>
            <span class="quota-percentage" id="claudeQuotaPercent">0%</span>
          </div>
          <div class="quota-bar">
            <div class="quota-fill ok" id="claudeQuotaBar" style="width: 0%"></div>
          </div>
          <div class="quota-meta">
            <span id="claudeQuotaCalls">0 calls</span>
            <span id="claudeQuotaReset">Resets in: --</span>
          </div>
        </div>
        <div class="quota-provider">
          <div class="quota-header">
            <span class="quota-name">GLM</span>
            <span class="quota-percentage" id="glmQuotaPercent">0%</span>
          </div>
          <div class="quota-bar">
            <div class="quota-fill ok" id="glmQuotaBar" style="width: 0%"></div>
          </div>
          <div class="quota-meta">
            <span id="glmQuotaCalls">0 calls</span>
            <span id="glmQuotaReset">Resets in: --</span>
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-header">Approval Mode</div>
      <div class="settings-item">
        <span class="settings-label">Current Mode</span>
        <span class="settings-value" id="approvalMode">step_by_step</span>
      </div>
      <button onclick="changeApprovalMode()" style="width: 100%; margin-top: 8px;">
        Change Mode
      </button>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    let state = {
      activeMissions: [],
      stats: { missions: { total: 0, active: 0, completed: 0 } },
      tasks: [],
      warnings: [],
      activities: [],
      quota: null,
      pendingApprovals: [],
      approvalMode: 'step_by_step'
    };

    let activityFilter = 'all';
    let activitySearchTerm = '';

    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.type) {
        case 'stateUpdate':
          state = { ...state, ...message.payload };
          updateAllUI();
          break;
        case 'missionCreated':
          state.activeMissions = state.activeMissions || [];
          state.activeMissions.push(message.payload);
          updateMissionsUI();
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
        case 'activityUpdate':
          state.activities = message.payload;
          updateActivityUI();
          break;
      }
    });

    function switchTab(tabName) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      document.querySelector(\`[onclick="switchTab('\${tabName}')"]\`).classList.add('active');
      document.getElementById(\`\${tabName}-tab\`).classList.add('active');
    }

    function updateAllUI() {
      updateMissionsUI();
      updateActivityUI();
      updateSettingsUI();
    }

    function updateMissionsUI() {
      document.getElementById('activeMissions').textContent = state.stats?.missions?.active ?? 0;
      document.getElementById('completedMissions').textContent = state.stats?.missions?.completed ?? 0;
      document.getElementById('runningTasks').textContent = state.tasks?.filter(t => t.status === 'running').length ?? 0;
      document.getElementById('pendingApprovals').textContent = state.pendingApprovals?.length ?? 0;

      const missionList = document.getElementById('missionList');
      if (state.activeMissions?.length > 0) {
        missionList.innerHTML = state.activeMissions.map(renderMission).join('');
      } else {
        missionList.innerHTML = renderEmptyState('No active missions', 'Start a new mission');
      }

      const taskList = document.getElementById('taskList');
      if (state.tasks?.length > 0) {
        taskList.innerHTML = state.tasks.slice(0, 10).map(renderTask).join('');
      } else {
        taskList.innerHTML = renderEmptyState('No tasks yet', '');
      }

      // Approvals section
      const approvalsSection = document.getElementById('approvalsSection');
      if (state.pendingApprovals?.length > 0) {
        approvalsSection.style.display = 'block';
        document.getElementById('approvalsList').innerHTML = state.pendingApprovals.map(a => \`
          <div class="task-item">
            <div class="task-status-icon" style="background: var(--warning);"></div>
            <span>\${escapeHtml(a.taskId || 'Pending')}: \${a.changes?.length ?? 0} changes</span>
            <span class="approval-badge" onclick="showApprovals()">Review</span>
          </div>
        \`).join('');
      } else {
        approvalsSection.style.display = 'none';
      }

      updateWarnings();
    }

    function updateActivityUI() {
      const activities = filterActivities(state.activities || []);
      document.getElementById('activityCount').textContent = \`\${activities.length} entries\`;

      const activityList = document.getElementById('activityList');
      if (activities.length > 0) {
        activityList.innerHTML = activities.slice(0, 50).map(renderActivity).join('');
      } else {
        activityList.innerHTML = renderEmptyState('No activities', '');
      }

      // Performance summary
      const completedActivities = (state.activities || []).filter(a => a.status === 'completed');
      const avgDuration = completedActivities.length > 0
        ? completedActivities.reduce((sum, a) => sum + (a.durationMs || 0), 0) / completedActivities.length / 1000
        : 0;
      const totalTokens = (state.activities || []).reduce((sum, a) => sum + (a.tokensUsed || 0), 0);
      const successRate = state.activities?.length > 0
        ? (completedActivities.length / state.activities.length * 100)
        : 0;

      document.getElementById('avgDuration').textContent = avgDuration.toFixed(1) + 's';
      document.getElementById('totalTokens').textContent = formatNumber(totalTokens);
      document.getElementById('successRate').textContent = successRate.toFixed(0) + '%';
    }

    function updateSettingsUI() {
      // Quota
      if (state.quota) {
        updateQuotaDisplay('claude', state.quota.claude);
        updateQuotaDisplay('glm', state.quota.glm);
      }

      // Approval mode
      document.getElementById('approvalMode').textContent = state.approvalMode || 'step_by_step';
    }

    function updateQuotaDisplay(provider, quotaStatus) {
      if (!quotaStatus) return;
      const percent = (quotaStatus.usageRatio * 100).toFixed(0);
      const status = quotaStatus.status || 'ok';

      document.getElementById(\`\${provider}QuotaPercent\`).textContent = percent + '%';

      const bar = document.getElementById(\`\${provider}QuotaBar\`);
      bar.style.width = percent + '%';
      bar.className = 'quota-fill ' + status;

      document.getElementById(\`\${provider}QuotaCalls\`).textContent =
        (quotaStatus.currentWindow?.usage?.callCount ?? 0) + ' calls';

      const resetMs = quotaStatus.timeUntilResetMs ?? 0;
      const resetMins = Math.ceil(resetMs / 60000);
      document.getElementById(\`\${provider}QuotaReset\`).textContent =
        resetMs > 0 ? \`Resets in: \${resetMins}m\` : 'Active';
    }

    function filterActivities(activities) {
      return activities.filter(a => {
        if (activityFilter !== 'all' && a.status !== activityFilter) return false;
        if (activitySearchTerm && !JSON.stringify(a).toLowerCase().includes(activitySearchTerm.toLowerCase())) return false;
        return true;
      });
    }

    function filterActivity() {
      activityFilter = document.getElementById('activityFilter').value;
      activitySearchTerm = document.getElementById('activitySearch').value;
      updateActivityUI();
    }

    function exportActivity() {
      vscode.postMessage({ type: 'exportActivity', activities: state.activities || [] });
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
          <span>\${escapeHtml(task.description || task.title || task.id)}</span>
        </div>
      \`;
    }

    function renderActivity(activity) {
      const time = activity.timestamp ? new Date(activity.timestamp).toLocaleTimeString() : '';
      return \`
        <div class="activity-item">
          <div class="activity-header">
            <span class="activity-agent">\${escapeHtml(activity.agentId || 'Agent')}</span>
            <span class="activity-time">\${time}</span>
          </div>
          <div class="activity-content">\${escapeHtml(activity.prompt || activity.message || '')}</div>
          <div class="activity-metrics">
            <span>Status: \${activity.status || 'unknown'}</span>
            \${activity.durationMs ? \`<span>Duration: \${(activity.durationMs/1000).toFixed(1)}s</span>\` : ''}
            \${activity.tokensUsed ? \`<span>Tokens: \${activity.tokensUsed}</span>\` : ''}
          </div>
        </div>
      \`;
    }

    function renderEmptyState(title, subtitle) {
      return \`
        <div class="empty-state" style="padding: 20px;">
          <div>\${escapeHtml(title)}</div>
          \${subtitle ? \`<div style="font-size: 11px; margin-top: 4px;">\${escapeHtml(subtitle)}</div>\` : ''}
        </div>
      \`;
    }

    function updateMissionProgress({ missionId, progress }) {
      const mission = state.activeMissions?.find(m => m.id === missionId);
      if (mission) {
        mission.progress = progress;
        updateMissionsUI();
      }
    }

    function updateTaskList(payload) {
      const task = payload.task || payload;
      state.tasks = state.tasks || [];
      const idx = state.tasks.findIndex(t => t.id === task.id);
      if (idx >= 0) state.tasks[idx] = task;
      else state.tasks.unshift(task);
      updateMissionsUI();
    }

    function updateWarnings() {
      const section = document.getElementById('warningsSection');
      const list = document.getElementById('warningsList');
      if (state.warnings?.length > 0) {
        section.style.display = 'block';
        list.innerHTML = state.warnings.map(w => \`
          <div class="warning-item">\${escapeHtml(w)}</div>
        \`).join('');
      } else {
        section.style.display = 'none';
      }
    }

    function refresh() { vscode.postMessage({ type: 'refresh' }); }
    function cancelMission(id) { vscode.postMessage({ type: 'cancelMission', missionId: id }); }
    function showApprovals() { vscode.postMessage({ type: 'approveTask' }); }
    function changeApprovalMode() { vscode.postMessage({ type: 'setApprovalMode' }); }

    function escapeHtml(text) {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function formatNumber(num) {
      if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
      if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
      return num.toString();
    }

    updateAllUI();
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
