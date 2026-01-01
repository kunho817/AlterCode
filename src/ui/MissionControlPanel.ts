/**
 * Unified Mission Control Panel
 *
 * Single pane of glass for all AlterCode interactions:
 * - Chat with AI agents
 * - Mission status and task tracking
 * - Activity monitoring and filtering
 * - Agent hierarchy visualization
 * - Configuration and settings
 * - Real-time status widgets (quota, approvals, conflicts)
 *
 * Layout Structure:
 * - Header: Title, status, mode toggle, settings
 * - Sidebar: Navigation (Chat, Mission, Activity, Agents, Config)
 * - Main: Dynamic content based on selection
 * - Status Panel: Always-visible widgets
 * - Input Bar: Unified chat/command input
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

/** Chat message structure */
interface ChatMessage {
  id: string;
  role: 'user' | 'sovereign' | 'overlord' | 'lord' | 'worker' | 'system';
  content: string;
  timestamp: Date;
  agentId?: string;
  approval?: {
    id: string;
    changes: Array<{ file: string; additions: number; deletions: number }>;
    status: 'pending' | 'approved' | 'rejected';
  };
}

/** Agent status in hierarchy */
interface AgentNode {
  id: string;
  level: 'sovereign' | 'overlord' | 'lord' | 'worker';
  status: 'active' | 'thinking' | 'idle' | 'waiting' | 'paused';
  model: string;
  currentTask?: string;
  children: AgentNode[];
}

/**
 * Unified Mission Control Panel implementation
 */
export class MissionControlPanel {
  public static currentPanel: MissionControlPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly eventBus: IEventBus;
  private readonly logger?: ILogger;
  private disposables: vscode.Disposable[] = [];
  private state: HiveState | null = null;
  private chatHistory: ChatMessage[] = [];
  private agentHierarchy: AgentNode | null = null;

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
      // Mission actions
      case 'cancelMission':
        this.eventBus.emit('ui:cancelMission', { missionId: message.missionId });
        break;

      case 'pauseMission':
        this.eventBus.emit('ui:pauseMission', { missionId: message.missionId });
        break;

      case 'resumeMission':
        this.eventBus.emit('ui:resumeMission', { missionId: message.missionId });
        break;

      case 'clearCompleted':
        this.eventBus.emit('ui:clearCompleted', {});
        break;

      case 'rollbackMission':
        this.eventBus.emit('ui:rollbackMission', { missionId: message.missionId });
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

      // Chat actions
      case 'sendMessage':
        this.handleChatMessage(message.content);
        break;

      case 'sendCommand':
        this.handleCommand(message.command);
        break;

      // Approval actions
      case 'approveChange':
        this.eventBus.emit('ui:approveChange', { approvalId: message.approvalId });
        break;

      case 'rejectChange':
        this.eventBus.emit('ui:rejectChange', { approvalId: message.approvalId, reason: message.reason });
        break;

      case 'viewDiff':
        this.eventBus.emit('ui:viewDiff', { approvalId: message.approvalId });
        break;

      case 'approveTask':
        vscode.commands.executeCommand('altercode.showPendingApprovals');
        break;

      case 'setApprovalMode':
        vscode.commands.executeCommand('altercode.setApprovalMode');
        break;

      case 'approveAll':
        vscode.commands.executeCommand('altercode.approveAll');
        break;

      // Agent actions
      case 'pauseAgent':
        this.eventBus.emit('ui:pauseAgent', { agentId: message.agentId });
        break;

      case 'resumeAgent':
        this.eventBus.emit('ui:resumeAgent', { agentId: message.agentId });
        break;

      case 'pauseAll':
        this.eventBus.emit('ui:pauseAllAgents', {});
        break;

      case 'resumeAll':
        this.eventBus.emit('ui:resumeAllAgents', {});
        break;

      // Activity actions
      case 'exportActivity':
        this.exportActivityToJson(message.activities);
        break;

      // Conflict actions
      case 'showConflicts':
        vscode.commands.executeCommand('altercode.showConflicts');
        break;

      case 'viewConflictDiff':
        this.eventBus.emit('ui:viewConflictDiff', { conflictId: message.conflictId });
        break;

      case 'resolveConflict':
        this.eventBus.emit('ui:resolveConflict', { conflictId: message.conflictId, strategy: message.strategy });
        break;

      // Settings actions
      case 'openSettings':
        vscode.commands.executeCommand('altercode.openSettings');
        break;

      case 'updateSetting':
        this.handleSettingUpdate(message.key, message.value);
        break;

      case 'getSettings':
        this.sendCurrentSettings();
        break;

      case 'getPerformance':
        this.eventBus.emit('ui:getPerformance', {});
        break;

      default:
        this.logger?.warn('Unknown message type', { type: message.type });
    }
  }

  /**
   * Handle chat message from user
   */
  private handleChatMessage(content: string): void {
    // Add user message to history
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date(),
    };
    this.chatHistory.push(userMessage);

    // Send to webview
    this.panel.webview.postMessage({
      type: 'chatMessage',
      payload: userMessage,
    });

    // Emit to event bus for processing
    this.eventBus.emit('ui:chatMessage', { content, timestamp: new Date() });
  }

  /**
   * Handle command input
   */
  private handleCommand(command: string): void {
    const parts = command.split(' ');
    const cmd = (parts[0] ?? '').toLowerCase();
    const args = parts.slice(1).join(' ');

    switch (cmd) {
      case '/help':
        this.showCommandHelp();
        break;
      case '/status':
        this.showStatus();
        break;
      case '/mission':
        vscode.commands.executeCommand('altercode.newMission', args);
        break;
      case '/cancel':
        this.eventBus.emit('ui:cancelMission', { missionId: args || 'current' });
        break;
      case '/approve':
        vscode.commands.executeCommand('altercode.showPendingApprovals');
        break;
      case '/mode':
        vscode.commands.executeCommand('altercode.setApprovalMode');
        break;
      default:
        this.panel.webview.postMessage({
          type: 'chatMessage',
          payload: {
            id: `sys-${Date.now()}`,
            role: 'system',
            content: `Unknown command: ${cmd}. Type /help for available commands.`,
            timestamp: new Date(),
          },
        });
    }
  }

  /**
   * Show command help
   */
  private showCommandHelp(): void {
    const helpText = `Available Commands:
/help - Show this help message
/status - Show current system status
/mission <description> - Start a new mission
/cancel [id] - Cancel current or specified mission
/approve - Show pending approvals
/mode - Change approval mode`;

    this.panel.webview.postMessage({
      type: 'chatMessage',
      payload: {
        id: `sys-${Date.now()}`,
        role: 'system',
        content: helpText,
        timestamp: new Date(),
      },
    });
  }

  /**
   * Show current status
   */
  private showStatus(): void {
    const status = this.state ? {
      activeMissions: this.state.activeMissions?.length ?? 0,
      agents: 'N/A',
      mode: 'step_by_step',
    } : { activeMissions: 0, agents: 0, mode: 'unknown' };

    this.panel.webview.postMessage({
      type: 'chatMessage',
      payload: {
        id: `sys-${Date.now()}`,
        role: 'system',
        content: `System Status:
- Active Missions: ${status.activeMissions}
- Agents: ${status.agents}
- Approval Mode: ${status.mode}`,
        timestamp: new Date(),
      },
    });
  }

  /**
   * Handle setting update
   */
  private handleSettingUpdate(key: string, value: unknown): void {
    const config = vscode.workspace.getConfiguration('altercode');
    config.update(key, value, vscode.ConfigurationTarget.Global);
    this.logger?.info('Setting updated', { key, value });
  }

  /**
   * Send current settings to webview for two-way sync
   */
  private sendCurrentSettings(): void {
    const config = vscode.workspace.getConfiguration('altercode');

    // Gather all relevant settings - dual provider architecture
    const settings: Record<string, unknown> = {
      // Claude settings (higher tiers)
      'claude.apiKey': config.get('claude.apiKey', ''),
      'claude.model': config.get('claude.model', 'claude-opus-4-5-20251101'),
      'claude.mode': config.get('claude.mode', 'api'),
      'claude.cliPath': config.get('claude.cliPath', 'claude'),
      'claude.timeout': config.get('claude.timeout', 300000),
      // GLM settings (worker tier)
      'glm.apiKey': config.get('glm.apiKey', ''),
      'glm.model': config.get('glm.model', 'glm-4.7'),
      'glm.endpoint': config.get('glm.endpoint', 'https://api.z.ai/api/coding/paas/v4/chat/completions'),
      // Approval settings
      'approval.defaultMode': config.get('approval.defaultMode', 'step_by_step'),
      // UI settings
      'ui.notifyOnQuotaWarning': config.get('ui.notifyOnQuotaWarning', true),
      'ui.notifyOnApprovalRequired': config.get('ui.notifyOnApprovalRequired', true),
      'ui.showQuotaInStatusBar': config.get('ui.showQuotaInStatusBar', true),
      // Verification settings
      'verification.strictness': config.get('verification.strictness', 'standard'),
      // Advanced settings
      'maxContextTokens': config.get('maxContextTokens', 128000),
      'activity.maxDisplayEntries': config.get('activity.maxDisplayEntries', 100),
      'llm.enableFallback': config.get('llm.enableFallback', true),
      'conflicts.autoResolveSimple': config.get('conflicts.autoResolveSimple', true),
      'logLevel': config.get('logLevel', 'info'),
    };

    this.panel.webview.postMessage({
      type: 'settingsUpdate',
      payload: settings,
    });

    this.logger?.debug('Sent current settings to webview', { settings });
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
   * Get HTML content for webview - Unified Mission Control Layout
   * Clean, minimal design with integrated settings
   */
  private getHtmlContent(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AlterCode Mission Control</title>
  <style>
    :root {
      --bg-primary: var(--vscode-editor-background);
      --bg-secondary: var(--vscode-sideBar-background);
      --bg-tertiary: var(--vscode-editorWidget-background);
      --text-primary: var(--vscode-editor-foreground);
      --text-secondary: var(--vscode-descriptionForeground);
      --text-muted: var(--vscode-disabledForeground);
      --accent: var(--vscode-button-background);
      --accent-hover: var(--vscode-button-hoverBackground);
      --border: var(--vscode-panel-border);
      --input-bg: var(--vscode-input-background);
      --input-border: var(--vscode-input-border);
      --focus-border: var(--vscode-focusBorder);
      --success: #89d185;
      --warning: #cca700;
      --error: #f14c4c;
      --info: #3794ff;
      --sovereign: #c586c0;
      --overlord: #569cd6;
      --lord: #4ec9b0;
      --worker: #9cdcfe;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--text-primary);
      background: var(--bg-primary);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* ===== HEADER ===== */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 12px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }

    .header-left { display: flex; align-items: center; gap: 12px; }
    .header-title { font-size: 12px; font-weight: 600; }
    .header-status {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: var(--text-secondary);
    }
    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--success);
    }
    .status-dot.warning { background: var(--warning); }
    .status-dot.error { background: var(--error); }

    .header-right { display: flex; align-items: center; gap: 4px; }

    .mode-toggle {
      display: flex;
      background: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: 3px;
      overflow: hidden;
    }
    .mode-btn {
      padding: 3px 8px;
      border: none;
      background: transparent;
      color: var(--text-secondary);
      font-size: 11px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .mode-btn:hover { color: var(--text-primary); background: var(--bg-secondary); }
    .mode-btn.active {
      background: var(--accent);
      color: var(--vscode-button-foreground);
    }

    .icon-btn {
      width: 24px;
      height: 24px;
      border: none;
      background: transparent;
      color: var(--text-secondary);
      cursor: pointer;
      border-radius: 3px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
    }
    .icon-btn:hover { background: var(--bg-primary); color: var(--text-primary); }

    /* ===== MAIN LAYOUT ===== */
    .main-layout {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    /* ===== SIDEBAR ===== */
    .sidebar {
      width: 140px;
      background: var(--bg-secondary);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      padding: 8px;
      gap: 2px;
      flex-shrink: 0;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      border: none;
      background: transparent;
      color: var(--text-secondary);
      cursor: pointer;
      border-radius: 4px;
      font-size: 12px;
      text-align: left;
      transition: all 0.15s;
    }
    .nav-item:hover { background: var(--bg-primary); color: var(--text-primary); }
    .nav-item.active {
      background: var(--accent);
      color: var(--vscode-button-foreground);
    }
    .nav-item .nav-icon {
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .nav-item .nav-icon svg {
      width: 14px;
      height: 14px;
      fill: currentColor;
    }
    .nav-item .badge {
      margin-left: auto;
      min-width: 16px;
      height: 16px;
      background: var(--error);
      color: white;
      font-size: 9px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 4px;
    }

    .nav-separator {
      height: 1px;
      background: var(--border);
      margin: 8px 0;
    }

    /* ===== CONTENT AREA ===== */
    .content-area {
      flex: 1;
      display: flex;
      overflow: hidden;
    }

    .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .section { display: none; flex-direction: column; flex: 1; overflow: hidden; }
    .section.active { display: flex; }

    .section-header {
      padding: 10px 14px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
      background: var(--bg-secondary);
    }
    .section-title { font-size: 12px; font-weight: 500; }
    .section-meta { font-size: 11px; color: var(--text-muted); }
    .section-meta-group { display: flex; align-items: center; gap: 8px; }
    .section-actions { display: flex; gap: 4px; }
    .activity-badge {
      font-size: 9px;
      min-width: 18px;
      height: 18px;
      padding: 0 4px;
      border-radius: 9px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .activity-badge.thinking { background: var(--info); color: white; animation: pulse 1s infinite; }
    .activity-badge.hidden { display: none; }

    .section-body {
      flex: 1;
      overflow-y: auto;
      padding: 12px 14px;
    }

    /* ===== STATUS PANEL (Right) ===== */
    .status-panel {
      width: 200px;
      background: var(--bg-secondary);
      border-left: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      flex-shrink: 0;
    }

    .widget {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
    }
    .widget-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .widget-title {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--text-muted);
      letter-spacing: 0.5px;
    }
    .widget-badge {
      font-size: 9px;
      padding: 1px 5px;
      border-radius: 3px;
      background: var(--bg-primary);
      color: var(--text-secondary);
      border: 1px solid var(--border);
    }
    .widget-badge.warning { background: var(--warning); color: black; border-color: var(--warning); }
    .widget-badge.error { background: var(--error); color: white; border-color: var(--error); }

    /* Quota Widget */
    .quota-item { margin-bottom: 8px; }
    .quota-item:last-child { margin-bottom: 0; }
    .quota-row {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      margin-bottom: 3px;
    }
    .quota-bar {
      height: 4px;
      background: var(--border);
      border-radius: 2px;
      overflow: hidden;
    }
    .quota-fill {
      height: 100%;
      transition: width 0.3s, background 0.3s;
    }
    .quota-fill.ok { background: var(--success); }
    .quota-fill.warning { background: var(--warning); }
    .quota-fill.critical, .quota-fill.exceeded { background: var(--error); }
    .quota-meta {
      font-size: 9px;
      color: var(--text-muted);
      margin-top: 3px;
      display: flex;
      justify-content: space-between;
    }
    .quota-item { cursor: pointer; }
    .quota-item:hover { background: var(--bg-primary); border-radius: 3px; margin: -4px; padding: 4px; }
    .quota-details {
      margin-top: 6px;
      padding-top: 6px;
      border-top: 1px solid var(--border);
      font-size: 9px;
    }
    .quota-detail-row {
      display: flex;
      justify-content: space-between;
      padding: 2px 0;
      color: var(--text-secondary);
    }
    .quota-levels {
      margin-top: 4px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2px;
    }
    .quota-level-item {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 8px;
      color: var(--text-muted);
    }
    .quota-level-dot {
      width: 4px;
      height: 4px;
      border-radius: 50%;
    }

    /* List Items */
    .list-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 5px 8px;
      background: var(--bg-primary);
      border-radius: 3px;
      margin-bottom: 4px;
      font-size: 11px;
    }
    .list-item:last-child { margin-bottom: 0; }
    .list-item-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .list-item-actions { display: flex; gap: 2px; }

    .small-btn {
      width: 18px;
      height: 18px;
      border: none;
      border-radius: 2px;
      cursor: pointer;
      font-size: 9px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg-secondary);
      color: var(--text-secondary);
    }
    .small-btn:hover { color: var(--text-primary); }
    .small-btn.success { background: var(--success); color: white; }
    .small-btn.danger { background: var(--error); color: white; }

    /* Approval Items */
    .approval-item {
      background: var(--bg-secondary);
      border-radius: 4px;
      padding: 8px;
      margin-bottom: 6px;
      border-left: 2px solid var(--warning);
    }
    .approval-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }
    .approval-task {
      font-size: 11px;
      font-weight: 500;
      color: var(--text-primary);
    }
    .approval-time {
      font-size: 9px;
      color: var(--text-muted);
    }
    .approval-meta {
      font-size: 10px;
      color: var(--text-secondary);
      margin-bottom: 6px;
    }
    .approval-files {
      font-size: 9px;
      color: var(--text-muted);
      margin-bottom: 6px;
    }
    .approval-actions {
      display: flex;
      gap: 4px;
    }
    .approval-btn {
      flex: 1;
      padding: 4px 6px;
      font-size: 9px;
      border: 1px solid var(--border);
      border-radius: 2px;
      cursor: pointer;
      background: var(--bg-primary);
      color: var(--text-secondary);
    }
    .approval-btn:hover { background: var(--bg-secondary); color: var(--text-primary); }
    .approval-btn.approve { border-color: var(--success); color: var(--success); }
    .approval-btn.approve:hover { background: var(--success); color: white; }
    .approval-btn.reject { border-color: var(--error); color: var(--error); }
    .approval-btn.reject:hover { background: var(--error); color: white; }

    /* Conflict Items */
    .conflict-item {
      background: var(--bg-secondary);
      border-radius: 4px;
      padding: 8px;
      margin-bottom: 6px;
      border-left: 2px solid var(--error);
    }
    .conflict-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }
    .conflict-file {
      font-size: 11px;
      font-weight: 500;
      color: var(--text-primary);
    }
    .conflict-branches {
      font-size: 9px;
      color: var(--text-muted);
      margin-bottom: 4px;
    }
    .conflict-regions {
      font-size: 10px;
      color: var(--text-secondary);
      margin-bottom: 6px;
    }
    .conflict-actions {
      display: flex;
      gap: 4px;
    }
    .conflict-btn {
      flex: 1;
      padding: 4px 6px;
      font-size: 9px;
      border: 1px solid var(--border);
      border-radius: 2px;
      cursor: pointer;
      background: var(--bg-primary);
      color: var(--text-secondary);
    }
    .conflict-btn:hover { background: var(--bg-secondary); color: var(--text-primary); }
    .conflict-btn.auto { border-color: var(--success); color: var(--success); }
    .conflict-btn.auto:hover { background: var(--success); color: white; }
    .conflict-btn.ai { border-color: var(--accent); color: var(--accent); }
    .conflict-btn.ai:hover { background: var(--accent); color: white; }

    /* Agent Summary */
    .agent-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }
    .agent-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 10px;
      color: var(--text-secondary);
    }
    .agent-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }
    .agent-dot.sovereign { background: var(--sovereign); }
    .agent-dot.overlord { background: var(--overlord); }
    .agent-dot.lord { background: var(--lord); }
    .agent-dot.worker { background: var(--worker); }

    /* Performance Widget */
    .widget-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 9px;
      padding: 2px 4px;
      border-radius: 2px;
    }
    .widget-btn:hover { background: var(--bg-primary); color: var(--text-primary); }
    .perf-summary {
      display: flex;
      gap: 8px;
      margin-bottom: 6px;
    }
    .perf-stat {
      flex: 1;
      text-align: center;
      padding: 4px;
      background: var(--bg-primary);
      border-radius: 3px;
    }
    .perf-value { font-size: 12px; font-weight: 600; color: var(--accent); display: block; }
    .perf-label { font-size: 8px; color: var(--text-muted); }
    .perf-top-ops { font-size: 9px; }
    .perf-op {
      display: flex;
      justify-content: space-between;
      padding: 3px 0;
      border-bottom: 1px solid var(--border);
    }
    .perf-op:last-child { border-bottom: none; }
    .perf-op-name { color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100px; }
    .perf-op-time { color: var(--text-muted); }
    .perf-op-slow { color: var(--warning); }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    /* ===== INPUT BAR ===== */
    .input-bar {
      display: flex;
      gap: 8px;
      padding: 8px 12px;
      background: var(--bg-secondary);
      border-top: 1px solid var(--border);
      flex-shrink: 0;
    }

    .input-wrapper {
      flex: 1;
      display: flex;
      background: var(--input-bg);
      border: 1px solid var(--input-border);
      border-radius: 4px;
      overflow: hidden;
    }
    .input-wrapper:focus-within { border-color: var(--focus-border); }

    .input-field {
      flex: 1;
      border: none;
      background: transparent;
      color: var(--text-primary);
      padding: 6px 10px;
      font-size: 12px;
      outline: none;
    }
    .input-field::placeholder { color: var(--text-muted); }

    .send-btn {
      padding: 6px 14px;
      background: var(--accent);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      font-weight: 500;
    }
    .send-btn:hover { background: var(--accent-hover); }

    /* ===== CHAT SECTION ===== */
    .chat-messages {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .chat-msg {
      padding: 8px 10px;
      background: var(--bg-secondary);
      border-radius: 4px;
      border-left: 2px solid var(--border);
    }
    .chat-msg.user { border-left-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, var(--bg-secondary)); }
    .chat-msg.sovereign { border-left-color: var(--sovereign); }
    .chat-msg.overlord { border-left-color: var(--overlord); }
    .chat-msg.lord { border-left-color: var(--lord); }
    .chat-msg.worker { border-left-color: var(--worker); }
    .chat-msg.system { border-left-color: var(--text-muted); }

    .chat-msg-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
      font-size: 10px;
    }
    .chat-msg-role { font-weight: 600; text-transform: uppercase; color: var(--text-secondary); }
    .chat-msg-time { color: var(--text-muted); }
    .chat-msg-text { font-size: 12px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }

    /* Inline Approval */
    .inline-approval {
      margin-top: 8px;
      padding: 8px;
      background: var(--bg-primary);
      border-radius: 3px;
      border: 1px solid var(--warning);
    }
    .inline-approval-title {
      font-size: 11px;
      font-weight: 500;
      margin-bottom: 6px;
    }
    .inline-approval-files {
      font-size: 10px;
      color: var(--text-secondary);
      margin-bottom: 8px;
    }
    .inline-approval-file {
      display: flex;
      justify-content: space-between;
      padding: 2px 0;
    }
    .inline-approval-actions { display: flex; gap: 6px; }
    .action-btn {
      padding: 4px 10px;
      border: 1px solid var(--border);
      border-radius: 3px;
      font-size: 10px;
      cursor: pointer;
      background: var(--bg-secondary);
      color: var(--text-primary);
    }
    .action-btn:hover { background: var(--bg-primary); }
    .action-btn.primary { background: var(--accent); color: var(--vscode-button-foreground); border-color: var(--accent); }
    .action-btn.danger { background: var(--error); color: white; border-color: var(--error); }

    /* ===== MISSION SECTION ===== */
    .mission-list { display: flex; flex-direction: column; gap: 8px; }

    .mission-card {
      background: var(--bg-secondary);
      border-radius: 4px;
      padding: 10px 12px;
      border-left: 3px solid var(--accent);
    }
    .mission-card.active { border-left-color: var(--success); }
    .mission-card.failed { border-left-color: var(--error); }

    .mission-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    .mission-title { font-size: 12px; font-weight: 500; }
    .mission-status {
      font-size: 9px;
      padding: 2px 6px;
      border-radius: 2px;
      background: var(--bg-primary);
      text-transform: uppercase;
    }
    .mission-status.active { background: var(--success); color: black; }
    .mission-status.failed { background: var(--error); color: white; }

    .progress-bar {
      height: 3px;
      background: var(--border);
      border-radius: 2px;
      overflow: hidden;
      margin: 6px 0;
    }
    .progress-fill {
      height: 100%;
      background: var(--accent);
      transition: width 0.3s;
    }

    .mission-meta {
      display: flex;
      gap: 12px;
      font-size: 10px;
      color: var(--text-muted);
    }

    /* Phase stepper */
    .phase-stepper {
      display: flex;
      gap: 2px;
      margin: 8px 0;
    }
    .phase-step {
      flex: 1;
      height: 4px;
      background: var(--border);
      border-radius: 2px;
      position: relative;
    }
    .phase-step.completed { background: var(--success); }
    .phase-step.active { background: var(--accent); animation: pulse 1.5s infinite; }
    .phase-step::after {
      content: attr(data-phase);
      position: absolute;
      top: 6px;
      left: 0;
      right: 0;
      text-align: center;
      font-size: 8px;
      color: var(--text-muted);
      text-transform: capitalize;
    }

    /* Mission controls */
    .mission-controls {
      display: flex;
      gap: 4px;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid var(--border);
    }
    .mission-btn {
      flex: 1;
      padding: 4px 8px;
      font-size: 10px;
      background: var(--bg-primary);
      border: 1px solid var(--border);
      color: var(--text-secondary);
      border-radius: 3px;
      cursor: pointer;
    }
    .mission-btn:hover { background: var(--bg-secondary); color: var(--text-primary); }
    .mission-btn.danger { border-color: var(--error); color: var(--error); }
    .mission-btn.danger:hover { background: var(--error); color: white; }

    /* Task counts and ETA */
    .mission-progress-info {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: var(--text-muted);
      margin-top: 4px;
    }
    .mission-eta { font-style: italic; }

    /* Mission stats summary */
    .mission-stats {
      display: flex;
      gap: 12px;
      padding: 8px 0;
      border-bottom: 1px solid var(--border);
      margin-bottom: 8px;
      font-size: 10px;
    }
    .mission-stat {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .mission-stat-value { font-weight: 500; color: var(--text-primary); }
    .mission-stat-label { color: var(--text-muted); }

    .task-list { margin-top: 8px; }
    .task-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 0;
      font-size: 11px;
      color: var(--text-secondary);
    }
    .task-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .task-dot.pending { background: var(--text-muted); }
    .task-dot.running { background: var(--info); animation: pulse 1s infinite; }
    .task-dot.blocked { background: var(--warning); }
    .task-dot.completed { background: var(--success); }
    .task-dot.failed { background: var(--error); }

    /* Task priority indicator */
    .task-priority {
      font-size: 8px;
      padding: 1px 4px;
      border-radius: 2px;
      margin-left: auto;
    }
    .task-priority.critical { background: var(--error); color: white; }
    .task-priority.high { background: var(--warning); color: black; }
    .task-priority.normal { display: none; }
    .task-priority.low { color: var(--text-muted); }

    /* Task retry button */
    .task-retry {
      font-size: 9px;
      padding: 2px 6px;
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text-muted);
      border-radius: 2px;
      cursor: pointer;
      margin-left: auto;
    }
    .task-retry:hover { background: var(--bg-secondary); color: var(--text-primary); }

    /* ===== ACTIVITY SECTION ===== */
    .controls-row {
      display: flex;
      gap: 6px;
      margin-bottom: 10px;
    }
    .controls-row select,
    .controls-row input {
      background: var(--input-bg);
      border: 1px solid var(--input-border);
      color: var(--text-primary);
      padding: 4px 8px;
      border-radius: 3px;
      font-size: 11px;
    }
    .controls-row input { flex: 1; }
    .controls-row button {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      color: var(--text-primary);
      padding: 4px 10px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 10px;
    }
    .controls-row button:hover { background: var(--bg-primary); }

    .activity-list { display: flex; flex-direction: column; gap: 6px; }

    .activity-item {
      background: var(--bg-secondary);
      border-radius: 3px;
      padding: 8px 10px;
      border-left: 2px solid var(--border);
    }
    .activity-item.sovereign { border-left-color: var(--sovereign); }
    .activity-item.overlord { border-left-color: var(--overlord); }
    .activity-item.lord { border-left-color: var(--lord); }
    .activity-item.worker { border-left-color: var(--worker); }

    .activity-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
    }
    .activity-agent { font-size: 11px; font-weight: 500; }
    .activity-time { font-size: 9px; color: var(--text-muted); }
    .activity-content { font-size: 11px; color: var(--text-secondary); margin-bottom: 4px; }
    .activity-metrics {
      display: flex;
      gap: 10px;
      font-size: 9px;
      color: var(--text-muted);
    }
    .activity-error {
      font-size: 10px;
      color: var(--error);
      margin-top: 4px;
      padding: 4px 6px;
      background: color-mix(in srgb, var(--error) 10%, var(--bg-primary));
      border-radius: 3px;
      border-left: 2px solid var(--error);
    }
    .activity-status {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .activity-status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }
    .activity-status-dot.thinking { background: var(--info); animation: pulse 1s infinite; }
    .activity-status-dot.completed { background: var(--success); }
    .activity-status-dot.failed { background: var(--error); }

    .stats-row {
      display: flex;
      gap: 8px;
      margin-top: 12px;
      padding: 10px;
      background: var(--bg-secondary);
      border-radius: 4px;
    }
    .stat-box { flex: 1; text-align: center; }
    .stat-value { font-size: 16px; font-weight: 600; color: var(--accent); }
    .stat-label { font-size: 9px; color: var(--text-muted); margin-top: 2px; }

    /* ===== AGENTS SECTION ===== */
    .agent-tree { padding: 4px 0; }

    .agent-node { margin-left: 16px; position: relative; }
    .agent-node::before {
      content: '';
      position: absolute;
      left: -10px;
      top: 0;
      bottom: 0;
      width: 1px;
      background: var(--border);
    }
    .agent-node:last-child::before { height: 14px; }

    .agent-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      background: var(--bg-secondary);
      border-radius: 3px;
      margin-bottom: 4px;
      border-left: 2px solid var(--border);
    }
    .agent-row.sovereign { border-left-color: var(--sovereign); }
    .agent-row.overlord { border-left-color: var(--overlord); }
    .agent-row.lord { border-left-color: var(--lord); }
    .agent-row.worker { border-left-color: var(--worker); }

    .status-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .status-indicator.active { background: var(--success); }
    .status-indicator.thinking { background: var(--info); animation: pulse 1s infinite; }
    .status-indicator.idle { background: var(--text-muted); }
    .status-indicator.waiting { background: var(--warning); }
    .status-indicator.paused { background: var(--error); }

    .agent-info { flex: 1; min-width: 0; }
    .agent-name { font-size: 11px; font-weight: 500; }
    .agent-task { font-size: 10px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .legend-row {
      display: flex;
      gap: 12px;
      padding: 8px 10px;
      background: var(--bg-secondary);
      border-radius: 3px;
      margin-top: 12px;
      font-size: 10px;
      color: var(--text-muted);
    }
    .legend-item { display: flex; align-items: center; gap: 4px; }

    /* ===== CONFIG SECTION ===== */
    .config-section { margin-bottom: 16px; }
    .config-title {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--text-muted);
      margin-bottom: 8px;
      letter-spacing: 0.5px;
    }

    .config-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 10px;
      background: var(--bg-secondary);
      border-radius: 3px;
      margin-bottom: 4px;
    }
    .config-label { font-size: 11px; }
    .config-input {
      background: var(--input-bg);
      border: 1px solid var(--input-border);
      color: var(--text-primary);
      padding: 4px 8px;
      border-radius: 3px;
      font-size: 11px;
      width: 140px;
    }
    .config-input:focus { border-color: var(--focus-border); outline: none; }
    .config-select {
      background: var(--input-bg);
      border: 1px solid var(--input-border);
      color: var(--text-primary);
      padding: 4px 8px;
      border-radius: 3px;
      font-size: 11px;
      min-width: 120px;
    }
    .config-toggle {
      position: relative;
      width: 36px;
      height: 18px;
      background: var(--border);
      border-radius: 9px;
      cursor: pointer;
      transition: background 0.2s;
    }
    .config-toggle.on { background: var(--accent); }
    .config-toggle::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 14px;
      height: 14px;
      background: white;
      border-radius: 50%;
      transition: transform 0.2s;
    }
    .config-toggle.on::after { transform: translateX(18px); }

    .config-btn {
      padding: 6px 12px;
      background: var(--accent);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 3px;
      font-size: 11px;
      cursor: pointer;
      width: 100%;
      margin-top: 4px;
    }
    .config-btn:hover { background: var(--accent-hover); }

    .config-note {
      font-size: 10px;
      color: var(--text-muted);
      margin-top: 8px;
      padding: 6px 8px;
      background: var(--bg-secondary);
      border-radius: 3px;
      border-left: 2px solid var(--info);
    }

    /* ===== EMPTY STATE ===== */
    .empty-state {
      text-align: center;
      padding: 32px 16px;
      color: var(--text-muted);
    }
    .empty-state-title { font-size: 12px; margin-bottom: 4px; }
    .empty-state-subtitle { font-size: 11px; }

    /* ===== UTILITIES ===== */
    .hidden { display: none !important; }
    .text-muted { color: var(--text-muted); }
    .text-success { color: var(--success); }
    .text-warning { color: var(--warning); }
    .text-error { color: var(--error); }
  </style>
</head>
<body>
  <!-- HEADER -->
  <header class="header">
    <div class="header-left">
      <span class="header-title">AlterCode Mission Control</span>
      <div class="header-status">
        <span class="status-dot" id="connectionStatus"></span>
        <span id="statusText">Ready</span>
      </div>
    </div>
    <div class="header-right">
      <div class="mode-toggle">
        <button class="mode-btn" data-mode="auto" onclick="setMode('auto')">Auto</button>
        <button class="mode-btn active" data-mode="step" onclick="setMode('step')">Step</button>
        <button class="mode-btn" data-mode="manual" onclick="setMode('manual')">Manual</button>
      </div>
      <button class="icon-btn" onclick="refresh()" title="Refresh">R</button>
    </div>
  </header>

  <!-- MAIN LAYOUT -->
  <div class="main-layout">
    <!-- SIDEBAR -->
    <nav class="sidebar">
      <button class="nav-item active" data-section="chat" onclick="switchSection('chat')">
        <span class="nav-icon"><svg viewBox="0 0 16 16"><path d="M14 1H2a1 1 0 00-1 1v9a1 1 0 001 1h3l3 3 3-3h3a1 1 0 001-1V2a1 1 0 00-1-1zM3 4h10v1H3V4zm0 2h8v1H3V6zm0 2h6v1H3V8z"/></svg></span>
        <span>Chat</span>
      </button>
      <button class="nav-item" data-section="mission" onclick="switchSection('mission')">
        <span class="nav-icon"><svg viewBox="0 0 16 16"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 12.5a5.5 5.5 0 110-11 5.5 5.5 0 010 11zm0-9a3.5 3.5 0 100 7 3.5 3.5 0 000-7zm0 5.5a2 2 0 110-4 2 2 0 010 4z"/></svg></span>
        <span>Missions</span>
      </button>
      <button class="nav-item" data-section="activity" onclick="switchSection('activity')">
        <span class="nav-icon"><svg viewBox="0 0 16 16"><path d="M1 8h2l2-5 3 10 2-5h5v1H11l-2 5-3-10-2 5H1V8z"/></svg></span>
        <span>Activity</span>
      </button>
      <button class="nav-item" data-section="agents" onclick="switchSection('agents')">
        <span class="nav-icon"><svg viewBox="0 0 16 16"><path d="M8 1a2 2 0 110 4 2 2 0 010-4zM3 6a2 2 0 110 4 2 2 0 010-4zm10 0a2 2 0 110 4 2 2 0 010-4zM8 6v3m-4 2v-1a1 1 0 011-1h6a1 1 0 011 1v1M3 11v2m10-2v2" stroke="currentColor" stroke-width="1.5" fill="none"/></svg></span>
        <span>Hierarchy</span>
      </button>
      <div class="nav-separator"></div>
      <button class="nav-item" data-section="config" onclick="switchSection('config')">
        <span class="nav-icon"><svg viewBox="0 0 16 16"><path d="M9.1 2.3l.7-.7a1.5 1.5 0 012.1 2.1l-.7.7.4.9h1a1.5 1.5 0 010 3h-1l-.4.9.7.7a1.5 1.5 0 01-2.1 2.1l-.7-.7-.9.4v1a1.5 1.5 0 01-3 0v-1l-.9-.4-.7.7a1.5 1.5 0 01-2.1-2.1l.7-.7-.4-.9H1a1.5 1.5 0 010-3h1l.4-.9-.7-.7a1.5 1.5 0 012.1-2.1l.7.7.9-.4v-1a1.5 1.5 0 013 0v1l.9.4zM8 5.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z"/></svg></span>
        <span>Settings</span>
      </button>
    </nav>

    <!-- CONTENT AREA -->
    <div class="content-area">
      <div class="main-content">
        <!-- CHAT SECTION -->
        <div id="chat-section" class="section active">
          <div class="section-header">
            <span class="section-title">Chat</span>
            <div class="section-actions">
              <button class="icon-btn" onclick="clearChat()" title="Clear">X</button>
            </div>
          </div>
          <div class="section-body">
            <div class="chat-messages" id="chatMessages">
              <div class="empty-state">
                <div class="empty-state-title">No messages yet</div>
                <div class="empty-state-subtitle">Type a message or use /help for commands</div>
              </div>
            </div>
          </div>
        </div>

        <!-- MISSION SECTION -->
        <div id="mission-section" class="section">
          <div class="section-header">
            <span class="section-title">Missions</span>
            <div class="section-actions">
              <button class="icon-btn" onclick="clearCompleted()" title="Clear completed">x</button>
              <button class="icon-btn" onclick="newMission()" title="New">+</button>
            </div>
          </div>
          <div class="section-body">
            <div class="mission-stats" id="missionStats">
              <div class="mission-stat"><span class="mission-stat-value" id="missionTotal">0</span><span class="mission-stat-label">Total</span></div>
              <div class="mission-stat"><span class="mission-stat-value" id="missionActive">0</span><span class="mission-stat-label">Active</span></div>
              <div class="mission-stat"><span class="mission-stat-value" id="missionCompleted">0</span><span class="mission-stat-label">Done</span></div>
              <div class="mission-stat"><span class="mission-stat-value" id="missionFailed">0</span><span class="mission-stat-label">Failed</span></div>
            </div>
            <div class="mission-list" id="missionList">
              <div class="empty-state">
                <div class="empty-state-title">No active missions</div>
                <div class="empty-state-subtitle">Start a new mission to begin</div>
              </div>
            </div>
          </div>
        </div>

        <!-- ACTIVITY SECTION -->
        <div id="activity-section" class="section">
          <div class="section-header">
            <span class="section-title">Activity Log</span>
            <div class="section-meta-group">
              <span class="activity-badge thinking" id="activeCount" title="Currently thinking">0</span>
              <span class="section-meta" id="activityCount">0 entries</span>
            </div>
          </div>
          <div class="section-body">
            <div class="controls-row">
              <select id="activityFilter" onchange="filterActivity()">
                <option value="all">All</option>
                <option value="thinking">Thinking</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
              <input type="text" id="activitySearch" placeholder="Search..." oninput="filterActivity()">
              <button onclick="exportActivity()">Export</button>
            </div>
            <div class="activity-list" id="activityList"></div>
            <div class="stats-row">
              <div class="stat-box">
                <div class="stat-value" id="avgDuration">0s</div>
                <div class="stat-label">Avg Duration</div>
              </div>
              <div class="stat-box">
                <div class="stat-value" id="totalTokens">0</div>
                <div class="stat-label">Total Tokens</div>
              </div>
              <div class="stat-box">
                <div class="stat-value" id="successRate">0%</div>
                <div class="stat-label">Success Rate</div>
              </div>
              <div class="stat-box">
                <div class="stat-value" id="failedCount">0</div>
                <div class="stat-label">Failed</div>
              </div>
            </div>
          </div>
        </div>

        <!-- AGENTS SECTION -->
        <div id="agents-section" class="section">
          <div class="section-header">
            <span class="section-title">Agent Hierarchy</span>
            <div class="section-actions">
              <button class="icon-btn" onclick="pauseAll()" title="Pause All">||</button>
              <button class="icon-btn" onclick="resumeAll()" title="Resume All">></button>
            </div>
          </div>
          <div class="section-body">
            <div class="agent-tree" id="agentTree">
              <div class="empty-state">
                <div class="empty-state-title">No active agents</div>
                <div class="empty-state-subtitle">Agents appear when a mission starts</div>
              </div>
            </div>
            <div class="legend-row">
              <div class="legend-item"><span class="status-indicator active"></span> Active</div>
              <div class="legend-item"><span class="status-indicator thinking"></span> Thinking</div>
              <div class="legend-item"><span class="status-indicator idle"></span> Idle</div>
              <div class="legend-item"><span class="status-indicator paused"></span> Paused</div>
            </div>
          </div>
        </div>

        <!-- CONFIG SECTION -->
        <div id="config-section" class="section">
          <div class="section-header">
            <span class="section-title">Settings</span>
          </div>
          <div class="section-body">
            <div class="config-section">
              <div class="config-title">Claude (Higher Tiers: Sovereign, Overlord, Lord)</div>
              <div class="config-row">
                <span class="config-label">Access Mode</span>
                <select class="config-select" id="cfgClaudeMode" onchange="updateClaudeMode(this.value)">
                  <option value="api">API (Direct)</option>
                  <option value="cli">CLI (Claude Code)</option>
                </select>
              </div>
              <div class="config-row" id="cfgClaudeApiKeyRow">
                <span class="config-label">API Key</span>
                <input type="password" class="config-input" id="cfgClaudeApiKey" placeholder="sk-ant-..." onchange="updateConfig('claude.apiKey', this.value)">
              </div>
              <div class="config-row" id="cfgClaudeCliPathRow" style="display: none;">
                <span class="config-label">CLI Path</span>
                <input type="text" class="config-input" id="cfgClaudeCliPath" placeholder="claude" onchange="updateConfig('claude.cliPath', this.value)">
              </div>
              <div class="config-row">
                <span class="config-label">Model</span>
                <input type="text" class="config-input" id="cfgClaudeModel" placeholder="claude-opus-4-5-20251101" onchange="updateConfig('claude.model', this.value)">
              </div>
              <div class="config-row">
                <span class="config-label">Timeout (ms)</span>
                <input type="number" class="config-input" id="cfgClaudeTimeout" value="300000" style="width: 100px;" onchange="updateConfig('claude.timeout', parseInt(this.value))">
              </div>
            </div>

            <div class="config-section">
              <div class="config-title">GLM (Worker Tier)</div>
              <div class="config-row">
                <span class="config-label">API Key</span>
                <input type="password" class="config-input" id="cfgGlmApiKey" placeholder="Enter GLM API key" onchange="updateConfig('glm.apiKey', this.value)">
              </div>
              <div class="config-row">
                <span class="config-label">Model</span>
                <input type="text" class="config-input" id="cfgGlmModel" placeholder="glm-4.7" onchange="updateConfig('glm.model', this.value)">
              </div>
              <div class="config-row">
                <span class="config-label">Endpoint</span>
                <input type="text" class="config-input" id="cfgGlmEndpoint" style="width: 200px;" placeholder="https://api.z.ai/api/coding/paas/v4/chat/completions" onchange="updateConfig('glm.endpoint', this.value)">
              </div>
            </div>

            <div class="config-section">
              <div class="config-title">Approval Mode</div>
              <div class="config-row">
                <span class="config-label">Mode</span>
                <select class="config-select" id="cfgApprovalMode" onchange="updateApprovalMode(this.value)">
                  <option value="full_automation">Full Automation</option>
                  <option value="step_by_step" selected>Step by Step</option>
                  <option value="fully_manual">Fully Manual</option>
                </select>
              </div>
            </div>

            <div class="config-section">
              <div class="config-title">Notifications</div>
              <div class="config-row">
                <span class="config-label">Quota Warnings</span>
                <div class="config-toggle on" id="cfgQuotaNotify" onclick="toggleSetting(this, 'ui.notifyOnQuotaWarning')"></div>
              </div>
              <div class="config-row">
                <span class="config-label">Approval Required</span>
                <div class="config-toggle on" id="cfgApprovalNotify" onclick="toggleSetting(this, 'ui.notifyOnApprovalRequired')"></div>
              </div>
              <div class="config-row">
                <span class="config-label">Show Quota in Status Bar</span>
                <div class="config-toggle on" id="cfgShowQuota" onclick="toggleSetting(this, 'ui.showQuotaInStatusBar')"></div>
              </div>
            </div>

            <div class="config-section">
              <div class="config-title">Verification</div>
              <div class="config-row">
                <span class="config-label">Strictness</span>
                <select class="config-select" id="cfgVerificationStrictness" onchange="updateConfig('verification.strictness', this.value)">
                  <option value="strict">Strict</option>
                  <option value="standard" selected>Standard</option>
                  <option value="lenient">Lenient</option>
                </select>
              </div>
            </div>

            <div class="config-section">
              <div class="config-title">Advanced</div>
              <div class="config-row">
                <span class="config-label">Max Context Tokens</span>
                <input type="number" class="config-input" id="cfgMaxContextTokens" value="128000" style="width: 100px;" onchange="updateConfig('maxContextTokens', parseInt(this.value))">
              </div>
              <div class="config-row">
                <span class="config-label">Max Activity Entries</span>
                <input type="number" class="config-input" id="cfgMaxActivity" value="100" style="width: 80px;" onchange="updateConfig('activity.maxDisplayEntries', parseInt(this.value))">
              </div>
              <div class="config-row">
                <span class="config-label">Enable Fallback (GLM)</span>
                <div class="config-toggle on" id="cfgEnableFallback" onclick="toggleSetting(this, 'llm.enableFallback')"></div>
              </div>
              <div class="config-row">
                <span class="config-label">Auto-resolve Simple Conflicts</span>
                <div class="config-toggle on" id="cfgAutoResolve" onclick="toggleSetting(this, 'conflicts.autoResolveSimple')"></div>
              </div>
              <div class="config-row">
                <span class="config-label">Log Level</span>
                <select class="config-select" id="cfgLogLevel" onchange="updateConfig('logLevel', this.value)">
                  <option value="debug">Debug</option>
                  <option value="info" selected>Info</option>
                  <option value="warn">Warn</option>
                  <option value="error">Error</option>
                </select>
              </div>
            </div>

            <div class="config-note">
              Claude is used for higher-level agents (Sovereign, Overlord, Lord). GLM is used for Worker tier. Settings are automatically saved.
            </div>
          </div>
        </div>
      </div>

      <!-- STATUS PANEL -->
      <aside class="status-panel">
        <!-- Quota Widget -->
        <div class="widget">
          <div class="widget-header">
            <span class="widget-title">Quota</span>
            <span class="widget-badge" id="quotaResetTimer">--:--</span>
          </div>
          <div class="quota-item" onclick="toggleQuotaDetails('claude')">
            <div class="quota-row">
              <span>Claude</span>
              <span id="claudePercent">0%</span>
            </div>
            <div class="quota-bar">
              <div class="quota-fill ok" id="claudeBar" style="width: 0%"></div>
            </div>
            <div class="quota-meta">
              <span id="claudeCalls">0 calls</span>
              <span id="claudeTokens">0 tok</span>
            </div>
            <div class="quota-details hidden" id="claudeDetails">
              <div class="quota-detail-row"><span>Sent:</span><span id="claudeTokensSent">0</span></div>
              <div class="quota-detail-row"><span>Received:</span><span id="claudeTokensRecv">0</span></div>
              <div class="quota-detail-row"><span>Reset in:</span><span id="claudeReset">--:--</span></div>
              <div class="quota-levels" id="claudeLevels"></div>
            </div>
          </div>
          <div class="quota-item" onclick="toggleQuotaDetails('glm')">
            <div class="quota-row">
              <span>GLM</span>
              <span id="glmPercent">0%</span>
            </div>
            <div class="quota-bar">
              <div class="quota-fill ok" id="glmBar" style="width: 0%"></div>
            </div>
            <div class="quota-meta">
              <span id="glmCalls">0 calls</span>
              <span id="glmTokens">0 tok</span>
            </div>
            <div class="quota-details hidden" id="glmDetails">
              <div class="quota-detail-row"><span>Sent:</span><span id="glmTokensSent">0</span></div>
              <div class="quota-detail-row"><span>Received:</span><span id="glmTokensRecv">0</span></div>
              <div class="quota-detail-row"><span>Reset in:</span><span id="glmReset">--:--</span></div>
              <div class="quota-levels" id="glmLevels"></div>
            </div>
          </div>
        </div>

        <!-- Approvals Widget -->
        <div class="widget">
          <div class="widget-header">
            <span class="widget-title">Approvals</span>
            <span class="widget-badge" id="approvalsBadge">0</span>
          </div>
          <div id="approvalsWidget">
            <div class="text-muted" style="font-size: 10px;">No pending</div>
          </div>
        </div>

        <!-- Conflicts Widget -->
        <div class="widget">
          <div class="widget-header">
            <span class="widget-title">Conflicts</span>
            <span class="widget-badge" id="conflictsBadge">0</span>
          </div>
          <div id="conflictsWidget">
            <div class="text-muted" style="font-size: 10px;">None</div>
          </div>
        </div>

        <!-- Agents Widget -->
        <div class="widget">
          <div class="widget-header">
            <span class="widget-title">Agents</span>
          </div>
          <div class="agent-grid" id="agentsSummary">
            <div class="agent-item"><span class="agent-dot sovereign"></span>Sov: 0</div>
            <div class="agent-item"><span class="agent-dot overlord"></span>Ovr: 0</div>
            <div class="agent-item"><span class="agent-dot lord"></span>Lord: 0</div>
            <div class="agent-item"><span class="agent-dot worker"></span>Wrk: 0</div>
          </div>
        </div>

        <!-- Performance Widget -->
        <div class="widget">
          <div class="widget-header">
            <span class="widget-title">Performance</span>
            <button class="widget-btn" onclick="refreshPerformance()" title="Refresh">R</button>
          </div>
          <div id="perfWidget">
            <div class="perf-summary">
              <div class="perf-stat">
                <span class="perf-value" id="perfOpsCount">0</span>
                <span class="perf-label">Operations</span>
              </div>
              <div class="perf-stat">
                <span class="perf-value" id="perfTotalTime">0ms</span>
                <span class="perf-label">Total Time</span>
              </div>
            </div>
            <div class="perf-top-ops" id="perfTopOps">
              <div class="text-muted" style="font-size: 10px;">No data yet</div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </div>

  <!-- INPUT BAR -->
  <div class="input-bar">
    <div class="input-wrapper">
      <input type="text" id="inputField" class="input-field" placeholder="Type a message or /help for commands..." onkeydown="handleInputKey(event)">
    </div>
    <button class="send-btn" onclick="sendMessage()">Send</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    // State
    let state = {
      activeMissions: [],
      stats: { missions: { total: 0, active: 0, completed: 0 } },
      tasks: [],
      activities: [],
      quota: null,
      pendingApprovals: [],
      conflicts: [],
      agents: null,
      approvalMode: 'step_by_step',
      chatMessages: [],
      settings: {},
      performance: null
    };

    let currentSection = 'chat';
    let activityFilter = 'all';
    let activitySearchTerm = '';

    // Message handling
    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.type) {
        case 'stateUpdate':
          state = { ...state, ...message.payload };
          updateAllUI();
          break;
        case 'settingsUpdate':
          state.settings = message.payload;
          updateSettingsUI();
          break;
        case 'chatMessage':
          addChatMessage(message.payload);
          break;
        case 'missionCreated':
          state.activeMissions = state.activeMissions || [];
          state.activeMissions.push(message.payload);
          updateMissionUI();
          break;
        case 'progressUpdate':
          updateMissionProgress(message.payload);
          break;
        case 'agentUpdate':
          state.agents = message.payload;
          updateAgentsUI();
          break;
        case 'activityUpdate':
          state.activities = message.payload;
          updateActivityUI();
          break;
        case 'quotaUpdate':
          state.quota = message.payload;
          updateQuotaUI();
          break;
        case 'approvalsUpdate':
          state.pendingApprovals = message.payload;
          updateApprovalsUI();
          break;
        case 'conflictsUpdate':
          state.conflicts = message.payload;
          updateConflictsUI();
          break;
        case 'performanceUpdate':
          state.performance = message.payload;
          updatePerformanceUI();
          break;
      }
    });

    // Navigation
    function switchSection(section) {
      currentSection = section;
      document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
      document.querySelector(\`[data-section="\${section}"]\`).classList.add('active');
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.getElementById(\`\${section}-section\`).classList.add('active');
    }

    // Mode toggle - syncs header toggle and Settings dropdown
    function setMode(mode) {
      document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
      document.querySelector(\`[data-mode="\${mode}"]\`).classList.add('active');
      const modeMap = { auto: 'full_automation', step: 'step_by_step', manual: 'fully_manual' };
      const settingsValue = modeMap[mode];
      // Also update the Settings dropdown
      const dropdown = document.getElementById('cfgApprovalMode');
      if (dropdown) dropdown.value = settingsValue;
      updateConfig('approval.defaultMode', settingsValue);
    }

    // Called when Settings dropdown changes - syncs header toggle
    function updateApprovalMode(value) {
      const modeMap = { full_automation: 'auto', step_by_step: 'step', fully_manual: 'manual' };
      document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
      const modeBtn = document.querySelector(\`[data-mode="\${modeMap[value]}"]\`);
      if (modeBtn) modeBtn.classList.add('active');
      updateConfig('approval.defaultMode', value);
    }

    // Settings
    function updateConfig(key, value) {
      vscode.postMessage({ type: 'updateSetting', key, value });
    }

    function toggleSetting(el, key) {
      const isOn = el.classList.toggle('on');
      updateConfig(key, isOn);
    }

    function updateClaudeMode(mode, saveConfig = true) {
      if (saveConfig) {
        updateConfig('claude.mode', mode);
      }
      // Show/hide API key vs CLI path based on mode
      const apiKeyRow = document.getElementById('cfgClaudeApiKeyRow');
      const cliPathRow = document.getElementById('cfgClaudeCliPathRow');
      if (mode === 'cli') {
        if (apiKeyRow) apiKeyRow.style.display = 'none';
        if (cliPathRow) cliPathRow.style.display = 'flex';
      } else {
        if (apiKeyRow) apiKeyRow.style.display = 'flex';
        if (cliPathRow) cliPathRow.style.display = 'none';
      }
    }

    function updateSettingsUI() {
      const s = state.settings;

      // Claude settings
      if (s['claude.mode']) {
        document.getElementById('cfgClaudeMode').value = s['claude.mode'];
        updateClaudeMode(s['claude.mode'], false);  // Don't save - just update UI
      }
      if (s['claude.model']) document.getElementById('cfgClaudeModel').value = s['claude.model'];
      if (s['claude.cliPath']) document.getElementById('cfgClaudeCliPath').value = s['claude.cliPath'];
      if (s['claude.timeout']) document.getElementById('cfgClaudeTimeout').value = s['claude.timeout'];

      // GLM settings
      if (s['glm.model']) document.getElementById('cfgGlmModel').value = s['glm.model'];
      if (s['glm.endpoint']) document.getElementById('cfgGlmEndpoint').value = s['glm.endpoint'];

      // Approval mode - sync both dropdown and header toggle
      if (s['approval.defaultMode']) {
        document.getElementById('cfgApprovalMode').value = s['approval.defaultMode'];
        const modeMap = { full_automation: 'auto', step_by_step: 'step', fully_manual: 'manual' };
        document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
        const modeBtn = document.querySelector(\`[data-mode="\${modeMap[s['approval.defaultMode']]}"]\`);
        if (modeBtn) modeBtn.classList.add('active');
      }

      // Verification settings
      if (s['verification.strictness']) document.getElementById('cfgVerificationStrictness').value = s['verification.strictness'];

      // Advanced settings
      if (s['maxContextTokens']) document.getElementById('cfgMaxContextTokens').value = s['maxContextTokens'];
      if (s['activity.maxDisplayEntries']) document.getElementById('cfgMaxActivity').value = s['activity.maxDisplayEntries'];
      if (s['logLevel']) document.getElementById('cfgLogLevel').value = s['logLevel'];

      // Toggles
      setToggle('cfgQuotaNotify', s['ui.notifyOnQuotaWarning'] !== false);
      setToggle('cfgApprovalNotify', s['ui.notifyOnApprovalRequired'] !== false);
      setToggle('cfgShowQuota', s['ui.showQuotaInStatusBar'] !== false);
      setToggle('cfgEnableFallback', s['llm.enableFallback'] !== false);
      setToggle('cfgAutoResolve', s['conflicts.autoResolveSimple'] !== false);
    }

    function setToggle(id, isOn) {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('on', isOn);
    }

    // Input handling
    function handleInputKey(event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    }

    function sendMessage() {
      const input = document.getElementById('inputField');
      const content = input.value.trim();
      if (!content) return;

      if (content.startsWith('/')) {
        vscode.postMessage({ type: 'sendCommand', command: content });
      } else {
        vscode.postMessage({ type: 'sendMessage', content });
      }
      input.value = '';
    }

    // Chat
    function addChatMessage(msg) {
      state.chatMessages.push(msg);
      updateChatUI();
    }

    function updateChatUI() {
      const container = document.getElementById('chatMessages');
      if (state.chatMessages.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-title">No messages yet</div><div class="empty-state-subtitle">Type a message or use /help for commands</div></div>';
        return;
      }

      container.innerHTML = state.chatMessages.map(msg => {
        const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : '';
        let approvalHtml = '';

        if (msg.approval && msg.approval.status === 'pending') {
          approvalHtml = \`
            <div class="inline-approval">
              <div class="inline-approval-title">\${msg.approval.changes.length} file changes</div>
              <div class="inline-approval-files">
                \${msg.approval.changes.map(c => \`<div class="inline-approval-file"><span>\${escapeHtml(c.file)}</span><span class="text-success">+\${c.additions}</span> <span class="text-error">-\${c.deletions}</span></div>\`).join('')}
              </div>
              <div class="inline-approval-actions">
                <button class="action-btn" onclick="viewDiff('\${msg.approval.id}')">View</button>
                <button class="action-btn primary" onclick="approveChange('\${msg.approval.id}')">Approve</button>
                <button class="action-btn danger" onclick="rejectChange('\${msg.approval.id}')">Reject</button>
              </div>
            </div>
          \`;
        }

        return \`
          <div class="chat-msg \${msg.role}">
            <div class="chat-msg-header">
              <span class="chat-msg-role">\${msg.role}</span>
              <span class="chat-msg-time">\${time}</span>
            </div>
            <div class="chat-msg-text">\${escapeHtml(msg.content)}</div>
            \${approvalHtml}
          </div>
        \`;
      }).join('');

      container.scrollTop = container.scrollHeight;
    }

    function clearChat() {
      state.chatMessages = [];
      updateChatUI();
    }

    // Missions
    const PHASES = ['planning', 'validation', 'execution', 'verification', 'completion'];

    function updateMissionUI() {
      const allMissions = state.activeMissions || [];

      // Update stats
      const stats = {
        total: allMissions.length,
        active: allMissions.filter(m => m.status === 'active' || m.status === 'running').length,
        completed: allMissions.filter(m => m.status === 'completed').length,
        failed: allMissions.filter(m => m.status === 'failed').length
      };
      document.getElementById('missionTotal').textContent = stats.total.toString();
      document.getElementById('missionActive').textContent = stats.active.toString();
      document.getElementById('missionCompleted').textContent = stats.completed.toString();
      document.getElementById('missionFailed').textContent = stats.failed.toString();

      const container = document.getElementById('missionList');
      if (allMissions.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-title">No active missions</div><div class="empty-state-subtitle">Start a new mission to begin</div></div>';
        return;
      }

      container.innerHTML = allMissions.map(m => {
        const progress = m.progress || {};
        const overallProgress = progress.overallProgress ?? 0;
        const tasksTotal = progress.tasksTotal ?? 0;
        const tasksCompleted = progress.tasksCompleted ?? 0;
        const currentPhase = m.phase || 'planning';
        const phaseIndex = PHASES.indexOf(currentPhase);
        const tasks = m.tasks || [];
        const isPaused = m.status === 'paused';
        const isActive = m.status === 'active' || m.status === 'running';
        const isFailed = m.status === 'failed';

        // Format ETA
        let etaHtml = '';
        if (progress.estimatedCompletion) {
          const eta = new Date(progress.estimatedCompletion);
          const now = new Date();
          const diffMs = eta.getTime() - now.getTime();
          if (diffMs > 0) {
            const mins = Math.round(diffMs / 60000);
            etaHtml = \`<span class="mission-eta">ETA: \${mins}m</span>\`;
          }
        }

        // Phase stepper HTML
        const phaseStepperHtml = PHASES.map((phase, i) => {
          let cls = '';
          if (i < phaseIndex) cls = 'completed';
          else if (i === phaseIndex && isActive) cls = 'active';
          return \`<div class="phase-step \${cls}" data-phase="\${phase}"></div>\`;
        }).join('');

        // Tasks HTML with priority and retry
        let tasksHtml = '';
        if (tasks.length > 0) {
          tasksHtml = \`<div class="task-list">\${tasks.slice(0, 5).map(t => {
            const status = t.status || 'pending';
            const priority = t.priority || 'normal';
            const showRetry = status === 'failed';
            return \`
              <div class="task-item">
                <span class="task-dot \${status}"></span>
                <span>\${escapeHtml(t.description || t.title || t.id)}</span>
                \${priority !== 'normal' ? \`<span class="task-priority \${priority}">\${priority}</span>\` : ''}
                \${showRetry ? \`<button class="task-retry" onclick="retryTask('\${t.id}')">Retry</button>\` : ''}
              </div>\`;
          }).join('')}</div>\`;
        }

        // Rollback points info
        const rollbackCount = m.rollbackPoints ?? 0;
        const hasRollback = rollbackCount > 0;

        // Controls based on status
        let controlsHtml = '';
        if (isActive) {
          controlsHtml = \`
            <div class="mission-controls">
              <button class="mission-btn" onclick="pauseMission('\${m.id}')">Pause</button>
              \${hasRollback ? \`<button class="mission-btn" onclick="rollbackMission('\${m.id}')" title="\${rollbackCount} restore points">Rollback</button>\` : ''}
              <button class="mission-btn danger" onclick="cancelMission('\${m.id}')">Cancel</button>
            </div>\`;
        } else if (isPaused) {
          controlsHtml = \`
            <div class="mission-controls">
              <button class="mission-btn" onclick="resumeMission('\${m.id}')">Resume</button>
              \${hasRollback ? \`<button class="mission-btn" onclick="rollbackMission('\${m.id}')" title="\${rollbackCount} restore points">Rollback</button>\` : ''}
              <button class="mission-btn danger" onclick="cancelMission('\${m.id}')">Cancel</button>
            </div>\`;
        } else if (isFailed && hasRollback) {
          controlsHtml = \`
            <div class="mission-controls">
              <button class="mission-btn" onclick="rollbackMission('\${m.id}')" title="\${rollbackCount} restore points">Rollback Changes</button>
            </div>\`;
        }

        return \`
          <div class="mission-card \${m.status}">
            <div class="mission-header">
              <span class="mission-title">\${escapeHtml(m.title)}</span>
              <span class="mission-status \${m.status}">\${m.status}</span>
            </div>
            <div class="phase-stepper">\${phaseStepperHtml}</div>
            <div class="progress-bar"><div class="progress-fill" style="width: \${overallProgress}%"></div></div>
            <div class="mission-progress-info">
              <span>\${tasksCompleted} / \${tasksTotal} tasks</span>
              <span>\${Math.round(overallProgress)}%</span>
              \${etaHtml}
            </div>
            \${tasksHtml}
            \${controlsHtml}
          </div>
        \`;
      }).join('');
    }

    function updateMissionProgress({ missionId, progress }) {
      const m = state.activeMissions?.find(m => m.id === missionId);
      if (m) { m.progress = progress; updateMissionUI(); }
    }

    function newMission() {
      vscode.postMessage({ type: 'sendCommand', command: '/mission' });
    }

    function pauseMission(missionId) {
      vscode.postMessage({ type: 'pauseMission', missionId });
    }

    function resumeMission(missionId) {
      vscode.postMessage({ type: 'resumeMission', missionId });
    }

    function cancelMission(missionId) {
      vscode.postMessage({ type: 'cancelMission', missionId });
    }

    function retryTask(taskId) {
      vscode.postMessage({ type: 'retryTask', taskId });
    }

    function rollbackMission(missionId) {
      vscode.postMessage({ type: 'rollbackMission', missionId });
    }

    function clearCompleted() {
      vscode.postMessage({ type: 'clearCompleted' });
    }

    // Activity
    function updateActivityUI() {
      const allActivities = state.activities || [];
      const activities = filterActivities(allActivities);

      // Count by status
      const thinking = allActivities.filter(a => a.status === 'thinking');
      const completed = allActivities.filter(a => a.status === 'completed');
      const failed = allActivities.filter(a => a.status === 'failed');

      // Update active count badge
      const activeCountEl = document.getElementById('activeCount');
      activeCountEl.textContent = thinking.length.toString();
      activeCountEl.classList.toggle('hidden', thinking.length === 0);

      document.getElementById('activityCount').textContent = \`\${activities.length} entries\`;

      const container = document.getElementById('activityList');
      if (activities.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-title">No activities</div></div>';
      } else {
        container.innerHTML = activities.slice(0, 50).map(a => {
          const time = a.timestamp ? new Date(a.timestamp).toLocaleTimeString() : '';
          const level = a.level || 'worker';
          const metrics = a.metrics || {};
          const durationMs = metrics.durationMs || a.durationMs;
          const tokensUsed = (metrics.tokensSent || 0) + (metrics.tokensReceived || 0) || a.tokensUsed;

          let errorHtml = '';
          if (a.status === 'failed' && a.error) {
            errorHtml = \`<div class="activity-error">\${escapeHtml(a.error)}</div>\`;
          }

          return \`
            <div class="activity-item \${level}">
              <div class="activity-header">
                <span class="activity-agent">\${escapeHtml(a.agentId || 'Agent')}</span>
                <span class="activity-time">\${time}</span>
              </div>
              <div class="activity-content">\${escapeHtml(a.prompt || a.message || '')}</div>
              <div class="activity-metrics">
                <span class="activity-status"><span class="activity-status-dot \${a.status || 'unknown'}"></span>\${a.status || 'unknown'}</span>
                \${durationMs ? \`<span>\${(durationMs/1000).toFixed(1)}s</span>\` : ''}
                \${tokensUsed ? \`<span>\${formatNumber(tokensUsed)} tok</span>\` : ''}
              </div>
              \${errorHtml}
            </div>
          \`;
        }).join('');
      }

      // Stats
      const avgDuration = completed.length > 0 ? completed.reduce((s,a) => s + ((a.metrics?.durationMs || a.durationMs) || 0), 0) / completed.length / 1000 : 0;
      const totalTokens = allActivities.reduce((s,a) => {
        const m = a.metrics || {};
        return s + ((m.tokensSent || 0) + (m.tokensReceived || 0) || a.tokensUsed || 0);
      }, 0);
      const successRate = allActivities.length > 0 ? (completed.length / allActivities.length * 100) : 0;

      document.getElementById('avgDuration').textContent = avgDuration.toFixed(1) + 's';
      document.getElementById('totalTokens').textContent = formatNumber(totalTokens);
      document.getElementById('successRate').textContent = successRate.toFixed(0) + '%';
      document.getElementById('failedCount').textContent = failed.length.toString();
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

    // Agents
    function updateAgentsUI() {
      const container = document.getElementById('agentTree');
      const summary = document.getElementById('agentsSummary');

      if (!state.agents) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-title">No active agents</div><div class="empty-state-subtitle">Agents appear when a mission starts</div></div>';
        return;
      }

      function renderNode(node, depth = 0) {
        const children = (node.children || []).map(c => renderNode(c, depth + 1)).join('');
        return \`
          <div class="agent-node" style="margin-left: \${depth * 16}px">
            <div class="agent-row \${node.level}">
              <span class="status-indicator \${node.status}"></span>
              <div class="agent-info">
                <div class="agent-name">\${node.level.toUpperCase()}</div>
                <div class="agent-task">\${escapeHtml(node.currentTask || 'Idle')}</div>
              </div>
            </div>
            \${children}
          </div>
        \`;
      }

      container.innerHTML = renderNode(state.agents);

      function countAgents(node, c = { sovereign: 0, overlord: 0, lord: 0, worker: 0 }) {
        c[node.level]++;
        (node.children || []).forEach(ch => countAgents(ch, c));
        return c;
      }
      const counts = countAgents(state.agents);
      summary.innerHTML = \`
        <div class="agent-item"><span class="agent-dot sovereign"></span>Sov: \${counts.sovereign}</div>
        <div class="agent-item"><span class="agent-dot overlord"></span>Ovr: \${counts.overlord}</div>
        <div class="agent-item"><span class="agent-dot lord"></span>Lord: \${counts.lord}</div>
        <div class="agent-item"><span class="agent-dot worker"></span>Wrk: \${counts.worker}</div>
      \`;
    }

    function pauseAll() { vscode.postMessage({ type: 'pauseAll' }); }
    function resumeAll() { vscode.postMessage({ type: 'resumeAll' }); }

    // Quota
    function updateQuotaUI() {
      if (!state.quota) return;

      // Find earliest reset time for header badge
      let earliestReset = Infinity;

      ['claude', 'glm'].forEach(p => {
        const q = state.quota[p];
        if (!q) return;

        const usage = q.currentWindow?.usage ?? { callCount: 0, tokensSent: 0, tokensReceived: 0, byLevel: {} };
        const percent = (q.usageRatio * 100).toFixed(0);
        const totalTokens = usage.tokensSent + usage.tokensReceived;

        // Update basic display
        document.getElementById(\`\${p}Percent\`).textContent = percent + '%';
        const bar = document.getElementById(\`\${p}Bar\`);
        bar.style.width = percent + '%';
        bar.className = 'quota-fill ' + (q.status || 'ok');
        document.getElementById(\`\${p}Calls\`).textContent = usage.callCount + ' calls';
        document.getElementById(\`\${p}Tokens\`).textContent = formatNumber(totalTokens) + ' tok';

        // Update details
        document.getElementById(\`\${p}TokensSent\`).textContent = formatNumber(usage.tokensSent);
        document.getElementById(\`\${p}TokensRecv\`).textContent = formatNumber(usage.tokensReceived);
        document.getElementById(\`\${p}Reset\`).textContent = formatTimeRemaining(q.timeUntilResetMs);

        // Update level breakdown
        const levelsEl = document.getElementById(\`\${p}Levels\`);
        const levels = ['sovereign', 'overlord', 'lord', 'worker'];
        const levelColors = { sovereign: 'var(--sovereign)', overlord: 'var(--overlord)', lord: 'var(--lord)', worker: 'var(--worker)' };
        levelsEl.innerHTML = levels.map(level => {
          const levelData = usage.byLevel?.[level] ?? { callCount: 0 };
          return \`<div class="quota-level-item"><span class="quota-level-dot" style="background:\${levelColors[level]}"></span>\${level.charAt(0).toUpperCase()}: \${levelData.callCount}</div>\`;
        }).join('');

        // Track earliest reset
        if (q.timeUntilResetMs < earliestReset) {
          earliestReset = q.timeUntilResetMs;
        }
      });

      // Update header reset timer
      document.getElementById('quotaResetTimer').textContent = formatTimeRemaining(earliestReset);
    }

    function toggleQuotaDetails(provider) {
      const el = document.getElementById(\`\${provider}Details\`);
      if (el) el.classList.toggle('hidden');
    }

    function formatTimeRemaining(ms) {
      if (!ms || ms <= 0) return '0:00';
      const hours = Math.floor(ms / 3600000);
      const mins = Math.floor((ms % 3600000) / 60000);
      if (hours > 0) return \`\${hours}h \${mins}m\`;
      const secs = Math.floor((ms % 60000) / 1000);
      return \`\${mins}:\${secs.toString().padStart(2, '0')}\`;
    }

    // Approvals
    function formatTimeAgo(date) {
      if (!date) return '';
      const now = new Date();
      const then = new Date(date);
      const diffMs = now.getTime() - then.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'just now';
      if (diffMins < 60) return \`\${diffMins}m ago\`;
      const diffHours = Math.floor(diffMins / 60);
      return \`\${diffHours}h ago\`;
    }

    function updateApprovalsUI() {
      const container = document.getElementById('approvalsWidget');
      const badge = document.getElementById('approvalsBadge');
      const count = state.pendingApprovals?.length ?? 0;
      badge.textContent = count;
      badge.className = 'widget-badge' + (count > 0 ? ' warning' : '');
      if (count === 0) {
        container.innerHTML = '<div class="text-muted" style="font-size: 10px;">No pending approvals</div>';
        return;
      }
      container.innerHTML = state.pendingApprovals.slice(0, 5).map(a => {
        const changes = a.changes || [];
        const fileCount = changes.length;
        const fileNames = changes.slice(0, 2).map(c => {
          const path = c.filePath || c.file || '';
          return path.split(/[/\\\\]/).pop() || path;
        }).join(', ');
        const moreFiles = fileCount > 2 ? \` +\${fileCount - 2} more\` : '';
        const timeAgo = formatTimeAgo(a.requestedAt);

        return \`
          <div class="approval-item">
            <div class="approval-header">
              <span class="approval-task">\${escapeHtml(a.taskId || 'Task')}</span>
              <span class="approval-time">\${timeAgo}</span>
            </div>
            <div class="approval-meta">\${fileCount} file\${fileCount !== 1 ? 's' : ''} to change</div>
            \${fileNames ? \`<div class="approval-files">\${escapeHtml(fileNames)}\${moreFiles}</div>\` : ''}
            <div class="approval-actions">
              <button class="approval-btn" onclick="viewDiff('\${a.id}')">Diff</button>
              <button class="approval-btn approve" onclick="approveChange('\${a.id}')">Approve</button>
              <button class="approval-btn reject" onclick="rejectChange('\${a.id}')">Reject</button>
            </div>
          </div>
        \`;
      }).join('');

      // Add "View All" link if more than shown
      if (count > 5) {
        container.innerHTML += \`<div style="text-align: center; margin-top: 4px;"><button class="approval-btn" onclick="showAllApprovals()">\${count - 5} more...</button></div>\`;
      }
    }

    function viewDiff(id) { vscode.postMessage({ type: 'viewDiff', approvalId: id }); }
    function approveChange(id) { vscode.postMessage({ type: 'approveChange', approvalId: id }); }
    function rejectChange(id) { vscode.postMessage({ type: 'rejectChange', approvalId: id }); }
    function showAllApprovals() { vscode.postMessage({ type: 'approveTask' }); }

    // Conflicts
    function updateConflictsUI() {
      const container = document.getElementById('conflictsWidget');
      const badge = document.getElementById('conflictsBadge');
      const count = state.conflicts?.length ?? 0;
      badge.textContent = count;
      badge.className = 'widget-badge' + (count > 0 ? ' error' : '');
      if (count === 0) {
        container.innerHTML = '<div class="text-muted" style="font-size: 10px;">No merge conflicts</div>';
        return;
      }
      container.innerHTML = state.conflicts.slice(0, 5).map(c => {
        const filePath = c.filePath || c.file || '';
        const fileName = filePath.split(/[/\\\\]/).pop() || filePath;
        const branch1Agent = c.branch1?.agentId || 'Agent 1';
        const branch2Agent = c.branch2?.agentId || 'Agent 2';
        const regionCount = c.conflictingRegions?.length ?? 0;

        return \`
          <div class="conflict-item">
            <div class="conflict-header">
              <span class="conflict-file">\${escapeHtml(fileName)}</span>
            </div>
            <div class="conflict-branches">\${escapeHtml(branch1Agent)} vs \${escapeHtml(branch2Agent)}</div>
            <div class="conflict-regions">\${regionCount} conflicting region\${regionCount !== 1 ? 's' : ''}</div>
            <div class="conflict-actions">
              <button class="conflict-btn" onclick="viewConflictDiff('\${c.id}')">View</button>
              <button class="conflict-btn auto" onclick="resolveConflict('\${c.id}', 'auto')">Auto</button>
              <button class="conflict-btn ai" onclick="resolveConflict('\${c.id}', 'ai')">AI</button>
              <button class="conflict-btn" onclick="resolveConflict('\${c.id}', 'manual')">Manual</button>
            </div>
          </div>
        \`;
      }).join('');

      if (count > 5) {
        container.innerHTML += \`<div style="text-align: center; margin-top: 4px;"><button class="conflict-btn" onclick="showConflicts()">\${count - 5} more...</button></div>\`;
      }
    }

    function showConflicts() { vscode.postMessage({ type: 'showConflicts' }); }
    function viewConflictDiff(id) { vscode.postMessage({ type: 'viewConflictDiff', conflictId: id }); }
    function resolveConflict(id, strategy) { vscode.postMessage({ type: 'resolveConflict', conflictId: id, strategy: strategy }); }

    // Performance
    function updatePerformanceUI() {
      const perf = state.performance;
      if (!perf || !perf.stats || perf.stats.length === 0) {
        document.getElementById('perfOpsCount').textContent = '0';
        document.getElementById('perfTotalTime').textContent = '0ms';
        document.getElementById('perfTopOps').innerHTML = '<div class="text-muted" style="font-size: 10px;">No data yet</div>';
        return;
      }

      const stats = perf.stats;
      const totalOps = stats.reduce((sum, s) => sum + s.count, 0);
      const totalTime = stats.reduce((sum, s) => sum + s.totalMs, 0);

      document.getElementById('perfOpsCount').textContent = totalOps.toString();
      document.getElementById('perfTotalTime').textContent = totalTime > 1000 ? (totalTime / 1000).toFixed(1) + 's' : totalTime.toFixed(0) + 'ms';

      // Show top 5 slowest operations
      const topOps = stats.slice(0, 5);
      document.getElementById('perfTopOps').innerHTML = topOps.map(op => {
        const isSlow = op.avgMs > 1000;
        return \`<div class="perf-op">
          <span class="perf-op-name" title="\${escapeHtml(op.name)}">\${escapeHtml(op.name)}</span>
          <span class="perf-op-time \${isSlow ? 'perf-op-slow' : ''}">\${op.avgMs.toFixed(0)}ms x\${op.count}</span>
        </div>\`;
      }).join('');
    }

    function refreshPerformance() {
      vscode.postMessage({ type: 'getPerformance' });
    }

    // Actions
    function refresh() { vscode.postMessage({ type: 'refresh' }); }

    // Update all
    function updateAllUI() {
      updateChatUI();
      updateMissionUI();
      updateActivityUI();
      updateAgentsUI();
      updateQuotaUI();
      updateApprovalsUI();
      updateConflictsUI();
      updatePerformanceUI();
      updateSettingsUI();
    }

    // Utilities
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

    // Request initial settings
    vscode.postMessage({ type: 'getSettings' });
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
