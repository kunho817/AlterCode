/**
 * Integration Layer Types
 *
 * Types for AI provider integration:
 * - AI Provider Interface
 * - Claude Adapter
 * - GLM Adapter
 * - Message Types
 */

import { AsyncResult, TokenCount } from './common';
import { AIModel } from './execution';

// ============================================================================
// Provider Capability Types
// ============================================================================

/** Provider capabilities */
export interface ProviderCapabilities {
  readonly streaming: boolean;
  readonly functionCalling: boolean;
  readonly vision: boolean;
  readonly maxContextWindow: TokenCount;
  readonly maxOutputTokens: TokenCount;
  readonly supportedModels: AIModel[];
}

// ============================================================================
// Message Types
// ============================================================================

/** Message role */
export type ProviderMessageRole = 'user' | 'assistant' | 'system';

/** Text content block */
export interface TextContent {
  readonly type: 'text';
  readonly text: string;
}

/** Image content block */
export interface ImageContent {
  readonly type: 'image';
  readonly source: {
    readonly type: 'base64' | 'url';
    readonly mediaType?: string;
    readonly data?: string;
    readonly url?: string;
  };
}

/** Tool use content block */
export interface ToolUseContent {
  readonly type: 'tool_use';
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
}

/** Tool result content block */
export interface ToolResultContent {
  readonly type: 'tool_result';
  readonly toolUseId: string;
  readonly content: string;
  readonly isError?: boolean;
}

/** Content block */
export type ContentBlock =
  | TextContent
  | ImageContent
  | ToolUseContent
  | ToolResultContent;

/** Provider message */
export interface ProviderMessage {
  readonly role: ProviderMessageRole;
  readonly content: string | ContentBlock[];
}

// ============================================================================
// Tool Types
// ============================================================================

/** Tool parameter */
export interface ToolParameter {
  readonly name: string;
  readonly type: string;
  readonly description: string;
  readonly required: boolean;
  readonly enum?: string[];
}

/** Tool definition */
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: ToolParameter[];
}

// ============================================================================
// Request/Response Types
// ============================================================================

/** Completion request */
export interface CompletionRequest {
  readonly model: AIModel;
  readonly messages: ProviderMessage[];
  readonly systemPrompt?: string;
  readonly maxTokens?: TokenCount;
  readonly temperature?: number;
  readonly topP?: number;
  readonly stopSequences?: string[];
  readonly tools?: ToolDefinition[];
}

/** Finish reason */
export type FinishReason =
  | 'stop'           // Natural end
  | 'max_tokens'     // Hit token limit
  | 'tool_use'       // Tool call needed
  | 'error';         // Error occurred

/** Token usage */
export interface ProviderTokenUsage {
  readonly inputTokens: TokenCount;
  readonly outputTokens: TokenCount;
  readonly totalTokens: TokenCount;
  readonly cacheReadTokens?: TokenCount;
  readonly cacheWriteTokens?: TokenCount;
}

/** Completion response */
export interface CompletionResponse {
  readonly id: string;
  readonly model: AIModel;
  readonly content: ContentBlock[];
  readonly finishReason: FinishReason;
  readonly usage: ProviderTokenUsage;
  readonly stopReason?: string;
}

/** Stream event type */
export type StreamEventType =
  | 'message_start'
  | 'content_block_start'
  | 'content_block_delta'
  | 'content_block_stop'
  | 'message_delta'
  | 'message_stop'
  | 'error';

/** Stream event */
export interface StreamEvent {
  readonly type: StreamEventType;
  readonly index?: number;
  readonly delta?: {
    readonly type: 'text_delta' | 'input_json_delta';
    readonly text?: string;
    readonly partialJson?: string;
  };
  readonly contentBlock?: ContentBlock;
  readonly usage?: Partial<ProviderTokenUsage>;
  readonly error?: {
    readonly type: string;
    readonly message: string;
  };
}

// ============================================================================
// AI Provider Interface
// ============================================================================

/** AI provider interface */
export interface IAIProvider {
  readonly name: string;
  readonly capabilities: ProviderCapabilities;

  /** Check if provider is available */
  isAvailable(): Promise<boolean>;

  /** Send a completion request */
  complete(request: CompletionRequest): AsyncResult<CompletionResponse>;

  /** Stream a completion request */
  stream(request: CompletionRequest): AsyncIterable<StreamEvent>;

  /** Count tokens in text */
  countTokens(text: string, model?: AIModel): TokenCount;

  /** Validate request before sending */
  validateRequest(request: CompletionRequest): string[];
}

// ============================================================================
// Claude Specific Types
// ============================================================================

/** Claude CLI status */
export interface ClaudeCliStatus {
  readonly installed: boolean;
  readonly version: string | null;
  readonly path: string | null;
  readonly authenticated: boolean;
  readonly error?: string;
}

/** Claude CLI response */
export interface ClaudeCliResponse {
  readonly success: boolean;
  readonly output: string;
  readonly error?: string;
  readonly duration: number;
  readonly tokensUsed?: ProviderTokenUsage;
}

/** Claude adapter configuration */
export interface ClaudeAdapterConfig {
  readonly cliPath: string;
  readonly model: 'opus' | 'sonnet' | 'haiku';
  readonly maxOutputTokens: TokenCount;
  readonly timeout: number;
  readonly workingDirectory?: string;
}

// ============================================================================
// GLM Specific Types
// ============================================================================

/** GLM API response */
export interface GLMApiResponse {
  readonly id: string;
  readonly created: number;
  readonly model: string;
  readonly choices: GLMChoice[];
  readonly usage: {
    readonly prompt_tokens: number;
    readonly completion_tokens: number;
    readonly total_tokens: number;
  };
}

/** GLM choice */
export interface GLMChoice {
  readonly index: number;
  readonly message: {
    readonly role: string;
    readonly content: string;
  };
  readonly finish_reason: string;
}

/** GLM adapter configuration */
export interface GLMAdapterConfig {
  readonly endpoint: string;
  readonly apiKey: string;
  readonly model: string;
  readonly maxTokens: TokenCount;
  readonly temperature: number;
  readonly timeout: number;
}

// ============================================================================
// Provider Factory
// ============================================================================

/** Provider type */
export type ProviderType = 'claude' | 'glm';

/** Provider configuration */
export type ProviderConfig = ClaudeAdapterConfig | GLMAdapterConfig;

/** Model to provider mapping */
export const MODEL_PROVIDER_MAP: Record<AIModel, ProviderType> = {
  'claude-opus': 'claude',
  'claude-sonnet': 'claude',
  'claude-haiku': 'claude',
  'glm-4': 'glm',
  'glm-4-flash': 'glm',
  'glm-4.7': 'glm',
  'glm-4.7-flash': 'glm',
};

/** Get provider type for model */
export function getProviderForModel(model: AIModel): ProviderType {
  return MODEL_PROVIDER_MAP[model];
}

// ============================================================================
// Default Configurations
// ============================================================================

import { toTokenCount } from './common';

/** Default Claude configuration */
export const DEFAULT_CLAUDE_CONFIG: ClaudeAdapterConfig = {
  cliPath: 'claude',
  model: 'sonnet',
  maxOutputTokens: toTokenCount(4096),
  timeout: 300000, // 5 minutes
};

/** Default GLM configuration (GLM-4.7: 200K context, 128K output) */
export const DEFAULT_GLM_CONFIG: GLMAdapterConfig = {
  endpoint: 'https://api.z.ai/api/coding/paas/v4/chat/completions',
  apiKey: '',
  model: 'glm-4.7',
  maxTokens: toTokenCount(128000),
  temperature: 0.7,
  timeout: 60000, // 1 minute
};

/** Model context windows */
export const MODEL_CONTEXT_WINDOWS: Record<AIModel, TokenCount> = {
  'claude-opus': toTokenCount(200000),
  'claude-sonnet': toTokenCount(200000),
  'claude-haiku': toTokenCount(200000),
  'glm-4': toTokenCount(128000),
  'glm-4-flash': toTokenCount(128000),
  'glm-4.7': toTokenCount(200000),
  'glm-4.7-flash': toTokenCount(200000),
};

/** Model max output tokens */
export const MODEL_MAX_OUTPUT: Record<AIModel, TokenCount> = {
  'claude-opus': toTokenCount(4096),
  'claude-sonnet': toTokenCount(4096),
  'claude-haiku': toTokenCount(4096),
  'glm-4': toTokenCount(4096),
  'glm-4-flash': toTokenCount(4096),
  'glm-4.7': toTokenCount(128000),
  'glm-4.7-flash': toTokenCount(128000),
};
