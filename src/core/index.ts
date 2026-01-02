/**
 * Core Layer
 *
 * Re-exports core layer implementations:
 * - AlterCodeCore (main orchestrator)
 * - ServiceRegistry (DI bootstrap)
 * - Streaming types
 */

// Core
export { AlterCodeCore, createAlterCodeCore, SERVICE_TOKENS } from './AlterCodeCore';

// Service Registry
export { registerServices, bootstrap, quickStart } from './ServiceRegistry';

// Streaming types
export type {
  StreamChunk,
  TextStreamChunk,
  ThinkingStreamChunk,
  ToolUseStreamChunk,
  ToolResultStreamChunk,
  UsageStreamChunk,
  ErrorStreamChunk,
  RateLimitStreamChunk,
  DoneStreamChunk,
  StreamMessageOptions,
  StreamingTool,
} from './streaming';

export {
  isTextChunk,
  isThinkingChunk,
  isToolUseChunk,
  isToolResultChunk,
  isUsageChunk,
  isErrorChunk,
  isRateLimitChunk,
  isDoneChunk,
} from './streaming';

// Tool framework
export {
  ToolRegistry,
  createToolRegistry,
  ToolExecutor,
  createToolExecutor,
  registerFileTools,
  TOOL_NAMES,
} from './tools';

// Export tool types with unique names to avoid conflicts with types module
export type {
  ToolDefinition as CoreToolDefinition,
  ToolInput,
  ToolResult,
  ToolContext,
  FileChange as ToolFileChange,
  RegisteredTool,
} from './tools';
