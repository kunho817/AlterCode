/**
 * GLM Adapter
 *
 * Adapter for Zhipu AI's GLM-4 API:
 * - Message API integration
 * - Tool use support
 * - Streaming responses
 * - Rate limiting and retry logic
 *
 * Used for Worker-level tasks in the hierarchy.
 */

import {
  ILLMAdapter,
  LLMRequest,
  LLMResponse,
  LLMStreamChunk,
  LLMConfig,
  ToolDefinition,
  ToolCall,
  AsyncResult,
  Ok,
  Err,
  ILogger,
  AppError,
} from '../types';

/** GLM API base URL */
const GLM_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

/** Default model */
const DEFAULT_MODEL = 'glm-4';

/** Maximum retries */
const MAX_RETRIES = 3;

/** Retry delay base (ms) */
const RETRY_DELAY_BASE = 1000;

/**
 * GLM Adapter configuration
 */
interface GLMAdapterConfig extends LLMConfig {
  baseUrl?: string;
}

/**
 * GLM Adapter implementation
 *
 * Provides integration with Zhipu AI's GLM-4 models for Worker-level tasks.
 */
export class GLMAdapter implements ILLMAdapter {
  private readonly apiKey: string;
  private readonly config: GLMAdapterConfig;
  private readonly baseUrl: string;
  private readonly logger?: ILogger;

  // Rate limiting
  private requestCount: number = 0;
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 100; // ms

  constructor(apiKey: string, config?: Partial<GLMAdapterConfig>, logger?: ILogger) {
    this.apiKey = apiKey;
    this.config = {
      model: config?.model ?? DEFAULT_MODEL,
      maxTokens: config?.maxTokens ?? 4096,
      temperature: config?.temperature ?? 0.7,
      topP: config?.topP ?? 0.95,
      stopSequences: config?.stopSequences ?? [],
      baseUrl: config?.baseUrl,
    };
    this.baseUrl = config?.baseUrl ?? GLM_API_URL;
    this.logger = logger?.child('GLMAdapter');
  }

  async complete(request: LLMRequest): AsyncResult<LLMResponse> {
    const startTime = Date.now();

    this.logger?.debug('Starting GLM completion', {
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
          response = await fetch(this.baseUrl, {
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
          throw new Error(`GLM API error ${response.status}: ${errorBody}`);
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

      this.logger?.debug('GLM completion finished', {
        duration: llmResponse.duration,
        tokens: llmResponse.usage?.totalTokens,
      });

      return Ok(llmResponse);
    } catch (error) {
      this.logger?.error('GLM completion failed', error as Error);
      return Err(new AppError('LLM', `GLM completion failed: ${(error as Error).message}`));
    }
  }

  async *stream(request: LLMRequest): AsyncGenerator<LLMStreamChunk> {
    const startTime = Date.now();

    this.logger?.debug('Starting GLM stream', {
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

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`GLM API error ${response.status}: ${errorBody}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let totalContent = '';
      let promptTokens = 0;
      let completionTokens = 0;

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
            const delta = event.choices?.[0]?.delta?.content ?? '';

            if (delta) {
              totalContent += delta;
              yield {
                content: delta,
                done: false,
              };
            }

            // Extract usage if provided
            if (event.usage) {
              promptTokens = event.usage.prompt_tokens ?? promptTokens;
              completionTokens = event.usage.completion_tokens ?? completionTokens;
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }

      // Estimate tokens if not provided
      if (promptTokens === 0) {
        promptTokens = this.estimateTokens(request.prompt);
      }
      if (completionTokens === 0) {
        completionTokens = this.estimateTokens(totalContent);
      }

      // Final chunk with usage info
      yield {
        content: '',
        done: true,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
      };

      this.logger?.debug('GLM stream completed', {
        duration: Date.now() - startTime,
        contentLength: totalContent.length,
      });
    } catch (error) {
      this.logger?.error('GLM stream failed', error as Error);
      throw new AppError('LLM', `GLM stream failed: ${(error as Error).message}`);
    }
  }

  async completeWithTools(
    request: LLMRequest,
    tools: ToolDefinition[]
  ): AsyncResult<{ response: LLMResponse; toolCalls: ToolCall[] }> {
    const startTime = Date.now();

    this.logger?.debug('Starting GLM completion with tools', {
      model: this.config.model,
      toolCount: tools.length,
    });

    try {
      await this.enforceRateLimit();

      // Build request with tools (GLM uses OpenAI-compatible format)
      const body = {
        ...this.buildRequestBody(request),
        tools: tools.map((t) => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        })),
        tool_choice: 'auto',
      };

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`GLM API error ${response.status}: ${errorBody}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{
          message?: {
            content?: string;
            tool_calls?: Array<{
              type: string;
              id: string;
              function: { name: string; arguments: string };
            }>;
          };
          finish_reason?: string;
        }>;
        model: string;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };
      const choice = data.choices?.[0];

      // Extract tool calls
      const toolCalls: ToolCall[] = [];
      const toolCallsData = choice?.message?.tool_calls ?? [];

      for (const tc of toolCallsData) {
        if (tc.type === 'function') {
          try {
            toolCalls.push({
              id: tc.id,
              name: tc.function.name,
              arguments: JSON.parse(tc.function.arguments),
            });
          } catch {
            // Skip invalid tool call arguments
            this.logger?.warn('Invalid tool call arguments', { toolCall: tc });
          }
        }
      }

      const llmResponse: LLMResponse = {
        content: choice?.message?.content ?? '',
        model: data.model,
        finishReason: choice?.finish_reason ?? 'stop',
        usage: {
          promptTokens: data.usage?.prompt_tokens ?? 0,
          completionTokens: data.usage?.completion_tokens ?? 0,
          totalTokens: data.usage?.total_tokens ?? 0,
        },
        duration: Date.now() - startTime,
      };

      this.logger?.debug('GLM tool completion finished', {
        duration: llmResponse.duration,
        toolCalls: toolCalls.length,
      });

      return Ok({ response: llmResponse, toolCalls });
    } catch (error) {
      this.logger?.error('GLM tool completion failed', error as Error);
      return Err(new AppError('LLM', `GLM tool completion failed: ${(error as Error).message}`));
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
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  /**
   * Build request body
   */
  private buildRequestBody(request: LLMRequest): object {
    const messages = this.buildMessages(request);

    return {
      model: this.config.model,
      messages,
      max_tokens: request.maxTokens ?? this.config.maxTokens,
      temperature: request.temperature ?? this.config.temperature,
      top_p: request.topP ?? this.config.topP,
      stop: request.stopSequences ?? this.config.stopSequences,
    };
  }

  /**
   * Build messages array
   */
  private buildMessages(request: LLMRequest): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = [];

    // Add system prompt
    if (request.systemPrompt) {
      messages.push({
        role: 'system',
        content: request.systemPrompt,
      });
    }

    // Add conversation history
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
    const choice = data.choices?.[0];

    return {
      content: choice?.message?.content ?? '',
      model: data.model,
      finishReason: choice?.finish_reason ?? 'stop',
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
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
   * GLM uses roughly 1.5 characters per token for Chinese, 4 for English
   */
  estimateTokens(text: string): number {
    // Detect if text is primarily Chinese
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const totalChars = text.length;
    const chineseRatio = chineseChars / totalChars;

    // Weighted average based on language ratio
    const avgCharsPerToken = chineseRatio * 1.5 + (1 - chineseRatio) * 4;
    return Math.ceil(text.length / avgCharsPerToken);
  }
}

/**
 * Create a GLM adapter
 */
export function createGLMAdapter(
  apiKey: string,
  config?: Partial<GLMAdapterConfig>,
  logger?: ILogger
): ILLMAdapter {
  return new GLMAdapter(apiKey, config, logger);
}

/**
 * Create GLM-4 Flash adapter (faster, cheaper model)
 */
export function createGLMFlashAdapter(
  apiKey: string,
  config?: Partial<GLMAdapterConfig>,
  logger?: ILogger
): ILLMAdapter {
  return new GLMAdapter(apiKey, { ...config, model: 'glm-4-flash' }, logger);
}
