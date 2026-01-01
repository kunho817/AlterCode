/**
 * Claude Adapter
 *
 * Adapter for Anthropic's Claude API:
 * - Message API integration
 * - Tool use support
 * - Streaming responses
 * - Rate limiting and retry logic
 */

import {
  ILLMAdapter,
  LLMRequest,
  LLMResponse,
  LLMStreamChunk,
  LLMConfig,
  LLMUsage,
  ToolDefinition,
  ToolCall,
  AsyncResult,
  Ok,
  Err,
  ILogger,
  AppError,
} from '../types';

/** Claude API base URL */
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

/** Default model */
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

/** Maximum retries */
const MAX_RETRIES = 3;

/** Retry delay base (ms) */
const RETRY_DELAY_BASE = 1000;

/**
 * Claude Adapter implementation
 */
export class ClaudeAdapter implements ILLMAdapter {
  private readonly apiKey: string;
  private readonly config: LLMConfig;
  private readonly logger?: ILogger;

  // Rate limiting
  private requestCount: number = 0;
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 100; // ms

  constructor(apiKey: string, config?: Partial<LLMConfig>, logger?: ILogger) {
    this.apiKey = apiKey;
    this.config = {
      model: config?.model ?? DEFAULT_MODEL,
      maxTokens: config?.maxTokens ?? 4096,
      temperature: config?.temperature ?? 0.7,
      topP: config?.topP,
      stopSequences: config?.stopSequences ?? [],
    };
    this.logger = logger?.child('ClaudeAdapter');
  }

  async complete(request: LLMRequest): AsyncResult<LLMResponse> {
    const startTime = Date.now();

    this.logger?.debug('Starting completion', {
      model: this.config.model,
      promptLength: request.prompt.length,
    });

    try {
      // Rate limiting
      await this.enforceRateLimit();

      // Build request body
      const body = this.buildRequestBody(request);

      // Make request with retries
      let response: Response | null = null;
      let lastError: Error | null = null;

      for (let retry = 0; retry <= MAX_RETRIES; retry++) {
        try {
          response = await fetch(CLAUDE_API_URL, {
            method: 'POST',
            headers: this.buildHeaders(),
            body: JSON.stringify(body),
          });

          if (response.ok) {
            break;
          }

          // Handle rate limits
          if (response.status === 429) {
            const retryAfter = response.headers.get('retry-after');
            const delay = retryAfter
              ? parseInt(retryAfter, 10) * 1000
              : RETRY_DELAY_BASE * Math.pow(2, retry);

            this.logger?.warn('Rate limited, retrying', { retry, delay });
            await this.delay(delay);
            continue;
          }

          // Handle other errors
          const errorBody = await response.text();
          throw new Error(`API error ${response.status}: ${errorBody}`);
        } catch (error) {
          lastError = error as Error;

          if (retry < MAX_RETRIES) {
            const delay = RETRY_DELAY_BASE * Math.pow(2, retry);
            this.logger?.warn('Request failed, retrying', { retry, delay, error });
            await this.delay(delay);
          }
        }
      }

      if (!response?.ok) {
        throw lastError ?? new Error('Request failed');
      }

      // Parse response
      const data = await response.json();
      const llmResponse = this.parseResponse(data, startTime);

      this.logger?.debug('Completion finished', {
        duration: llmResponse.duration,
        tokens: llmResponse.usage?.totalTokens,
      });

      return Ok(llmResponse);
    } catch (error) {
      this.logger?.error('Completion failed', error as Error);
      return Err(new AppError('LLM', `Claude completion failed: ${(error as Error).message}`));
    }
  }

  async *stream(request: LLMRequest): AsyncGenerator<LLMStreamChunk> {
    const startTime = Date.now();

    this.logger?.debug('Starting stream', {
      model: this.config.model,
      promptLength: request.prompt.length,
    });

    try {
      // Rate limiting
      await this.enforceRateLimit();

      // Build request body with streaming
      const body = {
        ...this.buildRequestBody(request),
        stream: true,
      };

      const response = await fetch(CLAUDE_API_URL, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`API error ${response.status}: ${errorBody}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let totalContent = '';
      let inputTokens = 0;
      let outputTokens = 0;

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE events
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data);

            if (event.type === 'content_block_delta') {
              const delta = event.delta?.text ?? '';
              totalContent += delta;

              yield {
                content: delta,
                done: false,
              };
            }

            if (event.type === 'message_delta') {
              outputTokens = event.usage?.output_tokens ?? outputTokens;
            }

            if (event.type === 'message_start') {
              inputTokens = event.message?.usage?.input_tokens ?? 0;
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }

      // Final chunk with usage info
      yield {
        content: '',
        done: true,
        usage: {
          promptTokens: inputTokens,
          completionTokens: outputTokens,
          totalTokens: inputTokens + outputTokens,
        },
      };

      this.logger?.debug('Stream completed', {
        duration: Date.now() - startTime,
        contentLength: totalContent.length,
      });
    } catch (error) {
      this.logger?.error('Stream failed', error as Error);
      throw new AppError('LLM', `Claude stream failed: ${(error as Error).message}`);
    }
  }

  async completeWithTools(
    request: LLMRequest,
    tools: ToolDefinition[]
  ): AsyncResult<{ response: LLMResponse; toolCalls: ToolCall[] }> {
    const startTime = Date.now();

    this.logger?.debug('Starting completion with tools', {
      model: this.config.model,
      toolCount: tools.length,
    });

    try {
      await this.enforceRateLimit();

      // Build request with tools
      const body = {
        ...this.buildRequestBody(request),
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters,
        })),
      };

      const response = await fetch(CLAUDE_API_URL, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`API error ${response.status}: ${errorBody}`);
      }

      const data = await response.json() as {
        content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
        model: string;
        stop_reason: string;
        usage?: { input_tokens?: number; output_tokens?: number };
      };

      // Extract tool calls
      const toolCalls: ToolCall[] = [];
      let textContent = '';

      for (const block of data.content) {
        if (block.type === 'text') {
          textContent += block.text ?? '';
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id ?? '',
            name: block.name ?? '',
            arguments: block.input ?? {},
          });
        }
      }

      const llmResponse: LLMResponse = {
        content: textContent,
        model: data.model,
        finishReason: data.stop_reason,
        usage: {
          promptTokens: data.usage?.input_tokens ?? 0,
          completionTokens: data.usage?.output_tokens ?? 0,
          totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
        },
        duration: Date.now() - startTime,
      };

      this.logger?.debug('Tool completion finished', {
        duration: llmResponse.duration,
        toolCalls: toolCalls.length,
      });

      return Ok({ response: llmResponse, toolCalls });
    } catch (error) {
      this.logger?.error('Tool completion failed', error as Error);
      return Err(new AppError('LLM', `Claude tool completion failed: ${(error as Error).message}`));
    }
  }

  getConfig(): LLMConfig {
    return { ...this.config };
  }

  setConfig(config: Partial<LLMConfig>): void {
    Object.assign(this.config, config);
    this.logger?.info('Config updated', { config: this.config });
  }

  /**
   * Build request headers
   */
  private buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
    };
  }

  /**
   * Build request body
   */
  private buildRequestBody(request: LLMRequest): object {
    const messages = this.buildMessages(request);

    return {
      model: this.config.model,
      max_tokens: request.maxTokens ?? this.config.maxTokens,
      temperature: request.temperature ?? this.config.temperature,
      top_p: request.topP ?? this.config.topP,
      stop_sequences: request.stopSequences ?? this.config.stopSequences,
      messages,
      system: request.systemPrompt,
    };
  }

  /**
   * Build messages array
   */
  private buildMessages(request: LLMRequest): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = [];

    // Add conversation history if provided
    if (request.history) {
      for (const msg of request.history) {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    // Add current prompt
    messages.push({
      role: 'user',
      content: request.prompt,
    });

    return messages;
  }

  /**
   * Parse API response
   */
  private parseResponse(data: any, startTime: number): LLMResponse {
    const content = data.content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text)
      .join('');

    return {
      content,
      model: data.model,
      finishReason: data.stop_reason,
      usage: {
        promptTokens: data.usage?.input_tokens ?? 0,
        completionTokens: data.usage?.output_tokens ?? 0,
        totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
      },
      duration: Date.now() - startTime,
    };
  }

  /**
   * Enforce rate limiting
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;

    if (elapsed < this.minRequestInterval) {
      await this.delay(this.minRequestInterval - elapsed);
    }

    this.lastRequestTime = Date.now();
    this.requestCount++;
  }

  /**
   * Delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get usage statistics
   */
  getUsageStats(): { requestCount: number } {
    return { requestCount: this.requestCount };
  }

  /**
   * Set rate limit
   */
  setRateLimit(requestsPerSecond: number): void {
    this.minRequestInterval = 1000 / requestsPerSecond;
  }

  /**
   * Estimate tokens for a prompt
   */
  estimateTokens(text: string): number {
    // Claude uses ~4 characters per token on average
    return Math.ceil(text.length / 4);
  }
}

/**
 * Create a Claude adapter
 */
export function createClaudeAdapter(
  apiKey: string,
  config?: Partial<LLMConfig>,
  logger?: ILogger
): ILLMAdapter {
  return new ClaudeAdapter(apiKey, config, logger);
}
