/**
 * Messages sent from webview to extension host
 */

// ============================================================================
// Base Message Interface
// ============================================================================

export interface WebviewMessageBase {
  type: string;
}

// ============================================================================
// Chat Messages
// ============================================================================

export interface ChatSendMessage extends WebviewMessageBase {
  type: 'chat:send';
  content: string;
  attachments?: Attachment[];
}

export interface ChatCancelMessage extends WebviewMessageBase {
  type: 'chat:cancel';
}

export interface ChatRetryMessage extends WebviewMessageBase {
  type: 'chat:retry';
  messageId: string;
}

export interface ChatClearMessage extends WebviewMessageBase {
  type: 'chat:clear';
}

export interface ChatRegenerateMessage extends WebviewMessageBase {
  type: 'chat:regenerate';
  messageId: string;
}

// ============================================================================
// Approval Messages
// ============================================================================

export interface ApprovalRespondMessage extends WebviewMessageBase {
  type: 'approval:respond';
  approvalId: string;
  action: 'approve' | 'reject' | 'modify';
}

export interface ApprovalReviewHunksMessage extends WebviewMessageBase {
  type: 'approval:reviewHunks';
  approvalId: string;
}

// ============================================================================
// Task Messages
// ============================================================================

export interface TaskCancelMessage extends WebviewMessageBase {
  type: 'task:cancel';
  taskId: string;
}

export interface TaskRetryMessage extends WebviewMessageBase {
  type: 'task:retry';
  taskId: string;
}

// ============================================================================
// Settings Messages
// ============================================================================

export interface SettingsUpdateMessage extends WebviewMessageBase {
  type: 'settings:update';
  settings: Partial<Settings>;
}

export interface SetApprovalModeMessage extends WebviewMessageBase {
  type: 'settings:setApprovalMode';
  mode: ApprovalMode;
}

// ============================================================================
// Navigation Messages
// ============================================================================

export interface NavOpenFileMessage extends WebviewMessageBase {
  type: 'nav:openFile';
  path: string;
  line?: number;
}

export interface NavShowDiffMessage extends WebviewMessageBase {
  type: 'nav:showDiff';
  original: string;
  modified: string;
}

// ============================================================================
// System Messages
// ============================================================================

export interface ReadyMessage extends WebviewMessageBase {
  type: 'ready';
}

export interface RequestStateMessage extends WebviewMessageBase {
  type: 'requestState';
}

// ============================================================================
// Union Type
// ============================================================================

export type WebviewMessage =
  | ChatSendMessage
  | ChatCancelMessage
  | ChatRetryMessage
  | ChatClearMessage
  | ChatRegenerateMessage
  | ApprovalRespondMessage
  | ApprovalReviewHunksMessage
  | TaskCancelMessage
  | TaskRetryMessage
  | SettingsUpdateMessage
  | SetApprovalModeMessage
  | NavOpenFileMessage
  | NavShowDiffMessage
  | ReadyMessage
  | RequestStateMessage;

// ============================================================================
// Shared Types
// ============================================================================

export interface Attachment {
  type: 'file' | 'selection' | 'image';
  content: string;
  name?: string;
  path?: string;
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
