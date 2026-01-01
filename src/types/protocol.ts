/**
 * Protocol Layer Types
 *
 * Types for development protocol:
 * - Intent Declaration
 * - Scope Boundary
 * - Pre-flight Checklist
 * - Rollback System
 * - Impact Analysis
 */

import {
  AsyncResult,
  Disposable,
  FilePath,
  GlobPattern,
  IntentId,
  MissionId,
  RelativePath,
  SnapshotId,
  SourceLocation,
  TaskId,
} from './common';
import { IStore } from './infrastructure';
import { FileChange } from './verification';

// ============================================================================
// User Intent Types (for parsing user messages)
// ============================================================================

/** User intent from message parsing */
export interface UserIntent {
  type: UserIntentType;
  targets: UserIntentTarget[];
  constraints: UserIntentConstraint[];
  confidence: number;
  rawMessage: string;
  keywords: string[];
}

/** User intent type */
export type UserIntentType = 'create' | 'modify' | 'delete' | 'analyze' | 'query';

/** User intent target */
export interface UserIntentTarget {
  type: 'file' | 'symbol' | 'concept';
  name: string;
  symbolKind?: string;
  confidence: number;
}

/** User intent constraint */
export interface UserIntentConstraint {
  type: 'scope' | 'style' | 'dependency';
  value: string;
  isNegative: boolean;
}

/** Context for intent parsing */
export interface IntentParseContext {
  currentFile?: FilePath;
}

// ============================================================================
// Intent Declaration Types
// ============================================================================

/** Intent action type */
export type IntentAction =
  | 'create'
  | 'modify'
  | 'delete'
  | 'refactor'
  | 'fix'
  | 'test'
  | 'document'
  | 'analyze';

/** Intent target */
export interface IntentTarget {
  readonly type: 'file' | 'symbol' | 'pattern';
  readonly value: string;
  readonly action: 'read' | 'write' | 'delete';
}

/** Intent status */
export type IntentStatus =
  | 'pending'
  | 'validated'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** Intent declaration */
export interface IntentDeclaration {
  readonly id: IntentId;
  readonly timestamp: Date;
  readonly userId: string;

  // What
  readonly action: IntentAction;
  readonly targets: IntentTarget[];
  readonly description: string;

  // Why
  readonly reason: string;
  readonly issueReference?: string;

  // Scope
  readonly scope: ScopeBoundary;

  // Verification
  readonly successCriteria: string[];
  readonly rollbackPlan?: string;

  // Status
  readonly status: IntentStatus;
  readonly statusHistory: IntentStatusChange[];
}

/** Intent status change */
export interface IntentStatusChange {
  readonly from: IntentStatus;
  readonly to: IntentStatus;
  readonly timestamp: Date;
  readonly reason?: string;
}

/** Intent input for creation */
export interface IntentInput {
  readonly action: IntentAction;
  readonly targets: string[];
  readonly description: string;
  readonly reason: string;
  readonly issueReference?: string;
  readonly scope?: Partial<ScopeBoundary>;
  readonly successCriteria?: string[];
  readonly rollbackPlan?: string;
}

/** Intent validation result */
export interface IntentValidation {
  readonly valid: boolean;
  readonly errors: string[];
  readonly warnings: string[];
  readonly suggestedScope?: ScopeBoundary;
}

// ============================================================================
// Scope Boundary Types
// ============================================================================

/** File action */
export type FileAction = 'read' | 'create' | 'modify' | 'delete';

/** Scope boundary definition */
export interface ScopeBoundary {
  // File boundaries
  readonly allowedFiles: GlobPattern[];
  readonly forbiddenFiles: GlobPattern[];

  // Action boundaries
  readonly allowedActions: FileAction[];

  // Size limits
  readonly maxFilesChanged: number;
  readonly maxLinesChanged: number;
  readonly maxFilesCreated: number;

  // Symbol boundaries
  readonly allowedSymbols?: string[];
  readonly forbiddenSymbols?: string[];
}

/** Scope violation type */
export type ScopeViolationType =
  | 'forbidden-file'
  | 'forbidden-action'
  | 'exceeded-limit'
  | 'outside-pattern'
  | 'forbidden-symbol';

/** Scope violation */
export interface ScopeViolation {
  readonly type: ScopeViolationType;
  readonly target: string;
  readonly action: string;
  readonly boundary: string;
  readonly message: string;
  readonly operation?: string;
  readonly requiresConfirmation?: boolean;
}

/** Scope check result */
export interface ScopeCheck {
  readonly allowed: boolean;
  readonly reason?: string;
  readonly violation?: ScopeViolation;
}

/** Scope enforcement result */
export interface ScopeEnforcement {
  readonly approved: FileChange[];
  readonly rejected: FileChange[];
  readonly violations: ScopeViolation[];
}

/** Default scope boundary */
export const DEFAULT_SCOPE_BOUNDARY: ScopeBoundary = {
  allowedFiles: ['**/*' as GlobPattern],
  forbiddenFiles: [
    '**/node_modules/**' as GlobPattern,
    '**/.git/**' as GlobPattern,
    '**/dist/**' as GlobPattern,
    '**/.env*' as GlobPattern,
  ],
  allowedActions: ['read', 'create', 'modify'],
  maxFilesChanged: 20,
  maxLinesChanged: 1000,
  maxFilesCreated: 10,
};

// ============================================================================
// Pre-flight Checklist Types
// ============================================================================

/** Checklist status */
export type ChecklistStatus =
  | 'pending'
  | 'running'
  | 'passed'
  | 'failed'
  | 'skipped';

/** Checklist category */
export type ChecklistCategory =
  | 'validation'
  | 'scope'
  | 'syntax'
  | 'dependencies'
  | 'tests'
  | 'documentation'
  | 'custom';

/** Checklist item */
export interface ChecklistItem {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: ChecklistCategory;
  readonly required: boolean;
  readonly order: number;
}

/** Checklist item result */
export interface ChecklistItemResult {
  readonly itemId: string;
  readonly passed: boolean;
  readonly message: string;
  readonly duration: number;
  readonly details?: unknown;
}

/** Checklist summary */
export interface ChecklistSummary {
  readonly totalItems: number;
  readonly passedItems: number;
  readonly failedItems: number;
  readonly skippedItems: number;
  readonly requiredFailed: number;
  readonly canProceed: boolean;
}

/** Pre-flight checklist */
export interface PreflightChecklist {
  readonly id: string;
  readonly intentId: IntentId;
  readonly items: ChecklistItem[];
  readonly status: ChecklistStatus;
  readonly startedAt?: Date;
  readonly completedAt?: Date;
  readonly results: ChecklistItemResult[];
  readonly summary: ChecklistSummary;
}

/** Default checklist items */
export const DEFAULT_CHECKLIST_ITEMS: ChecklistItem[] = [
  {
    id: 'files-exist',
    name: 'Target files exist',
    description: 'Verify all target files exist in the project',
    category: 'validation',
    required: true,
    order: 1,
  },
  {
    id: 'scope-valid',
    name: 'Changes within scope',
    description: 'Verify all changes are within declared scope',
    category: 'scope',
    required: true,
    order: 2,
  },
  {
    id: 'syntax-valid',
    name: 'Valid syntax',
    description: 'Verify generated code has valid syntax',
    category: 'syntax',
    required: true,
    order: 3,
  },
  {
    id: 'imports-resolve',
    name: 'Imports resolve',
    description: 'Verify all imports can be resolved',
    category: 'dependencies',
    required: true,
    order: 4,
  },
  {
    id: 'no-forbidden',
    name: 'No forbidden files',
    description: 'Verify no forbidden files are touched',
    category: 'scope',
    required: true,
    order: 5,
  },
  {
    id: 'tests-exist',
    name: 'Tests exist',
    description: 'Verify tests exist for changed code',
    category: 'tests',
    required: false,
    order: 6,
  },
  {
    id: 'docs-updated',
    name: 'Documentation updated',
    description: 'Verify documentation is updated',
    category: 'documentation',
    required: false,
    order: 7,
  },
];

// ============================================================================
// Rollback System Types
// ============================================================================

/** Saved file */
export interface SavedFile {
  readonly path: RelativePath;
  readonly content: string;
  readonly hash: string;
  readonly size: number;
  readonly existed: boolean;
}

/** Snapshot metadata */
export interface SnapshotMetadata {
  readonly description: string;
  readonly agentId?: string;
  readonly taskId?: TaskId;
  readonly filesCount: number;
  readonly totalSize: number;
}

/** Snapshot status */
export type SnapshotStatus =
  | 'active'
  | 'restored'
  | 'expired'
  | 'deleted';

/** Rollback snapshot */
export interface RollbackSnapshot {
  readonly id: SnapshotId;
  readonly timestamp: Date;
  readonly intentId: IntentId;
  readonly files: SavedFile[];
  readonly metadata: SnapshotMetadata;
  readonly status: SnapshotStatus;
}

/** Rollback result */
export interface RollbackResult {
  readonly snapshotId: SnapshotId;
  readonly success: boolean;
  readonly filesRestored: number;
  readonly filesCreated: number;
  readonly filesDeleted: number;
  readonly errors: string[];
}

// ============================================================================
// Impact Analysis Types
// ============================================================================

/** Broken import */
export interface BrokenImport {
  readonly file: RelativePath;
  readonly import: string;
  readonly reason: string;
}

/** Type impact */
export interface TypeImpact {
  readonly file: RelativePath;
  readonly location: SourceLocation;
  readonly message: string;
}

/** Direct impact */
export interface DirectImpact {
  readonly filesCreated: RelativePath[];
  readonly filesModified: RelativePath[];
  readonly filesDeleted: RelativePath[];
  readonly symbolsAdded: string[];
  readonly symbolsModified: string[];
  readonly symbolsRemoved: string[];
  readonly linesAdded: number;
  readonly linesRemoved: number;
}

/** Indirect impact */
export interface IndirectImpact {
  readonly dependentFiles: RelativePath[];
  readonly affectedTests: RelativePath[];
  readonly brokenImports: BrokenImport[];
  readonly typeErrors: TypeImpact[];
}

/** Risk level */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/** Risk factor */
export interface RiskFactor {
  readonly name: string;
  readonly weight: number;
  readonly score: number;
  readonly description: string;
}

/** Risk assessment */
export interface RiskAssessment {
  readonly level: RiskLevel;
  readonly score: number;
  readonly factors: RiskFactor[];
}

/** Recommendation type */
export type RecommendationType =
  | 'test'
  | 'review'
  | 'backup'
  | 'split'
  | 'documentation';

/** Recommendation */
export interface Recommendation {
  readonly type: RecommendationType;
  readonly priority: 'high' | 'medium' | 'low';
  readonly message: string;
  readonly action?: string;
}

/** Impact analysis */
export interface ImpactAnalysis {
  readonly intentId: IntentId;
  readonly analyzedAt: Date;
  readonly direct: DirectImpact;
  readonly indirect: IndirectImpact;
  readonly risk: RiskAssessment;
  readonly recommendations: Recommendation[];
}

// ============================================================================
// Protocol Store Interface
// ============================================================================

/** Intent filter */
export interface IntentFilter {
  readonly status?: IntentStatus[];
  readonly action?: IntentAction[];
  readonly since?: Date;
  readonly limit?: number;
}

/** Protocol store interface */
export interface IProtocolStore extends IStore {
  // Intents
  saveIntent(intent: IntentDeclaration): AsyncResult<void>;
  getIntent(id: IntentId): AsyncResult<IntentDeclaration | null>;
  listIntents(filter?: IntentFilter): AsyncResult<IntentDeclaration[]>;
  updateIntentStatus(id: IntentId, status: IntentStatus, reason?: string): AsyncResult<void>;

  // Rollback Snapshots
  saveRollbackSnapshot(snapshot: RollbackSnapshot): AsyncResult<void>;
  getRollbackSnapshot(id: SnapshotId): AsyncResult<RollbackSnapshot | null>;
  listRollbackSnapshots(intentId?: IntentId): AsyncResult<RollbackSnapshot[]>;
  deleteRollbackSnapshot(id: SnapshotId): AsyncResult<void>;
  pruneOldSnapshots(maxAge: number): AsyncResult<number>;

  // Checklists
  saveChecklist(checklist: PreflightChecklist): AsyncResult<void>;
  getChecklist(id: string): AsyncResult<PreflightChecklist | null>;
}

// ============================================================================
// Protocol Service Interfaces
// ============================================================================

/** Intent service */
export interface IIntentService {
  /** Parse a user message into intent */
  parse(message: string, context?: IntentParseContext): UserIntent;
  declare(input: IntentInput): AsyncResult<IntentDeclaration>;
  validate(intent: IntentDeclaration): AsyncResult<IntentValidation>;
  getIntent(id: IntentId): IntentDeclaration | null;
  updateStatus(id: IntentId, status: IntentStatus, reason?: string): AsyncResult<void>;
  cancel(id: IntentId, reason?: string): AsyncResult<void>;
  onIntentChange(callback: (intent: IntentDeclaration) => void): Disposable;
}

/** Scope check request */
export interface ScopeCheckRequest {
  type?: string;
  path: string;
  missionId?: MissionId;
  content?: string;
}

/** Scope violation result */
export interface ScopeViolationResult {
  reason: string;
  severity: 'error' | 'warning' | 'info';
  requiresConfirmation?: boolean;
}

/** Extended file operation type */
export type ExtendedFileOperationType = 'read' | 'write' | 'create' | 'delete';

/** Extended file operation for ScopeGuard */
export interface ExtendedFileOperation {
  type: ExtendedFileOperationType;
  path: FilePath;
  missionId?: MissionId;
  content?: string;
}

/** Extended scope policy */
export interface ExtendedScopePolicy {
  allowedPaths: string[];
  excludedPaths: string[];
  allowedOperations: ExtendedFileOperationType[];
  maxFileSize: number;
  maxFilesPerOperation: number;
  requireConfirmation: ExtendedFileOperationType[];
}

/** Extended scope violation */
export interface ExtendedScopeViolation {
  operation: ExtendedFileOperation;
  reason: string;
  severity: 'error' | 'warning';
  policy: string;
  requiresConfirmation?: boolean;
}

/** Scope guard service - interface for scope enforcement */
export interface IScopeGuardService {
  // Core method - check a single operation
  check(operation: ExtendedFileOperation): ExtendedScopeViolation | null;

  // Policy management
  setPolicy(missionId: MissionId, policy: Partial<ExtendedScopePolicy>): void;
  getPolicy(missionId?: MissionId): ExtendedScopePolicy;

  // Convenience methods
  isAllowed(path: string, operation: ExtendedFileOperationType): boolean;
  clearPolicy?(missionId: MissionId): void;
  checkBatch?(operations: ExtendedFileOperation[]): ExtendedScopeViolation[];

  // Original interface methods (optional for backward compatibility)
  setScope?(scope: ScopeBoundary): void;
  getScope?(): ScopeBoundary;
  checkFileAccess?(file: RelativePath, action: FileAction): ScopeCheck;
  checkSymbolAccess?(symbol: string, action: FileAction): ScopeCheck;
  enforceScope?(changes: FileChange[]): ScopeEnforcement;
}

/** Preflight request for simple checking */
export interface PreflightRequest {
  changes: FileChange[];
  missionId?: MissionId;
}

/** Preflight check result */
export interface PreflightCheck {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  severity: 'error' | 'warning' | 'info';
  file?: string;
  requiresConfirmation?: boolean;
}

/** Preflight result */
export interface PreflightResult {
  canProceed: boolean;
  errors: string[];
  warnings: string[];
  checks?: ChecklistItemResult[] | PreflightCheck[];
  riskLevel?: import('./protocol').RiskLevel;
  requiresConfirmation?: boolean;
  duration?: number;
}

/** Preflight service */
export interface IPreflightService {
  // Simple check method for ExecutionCoordinator
  check(request: PreflightRequest): AsyncResult<PreflightResult>;
  assessRisk(changes: FileChange[]): RiskLevel;
  getRequiredConfirmations(changes: FileChange[]): string[];
}

/** Rollback history item */
export interface RollbackHistoryItem {
  id: SnapshotId;
  missionId: MissionId;
  createdAt: Date;
  filesBackedUp: string[];
}

/** Extended RollbackPoint for implementations */
export interface ExtendedRollbackPoint {
  id: string;
  missionId: MissionId;
  taskId?: TaskId;
  timestamp: Date;
  files: FilePath[];
  description: string;
}

/** Rollback service */
export interface IRollbackService {
  // Simple backup method
  backup(paths: FilePath[], missionId: MissionId, taskId?: TaskId): AsyncResult<ExtendedRollbackPoint>;

  // Rollback to a point
  rollback(pointId: string): AsyncResult<string[]>;

  // Restore single file
  restore(path: FilePath, missionId: MissionId): AsyncResult<void>;

  // History for MissionManager
  getHistory(missionId: MissionId): ExtendedRollbackPoint[];

  // Clear mission backups
  clearMission?(missionId: MissionId): void;

  // Check if file has backup
  hasBackup?(path: FilePath, missionId: MissionId): boolean;

  // Optional snapshot methods for advanced usage
  createSnapshot?(intent: IntentDeclaration, files: RelativePath[]): AsyncResult<RollbackSnapshot>;
  getSnapshot?(id: SnapshotId): RollbackSnapshot | null;
  listSnapshots?(intentId?: IntentId): RollbackSnapshot[];
  pruneOldSnapshots?(maxAge: number): AsyncResult<number>;
}

/** Extended ImpactAnalysis for implementations */
export interface ExtendedImpactAnalysis {
  directlyAffected: Array<{ path: string; reason: string; impactLevel: 'critical' | 'high' | 'medium' | 'low' | 'minimal' }>;
  indirectlyAffected: Array<{ path: string; reason: string; impactLevel: 'critical' | 'high' | 'medium' | 'low' | 'minimal' }>;
  scope: 'file' | 'module' | 'feature' | 'system';
  riskScore: number;
  symbolChanges: Record<string, string[]>;
  summary: string;
  duration: number;
}

/** Impact analyzer service */
export interface IImpactAnalyzerService {
  analyze(changes: FileChange[]): AsyncResult<ExtendedImpactAnalysis>;
  getAffectedFiles(changes: FileChange[]): string[];
  estimateScope(changes: FileChange[]): 'file' | 'module' | 'feature' | 'system';
}
