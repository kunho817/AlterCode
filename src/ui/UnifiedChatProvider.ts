/**
 * Unified Chat Provider
 *
 * A minimal sidebar launcher that provides quick access to Mission Control
 * and shows status at a glance.
 */

import * as vscode from 'vscode';
import { AlterCodeCore } from '../core/AlterCodeCore';
import { WebviewMessage, HiveState } from '../types';
import { getClaudeCliValidator } from '../utils/ClaudeCliValidator';
import { ConfigurationManager } from '../utils/ConfigurationManager';

export class UnifiedChatProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'altercode.chatView';

  private readonly extensionUri: vscode.Uri;
  private readonly core: AlterCodeCore;
  private readonly configManager: ConfigurationManager;
  private view?: vscode.WebviewView;

  constructor(
    extensionUri: vscode.Uri,
    core: AlterCodeCore,
    configManager: ConfigurationManager
  ) {
    this.extensionUri = extensionUri;
    this.core = core;
    this.configManager = configManager;
    this.core.onStateChange((state) => this.sendStateUpdate(state));
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtmlContent(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((message: WebviewMessage) => {
      this.handleMessage(message);
    });

    this.sendInitialState();
  }

  private async sendInitialState(): Promise<void> {
    this.sendStateUpdate(this.core.getHiveState());

    const validator = getClaudeCliValidator();
    const config = this.configManager.getConfig();
    const cliStatus = await validator.validate(config.claude.cliPath);
    this.postMessage({ type: 'cliStatus', payload: cliStatus });
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    switch (message.type) {
      case 'openMissionControl':
        vscode.commands.executeCommand('altercode.showMissionControl');
        break;

      case 'checkCli':
        const validator = getClaudeCliValidator();
        validator.clearCache();
        const status = await validator.validate();
        this.postMessage({ type: 'cliStatus', payload: status });
        if (!status.installed) {
          await validator.showInstallationPrompt();
        }
        break;

      case 'pauseMission':
        await this.core.pauseMission(message.payload.missionId);
        break;

      case 'resumeMission':
        await this.core.resumeMission(message.payload.missionId);
        break;

      case 'cancelMission':
        await this.core.cancelMission(message.payload.missionId);
        break;

      case 'openSettings':
        vscode.commands.executeCommand('altercode.configure');
        break;
    }
  }

  private sendStateUpdate(state: HiveState): void {
    this.postMessage({ type: 'stateUpdate', payload: state });
  }

  private postMessage(message: { type: string; payload: unknown }): void {
    this.view?.webview.postMessage(message);
  }

  private getHtmlContent(webview: vscode.Webview): string {
    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>AlterCode</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family);
      font-size: 13px;
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      height: 100vh;
      display: flex;
      flex-direction: column;
      padding: 12px;
      gap: 12px;
    }

    .section {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      padding: 12px;
    }

    .section-title {
      font-size: 11px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 8px;
    }

    /* CLI Status */
    .cli-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .cli-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .cli-dot.ok { background: var(--vscode-testing-iconPassed); }
    .cli-dot.warning { background: var(--vscode-testing-iconQueued); }
    .cli-dot.error { background: var(--vscode-testing-iconFailed); }

    .cli-info { flex: 1; }
    .cli-title { font-size: 12px; font-weight: 500; }
    .cli-detail { font-size: 11px; color: var(--vscode-descriptionForeground); }

    .btn-small {
      padding: 4px 8px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      font-size: 11px;
      cursor: pointer;
    }

    .btn-small:hover { background: var(--vscode-button-secondaryHoverBackground); }

    /* Mission Status */
    .mission-empty {
      text-align: center;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      padding: 8px 0;
    }

    .mission-active {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .mission-title {
      font-weight: 500;
      font-size: 13px;
    }

    .mission-progress-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .progress-bar {
      flex: 1;
      height: 4px;
      background: var(--vscode-progressBar-background);
    }

    .progress-fill {
      height: 100%;
      background: var(--vscode-button-background);
      transition: width 0.2s;
    }

    .progress-text {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      min-width: 32px;
      text-align: right;
    }

    .mission-stats {
      display: flex;
      gap: 12px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }

    .mission-controls {
      display: flex;
      gap: 4px;
    }

    /* Open Button */
    .open-btn {
      width: 100%;
      padding: 10px 16px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      font-size: 13px;
      cursor: pointer;
      font-weight: 500;
    }

    .open-btn:hover { background: var(--vscode-button-hoverBackground); }

    /* Quick Actions */
    .quick-actions {
      display: flex;
      gap: 8px;
    }

    .action-btn {
      flex: 1;
      padding: 8px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      font-size: 12px;
      cursor: pointer;
    }

    .action-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }

    /* Footer */
    .footer {
      margin-top: auto;
      text-align: center;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }

    .footer a {
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
      cursor: pointer;
    }

    .footer a:hover { text-decoration: underline; }

    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    .pulse { animation: pulse 1.5s infinite; }
  </style>
</head>
<body>
  <!-- Main Open Button -->
  <button class="open-btn" id="openBtn">Open Mission Control</button>

  <!-- CLI Status -->
  <div class="section">
    <div class="cli-row">
      <div class="cli-dot" id="cliDot"></div>
      <div class="cli-info">
        <div class="cli-title">Claude CLI</div>
        <div class="cli-detail" id="cliDetail">Checking...</div>
      </div>
      <button class="btn-small" id="cliCheckBtn">Check</button>
    </div>
  </div>

  <!-- Mission Status -->
  <div class="section">
    <div class="section-title">Current Mission</div>
    <div id="missionStatus">
      <div class="mission-empty">No active mission</div>
    </div>
  </div>

  <!-- Quick Actions -->
  <div class="quick-actions">
    <button class="action-btn" id="settingsBtn">Settings</button>
  </div>

  <!-- Footer -->
  <div class="footer">
    <a id="helpLink">Help</a>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let hiveState = null;

    const cliDot = document.getElementById('cliDot');
    const cliDetail = document.getElementById('cliDetail');
    const missionStatus = document.getElementById('missionStatus');

    window.addEventListener('message', event => {
      const msg = event.data;
      switch (msg.type) {
        case 'stateUpdate':
          hiveState = msg.payload;
          updateMissionStatus();
          break;
        case 'cliStatus':
          updateCliStatus(msg.payload);
          break;
      }
    });

    function updateCliStatus(status) {
      if (status.installed && status.authenticated) {
        cliDot.className = 'cli-dot ok';
        cliDetail.textContent = 'Ready (v' + status.version + ')';
      } else if (status.installed) {
        cliDot.className = 'cli-dot warning';
        cliDetail.textContent = 'Needs authentication';
      } else {
        cliDot.className = 'cli-dot error';
        cliDetail.textContent = status.error || 'Not installed';
      }
    }

    function updateMissionStatus() {
      if (!hiveState || !hiveState.activeMission) {
        missionStatus.innerHTML = '<div class="mission-empty">No active mission</div>';
        return;
      }

      const { activeMission, taskQueue, runningTasks, completedTasks, agents } = hiveState;
      const total = taskQueue.length + runningTasks.length + completedTasks.length;
      const progress = total > 0 ? Math.round((completedTasks.length / total) * 100) : 0;
      const busyAgents = agents.filter(a => a.status === 'busy').length;

      let html = '<div class="mission-active">';
      html += '<div class="mission-title">' + activeMission.title + '</div>';
      html += '<div class="mission-progress-row">';
      html += '<div class="progress-bar"><div class="progress-fill" style="width:' + progress + '%"></div></div>';
      html += '<span class="progress-text">' + progress + '%</span>';
      html += '</div>';
      html += '<div class="mission-stats">';
      html += '<span>' + completedTasks.length + '/' + total + ' tasks</span>';
      html += '<span>' + busyAgents + ' agents</span>';
      html += '<span class="' + (activeMission.status === 'executing' ? 'pulse' : '') + '">' + activeMission.status + '</span>';
      html += '</div>';
      html += '<div class="mission-controls">';
      html += '<button class="btn-small" id="pauseBtn"' + (activeMission.status !== 'executing' ? ' disabled' : '') + '>Pause</button>';
      html += '<button class="btn-small" id="resumeBtn"' + (activeMission.status !== 'paused' ? ' disabled' : '') + '>Resume</button>';
      html += '<button class="btn-small" id="cancelBtn">Cancel</button>';
      html += '</div>';
      html += '</div>';

      missionStatus.innerHTML = html;

      document.getElementById('pauseBtn')?.addEventListener('click', () => {
        vscode.postMessage({ type: 'pauseMission', payload: { missionId: activeMission.id } });
      });
      document.getElementById('resumeBtn')?.addEventListener('click', () => {
        vscode.postMessage({ type: 'resumeMission', payload: { missionId: activeMission.id } });
      });
      document.getElementById('cancelBtn')?.addEventListener('click', () => {
        vscode.postMessage({ type: 'cancelMission', payload: { missionId: activeMission.id } });
      });
    }

    document.getElementById('openBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'openMissionControl' });
    });

    document.getElementById('cliCheckBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'checkCli' });
    });

    document.getElementById('settingsBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'openSettings' });
    });

    document.getElementById('helpLink').addEventListener('click', () => {
      vscode.postMessage({ type: 'openMissionControl' });
    });
  </script>
</body>
</html>`;
  }

  private getNonce(): string {
    let text = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
  }
}
