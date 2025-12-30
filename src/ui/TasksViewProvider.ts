/**
 * Tasks View Provider
 * Shows the task queue and status
 */

import * as vscode from 'vscode';
import { AlterCodeCore } from '../core/AlterCodeCore';

export class TasksViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'altercode.tasksView';

  private readonly extensionUri: vscode.Uri;
  private readonly core: AlterCodeCore;
  private view?: vscode.WebviewView;

  constructor(extensionUri: vscode.Uri, core: AlterCodeCore) {
    this.extensionUri = extensionUri;
    this.core = core;
    this.core.onStateChange(() => this.refresh());
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    this.refresh();
  }

  private refresh(): void {
    if (!this.view) return;

    const state = this.core.getHiveState();
    const pending = state.taskQueue || [];
    const running = state.runningTasks || [];
    const completed = state.completedTasks || [];

    const totalTasks = pending.length + running.length + completed.length;

    this.view.webview.html = `<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: 13px;
      color: var(--vscode-foreground);
      padding: 12px;
    }
    .empty {
      color: var(--vscode-descriptionForeground);
      text-align: center;
      padding: 20px;
    }
    .section {
      margin-bottom: 16px;
    }
    .section-header {
      font-size: 11px;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    .task {
      padding: 8px;
      margin: 4px 0;
      background: var(--vscode-input-background);
      border-radius: 4px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .task-status {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .task-status.pending { background: var(--vscode-charts-yellow); }
    .task-status.running { background: var(--vscode-charts-blue); }
    .task-status.completed { background: var(--vscode-charts-green); }
    .task-title {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .task-level {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
    }
    .stats {
      display: flex;
      gap: 12px;
      padding: 8px;
      background: var(--vscode-input-background);
      border-radius: 4px;
      margin-bottom: 12px;
    }
    .stat {
      text-align: center;
    }
    .stat-value {
      font-size: 18px;
      font-weight: 600;
    }
    .stat-label {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  ${totalTasks === 0 ? `
    <div class="empty">
      <p>No tasks</p>
      <p style="font-size: 11px;">Start a mission to see tasks</p>
    </div>
  ` : `
    <div class="stats">
      <div class="stat">
        <div class="stat-value">${pending.length}</div>
        <div class="stat-label">Pending</div>
      </div>
      <div class="stat">
        <div class="stat-value">${running.length}</div>
        <div class="stat-label">Running</div>
      </div>
      <div class="stat">
        <div class="stat-value">${completed.length}</div>
        <div class="stat-label">Done</div>
      </div>
    </div>

    ${running.length > 0 ? `
      <div class="section">
        <div class="section-header">Running</div>
        ${running.map(t => `
          <div class="task">
            <div class="task-status running"></div>
            <div class="task-title">${t.title}</div>
            <div class="task-level">L${t.level}</div>
          </div>
        `).join('')}
      </div>
    ` : ''}

    ${pending.length > 0 ? `
      <div class="section">
        <div class="section-header">Pending</div>
        ${pending.slice(0, 10).map(t => `
          <div class="task">
            <div class="task-status pending"></div>
            <div class="task-title">${t.title}</div>
            <div class="task-level">L${t.level}</div>
          </div>
        `).join('')}
        ${pending.length > 10 ? `<div style="font-size: 11px; color: var(--vscode-descriptionForeground);">+ ${pending.length - 10} more</div>` : ''}
      </div>
    ` : ''}

    ${completed.length > 0 ? `
      <div class="section">
        <div class="section-header">Completed</div>
        ${completed.slice(-5).map(t => `
          <div class="task">
            <div class="task-status completed"></div>
            <div class="task-title">${t.title}</div>
            <div class="task-level">L${t.level}</div>
          </div>
        `).join('')}
      </div>
    ` : ''}
  `}
</body>
</html>`;
  }
}
