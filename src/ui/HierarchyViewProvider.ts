/**
 * Hierarchy View Provider
 * Shows the agent hierarchy tree
 */

import * as vscode from 'vscode';
import { AlterCodeCore } from '../core/AlterCodeCore';

export class HierarchyViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'altercode.hierarchyView';

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
    const agents = state.agents || [];

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
    .agent {
      padding: 8px;
      margin: 4px 0;
      background: var(--vscode-input-background);
      border-radius: 4px;
    }
    .agent-level {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }
    .agent-role {
      font-weight: 600;
    }
    .hierarchy-tree {
      margin-left: 16px;
      border-left: 1px solid var(--vscode-panel-border);
      padding-left: 12px;
    }
  </style>
</head>
<body>
  ${agents.length === 0 ? `
    <div class="empty">
      <p>No active agents</p>
      <p style="font-size: 11px;">Start a mission to see the agent hierarchy</p>
    </div>
  ` : `
    <div class="agent">
      <div class="agent-level">Level 0</div>
      <div class="agent-role">👑 Sovereign</div>
    </div>
    <div class="hierarchy-tree">
      ${agents.map(a => `
        <div class="agent">
          <div class="agent-level">Level ${a.level}</div>
          <div class="agent-role">${this.getRoleIcon(a.role)} ${a.role}</div>
        </div>
      `).join('')}
    </div>
  `}
</body>
</html>`;
  }

  private getRoleIcon(role: string): string {
    const icons: Record<string, string> = {
      'sovereign': '👑',
      'frontend_architect': '🏛',
      'backend_architect': '🏛',
      'feature_strategist': '📐',
      'team_lead': '👔',
      'specialist': '⚙',
      'worker': '🔧',
    };
    return icons[role.toLowerCase()] || '🤖';
  }
}
