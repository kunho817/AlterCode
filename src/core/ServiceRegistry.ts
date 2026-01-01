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
} from '../infrastructure';

// Knowledge
import {
  createProjectSnapshotService,
  createSemanticIndexService,
  createConventionExtractorService,
  createErrorMemoryService,
  createKnowledgeStore,
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
} from '../protocol';

// Execution
import {
  createTaskManager,
  createAgentPool,
  createMissionManager,
  createExecutionCoordinator,
} from '../execution';

// Integration
import { createClaudeAdapter, createOpenAIAdapter } from '../integration';

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

  // ===== Integration Layer =====

  // LLM Adapter
  container.registerFactory(SERVICE_TOKENS.LLMAdapter, () => {
    if (config.llm?.provider === 'openai') {
      return createOpenAIAdapter(
        config.llm.apiKey ?? '',
        { model: config.llm.model },
        container.resolve(SERVICE_TOKENS.Logger)
      );
    }
    // Default to Claude
    return createClaudeAdapter(
      config.llm?.apiKey ?? '',
      { model: config.llm?.model },
      container.resolve(SERVICE_TOKENS.Logger)
    );
  });

  // ===== Execution Layer =====

  // Task Manager
  container.registerFactory(SERVICE_TOKENS.TaskManager, () =>
    createTaskManager(
      container.resolve(SERVICE_TOKENS.EventBus),
      container.resolve(SERVICE_TOKENS.Logger)
    )
  );

  // Agent Pool
  container.registerFactory(SERVICE_TOKENS.AgentPool, () =>
    createAgentPool(
      container.resolve(SERVICE_TOKENS.LLMAdapter),
      container.resolve(SERVICE_TOKENS.TokenBudget),
      container.resolve(SERVICE_TOKENS.EventBus),
      container.resolve(SERVICE_TOKENS.Logger)
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

  // Execution Coordinator
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
      container.resolve(SERVICE_TOKENS.Logger)
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
