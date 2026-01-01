/**
 * Extended Types
 *
 * Additional types needed by the implementation that extend
 * or provide aliases for the core types.
 */

import {
  MissionId,
  TaskId,
  AgentId,
  FilePath,
  RelativePath,
  TokenCount,
  AsyncResult,
  CancellationToken,
  SourceLocation,
} from './common';
import {
  UserIntent,
  UserIntentTarget,
  UserIntentConstraint,
} from './protocol';
import { IServiceContainer, AlterCodeConfig } from './infrastructure';
import { ContextSelection, DisclosureLevel } from './context';
import { FileChange, VerificationResult, VerificationLevel } from './verification';
import { ToolDefinition as IntegrationToolDefinition } from './integration';
import {
  Task,
  TaskStatus,
  TaskPriority,
  TaskDependency,
  AgentStatus,
  AgentDefinition,
  Mission,
  MissionStatus,
  MissionProgress,
  MissionMode,
  AgentRequest as BaseAgentRequest,
  AgentResponse as BaseAgentResponse,
  IAgentPoolService,
  ITaskManagerService,
  IMissionManagerService,
  IExecutionCoordinatorService,
  HierarchyLevel,
} from './execution';
import { IIntentService, IScopeGuardService, IPreflightService, ScopeViolation as BaseScopeViolation, RiskLevel } from './protocol';

// ============================================================================
// Service Token Helper
// ============================================================================

/** Simplified service token type */
export type ServiceTokenType<T> = string & { __type?: T };

/**
 * Service token factory
 */
export const ServiceToken = {
  create: <T>(name: string): ServiceTokenType<T> => name as unknown as ServiceTokenType<T>,
};

// ============================================================================
// Alias Types for Service Interfaces
// ============================================================================

/** Intent Parser Service interface (simpler than full IIntentService) */
export interface IIntentParserService {
  parse(userMessage: string, context?: { currentFile?: FilePath }): UserIntent;
  extractTargets?(message: string, context?: { currentFile?: FilePath }): UserIntentTarget[];
  extractConstraints?(message: string): UserIntentConstraint[];
  getConfidence?(intent: UserIntent): number;
}

/** Alias for IPreflightService */
export type IPreflightCheckerService = IPreflightService;

/** Alias for IAgentPoolService */
export type IAgentPool = IAgentPoolService;

/** Alias for ITaskManagerService */
export type ITaskManager = ITaskManagerService;

/** Alias for IMissionManagerService */
export type IMissionManager = IMissionManagerService;

/** Alias for IExecutionCoordinatorService */
export type IExecutionCoordinator = IExecutionCoordinatorService;

// ============================================================================
// LLM Adapter Types
// ============================================================================

/** LLM configuration */
export interface LLMConfig {
  model: string;
  maxTokens: number;
  temperature: number;
  topP?: number;
  stopSequences?: string[];
}

/** LLM request */
export interface LLMRequest {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stopSequences?: string[];
  history?: Array<{ role: string; content: string }>;
}

/** LLM response */
export interface LLMResponse {
  content: string;
  model: string;
  finishReason: string;
  usage?: LLMUsage;
  duration: number;
}

/** LLM token usage */
export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** LLM stream chunk */
export interface LLMStreamChunk {
  content: string;
  done: boolean;
  usage?: LLMUsage;
}

/** Tool call from LLM */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** LLM Adapter interface */
export interface ILLMAdapter {
  complete(request: LLMRequest): AsyncResult<LLMResponse>;
  stream(request: LLMRequest): AsyncGenerator<LLMStreamChunk>;
  completeWithTools(
    request: LLMRequest,
    tools: IntegrationToolDefinition[]
  ): AsyncResult<{ response: LLMResponse; toolCalls: ToolCall[] }>;
  getConfig(): LLMConfig;
  setConfig(config: Partial<LLMConfig>): void;
}

/** Tool definition for LLM */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

// ============================================================================
// Extended Agent Types
// ============================================================================

/** Simplified Agent type for AgentPool */
export interface Agent {
  id: AgentId;
  status: AgentStatus;
  createdAt: Date;
  lastActiveAt: Date;
  requestCount: number;
  tokenCount: number;
  errorCount: number;
}

/** Extended AgentRequest for simpler usage */
export interface ExtendedAgentRequest {
  id?: string;
  type?: string;
  prompt: string;
  context?: Array<{ type: string; path?: string; content: string }>;
  systemContext?: string;
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
}

/** Extended AgentResponse */
export interface ExtendedAgentResponse {
  content: string;
  agentId: AgentId;
  requestId?: string;
  duration: number;
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Execution Plan Types - Re-exported from execution.ts
// ============================================================================

// These types are now defined in execution.ts
export type { ExecutionPlan, ExecutionTaskConfig, ExecutionResult, MissionConfig } from './execution';

/** Mission phase */
export type MissionPhase =
  | 'planning'
  | 'validation'
  | 'execution'
  | 'verification'
  | 'completion';

// ============================================================================
// Intent Types - Re-exported from protocol
// ============================================================================

// These types are now defined in protocol.ts and re-exported here for compatibility
export {
  UserIntent,
  UserIntentType as IntentType,
  UserIntentTarget as IntentTarget,
  UserIntentConstraint as IntentConstraint,
} from './protocol';

// ============================================================================
// Hive State
// ============================================================================

/** Application state */
export interface HiveState {
  initialized: boolean;
  projectRoot: string;
  currentMission: Mission | null;
  activeMissions: Mission[];
  stats: {
    missions: {
      total: number;
      pending: number;
      active: number;
      completed: number;
      failed: number;
      cancelled: number;
    };
  };
}

// ============================================================================
// Scope & Verification Types
// ============================================================================

/** Scope policy */
export interface ScopePolicy {
  allowedPaths: string[];
  excludedPaths: string[];
  allowedOperations: FileOperationType[];
  maxFileSize: number;
  maxFilesPerOperation: number;
  requireConfirmation: FileOperationType[];
}

/** File operation type */
export type FileOperationType = 'read' | 'write' | 'create' | 'delete';

/** File operation */
export interface FileOperation {
  type: FileOperationType;
  path: FilePath;
  missionId?: MissionId;
  content?: string;
}

/** Extended scope violation */
export interface ScopeViolation {
  operation: FileOperation;
  reason: string;
  severity: 'error' | 'warning';
  policy: string;
  requiresConfirmation?: boolean;
}

/** Issue severity */
export type IssueSeverity = 'error' | 'warning' | 'info';

/** Verification issue */
export interface VerificationIssue {
  type: 'file' | 'symbol' | 'api' | 'dependency';
  severity: IssueSeverity;
  message: string;
  location: { file: string; line?: number; column?: number };
  suggestion?: string;
  fix?: {
    type: 'replace' | 'command';
    original?: string;
    replacement?: string;
    command?: string;
  };
}

// ============================================================================
// Preflight Types
// ============================================================================

/** Preflight request */
export interface PreflightRequest {
  changes: FileChange[];
  missionId?: MissionId;
}

/** Preflight result */
export interface PreflightResult {
  canProceed: boolean;
  checks: PreflightCheck[];
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
  warnings: string[];
  errors: string[];
  duration: number;
}

/** Preflight check */
export interface PreflightCheck {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  severity: IssueSeverity;
  file?: string;
  requiresConfirmation?: boolean;
}

// ============================================================================
// Rollback Types
// ============================================================================

/** File backup */
export interface FileBackup {
  path: string;
  content?: string;
  existed: boolean;
  timestamp: Date;
  missionId: MissionId;
  taskId?: TaskId;
  size?: number;
}

/** Rollback point */
export interface RollbackPoint {
  id: string;
  missionId: MissionId;
  taskId?: TaskId;
  timestamp: Date;
  files: FilePath[];
  description: string;
}

// ============================================================================
// Impact Analysis Types
// ============================================================================

/** Impact analysis result */
export interface ImpactAnalysis {
  directlyAffected: AffectedFile[];
  indirectlyAffected: AffectedFile[];
  scope: ImpactScope;
  riskScore: number;
  symbolChanges: Record<string, string[]>;
  summary: string;
  duration: number;
}

/** Affected file */
export interface AffectedFile {
  path: string;
  reason: string;
  impactLevel: 'critical' | 'high' | 'medium' | 'low' | 'minimal';
}

/** Impact scope */
export type ImpactScope = 'file' | 'module' | 'feature' | 'system';

// ============================================================================
// Task Result
// ============================================================================

/** Task result */
export interface TaskResult {
  success: boolean;
  output?: string;
  error?: string;
  duration?: number;
}

// ============================================================================
// Extended Config Types
// ============================================================================

/** Extended AlterCode config */
export interface ExtendedAlterCodeConfig extends AlterCodeConfig {
  llm?: {
    provider: 'claude' | 'openai';
    apiKey: string;
    model?: string;
  };
  maxContextTokens?: number;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}
