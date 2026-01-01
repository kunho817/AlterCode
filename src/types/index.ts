/**
 * AlterCode v2 - Type Definitions
 *
 * Re-exports all type definitions from the types module.
 */

// ============================================================================
// Common Types
// ============================================================================

export {
  // Branded types
  type MissionId,
  type TaskId,
  type AgentId,
  type IntentId,
  type SnapshotId,
  type FilePath,
  type RelativePath,
  type GlobPattern,
  type TokenCount,
  type LineNumber,
  type ColumnNumber,
  type QuotaWindowId,
  type ActivityEntryId,
  type VirtualBranchId,
  type ConflictId,
  type ApprovalId,
  type PerfEntryId,

  // ID factories
  createMissionId,
  createTaskId,
  createAgentId,
  createIntentId,
  createSnapshotId,
  createQuotaWindowId,
  createActivityEntryId,
  createVirtualBranchId,
  createConflictId,
  createApprovalId,
  createPerfEntryId,
  toMissionId,
  toTaskId,
  toAgentId,
  toIntentId,
  toSnapshotId,
  toQuotaWindowId,
  toActivityEntryId,
  toVirtualBranchId,
  toConflictId,
  toApprovalId,
  toPerfEntryId,
  toFilePath,
  toRelativePath,
  toGlobPattern,
  toTokenCount,
  toLineNumber,
  toColumnNumber,
  filePathToRelative,
  relativePathToFile,

  // Result types
  type Result,
  type AsyncResult,
  Ok,
  Err,
  isOk,
  isErr,
  mapResult,
  mapError,
  flatMapResult,
  combineResults,
  unwrap,
  unwrapOr,
  unwrapOrElse,
  tryCatch,
  tryCatchSync,

  // Error types
  type ErrorCategory,
  type ErrorInfo,
  AppError,
  ValidationError,
  VerificationError,
  FileNotFoundError,
  SymbolNotFoundError,
  ExecutionError,
  TaskFailedError,
  AgentError,
  InfrastructureError,
  DatabaseError,
  CacheError,
  IntegrationError,
  AIProviderError,
  RateLimitError,
  CancellationError,
  TimeoutError,

  // Source location
  type SourceLocation,
  createSourceLocation,

  // Disposable
  type Disposable,
  createDisposable,
  combineDisposables,

  // Cancellation
  type CancellationToken,
  type CancellationTokenSource,
  CancellationToken_None,
  createCancellationTokenSource,

  // Utility types
  type DeepReadonly,
  type PartialBy,
  type RequiredBy,
  type KeysOfType,
  type NonEmptyArray,
  type MaybePromise,
} from './common';

// ============================================================================
// Infrastructure Types
// ============================================================================

export {
  // Logger
  type LogLevel,
  type LogEntry,
  type ILogger,
  type LoggerConfig,

  // Event Bus
  type BaseEvent,
  type EventHandler,
  type SubscriptionOptions,
  type EventSubscription,
  type IEventBus,

  // Database
  type IDatabase,
  type DatabaseConfig,

  // Cache
  type CacheOptions,
  type CacheStats,
  type ICache,
  type CacheConfig,

  // File System
  type FileStats,
  type IFileSystem,
  type FileWatchEvent,

  // Configuration
  type ClaudeConfig,
  type GLMConfig,
  type ClaudeAccessMode,
  type SimpleLLMConfig,
  type VerificationConfig,
  type ProtocolConfig,
  type StorageConfig,
  type UIConfig,
  type AlterCodeConfig,
  type IConfigManager,
  DEFAULT_CONFIG,

  // Service Container
  type ServiceToken,
  type ServiceFactory,
  type ServiceLifetime,
  type IServiceContainer,
  type IServiceScope,

  // Storage Manager
  type StorageQuery,
  type StorageStores,
  type IStorageManager,
  type IStore,
  // IKnowledgeStore exported from knowledge.ts
  // IProtocolStore exported from protocol.ts
  // IExecutionStore exported from execution.ts

  // Performance Monitoring
  type PerfStats,
  type PerformanceMonitorConfig,
  DEFAULT_PERFORMANCE_MONITOR_CONFIG,
  type IPerformanceMonitor,
} from './infrastructure';

// ============================================================================
// Knowledge Types
// ============================================================================

export {
  // Project Snapshot
  type FileTreeNode,
  type PackageManifest,
  type InstalledPackage,
  type TypeScriptConfig,
  type ESLintConfig,
  type PrettierConfig,
  type JestConfig,
  type ProjectConfigs,
  type CommitInfo,
  type GitState,
  type ProjectSnapshot,
  type SnapshotDiff,

  // Semantic Index
  type SymbolKind,
  type BaseSymbol,
  type ParameterInfo,
  type FunctionSymbol,
  type ClassMember,
  type ClassSymbol,
  type InterfaceMember,
  type InterfaceSymbol,
  type TypeSymbol,
  type VariableSymbol,
  type EnumMember,
  type EnumSymbol,
  type AnySymbol,
  type SymbolTable,
  type ImportInfo,
  type ImportSpecifier,
  type ExportInfo,
  type DependencyGraph,
  type CallGraph,
  type InheritanceGraph,
  type SemanticIndex,
  type SearchOptions,
  type TextMatch,
  type SearchResult,

  // Conventions
  type NamingPattern,
  type NamingConventions,
  type StyleConventions,
  type StructureConventions,
  type PatternConventions,
  type DetectedConventions,
  type ConventionConfidence,
  type ProjectConventions,
  type ConventionViolation,
  type ComplianceResult,

  // Error Memory
  type ErrorPatternCategory,
  type ErrorPattern,
  type ErrorOccurrence,
  type ErrorStatistics,
  type ErrorMemory,
  type ErrorContext,

  // Services
  type IProjectSnapshotService,
  type ISemanticIndexService,
  type IConventionExtractorService,
  type IErrorMemoryService,
  type IKnowledgeStore,
} from './knowledge';

// ============================================================================
// Context Types
// ============================================================================

export {
  // Token Budget
  type TokenBudget,
  type BudgetCheck,
  type TokenUsage,

  // Context Selection
  type TaskContextInfo,
  type ExpansionRules,
  type SelectionLimits,
  type SelectionPriorities,
  type SelectionStrategy,
  type ContextRequest,
  type DisclosureLevel,
  type SelectedFile,
  type SelectedSymbol,
  type SelectionStats,
  type ContextItem,
  type ContextSelection,
  type SelectionExplanation,
  type SimpleContextRequest,

  // Progressive Disclosure
  type DisclosureLevelContent,
  type FileDisclosure,
  type SymbolDisclosure,

  // Conversation
  type MessageRole,
  type Message,
  type Decision,
  type EstablishedFact,
  type CompletedAction,
  type PendingItem,
  type ConversationSummary,
  type ConversationState,

  // Defaults
  DEFAULT_EXPANSION_RULES,
  DEFAULT_SELECTION_LIMITS,
  DEFAULT_SELECTION_PRIORITIES,
  DEFAULT_SELECTION_STRATEGY,

  // Budget category
  type BudgetCategory,

  // Services
  type IContextSelectorService,
  type ITokenBudgetService,
  type IProgressiveDisclosureService,
  type IConversationCompressorService,
} from './context';

// ============================================================================
// Verification Types
// ============================================================================

export {
  // Verification Phase
  type VerificationPhase,
  type VerificationStrictness,
  type VerificationLevel,
  type VerificationStats,

  // File Validation
  type FileSuggestion,
  type FileValidationResult,
  type FileValidationRequest,

  // Symbol Resolution
  type SymbolReference,
  type SymbolSuggestion,
  type SymbolResolutionResult,
  type SymbolResolutionRequest,

  // API Validation
  type CallArgument,
  type FunctionCall,
  type ArgumentError,
  type APIValidationResult,
  type APIValidationRequest,

  // Dependency Validation
  type ImportSpecifierInfo,
  type ImportStatement,
  type DependencyValidationResult,
  type DependencyValidationRequest,

  // Code Validation
  type SyntaxError,
  type TypeError,
  type CodeValidationResult,

  // Verification Content
  type IntentVerificationContent,
  type CodeVerificationContent,
  type ChangesVerificationContent,
  type FileChangeAction,
  type FileChange,
  type VerificationContent,

  // Verification Result
  type CheckResult,
  type VerificationSeverity,
  type VerificationIssue,
  type VerificationErrorInfo,
  type VerificationWarningInfo,
  type VerificationSuggestionInfo,
  type VerificationResult,

  // Verification Request
  type VerificationOptions,
  type VerificationRequest,
  DEFAULT_VERIFICATION_OPTIONS,

  // Services
  type IVerificationPipelineService,
  type IFileValidatorService,
  type ISymbolResolverService,
  type IAPICheckerService,
  type IDependencyVerifierService,
} from './verification';

// ============================================================================
// Protocol Types
// ============================================================================

export {
  // User Intent (parsed from messages)
  type UserIntent,
  type UserIntentType,
  type UserIntentTarget,
  type UserIntentConstraint,
  type IntentParseContext,

  // Intent Declaration
  type IntentAction,
  type IntentTarget,
  type IntentStatus,
  type IntentDeclaration,
  type IntentStatusChange,
  type IntentInput,
  type IntentValidation,

  // Scope
  type FileAction,
  type ScopeBoundary,
  type ScopeViolationType,
  type ScopeViolation,
  type ScopeCheck,
  type ScopeEnforcement,
  DEFAULT_SCOPE_BOUNDARY,

  // Checklist
  type ChecklistStatus,
  type ChecklistCategory,
  type ChecklistItem,
  type ChecklistItemResult,
  type ChecklistSummary,
  type PreflightChecklist,
  type PreflightCheck,
  type PreflightRequest,
  type PreflightResult,
  DEFAULT_CHECKLIST_ITEMS,

  // Rollback
  type SavedFile,
  type SnapshotMetadata,
  type SnapshotStatus,
  type RollbackSnapshot,
  type RollbackResult,
  type RollbackHistoryItem,
  type ExtendedRollbackPoint,

  // Impact Analysis
  type BrokenImport,
  type TypeImpact,
  type DirectImpact,
  type IndirectImpact,
  type RiskLevel,
  type RiskFactor,
  type RiskAssessment,
  type RecommendationType,
  type Recommendation,
  type ImpactAnalysis,
  type ExtendedImpactAnalysis,

  // Store
  type IntentFilter,

  // Extended Types for Implementations
  type ExtendedFileOperationType,
  type ExtendedFileOperation,
  type ExtendedScopePolicy,
  type ExtendedScopeViolation,

  // Services
  type IIntentService,
  type IScopeGuardService,
  type IPreflightService,
  type IRollbackService,
  type IImpactAnalyzerService,
  type IProtocolStore,
} from './protocol';

// ============================================================================
// Execution Types
// ============================================================================

export {
  // Hierarchy
  type HierarchyLevel,
  type AgentRole,
  type AIModel,
  type AgentStatus,

  // Agent
  type RetryConfig,
  type AgentConstraints,
  type AgentConfig,
  type AgentMetrics,
  type AgentDefinition,
  type PoolAgent,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_AGENT_CONSTRAINTS,

  // Task
  type TaskType,
  type TaskStatus,
  type TaskPriority,
  type TaskContext,
  type TaskInput,
  type ArtifactType,
  type Artifact,
  type OutputMetrics,
  type TaskOutput,
  type DependencyType,
  type DependencyStatus,
  type TaskDependency,
  type TaskMetrics,
  type Task,
  type TaskConfig,
  type SimpleTaskConfig,
  type TaskCompletionResult,
  type TaskStats,

  // Mission
  type MissionMode,
  type MissionStatus,
  type MissionPhase,
  type MissionProgress,
  type MissionMetrics,
  type MissionResult,
  type Mission,
  type MissionFilter,
  type AgentFilter,
  type MissionConfig,
  type MissionStats,

  // Execution Plan
  type ExecutionPlan,
  type ExecutionTaskConfig,
  type ExecutionResult,

  // Execution
  type AgentRequest,
  type AgentResponse,
  type ExecutionProgress,

  // Services
  type IAgentPoolService,
  type ITaskManagerService,
  type IMissionManagerService,
  type IExecutionCoordinatorService,
  type IExecutionStore,
} from './execution';

// ============================================================================
// Integration Types
// ============================================================================

export {
  // Provider Capabilities
  type ProviderCapabilities,

  // Messages
  type ProviderMessageRole,
  type TextContent,
  type ImageContent,
  type ToolUseContent,
  type ToolResultContent,
  type ContentBlock,
  type ProviderMessage,

  // Tools
  type ToolParameter,
  type ToolDefinition,

  // Request/Response
  type CompletionRequest,
  type FinishReason,
  type ProviderTokenUsage,
  type CompletionResponse,
  type StreamEventType,
  type StreamEvent,

  // Provider Interface
  type IAIProvider,

  // Claude
  type ClaudeCliStatus,
  type ClaudeCliResponse,
  type ClaudeAdapterConfig,

  // GLM
  type GLMApiResponse,
  type GLMChoice,
  type GLMAdapterConfig,

  // Provider Factory
  type ProviderType,
  type ProviderConfig,
  MODEL_PROVIDER_MAP,
  getProviderForModel,

  // Defaults
  DEFAULT_CLAUDE_CONFIG,
  DEFAULT_GLM_CONFIG,
  MODEL_CONTEXT_WINDOWS,
  MODEL_MAX_OUTPUT,
} from './integration';

// ============================================================================
// Extended Types (Aliases and Additional)
// ============================================================================

export {
  // Service aliases
  type IIntentParserService,
  type IPreflightCheckerService,
  type IAgentPool,
  type ITaskManager,
  type IMissionManager,
  type IExecutionCoordinator,

  // LLM types
  type LLMConfig,
  type LLMRequest,
  type LLMResponse,
  type LLMUsage,
  type LLMStreamChunk,
  type ToolCall,
  type ILLMAdapter,
  type ToolDefinition as LLMToolDefinition,

  // Agent types
  type Agent,
  type ExtendedAgentRequest,
  type ExtendedAgentResponse,

  // Intent types (only aliases - UserIntent is in protocol.ts)
  type IntentType,
  type IntentConstraint,

  // State types
  type HiveState,

  // Scope types
  type ScopePolicy,
  type FileOperationType,
  type FileOperation,
  type IssueSeverity,
  type VerificationIssue as ExtendedVerificationIssue,

  // Rollback types
  type FileBackup,
  type RollbackPoint,

  // Impact types
  type AffectedFile,
  type ImpactScope,

  // Task types
  type TaskResult,
} from './extended';

// ============================================================================
// Quota Types
// ============================================================================

export {
  type AIProvider,
  type LevelUsage,
  type UsageMetrics,
  createEmptyUsageMetrics,
  type UsageLimits,
  DEFAULT_USAGE_LIMITS,
  QUOTA_WINDOW_DURATION_MS,
  type QuotaWindow,
  type QuotaStatusLevel,
  type QuotaStatus,
  type QuotaConfig,
  DEFAULT_QUOTA_CONFIG,
  type TokenUsageRecord,
  type QuotaWarningEvent,
  type QuotaExceededEvent,
  type QuotaResetEvent,
  type QuotaEvent,
  type IQuotaTrackerService,
} from './quota';

// ============================================================================
// Activity Types
// ============================================================================

export {
  type ActivityStatus,
  type ActivityMetrics,
  type AgentActivityEntry,
  type ActivityConfig,
  DEFAULT_ACTIVITY_CONFIG,
  type ActivityStartedEvent,
  type ActivityCompletedEvent,
  type ActivityFailedEvent,
  type ActivityEvent,
  type ActivityStats,
  type IAgentActivityService,
} from './activity';

// ============================================================================
// Conflict Types
// ============================================================================

export {
  type ChangeType,
  type BranchStatus,
  type MergeStrategy,
  type FileChange as BranchFileChange,
  createFileChange,
  type FileSnapshot,
  type VirtualBranch,
  type BranchStats,
  type RegionType,
  type CodeRegion,
  type ConflictMarker,
  type MergeConflict,
  type MergeInput,
  type MergeResult,
  type MergeResolution,
  type ConflictDetectedEvent,
  type ConflictResolvedEvent,
  type BranchCreatedEvent,
  type BranchMergedEvent,
  type BranchAbandonedEvent,
  type ConflictEvent,
  type IVirtualBranchService,
  type IMergeEngineService,
  type ISemanticAnalyzerService,
} from './conflict';

// ============================================================================
// Approval Types
// ============================================================================

export {
  type ApprovalMode,
  type ApprovalStatus,
  type ApprovalAction,
  type ApprovalResponse,
  type PendingApproval,
  type ApprovalResult,
  type ApprovalConfig,
  DEFAULT_APPROVAL_CONFIG,
  HIERARCHY_BOUNDARY_LEVELS,
  type ApprovalRequestedEvent,
  type ApprovalRespondedEvent,
  type ApprovalTimeoutEvent,
  type ApprovalEvent,
  type LevelOverride,
  type IApprovalService,
} from './approval';
