/**
 * GLM Agent
 *
 * Integrates with GLM-4.7 via HTTP API.
 * Endpoint: https://api.z.ai/api/coding/paas/v4/chat/completions
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import {
  AIModel,
  AIProvider,
  AgentRequest,
  AgentResponse,
  AgentResult,
  GLMConfig,
} from '../../types';
import { AIAgent } from '../AgentPool';
import { Logger } from '../../utils/Logger';

/**
 * GLM Chat Message format.
 */
interface GLMChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * GLM Chat Request format.
 */
interface GLMChatRequest {
  model: string;
  messages: GLMChatMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
}

/**
 * GLM Chat Response format.
 */
interface GLMChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * GLM Agent implementation.
 */
export class GLMAgent implements AIAgent {
  readonly id: string;
  readonly provider: AIProvider = 'glm';
  readonly model: AIModel = AIModel.GLM_4_7;

  private readonly config: GLMConfig;
  private readonly logger: Logger;
  private readonly httpClient: AxiosInstance;
  private cancelController: AbortController | null = null;

  constructor(config: GLMConfig) {
    this.id = uuidv4();
    this.config = config;
    this.logger = new Logger('GLMAgent');

    // Initialize HTTP client
    this.httpClient = axios.create({
      baseURL: config.endpoint,
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 120000, // 2 minutes
    });
  }

  /**
   * Execute a request via GLM API.
   */
  async execute(request: AgentRequest): Promise<AgentResponse> {
    const startTime = new Date();
    this.cancelController = new AbortController();

    try {
      // Build messages
      const messages = this.buildMessages(request);

      // Build request payload
      const payload: GLMChatRequest = {
        model: this.config.model,
        messages,
        max_tokens: request.constraints.maxTokens || this.config.maxTokens,
        temperature: request.constraints.temperature || this.config.temperature,
        stream: false,
      };

      this.logger.debug(`Sending request to GLM: ${JSON.stringify(payload).substring(0, 200)}...`);

      // Send request
      const response = await this.httpClient.post<GLMChatResponse>('', payload, {
        signal: this.cancelController.signal,
      });

      const endTime = new Date();
      const glmResponse = response.data;

      // Extract content
      const content = glmResponse.choices[0]?.message?.content || '';

      return {
        taskId: request.taskId,
        status: 'success',
        result: {
          content,
          metadata: {
            finishReason: glmResponse.choices[0]?.finish_reason,
            modelUsed: glmResponse.model,
          },
        },
        metrics: {
          startTime,
          endTime,
          durationMs: endTime.getTime() - startTime.getTime(),
          tokensSent: glmResponse.usage.prompt_tokens,
          tokensReceived: glmResponse.usage.completion_tokens,
          model: this.model,
        },
      };
    } catch (error) {
      const endTime = new Date();

      if (axios.isCancel(error)) {
        return {
          taskId: request.taskId,
          status: 'failure',
          result: { content: '' },
          metrics: {
            startTime,
            endTime,
            durationMs: endTime.getTime() - startTime.getTime(),
            tokensSent: 0,
            tokensReceived: 0,
            model: this.model,
          },
          error: {
            code: 'CANCELLED',
            message: 'Request cancelled',
            retryable: false,
          },
        };
      }

      const axiosError = error as AxiosError;
      const errorMessage = axiosError.response?.data
        ? JSON.stringify(axiosError.response.data)
        : axiosError.message;

      this.logger.error('GLM API request failed', error);

      return {
        taskId: request.taskId,
        status: 'failure',
        result: { content: '' },
        metrics: {
          startTime,
          endTime,
          durationMs: endTime.getTime() - startTime.getTime(),
          tokensSent: 0,
          tokensReceived: 0,
          model: this.model,
        },
        error: {
          code: axiosError.response?.status?.toString() || 'GLM_API_ERROR',
          message: errorMessage,
          retryable: this.isRetryable(axiosError),
        },
      };
    } finally {
      this.cancelController = null;
    }
  }

  /**
   * Cancel the current execution.
   */
  cancel(): void {
    if (this.cancelController) {
      this.cancelController.abort();
      this.cancelController = null;
    }
  }

  /**
   * Build chat messages from request.
   */
  private buildMessages(request: AgentRequest): GLMChatMessage[] {
    const messages: GLMChatMessage[] = [];

    // Add system prompt if provided
    if (request.systemPrompt) {
      messages.push({
        role: 'system',
        content: request.systemPrompt,
      });
    } else {
      // Default system prompt for workers
      messages.push({
        role: 'system',
        content: this.getDefaultSystemPrompt(),
      });
    }

    // Add context as part of user message
    let userContent = request.prompt;

    if (request.context.relevantFiles.length > 0) {
      const fileContext = request.context.relevantFiles
        .map((f) => `File: ${f.path}`)
        .join('\n');
      userContent = `Context:\n${fileContext}\n\nTask:\n${request.prompt}`;
    }

    messages.push({
      role: 'user',
      content: userContent,
    });

    return messages;
  }

  /**
   * Get default system prompt for workers.
   */
  private getDefaultSystemPrompt(): string {
    return `You are a skilled software developer working as part of the AlterCode system.
Your role is to execute specific, well-defined coding tasks accurately and efficiently.

Guidelines:
1. Follow the task instructions precisely
2. Write clean, maintainable code
3. Include appropriate comments where necessary
4. Consider edge cases and error handling
5. Return only the requested output without unnecessary explanation

When modifying code, provide the complete modified content, not just the changes.`;
  }

  /**
   * Determine if an error is retryable.
   */
  private isRetryable(error: AxiosError): boolean {
    const status = error.response?.status;

    // Retry on server errors and rate limiting
    if (status && status >= 500) return true;
    if (status === 429) return true;

    // Retry on timeout
    if (error.code === 'ECONNABORTED') return true;

    return false;
  }
}
