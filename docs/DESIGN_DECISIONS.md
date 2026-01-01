# AlterCode v2 - Design Decisions

## 1. Dependency Injection

### Decision: Constructor Injection with Service Container

Use a lightweight service container with constructor injection for testability and explicit dependencies.

```typescript
// ============================================================================
// Service Container Interface
// ============================================================================

interface IServiceContainer {
  // Registration
  register<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void;
  registerSingleton<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void;
  registerInstance<T>(token: ServiceToken<T>, instance: T): void;

  // Resolution
  resolve<T>(token: ServiceToken<T>): T;
  tryResolve<T>(token: ServiceToken<T>): T | null;

  // Scoping
  createScope(): IServiceScope;
}

interface IServiceScope extends IServiceContainer {
  dispose(): void;
}

type ServiceToken<T> = symbol & { __type?: T };
type ServiceFactory<T> = (container: IServiceContainer) => T;

// ============================================================================
// Service Token Definitions
// ============================================================================

const ServiceTokens = {
  // Infrastructure
  Database: Symbol('Database') as ServiceToken<IDatabase>,
  Cache: Symbol('Cache') as ServiceToken<ICache>,
  EventBus: Symbol('EventBus') as ServiceToken<IEventBus>,
  Logger: Symbol('Logger') as ServiceToken<ILogger>,
  Config: Symbol('Config') as ServiceToken<IConfigManager>,
  FileSystem: Symbol('FileSystem') as ServiceToken<IFileSystem>,

  // Knowledge Layer
  ProjectSnapshot: Symbol('ProjectSnapshot') as ServiceToken<IProjectSnapshotService>,
  SemanticIndex: Symbol('SemanticIndex') as ServiceToken<ISemanticIndexService>,
  ConventionExtractor: Symbol('ConventionExtractor') as ServiceToken<IConventionExtractorService>,
  ErrorMemory: Symbol('ErrorMemory') as ServiceToken<IErrorMemoryService>,

  // Context Layer
  ContextSelector: Symbol('ContextSelector') as ServiceToken<IContextSelectorService>,
  TokenBudget: Symbol('TokenBudget') as ServiceToken<ITokenBudgetService>,
  ProgressiveDisclosure: Symbol('ProgressiveDisclosure') as ServiceToken<IProgressiveDisclosureService>,
  ConversationCompressor: Symbol('ConversationCompressor') as ServiceToken<IConversationCompressorService>,

  // Verification Layer
  VerificationPipeline: Symbol('VerificationPipeline') as ServiceToken<IVerificationPipelineService>,
  FileValidator: Symbol('FileValidator') as ServiceToken<IFileValidatorService>,
  SymbolResolver: Symbol('SymbolResolver') as ServiceToken<ISymbolResolverService>,
  APIChecker: Symbol('APIChecker') as ServiceToken<IAPICheckerService>,
  DependencyVerifier: Symbol('DependencyVerifier') as ServiceToken<IDependencyVerifierService>,

  // Protocol Layer
  Intent: Symbol('Intent') as ServiceToken<IIntentService>,
  ScopeGuard: Symbol('ScopeGuard') as ServiceToken<IScopeGuardService>,
  Preflight: Symbol('Preflight') as ServiceToken<IPreflightService>,
  Rollback: Symbol('Rollback') as ServiceToken<IRollbackService>,
  ImpactAnalyzer: Symbol('ImpactAnalyzer') as ServiceToken<IImpactAnalyzerService>,

  // Execution Layer
  AgentPool: Symbol('AgentPool') as ServiceToken<IAgentPoolService>,
  TaskManager: Symbol('TaskManager') as ServiceToken<ITaskManagerService>,
  MissionManager: Symbol('MissionManager') as ServiceToken<IMissionManagerService>,
  ExecutionCoordinator: Symbol('ExecutionCoordinator') as ServiceToken<IExecutionCoordinatorService>,

  // Integration Layer
  ClaudeAdapter: Symbol('ClaudeAdapter') as ServiceToken<IAIProvider>,
  GLMAdapter: Symbol('GLMAdapter') as ServiceToken<IAIProvider>,
} as const;

// ============================================================================
// Implementation
// ============================================================================

class ServiceContainer implements IServiceContainer {
  private factories = new Map<symbol, ServiceFactory<unknown>>();
  private singletons = new Map<symbol, unknown>();
  private instances = new Map<symbol, unknown>();

  register<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void {
    this.factories.set(token, factory);
  }

  registerSingleton<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void {
    this.factories.set(token, (container) => {
      if (!this.singletons.has(token)) {
        this.singletons.set(token, factory(container));
      }
      return this.singletons.get(token) as T;
    });
  }

  registerInstance<T>(token: ServiceToken<T>, instance: T): void {
    this.instances.set(token, instance);
  }

  resolve<T>(token: ServiceToken<T>): T {
    // Check instances first
    if (this.instances.has(token)) {
      return this.instances.get(token) as T;
    }

    // Check factories
    const factory = this.factories.get(token);
    if (!factory) {
      throw new Error(`Service not registered: ${token.toString()}`);
    }

    return factory(this) as T;
  }

  tryResolve<T>(token: ServiceToken<T>): T | null {
    try {
      return this.resolve(token);
    } catch {
      return null;
    }
  }

  createScope(): IServiceScope {
    return new ServiceScope(this);
  }
}

class ServiceScope implements IServiceScope {
  private scopedInstances = new Map<symbol, unknown>();

  constructor(private parent: IServiceContainer) {}

  register<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void {
    // Scoped registrations override parent
    this.scopedInstances.set(token, factory(this));
  }

  registerSingleton<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void {
    this.register(token, factory);
  }

  registerInstance<T>(token: ServiceToken<T>, instance: T): void {
    this.scopedInstances.set(token, instance);
  }

  resolve<T>(token: ServiceToken<T>): T {
    if (this.scopedInstances.has(token)) {
      return this.scopedInstances.get(token) as T;
    }
    return this.parent.resolve(token);
  }

  tryResolve<T>(token: ServiceToken<T>): T | null {
    try {
      return this.resolve(token);
    } catch {
      return null;
    }
  }

  createScope(): IServiceScope {
    return new ServiceScope(this);
  }

  dispose(): void {
    // Dispose any disposable scoped instances
    for (const instance of this.scopedInstances.values()) {
      if (instance && typeof (instance as any).dispose === 'function') {
        (instance as any).dispose();
      }
    }
    this.scopedInstances.clear();
  }
}

// ============================================================================
// Usage Example
// ============================================================================

// Registration (at startup)
function configureServices(container: ServiceContainer, config: AlterCodeConfig): void {
  // Infrastructure (singletons)
  container.registerSingleton(ServiceTokens.Logger, () => new Logger());
  container.registerSingleton(ServiceTokens.Config, () => new ConfigManager(config));
  container.registerSingleton(ServiceTokens.EventBus, () => new EventBus());
  container.registerSingleton(ServiceTokens.Database, (c) =>
    new Database(c.resolve(ServiceTokens.Config))
  );
  container.registerSingleton(ServiceTokens.Cache, (c) =>
    new Cache(c.resolve(ServiceTokens.Config))
  );

  // Knowledge Layer
  container.registerSingleton(ServiceTokens.ProjectSnapshot, (c) =>
    new ProjectSnapshotService(
      c.resolve(ServiceTokens.FileSystem),
      c.resolve(ServiceTokens.Cache),
      c.resolve(ServiceTokens.Logger)
    )
  );

  // ... etc for all services
}

// Resolution (in service constructors)
class VerificationPipelineService implements IVerificationPipelineService {
  constructor(
    private fileValidator: IFileValidatorService,
    private symbolResolver: ISymbolResolverService,
    private apiChecker: IAPICheckerService,
    private dependencyVerifier: IDependencyVerifierService,
    private logger: ILogger
  ) {}
}
```

### Rationale

| Aspect | Decision | Reason |
|--------|----------|--------|
| **Pattern** | Constructor Injection | Explicit dependencies, easy to test |
| **Container** | Custom lightweight | Avoid heavy frameworks, VS Code compatible |
| **Lifetime** | Singleton by default | Services are stateless or manage own state |
| **Scoping** | Support for request scope | Useful for per-mission context |

---

## 2. Error Handling

### Decision: Hybrid Approach

- **Cross-layer boundaries**: Use `Result<T, E>` types for explicit error handling
- **Within services**: Use try/catch with typed errors
- **Infrastructure**: Throw exceptions for truly exceptional cases

```typescript
// ============================================================================
// Result Type Definition
// ============================================================================

type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

// Constructors
const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });

// Async version
type AsyncResult<T, E = AppError> = Promise<Result<T, E>>;

// ============================================================================
// Error Types
// ============================================================================

// Base error class
abstract class AppError extends Error {
  abstract readonly code: string;
  abstract readonly category: ErrorCategory;
  readonly timestamp = new Date();

  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = this.constructor.name;
  }

  toJSON(): ErrorInfo {
    return {
      code: this.code,
      category: this.category,
      message: this.message,
      timestamp: this.timestamp,
      cause: this.cause?.message,
    };
  }
}

type ErrorCategory =
  | 'validation'
  | 'verification'
  | 'execution'
  | 'infrastructure'
  | 'integration'
  | 'user';

interface ErrorInfo {
  code: string;
  category: ErrorCategory;
  message: string;
  timestamp: Date;
  cause?: string;
}

// ============================================================================
// Specific Error Types
// ============================================================================

// Validation errors (user input problems)
class ValidationError extends AppError {
  readonly code = 'VALIDATION_ERROR';
  readonly category = 'validation' as const;

  constructor(
    message: string,
    public readonly field?: string,
    public readonly details?: Record<string, string>
  ) {
    super(message);
  }
}

// Verification errors (reality check failures)
class VerificationError extends AppError {
  readonly code: string;
  readonly category = 'verification' as const;

  constructor(
    code: string,
    message: string,
    public readonly location?: SourceLocation,
    public readonly suggestions?: string[]
  ) {
    super(message);
    this.code = code;
  }
}

class FileNotFoundError extends VerificationError {
  constructor(path: string, suggestions?: string[]) {
    super('FILE_NOT_FOUND', `File not found: ${path}`, undefined, suggestions);
  }
}

class SymbolNotFoundError extends VerificationError {
  constructor(symbol: string, suggestions?: string[]) {
    super('SYMBOL_NOT_FOUND', `Symbol not found: ${symbol}`, undefined, suggestions);
  }
}

class ScopeViolationError extends VerificationError {
  constructor(message: string, public readonly violation: ScopeViolation) {
    super('SCOPE_VIOLATION', message);
  }
}

// Execution errors (runtime problems)
class ExecutionError extends AppError {
  readonly code: string;
  readonly category = 'execution' as const;

  constructor(code: string, message: string, cause?: Error) {
    super(message, cause);
    this.code = code;
  }
}

class TaskFailedError extends ExecutionError {
  constructor(taskId: TaskId, message: string, cause?: Error) {
    super('TASK_FAILED', `Task ${taskId} failed: ${message}`, cause);
  }
}

class AgentError extends ExecutionError {
  constructor(agentId: AgentId, message: string, cause?: Error) {
    super('AGENT_ERROR', `Agent ${agentId} error: ${message}`, cause);
  }
}

// Infrastructure errors (system problems)
class InfrastructureError extends AppError {
  readonly code: string;
  readonly category = 'infrastructure' as const;

  constructor(code: string, message: string, cause?: Error) {
    super(message, cause);
    this.code = code;
  }
}

class DatabaseError extends InfrastructureError {
  constructor(message: string, cause?: Error) {
    super('DATABASE_ERROR', message, cause);
  }
}

class CacheError extends InfrastructureError {
  constructor(message: string, cause?: Error) {
    super('CACHE_ERROR', message, cause);
  }
}

// Integration errors (external service problems)
class IntegrationError extends AppError {
  readonly code: string;
  readonly category = 'integration' as const;

  constructor(
    code: string,
    message: string,
    public readonly provider: string,
    cause?: Error
  ) {
    super(message, cause);
    this.code = code;
  }
}

class AIProviderError extends IntegrationError {
  constructor(provider: string, message: string, cause?: Error) {
    super('AI_PROVIDER_ERROR', message, provider, cause);
  }
}

class RateLimitError extends IntegrationError {
  constructor(
    provider: string,
    public readonly retryAfter?: number
  ) {
    super('RATE_LIMIT', `Rate limit exceeded for ${provider}`, provider);
  }
}

// ============================================================================
// Result Utilities
// ============================================================================

// Map over success value
function mapResult<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U
): Result<U, E> {
  if (result.ok) {
    return Ok(fn(result.value));
  }
  return result;
}

// Chain results
function flatMapResult<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  if (result.ok) {
    return fn(result.value);
  }
  return result;
}

// Combine multiple results
function combineResults<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const result of results) {
    if (!result.ok) {
      return result;
    }
    values.push(result.value);
  }
  return Ok(values);
}

// Convert Promise to AsyncResult
async function tryCatch<T>(
  fn: () => Promise<T>,
  errorMapper?: (error: unknown) => AppError
): AsyncResult<T> {
  try {
    const value = await fn();
    return Ok(value);
  } catch (error) {
    if (error instanceof AppError) {
      return Err(error);
    }
    if (errorMapper) {
      return Err(errorMapper(error));
    }
    return Err(
      new InfrastructureError(
        'UNKNOWN_ERROR',
        error instanceof Error ? error.message : String(error),
        error instanceof Error ? error : undefined
      )
    );
  }
}

// Unwrap or throw
function unwrap<T, E extends Error>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value;
  }
  throw result.error;
}

// Unwrap with default
function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (result.ok) {
    return result.value;
  }
  return defaultValue;
}

// ============================================================================
// Usage Examples
// ============================================================================

// Service method returning Result
class FileValidatorService implements IFileValidatorService {
  async validate(paths: string[]): AsyncResult<FileValidationResult[]> {
    const results: FileValidationResult[] = [];

    for (const path of paths) {
      try {
        const exists = await this.fileSystem.exists(path);
        if (!exists) {
          const suggestions = await this.findSimilarFiles(path);
          results.push({
            path,
            valid: false,
            error: 'File not found',
            suggestions,
          });
        } else {
          const stats = await this.fileSystem.stat(path);
          results.push({
            path,
            valid: true,
            exists: true,
            isFile: stats.isFile,
            isDirectory: stats.isDirectory,
            size: stats.size,
            lastModified: stats.mtime,
          });
        }
      } catch (error) {
        return Err(new InfrastructureError(
          'FILE_SYSTEM_ERROR',
          `Failed to validate ${path}`,
          error instanceof Error ? error : undefined
        ));
      }
    }

    return Ok(results);
  }
}

// Consumer handling Result
async function handleVerification(intent: IntentDeclaration): Promise<void> {
  const result = await verificationPipeline.verify({
    phase: 'pre-generation',
    content: { type: 'intent', intent },
    options: { strictness: 'standard' },
  });

  if (!result.ok) {
    // Handle error
    logger.error('Verification failed', result.error);
    showError(result.error.message);
    return;
  }

  // Use value
  const verification = result.value;
  if (!verification.passed) {
    showVerificationErrors(verification.errors);
    return;
  }

  // Continue with execution
  await executeIntent(intent);
}
```

### Error Handling Rules

| Layer | Approach | Reason |
|-------|----------|--------|
| **Infrastructure** | Throw exceptions | Truly exceptional, unrecoverable |
| **Integration** | Return Result | External failures are expected |
| **Execution** | Return Result | Task failures need graceful handling |
| **Verification** | Return Result | Verification failures are informational |
| **Protocol** | Return Result | User-facing, need clear messages |
| **Context** | Return Result | Selection may fail gracefully |
| **Knowledge** | Return Result | Index may be stale |

---

## 3. Async Patterns

### Decision: async/await with Cancellation Tokens

Use standard async/await with a CancellationToken pattern for long-running operations.

```typescript
// ============================================================================
// Cancellation Token
// ============================================================================

interface CancellationToken {
  readonly isCancelled: boolean;
  readonly reason?: string;
  throwIfCancelled(): void;
  onCancelled(callback: () => void): Disposable;
}

interface CancellationTokenSource {
  readonly token: CancellationToken;
  cancel(reason?: string): void;
  dispose(): void;
}

class CancellationTokenSourceImpl implements CancellationTokenSource {
  private _isCancelled = false;
  private _reason?: string;
  private callbacks: Set<() => void> = new Set();

  readonly token: CancellationToken = {
    get isCancelled() {
      return this._isCancelled;
    },
    get reason() {
      return this._reason;
    },
    throwIfCancelled: () => {
      if (this._isCancelled) {
        throw new CancellationError(this._reason);
      }
    },
    onCancelled: (callback: () => void): Disposable => {
      if (this._isCancelled) {
        callback();
        return { dispose: () => {} };
      }
      this.callbacks.add(callback);
      return {
        dispose: () => this.callbacks.delete(callback),
      };
    },
  };

  cancel(reason?: string): void {
    if (this._isCancelled) return;
    this._isCancelled = true;
    this._reason = reason;
    for (const callback of this.callbacks) {
      try {
        callback();
      } catch {
        // Ignore callback errors
      }
    }
  }

  dispose(): void {
    this.callbacks.clear();
  }
}

class CancellationError extends Error {
  readonly code = 'CANCELLED';

  constructor(reason?: string) {
    super(reason ?? 'Operation cancelled');
    this.name = 'CancellationError';
  }
}

// Factory
function createCancellationToken(): CancellationTokenSource {
  return new CancellationTokenSourceImpl();
}

// None token (never cancels)
const CancellationToken_None: CancellationToken = {
  isCancelled: false,
  reason: undefined,
  throwIfCancelled: () => {},
  onCancelled: () => ({ dispose: () => {} }),
};

// ============================================================================
// Async Utilities
// ============================================================================

// Delay with cancellation support
function delay(ms: number, token?: CancellationToken): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);

    if (token) {
      const disposable = token.onCancelled(() => {
        clearTimeout(timer);
        reject(new CancellationError(token.reason));
      });

      // Clean up on completion
      setTimeout(() => disposable.dispose(), ms + 1);
    }
  });
}

// Timeout wrapper
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message?: string
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(message ?? `Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}

// Cancellable wrapper
async function withCancellation<T>(
  fn: (token: CancellationToken) => Promise<T>,
  token: CancellationToken
): Promise<T> {
  token.throwIfCancelled();

  const result = await fn(token);

  token.throwIfCancelled();

  return result;
}

// Retry with cancellation
async function retryAsync<T>(
  fn: (token: CancellationToken) => Promise<T>,
  config: RetryConfig,
  token: CancellationToken = CancellationToken_None
): AsyncResult<T, AppError> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    token.throwIfCancelled();

    try {
      const result = await fn(token);
      return Ok(result);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if retryable
      if (error instanceof AppError) {
        const errorCode = error.code;
        if (config.nonRetryableErrors.includes(errorCode)) {
          return Err(error);
        }
      }

      // Check if more retries available
      if (attempt >= config.maxRetries) {
        break;
      }

      // Calculate delay with exponential backoff
      let delayMs = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
      delayMs = Math.min(delayMs, config.maxDelayMs);

      // Add jitter
      if (config.jitter) {
        const jitter = 0.75 + Math.random() * 0.5;
        delayMs = Math.round(delayMs * jitter);
      }

      await delay(delayMs, token);
    }
  }

  return Err(new ExecutionError(
    'RETRY_EXHAUSTED',
    `Failed after ${config.maxRetries + 1} attempts: ${lastError?.message}`,
    lastError
  ));
}

// Run with progress reporting
interface ProgressReporter {
  report(progress: { message?: string; increment?: number }): void;
}

async function withProgress<T>(
  title: string,
  fn: (progress: ProgressReporter, token: CancellationToken) => Promise<T>,
  token?: CancellationToken
): Promise<T> {
  // This would integrate with VS Code progress API
  const progress: ProgressReporter = {
    report: ({ message, increment }) => {
      // Report to UI
    },
  };

  return fn(progress, token ?? CancellationToken_None);
}

// ============================================================================
// Usage Examples
// ============================================================================

// Service method with cancellation
class ExecutionCoordinatorService implements IExecutionCoordinatorService {
  async execute(
    mission: Mission,
    token: CancellationToken = CancellationToken_None
  ): AsyncResult<MissionResult> {
    token.throwIfCancelled();

    const tasks = await this.taskManager.getTasksByMission(mission.id);

    for (const task of tasks) {
      token.throwIfCancelled();

      const result = await this.executeTask(task, token);
      if (!result.ok) {
        return Err(new TaskFailedError(task.id, result.error.message, result.error));
      }
    }

    return Ok({
      success: true,
      summary: 'Mission completed',
      artifacts: [],
      metrics: this.collectMetrics(mission),
    });
  }

  private async executeTask(
    task: Task,
    token: CancellationToken
  ): AsyncResult<TaskOutput> {
    // Long running operation with cancellation checks
    const result = await retryAsync(
      async (t) => {
        t.throwIfCancelled();

        const agent = await this.agentPool.getAgent(task.level);
        if (!agent.ok) throw agent.error;

        t.throwIfCancelled();

        const response = await this.agentPool.execute({
          agentId: agent.value.id,
          task,
          context: await this.buildContext(task),
          prompt: this.buildPrompt(task),
        });

        return response;
      },
      this.retryConfig,
      token
    );

    return result;
  }
}

// Mission execution with timeout and cancellation
async function runMission(missionId: MissionId): Promise<void> {
  const cts = createCancellationToken();

  // Allow user to cancel
  const cancelButton = showCancelButton(() => cts.cancel('User cancelled'));

  try {
    const result = await withTimeout(
      executionCoordinator.execute(mission, cts.token),
      30 * 60 * 1000, // 30 minute timeout
      'Mission timed out'
    );

    if (!result.ok) {
      showError(result.error);
    } else {
      showSuccess(result.value);
    }
  } catch (error) {
    if (error instanceof CancellationError) {
      showInfo('Mission cancelled');
    } else {
      showError(error);
    }
  } finally {
    cancelButton.dispose();
    cts.dispose();
  }
}
```

---

## 4. Event System

### Decision: Typed Async Event Bus

Use a typed, async-capable event bus with support for:
- Typed events
- Async handlers
- Priority ordering
- One-time subscriptions

```typescript
// ============================================================================
// Event Definitions
// ============================================================================

// Base event interface
interface BaseEvent {
  readonly type: string;
  readonly timestamp: Date;
  readonly source?: string;
}

// Event map for type safety
interface EventMap {
  // Mission events
  'mission:created': MissionCreatedEvent;
  'mission:started': MissionStartedEvent;
  'mission:progress': MissionProgressEvent;
  'mission:completed': MissionCompletedEvent;
  'mission:failed': MissionFailedEvent;
  'mission:cancelled': MissionCancelledEvent;

  // Task events
  'task:created': TaskCreatedEvent;
  'task:assigned': TaskAssignedEvent;
  'task:started': TaskStartedEvent;
  'task:progress': TaskProgressEvent;
  'task:completed': TaskCompletedEvent;
  'task:failed': TaskFailedEvent;

  // Agent events
  'agent:spawned': AgentSpawnedEvent;
  'agent:busy': AgentBusyEvent;
  'agent:idle': AgentIdleEvent;
  'agent:terminated': AgentTerminatedEvent;

  // Verification events
  'verification:started': VerificationStartedEvent;
  'verification:check': VerificationCheckEvent;
  'verification:completed': VerificationCompletedEvent;

  // Protocol events
  'intent:declared': IntentDeclaredEvent;
  'scope:violation': ScopeViolationEvent;
  'preflight:started': PreflightStartedEvent;
  'preflight:completed': PreflightCompletedEvent;
  'rollback:created': RollbackCreatedEvent;
  'rollback:restored': RollbackRestoredEvent;

  // File events
  'file:changed': FileChangedEvent;
  'file:created': FileCreatedEvent;
  'file:deleted': FileDeletedEvent;

  // Index events
  'index:updated': IndexUpdatedEvent;
  'index:invalidated': IndexInvalidatedEvent;
}

type EventType = keyof EventMap;
type EventData<T extends EventType> = EventMap[T];

// ============================================================================
// Specific Event Definitions
// ============================================================================

interface MissionCreatedEvent extends BaseEvent {
  type: 'mission:created';
  missionId: MissionId;
  title: string;
  mode: MissionMode;
}

interface MissionStartedEvent extends BaseEvent {
  type: 'mission:started';
  missionId: MissionId;
}

interface MissionProgressEvent extends BaseEvent {
  type: 'mission:progress';
  missionId: MissionId;
  progress: MissionProgress;
}

interface MissionCompletedEvent extends BaseEvent {
  type: 'mission:completed';
  missionId: MissionId;
  result: MissionResult;
}

interface MissionFailedEvent extends BaseEvent {
  type: 'mission:failed';
  missionId: MissionId;
  error: ErrorInfo;
}

interface MissionCancelledEvent extends BaseEvent {
  type: 'mission:cancelled';
  missionId: MissionId;
  reason?: string;
}

interface TaskCreatedEvent extends BaseEvent {
  type: 'task:created';
  taskId: TaskId;
  missionId: MissionId;
  title: string;
}

interface TaskAssignedEvent extends BaseEvent {
  type: 'task:assigned';
  taskId: TaskId;
  agentId: AgentId;
}

interface TaskStartedEvent extends BaseEvent {
  type: 'task:started';
  taskId: TaskId;
}

interface TaskProgressEvent extends BaseEvent {
  type: 'task:progress';
  taskId: TaskId;
  message: string;
}

interface TaskCompletedEvent extends BaseEvent {
  type: 'task:completed';
  taskId: TaskId;
  output: TaskOutput;
}

interface TaskFailedEvent extends BaseEvent {
  type: 'task:failed';
  taskId: TaskId;
  error: ErrorInfo;
}

interface VerificationStartedEvent extends BaseEvent {
  type: 'verification:started';
  phase: VerificationPhase;
  intentId?: IntentId;
}

interface VerificationCheckEvent extends BaseEvent {
  type: 'verification:check';
  check: string;
  passed: boolean;
  message: string;
}

interface VerificationCompletedEvent extends BaseEvent {
  type: 'verification:completed';
  phase: VerificationPhase;
  passed: boolean;
  errors: number;
  warnings: number;
}

interface FileChangedEvent extends BaseEvent {
  type: 'file:changed';
  path: RelativePath;
  changeType: 'created' | 'modified' | 'deleted';
}

interface IndexUpdatedEvent extends BaseEvent {
  type: 'index:updated';
  files: RelativePath[];
  symbolsAdded: number;
  symbolsRemoved: number;
}

// ... other event definitions

// ============================================================================
// Event Bus Interface
// ============================================================================

type EventHandler<T extends EventType> = (event: EventData<T>) => void | Promise<void>;

interface EventSubscription {
  dispose(): void;
}

interface IEventBus {
  // Emit event
  emit<T extends EventType>(type: T, data: Omit<EventData<T>, 'type' | 'timestamp'>): void;

  // Subscribe to event
  on<T extends EventType>(
    type: T,
    handler: EventHandler<T>,
    options?: SubscriptionOptions
  ): EventSubscription;

  // Subscribe once
  once<T extends EventType>(
    type: T,
    handler: EventHandler<T>
  ): EventSubscription;

  // Remove all handlers for an event type
  off<T extends EventType>(type: T): void;

  // Wait for an event
  waitFor<T extends EventType>(
    type: T,
    predicate?: (event: EventData<T>) => boolean,
    timeout?: number
  ): Promise<EventData<T>>;
}

interface SubscriptionOptions {
  priority?: number;  // Higher = called first (default: 0)
  filter?: (event: any) => boolean;  // Only call if filter returns true
}

// ============================================================================
// Event Bus Implementation
// ============================================================================

interface HandlerEntry<T extends EventType> {
  handler: EventHandler<T>;
  priority: number;
  filter?: (event: EventData<T>) => boolean;
  once: boolean;
}

class EventBus implements IEventBus {
  private handlers = new Map<EventType, HandlerEntry<any>[]>();
  private logger: ILogger;

  constructor(logger: ILogger) {
    this.logger = logger;
  }

  emit<T extends EventType>(
    type: T,
    data: Omit<EventData<T>, 'type' | 'timestamp'>
  ): void {
    const event = {
      ...data,
      type,
      timestamp: new Date(),
    } as EventData<T>;

    this.logger.debug(`Event emitted: ${type}`, event);

    const handlers = this.handlers.get(type) ?? [];
    const toRemove: HandlerEntry<T>[] = [];

    // Sort by priority (higher first)
    const sorted = [...handlers].sort((a, b) => b.priority - a.priority);

    for (const entry of sorted) {
      // Apply filter
      if (entry.filter && !entry.filter(event)) {
        continue;
      }

      // Mark for removal if once
      if (entry.once) {
        toRemove.push(entry);
      }

      // Call handler
      try {
        const result = entry.handler(event);
        if (result instanceof Promise) {
          result.catch((error) => {
            this.logger.error(`Event handler error for ${type}`, error);
          });
        }
      } catch (error) {
        this.logger.error(`Event handler error for ${type}`, error as Error);
      }
    }

    // Remove once handlers
    for (const entry of toRemove) {
      const idx = handlers.indexOf(entry);
      if (idx >= 0) {
        handlers.splice(idx, 1);
      }
    }
  }

  on<T extends EventType>(
    type: T,
    handler: EventHandler<T>,
    options?: SubscriptionOptions
  ): EventSubscription {
    const entry: HandlerEntry<T> = {
      handler,
      priority: options?.priority ?? 0,
      filter: options?.filter,
      once: false,
    };

    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(entry);

    return {
      dispose: () => {
        const handlers = this.handlers.get(type);
        if (handlers) {
          const idx = handlers.indexOf(entry);
          if (idx >= 0) {
            handlers.splice(idx, 1);
          }
        }
      },
    };
  }

  once<T extends EventType>(
    type: T,
    handler: EventHandler<T>
  ): EventSubscription {
    const entry: HandlerEntry<T> = {
      handler,
      priority: 0,
      once: true,
    };

    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(entry);

    return {
      dispose: () => {
        const handlers = this.handlers.get(type);
        if (handlers) {
          const idx = handlers.indexOf(entry);
          if (idx >= 0) {
            handlers.splice(idx, 1);
          }
        }
      },
    };
  }

  off<T extends EventType>(type: T): void {
    this.handlers.delete(type);
  }

  waitFor<T extends EventType>(
    type: T,
    predicate?: (event: EventData<T>) => boolean,
    timeout?: number
  ): Promise<EventData<T>> {
    return new Promise((resolve, reject) => {
      let subscription: EventSubscription;
      let timer: NodeJS.Timeout | undefined;

      const cleanup = () => {
        subscription?.dispose();
        if (timer) clearTimeout(timer);
      };

      subscription = this.on(type, (event) => {
        if (!predicate || predicate(event)) {
          cleanup();
          resolve(event);
        }
      });

      if (timeout) {
        timer = setTimeout(() => {
          cleanup();
          reject(new Error(`Timeout waiting for event: ${type}`));
        }, timeout);
      }
    });
  }
}

// ============================================================================
// Usage Examples
// ============================================================================

// Emitting events
class MissionManagerService implements IMissionManagerService {
  constructor(
    private eventBus: IEventBus,
    // ... other deps
  ) {}

  async createMission(intent: IntentDeclaration): AsyncResult<Mission> {
    const mission = await this.buildMission(intent);

    // Emit event
    this.eventBus.emit('mission:created', {
      missionId: mission.id,
      title: mission.title,
      mode: mission.mode,
      source: 'MissionManager',
    });

    return Ok(mission);
  }

  async start(missionId: MissionId): AsyncResult<void> {
    this.eventBus.emit('mission:started', {
      missionId,
      source: 'MissionManager',
    });

    // ... execution logic
  }
}

// Subscribing to events
class MissionControlPanel {
  private subscriptions: EventSubscription[] = [];

  constructor(private eventBus: IEventBus) {
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Progress updates
    this.subscriptions.push(
      this.eventBus.on('mission:progress', (event) => {
        this.updateProgressUI(event.missionId, event.progress);
      })
    );

    // Task status changes
    this.subscriptions.push(
      this.eventBus.on('task:completed', (event) => {
        this.markTaskComplete(event.taskId);
      })
    );

    // Verification feedback
    this.subscriptions.push(
      this.eventBus.on('verification:check', (event) => {
        this.showVerificationCheck(event.check, event.passed, event.message);
      }, { priority: 10 })  // High priority for UI updates
    );
  }

  dispose(): void {
    for (const sub of this.subscriptions) {
      sub.dispose();
    }
  }
}

// Waiting for events
async function waitForMissionComplete(missionId: MissionId): Promise<MissionResult> {
  const event = await eventBus.waitFor(
    'mission:completed',
    (e) => e.missionId === missionId,
    5 * 60 * 1000  // 5 minute timeout
  );

  return event.result;
}
```

---

## 5. Storage Architecture

### Decision: Layer-Separated Storage with Unified Access

Each layer has its own storage domain, but a unified access layer allows cross-layer queries.

```typescript
// ============================================================================
// Storage Architecture
// ============================================================================

/*
┌─────────────────────────────────────────────────────────────────┐
│                     Unified Storage Access                       │
│                      (StorageManager)                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  Knowledge  │  │   Protocol  │  │       Execution         │ │
│  │   Store     │  │    Store    │  │        Store            │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
│         │                │                     │               │
│  ┌──────┴──────┐  ┌──────┴──────┐  ┌──────────┴──────────┐   │
│  │ - Snapshots │  │ - Intents   │  │ - Missions          │   │
│  │ - Index     │  │ - Scopes    │  │ - Tasks             │   │
│  │ - Convent.  │  │ - Snapshots │  │ - Agents            │   │
│  │ - Errors    │  │ - Checklists│  │ - Results           │   │
│  └─────────────┘  └─────────────┘  └───────────────────────┘  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                        Storage Backends                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   SQLite    │  │   LevelDB   │  │      File System        │ │
│  │ (Relations) │  │  (KV Cache) │  │     (Snapshots)         │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
*/

// ============================================================================
// Storage Interface Hierarchy
// ============================================================================

// Base storage interface
interface IStorage {
  initialize(): AsyncResult<void>;
  close(): AsyncResult<void>;
  isReady(): boolean;
}

// Layer-specific stores
interface IKnowledgeStore extends IStorage {
  // Project Snapshots
  saveSnapshot(snapshot: ProjectSnapshot): AsyncResult<void>;
  getLatestSnapshot(): AsyncResult<ProjectSnapshot | null>;
  getSnapshot(id: SnapshotId): AsyncResult<ProjectSnapshot | null>;
  listSnapshots(limit?: number): AsyncResult<ProjectSnapshot[]>;

  // Semantic Index
  saveIndex(index: SemanticIndex): AsyncResult<void>;
  getIndex(): AsyncResult<SemanticIndex | null>;
  updateIndexFile(path: RelativePath, symbols: BaseSymbol[]): AsyncResult<void>;
  removeIndexFile(path: RelativePath): AsyncResult<void>;

  // Conventions
  saveConventions(conventions: ProjectConventions): AsyncResult<void>;
  getConventions(): AsyncResult<ProjectConventions | null>;

  // Error Memory
  saveErrorPattern(pattern: ErrorPattern): AsyncResult<void>;
  getErrorPattern(id: string): AsyncResult<ErrorPattern | null>;
  listErrorPatterns(): AsyncResult<ErrorPattern[]>;
  recordErrorOccurrence(occurrence: ErrorOccurrence): AsyncResult<void>;
}

interface IProtocolStore extends IStorage {
  // Intents
  saveIntent(intent: IntentDeclaration): AsyncResult<void>;
  getIntent(id: IntentId): AsyncResult<IntentDeclaration | null>;
  listIntents(filter?: IntentFilter): AsyncResult<IntentDeclaration[]>;
  updateIntentStatus(id: IntentId, status: IntentStatus): AsyncResult<void>;

  // Rollback Snapshots
  saveRollbackSnapshot(snapshot: RollbackSnapshot): AsyncResult<void>;
  getRollbackSnapshot(id: SnapshotId): AsyncResult<RollbackSnapshot | null>;
  listRollbackSnapshots(intentId?: IntentId): AsyncResult<RollbackSnapshot[]>;
  deleteRollbackSnapshot(id: SnapshotId): AsyncResult<void>;

  // Checklists
  saveChecklist(checklist: PreflightChecklist): AsyncResult<void>;
  getChecklist(id: string): AsyncResult<PreflightChecklist | null>;
}

interface IExecutionStore extends IStorage {
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
// Unified Storage Manager
// ============================================================================

interface IStorageManager {
  // Layer stores
  readonly knowledge: IKnowledgeStore;
  readonly protocol: IProtocolStore;
  readonly execution: IExecutionStore;

  // Cross-layer cache
  readonly cache: ICache;

  // Lifecycle
  initialize(): AsyncResult<void>;
  close(): AsyncResult<void>;

  // Cross-layer queries
  query<T>(query: StorageQuery<T>): AsyncResult<T>;

  // Transactions
  transaction<T>(fn: (stores: StorageStores) => Promise<T>): AsyncResult<T>;

  // Maintenance
  vacuum(): AsyncResult<void>;
  backup(path: string): AsyncResult<void>;
  restore(path: string): AsyncResult<void>;
}

interface StorageStores {
  knowledge: IKnowledgeStore;
  protocol: IProtocolStore;
  execution: IExecutionStore;
}

// Query builder for cross-layer queries
interface StorageQuery<T> {
  type: 'cross-layer';
  description: string;
  execute: (stores: StorageStores) => AsyncResult<T>;
}

// ============================================================================
// Cache Interface
// ============================================================================

interface ICache {
  // Basic operations
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, options?: CacheOptions): Promise<void>;
  delete(key: string): Promise<boolean>;
  has(key: string): Promise<boolean>;
  clear(): Promise<void>;

  // Namespaced operations
  namespace(prefix: string): ICache;

  // Batch operations
  getMany<T>(keys: string[]): Promise<Map<string, T>>;
  setMany<T>(entries: Map<string, T>, options?: CacheOptions): Promise<void>;
  deleteMany(keys: string[]): Promise<number>;

  // Statistics
  getStats(): CacheStats;
}

interface CacheOptions {
  ttl?: number;  // Time to live in ms
  tags?: string[];  // For invalidation by tag
}

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  keys: number;
}

// ============================================================================
// Implementation
// ============================================================================

class StorageManager implements IStorageManager {
  readonly knowledge: IKnowledgeStore;
  readonly protocol: IProtocolStore;
  readonly execution: IExecutionStore;
  readonly cache: ICache;

  private db: Database;
  private initialized = false;

  constructor(config: StorageConfig) {
    // Initialize SQLite database
    this.db = new Database(config.databasePath);

    // Initialize LevelDB cache
    this.cache = new LevelDBCache(config.cachePath, config.cacheMaxSize);

    // Create layer stores
    this.knowledge = new KnowledgeStore(this.db, this.cache.namespace('knowledge'));
    this.protocol = new ProtocolStore(this.db, this.cache.namespace('protocol'), config.snapshotPath);
    this.execution = new ExecutionStore(this.db, this.cache.namespace('execution'));
  }

  async initialize(): AsyncResult<void> {
    if (this.initialized) {
      return Ok(undefined);
    }

    // Initialize database schema
    const dbResult = await this.db.initialize();
    if (!dbResult.ok) return dbResult;

    // Initialize each store
    const results = await Promise.all([
      this.knowledge.initialize(),
      this.protocol.initialize(),
      this.execution.initialize(),
    ]);

    for (const result of results) {
      if (!result.ok) return result;
    }

    this.initialized = true;
    return Ok(undefined);
  }

  async close(): AsyncResult<void> {
    await Promise.all([
      this.knowledge.close(),
      this.protocol.close(),
      this.execution.close(),
    ]);

    await this.db.close();
    this.initialized = false;
    return Ok(undefined);
  }

  async query<T>(query: StorageQuery<T>): AsyncResult<T> {
    return query.execute({
      knowledge: this.knowledge,
      protocol: this.protocol,
      execution: this.execution,
    });
  }

  async transaction<T>(fn: (stores: StorageStores) => Promise<T>): AsyncResult<T> {
    return this.db.transaction(async () => {
      return fn({
        knowledge: this.knowledge,
        protocol: this.protocol,
        execution: this.execution,
      });
    });
  }

  async vacuum(): AsyncResult<void> {
    return this.db.vacuum();
  }

  async backup(path: string): AsyncResult<void> {
    return this.db.backup(path);
  }

  async restore(path: string): AsyncResult<void> {
    return this.db.restore(path);
  }
}

// ============================================================================
// Cross-Layer Query Examples
// ============================================================================

// Query to get all data related to an intent
const getIntentFullContext: StorageQuery<IntentContext> = {
  type: 'cross-layer',
  description: 'Get full context for an intent including mission and tasks',
  execute: async (stores) => {
    const intent = await stores.protocol.getIntent(intentId);
    if (!intent.ok || !intent.value) {
      return Err(new ValidationError('Intent not found'));
    }

    const missions = await stores.execution.listMissions({
      intentId: intent.value.id,
    });

    const tasks: Task[] = [];
    for (const mission of missions.value ?? []) {
      const missionTasks = await stores.execution.getTasksByMission(mission.id);
      if (missionTasks.ok && missionTasks.value) {
        tasks.push(...missionTasks.value);
      }
    }

    const rollbacks = await stores.protocol.listRollbackSnapshots(intent.value.id);

    return Ok({
      intent: intent.value,
      missions: missions.value ?? [],
      tasks,
      rollbacks: rollbacks.value ?? [],
    });
  },
};

// Query to get error patterns for a specific file
const getFileErrorPatterns: StorageQuery<ErrorPattern[]> = {
  type: 'cross-layer',
  description: 'Get error patterns associated with a specific file',
  execute: async (stores) => {
    const patterns = await stores.knowledge.listErrorPatterns();
    if (!patterns.ok) return patterns;

    // Filter patterns that occurred in this file
    return Ok(
      patterns.value.filter((p) =>
        p.occurrences.some((o) => o.file === filePath)
      )
    );
  },
};

// ============================================================================
// Database Schema
// ============================================================================

const SCHEMA = `
-- Knowledge Layer Tables
CREATE TABLE IF NOT EXISTS project_snapshots (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  project_root TEXT NOT NULL,
  data BLOB NOT NULL,  -- JSON compressed
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS semantic_index (
  id INTEGER PRIMARY KEY,
  version INTEGER NOT NULL,
  last_updated TEXT NOT NULL,
  data BLOB NOT NULL  -- JSON compressed
);

CREATE TABLE IF NOT EXISTS index_files (
  path TEXT PRIMARY KEY,
  symbols BLOB NOT NULL,  -- JSON
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conventions (
  id INTEGER PRIMARY KEY,
  data BLOB NOT NULL,
  analyzed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS error_patterns (
  id TEXT PRIMARY KEY,
  fingerprint TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,
  message_pattern TEXT NOT NULL,
  prevention TEXT,
  occurrences INTEGER DEFAULT 0,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  data BLOB  -- Full JSON
);

CREATE TABLE IF NOT EXISTS error_occurrences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern_id TEXT NOT NULL,
  task_id TEXT,
  agent_id TEXT,
  file TEXT,
  timestamp TEXT NOT NULL,
  resolved INTEGER DEFAULT 0,
  resolution TEXT,
  FOREIGN KEY (pattern_id) REFERENCES error_patterns(id)
);

-- Protocol Layer Tables
CREATE TABLE IF NOT EXISTS intents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  description TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL,
  scope BLOB,  -- JSON
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rollback_snapshots (
  id TEXT PRIMARY KEY,
  intent_id TEXT NOT NULL,
  task_id TEXT,
  description TEXT,
  status TEXT NOT NULL,
  files_count INTEGER NOT NULL,
  total_size INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (intent_id) REFERENCES intents(id)
);

CREATE TABLE IF NOT EXISTS rollback_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id TEXT NOT NULL,
  path TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  existed INTEGER NOT NULL,
  FOREIGN KEY (snapshot_id) REFERENCES rollback_snapshots(id)
);

CREATE TABLE IF NOT EXISTS checklists (
  id TEXT PRIMARY KEY,
  intent_id TEXT NOT NULL,
  status TEXT NOT NULL,
  items BLOB NOT NULL,  -- JSON
  results BLOB,  -- JSON
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  FOREIGN KEY (intent_id) REFERENCES intents(id)
);

-- Execution Layer Tables
CREATE TABLE IF NOT EXISTS missions (
  id TEXT PRIMARY KEY,
  intent_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  progress BLOB,  -- JSON
  result BLOB,  -- JSON
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (intent_id) REFERENCES intents(id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL,
  parent_task_id TEXT,
  level TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,
  priority INTEGER DEFAULT 2,
  assigned_agent_id TEXT,
  input BLOB,  -- JSON
  output BLOB,  -- JSON
  metrics BLOB,  -- JSON
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (mission_id) REFERENCES missions(id),
  FOREIGN KEY (parent_task_id) REFERENCES tasks(id)
);

CREATE TABLE IF NOT EXISTS task_dependencies (
  task_id TEXT NOT NULL,
  depends_on_task_id TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  PRIMARY KEY (task_id, depends_on_task_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (depends_on_task_id) REFERENCES tasks(id)
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  level TEXT NOT NULL,
  role TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL,
  config BLOB,  -- JSON
  metrics BLOB,  -- JSON
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_error_occurrences_pattern ON error_occurrences(pattern_id);
CREATE INDEX IF NOT EXISTS idx_error_occurrences_file ON error_occurrences(file);
CREATE INDEX IF NOT EXISTS idx_intents_status ON intents(status);
CREATE INDEX IF NOT EXISTS idx_rollback_snapshots_intent ON rollback_snapshots(intent_id);
CREATE INDEX IF NOT EXISTS idx_missions_status ON missions(status);
CREATE INDEX IF NOT EXISTS idx_missions_intent ON missions(intent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_mission ON tasks(mission_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
`;

// ============================================================================
// Usage Example
// ============================================================================

// Initialization
const storage = new StorageManager({
  databasePath: '/path/to/altercode.db',
  cachePath: '/path/to/cache',
  snapshotPath: '/path/to/snapshots',
  maxSnapshots: 100,
  cacheMaxSize: 100 * 1024 * 1024,  // 100MB
});

await storage.initialize();

// Layer-specific access
const snapshot = await storage.knowledge.getLatestSnapshot();
const intent = await storage.protocol.getIntent(intentId);
const mission = await storage.execution.getMission(missionId);

// Cross-layer query
const context = await storage.query(getIntentFullContext);

// Transaction across layers
await storage.transaction(async (stores) => {
  await stores.protocol.saveIntent(intent);
  await stores.execution.saveMission(mission);
  await stores.execution.saveTask(task);
});

// Caching
const cachedIndex = await storage.cache.get<SemanticIndex>('semantic-index');
if (!cachedIndex) {
  const index = await storage.knowledge.getIndex();
  await storage.cache.set('semantic-index', index.value, { ttl: 60000 });
}
```

---

## Summary of Decisions

| Area | Decision | Key Points |
|------|----------|------------|
| **Dependency Injection** | Constructor + Service Container | Type-safe tokens, singleton/scoped lifetimes |
| **Error Handling** | Hybrid Result + Exceptions | Result for layer boundaries, exceptions for infrastructure |
| **Async Patterns** | async/await + Cancellation | CancellationToken for long operations, retry with backoff |
| **Events** | Typed Async Event Bus | Strongly typed events, priority ordering, async handlers |
| **Storage** | Layer-Separated + Unified Access | Per-layer stores, cross-layer queries, SQLite + LevelDB |

These patterns provide:
1. **Testability** - Easy to mock dependencies
2. **Type Safety** - Compile-time checks for events, results, services
3. **Reliability** - Explicit error handling, cancellation support
4. **Performance** - Caching, async operations, efficient storage
5. **Flexibility** - Cross-layer access when needed, isolated when not
