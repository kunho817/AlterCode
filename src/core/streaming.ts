/**
 * Streaming Types and Utilities
 *
 * Defines the streaming protocol between AlterCodeCore and the UI layer.
 * These types support:
 * - Text content streaming
 * - Extended thinking mode
 * - Tool use with results
 * - Token usage tracking
 * - Error propagation
 */

import type { LLMUsage } from '../types';

// ============================================================================
// Stream Chunk Types
// ============================================================================

/** Text content chunk */
export interface TextStreamChunk {
  type: 'text';
  content: string;
}

/** Thinking/reasoning chunk (for extended thinking mode) */
export interface ThinkingStreamChunk {
  type: 'thinking';
  content: string;
}

/** Tool use request chunk */
export interface ToolUseStreamChunk {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** Tool result chunk */
export interface ToolResultStreamChunk {
  type: 'tool_result';
  toolCallId: string;
  name: string;
  result: string;
  isError?: boolean;
}

/** Token usage chunk */
export interface UsageStreamChunk {
  type: 'usage';
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number;
}

/** Error chunk */
export interface ErrorStreamChunk {
  type: 'error';
  code: string;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
}

/** Rate limit chunk */
export interface RateLimitStreamChunk {
  type: 'rate_limit';
  retryAfterMs: number;
  provider: string;
}

/** Done chunk - signals stream completion */
export interface DoneStreamChunk {
  type: 'done';
  usage?: LLMUsage;
}

/** Union of all stream chunk types */
export type StreamChunk =
  | TextStreamChunk
  | ThinkingStreamChunk
  | ToolUseStreamChunk
  | ToolResultStreamChunk
  | UsageStreamChunk
  | ErrorStreamChunk
  | RateLimitStreamChunk
  | DoneStreamChunk;

// ============================================================================
// Streaming Options
// ============================================================================

/** Options for streaming messages */
export interface StreamMessageOptions {
  /** Current file context */
  currentFile?: string;
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
  /** Enable extended thinking mode */
  enableThinking?: boolean;
  /** Available tools */
  tools?: StreamingTool[];
  /** System prompt override */
  systemPrompt?: string;
}

/** Tool definition for streaming */
export interface StreamingTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => Promise<string>;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isTextChunk(chunk: StreamChunk): chunk is TextStreamChunk {
  return chunk.type === 'text';
}

export function isThinkingChunk(chunk: StreamChunk): chunk is ThinkingStreamChunk {
  return chunk.type === 'thinking';
}

export function isToolUseChunk(chunk: StreamChunk): chunk is ToolUseStreamChunk {
  return chunk.type === 'tool_use';
}

export function isToolResultChunk(chunk: StreamChunk): chunk is ToolResultStreamChunk {
  return chunk.type === 'tool_result';
}

export function isUsageChunk(chunk: StreamChunk): chunk is UsageStreamChunk {
  return chunk.type === 'usage';
}

export function isErrorChunk(chunk: StreamChunk): chunk is ErrorStreamChunk {
  return chunk.type === 'error';
}

export function isRateLimitChunk(chunk: StreamChunk): chunk is RateLimitStreamChunk {
  return chunk.type === 'rate_limit';
}

export function isDoneChunk(chunk: StreamChunk): chunk is DoneStreamChunk {
  return chunk.type === 'done';
}
