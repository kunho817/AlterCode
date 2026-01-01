/**
 * Knowledge Store Implementation
 *
 * Persistent storage for knowledge layer data:
 * - Project snapshots
 * - Semantic index
 * - Conventions
 * - Error patterns
 */

import {
  IKnowledgeStore,
  IDatabase,
  ProjectSnapshot,
  SnapshotDiff,
  SemanticIndex,
  ProjectConventions,
  ErrorPattern,
  ErrorOccurrence,
  ErrorStatistics,
  SnapshotId,
  RelativePath,
  AnySymbol,
  AsyncResult,
  Ok,
  Err,
  ILogger,
  AppError,
  toRelativePath,
  toSnapshotId,
} from '../types';

/**
 * Knowledge Store implementation using SQLite
 */
export class KnowledgeStore implements IKnowledgeStore {
  private readonly database: IDatabase;
  private readonly logger?: ILogger;
  private ready = false;

  constructor(database: IDatabase, logger?: ILogger) {
    this.database = database;
    this.logger = logger?.child('KnowledgeStore');
  }

  async initialize(): AsyncResult<void> {
    try {
      this.logger?.info('Initializing knowledge store');
      this.ready = true;
      return Ok(undefined);
    } catch (error) {
      return Err(
        new AppError('INFRASTRUCTURE', `Failed to initialize: ${(error as Error).message}`)
      );
    }
  }

  async close(): AsyncResult<void> {
    this.ready = false;
    return Ok(undefined);
  }

  isReady(): boolean {
    return this.ready && this.database.isReady();
  }

  // =========================================================================
  // Project Snapshots
  // =========================================================================

  async saveSnapshot(snapshot: ProjectSnapshot): AsyncResult<void> {
    if (!this.isReady()) {
      return Err(new AppError('INFRASTRUCTURE', 'Store not ready'));
    }

    try {
      const data = JSON.stringify(snapshot);
      const sql = `
        INSERT OR REPLACE INTO project_snapshots (id, created_at, data)
        VALUES (?, ?, ?)
      `;

      return this.database.execute(sql, [
        snapshot.id,
        snapshot.timestamp.getTime(),
        data,
      ]);
    } catch (error) {
      return Err(
        new AppError('INFRASTRUCTURE', `Failed to save snapshot: ${(error as Error).message}`)
      );
    }
  }

  async getLatestSnapshot(): AsyncResult<ProjectSnapshot | null> {
    if (!this.isReady()) {
      return Err(new AppError('INFRASTRUCTURE', 'Store not ready'));
    }

    try {
      const sql = `
        SELECT data FROM project_snapshots
        ORDER BY created_at DESC
        LIMIT 1
      `;

      const result = await this.database.queryOne<{ data: string }>(sql);
      if (!result.ok) return result;

      if (!result.value) {
        return Ok(null);
      }

      const snapshot = this.deserializeSnapshot(result.value.data);
      return Ok(snapshot);
    } catch (error) {
      return Err(
        new AppError('INFRASTRUCTURE', `Failed to get snapshot: ${(error as Error).message}`)
      );
    }
  }

  async getSnapshot(id: SnapshotId): AsyncResult<ProjectSnapshot | null> {
    if (!this.isReady()) {
      return Err(new AppError('INFRASTRUCTURE', 'Store not ready'));
    }

    try {
      const sql = `SELECT data FROM project_snapshots WHERE id = ?`;
      const result = await this.database.queryOne<{ data: string }>(sql, [id]);

      if (!result.ok) return result;
      if (!result.value) return Ok(null);

      const snapshot = this.deserializeSnapshot(result.value.data);
      return Ok(snapshot);
    } catch (error) {
      return Err(
        new AppError('INFRASTRUCTURE', `Failed to get snapshot: ${(error as Error).message}`)
      );
    }
  }

  async listSnapshots(limit = 10): AsyncResult<ProjectSnapshot[]> {
    if (!this.isReady()) {
      return Err(new AppError('INFRASTRUCTURE', 'Store not ready'));
    }

    try {
      const sql = `
        SELECT data FROM project_snapshots
        ORDER BY created_at DESC
        LIMIT ?
      `;

      const result = await this.database.query<{ data: string }>(sql, [limit]);
      if (!result.ok) return result;

      const snapshots = result.value.map((row) => this.deserializeSnapshot(row.data));
      return Ok(snapshots);
    } catch (error) {
      return Err(
        new AppError('INFRASTRUCTURE', `Failed to list snapshots: ${(error as Error).message}`)
      );
    }
  }

  async diffSnapshots(from: SnapshotId, to: SnapshotId): AsyncResult<SnapshotDiff> {
    const fromResult = await this.getSnapshot(from);
    const toResult = await this.getSnapshot(to);

    if (!fromResult.ok) return fromResult;
    if (!toResult.ok) return toResult;
    if (!fromResult.value || !toResult.value) {
      return Err(new AppError('NOT_FOUND', 'Snapshot not found'));
    }

    const fromSnapshot = fromResult.value;
    const toSnapshot = toResult.value;

    // Build file sets
    const fromFiles = this.collectFiles(fromSnapshot.fileTree);
    const toFiles = this.collectFiles(toSnapshot.fileTree);

    const filesAdded = [...toFiles].filter((f) => !fromFiles.has(f)).map(toRelativePath);
    const filesDeleted = [...fromFiles].filter((f) => !toFiles.has(f)).map(toRelativePath);
    const filesModified: RelativePath[] = []; // Would need content comparison

    // Check dependencies
    const dependenciesChanged =
      fromSnapshot.lockfileHash !== toSnapshot.lockfileHash;

    // Check configs
    const configsChanged: string[] = [];
    if (JSON.stringify(fromSnapshot.configs) !== JSON.stringify(toSnapshot.configs)) {
      configsChanged.push('configs');
    }

    return Ok({
      from,
      to,
      filesAdded,
      filesModified,
      filesDeleted,
      dependenciesChanged,
      configsChanged,
    });
  }

  // =========================================================================
  // Semantic Index
  // =========================================================================

  async saveIndex(index: SemanticIndex): AsyncResult<void> {
    if (!this.isReady()) {
      return Err(new AppError('INFRASTRUCTURE', 'Store not ready'));
    }

    try {
      const data = this.serializeIndex(index);
      const sql = `
        INSERT OR REPLACE INTO semantic_index (id, snapshot_id, created_at, data)
        VALUES ('current', 'current', ?, ?)
      `;

      return this.database.execute(sql, [index.lastUpdated.getTime(), data]);
    } catch (error) {
      return Err(
        new AppError('INFRASTRUCTURE', `Failed to save index: ${(error as Error).message}`)
      );
    }
  }

  async getIndex(): AsyncResult<SemanticIndex | null> {
    if (!this.isReady()) {
      return Err(new AppError('INFRASTRUCTURE', 'Store not ready'));
    }

    try {
      const sql = `SELECT data FROM semantic_index WHERE id = 'current'`;
      const result = await this.database.queryOne<{ data: string }>(sql);

      if (!result.ok) return result;
      if (!result.value) return Ok(null);

      const index = this.deserializeIndex(result.value.data);
      return Ok(index);
    } catch (error) {
      return Err(
        new AppError('INFRASTRUCTURE', `Failed to get index: ${(error as Error).message}`)
      );
    }
  }

  async updateIndexFile(path: RelativePath, symbols: AnySymbol[]): AsyncResult<void> {
    // This would update the index incrementally
    // For now, just trigger a full rebuild
    return Ok(undefined);
  }

  async removeIndexFile(path: RelativePath): AsyncResult<void> {
    // This would remove a file from the index
    return Ok(undefined);
  }

  // =========================================================================
  // Conventions
  // =========================================================================

  async saveConventions(conventions: ProjectConventions): AsyncResult<void> {
    if (!this.isReady()) {
      return Err(new AppError('INFRASTRUCTURE', 'Store not ready'));
    }

    try {
      const data = JSON.stringify(conventions);
      const sql = `
        INSERT OR REPLACE INTO conventions (id, snapshot_id, created_at, data)
        VALUES ('current', 'current', ?, ?)
      `;

      return this.database.execute(sql, [conventions.lastAnalyzed.getTime(), data]);
    } catch (error) {
      return Err(
        new AppError('INFRASTRUCTURE', `Failed to save conventions: ${(error as Error).message}`)
      );
    }
  }

  async getConventions(): AsyncResult<ProjectConventions | null> {
    if (!this.isReady()) {
      return Err(new AppError('INFRASTRUCTURE', 'Store not ready'));
    }

    try {
      const sql = `SELECT data FROM conventions WHERE id = 'current'`;
      const result = await this.database.queryOne<{ data: string }>(sql);

      if (!result.ok) return result;
      if (!result.value) return Ok(null);

      const conventions = JSON.parse(result.value.data) as ProjectConventions;
      conventions.detected; // Type check
      return Ok(conventions);
    } catch (error) {
      return Err(
        new AppError('INFRASTRUCTURE', `Failed to get conventions: ${(error as Error).message}`)
      );
    }
  }

  // =========================================================================
  // Error Memory
  // =========================================================================

  async saveErrorPattern(pattern: ErrorPattern): AsyncResult<void> {
    if (!this.isReady()) {
      return Err(new AppError('INFRASTRUCTURE', 'Store not ready'));
    }

    try {
      const occurrences = JSON.stringify([]);
      const sql = `
        INSERT OR REPLACE INTO error_patterns (id, pattern, occurrences, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `;

      return this.database.execute(sql, [
        pattern.id,
        JSON.stringify(pattern),
        occurrences,
        pattern.firstSeen.getTime(),
        pattern.lastSeen.getTime(),
      ]);
    } catch (error) {
      return Err(
        new AppError('INFRASTRUCTURE', `Failed to save pattern: ${(error as Error).message}`)
      );
    }
  }

  async getErrorPattern(id: string): AsyncResult<ErrorPattern | null> {
    if (!this.isReady()) {
      return Err(new AppError('INFRASTRUCTURE', 'Store not ready'));
    }

    try {
      const sql = `SELECT pattern FROM error_patterns WHERE id = ?`;
      const result = await this.database.queryOne<{ pattern: string }>(sql, [id]);

      if (!result.ok) return result;
      if (!result.value) return Ok(null);

      const pattern = JSON.parse(result.value.pattern) as ErrorPattern;
      return Ok(pattern);
    } catch (error) {
      return Err(
        new AppError('INFRASTRUCTURE', `Failed to get pattern: ${(error as Error).message}`)
      );
    }
  }

  async listErrorPatterns(): AsyncResult<ErrorPattern[]> {
    if (!this.isReady()) {
      return Err(new AppError('INFRASTRUCTURE', 'Store not ready'));
    }

    try {
      const sql = `SELECT pattern FROM error_patterns ORDER BY updated_at DESC`;
      const result = await this.database.query<{ pattern: string }>(sql);

      if (!result.ok) return result;

      const patterns = result.value.map((row) => JSON.parse(row.pattern) as ErrorPattern);
      return Ok(patterns);
    } catch (error) {
      return Err(
        new AppError('INFRASTRUCTURE', `Failed to list patterns: ${(error as Error).message}`)
      );
    }
  }

  async recordErrorOccurrence(occurrence: ErrorOccurrence): AsyncResult<void> {
    // For now, just update the pattern's last seen time
    const pattern = await this.getErrorPattern(occurrence.patternId);
    if (pattern.ok && pattern.value) {
      const updated = {
        ...pattern.value,
        lastSeen: occurrence.timestamp,
      };
      await this.saveErrorPattern(updated);
    }
    return Ok(undefined);
  }

  async getErrorStatistics(): AsyncResult<ErrorStatistics> {
    const patternsResult = await this.listErrorPatterns();
    if (!patternsResult.ok) return patternsResult;

    const patterns = patternsResult.value;
    const errorsByCategory: Record<string, number> = {};
    let totalErrors = 0;

    for (const pattern of patterns) {
      totalErrors += pattern.occurrences;
      errorsByCategory[pattern.category] =
        (errorsByCategory[pattern.category] ?? 0) + pattern.occurrences;
    }

    return Ok({
      totalErrors,
      errorsByCategory: errorsByCategory as ErrorStatistics['errorsByCategory'],
      errorsByAgent: {},
      averageResolutionTime: 0,
      topPatterns: patterns.slice(0, 10),
    });
  }

  // =========================================================================
  // Helper Methods
  // =========================================================================

  private deserializeSnapshot(data: string): ProjectSnapshot {
    const obj = JSON.parse(data);
    return {
      ...obj,
      id: toSnapshotId(obj.id),
      timestamp: new Date(obj.timestamp),
      git: obj.git
        ? {
            ...obj.git,
            recentCommits: obj.git.recentCommits.map((c: { date: string }) => ({
              ...c,
              date: new Date(c.date),
            })),
          }
        : null,
    };
  }

  private serializeIndex(index: SemanticIndex): string {
    // Convert Maps to arrays for JSON serialization
    const serializable = {
      ...index,
      symbols: {
        functions: Array.from(index.symbols.functions.entries()),
        classes: Array.from(index.symbols.classes.entries()),
        interfaces: Array.from(index.symbols.interfaces.entries()),
        types: Array.from(index.symbols.types.entries()),
        variables: Array.from(index.symbols.variables.entries()),
        enums: Array.from(index.symbols.enums.entries()),
      },
      fileSymbols: Array.from(index.fileSymbols.entries()),
      fileImports: Array.from(index.fileImports.entries()),
      fileExports: Array.from(index.fileExports.entries()),
      imports: Array.from(index.imports.entries()),
      exports: Array.from(index.exports.entries()),
      calls: Array.from(index.calls.entries()),
      inheritance: Array.from(index.inheritance.entries()),
    };

    return JSON.stringify(serializable);
  }

  private deserializeIndex(data: string): SemanticIndex {
    const obj = JSON.parse(data);

    return {
      ...obj,
      lastUpdated: new Date(obj.lastUpdated),
      symbols: {
        functions: new Map(obj.symbols.functions),
        classes: new Map(obj.symbols.classes),
        interfaces: new Map(obj.symbols.interfaces),
        types: new Map(obj.symbols.types),
        variables: new Map(obj.symbols.variables),
        enums: new Map(obj.symbols.enums),
      },
      fileSymbols: new Map(obj.fileSymbols),
      fileImports: new Map(obj.fileImports),
      fileExports: new Map(obj.fileExports),
      imports: new Map(obj.imports),
      exports: new Map(obj.exports),
      calls: new Map(obj.calls),
      inheritance: new Map(obj.inheritance),
    };
  }

  private collectFiles(
    tree: import('../types').FileTreeNode[],
    prefix = ''
  ): Set<string> {
    const files = new Set<string>();

    for (const node of tree) {
      const path = prefix ? `${prefix}/${node.path}` : (node.path as string);

      if (node.type === 'file') {
        files.add(path);
      } else if (node.children) {
        const childFiles = this.collectFiles(node.children, path);
        for (const f of childFiles) {
          files.add(f);
        }
      }
    }

    return files;
  }
}

/**
 * Create a knowledge store
 */
export function createKnowledgeStore(database: IDatabase, logger?: ILogger): IKnowledgeStore {
  return new KnowledgeStore(database, logger);
}
