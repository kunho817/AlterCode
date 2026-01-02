/**
 * Service Registry
 *
 * Bootstraps and registers all services with the DI container:
 * - Service factory functions
 * - Dependency resolution
 * - Lifecycle management
 */

import {
  IServiceContainer,
  AlterCodeConfig,
  FilePath,
  toFilePath,
} from '../types';

import { SERVICE_TOKENS, AlterCodeCore } from './AlterCodeCore';

// Infrastructure
import {
  ServiceContainer,
  createLogger,
  createEventBus,
  createFileSystem,
  createDefaultCache,
  createInMemoryDatabase,
  createConfigManager,
  createQuotaTrackerService,
  createPerformanceMonitor,
} from '../infrastructure';

// Knowledge
import {
  createProjectSnapshotService,
  createSemanticIndexService,
  createConventionExtractorService,
  createErrorMemoryService,
  createKnowledgeStore,
  createSemanticAnalyzerService,
} from '../knowledge';

import { ServiceTokens } from '../infrastructure';

// Context
import {
  createTokenBudgetService,
  createContextSelectorService,
  createProgressiveDisclosureService,
  createConversationCompressorService,
} from '../context';

// Verification
import {
  createFileValidatorService,
  createSymbolResolverService,
  createAPICheckerService,
  createDependencyVerifierService,
  createVerificationPipelineService,
} from '../verification';

// Protocol
import {
  createIntentParserService,
  createScopeGuardService,
  createPreflightCheckerService,
  createRollbackService,
  createImpactAnalyzerService,
  createVirtualBranchService,
  createMergeEngineService,
  createApprovalService,
} from '../protocol';

// Execution
import {
  createTaskManager,
  createAgentPool,
  createMissionManager,
  createExecutionCoordinator,
  createAgentActivityService,
} from '../execution';

// Integration
import {
  createClaudeAdapter,
  createOpenAIAdapter,
  createGLMAdapter,
  createHierarchyModelRouter,
} from '../integration';

/**
 * Register all services in the container
 */
export function registerServices(
  container: IServiceContainer,
  config: AlterCodeConfig
): void {
  const projectRoot = toFilePath(config.projectRoot);

  // ===== Infrastructure Layer =====

  // Logger
  container.registerFactory(SERVICE_TOKENS.Logger, () =>
    createLogger('AlterCode')
  );

  // Event Bus
  container.registerFactory(SERVICE_TOKENS.EventBus, () =>
    createEventBus()
  );

  // File System
  container.registerFactory(SERVICE_TOKENS.FileSystem, () =>
    createFileSystem()
  );

  // Cache
  container.registerFactory(SERVICE_TOKENS.Cache, () =>
    createDefaultCache()
  );

  // Database
  container.registerFactory(SERVICE_TOKENS.Database, () =>
    createInMemoryDatabase()
  );

  // Config Manager
  container.registerFactory(SERVICE_TOKENS.ConfigManager, () =>
    createConfigManager(projectRoot)
  );

  // Quota Tracker
  container.registerFactory(SERVICE_TOKENS.QuotaTracker, () =>
    createQuotaTrackerService(
      container.resolve(SERVICE_TOKENS.EventBus),
      undefined,
      container.resolve(SERVICE_TOKENS.Logger)
    )
  );

  // Performance Monitor
  container.registerFactory(SERVICE_TOKENS.PerformanceMonitor, () =>
    createPerformanceMonitor(
      undefined,
      container.resolve(SERVICE_TOKENS.Logger)
    )
  );

  // ===== Knowledge Layer =====

  // Knowledge Store
  container.registerFactory(ServiceTokens.KnowledgeStore, () =>
    createKnowledgeStore(
      container.resolve(SERVICE_TOKENS.Database),
      container.resolve(SERVICE_TOKENS.Logger)
    )
  );

  // Project Snapshot
  container.registerFactory(SERVICE_TOKENS.ProjectSnapshot, () =>
    createProjectSnapshotService(
      container.resolve(SERVICE_TOKENS.FileSystem),
      container.resolve(ServiceTokens.KnowledgeStore),
      projectRoot,
      container.resolve(SERVICE_TOKENS.Logger)
    )
  );

  // Semantic Index
  container.registerFactory(SERVICE_TOKENS.SemanticIndex, () =>
    createSemanticIndexService(
      container.resolve(SERVICE_TOKENS.FileSystem),
      container.resolve(ServiceTokens.KnowledgeStore),
      projectRoot,
      container.resolve(SERVICE_TOKENS.Logger)
    )
  );

  // Convention Extractor
  container.registerFactory(SERVICE_TOKENS.ConventionExtractor, () =>
    createConventionExtractorService(
      container.resolve(SERVICE_TOKENS.FileSystem),
      container.resolve(ServiceTokens.KnowledgeStore),
      projectRoot,
      container.resolve(SERVICE_TOKENS.Logger)
    )
  );

  // Error Memory
  container.registerFactory(SERVICE_TOKENS.ErrorMemory, () =>
    createErrorMemoryService(
      container.resolve(ServiceTokens.KnowledgeStore),
      container.resolve(SERVICE_TOKENS.Logger)
    )
  );

  // Semantic Analyzer (code region analysis)
  container.registerFactory(SERVICE_TOKENS.SemanticAnalyzer, () =>
    createSemanticAnalyzerService(
      container.resolve(SERVICE_TOKENS.Logger)
    )
  );

  // ===== Context Layer =====

  // Token Budget
  container.registerFactory(SERVICE_TOKENS.TokenBudget, () =>
    createTokenBudgetService(
      container.resolve(SERVICE_TOKENS.Logger)
    )
  );

  // Context Selector
  container.registerFactory(SERVICE_TOKENS.ContextSelector, () =>
    createContextSelectorService(
      container.resolve(SERVICE_TOKENS.SemanticIndex),
      container.resolve(SERVICE_TOKENS.FileSystem),
      container.resolve(SERVICE_TOKENS.TokenBudget),
      projectRoot,
      container.resolve(SERVICE_TOKENS.Logger)
    )
  );

  // Progressive Disclosure
  container.registerFactory(SERVICE_TOKENS.ProgressiveDisclosure, () =>
    createProgressiveDisclosureService(
      container.resolve(SERVICE_TOKENS.FileSystem),
      container.resolve(SERVICE_TOKENS.TokenBudget),
      container.resolve(SERVICE_TOKENS.SemanticIndex),
      projectRoot,
      container.resolve(SERVICE_TOKENS.Logger)
    )
  );

  // Conversation Compressor
  container.registerFactory(SERVICE_TOKENS.ConversationCompressor, () =>
    createConversationCompressorService(
      container.resolve(SERVICE_TOKENS.TokenBudget),
      container.resolve(SERVICE_TOKENS.Logger)
    )
  );

  // ===== Verification Layer =====

  // File Validator
  container.registerFactory(SERVICE_TOKENS.FileValidator, () =>
    createFileValidatorService(
      container.resolve(SERVICE_TOKENS.FileSystem),
      projectRoot,
      container.resolve(SERVICE_TOKENS.Logger)
    )
  );

  // Symbol Resolver
  container.registerFactory(SERVICE_TOKENS.SymbolResolver, () =>
    createSymbolResolverService(
      container.resolve(SERVICE_TOKENS.SemanticIndex),
      container.resolve(SERVICE_TOKENS.Logger)
    )
  );

  // API Checker
  container.registerFactory(SERVICE_TOKENS.APIChecker, () =>
    createAPICheckerService(
      container.resolve(SERVICE_TOKENS.SemanticIndex),
      container.resolve(SERVICE_TOKENS.Logger)
    )
  );

  // Dependency Verifier
  container.registerFactory(SERVICE_TOKENS.DependencyVerifier, () =>
    createDependencyVerifierService(
      container.resolve(SERVICE_TOKENS.FileSystem),
      container.resolve(SERVICE_TOKENS.SemanticIndex),
      projectRoot,
      container.resolve(SERVICE_TOKENS.Logger)
    )
  );

  // Verification Pipeline
  container.registerFactory(SERVICE_TOKENS.VerificationPipeline, () =>
    createVerificationPipelineService(
      container.resolve(SERVICE_TOKENS.FileValidator),
      container.resolve(SERVICE_TOKENS.SymbolResolver),
      container.resolve(SERVICE_TOKENS.APIChecker),
      container.resolve(SERVICE_TOKENS.DependencyVerifier),
      container.resolve(SERVICE_TOKENS.Logger)
    )
  );

  // ===== Protocol Layer =====

  // Intent Parser
  container.registerFactory(SERVICE_TOKENS.IntentParser, () =>
    createIntentParserService(
      container.resolve(SERVICE_TOKENS.Logger)
    )
  );

  // Scope Guard
  container.registerFactory(SERVICE_TOKENS.ScopeGuard, () =>
    createScopeGuardService(
      container.resolve(SERVICE_TOKENS.FileSystem),
      projectRoot,
      container.resolve(SERVICE_TOKENS.Logger)
    )
  );

  // Rollback
  container.registerFactory(SERVICE_TOKENS.Rollback, () =>
    createRollbackService(
      container.resolve(SERVICE_TOKENS.FileSystem),
      projectRoot,
      container.resolve(SERVICE_TOKENS.Logger)
    )
  );

  // Preflight Checker
  container.registerFactory(SERVICE_TOKENS.PreflightChecker, () =>
    createPreflightCheckerService(
      container.resolve(SERVICE_TOKENS.FileSystem),
      container.resolve(SERVICE_TOKENS.ScopeGuard),
      container.resolve(SERVICE_TOKENS.VerificationPipeline),
      container.resolve(SERVICE_TOKENS.Logger)
    )
  );

  // Impact Analyzer
  container.registerFactory(SERVICE_TOKENS.ImpactAnalyzer, () =>
    createImpactAnalyzerService(
      container.resolve(SERVICE_TOKENS.SemanticIndex),
      container.resolve(SERVICE_TOKENS.FileSystem),
      projectRoot,
      container.resolve(SERVICE_TOKENS.Logger)
    )
  );

  // Virtual Branch (change isolation)
  container.registerFactory(SERVICE_TOKENS.VirtualBranch, () =>
    createVirtualBranchService(
      container.resolve(SERVICE_TOKENS.FileSystem),
      container.resolve(SERVICE_TOKENS.EventBus),
      container.resolve(SERVICE_TOKENS.Logger)
    )
  );

  // Approval Service
  container.registerFactory(SERVICE_TOKENS.ApprovalService, () =>
    createApprovalService(
      container.resolve(SERVICE_TOKENS.EventBus),
      undefined,
      container.resolve(SERVICE_TOKENS.Logger)
    )
  );

  // ===== Integration Layer =====

  // Hierarchy Model Router
  // Routes requests based on hierarchy level:
  // - Sovereign/Lord/Overlord → Claude Opus (via API or CLI)
  // - Worker → GLM-4
  container.registerFactory(SERVICE_TOKENS.HierarchyModelRouter, () => {
    const claudeMode = config.llm?.claudeMode ?? 'api';
    const claudeApiKey = config.llm?.apiKey ?? '';
    const glmApiKey = config.glm?.apiKey ?? '';
    // Read enableFallback from config, default to true
    const enableFallback = (config as any).enableFallback ?? true;

    return createHierarchyModelRouter(
      {
        claudeMode,
        claudeApiKey: claudeMode === 'api' ? claudeApiKey : undefined,
        claudeCliPath: config.claude?.cliPath,
        glmApiKey,
        enableFallback,
        workingDirectory: typeof config.projectRoot === 'string'
          ? config.projectRoot
          : undefined,
      },
      container.resolve(SERVICE_TOKENS.Logger)
    );
  });

  // LLM Adapter - uses HierarchyModelRouter for hierarchy-based routing
  container.registerFactory(SERVICE_TOKENS.LLMAdapter, () => {
    const claudeApiKey = config.llm?.apiKey ?? '';
    const glmApiKey = config.glm?.apiKey ?? '';
    const claudeMode = config.llm?.claudeMode ?? 'api';

    // Use hierarchy router if:
    // - Claude CLI mode (always has Claude via CLI)
    // - OR both Claude API key and GLM key available
    if (claudeMode === 'cli' || (claudeApiKey && glmApiKey)) {
      return container.resolve(SERVICE_TOKENS.HierarchyModelRouter);
    }

    // Single provider mode
    if (config.llm?.provider === 'openai') {
      return createOpenAIAdapter(
        config.llm.apiKey ?? '',
        { model: config.llm.model },
        container.resolve(SERVICE_TOKENS.Logger)
      );
    }

    if (config.llm?.provider === 'glm') {
      return createGLMAdapter(
        config.llm.apiKey ?? glmApiKey,
        { model: config.glm?.model ?? 'glm-4.7' },
        container.resolve(SERVICE_TOKENS.Logger)
      );
    }

    // GLM-only mode (no Claude key but has GLM key)
    if (glmApiKey && !claudeApiKey) {
      return createGLMAdapter(
        glmApiKey,
        { model: config.glm?.model ?? 'glm-4.7' },
        container.resolve(SERVICE_TOKENS.Logger)
      );
    }

    // Default to Claude API
    return createClaudeAdapter(
      claudeApiKey,
      { model: 'claude-opus-4-20250514' }, // Always Opus
      container.resolve(SERVICE_TOKENS.Logger)
    );
  });

  // Merge Engine (conflict resolution with AI-assisted fallback)
  container.registerFactory(SERVICE_TOKENS.MergeEngine, () =>
    createMergeEngineService(
      container.resolve(SERVICE_TOKENS.VirtualBranch),
      container.resolve(SERVICE_TOKENS.SemanticAnalyzer),
      container.resolve(SERVICE_TOKENS.LLMAdapter),
      container.resolve(SERVICE_TOKENS.EventBus),
      undefined,
      container.resolve(SERVICE_TOKENS.Logger)
    )
  );

  // ===== Execution Layer =====

  // Task Manager
  container.registerFactory(SERVICE_TOKENS.TaskManager, () =>
    createTaskManager(
      container.resolve(SERVICE_TOKENS.EventBus),
      container.resolve(SERVICE_TOKENS.Logger)
    )
  );

  // Agent Activity (execution tracking)
  container.registerFactory(SERVICE_TOKENS.AgentActivity, () =>
    createAgentActivityService(
      container.resolve(SERVICE_TOKENS.EventBus),
      undefined,
      container.resolve(SERVICE_TOKENS.Logger)
    )
  );

  // Agent Pool (with integrated services)
  container.registerFactory(SERVICE_TOKENS.AgentPool, () =>
    createAgentPool(
      container.resolve(SERVICE_TOKENS.LLMAdapter),
      container.resolve(SERVICE_TOKENS.TokenBudget),
      container.resolve(SERVICE_TOKENS.EventBus),
      container.resolve(SERVICE_TOKENS.Logger),
      {
        quotaTracker: container.resolve(SERVICE_TOKENS.QuotaTracker),
        activityService: container.resolve(SERVICE_TOKENS.AgentActivity),
        branchService: container.resolve(SERVICE_TOKENS.VirtualBranch),
      }
    )
  );

  // Mission Manager
  container.registerFactory(SERVICE_TOKENS.MissionManager, () =>
    createMissionManager(
      container.resolve(SERVICE_TOKENS.TaskManager),
      container.resolve(SERVICE_TOKENS.Rollback),
      container.resolve(SERVICE_TOKENS.EventBus),
      container.resolve(SERVICE_TOKENS.Logger)
    )
  );

  // Execution Coordinator (with full integration)
  container.registerFactory(SERVICE_TOKENS.ExecutionCoordinator, () =>
    createExecutionCoordinator(
      container.resolve(SERVICE_TOKENS.MissionManager),
      container.resolve(SERVICE_TOKENS.TaskManager),
      container.resolve(SERVICE_TOKENS.AgentPool),
      container.resolve(SERVICE_TOKENS.PreflightChecker),
      container.resolve(SERVICE_TOKENS.VerificationPipeline),
      container.resolve(SERVICE_TOKENS.Rollback),
      container.resolve(SERVICE_TOKENS.ImpactAnalyzer),
      container.resolve(SERVICE_TOKENS.ContextSelector),
      container.resolve(SERVICE_TOKENS.EventBus),
      container.resolve(SERVICE_TOKENS.Logger),
      {
        approvalService: container.resolve(SERVICE_TOKENS.ApprovalService),
        branchService: container.resolve(SERVICE_TOKENS.VirtualBranch),
        mergeEngine: container.resolve(SERVICE_TOKENS.MergeEngine),
      }
    )
  );
}

/**
 * Bootstrap AlterCode with default configuration
 */
export function bootstrap(config: AlterCodeConfig): AlterCodeCore {
  // Create container
  const container = new ServiceContainer();

  // Register all services
  registerServices(container, config);

  // Create and return core instance
  return new AlterCodeCore(container, config);
}

/**
 * Quick start helper
 */
export async function quickStart(
  projectRoot: string,
  apiKey: string,
  provider: 'claude' | 'openai' = 'claude'
): Promise<AlterCodeCore> {
  const config: AlterCodeConfig = {
    projectRoot,
    llm: {
      provider,
      apiKey,
    },
    maxContextTokens: 128000,
    logLevel: 'info',
  };

  const core = bootstrap(config);
  await core.initialize();

  return core;
}
