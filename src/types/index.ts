/**
 * AlterCode - Core Type Definitions
 *
 * This file contains all shared types, interfaces, and enums used throughout
 * the AlterCode extension.
 */

// =============================================================================
// HIERARCHY TYPES
// =============================================================================

/**
 * Hierarchy levels in the AlterCode system.
 * Each level has different responsibilities and uses different AI models.
 */
export enum HierarchyLevel {
  /** Level 0: Meta-orchestrator, receives planning documents */
  SOVEREIGN = 0,
  /** Level 1: Domain directors (Frontend, Backend) */
  ARCHITECT = 1,
  /** Level 2: Feature leads within domains */
  STRATEGIST = 2,
  /** Level 3: Task coordinators managing workers */
  TEAM_LEAD = 3,
  /** Level 4: Senior workers handling complex tasks */
  SPECIALIST = 4,
  /** Level 5: Basic workers executing atomic tasks */
  WORKER = 5,
}

/**
 * Agent roles within the hierarchy.
 */
export enum AgentRole {
  // Level 0
  SOVEREIGN = 'sovereign',

  // Level 1 - Domain Architects
  FRONTEND_ARCHITECT = 'frontend_architect',
  BACKEND_ARCHITECT = 'backend_architect',

  // Level 2 - Feature Strategists
  FEATURE_STRATEGIST = 'feature_strategist',

  // Level 3 - Team Leads
  TEAM_LEAD = 'team_lead',

  // Level 4 - Specialists
  SPECIALIST = 'specialist',

  // Level 5 - Workers
  WORKER = 'worker',
}

/**
 * Agent status within the system.
 */
export enum AgentStatus {
  IDLE = 'idle',
  BUSY = 'busy',
  WAITING = 'waiting',
  ERROR = 'error',
  TERMINATED = 'terminated',
}

/**
 * Metrics tracked for each agent.
 */
export interface AgentMetrics {
  tasksCompleted: number;
  tasksFailed: number;
  averageExecutionTimeMs: number;
  tokensSent: number;
  tokensReceived: number;
  lastActiveAt: Date | null;
}

/**
 * Base interface for all hierarchy agents.
 */
export interface HierarchyAgent {
  id: string;
  level: HierarchyLevel;
  role: AgentRole;
  parentId: string | null;
  childIds: string[];
  status: AgentStatus;
  currentTaskId: string | null;
  model: AIModel;
  metrics: AgentMetrics;
  createdAt: Date;
}

/**
 * Configuration for spawning a new agent.
 */
export interface SpawnConfig {
  level: HierarchyLevel;
  parentId: string | null;
  role: AgentRole;
  initialTaskId?: string;
  modelPreference?: 'claude' | 'glm' | 'auto';
}

/**
 * Constraints for agent spawning.
 */
export interface SpawnConstraints {
  maxConcurrent: number;
  quotaThreshold: number;
  taskQueueThreshold: number;
}

// =============================================================================
// TASK TYPES
// =============================================================================

/**
 * Types of tasks in the system.
 */
export enum TaskType {
  // Sovereign level
  MISSION_PLANNING = 'mission_planning',

  // Architect level
  DOMAIN_DESIGN = 'domain_design',
  ARCHITECTURE_DECISION = 'architecture_decision',

  // Strategist level
  FEATURE_DESIGN = 'feature_design',
  API_DESIGN = 'api_design',

  // Team Lead level
  TASK_COORDINATION = 'task_coordination',
  CODE_REVIEW = 'code_review',

  // Specialist level
  COMPLEX_IMPLEMENTATION = 'complex_implementation',
  REFACTORING = 'refactoring',

  // Worker level
  SIMPLE_IMPLEMENTATION = 'simple_implementation',
  TEST_WRITING = 'test_writing',
  DOCUMENTATION = 'documentation',
  CODE_MODIFICATION = 'code_modification',
}

/**
 * Task status values.
 */
export enum TaskStatus {
  PENDING = 'pending',
  ASSIGNED = 'assigned',
  RUNNING = 'running',
  REVIEW = 'review',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  BLOCKED = 'blocked',
  REJECTED = 'rejected',
  MERGED = 'merged',
}

/**
 * Task priority levels.
 */
export enum TaskPriority {
  CRITICAL = 100,
  HIGH = 75,
  NORMAL = 50,
  LOW = 25,
  BACKGROUND = 0,
}

/**
 * Reference to a file in the codebase.
 */
export interface FileReference {
  path: string;
  startLine?: number;
  endLine?: number;
  relevance: 'primary' | 'secondary' | 'context';
}

/**
 * Context provided to a task.
 */
export interface TaskContext {
  workspaceRoot: string;
  relevantFiles: FileReference[];
  previousDecisions: Decision[];
  constraints: string[];
  additionalContext?: Record<string, unknown>;
}

/**
 * A decision made during task execution.
 */
export interface Decision {
  id: string;
  taskId: string;
  description: string;
  rationale: string;
  madeAt: Date;
  madeBy: string;
}

/**
 * Input for a task.
 */
export interface TaskInput {
  prompt: string;
  context: TaskContext;
  constraints?: AgentConstraints;
}

/**
 * Output from a task.
 */
export interface TaskOutput {
  result: string;
  fileChanges: FileChange[];
  decisions: Decision[];
  metrics: ExecutionMetrics;
}

/**
 * Dependency between tasks.
 */
export interface TaskDependency {
  taskId: string;
  type: 'blocking' | 'informational';
  status: 'pending' | 'satisfied';
}

/**
 * Task metrics.
 */
export interface TaskMetrics {
  startTime: Date | null;
  endTime: Date | null;
  executionTimeMs: number;
  tokensSent: number;
  tokensReceived: number;
  retryCount: number;
}

/**
 * Complete task definition.
 */
export interface Task {
  id: string;
  missionId: string;
  parentTaskId: string | null;
  childTaskIds: string[];

  level: HierarchyLevel;
  assignedAgentId: string | null;

  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;

  title: string;
  description: string;
  context: TaskContext;

  input: TaskInput;
  output: TaskOutput | null;

  dependencies: TaskDependency[];

  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;

  metrics: TaskMetrics;
}

// =============================================================================
// MISSION TYPES
// =============================================================================

/**
 * Mission status values.
 */
export enum MissionStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  PLANNING = 'planning',
  PLANNED = 'planned',      // Planning complete, awaiting execution approval
  EXECUTING = 'executing',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * A complete mission (from planning document).
 */
export interface Mission {
  id: string;
  title: string;
  description: string;
  planningDocument: string;
  status: MissionStatus;
  rootTaskIds: string[];
  config: MissionConfig;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

/**
 * Mission-specific configuration.
 */
export interface MissionConfig {
  approvalMode: ApprovalMode;
  maxConcurrentWorkers: number;
  quotaBudget?: QuotaBudget;
  domainOverrides?: Record<string, ApprovalMode>;
}

/**
 * Budget allocation for a mission.
 */
export interface QuotaBudget {
  maxClaudeCalls: number;
  maxGlmCalls: number;
  maxTokens: number;
}

// =============================================================================
// AI AGENT TYPES
// =============================================================================

/**
 * AI model identifiers.
 */
export enum AIModel {
  CLAUDE_OPUS = 'claude-opus',
  GLM_4_7 = 'glm-4.7',
}

/**
 * AI provider identifiers.
 */
export type AIProvider = 'claude' | 'glm';

/**
 * Constraints for agent execution.
 */
export interface AgentConstraints {
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
  retryCount?: number;
}

/**
 * Request to an AI agent.
 */
export interface AgentRequest {
  taskId: string;
  prompt: string;
  systemPrompt?: string;
  context: TaskContext;
  constraints: AgentConstraints;
}

/**
 * Response from an AI agent.
 */
export interface AgentResponse {
  taskId: string;
  status: 'success' | 'failure' | 'partial';
  result: AgentResult;
  metrics: ExecutionMetrics;
  error?: AgentError;
}

/**
 * Result content from an agent.
 */
export interface AgentResult {
  content: string;
  reasoning?: string;
  fileChanges?: FileChange[];
  metadata?: Record<string, unknown>;
}

/**
 * Error from an agent.
 */
export interface AgentError {
  code: string;
  message: string;
  details?: unknown;
  retryable: boolean;
}

/**
 * Metrics from agent execution.
 */
export interface ExecutionMetrics {
  startTime: Date;
  endTime: Date;
  durationMs: number;
  tokensSent: number;
  tokensReceived: number;
  model: AIModel;
}

// =============================================================================
// FILE & CONFLICT TYPES
// =============================================================================

/**
 * A change to a file.
 */
export interface FileChange {
  filePath: string;
  originalContent: string | null;
  modifiedContent: string;
  diff: string;
  changeType: 'create' | 'modify' | 'delete';
  regions?: string[];
}

/**
 * Code region types.
 */
export enum RegionType {
  IMPORTS = 'imports',
  TYPE_DEFINITION = 'type_definition',
  INTERFACE = 'interface',
  CLASS = 'class',
  FUNCTION = 'function',
  VARIABLE = 'variable',
  EXPORT = 'export',
  OTHER = 'other',
}

/**
 * A semantic region of code.
 */
export interface CodeRegion {
  id: string;
  filePath: string;
  type: RegionType;
  name: string;
  startLine: number;
  endLine: number;
  dependencies: string[];
  modifiedBy: string | null;
}

/**
 * Virtual branch for tracking changes.
 */
export interface VirtualBranch {
  id: string;
  agentId: string;
  taskId: string;
  baseSnapshot: string;
  changes: FileChange[];
  status: 'active' | 'merged' | 'abandoned';
  createdAt: Date;
}

/**
 * Merge conflict between branches.
 */
export interface MergeConflict {
  id: string;
  filePath: string;
  baseContent: string;
  branch1: VirtualBranch;
  branch2: VirtualBranch;
  conflictingRegions: CodeRegion[];
}

/**
 * Resolution for a merge conflict.
 */
export interface MergeResolution {
  conflictId: string;
  resolvedContent: string;
  resolvedBy: string;
  strategy: 'auto' | 'manual' | 'ai_assisted';
}

// =============================================================================
// QUOTA TYPES
// =============================================================================

/**
 * Quota window for tracking usage.
 */
export interface QuotaWindow {
  id: string;
  provider: AIProvider;
  windowStart: Date;
  windowEnd: Date;
  windowDurationMs: number;
  usage: UsageMetrics;
  limits: UsageLimits;
}

/**
 * Usage metrics within a quota window.
 */
export interface UsageMetrics {
  callCount: number;
  tokensSent: number;
  tokensReceived: number;
  byLevel: Record<HierarchyLevel, LevelUsage>;
}

/**
 * Usage by hierarchy level.
 */
export interface LevelUsage {
  callCount: number;
  tokensSent: number;
  tokensReceived: number;
}

/**
 * Usage limits for a quota window.
 */
export interface UsageLimits {
  maxCalls: number | null;
  maxTokens: number | null;
  warningThreshold: number;
  hardStopThreshold: number;
}

/**
 * Quota status summary.
 */
export interface QuotaStatus {
  provider: AIProvider;
  usageRatio: number;
  status: 'ok' | 'warning' | 'critical' | 'exceeded';
  timeUntilResetMs: number;
  currentWindow: QuotaWindow;
}

// =============================================================================
// APPROVAL TYPES
// =============================================================================

/**
 * Approval modes for code changes.
 */
export enum ApprovalMode {
  FULLY_MANUAL = 'fully_manual',
  STEP_BY_STEP = 'step_by_step',
  FULL_AUTOMATION = 'full_automation',
}

/**
 * Approval status values.
 */
export enum ApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  MODIFIED = 'modified',
  TIMEOUT = 'timeout',
}

/**
 * Pending approval request.
 */
export interface PendingApproval {
  id: string;
  taskId: string;
  changes: FileChange[];
  mode: ApprovalMode;
  status: ApprovalStatus;
  requestedAt: Date;
  respondedAt: Date | null;
  response?: ApprovalResponse;
}

/**
 * Response to an approval request.
 */
export interface ApprovalResponse {
  approved: boolean;
  action: 'approve' | 'reject' | 'modify' | 'skip';
  modifications?: FileChange[];
  comment?: string;
}

/**
 * Result of an approval request.
 */
export interface ApprovalResult {
  approved: boolean;
  mode: ApprovalMode;
  automatic: boolean;
  action?: 'approve' | 'reject' | 'modify' | 'skip';
  modifications?: FileChange[];
}

// =============================================================================
// UI & COMMUNICATION TYPES
// =============================================================================

/**
 * Hive state for UI updates.
 */
export interface HiveState {
  activeMission: Mission | null;
  agents: HierarchyAgent[];
  taskQueue: Task[];
  runningTasks: Task[];
  completedTasks: Task[];
  quotaStatus: Record<AIProvider, QuotaStatus>;
  pendingApprovals: PendingApproval[];
}

/**
 * Message from extension to webview.
 */
export type ExtensionMessage =
  | { type: 'stateUpdate'; payload: HiveState }
  | { type: 'missionProgress'; payload: MissionProgress }
  | { type: 'approvalRequest'; payload: PendingApproval }
  | { type: 'taskComplete'; payload: TaskResult }
  | { type: 'error'; payload: ErrorInfo }
  | { type: 'quotaUpdate'; payload: QuotaStatus };

/**
 * Message from webview to extension.
 */
export type WebviewMessage =
  | { type: 'submitPlan'; payload: { content: string; mode?: string } }
  | { type: 'approvalResponse'; payload: { approvalId: string; response: ApprovalResponse } }
  | { type: 'pauseMission'; payload: { missionId: string } }
  | { type: 'resumeMission'; payload: { missionId: string } }
  | { type: 'cancelMission'; payload: { missionId: string } }
  | { type: 'updateConfig'; payload: Partial<AlterCodeConfig> }
  | { type: 'quickAction'; payload: QuickAction }
  | { type: 'sendMessage'; payload: { content: string; mode: string } }
  | { type: 'cancelGeneration' }
  | { type: 'clearChat' }
  | { type: 'openSettings' }
  | { type: 'checkCli' }
  | { type: 'openFile'; payload: { filePath: string } }
  | { type: 'openMissionControl' };

/**
 * Mission progress update.
 */
export interface MissionProgress {
  missionId: string;
  completedTasks: number;
  totalTasks: number;
  currentPhase: string;
  activeAgents: number;
}

/**
 * Task result summary.
 */
export interface TaskResult {
  taskId: string;
  status: TaskStatus;
  output?: TaskOutput;
  error?: AgentError;
}

/**
 * Error information for UI.
 */
export interface ErrorInfo {
  code: string;
  message: string;
  details?: unknown;
  timestamp: Date;
}

/**
 * Quick action from UI.
 */
export interface QuickAction {
  action: 'review' | 'refactor' | 'explain' | 'test';
  filePath: string;
  startLine?: number;
  endLine?: number;
  content?: string;
}

// =============================================================================
// CONFIGURATION TYPES
// =============================================================================

/**
 * AlterCode configuration.
 */
export interface AlterCodeConfig {
  enabled: boolean;
  approvalMode: ApprovalMode;

  claude: ClaudeConfig;
  glm: GLMConfig;

  hierarchy: HierarchyConfig;
  quota: QuotaConfig;
  ui: UIConfig;
  storage: StorageConfig;
}

/**
 * Claude Code configuration.
 */
export interface ClaudeConfig {
  cliPath: string;
  maxOutputTokens: number;
  sessionPersistence: boolean;
}

/**
 * GLM configuration.
 */
export interface GLMConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

/**
 * Hierarchy configuration.
 */
export interface HierarchyConfig {
  maxConcurrentWorkers: number;
  enableSpecialists: boolean;
  complexityThreshold: number;
}

/**
 * Quota configuration.
 */
export interface QuotaConfig {
  warningThreshold: number;
  hardStopThreshold: number;
  enablePrediction: boolean;
}

/**
 * UI configuration.
 */
export interface UIConfig {
  showStatusBar: boolean;
  autoOpenMissionControl: boolean;
  inlineActionsEnabled: boolean;
}

/**
 * Storage configuration.
 */
export interface StorageConfig {
  databasePath: string;
  cachePath: string;
  maxHistoryDays: number;
}

// =============================================================================
// EVENT TYPES
// =============================================================================

/**
 * Event types emitted by the system.
 */
export enum EventType {
  // Mission events
  MISSION_CREATED = 'mission:created',
  MISSION_STARTED = 'mission:started',
  MISSION_PAUSED = 'mission:paused',
  MISSION_RESUMED = 'mission:resumed',
  MISSION_COMPLETED = 'mission:completed',
  MISSION_FAILED = 'mission:failed',
  MISSION_CANCELLED = 'mission:cancelled',

  // Task events
  TASK_CREATED = 'task:created',
  TASK_ASSIGNED = 'task:assigned',
  TASK_STARTED = 'task:started',
  TASK_COMPLETED = 'task:completed',
  TASK_FAILED = 'task:failed',

  // Agent events
  AGENT_SPAWNED = 'agent:spawned',
  AGENT_TERMINATED = 'agent:terminated',
  AGENT_ERROR = 'agent:error',

  // Quota events
  QUOTA_WARNING = 'quota:warning',
  QUOTA_EXCEEDED = 'quota:exceeded',
  QUOTA_RESET = 'quota:reset',

  // Approval events
  APPROVAL_REQUESTED = 'approval:requested',
  APPROVAL_RESPONDED = 'approval:responded',

  // Conflict events
  CONFLICT_DETECTED = 'conflict:detected',
  CONFLICT_RESOLVED = 'conflict:resolved',
}

/**
 * Base event interface.
 */
export interface AlterCodeEvent<T = unknown> {
  type: EventType;
  timestamp: Date;
  payload: T;
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Result type for operations that can fail.
 */
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Async result type.
 */
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

/**
 * Domain type for domain-specific operations.
 */
export type Domain = 'frontend' | 'backend';

/**
 * Log level for logging.
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}
