/**
 * Chat Provider
 *
 * VS Code chat interface provider:
 * - Message handling
 * - Streaming responses
 * - Context integration
 * - History management
 */

import * as vscode from 'vscode';
import {
  IEventBus,
  ILogger,
  FilePath,
  toFilePath,
} from '../types';

import { AlterCodeCore } from '../core/AlterCodeCore';

/**
 * Chat message interface
 */
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

/**
 * Chat Provider implementation
 */
export class ChatProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'altercode.chatView';

  private view?: vscode.WebviewView;
  private readonly extensionUri: vscode.Uri;
  private readonly core: AlterCodeCore;
  private readonly eventBus: IEventBus;
  private readonly logger?: ILogger;

  private messages: ChatMessage[] = [];
  private isProcessing: boolean = false;

  constructor(
    extensionUri: vscode.Uri,
    core: AlterCodeCore,
    eventBus: IEventBus,
    logger?: ILogger
  ) {
    this.extensionUri = extensionUri;
    this.core = core;
    this.eventBus = eventBus;
    this.logger = logger?.child('ChatProvider');
  }

  /**
   * Resolve webview view
   */
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtmlContent();

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(async (message) => {
      await this.handleMessage(message);
    });

    // Restore messages if any
    if (this.messages.length > 0) {
      this.view.webview.postMessage({
        type: 'restore',
        messages: this.messages,
      });
    }
  }

  /**
   * Handle messages from webview
   */
  private async handleMessage(message: any): Promise<void> {
    switch (message.type) {
      case 'send':
        await this.handleUserMessage(message.content);
        break;

      case 'clear':
        this.messages = [];
        this.view?.webview.postMessage({ type: 'cleared' });
        break;

      case 'cancel':
        await this.core.cancelExecution();
        break;

      case 'action':
        await this.handleAction(message.action, message.data);
        break;
    }
  }

  /**
   * Handle user message
   */
  private async handleUserMessage(content: string): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    // Add user message
    const userMessage: ChatMessage = {
      role: 'user',
      content,
      timestamp: new Date(),
    };
    this.messages.push(userMessage);

    this.view?.webview.postMessage({
      type: 'userMessage',
      message: userMessage,
    });

    // Show typing indicator
    this.view?.webview.postMessage({ type: 'typing', isTyping: true });

    try {
      // Get current file context
      const currentFile = this.getCurrentFile();

      // Process message
      const result = await this.core.processMessage(content, {
        currentFile: currentFile ? toFilePath(currentFile) : undefined,
      });

      // Add assistant message
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: result.ok ? result.value.response : `Error: ${result.error.message}`,
        timestamp: new Date(),
      };
      this.messages.push(assistantMessage);

      this.view?.webview.postMessage({
        type: 'assistantMessage',
        message: assistantMessage,
        mission: result.ok ? result.value.mission : undefined,
      });

      // If mission was created, offer to execute
      if (result.ok && result.value.mission) {
        this.view?.webview.postMessage({
          type: 'missionCreated',
          mission: result.value.mission,
        });
      }
    } catch (error) {
      this.logger?.error('Message handling failed', error as Error);

      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: `An error occurred: ${(error as Error).message}`,
        timestamp: new Date(),
      };
      this.messages.push(errorMessage);

      this.view?.webview.postMessage({
        type: 'assistantMessage',
        message: errorMessage,
      });
    } finally {
      this.isProcessing = false;
      this.view?.webview.postMessage({ type: 'typing', isTyping: false });
    }
  }

  /**
   * Handle action button clicks
   */
  private async handleAction(action: string, data: any): Promise<void> {
    switch (action) {
      case 'execute':
        // Execute the mission plan
        this.eventBus.emit('ui:executeMission', { missionId: data.missionId });
        break;

      case 'viewDetails':
        // Show mission details
        vscode.commands.executeCommand('altercode.showMissionControl');
        break;

      case 'insertCode':
        // Insert code at cursor
        const editor = vscode.window.activeTextEditor;
        if (editor && data.code) {
          editor.edit((editBuilder) => {
            editBuilder.insert(editor.selection.active, data.code);
          });
        }
        break;
    }
  }

  /**
   * Get current file path
   */
  private getCurrentFile(): string | undefined {
    const editor = vscode.window.activeTextEditor;
    return editor?.document.uri.fsPath;
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
  <title>AlterCode Chat</title>
  <style>
    :root {
      --bg-primary: var(--vscode-editor-background);
      --bg-secondary: var(--vscode-sideBar-background);
      --bg-input: var(--vscode-input-background);
      --text-primary: var(--vscode-editor-foreground);
      --text-secondary: var(--vscode-descriptionForeground);
      --accent: var(--vscode-button-background);
      --border: var(--vscode-panel-border);
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
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    .chat-container {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .message {
      display: flex;
      gap: 8px;
      max-width: 90%;
    }

    .message.user {
      align-self: flex-end;
      flex-direction: row-reverse;
    }

    .message-content {
      padding: 8px 12px;
      border-radius: 12px;
      font-size: 13px;
      line-height: 1.4;
    }

    .message.user .message-content {
      background: var(--accent);
      color: var(--vscode-button-foreground);
      border-bottom-right-radius: 4px;
    }

    .message.assistant .message-content {
      background: var(--bg-secondary);
      border-bottom-left-radius: 4px;
    }

    .message-content pre {
      background: var(--bg-primary);
      padding: 8px;
      border-radius: 4px;
      overflow-x: auto;
      margin: 8px 0;
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
    }

    .message-content code {
      font-family: var(--vscode-editor-font-family);
      background: var(--bg-primary);
      padding: 2px 4px;
      border-radius: 3px;
    }

    .typing-indicator {
      display: flex;
      gap: 4px;
      padding: 12px;
      opacity: 0.7;
    }

    .typing-dot {
      width: 6px;
      height: 6px;
      background: var(--text-secondary);
      border-radius: 50%;
      animation: typing 1.4s infinite ease-in-out;
    }

    .typing-dot:nth-child(2) { animation-delay: 0.2s; }
    .typing-dot:nth-child(3) { animation-delay: 0.4s; }

    @keyframes typing {
      0%, 60%, 100% { transform: translateY(0); }
      30% { transform: translateY(-4px); }
    }

    .mission-card {
      background: var(--bg-secondary);
      border-radius: 8px;
      padding: 12px;
      margin-top: 8px;
      border-left: 3px solid var(--accent);
    }

    .mission-card h4 {
      font-size: 12px;
      margin-bottom: 8px;
    }

    .mission-actions {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }

    .mission-actions button {
      flex: 1;
      padding: 6px 12px;
      border-radius: 4px;
      border: none;
      font-size: 11px;
      cursor: pointer;
    }

    .btn-primary {
      background: var(--accent);
      color: var(--vscode-button-foreground);
    }

    .btn-secondary {
      background: var(--bg-primary);
      color: var(--text-primary);
      border: 1px solid var(--border);
    }

    .input-container {
      display: flex;
      gap: 8px;
      padding: 12px;
      border-top: 1px solid var(--border);
      background: var(--bg-secondary);
    }

    .input-container textarea {
      flex: 1;
      background: var(--bg-input);
      color: var(--text-primary);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 8px 12px;
      font-family: inherit;
      font-size: 13px;
      resize: none;
      min-height: 38px;
      max-height: 120px;
    }

    .input-container textarea:focus {
      outline: none;
      border-color: var(--accent);
    }

    .input-container button {
      background: var(--accent);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 6px;
      padding: 8px 16px;
      cursor: pointer;
      font-size: 13px;
    }

    .input-container button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .welcome {
      text-align: center;
      padding: 24px;
      color: var(--text-secondary);
    }

    .welcome h2 {
      font-size: 16px;
      margin-bottom: 8px;
      color: var(--text-primary);
    }

    .welcome p {
      font-size: 12px;
      line-height: 1.5;
    }

    .suggestions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 16px;
      justify-content: center;
    }

    .suggestion {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 6px 12px;
      font-size: 11px;
      cursor: pointer;
    }

    .suggestion:hover {
      background: var(--accent);
      color: var(--vscode-button-foreground);
      border-color: var(--accent);
    }
  </style>
</head>
<body>
  <div class="chat-container" id="chatContainer">
    <div class="welcome">
      <h2>🐝 AlterCode</h2>
      <p>I can help you understand, modify, and improve your code.<br>Ask me anything about your project!</p>
      <div class="suggestions">
        <span class="suggestion" onclick="sendSuggestion('What does this codebase do?')">What does this codebase do?</span>
        <span class="suggestion" onclick="sendSuggestion('Find potential bugs')">Find potential bugs</span>
        <span class="suggestion" onclick="sendSuggestion('Explain this file')">Explain this file</span>
      </div>
    </div>
  </div>

  <div id="typingIndicator" class="typing-indicator" style="display: none;">
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
  </div>

  <div class="input-container">
    <textarea
      id="messageInput"
      placeholder="Ask me anything..."
      rows="1"
      onkeydown="handleKeyDown(event)"
      oninput="autoResize(this)"
    ></textarea>
    <button id="sendButton" onclick="sendMessage()">Send</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const chatContainer = document.getElementById('chatContainer');
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');
    const typingIndicator = document.getElementById('typingIndicator');

    let isProcessing = false;

    // Handle messages from extension
    window.addEventListener('message', event => {
      const message = event.data;

      switch (message.type) {
        case 'userMessage':
          addMessage(message.message);
          break;

        case 'assistantMessage':
          addMessage(message.message, message.mission);
          break;

        case 'typing':
          typingIndicator.style.display = message.isTyping ? 'flex' : 'none';
          isProcessing = message.isTyping;
          sendButton.disabled = message.isTyping;
          break;

        case 'missionCreated':
          // Mission card is added with the assistant message
          break;

        case 'restore':
          chatContainer.innerHTML = '';
          message.messages.forEach(msg => addMessage(msg));
          break;

        case 'cleared':
          chatContainer.innerHTML = renderWelcome();
          break;
      }
    });

    function addMessage(msg, mission) {
      // Remove welcome message if present
      const welcome = chatContainer.querySelector('.welcome');
      if (welcome) {
        welcome.remove();
      }

      const messageDiv = document.createElement('div');
      messageDiv.className = 'message ' + msg.role;

      let content = formatContent(msg.content);

      if (mission) {
        content += renderMissionCard(mission);
      }

      messageDiv.innerHTML = '<div class="message-content">' + content + '</div>';
      chatContainer.appendChild(messageDiv);
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    function formatContent(text) {
      // Basic markdown-like formatting
      return text
        .replace(/\`\`\`(\\w*)\\n([\\s\\S]*?)\`\`\`/g, '<pre><code>$2</code></pre>')
        .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
        .replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>')
        .replace(/\\n/g, '<br>');
    }

    function renderMissionCard(mission) {
      return \`
        <div class="mission-card">
          <h4>📋 Mission Created</h4>
          <div style="font-size: 12px; color: var(--text-secondary);">
            \${escapeHtml(mission.title)}
          </div>
          <div class="mission-actions">
            <button class="btn-primary" onclick="executeAction('execute', { missionId: '\${mission.id}' })">
              Execute Plan
            </button>
            <button class="btn-secondary" onclick="executeAction('viewDetails', { missionId: '\${mission.id}' })">
              View Details
            </button>
          </div>
        </div>
      \`;
    }

    function renderWelcome() {
      return \`
        <div class="welcome">
          <h2>🐝 AlterCode</h2>
          <p>I can help you understand, modify, and improve your code.<br>Ask me anything about your project!</p>
          <div class="suggestions">
            <span class="suggestion" onclick="sendSuggestion('What does this codebase do?')">What does this codebase do?</span>
            <span class="suggestion" onclick="sendSuggestion('Find potential bugs')">Find potential bugs</span>
            <span class="suggestion" onclick="sendSuggestion('Explain this file')">Explain this file</span>
          </div>
        </div>
      \`;
    }

    function sendMessage() {
      const content = messageInput.value.trim();
      if (!content || isProcessing) return;

      vscode.postMessage({ type: 'send', content });
      messageInput.value = '';
      autoResize(messageInput);
    }

    function sendSuggestion(text) {
      messageInput.value = text;
      sendMessage();
    }

    function executeAction(action, data) {
      vscode.postMessage({ type: 'action', action, data });
    }

    function handleKeyDown(event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    }

    function autoResize(textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  </script>
</body>
</html>`;
  }

  /**
   * Clear chat history
   */
  public clearHistory(): void {
    this.messages = [];
    this.view?.webview.postMessage({ type: 'cleared' });
  }

  /**
   * Add a system message
   */
  public addSystemMessage(content: string): void {
    const message: ChatMessage = {
      role: 'assistant',
      content,
      timestamp: new Date(),
    };
    this.messages.push(message);
    this.view?.webview.postMessage({
      type: 'assistantMessage',
      message,
    });
  }
}
