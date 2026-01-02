/**
 * Messages sent from extension host to webview
 */

// Note: We use local webview-compatible types defined below, not core types
// Attachment is re-exported from WebviewMessage via index.ts

// ============================================================================
// Base Message Interface
// ============================================================================

export interface ExtensionMessageBase {
  type: string;
}

// ============================================================================
// State Messages
// ============================================================================

export interface StateMessage extends ExtensionMessageBase {
  type: 'state';
  state: AppState;
}

export interface StatePartialMessage extends ExtensionMessageBase {
  type: 'statePartial';
  patch: Partial<AppState>;
}

// ============================================================================
// Streaming Messages
// ============================================================================

export interface StreamStartMessage extends ExtensionMessageBase {
  type: 'streamStart';
  messageId: string;
  model: string;
}

export interface StreamChunkMessage extends ExtensionMessageBase {
  type: 'streamChunk';
  messageId: string;
  content: string;
  thinking?: boolean;
}

export interface StreamToolCallMessage extends ExtensionMessageBase {
  type: 'streamToolCall';
  messageId: string;
  tool: string;
  args: string;
  toolCallId: string;
}

export interface StreamToolResultMessage extends ExtensionMessageBase {
  type: 'streamToolResult';
  messageId: string;
  tool: string;
  result: string;
  toolCallId: string;
}

export interface StreamEndMessage extends ExtensionMessageBase {
  type: 'streamEnd';
  messageId: string;
  usage?: TokenUsage;
}

export interface StreamErrorMessage extends ExtensionMessageBase {
  type: 'streamError';
  messageId: string;
  error: ErrorInfo;
}

// ============================================================================
// Error Messages
// ============================================================================

export interface ErrorMessage extends ExtensionMessageBase {
  type: 'error';
  error: ErrorInfo;
}

export interface ErrorClearMessage extends ExtensionMessageBase {
  type: 'errorClear';
}

export interface RateLimitStartMessage extends ExtensionMessageBase {
  type: 'rateLimitStart';
  retryAfterMs: number;
  provider: string;
}

export interface RateLimitEndMessage extends ExtensionMessageBase {
  type: 'rateLimitEnd';
}

// ============================================================================
// Mission & Task Messages
// ============================================================================

export interface MissionCreatedMessage extends ExtensionMessageBase {
  type: 'missionCreated';
  mission: WebviewMission;
}

export interface MissionUpdatedMessage extends ExtensionMessageBase {
  type: 'missionUpdated';
  mission: WebviewMission;
}

export interface TaskUpdatedMessage extends ExtensionMessageBase {
  type: 'taskUpdated';
  task: WebviewTask;
}

export interface TaskProgressMessage extends ExtensionMessageBase {
  type: 'taskProgress';
  taskId: string;
  progress: number;
  message: string;
}

// ============================================================================
// Approval Messages
// ============================================================================

export interface ApprovalRequiredMessage extends ExtensionMessageBase {
  type: 'approvalRequired';
  approval: WebviewPendingApproval;
}

export interface ApprovalResolvedMessage extends ExtensionMessageBase {
  type: 'approvalResolved';
  approvalId: string;
}

// ============================================================================
// Activity Messages
// ============================================================================

export interface ActivityStartedMessage extends ExtensionMessageBase {
  type: 'activityStarted';
  activity: WebviewActivityEntry;
}

export interface ActivityCompletedMessage extends ExtensionMessageBase {
  type: 'activityCompleted';
  activityId: string;
  result: string;
}

export interface ActivityFailedMessage extends ExtensionMessageBase {
  type: 'activityFailed';
  activityId: string;
  error: string;
}

// ============================================================================
// Quota Messages
// ============================================================================

export interface QuotaUpdatedMessage extends ExtensionMessageBase {
  type: 'quotaUpdated';
  status: WebviewQuotaStatus;
}

// ============================================================================
// Union Type
// ============================================================================

export type ExtensionMessage =
  | StateMessage
  | StatePartialMessage
  | StreamStartMessage
  | StreamChunkMessage
  | StreamToolCallMessage
  | StreamToolResultMessage
  | StreamEndMessage
  | StreamErrorMessage
  | ErrorMessage
  | ErrorClearMessage
  | RateLimitStartMessage
  | RateLimitEndMessage
  | MissionCreatedMessage
  | MissionUpdatedMessage
  | TaskUpdatedMessage
  | TaskProgressMessage
  | ApprovalRequiredMessage
  | ApprovalResolvedMessage
  | ActivityStartedMessage
  | ActivityCompletedMessage
  | ActivityFailedMessage
  | QuotaUpdatedMessage;

// ============================================================================
// Shared Types (Webview-compatible versions)
// ============================================================================

export interface AppState {
  messages: ChatMessage[];
  isStreaming: boolean;
  currentStreamingMessageId: string | null;
  activeMission: WebviewMission | null;
  tasks: WebviewTask[];
  activities: WebviewActivityEntry[];
  quota: WebviewQuotaStatus;
  pendingApprovals: WebviewPendingApproval[];
  sidebarTab: 'tasks' | 'activity' | 'quota';
  sidebarCollapsed: boolean;
  settings: WebviewSettings;
  currentError: ErrorInfo | null;
  rateLimitInfo: RateLimitInfo | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string; // ISO string for JSON serialization
  isStreaming?: boolean;
  isThinking?: boolean;
  toolCalls?: ToolCall[];
  usage?: TokenUsage;
  error?: ErrorInfo;
  attachments?: Attachment[];
}

export interface ToolCall {
  id: string;
  name: string;
  args: string;
  result?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

export interface Attachment {
  type: 'file' | 'selection' | 'image';
  content: string;
  name?: string;
  path?: string;
}

export interface ErrorInfo {
  code: string;
  message: string;
  category: 'network' | 'rate_limit' | 'validation' | 'timeout' | 'provider' | 'context_overflow' | 'unknown';
  retryable: boolean;
  retryAfterMs?: number;
  suggestion?: string;
}

export interface RateLimitInfo {
  retryAfterMs: number;
  provider: string;
  startTime: number;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number;
}

export interface WebviewMission {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export interface WebviewTask {
  id: string;
  missionId: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  priority: 'low' | 'normal' | 'high' | 'critical';
  level: 'worker' | 'lord' | 'overlord' | 'sovereign';
  progress?: number;
  progressMessage?: string;
}

export interface WebviewActivityEntry {
  id: string;
  type: 'thinking' | 'tool_call' | 'message' | 'approval' | 'error';
  title: string;
  description?: string;
  timestamp: string;
  status: 'pending' | 'completed' | 'failed';
  duration?: number;
  metadata?: Record<string, unknown>;
}

export interface WebviewQuotaStatus {
  providers: WebviewProviderQuota[];
  totalUsed: number;
  totalLimit: number;
  resetTime?: string;
}

export interface WebviewProviderQuota {
  provider: string;
  used: number;
  limit: number;
  percentage: number;
  level: 'low' | 'medium' | 'high';
}

export interface WebviewPendingApproval {
  id: string;
  taskId: string;
  title: string;
  description: string;
  changes: WebviewFileChange[];
  requestedAt: string;
}

export interface WebviewFileChange {
  filePath: string;
  originalContent: string;
  modifiedContent: string;
  diff: string;
  changeType: 'create' | 'modify' | 'delete';
}

export interface WebviewSettings {
  approvalMode: 'full_automation' | 'step_by_step' | 'fully_manual';
  showQuotaInStatusBar: boolean;
  notifyOnApprovalRequired: boolean;
  notifyOnQuotaWarning: boolean;
  maxDisplayEntries: number;
  autoResolveSimpleConflicts: boolean;
}
