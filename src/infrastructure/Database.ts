/**
 * Database Implementation
 *
 * SQLite database wrapper using sql.js for in-memory and persistent storage.
 * Provides async interface with Result type error handling.
 */

import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';
import {
  IDatabase,
  DatabaseConfig,
  AsyncResult,
  ILogger,
  Ok,
  Err,
  DatabaseError,
  toFilePath,
  FilePath,
} from '../types';

/**
 * SQLite Database implementation using sql.js
 */
export class Database implements IDatabase {
  private db: SqlJsDatabase | null = null;
  private readonly config: DatabaseConfig;
  private readonly logger?: ILogger;
  private ready = false;
  private SQL!: typeof initSqlJs extends () => Promise<infer R> ? R : never;

  constructor(config: DatabaseConfig, logger?: ILogger) {
    this.config = config;
    this.logger = logger?.child('Database');
  }

  async initialize(): AsyncResult<void> {
    try {
      this.logger?.info('Initializing database', { path: this.config.path });

      // Initialize sql.js
      this.SQL = await initSqlJs();

      // Try to load existing database
      const dbPath = this.config.path as string;
      let dbData: Buffer | undefined;

      if (fs.existsSync(dbPath)) {
        try {
          dbData = fs.readFileSync(dbPath);
          this.logger?.debug('Loaded existing database file');
        } catch (error) {
          this.logger?.warn('Failed to load existing database, creating new', { error });
        }
      }

      // Create database instance
      this.db = new this.SQL.Database(dbData);

      // Apply pragmas
      if (this.config.walMode !== false) {
        this.db.run('PRAGMA journal_mode = WAL');
      }

      if (this.config.busyTimeout) {
        this.db.run(`PRAGMA busy_timeout = ${this.config.busyTimeout}`);
      }

      if (this.config.cacheSize) {
        this.db.run(`PRAGMA cache_size = ${this.config.cacheSize}`);
      }

      this.ready = true;
      this.logger?.info('Database initialized successfully');

      return Ok(undefined);
    } catch (error) {
      const err = new DatabaseError(
        `Failed to initialize database: ${(error as Error).message}`,
        error as Error
      );
      this.logger?.error('Database initialization failed', error as Error);
      return Err(err);
    }
  }

  async close(): AsyncResult<void> {
    try {
      if (this.db) {
        // Save to disk before closing
        await this.persist();

        this.db.close();
        this.db = null;
        this.ready = false;
        this.logger?.info('Database closed');
      }
      return Ok(undefined);
    } catch (error) {
      const err = new DatabaseError(
        `Failed to close database: ${(error as Error).message}`,
        error as Error
      );
      return Err(err);
    }
  }

  isReady(): boolean {
    return this.ready && this.db !== null;
  }

  async execute(sql: string, params?: unknown[]): AsyncResult<void> {
    if (!this.db) {
      return Err(new DatabaseError('Database not initialized'));
    }

    try {
      this.logger?.debug('Executing SQL', { sql: sql.substring(0, 100) });

      if (params && params.length > 0) {
        this.db.run(sql, params as (string | number | null | Uint8Array)[]);
      } else {
        this.db.run(sql);
      }

      return Ok(undefined);
    } catch (error) {
      const err = new DatabaseError(
        `SQL execution failed: ${(error as Error).message}`,
        error as Error
      );
      this.logger?.error('SQL execution failed', error as Error, { sql });
      return Err(err);
    }
  }

  async query<T>(sql: string, params?: unknown[]): AsyncResult<T[]> {
    if (!this.db) {
      return Err(new DatabaseError('Database not initialized'));
    }

    try {
      this.logger?.debug('Executing query', { sql: sql.substring(0, 100) });

      const stmt = this.db.prepare(sql);

      if (params && params.length > 0) {
        stmt.bind(params as (string | number | null | Uint8Array)[]);
      }

      const results: T[] = [];

      while (stmt.step()) {
        const row = stmt.getAsObject();
        results.push(row as T);
      }

      stmt.free();

      this.logger?.debug('Query completed', { rowCount: results.length });

      return Ok(results);
    } catch (error) {
      const err = new DatabaseError(
        `Query failed: ${(error as Error).message}`,
        error as Error
      );
      this.logger?.error('Query failed', error as Error, { sql });
      return Err(err);
    }
  }

  async queryOne<T>(sql: string, params?: unknown[]): AsyncResult<T | null> {
    const result = await this.query<T>(sql, params);

    if (!result.ok) {
      return result;
    }

    return Ok(result.value[0] ?? null);
  }

  async transaction<T>(fn: () => Promise<T>): AsyncResult<T> {
    if (!this.db) {
      return Err(new DatabaseError('Database not initialized'));
    }

    try {
      this.db.run('BEGIN TRANSACTION');

      try {
        const result = await fn();
        this.db.run('COMMIT');
        return Ok(result);
      } catch (error) {
        this.db.run('ROLLBACK');
        throw error;
      }
    } catch (error) {
      const err = new DatabaseError(
        `Transaction failed: ${(error as Error).message}`,
        error as Error
      );
      this.logger?.error('Transaction failed', error as Error);
      return Err(err);
    }
  }

  async vacuum(): AsyncResult<void> {
    return this.execute('VACUUM');
  }

  async backup(backupPath: FilePath): AsyncResult<void> {
    if (!this.db) {
      return Err(new DatabaseError('Database not initialized'));
    }

    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);

      // Ensure directory exists
      const dir = path.dirname(backupPath as string);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(backupPath as string, buffer);
      this.logger?.info('Database backed up', { path: backupPath });

      return Ok(undefined);
    } catch (error) {
      const err = new DatabaseError(
        `Backup failed: ${(error as Error).message}`,
        error as Error
      );
      this.logger?.error('Backup failed', error as Error);
      return Err(err);
    }
  }

  async restore(backupPath: FilePath): AsyncResult<void> {
    try {
      if (!fs.existsSync(backupPath as string)) {
        return Err(new DatabaseError(`Backup file not found: ${backupPath}`));
      }

      const data = fs.readFileSync(backupPath as string);

      // Close current database if open
      if (this.db) {
        this.db.close();
      }

      // Create new database from backup
      this.db = new this.SQL.Database(data);
      this.ready = true;

      this.logger?.info('Database restored', { path: backupPath });

      return Ok(undefined);
    } catch (error) {
      const err = new DatabaseError(
        `Restore failed: ${(error as Error).message}`,
        error as Error
      );
      this.logger?.error('Restore failed', error as Error);
      return Err(err);
    }
  }

  /**
   * Persist database to disk
   */
  async persist(): AsyncResult<void> {
    if (!this.db) {
      return Err(new DatabaseError('Database not initialized'));
    }

    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);

      const dbPath = this.config.path as string;
      const dir = path.dirname(dbPath);

      // Ensure directory exists
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(dbPath, buffer);
      this.logger?.debug('Database persisted to disk');

      return Ok(undefined);
    } catch (error) {
      const err = new DatabaseError(
        `Persist failed: ${(error as Error).message}`,
        error as Error
      );
      this.logger?.error('Persist failed', error as Error);
      return Err(err);
    }
  }

  /**
   * Get raw database instance (for advanced operations)
   */
  getRawDatabase(): SqlJsDatabase | null {
    return this.db;
  }
}

/**
 * Create a database instance
 */
export function createDatabase(config: DatabaseConfig, logger?: ILogger): IDatabase {
  return new Database(config, logger);
}

/**
 * Create an in-memory database
 */
export function createInMemoryDatabase(logger?: ILogger): IDatabase {
  return new Database({ path: toFilePath(':memory:') }, logger);
}
