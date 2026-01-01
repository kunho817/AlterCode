/**
 * Storage Manager Implementation
 *
 * Unified storage manager that coordinates all storage layers
 * and provides cross-layer query capabilities.
 */

import {
  IStorageManager,
  IKnowledgeStore,
  IProtocolStore,
  IExecutionStore,
  ICache,
  IDatabase,
  StorageStores,
  StorageQuery,
  AsyncResult,
  Ok,
  Err,
  FilePath,
  ILogger,
  DatabaseError,
  StorageConfig,
} from '../types';

/**
 * Storage Manager implementation
 */
export class StorageManager implements IStorageManager {
  private readonly database: IDatabase;
  private readonly logger?: ILogger;
  private readonly config: StorageConfig;
  private _knowledge!: IKnowledgeStore;
  private _protocol!: IProtocolStore;
  private _execution!: IExecutionStore;
  private _cache!: ICache;
  private ready = false;

  constructor(
    database: IDatabase,
    cache: ICache,
    config: StorageConfig,
    logger?: ILogger
  ) {
    this.database = database;
    this._cache = cache;
    this.config = config;
    this.logger = logger?.child('StorageManager');
  }

  get knowledge(): IKnowledgeStore {
    if (!this._knowledge) {
      throw new Error('StorageManager not initialized - knowledge store unavailable');
    }
    return this._knowledge;
  }

  get protocol(): IProtocolStore {
    if (!this._protocol) {
      throw new Error('StorageManager not initialized - protocol store unavailable');
    }
    return this._protocol;
  }

  get execution(): IExecutionStore {
    if (!this._execution) {
      throw new Error('StorageManager not initialized - execution store unavailable');
    }
    return this._execution;
  }

  get cache(): ICache {
    return this._cache;
  }

  /**
   * Set the knowledge store (called during initialization)
   */
  setKnowledgeStore(store: IKnowledgeStore): void {
    this._knowledge = store;
  }

  /**
   * Set the protocol store (called during initialization)
   */
  setProtocolStore(store: IProtocolStore): void {
    this._protocol = store;
  }

  /**
   * Set the execution store (called during initialization)
   */
  setExecutionStore(store: IExecutionStore): void {
    this._execution = store;
  }

  async initialize(): AsyncResult<void> {
    try {
      this.logger?.info('Initializing storage manager');

      // Initialize database
      const dbResult = await this.database.initialize();
      if (!dbResult.ok) {
        return dbResult;
      }

      // Create common tables/schema
      await this.initializeSchema();

      this.ready = true;
      this.logger?.info('Storage manager initialized');

      return Ok(undefined);
    } catch (error) {
      this.logger?.error('Failed to initialize storage manager', error as Error);
      return Err(
        new DatabaseError(
          `Failed to initialize storage manager: ${(error as Error).message}`,
          error as Error
        )
      );
    }
  }

  async close(): AsyncResult<void> {
    try {
      this.logger?.info('Closing storage manager');

      // Close individual stores
      if (this._knowledge?.isReady()) {
        await this._knowledge.close();
      }
      if (this._protocol?.isReady()) {
        await this._protocol.close();
      }
      if (this._execution?.isReady()) {
        await this._execution.close();
      }

      // Close database
      await this.database.close();

      this.ready = false;
      this.logger?.info('Storage manager closed');

      return Ok(undefined);
    } catch (error) {
      return Err(
        new DatabaseError(
          `Failed to close storage manager: ${(error as Error).message}`,
          error as Error
        )
      );
    }
  }

  async query<T>(query: StorageQuery<T>): AsyncResult<T> {
    if (!this.ready) {
      return Err(new DatabaseError('Storage manager not initialized'));
    }

    try {
      this.logger?.debug('Executing cross-layer query', {
        description: query.description,
      });

      const stores: StorageStores = {
        knowledge: this._knowledge,
        protocol: this._protocol,
        execution: this._execution,
      };

      return await query.execute(stores);
    } catch (error) {
      return Err(
        new DatabaseError(
          `Query failed: ${(error as Error).message}`,
          error as Error
        )
      );
    }
  }

  async transaction<T>(fn: (stores: StorageStores) => Promise<T>): AsyncResult<T> {
    if (!this.ready) {
      return Err(new DatabaseError('Storage manager not initialized'));
    }

    return this.database.transaction(async () => {
      const stores: StorageStores = {
        knowledge: this._knowledge,
        protocol: this._protocol,
        execution: this._execution,
      };

      return fn(stores);
    });
  }

  async vacuum(): AsyncResult<void> {
    if (!this.ready) {
      return Err(new DatabaseError('Storage manager not initialized'));
    }

    this.logger?.info('Running vacuum on database');
    return this.database.vacuum();
  }

  async backup(path: FilePath): AsyncResult<void> {
    if (!this.ready) {
      return Err(new DatabaseError('Storage manager not initialized'));
    }

    this.logger?.info('Creating database backup', { path });
    return this.database.backup(path);
  }

  async restore(path: FilePath): AsyncResult<void> {
    this.logger?.info('Restoring database from backup', { path });

    const result = await this.database.restore(path);
    if (result.ok) {
      // Re-initialize stores after restore
      await this.initializeSchema();
    }

    return result;
  }

  /**
   * Check if storage manager is ready
   */
  isReady(): boolean {
    return this.ready;
  }

  /**
   * Initialize database schema
   */
  private async initializeSchema(): AsyncResult<void> {
    // Create metadata table for tracking schema version
    const metadataTable = `
      CREATE TABLE IF NOT EXISTS _metadata (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at INTEGER
      )
    `;

    let result = await this.database.execute(metadataTable);
    if (!result.ok) return result;

    // Create knowledge layer tables
    const knowledgeTables = `
      CREATE TABLE IF NOT EXISTS project_snapshots (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        data TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS semantic_index (
        id TEXT PRIMARY KEY,
        snapshot_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        data TEXT NOT NULL,
        FOREIGN KEY (snapshot_id) REFERENCES project_snapshots(id)
      );

      CREATE TABLE IF NOT EXISTS conventions (
        id TEXT PRIMARY KEY,
        snapshot_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        data TEXT NOT NULL,
        FOREIGN KEY (snapshot_id) REFERENCES project_snapshots(id)
      );

      CREATE TABLE IF NOT EXISTS error_patterns (
        id TEXT PRIMARY KEY,
        pattern TEXT NOT NULL,
        occurrences TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `;

    result = await this.database.execute(knowledgeTables);
    if (!result.ok) return result;

    // Create protocol layer tables
    const protocolTables = `
      CREATE TABLE IF NOT EXISTS intents (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS rollback_snapshots (
        id TEXT PRIMARY KEY,
        intent_id TEXT NOT NULL,
        status TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (intent_id) REFERENCES intents(id)
      );

      CREATE TABLE IF NOT EXISTS checklists (
        id TEXT PRIMARY KEY,
        intent_id TEXT NOT NULL,
        status TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        completed_at INTEGER,
        FOREIGN KEY (intent_id) REFERENCES intents(id)
      );
    `;

    result = await this.database.execute(protocolTables);
    if (!result.ok) return result;

    // Create execution layer tables
    const executionTables = `
      CREATE TABLE IF NOT EXISTS missions (
        id TEXT PRIMARY KEY,
        intent_id TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        mode TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER,
        FOREIGN KEY (intent_id) REFERENCES intents(id)
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        mission_id TEXT NOT NULL,
        parent_task_id TEXT,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        priority INTEGER NOT NULL,
        title TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER,
        FOREIGN KEY (mission_id) REFERENCES missions(id),
        FOREIGN KEY (parent_task_id) REFERENCES tasks(id)
      );

      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        level TEXT NOT NULL,
        role TEXT NOT NULL,
        model TEXT NOT NULL,
        status TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_mission ON tasks(mission_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_missions_status ON missions(status);
      CREATE INDEX IF NOT EXISTS idx_intents_status ON intents(status);
    `;

    result = await this.database.execute(executionTables);
    if (!result.ok) return result;

    this.logger?.debug('Database schema initialized');
    return Ok(undefined);
  }
}

/**
 * Create a storage manager
 */
export function createStorageManager(
  database: IDatabase,
  cache: ICache,
  config: StorageConfig,
  logger?: ILogger
): StorageManager {
  return new StorageManager(database, cache, config, logger);
}
