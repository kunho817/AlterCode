/**
 * ChatHandler - Handles streaming chat messages
 *
 * This handler bridges the gap between the webview and the AlterCodeCore,
 * providing real-time streaming of responses, tool calls, and thinking indicators.
 */

import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import { AlterCodeCore } from '../../core/AlterCodeCore';
import { IEventBus, ILogger, toFilePath } from '../../types';
import type { WebviewProvider } from '../WebviewProvider';
import type { ChatSendMessage, Attachment } from '../messages/WebviewMessage';
import type { ErrorInfo, ChatMessage } from '../messages/ExtensionMessage';

export class ChatHandler {
  private readonly core: AlterCodeCore;
  private readonly eventBus: IEventBus;
  private readonly logger?: ILogger;
  private readonly provider: WebviewProvider;

  private messages: ChatMessage[] = [];
  private currentAbortController: AbortController | null = null;

  constructor(
    core: AlterCodeCore,
    eventBus: IEventBus,
    provider: WebviewProvider,
    logger?: ILogger
  ) {
    this.core = core;
    this.eventBus = eventBus;
    this.provider = provider;
    this.logger = logger?.child('ChatHandler');

    this.setupEventListeners();
  }

  /**
   * Handle chat:send message from webview
   */
  async handleSend(message: ChatSendMessage): Promise<void> {
    const { content, attachments } = message;

    // Add user message
    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
      attachments,
    };
    this.messages.push(userMessage);

    // Get current file context
    const currentFile = this.getCurrentFile();
    const context = currentFile ? { currentFile: toFilePath(currentFile) } : {};

    // Add any file attachments to context
    if (attachments && attachments.length > 0) {
      // TODO: Process attachments into context
    }

    // Get model info
    const vsConfig = vscode.workspace.getConfiguration('altercode');
    const model = vsConfig.get<string>('claude.model', 'claude-opus-4-5-20251101');

    // Start streaming
    const messageId = this.provider.startStreaming(model);
    this.currentAbortController = new AbortController();

    try {
      // Check if core supports streaming
      if (typeof (this.core as any).streamMessage === 'function') {
        await this.handleStreamingResponse(messageId, content, context);
      } else {
        // Fallback to blocking response
        await this.handleBlockingResponse(messageId, content, context);
      }
    } catch (error) {
      this.handleError(messageId, error as Error);
    }
  }

  /**
   * Handle streaming response (if available)
   */
  private async handleStreamingResponse(
    messageId: string,
    content: string,
    context: Record<string, any>
  ): Promise<void> {
    const abortSignal = this.currentAbortController?.signal;

    try {
      // Use streaming API if available
      const streamGenerator = (this.core as any).streamMessage(content, {
        ...context,
        abortSignal,
      });

      let fullContent = '';
      let usage: any = undefined;

      for await (const chunk of streamGenerator) {
        if (abortSignal?.aborted) {
          break;
        }

        switch (chunk.type) {
          case 'text':
            fullContent += chunk.content;
            this.provider.streamChunk(messageId, chunk.content, false);
            break;

          case 'thinking':
            this.provider.streamChunk(messageId, chunk.content, true);
            break;

          case 'tool_use':
            const toolCallId = this.provider.streamToolCall(
              messageId,
              chunk.name,
              JSON.stringify(chunk.input)
            );

            // Emit activity event
            this.eventBus.emit('activity:started', {
              activity: {
                id: toolCallId,
                type: 'tool_call',
                title: `Executing ${chunk.name}`,
                timestamp: new Date(),
                status: 'pending',
              },
            });
            break;

          case 'tool_result':
            this.provider.streamToolResult(
              messageId,
              chunk.name,
              chunk.result,
              chunk.toolCallId || ''
            );

            // Emit activity completed
            this.eventBus.emit('activity:completed', {
              activityId: chunk.toolCallId || '',
              result: chunk.result,
            });
            break;

          case 'usage':
            usage = {
              promptTokens: chunk.promptTokens || 0,
              completionTokens: chunk.completionTokens || 0,
              totalTokens: chunk.totalTokens || 0,
              cost: chunk.cost,
            };
            break;

          case 'rate_limit':
            // Notify UI about rate limit
            this.provider.postMessage({
              type: 'rateLimitStart',
              retryAfterMs: chunk.retryAfterMs,
              provider: chunk.provider,
            });
            // The core handles waiting, we just notify the UI
            break;

          case 'done':
            // Stream completed naturally
            break;

          case 'error':
            throw new Error(chunk.message);
        }
      }

      // End streaming
      this.provider.endStreaming(messageId, usage);

      // Store completed message
      const assistantMessage: ChatMessage = {
        id: messageId,
        role: 'assistant',
        content: fullContent,
        timestamp: new Date().toISOString(),
        usage,
      };
      this.messages.push(assistantMessage);

    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        this.provider.endStreaming(messageId);
      } else {
        throw error;
      }
    }
  }

  /**
   * Handle blocking response (fallback)
   */
  private async handleBlockingResponse(
    messageId: string,
    content: string,
    context: Record<string, any>
  ): Promise<void> {
    // Show thinking indicator
    this.provider.streamChunk(messageId, '', true);

    try {
      const result = await this.core.processMessage(content, context);

      if (result.ok) {
        // Stream the response in chunks for better UX
        const response = result.value.response;
        const chunkSize = 50; // Characters per chunk
        let offset = 0;

        // Simulate streaming by sending chunks
        while (offset < response.length) {
          const chunk = response.slice(offset, offset + chunkSize);
          this.provider.streamChunk(messageId, chunk, false);
          offset += chunkSize;

          // Small delay for visual effect
          await new Promise((resolve) => setTimeout(resolve, 10));
        }

        // End streaming (token usage not available in blocking mode)
        this.provider.endStreaming(messageId);

        // Store completed message
        const assistantMessage: ChatMessage = {
          id: messageId,
          role: 'assistant',
          content: response,
          timestamp: new Date().toISOString(),
        };
        this.messages.push(assistantMessage);

      } else {
        this.handleError(messageId, new Error(result.error.message));
      }
    } catch (error) {
      this.handleError(messageId, error as Error);
    }
  }

  /**
   * Handle errors during processing
   */
  private handleError(messageId: string, error: Error): void {
    const errorInfo = this.categorizeError(error);

    this.provider.streamError(messageId, errorInfo);

    this.logger?.error('Chat processing error', error);

    // Store error message
    const errorMessage: ChatMessage = {
      id: messageId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      error: errorInfo,
    };
    this.messages.push(errorMessage);
  }

  /**
   * Categorize error for proper UI display
   */
  private categorizeError(error: Error): ErrorInfo {
    const message = error.message.toLowerCase();

    // Rate limit errors
    if (message.includes('rate limit') || message.includes('429')) {
      const retryMatch = message.match(/retry after (\d+)/i);
      const retryAfterMs = retryMatch?.[1] ? parseInt(retryMatch[1], 10) * 1000 : 60000;

      return {
        code: 'RATE_LIMIT',
        message: error.message,
        category: 'rate_limit',
        retryable: true,
        retryAfterMs,
        suggestion: 'The API rate limit has been reached. Waiting before retrying.',
      };
    }

    // Network errors
    if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
      return {
        code: 'NETWORK_ERROR',
        message: error.message,
        category: 'network',
        retryable: true,
        suggestion: 'Check your internet connection and try again.',
      };
    }

    // Timeout errors
    if (message.includes('timeout') || message.includes('timed out')) {
      return {
        code: 'TIMEOUT',
        message: error.message,
        category: 'timeout',
        retryable: true,
        suggestion: 'The request took too long. Try again or simplify your request.',
      };
    }

    // Context overflow
    if (message.includes('token') && (message.includes('limit') || message.includes('exceed'))) {
      return {
        code: 'CONTEXT_OVERFLOW',
        message: error.message,
        category: 'context_overflow',
        retryable: false,
        suggestion: 'The conversation is too long. Try clearing the chat history.',
      };
    }

    // Provider/API errors
    if (message.includes('api') || message.includes('key') || message.includes('auth')) {
      return {
        code: 'PROVIDER_ERROR',
        message: error.message,
        category: 'provider',
        retryable: false,
        suggestion: 'Check your API key configuration in settings.',
      };
    }

    // Default unknown error
    return {
      code: 'UNKNOWN_ERROR',
      message: error.message,
      category: 'unknown',
      retryable: true,
      suggestion: 'An unexpected error occurred. Try again.',
    };
  }

  /**
   * Handle cancel request
   */
  handleCancel(): void {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
    this.core.cancelExecution();
  }

  /**
   * Handle clear request
   */
  handleClear(): void {
    this.messages = [];
  }

  /**
   * Handle retry request
   */
  async handleRetry(messageId: string): Promise<void> {
    // Find the last user message before the failed message
    const messageIndex = this.messages.findIndex((m) => m.id === messageId);
    if (messageIndex <= 0) return;

    const lastUserMessage = this.messages
      .slice(0, messageIndex)
      .reverse()
      .find((m) => m.role === 'user');

    if (lastUserMessage) {
      // Remove messages from the failed one onwards
      this.messages = this.messages.slice(0, messageIndex);

      // Retry the last user message
      await this.handleSend({
        type: 'chat:send',
        content: lastUserMessage.content,
        attachments: lastUserMessage.attachments,
      });
    }
  }

  /**
   * Get chat messages
   */
  getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  /**
   * Get current file from active editor
   */
  private getCurrentFile(): string | undefined {
    const editor = vscode.window.activeTextEditor;
    return editor?.document.uri.fsPath;
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Listen for chat message events from webview
    this.eventBus.on('chat:message', async (event) => {
      const data = event as unknown as { content: string; attachments?: Attachment[] };
      await this.handleSend({
        type: 'chat:send',
        content: data.content,
        attachments: data.attachments,
      });
    });
  }
}

/**
 * Factory function
 */
export function createChatHandler(
  core: AlterCodeCore,
  eventBus: IEventBus,
  provider: WebviewProvider,
  logger?: ILogger
): ChatHandler {
  return new ChatHandler(core, eventBus, provider, logger);
}
