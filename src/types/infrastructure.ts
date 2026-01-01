/**
 * Infrastructure Types
 *
 * Types for infrastructure layer components:
 * - Database
 * - Cache
 * - Event Bus
 * - Logger
 * - Configuration
 * - File System
 */

import {
  AsyncResult,
  Disposable,
  FilePath,
  RelativePath,
  TokenCount,
} from './common';

// ============================================================================
// Logger Types
// ============================================================================

/** Log levels */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Log entry */
export interface LogEntry {
  readonly level: LogLevel;
  readonly timestamp: Date;
  readonly component: string;
  readonly message: string;
  readonly data?: unknown;
  readonly error?: {
    readonly name: string;
    readonly message: string;
    readonly stack?: string;
  };
}

/** Logger interface */
export interface ILogger {
  readonly component: string;

  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, error?: Error, data?: unknown): void;

  /** Create a child logger with a sub-component name */
  child(name: string): ILogger;
}

/** Logger configuration */
export interface LoggerConfig {
  readonly level: LogLevel;
  readonly output: 'console' | 'file' | 'both';
  readonly filePath?: FilePath;
  readonly maxFileSize?: number;
  readonly maxFiles?: number;
}

// ============================================================================
// Event Bus Types
// ============================================================================

/** Base event interface */
export interface BaseEvent {
  readonly type: string;
  readonly timestamp: Date;
  readonly source?: string;
}

/** Event handler function */
export type EventHandler<T extends BaseEvent> = (event: T) => void | Promise<void>;

/** Event subscription options */
export interface SubscriptionOptions {
  /** Higher priority handlers are called first (default: 0) */
  readonly priority?: number;
  /** Only call handler if filter returns true */
  readonly filter?: (event: BaseEvent) => boolean;
}

/** Event subscription handle */
export interface EventSubscription extends Disposable {
  readonly eventType: string;
}

/** Event bus interface */
export interface IEventBus {
  /** Emit an event object */
  emit<T extends BaseEvent>(event: T): void;
  /** Emit an event by type and data */
  emit(type: string, data?: Record<string, unknown>): void;

  /** Subscribe to an event type */
  on<T extends BaseEvent>(
    type: string,
    handler: EventHandler<T>,
    options?: SubscriptionOptions
  ): EventSubscription;

  /** Subscribe to an event type (one time) */
  once<T extends BaseEvent>(type: string, handler: EventHandler<T>): EventSubscription;

  /** Remove all handlers for an event type */
  off(type: string): void;

  /** Wait for an event */
  waitFor<T extends BaseEvent>(
    type: string,
    predicate?: (event: T) => boolean,
    timeout?: number
  ): Promise<T>;
}

// ============================================================================
// Database Types
// ============================================================================

/** Database interface */
export interface IDatabase {
  /** Initialize the database */
  initialize(): AsyncResult<void>;

  /** Close the database */
  close(): AsyncResult<void>;

  /** Check if database is ready */
  isReady(): boolean;

  /** Execute a SQL query */
  execute(sql: string, params?: unknown[]): AsyncResult<void>;

  /** Query and return results */
  query<T>(sql: string, params?: unknown[]): AsyncResult<T[]>;

  /** Query and return first result */
  queryOne<T>(sql: string, params?: unknown[]): AsyncResult<T | null>;

  /** Run in transaction */
  transaction<T>(fn: () => Promise<T>): AsyncResult<T>;

  /** Vacuum the database */
  vacuum(): AsyncResult<void>;

  /** Backup to file */
  backup(path: FilePath): AsyncResult<void>;

  /** Restore from file */
  restore(path: FilePath): AsyncResult<void>;
}

/** Database configuration */
export interface DatabaseConfig {
  readonly path: FilePath;
  readonly walMode?: boolean;
  readonly busyTimeout?: number;
  readonly cacheSize?: number;
}

// ============================================================================
// Cache Types
// ============================================================================

/** Cache options for set operations */
export interface CacheOptions {
  /** Time to live in milliseconds */
  readonly ttl?: number;
  /** Tags for invalidation */
  readonly tags?: string[];
}

/** Cache statistics */
export interface CacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly size: number;
  readonly keys: number;
}

/** Cache interface */
export interface ICache {
  /** Get a value */
  get<T>(key: string): Promise<T | null>;

  /** Set a value */
  set<T>(key: string, value: T, options?: CacheOptions): Promise<void>;

  /** Delete a value */
  delete(key: string): Promise<boolean>;

  /** Check if key exists */
  has(key: string): Promise<boolean>;

  /** Clear all values */
  clear(): Promise<void>;

  /** Get multiple values */
  getMany<T>(keys: string[]): Promise<Map<string, T>>;

  /** Set multiple values */
  setMany<T>(entries: Map<string, T>, options?: CacheOptions): Promise<void>;

  /** Delete multiple values */
  deleteMany(keys: string[]): Promise<number>;

  /** Delete by tag */
  deleteByTag(tag: string): Promise<number>;

  /** Get cache statistics */
  getStats(): CacheStats;

  /** Create a namespaced cache */
  namespace(prefix: string): ICache;
}

/** Cache configuration */
export interface CacheConfig {
  readonly path: FilePath;
  readonly maxSize: number;
  readonly defaultTtl?: number;
}

// ============================================================================
// File System Types
// ============================================================================

/** File stats */
export interface FileStats {
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly size: number;
  readonly createdAt: Date;
  readonly modifiedAt: Date;
  readonly accessedAt: Date;
}

/** File system interface */
export interface IFileSystem {
  /** Check if path exists */
  exists(path: FilePath): Promise<boolean>;

  /** Get file stats */
  stat(path: FilePath): Promise<FileStats>;

  /** Read file contents */
  readFile(path: FilePath, encoding?: BufferEncoding): Promise<string>;

  /** Read file as buffer */
  readFileBuffer(path: FilePath): Promise<Buffer>;

  /** Write file contents */
  writeFile(path: FilePath, content: string | Buffer): Promise<void>;

  /** Delete file */
  deleteFile(path: FilePath): Promise<void>;

  /** Create directory */
  mkdir(path: FilePath, recursive?: boolean): Promise<void>;

  /** Remove directory */
  rmdir(path: FilePath, recursive?: boolean): Promise<void>;

  /** Read directory contents */
  readdir(path: FilePath): Promise<string[]>;

  /** Copy file */
  copyFile(src: FilePath, dest: FilePath): Promise<void>;

  /** Move file */
  moveFile(src: FilePath, dest: FilePath): Promise<void>;

  /** Watch for file changes */
  watch(
    path: FilePath,
    callback: (event: FileWatchEvent) => void
  ): Disposable;

  /** Glob files */
  glob(pattern: string, cwd?: FilePath): Promise<RelativePath[]>;

  /** Get absolute path */
  resolve(...paths: string[]): FilePath;

  /** Get relative path */
  relative(from: FilePath, to: FilePath): RelativePath;

  /** Join paths */
  join(...paths: string[]): FilePath;

  /** Get directory name */
  dirname(path: FilePath): FilePath;

  /** Get base name */
  basename(path: FilePath, ext?: string): string;

  /** Get extension */
  extname(path: FilePath): string;
}

/** File watch event */
export interface FileWatchEvent {
  readonly type: 'create' | 'change' | 'delete';
  readonly path: FilePath;
}

// ============================================================================
// Configuration Types
// ============================================================================

/** Claude configuration */
export interface ClaudeConfig {
  readonly cliPath: string;
  readonly model: 'opus' | 'sonnet' | 'haiku';
  readonly maxOutputTokens: TokenCount;
  readonly timeout: number;
}

/** GLM configuration */
export interface GLMConfig {
  readonly endpoint: string;
  readonly apiKey: string;
  readonly model: string;
  readonly maxTokens: TokenCount;
  readonly temperature: number;
}

/** Verification configuration */
export interface VerificationConfig {
  readonly enabled: boolean;
  readonly strictness: 'strict' | 'standard' | 'lenient';
  readonly preGeneration: boolean;
  readonly postGeneration: boolean;
  readonly preApply: boolean;
}

/** Protocol configuration */
export interface ProtocolConfig {
  readonly requireIntent: boolean;
  readonly enforceScope: boolean;
  readonly preflightChecks: boolean;
  readonly autoSnapshot: boolean;
  readonly impactAnalysis: boolean;
}

/** Storage configuration */
export interface StorageConfig {
  readonly databasePath: FilePath;
  readonly cachePath: FilePath;
  readonly snapshotPath: FilePath;
  readonly maxSnapshots: number;
  readonly cacheMaxSize: number;
}

/** UI configuration */
export interface UIConfig {
  readonly theme: 'auto' | 'light' | 'dark';
  readonly showVerification: boolean;
  readonly showImpactAnalysis: boolean;
  readonly confirmBeforeApply: boolean;
}

/** Claude access mode */
export type ClaudeAccessMode = 'api' | 'cli';

/** Simple LLM configuration for extension use */
export interface SimpleLLMConfig {
  readonly provider?: 'claude' | 'openai' | 'glm';
  readonly apiKey?: string;
  readonly model?: string;
  /** Claude access mode: 'api' for direct API, 'cli' for Claude Code CLI */
  readonly claudeMode?: ClaudeAccessMode;
}

/** Main AlterCode configuration */
export interface AlterCodeConfig {
  readonly projectRoot: FilePath | string;
  readonly enabled?: boolean;
  readonly claude?: ClaudeConfig;
  readonly glm?: GLMConfig;
  readonly verification?: VerificationConfig;
  readonly protocol?: ProtocolConfig;
  readonly storage?: StorageConfig;
  readonly ui?: UIConfig;
  readonly logger?: LoggerConfig;
  /** Simple LLM config for extension */
  readonly llm?: SimpleLLMConfig;
  /** Max context tokens */
  readonly maxContextTokens?: number;
  /** Log level shortcut */
  readonly logLevel?: LogLevel;
}

/** Configuration manager interface */
export interface IConfigManager {
  /** Get full configuration */
  getConfig(): AlterCodeConfig;

  /** Get a specific config section */
  get<K extends keyof AlterCodeConfig>(key: K): AlterCodeConfig[K];

  /** Update configuration */
  update<K extends keyof AlterCodeConfig>(
    key: K,
    value: Partial<AlterCodeConfig[K]>
  ): AsyncResult<void>;

  /** Reset to defaults */
  reset(): AsyncResult<void>;

  /** Watch for config changes */
  onConfigChange(callback: (config: AlterCodeConfig) => void): Disposable;
}

// ============================================================================
// Service Container Types
// ============================================================================

/** Service token for type-safe dependency injection */
export type ServiceToken<T> = symbol & { readonly __type?: T };

/** Service factory function */
export type ServiceFactory<T> = (container: IServiceContainer) => T;

/** Service lifetime */
export type ServiceLifetime = 'singleton' | 'transient' | 'scoped';

/** Service container interface */
export interface IServiceContainer {
  /** Register a service with factory */
  register<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void;

  /** Register a factory (alias for register) */
  registerFactory<T>(token: ServiceToken<T>, factory: () => T): void;

  /** Register a singleton service */
  registerSingleton<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void;

  /** Register an instance */
  registerInstance<T>(token: ServiceToken<T>, instance: T): void;

  /** Resolve a service */
  resolve<T>(token: ServiceToken<T>): T;

  /** Try to resolve a service */
  tryResolve<T>(token: ServiceToken<T>): T | null;

  /** Check if service is registered */
  isRegistered<T>(token: ServiceToken<T>): boolean;

  /** Create a scoped container */
  createScope(): IServiceScope;
}

/** Scoped service container */
export interface IServiceScope extends IServiceContainer {
  /** Dispose the scope and its services */
  dispose(): void;
}

// ============================================================================
// Storage Manager Types
// ============================================================================

/** Storage query for cross-layer queries */
export interface StorageQuery<T> {
  readonly type: 'cross-layer';
  readonly description: string;
  execute(stores: StorageStores): AsyncResult<T>;
}

/** Available storage stores */
export interface StorageStores {
  readonly knowledge: IKnowledgeStore;
  readonly protocol: IProtocolStore;
  readonly execution: IExecutionStore;
}

/** Storage manager interface */
export interface IStorageManager {
  readonly knowledge: IKnowledgeStore;
  readonly protocol: IProtocolStore;
  readonly execution: IExecutionStore;
  readonly cache: ICache;

  initialize(): AsyncResult<void>;
  close(): AsyncResult<void>;
  query<T>(query: StorageQuery<T>): AsyncResult<T>;
  transaction<T>(fn: (stores: StorageStores) => Promise<T>): AsyncResult<T>;
  vacuum(): AsyncResult<void>;
  backup(path: FilePath): AsyncResult<void>;
  restore(path: FilePath): AsyncResult<void>;
}

/** Base store interface */
export interface IStore {
  initialize(): AsyncResult<void>;
  close(): AsyncResult<void>;
  isReady(): boolean;
}

// Forward declarations for store interfaces (defined in their respective type files)
export interface IKnowledgeStore extends IStore {}
export interface IProtocolStore extends IStore {}
export interface IExecutionStore extends IStore {}

// ============================================================================
// Default Configuration
// ============================================================================

import { toFilePath, toTokenCount } from './common';

/** Default AlterCode configuration */
export const DEFAULT_CONFIG: AlterCodeConfig = {
  projectRoot: toFilePath(process.cwd()),
  enabled: true,
  claude: {
    cliPath: 'claude',
    model: 'sonnet',
    maxOutputTokens: toTokenCount(4096),
    timeout: 300000, // 5 minutes
  },
  glm: {
    endpoint: '',
    apiKey: '',
    model: 'glm-4',
    maxTokens: toTokenCount(4096),
    temperature: 0.7,
  },
  verification: {
    enabled: true,
    strictness: 'standard',
    preGeneration: true,
    postGeneration: true,
    preApply: true,
  },
  protocol: {
    requireIntent: true,
    enforceScope: true,
    preflightChecks: true,
    autoSnapshot: true,
    impactAnalysis: true,
  },
  storage: {
    databasePath: toFilePath('.altercode/altercode.db'),
    cachePath: toFilePath('.altercode/cache'),
    snapshotPath: toFilePath('.altercode/snapshots'),
    maxSnapshots: 100,
    cacheMaxSize: 100 * 1024 * 1024, // 100MB
  },
  ui: {
    theme: 'auto',
    showVerification: true,
    showImpactAnalysis: true,
    confirmBeforeApply: true,
  },
  logger: {
    level: 'info',
    output: 'console',
  },
};
