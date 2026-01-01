/**
 * Service Container Implementation
 *
 * Provides dependency injection with support for singleton,
 * transient, and scoped lifetimes.
 */

import {
  IServiceContainer,
  IServiceScope,
  ServiceToken,
  ServiceFactory,
  ServiceLifetime,
  ILogger,
} from '../types';

/** Service registration entry */
interface ServiceRegistration<T> {
  readonly token: ServiceToken<T>;
  readonly factory: ServiceFactory<T>;
  readonly lifetime: ServiceLifetime;
  instance?: T;
}

/**
 * Service Container implementation
 */
export class ServiceContainer implements IServiceContainer {
  private readonly registrations: Map<symbol, ServiceRegistration<unknown>> = new Map();
  private readonly singletons: Map<symbol, unknown> = new Map();
  private readonly logger?: ILogger;
  private readonly parent?: ServiceContainer;
  private readonly scopedInstances: Map<symbol, unknown> = new Map();
  private readonly isScope: boolean;

  constructor(logger?: ILogger, parent?: ServiceContainer, isScope = false) {
    this.logger = logger?.child('ServiceContainer');
    this.parent = parent;
    this.isScope = isScope;

    // Register the container itself
    if (!parent) {
      this.registerInstance(ServiceTokens.ServiceContainer, this);
    }
  }

  register<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void {
    this.registerWithLifetime(token, factory, 'transient');
  }

  registerFactory<T>(token: ServiceToken<T>, factory: () => T): void {
    this.registerWithLifetime(token, () => factory(), 'singleton');
  }

  registerSingleton<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void {
    this.registerWithLifetime(token, factory, 'singleton');
  }

  registerScoped<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void {
    this.registerWithLifetime(token, factory, 'scoped');
  }

  registerInstance<T>(token: ServiceToken<T>, instance: T): void {
    const registration: ServiceRegistration<T> = {
      token,
      factory: () => instance,
      lifetime: 'singleton',
      instance,
    };

    this.registrations.set(token, registration as ServiceRegistration<unknown>);
    this.singletons.set(token, instance);
    this.logger?.debug(`Registered instance: ${token.description ?? String(token)}`);
  }

  resolve<T>(token: ServiceToken<T>): T {
    const result = this.tryResolve(token);
    if (result === null) {
      const tokenName = token.description ?? String(token);
      throw new Error(`Service not registered: ${tokenName}`);
    }
    return result;
  }

  tryResolve<T>(token: ServiceToken<T>): T | null {
    // Check scoped instances first (for scoped containers)
    if (this.isScope && this.scopedInstances.has(token)) {
      return this.scopedInstances.get(token) as T;
    }

    // Check singletons
    if (this.singletons.has(token)) {
      return this.singletons.get(token) as T;
    }

    // Check registrations
    const registration = this.getRegistration<T>(token);
    if (!registration) {
      return null;
    }

    // Resolve based on lifetime
    switch (registration.lifetime) {
      case 'singleton':
        return this.resolveSingleton(token, registration);

      case 'transient':
        return this.createInstance(registration);

      case 'scoped':
        return this.resolveScoped(token, registration);

      default:
        throw new Error(`Unknown lifetime: ${registration.lifetime}`);
    }
  }

  isRegistered<T>(token: ServiceToken<T>): boolean {
    return this.registrations.has(token) || (this.parent?.isRegistered(token) ?? false);
  }

  createScope(): IServiceScope {
    const scope = new ServiceScope(this.logger, this);
    this.logger?.debug('Created new service scope');
    return scope;
  }

  /**
   * Get all registered tokens
   */
  getRegisteredTokens(): ServiceToken<unknown>[] {
    const tokens = new Set<ServiceToken<unknown>>();

    for (const key of this.registrations.keys()) {
      tokens.add(key as ServiceToken<unknown>);
    }

    if (this.parent) {
      for (const token of this.parent.getRegisteredTokens()) {
        tokens.add(token);
      }
    }

    return Array.from(tokens);
  }

  private registerWithLifetime<T>(
    token: ServiceToken<T>,
    factory: ServiceFactory<T>,
    lifetime: ServiceLifetime
  ): void {
    const registration: ServiceRegistration<T> = {
      token,
      factory,
      lifetime,
    };

    this.registrations.set(token, registration as ServiceRegistration<unknown>);
    this.logger?.debug(
      `Registered service: ${token.description ?? String(token)} (${lifetime})`
    );
  }

  private getRegistration<T>(token: ServiceToken<T>): ServiceRegistration<T> | null {
    const registration = this.registrations.get(token);
    if (registration) {
      return registration as ServiceRegistration<T>;
    }

    // Check parent container
    if (this.parent) {
      return this.parent.getRegistration(token);
    }

    return null;
  }

  private resolveSingleton<T>(
    token: ServiceToken<T>,
    registration: ServiceRegistration<T>
  ): T {
    // Check if already created
    if (this.singletons.has(token)) {
      return this.singletons.get(token) as T;
    }

    // For child containers, check parent first
    if (this.parent && this.parent.singletons.has(token)) {
      return this.parent.singletons.get(token) as T;
    }

    // Create new instance
    const instance = this.createInstance(registration);

    // Store in root container for singletons
    const rootContainer = this.getRootContainer();
    rootContainer.singletons.set(token, instance);

    return instance;
  }

  private resolveScoped<T>(
    token: ServiceToken<T>,
    registration: ServiceRegistration<T>
  ): T {
    if (!this.isScope) {
      // Not in a scope, treat as transient
      return this.createInstance(registration);
    }

    // Check if already created in this scope
    if (this.scopedInstances.has(token)) {
      return this.scopedInstances.get(token) as T;
    }

    // Create new instance for this scope
    const instance = this.createInstance(registration);
    this.scopedInstances.set(token, instance);

    return instance;
  }

  private createInstance<T>(registration: ServiceRegistration<T>): T {
    try {
      return registration.factory(this);
    } catch (error) {
      const tokenName = registration.token.description ?? String(registration.token);
      throw new Error(
        `Failed to create service ${tokenName}: ${(error as Error).message}`
      );
    }
  }

  private getRootContainer(): ServiceContainer {
    if (this.parent) {
      return this.parent.getRootContainer();
    }
    return this;
  }
}

/**
 * Scoped service container
 */
class ServiceScope extends ServiceContainer implements IServiceScope {
  private disposed = false;
  private readonly disposables: Array<{ dispose: () => void }> = [];

  constructor(logger?: ILogger, parent?: ServiceContainer) {
    super(logger, parent, true);
  }

  /**
   * Track a disposable to be disposed when the scope is disposed
   */
  trackDisposable(disposable: { dispose: () => void }): void {
    if (this.disposed) {
      throw new Error('Cannot track disposable on disposed scope');
    }
    this.disposables.push(disposable);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    // Dispose tracked disposables in reverse order
    for (let i = this.disposables.length - 1; i >= 0; i--) {
      try {
        const disposable = this.disposables[i];
        if (disposable) disposable.dispose();
      } catch {
        // Ignore disposal errors
      }
    }

    this.disposables.length = 0;
  }
}

/**
 * Create a service token
 */
export function createServiceToken<T>(description: string): ServiceToken<T> {
  return Symbol(description) as ServiceToken<T>;
}

/**
 * Standard service tokens
 */
export const ServiceTokens = {
  // Infrastructure
  ServiceContainer: createServiceToken<IServiceContainer>('IServiceContainer'),
  Logger: createServiceToken<ILogger>('ILogger'),
  EventBus: createServiceToken<import('../types').IEventBus>('IEventBus'),
  Database: createServiceToken<import('../types').IDatabase>('IDatabase'),
  Cache: createServiceToken<import('../types').ICache>('ICache'),
  FileSystem: createServiceToken<import('../types').IFileSystem>('IFileSystem'),
  ConfigManager: createServiceToken<import('../types').IConfigManager>('IConfigManager'),
  StorageManager: createServiceToken<import('../types').IStorageManager>('IStorageManager'),

  // Knowledge Layer
  KnowledgeStore: createServiceToken<import('../types').IKnowledgeStore>('IKnowledgeStore'),
  ProjectSnapshotService: createServiceToken<import('../types').IProjectSnapshotService>(
    'IProjectSnapshotService'
  ),
  SemanticIndexService: createServiceToken<import('../types').ISemanticIndexService>(
    'ISemanticIndexService'
  ),
  ConventionExtractorService: createServiceToken<import('../types').IConventionExtractorService>(
    'IConventionExtractorService'
  ),
  ErrorMemoryService: createServiceToken<import('../types').IErrorMemoryService>(
    'IErrorMemoryService'
  ),

  // Context Layer
  TokenBudgetService: createServiceToken<import('../types').ITokenBudgetService>(
    'ITokenBudgetService'
  ),
  ContextSelectorService: createServiceToken<import('../types').IContextSelectorService>(
    'IContextSelectorService'
  ),
  ProgressiveDisclosureService: createServiceToken<import('../types').IProgressiveDisclosureService>(
    'IProgressiveDisclosureService'
  ),
  ConversationCompressorService: createServiceToken<import('../types').IConversationCompressorService>(
    'IConversationCompressorService'
  ),

  // Verification Layer
  VerificationPipelineService: createServiceToken<import('../types').IVerificationPipelineService>(
    'IVerificationPipelineService'
  ),
  FileValidatorService: createServiceToken<import('../types').IFileValidatorService>(
    'IFileValidatorService'
  ),
  SymbolResolverService: createServiceToken<import('../types').ISymbolResolverService>(
    'ISymbolResolverService'
  ),
  APICheckerService: createServiceToken<import('../types').IAPICheckerService>(
    'IAPICheckerService'
  ),
  DependencyVerifierService: createServiceToken<import('../types').IDependencyVerifierService>(
    'IDependencyVerifierService'
  ),

  // Protocol Layer
  ProtocolStore: createServiceToken<import('../types').IProtocolStore>('IProtocolStore'),
  IntentService: createServiceToken<import('../types').IIntentService>('IIntentService'),
  ScopeGuardService: createServiceToken<import('../types').IScopeGuardService>(
    'IScopeGuardService'
  ),
  PreflightService: createServiceToken<import('../types').IPreflightService>(
    'IPreflightService'
  ),
  RollbackService: createServiceToken<import('../types').IRollbackService>(
    'IRollbackService'
  ),
  ImpactAnalyzerService: createServiceToken<import('../types').IImpactAnalyzerService>(
    'IImpactAnalyzerService'
  ),

  // Execution Layer
  ExecutionStore: createServiceToken<import('../types').IExecutionStore>('IExecutionStore'),
  AgentPoolService: createServiceToken<import('../types').IAgentPoolService>(
    'IAgentPoolService'
  ),
  TaskManagerService: createServiceToken<import('../types').ITaskManagerService>(
    'ITaskManagerService'
  ),
  MissionManagerService: createServiceToken<import('../types').IMissionManagerService>(
    'IMissionManagerService'
  ),
  ExecutionCoordinatorService: createServiceToken<import('../types').IExecutionCoordinatorService>(
    'IExecutionCoordinatorService'
  ),

  // Integration Layer
  AIProvider: createServiceToken<import('../types').IAIProvider>('IAIProvider'),
} as const;

/**
 * Create a new service container
 */
export function createServiceContainer(logger?: ILogger): IServiceContainer {
  return new ServiceContainer(logger);
}
