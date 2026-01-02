/**
 * Type definitions for Mission Control React UI
 * Matches the state structure from MissionControlPanel.ts
 */

// Agent hierarchy levels
export type AgentLevel = 'sovereign' | 'overlord' | 'lord' | 'worker';
export type AgentStatus = 'active' | 'thinking' | 'idle' | 'waiting' | 'paused';

// Chat message
export interface ChatMessage {
  id: string;
  role: 'user' | 'sovereign' | 'overlord' | 'lord' | 'worker' | 'system';
  content: string;
  timestamp: Date | string;
  agentId?: string;
  approval?: {
    id: string;
    changes: Array<{ file: string; additions: number; deletions: number }>;
    status: 'pending' | 'approved' | 'rejected';
  };
}

// Agent node in hierarchy
export interface AgentNode {
  id: string;
  level: AgentLevel;
  status: AgentStatus;
  model: string;
  currentTask?: string;
  children: AgentNode[];
}

// Mission phases
export const PHASES = ['planning', 'validation', 'execution', 'verification', 'completion'] as const;
export type Phase = typeof PHASES[number];

// Mission progress
export interface MissionProgress {
  overallProgress: number;
  tasksTotal: number;
  tasksCompleted: number;
  estimatedCompletion?: string;
}

// Task
export interface Task {
  id: string;
  title?: string;
  description?: string;
  status: 'pending' | 'running' | 'blocked' | 'completed' | 'failed';
  priority?: 'critical' | 'high' | 'normal' | 'low';
}

// Mission
export interface Mission {
  id: string;
  title: string;
  status: 'active' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  phase?: Phase;
  progress?: MissionProgress;
  tasks?: Task[];
  rollbackPoints?: number;
}

// Activity entry
export interface Activity {
  id: string;
  agentId?: string;
  level?: AgentLevel;
  status: 'thinking' | 'completed' | 'failed' | 'unknown';
  prompt?: string;
  message?: string;
  timestamp?: string;
  error?: string;
  durationMs?: number;
  tokensUsed?: number;
  metrics?: {
    durationMs?: number;
    tokensSent?: number;
    tokensReceived?: number;
  };
}

// Quota usage per level
export interface LevelUsage {
  callCount: number;
  tokensSent?: number;
  tokensReceived?: number;
}

// Quota window usage
export interface WindowUsage {
  callCount: number;
  tokensSent: number;
  tokensReceived: number;
  byLevel?: Record<AgentLevel, LevelUsage>;
}

// Provider quota
export interface ProviderQuota {
  usageRatio: number;
  status: 'ok' | 'warning' | 'critical' | 'exceeded';
  timeUntilResetMs: number;
  currentWindow?: {
    usage: WindowUsage;
  };
}

// Quota state
export interface QuotaState {
  claude?: ProviderQuota;
  glm?: ProviderQuota;
}

// Usage history entry
export interface UsageHistoryEntry {
  usageRatio: number;
  timestamp?: string;
}

// Usage history
export interface UsageHistory {
  claude: UsageHistoryEntry[];
  glm: UsageHistoryEntry[];
}

// File change for approval
export interface FileChange {
  filePath?: string;
  file?: string;
  additions?: number;
  deletions?: number;
}

// Pending approval
export interface PendingApproval {
  id: string;
  taskId?: string;
  changes: FileChange[];
  requestedAt?: string | Date;
}

// Conflict branch
export interface ConflictBranch {
  agentId?: string;
}

// Conflict region
export interface ConflictRegion {
  startLine: number;
  endLine: number;
}

// Conflict
export interface Conflict {
  id: string;
  filePath?: string;
  file?: string;
  branch1?: ConflictBranch;
  branch2?: ConflictBranch;
  conflictingRegions?: ConflictRegion[];
}

// Performance operation stat
export interface OperationStat {
  name: string;
  count: number;
  totalMs: number;
  avgMs: number;
}

// Performance state
export interface PerformanceState {
  stats: OperationStat[];
}

// Settings
export interface Settings {
  'claude.apiKey'?: string;
  'claude.model'?: string;
  'claude.mode'?: 'api' | 'cli';
  'claude.cliPath'?: string;
  'claude.timeout'?: number;
  'glm.apiKey'?: string;
  'glm.model'?: string;
  'glm.endpoint'?: string;
  'approval.defaultMode'?: 'full_automation' | 'step_by_step' | 'fully_manual';
  'ui.notifyOnQuotaWarning'?: boolean;
  'ui.notifyOnApprovalRequired'?: boolean;
  'ui.showQuotaInStatusBar'?: boolean;
  'verification.strictness'?: 'strict' | 'standard' | 'lenient';
  'maxContextTokens'?: number;
  'activity.maxDisplayEntries'?: number;
  'llm.enableFallback'?: boolean;
  'conflicts.autoResolveSimple'?: boolean;
  'logLevel'?: 'debug' | 'info' | 'warn' | 'error';
}

// Approval mode
export type ApprovalMode = 'full_automation' | 'step_by_step' | 'fully_manual';

// Hierarchy execution status
export interface HierarchyStatus {
  isExecuting: boolean;
  activeLevel: AgentLevel | null;
  activeModel: string | null;
  currentTask: string | null;
  phase: Phase | null;
  missionId: string | null;
}

// App state
export interface AppState {
  activeMissions: Mission[];
  chatMessages: ChatMessage[];
  activities: Activity[];
  agents: AgentNode | null;
  quota: QuotaState | null;
  usageHistory: UsageHistory;
  pendingApprovals: PendingApproval[];
  conflicts: Conflict[];
  performance: PerformanceState | null;
  settings: Settings;
  approvalMode: ApprovalMode;
  hierarchyStatus: HierarchyStatus;
}

// Section types
export type Section = 'chat' | 'mission' | 'activity' | 'agents' | 'config';

// VS Code API
export interface VSCodeAPI {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

// Message from extension
export interface ExtensionMessage {
  type: string;
  payload?: unknown;
}
