/**
 * Sidebar Chat Provider - Simple Roo Code Style
 *
 * Unified chat interface with mode selection and real-time responses.
 */

import * as vscode from 'vscode';
import { spawn } from 'child_process';
import { AlterCodeCore } from '../core/AlterCodeCore';
import { WebviewMessage, ExtensionMessage, HiveState } from '../types';

export class SidebarChatProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'altercode.chatView';

  private readonly extensionUri: vscode.Uri;
  private readonly core: AlterCodeCore;
  private view?: vscode.WebviewView;

  constructor(extensionUri: vscode.Uri, core: AlterCodeCore) {
    this.extensionUri = extensionUri;
    this.core = core;
    this.core.onStateChange((state) => this.sendStateUpdate(state));
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    token: vscode.CancellationToken
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

    this.sendStateUpdate(this.core.getHiveState());
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    switch (message.type) {
      case 'submitPlan':
        await this.handleSubmit(message.payload.content, message.payload.mode || 'chat');
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

      case 'openFile':
        try {
          const doc = await vscode.workspace.openTextDocument(message.payload.filePath);
          await vscode.window.showTextDocument(doc);
        } catch (e) {
          vscode.window.showErrorMessage(`Could not open file: ${message.payload.filePath}`);
        }
        break;
    }
  }

  private async handleSubmit(content: string, mode: string): Promise<void> {
    // Send thinking message
    this.sendMessage('thinking', 'Analyzing your request...');

    // For chat/code/architect modes, use direct Claude CLI
    // For mission mode, use the full hierarchy system
    if (mode === 'mission') {
      await this.handleMissionSubmit(content, mode);
    } else {
      await this.handleDirectChat(content, mode);
    }
  }

  /**
   * Direct Claude CLI chat - bypasses hierarchy for simple interactions.
   */
  private async handleDirectChat(content: string, mode: string): Promise<void> {
    try {
      const systemPrompt = this.getSystemPromptForMode(mode);
      const fullPrompt = systemPrompt ? `${systemPrompt}\n\n---\n\nUser Request:\n${content}` : content;

      const response = await this.executeClaudeCLI(fullPrompt);

      this.sendMessage('response', response);
      this.sendMessage('info', `Mode: ${mode.toUpperCase()} | Direct Claude Response`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[SidebarChat] Direct chat error:', error);
      this.sendMessage('error', `Error: ${errorMessage}`);
      this.showDemoResponse(content, mode);
    }
  }

  /**
   * Execute Claude CLI directly via stdin.
   */
  private executeClaudeCLI(prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const childProcess = spawn('claude', ['--print', '--output-format', 'text', '-'], {
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      childProcess.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      childProcess.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      childProcess.on('error', (error: Error) => {
        reject(error);
      });

      childProcess.on('close', (code: number | null) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(stderr || `Process exited with code ${code}`));
        }
      });

      // Write prompt to stdin
      childProcess.stdin.write(prompt);
      childProcess.stdin.end();

      // Timeout after 120 seconds
      setTimeout(() => {
        childProcess.kill('SIGTERM');
        reject(new Error('Request timed out after 120 seconds'));
      }, 120000);
    });
  }

  /**
   * Get system prompt based on mode.
   */
  private getSystemPromptForMode(mode: string): string {
    switch (mode) {
      case 'code':
        return 'You are a coding assistant. Help the user with their code-related questions. Provide clear, concise code examples when appropriate.';
      case 'architect':
        return 'You are a software architect. Help the user design systems, plan architectures, and make technical decisions. Focus on best practices and scalability.';
      case 'review':
        return 'You are a code reviewer. Analyze the provided code for bugs, improvements, and best practices. Be constructive and specific.';
      case 'chat':
      default:
        return 'You are a helpful AI assistant integrated into VS Code. Help the user with their questions.';
    }
  }

  /**
   * Handle mission mode - uses full hierarchy system.
   */
  private async handleMissionSubmit(content: string, mode: string): Promise<void> {
    try {
      const timeoutMs = 130000;

      const missionPromise = this.core.submitPlanningDocument(content);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out')), timeoutMs);
      });

      const mission = await Promise.race([missionPromise, timeoutPromise]);

      this.sendMessage('response', `Mission "${mission.title}" created with ${mission.rootTaskIds.length} tasks.`);
      this.sendMessage('info', `Mode: ${mode} | Status: ${mission.status}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[SidebarChat] Mission error:', error);
      this.sendMessage('error', `Mission Error: ${errorMessage}`);
      this.showDemoResponse(content, mode);
    }
  }

  private showDemoResponse(content: string, mode: string): void {
    const lowerContent = content.toLowerCase();

    // Analyze the request type
    const isReview = lowerContent.includes('review') || mode === 'review';
    const isRefactor = lowerContent.includes('refactor');
    const isExplain = lowerContent.includes('explain');
    const isFeature = lowerContent.includes('add') || lowerContent.includes('implement') || lowerContent.includes('create');

    // Short delay to show thinking state briefly
    setTimeout(() => {
      // First show mode indicator
      this.sendMessage('info', `Mode: ${mode.toUpperCase()} | Demo Mode Active`);

      // Then show contextual response
      setTimeout(() => {
        if (isReview) {
          this.sendMessage('response', `**Code Review Analysis**\n\nI would analyze the code for:\n• Code quality and best practices\n• Potential bugs or issues\n• Performance considerations\n• Security concerns\n\nConfigure AI backends in Settings to enable actual analysis.`);
        } else if (isRefactor) {
          this.sendMessage('response', `**Refactoring Plan**\n\nI would suggest improvements for:\n• Code structure and organization\n• Naming conventions\n• Function decomposition\n• Design patterns\n\nConfigure AI backends in Settings to enable actual refactoring.`);
        } else if (isExplain) {
          this.sendMessage('response', `**Code Explanation**\n\nI would provide:\n• Line-by-line breakdown\n• Logic flow explanation\n• Purpose of each function\n• How components interact\n\nConfigure AI backends in Settings to enable explanations.`);
        } else if (isFeature) {
          this.sendMessage('response', `**Feature Implementation Plan**\n\nBased on your request, the hierarchy would:\n\n1. **Sovereign** - Analyze and decompose the mission\n2. **Architects** - Design domain structures\n3. **Strategists** - Plan feature breakdown\n4. **Team Leads** - Assign specific tasks\n5. **Workers** - Implement the code\n\nConfigure AI backends in Settings to start implementation.`);
        } else {
          this.sendMessage('response', `**Task Received**\n\nYour request: "${content.substring(0, 80)}${content.length > 80 ? '...' : ''}"\n\nProcessing hierarchy:\n👑 Sovereign → 🏛 Architects → 📐 Strategists → 👔 Team Leads → ⚙ Workers\n\nConfigure AI backends in Settings to enable full processing.`);
        }
      }, 300);
    }, 200);
  }

  private sendMessage(type: string, content: string): void {
    if (this.view) {
      this.view.webview.postMessage({
        type: 'chatMessage',
        payload: { type, content, timestamp: Date.now() }
      });
    }
  }

  private sendStateUpdate(state: HiveState): void {
    if (this.view) {
      const message: ExtensionMessage = {
        type: 'stateUpdate',
        payload: state,
      };
      this.view.webview.postMessage(message);
    }
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
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
    }

    .header-btn {
      background: none;
      border: none;
      color: var(--vscode-foreground);
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
      opacity: 0.7;
    }

    .header-btn:hover {
      opacity: 1;
      background: var(--vscode-toolbar-hoverBackground);
    }

    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
    }

    .message {
      margin-bottom: 12px;
      padding: 10px 12px;
      border-radius: 6px;
      background: var(--vscode-input-background);
      line-height: 1.5;
    }

    .message.user {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .message.thinking {
      background: var(--vscode-editorWidget-background);
      border-left: 3px solid var(--vscode-progressBar-background);
      font-style: italic;
      opacity: 0.8;
    }

    .message.error {
      background: var(--vscode-inputValidation-errorBackground);
      border-left: 3px solid var(--vscode-inputValidation-errorBorder);
    }

    .message-header {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
      font-size: 11px;
      opacity: 0.7;
    }

    .message-content {
      white-space: pre-wrap;
      word-break: break-word;
    }

    .message-content strong { font-weight: 600; }

    .empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 20px;
      color: var(--vscode-descriptionForeground);
    }

    .empty-state h3 {
      color: var(--vscode-foreground);
      margin-bottom: 8px;
    }

    .input-area {
      padding: 12px;
      border-top: 1px solid var(--vscode-panel-border);
    }

    .mode-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    .mode-select {
      padding: 4px 8px;
      background: var(--vscode-dropdown-background);
      color: var(--vscode-dropdown-foreground);
      border: 1px solid var(--vscode-dropdown-border);
      border-radius: 4px;
      font-size: 12px;
    }

    .mode-label {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }

    .input-row {
      display: flex;
      gap: 8px;
    }

    textarea {
      flex: 1;
      min-height: 50px;
      max-height: 150px;
      padding: 8px 10px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 6px;
      resize: none;
      font-family: inherit;
      font-size: 13px;
    }

    textarea:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
    }

    .send-btn {
      width: 40px;
      height: 40px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .send-btn:hover { background: var(--vscode-button-hoverBackground); }
    .send-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .status-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      background: var(--vscode-statusBar-background);
      color: var(--vscode-statusBar-foreground);
      font-size: 11px;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--vscode-testing-iconPassed);
    }

    .status-dot.busy {
      background: var(--vscode-testing-iconQueued);
      animation: pulse 1.5s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-thumb { background: var(--vscode-scrollbarSlider-background); border-radius: 3px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <span>🐝</span>
      <span>AlterCode</span>
    </div>
    <button class="header-btn" id="clearBtn" title="New Chat">+</button>
  </div>

  <div class="messages" id="messages">
    <div class="empty-state" id="emptyState">
      <h3>Welcome to AlterCode</h3>
      <p>Describe your task below and I'll orchestrate<br>AI agents to help you complete it.</p>
    </div>
  </div>

  <div class="input-area">
    <div class="mode-row">
      <select class="mode-select" id="modeSelect">
        <option value="auto">Auto</option>
        <option value="architect">Architect</option>
        <option value="code">Code</option>
        <option value="review">Review</option>
      </select>
      <span class="mode-label">Mode</span>
    </div>
    <div class="input-row">
      <textarea id="input" placeholder="Describe your task..."></textarea>
      <button class="send-btn" id="sendBtn">▶</button>
    </div>
  </div>

  <div class="status-bar">
    <span class="status-dot" id="statusDot"></span>
    <span id="statusText">Ready</span>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    const messagesEl = document.getElementById('messages');
    const emptyState = document.getElementById('emptyState');
    const inputEl = document.getElementById('input');
    const sendBtn = document.getElementById('sendBtn');
    const clearBtn = document.getElementById('clearBtn');
    const modeSelect = document.getElementById('modeSelect');
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');

    let isBusy = false;

    window.addEventListener('message', event => {
      const msg = event.data;

      if (msg.type === 'stateUpdate') {
        updateStatus(msg.payload);
      } else if (msg.type === 'chatMessage') {
        addMessage(msg.payload.type, msg.payload.content);
        if (msg.payload.type !== 'thinking') {
          setBusy(false);
        }
      }
    });

    function updateStatus(state) {
      if (state.activeMission) {
        const total = state.taskQueue.length + state.runningTasks.length + state.completedTasks.length;
        const done = state.completedTasks.length;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        const busy = state.agents.filter(a => a.status === 'busy').length;

        statusDot.className = 'status-dot busy';
        statusText.textContent = busy + ' agents • ' + pct + '% complete';
      } else {
        statusDot.className = 'status-dot';
        statusText.textContent = 'Ready';
      }
    }

    function addMessage(type, content) {
      emptyState.style.display = 'none';

      const div = document.createElement('div');
      div.className = 'message ' + type;

      const icon = type === 'user' ? '👤' : type === 'error' ? '❌' : type === 'thinking' ? '💭' : '🐝';
      const label = type === 'user' ? 'You' : type === 'error' ? 'Error' : type === 'thinking' ? 'Thinking' : 'AlterCode';

      div.innerHTML = '<div class="message-header">' + icon + ' ' + label + '</div><div class="message-content">' + formatContent(content) + '</div>';

      // Remove thinking messages when new response arrives
      if (type === 'response' || type === 'error' || type === 'info') {
        const thinkingMsgs = messagesEl.querySelectorAll('.message.thinking');
        thinkingMsgs.forEach(m => m.remove());
      }

      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function formatContent(text) {
      // Basic markdown-like formatting
      return text
        .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
        .replace(/\\n/g, '<br>')
        .replace(/• /g, '&bull; ');
    }

    function setBusy(busy) {
      isBusy = busy;
      sendBtn.disabled = busy;
      if (busy) {
        statusDot.className = 'status-dot busy';
        statusText.textContent = 'Processing...';
      } else {
        statusDot.className = 'status-dot';
        statusText.textContent = 'Ready';
      }
    }

    function send() {
      const content = inputEl.value.trim();
      if (!content || isBusy) return;

      addMessage('user', content);
      setBusy(true);

      vscode.postMessage({
        type: 'submitPlan',
        payload: { content, mode: modeSelect.value }
      });

      inputEl.value = '';
      inputEl.style.height = 'auto';
    }

    sendBtn.addEventListener('click', send);

    inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });

    inputEl.addEventListener('input', () => {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 150) + 'px';
    });

    clearBtn.addEventListener('click', () => {
      messagesEl.innerHTML = '';
      emptyState.style.display = 'flex';
      messagesEl.appendChild(emptyState);
      setBusy(false);
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
