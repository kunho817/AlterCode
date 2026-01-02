/**
 * Message types for communication between extension host and webview
 */

// ============================================================================
// Extension → Webview Messages (ExtensionMessage)
// ============================================================================

export type ExtensionMessage =
  // State synchronization
  | { type: 'state'; state: AppState }
  | { type: 'statePartial'; patch: Partial<AppState> }

  // Streaming
  | { type: 'streamStart'; messageId: string; model: string }
  | { type: 'streamChunk'; messageId: string; content: string; thinking?: boolean }
  | { type: 'streamToolCall'; messageId: string; tool: string; args: string; toolCallId: string }
  | { type: 'streamToolResult'; messageId: string; tool: string; result: string; toolCallId: string }
  | { type: 'streamEnd'; messageId: string; usage?: TokenUsage }
  | { type: 'streamError'; messageId: string; error: ErrorInfo }

  // Errors
  | { type: 'error'; error: ErrorInfo }
  | { type: 'errorClear' }
  | { type: 'rateLimitStart'; retryAfterMs: number; provider: string }
  | { type: 'rateLimitEnd' }

  // Tasks & Missions
  | { type: 'missionCreated'; mission: Mission }
  | { type: 'missionUpdated'; mission: Mission }
  | { type: 'taskUpdated'; task: Task }
  | { type: 'taskProgress'; taskId: string; progress: number; message: string }

  // Approvals
  | { type: 'approvalRequired'; approval: PendingApproval }
  | { type: 'approvalResolved'; approvalId: string }

  // Activity
  | { type: 'activityStarted'; activity: ActivityEntry }
  | { type: 'activityCompleted'; activityId: string; result: string }
  | { type: 'activityFailed'; activityId: string; error: string }

  // Quota
  | { type: 'quotaUpdated'; status: QuotaStatus };

// ============================================================================
// Webview → Extension Messages (WebviewMessage)
// ============================================================================

export type WebviewMessage =
  // Chat
  | { type: 'chat:send'; content: string; attachments?: Attachment[] }
  | { type: 'chat:cancel' }
  | { type: 'chat:retry'; messageId: string }
  | { type: 'chat:clear' }
  | { type: 'chat:regenerate'; messageId: string }

  // Approvals
  | { type: 'approval:respond'; approvalId: string; action: 'approve' | 'reject' | 'modify' }
  | { type: 'approval:reviewHunks'; approvalId: string }

  // Tasks
  | { type: 'task:cancel'; taskId: string }
  | { type: 'task:retry'; taskId: string }

  // Settings
  | { type: 'settings:update'; settings: Partial<Settings> }
  | { type: 'settings:setApprovalMode'; mode: ApprovalMode }

  // Navigation
  | { type: 'nav:openFile'; path: string; line?: number }
  | { type: 'nav:showDiff'; original: string; modified: string }

  // System
  | { type: 'ready' }
  | { type: 'requestState' };

// ============================================================================
// Shared Types
// ============================================================================

export interface AppState {
  // Chat state
  messages: ChatMessage[];
  isStreaming: boolean;
  currentStreamingMessageId: string | null;

  // Mission state
  activeMission: Mission | null;
  tasks: Task[];

  // Activity
  activities: ActivityEntry[];

  // Quota
  quota: QuotaStatus;

  // Approvals
  pendingApprovals: PendingApproval[];

  // UI state
  sidebarTab: 'tasks' | 'activity' | 'quota';
  sidebarCollapsed: boolean;

  // Settings
  settings: Settings;

  // Errors
  currentError: ErrorInfo | null;
  rateLimitInfo: RateLimitInfo | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
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
  category: ErrorCategory;
  retryable: boolean;
  retryAfterMs?: number;
  suggestion?: string;
}

export type ErrorCategory =
  | 'network'
  | 'rate_limit'
  | 'validation'
  | 'timeout'
  | 'provider'
  | 'context_overflow'
  | 'unknown';

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

export interface Mission {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

export interface Task {
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

export interface ActivityEntry {
  id: string;
  type: 'thinking' | 'tool_call' | 'message' | 'approval' | 'error';
  title: string;
  description?: string;
  timestamp: Date;
  status: 'pending' | 'completed' | 'failed';
  duration?: number;
  metadata?: Record<string, unknown>;
}

export interface QuotaStatus {
  providers: ProviderQuota[];
  totalUsed: number;
  totalLimit: number;
  resetTime?: Date;
}

export interface ProviderQuota {
  provider: string;
  used: number;
  limit: number;
  percentage: number;
  level: 'low' | 'medium' | 'high';
}

export interface PendingApproval {
  id: string;
  taskId: string;
  title: string;
  description: string;
  changes: FileChange[];
  requestedAt: Date;
}

export interface FileChange {
  filePath: string;
  originalContent: string;
  modifiedContent: string;
  diff: string;
  changeType: 'create' | 'modify' | 'delete';
}

export interface Settings {
  approvalMode: ApprovalMode;
  showQuotaInStatusBar: boolean;
  notifyOnApprovalRequired: boolean;
  notifyOnQuotaWarning: boolean;
  maxDisplayEntries: number;
  autoResolveSimpleConflicts: boolean;
}

export type ApprovalMode = 'full_automation' | 'step_by_step' | 'fully_manual';
