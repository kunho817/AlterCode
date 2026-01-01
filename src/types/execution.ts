/**
 * Execution Layer Types
 *
 * Types for task execution:
 * - Agent Hierarchy
 * - Task Management
 * - Mission Management
 * - Execution Coordination
 */

import {
  AgentId,
  AsyncResult,
  CancellationToken,
  Disposable,
  IntentId,
  MissionId,
  TaskId,
  TokenCount,
} from './common';
import { IStore } from './infrastructure';
import { ContextSelection } from './context';

// ============================================================================
// Hierarchy Types
// ============================================================================

/** Hierarchy level */
export type HierarchyLevel =
  | 'sovereign'    // Strategic decisions, mission planning
  | 'lord'         // Tactical planning, task breakdown
  | 'overlord'     // Task coordination, execution management
  | 'worker';      // Actual code implementation

/** Agent role */
export type AgentRole =
  | 'architect'    // High-level design decisions
  | 'planner'      // Task breakdown and planning
  | 'implementer'  // Code implementation
  | 'reviewer'     // Code review
  | 'tester'       // Test creation
  | 'fixer';       // Bug fixing

/** AI model */
export type AIModel =
  | 'claude-opus'
  | 'claude-sonnet'
  | 'claude-haiku'
  | 'glm-4'
  | 'glm-4-flash';

/** Agent status */
export type AgentStatus =
  | 'idle'
  | 'busy'
  | 'waiting'
  | 'error'
  | 'terminated';

// ============================================================================
// Agent Types
// ============================================================================

/** Retry configuration */
export interface RetryConfig {
  readonly maxRetries: number;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly backoffMultiplier: number;
  readonly jitter: boolean;
  readonly retryableErrors: string[];
  readonly nonRetryableErrors: string[];
}

/** Agent constraints */
export interface AgentConstraints {
  readonly maxTokensPerRequest: TokenCount;
  readonly maxOutputTokens: TokenCount;
  readonly allowedActions: string[];
  readonly forbiddenPatterns: string[];
}

/** Agent configuration */
export interface AgentConfig {
  readonly maxConcurrentTasks: number;
  readonly timeoutMs: number;
  readonly retryConfig: RetryConfig;
  readonly constraints: AgentConstraints;
}

/** Agent metrics */
export interface AgentMetrics {
  readonly tasksCompleted: number;
  readonly tasksFailed: number;
  readonly totalTokensUsed: TokenCount;
  readonly averageResponseTime: number;
  readonly successRate: number;
  readonly lastActiveAt?: Date;
}

/** Agent definition */
export interface AgentDefinition {
  readonly id: AgentId;
  readonly level: HierarchyLevel;
  readonly role: AgentRole;
  readonly model: AIModel;
  readonly status: AgentStatus;
  readonly config: AgentConfig;
  readonly metrics: AgentMetrics;
  readonly createdAt: Date;
  readonly parentId?: AgentId;
  readonly childIds: AgentId[];
}

/** Default retry config */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
  retryableErrors: ['RATE_LIMIT', 'TIMEOUT', 'NETWORK_ERROR'],
  nonRetryableErrors: ['VALIDATION_ERROR', 'AUTH_ERROR', 'CANCELLED'],
};

/** Default agent constraints */
export const DEFAULT_AGENT_CONSTRAINTS: AgentConstraints = {
  maxTokensPerRequest: 8000 as TokenCount,
  maxOutputTokens: 4096 as TokenCount,
  allowedActions: ['read', 'write', 'create'],
  forbiddenPatterns: [],
};

// ============================================================================
// Task Types
// ============================================================================

/** Task type */
export type TaskType =
  | 'analyze'
  | 'plan'
  | 'implement'
  | 'review'
  | 'test'
  | 'fix'
  | 'document'
  | 'refactor';

/** Task status */
export type TaskStatus =
  | 'pending'
  | 'assigned'
  | 'running'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** Task priority */
export type TaskPriority = 'low' | 'normal' | 'high' | 'critical';

/** Task context */
export interface TaskContext {
  readonly missionContext: string;
  readonly parentContext?: string;
  readonly relevantFiles: string[];
  readonly relevantSymbols: string[];
  readonly constraints: string[];
}

/** Task input */
export interface TaskInput {
  readonly prompt: string;
  readonly context: ContextSelection;
  readonly constraints?: string[];
  readonly examples?: string[];
}

/** Artifact type */
export type ArtifactType = 'code' | 'document' | 'analysis' | 'plan' | 'test';

/** Task artifact */
export interface Artifact {
  readonly type: ArtifactType;
  readonly path?: string;
  readonly content: string;
  readonly language?: string;
  readonly metadata?: Record<string, unknown>;
}

/** Output metrics */
export interface OutputMetrics {
  readonly tokensUsed: TokenCount;
  readonly processingTime: number;
}

/** Task output */
export interface TaskOutput {
  readonly response: string;
  readonly artifacts: Artifact[];
  readonly metrics: OutputMetrics;
  readonly success: boolean;
  readonly error?: string;
}

/** Dependency type */
export type DependencyType = 'blocks' | 'informs' | 'required' | 'soft';

/** Dependency status */
export type DependencyStatus = 'pending' | 'satisfied';

/** Task dependency */
export interface TaskDependency {
  readonly taskId: TaskId;
  readonly type: DependencyType;
  readonly status: DependencyStatus;
}

/** Task metrics */
export interface TaskMetrics {
  readonly tokensIn: TokenCount;
  readonly tokensOut: TokenCount;
  readonly duration: number;
  readonly retries: number;
  readonly startedAt?: Date;
  readonly completedAt?: Date;
}

/** Task definition */
export interface Task {
  readonly id: TaskId;
  readonly missionId: MissionId;
  readonly parentTaskId?: TaskId | null;
  readonly childTaskIds?: TaskId[];
  readonly level?: HierarchyLevel;
  readonly assignedAgentId?: AgentId | null;
  readonly type: TaskType;
  status: TaskStatus;
  readonly priority: TaskPriority;
  readonly title?: string;
  readonly description: string;
  readonly context?: TaskContext;
  readonly input?: TaskInput;
  readonly output?: TaskOutput | null;
  readonly dependencies: TaskDependency[];
  readonly createdAt: Date;
  startedAt?: Date | null;
  completedAt?: Date | null;
  readonly metrics?: TaskMetrics;
  updatedAt?: Date;
  metadata?: Record<string, unknown>;
}

/** Task configuration for creation */
export interface TaskConfig {
  readonly missionId: MissionId;
  readonly parentTaskId?: TaskId;
  readonly level: HierarchyLevel;
  readonly type: TaskType;
  readonly title: string;
  readonly description: string;
  readonly context: TaskContext;
  readonly input: TaskInput;
  readonly priority?: TaskPriority;
  readonly dependencies?: TaskId[];
}

// ============================================================================
// Mission Types
// ============================================================================

/** Mission mode */
export type MissionMode =
  | 'planning'     // Planning phase only
  | 'execution'    // Full execution
  | 'analysis';    // Analysis only

/** Mission status */
export type MissionStatus =
  | 'pending'
  | 'active'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** Mission phase */
export type MissionPhase =
  | 'planning'
  | 'validation'
  | 'execution'
  | 'verification'
  | 'completion';

/** Mission progress (mutable for tracking) */
export interface MissionProgress {
  missionId?: MissionId;
  phase?: MissionPhase;
  currentPhase?: string;
  phaseProgress?: number;
  overallProgress?: number;
  tasksTotal: number;
  tasksCompleted: number;
  tasksFailed?: number;
  tasksRunning?: number;
  tasksPending?: number;
  percentage?: number;
  startedAt?: Date | null;
  estimatedCompletion?: Date | null;
  estimatedTimeRemaining?: number;
}

/** Mission metrics */
export interface MissionMetrics {
  readonly totalDuration: number;
  readonly totalTokens: TokenCount;
  readonly agentsUsed: number;
  readonly tasksExecuted: number;
  readonly retries: number;
  readonly rollbacks: number;
}

/** Mission result */
export interface MissionResult {
  readonly success: boolean;
  readonly summary: string;
  readonly artifacts: Artifact[];
  readonly metrics: MissionMetrics;
  readonly errors?: string[];
  readonly warnings?: string[];
}

/** Mission definition (mutable for state changes) */
export interface Mission {
  readonly id: MissionId;
  intentId?: IntentId;
  title: string;
  description: string;
  mode?: MissionMode;
  status: MissionStatus;
  phase?: MissionPhase;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  scope?: {
    files?: string[];
    directories?: string[];
  };
  constraints?: Array<{
    type: string;
    value: string;
  }>;
  progress?: MissionProgress;
  readonly rootTaskId?: TaskId | null;
  taskCount?: number;
  readonly createdAt: Date;
  startedAt?: Date | null;
  completedAt?: Date | null;
  updatedAt?: Date;
  result?: MissionResult | null;
  metadata?: Record<string, unknown>;
}

/** Mission filter */
export interface MissionFilter {
  readonly status?: MissionStatus[];
  readonly mode?: MissionMode[];
  readonly since?: Date;
  readonly limit?: number;
}

/** Agent filter */
export interface AgentFilter {
  readonly level?: HierarchyLevel[];
  readonly role?: AgentRole[];
  readonly status?: AgentStatus[];
  readonly limit?: number;
}

// ============================================================================
// Execution Types
// ============================================================================

/** Agent request */
export interface AgentRequest {
  readonly id?: string;
  readonly type?: string;
  readonly agentId?: AgentId;
  readonly task?: Task;
  readonly context?: ContextSelection | Array<{ type: string; path?: string; content: string }>;
  readonly prompt: string;
  readonly systemContext?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly stopSequences?: string[];
}

/** Agent response */
export interface AgentResponse {
  readonly agentId: AgentId;
  readonly taskId?: TaskId;
  readonly requestId?: string;
  readonly content: string;
  readonly artifacts?: Artifact[];
  readonly usage?: {
    readonly inputTokens: TokenCount;
    readonly outputTokens: TokenCount;
    readonly totalTokens: TokenCount;
  };
  readonly tokenUsage?: {
    readonly prompt: number;
    readonly completion: number;
    readonly total: number;
  };
  readonly duration: number;
  readonly metadata?: Record<string, unknown>;
}

/** Execution progress */
export interface ExecutionProgress {
  readonly missionId: MissionId;
  readonly phase: string;
  readonly currentTask?: TaskId;
  readonly tasksCompleted: number;
  readonly tasksTotal: number;
  readonly message: string;
  readonly timestamp: Date;
}

// ============================================================================
// Execution Store Interface
// ============================================================================

/** Execution store interface */
export interface IExecutionStore extends IStore {
  // Missions
  saveMission(mission: Mission): AsyncResult<void>;
  getMission(id: MissionId): AsyncResult<Mission | null>;
  listMissions(filter?: MissionFilter): AsyncResult<Mission[]>;
  updateMission(mission: Partial<Mission> & { id: MissionId }): AsyncResult<void>;

  // Tasks
  saveTask(task: Task): AsyncResult<void>;
  getTask(id: TaskId): AsyncResult<Task | null>;
  getTasksByMission(missionId: MissionId): AsyncResult<Task[]>;
  getTasksByStatus(status: TaskStatus): AsyncResult<Task[]>;
  updateTask(task: Partial<Task> & { id: TaskId }): AsyncResult<void>;

  // Agents
  saveAgent(agent: AgentDefinition): AsyncResult<void>;
  getAgent(id: AgentId): AsyncResult<AgentDefinition | null>;
  listAgents(filter?: AgentFilter): AsyncResult<AgentDefinition[]>;
  updateAgent(agent: Partial<AgentDefinition> & { id: AgentId }): AsyncResult<void>;
}

// ============================================================================
// Execution Service Interfaces
// ============================================================================

/** Simple Agent type for pool (implementation uses simpler version) */
export interface PoolAgent {
  id: AgentId;
  status: AgentStatus;
  createdAt: Date;
  lastActiveAt: Date;
  requestCount: number;
  tokenCount: number;
  errorCount: number;
}

/** Agent pool service */
export interface IAgentPoolService {
  // Core operations
  acquire(): AsyncResult<PoolAgent>;
  release(agentId: AgentId): AsyncResult<void>;
  execute(request: AgentRequest, cancellation?: CancellationToken): Promise<AgentResponse>;

  // Status queries
  getStatus(agentId: AgentId): AgentStatus | undefined;
  getAll(): PoolAgent[];
  getAvailableCount(): number;

  // Statistics
  getStats(): {
    totalAgents: number;
    idleAgents: number;
    busyAgents: number;
    queueLength: number;
    totalRequests: number;
    totalTokens: number;
    totalErrors: number;
  };

  // Configuration
  setRateLimit(requestsPerSecond: number): void;

  // Lifecycle
  shutdown(): Promise<void>;

  // Legacy methods for compatibility (optional)
  getAgent?(level: HierarchyLevel): AsyncResult<AgentDefinition>;
  getAgentById?(id: AgentId): AgentDefinition | null;
  spawn?(level: HierarchyLevel, role: AgentRole): AsyncResult<AgentDefinition>;
  terminate?(agentId: AgentId): AsyncResult<void>;
  getActiveAgents?(): AgentDefinition[];
  getAgentMetrics?(agentId: AgentId): AgentMetrics | null;
}

/** Task creation config for simple case */
export interface SimpleTaskConfig {
  type: string;
  description: string;
  priority?: TaskPriority;
  dependencies?: TaskDependency[];
}

/** Task result for completion */
export interface TaskCompletionResult {
  success: boolean;
  output?: string;
  error?: string;
  duration?: number;
}

/** Task statistics */
export interface TaskStats {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
}

/** Simple task result */
export interface TaskResult {
  success: boolean;
  output?: string;
  error?: string;
  duration?: number;
}

/** Task manager service */
export interface ITaskManagerService {
  // Core task operations
  create(missionId: MissionId, config: SimpleTaskConfig | { type: TaskType; description: string; priority?: TaskPriority; dependencies?: TaskDependency[]; metadata?: Record<string, unknown> }): AsyncResult<Task>;
  start(taskId: TaskId): AsyncResult<void>;
  complete(taskId: TaskId, result: TaskCompletionResult | TaskResult): AsyncResult<void>;
  cancel(taskId: TaskId, reason?: string): AsyncResult<void>;

  // Task retrieval
  get(taskId: TaskId): Task | undefined;
  getByMission(missionId: MissionId): Task[];
  getStatus(taskId: TaskId): TaskStatus | undefined;
  getResult(taskId: TaskId): TaskResult | undefined;
  getNext(): Task | undefined;

  // Task management
  getCancellationToken(taskId: TaskId): CancellationToken | undefined;
  retry(taskId: TaskId): AsyncResult<Task>;
  clearCompleted(missionId: MissionId): void;
  getStats(): TaskStats;
}

/** Mission configuration for creation */
export interface MissionConfig {
  title: string;
  description: string;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  scope?: {
    files?: string[];
    directories?: string[];
  };
  constraints?: Array<{
    type: string;
    value: string;
  }>;
  metadata?: Record<string, unknown>;
}

/** Mission statistics */
export interface MissionStats {
  total: number;
  pending: number;
  active: number;
  completed: number;
  failed: number;
  cancelled: number;
}

/** Mission manager service */
export interface IMissionManagerService {
  /** Create a mission from config */
  create(config: MissionConfig): AsyncResult<Mission>;
  createMission(intentId: IntentId, mode: MissionMode): AsyncResult<Mission>;
  getMission(id: MissionId): Mission | null;
  get(id: MissionId): Mission | null;
  getActiveMissions(): Mission[];
  getActive(): Mission[];
  getMissionsByStatus(status: MissionStatus): Mission[];
  start(missionId: MissionId): AsyncResult<void>;
  pause(missionId: MissionId): AsyncResult<void>;
  resume(missionId: MissionId): AsyncResult<void>;
  cancel(missionId: MissionId, reason?: string): AsyncResult<void>;
  getProgress(missionId: MissionId): MissionProgress;
  setResult(missionId: MissionId, result: MissionResult): AsyncResult<void>;
  getStats(): MissionStats;

  // Additional lifecycle methods
  complete(missionId: MissionId): AsyncResult<void>;
  fail(missionId: MissionId, reason: string): AsyncResult<void>;
  advancePhase(missionId: MissionId): AsyncResult<void>;
  rollback(missionId: MissionId): AsyncResult<void>;
  taskCompleted(missionId: MissionId, taskId: TaskId): AsyncResult<void>;
}

/** Execution plan */
export interface ExecutionPlan {
  missionId: MissionId;
  tasks: ExecutionTaskConfig[];
  changes?: import('./verification').FileChange[];
}

/** Execution task configuration */
export interface ExecutionTaskConfig {
  type: string;
  description: string;
  prompt?: string;
  priority?: TaskPriority;
  dependencies?: TaskDependency[];
  relevantFiles?: string[];
  tokenBudget?: number;
  maxTokens?: number;
}

/** Execution result */
export interface ExecutionResult {
  success: boolean;
  missionId: MissionId;
  duration: number;
  tasksCompleted: number;
  changes?: import('./verification').FileChange[];
  verification?: import('./verification').VerificationResult;
}

/** Execution coordinator service */
export interface IExecutionCoordinatorService {
  execute(plan: ExecutionPlan, token?: CancellationToken): AsyncResult<ExecutionResult>;
  executeTask(task: Task, token?: CancellationToken): AsyncResult<TaskOutput>;
  onProgress(handler: (progress: ExecutionProgress) => void): Disposable;
  getCurrentProgress(missionId: MissionId): ExecutionProgress | null;
  cancel(missionId: MissionId): AsyncResult<void>;
}
