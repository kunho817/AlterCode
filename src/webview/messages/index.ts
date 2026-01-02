/**
 * Message protocol exports
 */

// Export WebviewMessage first (has Attachment definition)
export * from './WebviewMessage';

// Export ExtensionMessage (re-exports Attachment from WebviewMessage)
export {
  // Base
  type ExtensionMessageBase,
  // Messages
  type StateMessage,
  type StatePartialMessage,
  type StreamStartMessage,
  type StreamChunkMessage,
  type StreamToolCallMessage,
  type StreamToolResultMessage,
  type StreamEndMessage,
  type StreamErrorMessage,
  type ErrorMessage,
  type ErrorClearMessage,
  type RateLimitStartMessage,
  type RateLimitEndMessage,
  type MissionCreatedMessage,
  type MissionUpdatedMessage,
  type TaskUpdatedMessage,
  type TaskProgressMessage,
  type ApprovalRequiredMessage,
  type ApprovalResolvedMessage,
  type ActivityStartedMessage,
  type ActivityCompletedMessage,
  type ActivityFailedMessage,
  type QuotaUpdatedMessage,
  type ExtensionMessage,
  // Types
  type AppState,
  type ChatMessage,
  type ToolCall,
  type ErrorInfo,
  type RateLimitInfo,
  type TokenUsage,
  type WebviewMission,
  type WebviewTask,
  type WebviewActivityEntry,
  type WebviewQuotaStatus,
  type WebviewProviderQuota,
  type WebviewPendingApproval,
  type WebviewFileChange,
  type WebviewSettings,
} from './ExtensionMessage';
