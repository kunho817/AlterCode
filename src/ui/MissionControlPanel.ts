/**
 * Mission Control Panel
 *
 * Unified full-screen dashboard with tabbed navigation.
 * Features inline mission progress cards in chat (like Cursor's tool execution view).
 */

import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { AlterCodeCore } from '../core/AlterCodeCore';
import { WebviewMessage, HiveState } from '../types';
import { getClaudeCliValidator } from '../utils/ClaudeCliValidator';
import { ConfigurationManager } from '../utils/ConfigurationManager';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  streaming?: boolean;
  missionId?: string; // Links message to a mission for inline progress
}

export class MissionControlPanel {
  public static currentPanel: MissionControlPanel | undefined;
  private static readonly viewType = 'altercodeMissionControl';

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly core: AlterCodeCore;
  private readonly configManager: ConfigurationManager;
  private disposables: vscode.Disposable[] = [];

  private messages: ChatMessage[] = [];
  private activeProcess: ChildProcess | null = null;
  private currentStreamingId: string | null = null;

  public static createOrShow(
    extensionUri: vscode.Uri,
    core: AlterCodeCore,
    configManager: ConfigurationManager
  ): void {
    const column = vscode.window.activeTextEditor?.viewColumn;

    if (MissionControlPanel.currentPanel) {
      MissionControlPanel.currentPanel.panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      MissionControlPanel.viewType,
      'AlterCode',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );

    MissionControlPanel.currentPanel = new MissionControlPanel(
      panel,
      extensionUri,
      core,
      configManager
    );
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    core: AlterCodeCore,
    configManager: ConfigurationManager
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.core = core;
    this.configManager = configManager;

    this.panel.webview.html = this.getHtmlContent();

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      (message: WebviewMessage) => this.handleMessage(message),
      null,
      this.disposables
    );

    const stateDisposable = this.core.onStateChange((state) => {
      this.sendStateUpdate(state);
    });
    this.disposables.push(stateDisposable);

    this.sendInitialState();
  }

  private async sendInitialState(): Promise<void> {
    this.sendStateUpdate(this.core.getHiveState());

    const config = this.configManager.getConfig();
    this.postMessage({
      type: 'configUpdate',
      payload: {
        approvalMode: config.approvalMode,
        maxConcurrentWorkers: config.hierarchy.maxConcurrentWorkers,
        enableSpecialists: config.hierarchy.enableSpecialists,
        glmConfigured: this.configManager.isGLMConfigured(),
      },
    });

    const validator = getClaudeCliValidator();
    const cliStatus = await validator.validate(config.claude.cliPath);
    this.postMessage({ type: 'cliStatus', payload: cliStatus });

    this.postMessage({ type: 'messagesUpdate', payload: this.messages });
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    switch (message.type) {
      case 'sendMessage':
        await this.handleSendMessage(message.payload.content, message.payload.mode);
        break;

      case 'cancelGeneration':
        this.cancelGeneration();
        break;

      case 'clearChat':
        this.messages = [];
        this.postMessage({ type: 'messagesUpdate', payload: [] });
        break;

      case 'updateConfig':
        await this.handleConfigUpdate(message.payload);
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

      case 'approvalResponse':
        await this.core.respondToApproval(
          message.payload.approvalId,
          message.payload.response
        );
        break;

      case 'openSettings':
        vscode.commands.executeCommand('altercode.configure');
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
    }
  }

  private async handleSendMessage(content: string, mode: string): Promise<void> {
    const userMsg: ChatMessage = {
      id: this.generateId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    this.messages.push(userMsg);
    this.postMessage({ type: 'addMessage', payload: userMsg });

    if (mode === 'mission') {
      await this.handleMissionMode(content);
    } else {
      await this.handleChatMode(content, mode);
    }
  }

  private async handleChatMode(content: string, mode: string): Promise<void> {
    const assistantId = this.generateId();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      streaming: true,
    };
    this.messages.push(assistantMsg);
    this.currentStreamingId = assistantId;
    this.postMessage({ type: 'addMessage', payload: assistantMsg });

    try {
      const systemPrompt = this.getSystemPrompt(mode);
      const fullPrompt = systemPrompt ? `${systemPrompt}\n\n---\n\nUser Request:\n${content}` : content;
      await this.streamClaudeResponse(fullPrompt, assistantId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.updateStreamingMessage(assistantId, `Error: ${errorMessage}`, false);
    }
  }

  private async handleMissionMode(content: string): Promise<void> {
    // Create a message that will show inline progress
    const missionMsgId = this.generateId();

    try {
      // Start the mission
      const mission = await this.core.submitPlanningDocument(content);

      // Add assistant message linked to this mission for inline progress
      const assistantMsg: ChatMessage = {
        id: missionMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        missionId: mission.id,
      };
      this.messages.push(assistantMsg);
      this.postMessage({ type: 'addMessage', payload: assistantMsg });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorMsg: ChatMessage = {
        id: missionMsgId,
        role: 'assistant',
        content: `Failed to create mission: ${errorMessage}`,
        timestamp: Date.now(),
      };
      this.messages.push(errorMsg);
      this.postMessage({ type: 'addMessage', payload: errorMsg });
    }
  }

  private streamClaudeResponse(prompt: string, messageId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const config = this.configManager.getConfig();
      const cliPath = config.claude.cliPath || 'claude';
      const args = ['--print', '--output-format', 'stream-json', '-'];

      this.activeProcess = spawn(cliPath, args, {
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          CLAUDE_CODE_MAX_OUTPUT_TOKENS: String(config.claude.maxOutputTokens),
        },
      });

      let fullContent = '';
      let buffer = '';

      this.activeProcess.stdout?.on('data', (data: Buffer) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line);
            if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
              fullContent += chunk.delta.text;
              this.updateStreamingMessage(messageId, fullContent, true);
            } else if (chunk.type === 'text') {
              fullContent += chunk.content || '';
              this.updateStreamingMessage(messageId, fullContent, true);
            }
          } catch {
            fullContent += line;
            this.updateStreamingMessage(messageId, fullContent, true);
          }
        }
      });

      this.activeProcess.stderr?.on('data', (data: Buffer) => {
        console.error('[Claude stderr]:', data.toString());
      });

      this.activeProcess.on('error', (error: Error) => {
        this.activeProcess = null;
        reject(error);
      });

      this.activeProcess.on('close', (code: number | null) => {
        this.activeProcess = null;
        if (buffer.trim()) fullContent += buffer;

        if (!fullContent.trim() && code === 0) {
          this.fallbackNonStreaming(prompt, messageId).then(resolve).catch(reject);
          return;
        }

        this.updateStreamingMessage(messageId, fullContent || 'No response received.', false);
        resolve();
      });

      this.activeProcess.stdin?.write(prompt);
      this.activeProcess.stdin?.end();

      setTimeout(() => {
        if (this.activeProcess) {
          this.activeProcess.kill('SIGTERM');
          reject(new Error('Request timed out'));
        }
      }, 120000);
    });
  }

  private fallbackNonStreaming(prompt: string, messageId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const config = this.configManager.getConfig();
      const cliPath = config.claude.cliPath || 'claude';

      const proc = spawn(cliPath, ['--print', '--output-format', 'text', '-'], {
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';

      proc.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
        this.updateStreamingMessage(messageId, stdout, true);
      });

      proc.on('close', () => {
        this.updateStreamingMessage(messageId, stdout || 'No response received.', false);
        resolve();
      });

      proc.on('error', reject);

      proc.stdin?.write(prompt);
      proc.stdin?.end();
    });
  }

  private cancelGeneration(): void {
    if (this.activeProcess) {
      this.activeProcess.kill('SIGTERM');
      this.activeProcess = null;
    }

    if (this.currentStreamingId) {
      const msg = this.messages.find((m) => m.id === this.currentStreamingId);
      if (msg) {
        msg.streaming = false;
        msg.content += '\n\n[Cancelled]';
        this.postMessage({ type: 'updateMessage', payload: msg });
      }
      this.currentStreamingId = null;
    }
  }

  private updateStreamingMessage(id: string, content: string, streaming: boolean): void {
    const msg = this.messages.find((m) => m.id === id);
    if (msg) {
      msg.content = content;
      msg.streaming = streaming;
      this.postMessage({ type: 'updateMessage', payload: msg });
    }
  }

  private async handleConfigUpdate(payload: Record<string, unknown>): Promise<void> {
    const config = vscode.workspace.getConfiguration('altercode');

    if (payload.approvalMode !== undefined) {
      await config.update('approvalMode', payload.approvalMode, true);
    }
    if (payload.maxConcurrentWorkers !== undefined) {
      await config.update('hierarchy.maxConcurrentWorkers', payload.maxConcurrentWorkers, true);
    }
    if (payload.enableSpecialists !== undefined) {
      await config.update('hierarchy.enableSpecialists', payload.enableSpecialists, true);
    }

    this.postMessage({
      type: 'configUpdate',
      payload: {
        approvalMode: payload.approvalMode ?? this.configManager.getConfig().approvalMode,
        maxConcurrentWorkers: payload.maxConcurrentWorkers ?? this.configManager.getConfig().hierarchy.maxConcurrentWorkers,
        enableSpecialists: payload.enableSpecialists ?? this.configManager.getConfig().hierarchy.enableSpecialists,
        glmConfigured: this.configManager.isGLMConfigured(),
      },
    });
  }

  private getSystemPrompt(mode: string): string {
    switch (mode) {
      case 'code':
        return 'You are a coding assistant. Provide clear, concise code examples. Use markdown code blocks.';
      case 'architect':
        return 'You are a software architect. Focus on system design, scalability, and best practices.';
      default:
        return '';
    }
  }

  private sendStateUpdate(state: HiveState): void {
    this.postMessage({ type: 'stateUpdate', payload: state });
  }

  private postMessage(message: { type: string; payload: unknown }): void {
    this.panel.webview.postMessage(message);
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  public dispose(): void {
    MissionControlPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const d = this.disposables.pop();
      if (d) d.dispose();
    }
  }

  private getHtmlContent(): string {
    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>AlterCode</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family);
      font-size: 13px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* Header with tabs */
    .header {
      display: flex;
      align-items: center;
      border-bottom: 1px solid var(--vscode-panel-border);
      flex-shrink: 0;
    }

    .tabs {
      display: flex;
      flex: 1;
    }

    .tab {
      padding: 10px 20px;
      background: none;
      border: none;
      color: var(--vscode-foreground);
      cursor: pointer;
      font-size: 12px;
      opacity: 0.6;
      border-bottom: 2px solid transparent;
    }

    .tab:hover { opacity: 0.8; }
    .tab.active { opacity: 1; border-bottom-color: var(--vscode-focusBorder); }

    .header-actions {
      display: flex;
      gap: 4px;
      padding: 0 12px;
    }

    .header-btn {
      padding: 4px 8px;
      background: none;
      border: 1px solid var(--vscode-input-border);
      color: var(--vscode-foreground);
      font-size: 11px;
      cursor: pointer;
      opacity: 0.7;
    }

    .header-btn:hover { opacity: 1; }
    .header-btn:disabled { opacity: 0.3; cursor: not-allowed; }

    /* Tab content */
    .tab-content { flex: 1; overflow: hidden; display: none; flex-direction: column; }
    .tab-content.active { display: flex; }

    /* Chat tab */
    .chat-container { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

    .messages { flex: 1; overflow-y: auto; padding: 16px; }

    .message { margin-bottom: 16px; max-width: 900px; }

    .message-header {
      font-size: 11px;
      font-weight: 500;
      margin-bottom: 4px;
      color: var(--vscode-descriptionForeground);
    }

    .message-content {
      padding: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
      border-left: 2px solid transparent;
      background: var(--vscode-editor-background);
    }

    .message.user .message-content {
      border-left-color: var(--vscode-button-background);
      background: var(--vscode-sideBar-background);
    }

    .message.assistant .message-content {
      border-left-color: var(--vscode-descriptionForeground);
    }

    .message.assistant.streaming .message-content::after {
      content: '|';
      animation: blink 0.8s infinite;
    }

    @keyframes blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } }

    /* Code styling */
    .message-content code {
      background: var(--vscode-textCodeBlock-background);
      padding: 1px 4px;
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
    }
    .message-content pre {
      background: var(--vscode-textCodeBlock-background);
      padding: 12px;
      overflow-x: auto;
      margin: 8px 0;
    }
    .message-content pre code { background: none; padding: 0; }

    /* Inline Mission Progress Card */
    .mission-card {
      border: 1px solid var(--vscode-panel-border);
      margin: 8px 0;
      background: var(--vscode-sideBar-background);
    }

    .mission-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
      cursor: pointer;
    }

    .mission-card-header:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .mission-card-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 500;
    }

    .mission-card-status {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }

    .mission-card-progress {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .progress-bar {
      width: 100px;
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
      min-width: 35px;
    }

    .mission-card-body {
      padding: 12px;
      display: none;
    }

    .mission-card.expanded .mission-card-body {
      display: block;
    }

    .mission-card-body.collapsed {
      display: none;
    }

    /* Hierarchy tree */
    .hierarchy-section {
      margin-bottom: 12px;
    }

    .section-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 6px;
    }

    .hierarchy-node {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 0;
      font-size: 12px;
    }

    .hierarchy-node.level-1 { padding-left: 16px; }
    .hierarchy-node.level-2 { padding-left: 32px; }
    .hierarchy-node.level-3 { padding-left: 48px; }
    .hierarchy-node.level-4 { padding-left: 64px; }
    .hierarchy-node.level-5 { padding-left: 80px; }

    .node-connector {
      color: var(--vscode-panel-border);
    }

    .node-role {
      flex: 1;
    }

    .node-status {
      font-size: 10px;
      padding: 1px 6px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }

    .node-status.busy { background: var(--vscode-testing-iconQueued); }
    .node-status.idle { background: var(--vscode-descriptionForeground); }
    .node-status.done { background: var(--vscode-testing-iconPassed); }

    /* Tasks list */
    .tasks-section { margin-top: 12px; }

    .task-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 0;
      font-size: 12px;
    }

    .task-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }

    .task-dot.running { background: var(--vscode-charts-blue); animation: pulse 1s infinite; }
    .task-dot.pending { background: var(--vscode-charts-yellow); }
    .task-dot.done { background: var(--vscode-charts-green); }

    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

    .task-title { flex: 1; }

    /* Mission controls */
    .mission-controls {
      display: flex;
      gap: 8px;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--vscode-panel-border);
    }

    .mission-btn {
      padding: 4px 12px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      font-size: 11px;
      cursor: pointer;
    }

    .mission-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .mission-btn:disabled { opacity: 0.4; cursor: not-allowed; }

    /* Input area */
    .input-area {
      padding: 12px 16px;
      border-top: 1px solid var(--vscode-panel-border);
      background: var(--vscode-sideBar-background);
    }

    .mode-selector {
      display: flex;
      gap: 4px;
      margin-bottom: 8px;
    }

    .mode-btn {
      padding: 4px 12px;
      background: none;
      border: 1px solid var(--vscode-input-border);
      color: var(--vscode-foreground);
      font-size: 11px;
      cursor: pointer;
      opacity: 0.6;
    }

    .mode-btn:hover { opacity: 0.8; }
    .mode-btn.active {
      opacity: 1;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-color: var(--vscode-button-background);
    }

    .input-row { display: flex; gap: 8px; }

    textarea {
      flex: 1;
      min-height: 36px;
      max-height: 150px;
      padding: 8px 12px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      resize: none;
      font-family: inherit;
      font-size: 13px;
      line-height: 1.4;
    }

    textarea:focus { outline: none; border-color: var(--vscode-focusBorder); }

    .send-btn {
      padding: 8px 16px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      cursor: pointer;
      font-size: 12px;
    }

    .send-btn:hover { background: var(--vscode-button-hoverBackground); }
    .send-btn.cancel { background: var(--vscode-errorForeground); }

    /* Settings tab */
    .settings-container {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      max-width: 600px;
    }

    .settings-section {
      margin-bottom: 24px;
    }

    .settings-section-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 12px;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .setting-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 0;
    }

    .setting-info { flex: 1; }
    .setting-label { font-size: 13px; }
    .setting-desc { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 2px; }

    select, input[type="number"] {
      padding: 6px 10px;
      background: var(--vscode-dropdown-background);
      color: var(--vscode-dropdown-foreground);
      border: 1px solid var(--vscode-dropdown-border);
      font-size: 12px;
    }

    input[type="number"] { width: 70px; }

    .toggle {
      width: 36px;
      height: 18px;
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      cursor: pointer;
      position: relative;
    }

    .toggle::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 12px;
      height: 12px;
      background: var(--vscode-foreground);
      transition: transform 0.1s;
    }

    .toggle.active { background: var(--vscode-button-background); border-color: var(--vscode-button-background); }
    .toggle.active::after { transform: translateX(18px); background: var(--vscode-button-foreground); }

    /* CLI status */
    .cli-status {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px;
      background: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-panel-border);
      margin-bottom: 16px;
    }

    .cli-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .cli-dot.ok { background: var(--vscode-testing-iconPassed); }
    .cli-dot.warning { background: var(--vscode-testing-iconQueued); }
    .cli-dot.error { background: var(--vscode-testing-iconFailed); }

    .cli-info { flex: 1; }
    .cli-title { font-size: 13px; font-weight: 500; }
    .cli-detail { font-size: 11px; color: var(--vscode-descriptionForeground); }

    /* Empty state */
    .empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      color: var(--vscode-descriptionForeground);
    }

    .empty-state h3 { color: var(--vscode-foreground); margin-bottom: 4px; }

    /* Status bar */
    .status-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 12px;
      border-top: 1px solid var(--vscode-panel-border);
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-statusBar-background);
    }

    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }

    .status-dot.ready { background: var(--vscode-testing-iconPassed); }
    .status-dot.busy { background: var(--vscode-testing-iconQueued); animation: pulse 1.5s infinite; }

    /* Scrollbar */
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-thumb { background: var(--vscode-scrollbarSlider-background); }
    ::-webkit-scrollbar-thumb:hover { background: var(--vscode-scrollbarSlider-hoverBackground); }
  </style>
</head>
<body>
  <div class="header">
    <div class="tabs">
      <button class="tab active" data-tab="chat">Chat</button>
      <button class="tab" data-tab="settings">Settings</button>
    </div>
    <div class="header-actions">
      <button class="header-btn" id="newChatBtn">New Chat</button>
    </div>
  </div>

  <!-- Chat Tab -->
  <div class="tab-content active" id="chatTab">
    <div class="chat-container">
      <div class="messages" id="messages">
        <div class="empty-state" id="emptyState">
          <h3>AlterCode</h3>
          <p>Ask questions, get code help, or start a mission.</p>
        </div>
      </div>

      <div class="input-area">
        <div class="mode-selector">
          <button class="mode-btn active" data-mode="chat">Chat</button>
          <button class="mode-btn" data-mode="code">Code</button>
          <button class="mode-btn" data-mode="architect">Architect</button>
          <button class="mode-btn" data-mode="mission">Mission</button>
        </div>
        <div class="input-row">
          <textarea id="input" placeholder="Ask anything..." rows="1"></textarea>
          <button class="send-btn" id="sendBtn">Send</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Settings Tab -->
  <div class="tab-content" id="settingsTab">
    <div class="settings-container">
      <div class="cli-status">
        <div class="cli-dot" id="cliDot"></div>
        <div class="cli-info">
          <div class="cli-title">Claude CLI</div>
          <div class="cli-detail" id="cliStatusDetail">Checking...</div>
        </div>
        <button class="header-btn" id="cliCheckBtn">Check</button>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">Workflow</div>

        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Approval Mode</div>
            <div class="setting-desc">How code changes are approved before applying</div>
          </div>
          <select id="approvalMode">
            <option value="fully_manual">Manual Review</option>
            <option value="step_by_step">Step by Step</option>
            <option value="full_automation">Full Auto</option>
          </select>
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Max Concurrent Workers</div>
            <div class="setting-desc">Maximum parallel worker agents</div>
          </div>
          <input type="number" id="maxWorkers" min="1" max="50" value="10">
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Enable Specialists</div>
            <div class="setting-desc">Use Level 4 specialist agents for complex tasks</div>
          </div>
          <div class="toggle" id="enableSpecialists"></div>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">API Configuration</div>

        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">GLM API</div>
            <div class="setting-desc" id="glmStatus">Not configured</div>
          </div>
        </div>

        <button class="header-btn" id="openVSCodeSettings" style="margin-top: 12px">Open VS Code Settings</button>
      </div>
    </div>
  </div>

  <div class="status-bar">
    <span class="status-dot" id="statusDot"></span>
    <span id="statusText">Ready</span>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    let currentMode = 'chat';
    let isStreaming = false;
    let hiveState = null;
    let config = {};
    let expandedMissions = new Set();

    const messagesEl = document.getElementById('messages');
    const emptyState = document.getElementById('emptyState');
    const inputEl = document.getElementById('input');
    const sendBtn = document.getElementById('sendBtn');
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');

    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabId = tab.dataset.tab;
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tabId + 'Tab').classList.add('active');
      });
    });

    // Mode selection
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentMode = btn.dataset.mode;
        const placeholders = {
          chat: 'Ask anything...',
          code: 'Describe the code you need...',
          architect: 'Describe the system to design...',
          mission: 'Describe your project goals...'
        };
        inputEl.placeholder = placeholders[currentMode] || 'Ask anything...';
      });
    });

    // Message handling
    window.addEventListener('message', event => {
      const msg = event.data;
      switch (msg.type) {
        case 'stateUpdate': hiveState = msg.payload; updateMissionCards(); updateStatusBar(); break;
        case 'configUpdate': config = msg.payload; updateSettingsUI(); break;
        case 'cliStatus': updateCliStatus(msg.payload); break;
        case 'messagesUpdate': renderMessages(msg.payload); break;
        case 'addMessage': addMessage(msg.payload); break;
        case 'updateMessage': updateMessage(msg.payload); break;
      }
    });

    function renderMessages(messages) {
      if (messages.length === 0) {
        messagesEl.innerHTML = '';
        messagesEl.appendChild(emptyState);
        emptyState.style.display = 'flex';
        return;
      }
      emptyState.style.display = 'none';
      messagesEl.innerHTML = '';
      messages.forEach(msg => addMessageToDOM(msg));
    }

    function addMessage(msg) {
      emptyState.style.display = 'none';
      addMessageToDOM(msg);
      if (msg.streaming) {
        isStreaming = true;
        sendBtn.textContent = 'Stop';
        sendBtn.classList.add('cancel');
      }
    }

    function updateMessage(msg) {
      const el = document.getElementById('msg-' + msg.id);
      if (el) {
        if (msg.missionId) {
          // Update mission card
          updateMissionCards();
        } else {
          const content = el.querySelector('.message-content');
          if (content) {
            content.innerHTML = formatMarkdown(msg.content);
          }
        }

        if (msg.streaming) {
          el.classList.add('streaming');
        } else {
          el.classList.remove('streaming');
          isStreaming = false;
          sendBtn.textContent = 'Send';
          sendBtn.classList.remove('cancel');
        }
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    }

    function addMessageToDOM(msg) {
      const div = document.createElement('div');
      div.id = 'msg-' + msg.id;
      div.className = 'message ' + msg.role + (msg.streaming ? ' streaming' : '');

      if (msg.missionId) {
        // Mission message - render with inline progress card
        div.innerHTML = renderMissionCard(msg.missionId);
        expandedMissions.add(msg.missionId);
      } else {
        const label = msg.role === 'user' ? 'You' : 'Assistant';
        div.innerHTML = '<div class="message-header">' + label + '</div><div class="message-content">' + formatMarkdown(msg.content) + '</div>';
      }

      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function renderMissionCard(missionId) {
      if (!hiveState || !hiveState.activeMission) {
        return '<div class="message-content">Starting mission...</div>';
      }

      const mission = hiveState.activeMission;
      if (mission.id !== missionId && !hiveState.completedMissions?.find(m => m.id === missionId)) {
        return '<div class="message-content">Mission not found</div>';
      }

      const { taskQueue, runningTasks, completedTasks, agents } = hiveState;
      const total = taskQueue.length + runningTasks.length + completedTasks.length;
      const progress = total > 0 ? Math.round((completedTasks.length / total) * 100) : 0;
      const isExpanded = expandedMissions.has(missionId);

      let html = '<div class="mission-card' + (isExpanded ? ' expanded' : '') + '" data-mission="' + missionId + '">';

      // Header (always visible)
      html += '<div class="mission-card-header" onclick="toggleMissionCard(\\'' + missionId + '\\')">';
      html += '<div class="mission-card-title">';
      html += '<span>' + (isExpanded ? '▼' : '▶') + '</span>';
      html += '<span>' + mission.title + '</span>';
      html += '</div>';
      html += '<div class="mission-card-progress">';
      html += '<div class="progress-bar"><div class="progress-fill" style="width:' + progress + '%"></div></div>';
      html += '<span class="progress-text">' + progress + '%</span>';
      html += '<span class="mission-card-status">' + mission.status + '</span>';
      html += '</div>';
      html += '</div>';

      // Body (collapsible)
      html += '<div class="mission-card-body">';

      // Hierarchy
      if (agents && agents.length > 0) {
        html += '<div class="hierarchy-section">';
        html += '<div class="section-label">Hierarchy</div>';
        agents.sort((a, b) => a.level - b.level).forEach(agent => {
          const task = runningTasks.find(t => t.assignedAgentId === agent.id);
          html += '<div class="hierarchy-node level-' + agent.level + '">';
          html += '<span class="node-connector">' + (agent.level > 0 ? '└─' : '') + '</span>';
          html += '<span class="node-role">' + formatRole(agent.role) + (task ? ': ' + task.title.substring(0, 30) : '') + '</span>';
          html += '<span class="node-status ' + agent.status + '">' + agent.status + '</span>';
          html += '</div>';
        });
        html += '</div>';
      }

      // Tasks
      const allTasks = [...runningTasks, ...taskQueue.slice(0, 5)];
      if (allTasks.length > 0) {
        html += '<div class="tasks-section">';
        html += '<div class="section-label">Tasks</div>';
        allTasks.forEach(task => {
          const status = runningTasks.includes(task) ? 'running' : 'pending';
          html += '<div class="task-row">';
          html += '<div class="task-dot ' + status + '"></div>';
          html += '<span class="task-title">' + task.title + '</span>';
          html += '</div>';
        });
        if (taskQueue.length > 5) {
          html += '<div class="task-row" style="color:var(--vscode-descriptionForeground)">+ ' + (taskQueue.length - 5) + ' more pending</div>';
        }
        html += '</div>';
      }

      // Controls
      html += '<div class="mission-controls">';
      html += '<button class="mission-btn" onclick="pauseMission(\\'' + missionId + '\\')"' + (mission.status !== 'executing' ? ' disabled' : '') + '>Pause</button>';
      html += '<button class="mission-btn" onclick="resumeMission(\\'' + missionId + '\\')"' + (mission.status !== 'paused' ? ' disabled' : '') + '>Resume</button>';
      html += '<button class="mission-btn" onclick="cancelMission(\\'' + missionId + '\\')">Cancel</button>';
      html += '</div>';

      html += '</div>'; // body
      html += '</div>'; // card

      return html;
    }

    function updateMissionCards() {
      document.querySelectorAll('.mission-card').forEach(card => {
        const missionId = card.dataset.mission;
        if (missionId) {
          const parent = card.parentElement;
          if (parent) {
            parent.innerHTML = renderMissionCard(missionId);
          }
        }
      });
    }

    window.toggleMissionCard = function(missionId) {
      if (expandedMissions.has(missionId)) {
        expandedMissions.delete(missionId);
      } else {
        expandedMissions.add(missionId);
      }
      updateMissionCards();
    };

    window.pauseMission = function(missionId) {
      vscode.postMessage({ type: 'pauseMission', payload: { missionId } });
    };

    window.resumeMission = function(missionId) {
      vscode.postMessage({ type: 'resumeMission', payload: { missionId } });
    };

    window.cancelMission = function(missionId) {
      vscode.postMessage({ type: 'cancelMission', payload: { missionId } });
    };

    function formatRole(role) {
      return role.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    }

    function formatMarkdown(text) {
      if (!text) return '';
      return text
        .replace(/\`\`\`(\\w*)\\n([\\s\\S]*?)\`\`\`/g, '<pre><code>$2</code></pre>')
        .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
        .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
        .replace(/\\n/g, '<br>');
    }

    function updateStatusBar() {
      if (!hiveState) return;
      const { activeMission, taskQueue, runningTasks, completedTasks, agents } = hiveState;

      if (activeMission) {
        const total = taskQueue.length + runningTasks.length + completedTasks.length;
        const progress = total > 0 ? Math.round((completedTasks.length / total) * 100) : 0;
        const busyAgents = agents.filter(a => a.status === 'busy').length;
        statusDot.className = 'status-dot busy';
        statusText.textContent = busyAgents + ' agents | ' + progress + '% complete';
      } else if (isStreaming) {
        statusDot.className = 'status-dot busy';
        statusText.textContent = 'Generating...';
      } else {
        statusDot.className = 'status-dot ready';
        statusText.textContent = 'Ready';
      }
    }

    function updateCliStatus(status) {
      const cliDot = document.getElementById('cliDot');
      const cliDetail = document.getElementById('cliStatusDetail');
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

    function updateSettingsUI() {
      document.getElementById('approvalMode').value = config.approvalMode || 'fully_manual';
      document.getElementById('maxWorkers').value = config.maxConcurrentWorkers || 10;
      const toggle = document.getElementById('enableSpecialists');
      if (config.enableSpecialists) {
        toggle.classList.add('active');
      } else {
        toggle.classList.remove('active');
      }
      document.getElementById('glmStatus').textContent = config.glmConfigured ? 'Configured' : 'Not configured';
    }

    function send() {
      if (isStreaming) {
        vscode.postMessage({ type: 'cancelGeneration' });
        return;
      }
      const content = inputEl.value.trim();
      if (!content) return;
      vscode.postMessage({ type: 'sendMessage', payload: { content, mode: currentMode } });
      inputEl.value = '';
      inputEl.style.height = 'auto';
    }

    sendBtn.addEventListener('click', send);
    inputEl.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    inputEl.addEventListener('input', () => { inputEl.style.height = 'auto'; inputEl.style.height = Math.min(inputEl.scrollHeight, 150) + 'px'; });

    document.getElementById('newChatBtn').addEventListener('click', () => { vscode.postMessage({ type: 'clearChat' }); });
    document.getElementById('cliCheckBtn').addEventListener('click', () => { vscode.postMessage({ type: 'checkCli' }); });

    document.getElementById('approvalMode').addEventListener('change', e => {
      vscode.postMessage({ type: 'updateConfig', payload: { approvalMode: e.target.value } });
    });

    document.getElementById('maxWorkers').addEventListener('change', e => {
      vscode.postMessage({ type: 'updateConfig', payload: { maxConcurrentWorkers: parseInt(e.target.value) } });
    });

    document.getElementById('enableSpecialists').addEventListener('click', e => {
      const toggle = e.currentTarget;
      const isActive = toggle.classList.toggle('active');
      vscode.postMessage({ type: 'updateConfig', payload: { enableSpecialists: isActive } });
    });

    document.getElementById('openVSCodeSettings').addEventListener('click', () => {
      vscode.postMessage({ type: 'openSettings' });
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
