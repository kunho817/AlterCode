/**
 * OpenAI Adapter
 *
 * Adapter for OpenAI-compatible APIs:
 * - OpenAI GPT models
 * - Azure OpenAI
 * - Local models (Ollama, LM Studio, etc.)
 * - Other OpenAI-compatible endpoints
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

/** OpenAI API base URL */
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

/** Default model */
const DEFAULT_MODEL = 'gpt-4o';

/** Maximum retries */
const MAX_RETRIES = 3;

/** Retry delay base (ms) */
const RETRY_DELAY_BASE = 1000;

/**
 * OpenAI-compatible adapter configuration
 */
interface OpenAIAdapterConfig extends LLMConfig {
  baseUrl?: string;
  apiVersion?: string; // For Azure OpenAI
  organization?: string;
}

/**
 * OpenAI Adapter implementation
 */
export class OpenAIAdapter implements ILLMAdapter {
  private readonly apiKey: string;
  private readonly config: OpenAIAdapterConfig;
  private readonly baseUrl: string;
  private readonly logger?: ILogger;

  // Rate limiting
  private requestCount: number = 0;
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 50; // ms

  constructor(apiKey: string, config?: Partial<OpenAIAdapterConfig>, logger?: ILogger) {
    this.apiKey = apiKey;
    this.config = {
      model: config?.model ?? DEFAULT_MODEL,
      maxTokens: config?.maxTokens ?? 4096,
      temperature: config?.temperature ?? 0.7,
      topP: config?.topP,
      stopSequences: config?.stopSequences ?? [],
      baseUrl: config?.baseUrl,
      apiVersion: config?.apiVersion,
      organization: config?.organization,
    };
    this.baseUrl = config?.baseUrl ?? OPENAI_API_URL;
    this.logger = logger?.child('OpenAIAdapter');
  }

  async complete(request: LLMRequest): AsyncResult<LLMResponse> {
    const startTime = Date.now();

    this.logger?.debug('Starting completion', {
      model: this.config.model,
      promptLength: request.prompt.length,
    });

    try {
      await this.enforceRateLimit();

      const body = this.buildRequestBody(request);

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

      const data = await response.json();
      const llmResponse = this.parseResponse(data, startTime);

      this.logger?.debug('Completion finished', {
        duration: llmResponse.duration,
        tokens: llmResponse.usage?.totalTokens,
      });

      return Ok(llmResponse);
    } catch (error) {
      this.logger?.error('Completion failed', error as Error);
      return Err(new AppError('LLM', `OpenAI completion failed: ${(error as Error).message}`));
    }
  }

  async *stream(request: LLMRequest): AsyncGenerator<LLMStreamChunk> {
    const startTime = Date.now();

    this.logger?.debug('Starting stream', {
      model: this.config.model,
      promptLength: request.prompt.length,
    });

    try {
      await this.enforceRateLimit();

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
        throw new Error(`API error ${response.status}: ${errorBody}`);
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

            // Check for usage in stream (some providers include it)
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

      yield {
        content: '',
        done: true,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
      };

      this.logger?.debug('Stream completed', {
        duration: Date.now() - startTime,
        contentLength: totalContent.length,
      });
    } catch (error) {
      this.logger?.error('Stream failed', error as Error);
      throw new AppError('LLM', `OpenAI stream failed: ${(error as Error).message}`);
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
        throw new Error(`API error ${response.status}: ${errorBody}`);
      }

      const data = await response.json() as {
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
          toolCalls.push({
            id: tc.id,
            name: tc.function.name,
            arguments: JSON.parse(tc.function.arguments),
          });
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

      this.logger?.debug('Tool completion finished', {
        duration: llmResponse.duration,
        toolCalls: toolCalls.length,
      });

      return Ok({ response: llmResponse, toolCalls });
    } catch (error) {
      this.logger?.error('Tool completion failed', error as Error);
      return Err(new AppError('LLM', `OpenAI tool completion failed: ${(error as Error).message}`));
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
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    };

    if (this.config.organization) {
      headers['OpenAI-Organization'] = this.config.organization;
    }

    // Azure OpenAI uses different header
    if (this.config.apiVersion) {
      headers['api-key'] = this.apiKey;
      delete headers['Authorization'];
    }

    return headers;
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
      finishReason: choice?.finish_reason,
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
   */
  estimateTokens(text: string): number {
    // GPT models use ~4 characters per token on average
    return Math.ceil(text.length / 4);
  }
}

/**
 * Create an OpenAI adapter
 */
export function createOpenAIAdapter(
  apiKey: string,
  config?: Partial<OpenAIAdapterConfig>,
  logger?: ILogger
): ILLMAdapter {
  return new OpenAIAdapter(apiKey, config, logger);
}

/**
 * Create adapter for local models (Ollama, LM Studio)
 */
export function createLocalModelAdapter(
  baseUrl: string,
  model: string,
  logger?: ILogger
): ILLMAdapter {
  return new OpenAIAdapter('', { baseUrl, model }, logger);
}

/**
 * Create Azure OpenAI adapter
 */
export function createAzureOpenAIAdapter(
  endpoint: string,
  apiKey: string,
  deployment: string,
  apiVersion: string = '2024-02-15-preview',
  logger?: ILogger
): ILLMAdapter {
  const baseUrl = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
  return new OpenAIAdapter(apiKey, { baseUrl, model: deployment, apiVersion }, logger);
}
