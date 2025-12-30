/**
 * Unified Chat Provider - Ultra-Compact Sidebar Launcher
 *
 * Minimal sidebar that provides quick access to Mission Control.
 * Designed to take minimal vertical space while showing essential status.
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
      font-size: 12px;
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      padding: 8px;
    }

    /* Main Launch Button */
    .launch-btn {
      width: 100%;
      padding: 12px 16px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .launch-btn:hover { background: var(--vscode-button-hoverBackground); }

    /* Compact Status Row */
    .status-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
      padding: 6px 8px;
      background: var(--vscode-editor-background);
      border-radius: 4px;
      font-size: 11px;
    }

    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .status-dot.ok { background: var(--vscode-testing-iconPassed); }
    .status-dot.warning { background: var(--vscode-testing-iconQueued); }
    .status-dot.error { background: var(--vscode-testing-iconFailed); }
    .status-dot.busy { background: var(--vscode-testing-iconQueued); animation: pulse 1.5s infinite; }

    .status-text {
      flex: 1;
      color: var(--vscode-descriptionForeground);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .status-btn {
      padding: 2px 6px;
      background: transparent;
      color: var(--vscode-textLink-foreground);
      border: none;
      font-size: 10px;
      cursor: pointer;
      opacity: 0.8;
    }

    .status-btn:hover { opacity: 1; text-decoration: underline; }

    /* Mission Progress (only shown when active) */
    .mission-bar {
      margin-top: 8px;
      display: none;
    }

    .mission-bar.active { display: block; }

    .mission-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 4px;
    }

    .mission-title {
      font-size: 11px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
    }

    .mission-percent {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      margin-left: 8px;
    }

    .progress-track {
      height: 3px;
      background: var(--vscode-progressBar-background);
      border-radius: 2px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: var(--vscode-button-background);
      transition: width 0.3s ease;
    }

    .mission-controls {
      display: flex;
      gap: 4px;
      margin-top: 6px;
    }

    .ctrl-btn {
      flex: 1;
      padding: 4px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      border-radius: 2px;
      font-size: 10px;
      cursor: pointer;
    }

    .ctrl-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .ctrl-btn:disabled { opacity: 0.4; cursor: not-allowed; }

    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
  </style>
</head>
<body>
  <!-- Main Launch Button -->
  <button class="launch-btn" id="launchBtn">
    <span>Open Mission Control</span>
  </button>

  <!-- CLI Status Row -->
  <div class="status-row">
    <div class="status-dot" id="cliDot"></div>
    <span class="status-text" id="cliText">Checking CLI...</span>
    <button class="status-btn" id="cliBtn">Check</button>
  </div>

  <!-- Mission Progress (hidden when no mission) -->
  <div class="mission-bar" id="missionBar">
    <div class="mission-header">
      <span class="mission-title" id="missionTitle">Mission</span>
      <span class="mission-percent" id="missionPercent">0%</span>
    </div>
    <div class="progress-track">
      <div class="progress-fill" id="progressFill" style="width: 0%"></div>
    </div>
    <div class="mission-controls">
      <button class="ctrl-btn" id="pauseBtn">Pause</button>
      <button class="ctrl-btn" id="resumeBtn" disabled>Resume</button>
      <button class="ctrl-btn" id="cancelBtn">Cancel</button>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    const cliDot = document.getElementById('cliDot');
    const cliText = document.getElementById('cliText');
    const missionBar = document.getElementById('missionBar');
    const missionTitle = document.getElementById('missionTitle');
    const missionPercent = document.getElementById('missionPercent');
    const progressFill = document.getElementById('progressFill');
    const pauseBtn = document.getElementById('pauseBtn');
    const resumeBtn = document.getElementById('resumeBtn');
    const cancelBtn = document.getElementById('cancelBtn');

    let currentMissionId = null;

    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'stateUpdate') updateMission(msg.payload);
      else if (msg.type === 'cliStatus') updateCli(msg.payload);
    });

    function updateCli(status) {
      if (status.installed && status.authenticated) {
        cliDot.className = 'status-dot ok';
        cliText.textContent = 'Claude CLI v' + status.version;
      } else if (status.installed) {
        cliDot.className = 'status-dot warning';
        cliText.textContent = 'CLI needs auth';
      } else {
        cliDot.className = 'status-dot error';
        cliText.textContent = status.error || 'CLI not found';
      }
    }

    function updateMission(state) {
      if (!state || !state.activeMission) {
        missionBar.classList.remove('active');
        currentMissionId = null;
        return;
      }

      const { activeMission, taskQueue, runningTasks, completedTasks } = state;
      currentMissionId = activeMission.id;

      const total = taskQueue.length + runningTasks.length + completedTasks.length;
      const pct = total > 0 ? Math.round((completedTasks.length / total) * 100) : 0;

      missionBar.classList.add('active');
      missionTitle.textContent = activeMission.title;
      missionPercent.textContent = pct + '%';
      progressFill.style.width = pct + '%';

      pauseBtn.disabled = activeMission.status !== 'executing';
      resumeBtn.disabled = activeMission.status !== 'paused';
    }

    document.getElementById('launchBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'openMissionControl' });
    });

    document.getElementById('cliBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'checkCli' });
    });

    pauseBtn.addEventListener('click', () => {
      if (currentMissionId) vscode.postMessage({ type: 'pauseMission', payload: { missionId: currentMissionId } });
    });

    resumeBtn.addEventListener('click', () => {
      if (currentMissionId) vscode.postMessage({ type: 'resumeMission', payload: { missionId: currentMissionId } });
    });

    cancelBtn.addEventListener('click', () => {
      if (currentMissionId) vscode.postMessage({ type: 'cancelMission', payload: { missionId: currentMissionId } });
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
