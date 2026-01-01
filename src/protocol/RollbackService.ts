/**
 * Rollback Service
 *
 * Manages file backups and rollback capabilities:
 * - Creates snapshots before changes
 * - Supports per-mission rollback
 * - Maintains backup history
 * - Provides selective file restoration
 */

import {
  IRollbackService,
  IFileSystem,
  FileBackup,
  RollbackPoint,
  ExtendedRollbackPoint,
  FilePath,
  MissionId,
  TaskId,
  AsyncResult,
  Ok,
  Err,
  ILogger,
  AppError,
  toFilePath,
} from '../types';

/** Maximum backups to keep per mission */
const MAX_BACKUPS_PER_MISSION = 50;

/** Maximum total backup size (50MB) */
const MAX_TOTAL_BACKUP_SIZE = 50 * 1024 * 1024;

/**
 * Rollback Service implementation
 */
export class RollbackService implements IRollbackService {
  private readonly fileSystem: IFileSystem;
  private readonly projectRoot: FilePath;
  private readonly logger?: ILogger;

  // Backups organized by mission
  private backups: Map<string, FileBackup[]> = new Map();

  // Rollback points
  private rollbackPoints: Map<string, RollbackPoint> = new Map();

  // Total backup size tracking
  private totalBackupSize: number = 0;

  constructor(fileSystem: IFileSystem, projectRoot: FilePath, logger?: ILogger) {
    this.fileSystem = fileSystem;
    this.projectRoot = projectRoot;
    this.logger = logger?.child('RollbackService');
  }

  async backup(
    paths: FilePath[],
    missionId: MissionId,
    taskId?: TaskId
  ): AsyncResult<RollbackPoint> {
    const pointId = this.generatePointId();
    const timestamp = new Date();

    this.logger?.info('Creating backup', {
      pointId,
      missionId,
      fileCount: paths.length,
    });

    try {
      const fileBackups: FileBackup[] = [];

      for (const path of paths) {
        const backup = await this.backupFile(path, missionId, taskId);
        if (backup) {
          fileBackups.push(backup);
        }
      }

      // Create rollback point
      const point: RollbackPoint = {
        id: pointId,
        missionId,
        taskId,
        timestamp,
        files: fileBackups.map((b) => toFilePath(b.path)),
        description: `Backup for ${fileBackups.length} files`,
      };

      this.rollbackPoints.set(pointId, point);

      // Enforce limits
      this.enforceBackupLimits(missionId as string);

      this.logger?.info('Backup created', {
        pointId,
        fileCount: fileBackups.length,
        totalSize: fileBackups.reduce((sum, b) => sum + (b.size ?? 0), 0),
      });

      return Ok(point);
    } catch (error) {
      this.logger?.error('Backup failed', error as Error);
      return Err(
        new AppError('ROLLBACK', `Backup failed: ${(error as Error).message}`)
      );
    }
  }

  async rollback(pointId: string): AsyncResult<string[]> {
    const point = this.rollbackPoints.get(pointId);

    if (!point) {
      return Err(new AppError('ROLLBACK', `Rollback point not found: ${pointId}`));
    }

    this.logger?.info('Starting rollback', {
      pointId,
      missionId: point.missionId,
      fileCount: point.files.length,
    });

    try {
      const restoredFiles: string[] = [];
      const missionBackups = this.backups.get(point.missionId as string) ?? [];

      for (const filePath of point.files) {
        // Find the backup for this file at or before the rollback point
        const backup = this.findBackupForPoint(
          missionBackups,
          filePath as string,
          point.timestamp
        );

        if (backup) {
          await this.restoreFile(backup);
          restoredFiles.push(filePath as string);
        } else {
          this.logger?.warn('No backup found for file', { filePath, pointId });
        }
      }

      this.logger?.info('Rollback complete', {
        pointId,
        restoredCount: restoredFiles.length,
      });

      return Ok(restoredFiles);
    } catch (error) {
      this.logger?.error('Rollback failed', error as Error);
      return Err(
        new AppError('ROLLBACK', `Rollback failed: ${(error as Error).message}`)
      );
    }
  }

  async restore(path: FilePath, missionId: MissionId): AsyncResult<void> {
    const missionBackups = this.backups.get(missionId as string) ?? [];

    // Find the most recent backup for this file
    const backup = missionBackups
      .filter((b) => b.path === (path as string))
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

    if (!backup) {
      return Err(
        new AppError('ROLLBACK', `No backup found for file: ${path}`)
      );
    }

    try {
      await this.restoreFile(backup);
      return Ok(undefined);
    } catch (error) {
      return Err(
        new AppError('ROLLBACK', `Restore failed: ${(error as Error).message}`)
      );
    }
  }

  getHistory(missionId: MissionId): RollbackPoint[] {
    const points = Array.from(this.rollbackPoints.values())
      .filter((p) => p.missionId === missionId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return points;
  }

  /**
   * Backup a single file
   */
  private async backupFile(
    path: FilePath,
    missionId: MissionId,
    taskId?: TaskId
  ): Promise<FileBackup | null> {
    const pathStr = path as string;

    try {
      const exists = await this.fileSystem.exists(path);

      let content: string | undefined;
      let size: number | undefined;

      if (exists) {
        content = await this.fileSystem.readFile(path);
        size = new TextEncoder().encode(content).length;

        // Check total size limit
        if (this.totalBackupSize + size > MAX_TOTAL_BACKUP_SIZE) {
          this.logger?.warn('Backup size limit reached, pruning old backups');
          this.pruneOldBackups();
        }

        this.totalBackupSize += size;
      }

      const backup: FileBackup = {
        path: pathStr,
        content,
        existed: exists,
        timestamp: new Date(),
        missionId,
        taskId,
        size,
      };

      // Store backup
      const missionBackups = this.backups.get(missionId as string) ?? [];
      missionBackups.push(backup);
      this.backups.set(missionId as string, missionBackups);

      return backup;
    } catch (error) {
      this.logger?.error('Failed to backup file', error as Error, { path });
      return null;
    }
  }

  /**
   * Restore a file from backup
   */
  private async restoreFile(backup: FileBackup): Promise<void> {
    const path = toFilePath(backup.path);

    if (!backup.existed) {
      // File didn't exist before - delete it
      const exists = await this.fileSystem.exists(path);
      if (exists) {
        await this.fileSystem.deleteFile(path);
        this.logger?.debug('Deleted file (restored to non-existent state)', {
          path: backup.path,
        });
      }
    } else if (backup.content !== undefined) {
      // File existed - restore content
      await this.fileSystem.writeFile(path, backup.content);
      this.logger?.debug('Restored file content', { path: backup.path });
    }
  }

  /**
   * Find backup for a file at or before a timestamp
   */
  private findBackupForPoint(
    backups: FileBackup[],
    path: string,
    timestamp: Date
  ): FileBackup | null {
    const candidates = backups
      .filter(
        (b) => b.path === path && b.timestamp.getTime() <= timestamp.getTime()
      )
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return candidates[0] ?? null;
  }

  /**
   * Enforce backup limits
   */
  private enforceBackupLimits(missionId: string): void {
    const missionBackups = this.backups.get(missionId) ?? [];

    if (missionBackups.length > MAX_BACKUPS_PER_MISSION) {
      // Remove oldest backups
      const toRemove = missionBackups.length - MAX_BACKUPS_PER_MISSION;
      const removed = missionBackups.splice(0, toRemove);

      // Update total size
      for (const backup of removed) {
        if (backup.size) {
          this.totalBackupSize -= backup.size;
        }
      }

      this.logger?.debug('Pruned old backups', { missionId, count: toRemove });
    }
  }

  /**
   * Prune old backups across all missions
   */
  private pruneOldBackups(): void {
    // Get all backups sorted by timestamp
    const allBackups: Array<{ missionId: string; backup: FileBackup; index: number }> = [];

    for (const [missionId, backups] of this.backups) {
      for (let i = 0; i < backups.length; i++) {
        const backup = backups[i];
        if (backup) {
          allBackups.push({ missionId, backup, index: i });
        }
      }
    }

    allBackups.sort((a, b) => a.backup.timestamp.getTime() - b.backup.timestamp.getTime());

    // Remove oldest 20% of backups
    const toRemove = Math.ceil(allBackups.length * 0.2);

    for (let i = 0; i < toRemove && i < allBackups.length; i++) {
      const entry = allBackups[i];
      if (!entry) continue;
      const { missionId, backup } = entry;
      const missionBackups = this.backups.get(missionId);

      if (missionBackups) {
        const idx = missionBackups.indexOf(backup);
        if (idx >= 0) {
          missionBackups.splice(idx, 1);
          if (backup.size) {
            this.totalBackupSize -= backup.size;
          }
        }
      }
    }

    this.logger?.info('Pruned old backups', {
      removed: toRemove,
      newTotalSize: this.totalBackupSize,
    });
  }

  /**
   * Generate unique point ID
   */
  private generatePointId(): string {
    return `rp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Clear backups for a mission
   */
  clearMission(missionId: MissionId): void {
    const missionBackups = this.backups.get(missionId as string) ?? [];

    // Update total size
    for (const backup of missionBackups) {
      if (backup.size) {
        this.totalBackupSize -= backup.size;
      }
    }

    this.backups.delete(missionId as string);

    // Remove rollback points
    for (const [pointId, point] of this.rollbackPoints) {
      if (point.missionId === missionId) {
        this.rollbackPoints.delete(pointId);
      }
    }

    this.logger?.info('Cleared mission backups', { missionId });
  }

  /**
   * Get backup statistics
   */
  getStats(): {
    totalSize: number;
    missionCount: number;
    backupCount: number;
    pointCount: number;
  } {
    let backupCount = 0;
    for (const backups of this.backups.values()) {
      backupCount += backups.length;
    }

    return {
      totalSize: this.totalBackupSize,
      missionCount: this.backups.size,
      backupCount,
      pointCount: this.rollbackPoints.size,
    };
  }

  /**
   * Create a named rollback point
   */
  createNamedPoint(
    missionId: MissionId,
    name: string,
    description?: string
  ): RollbackPoint {
    const missionBackups = this.backups.get(missionId as string) ?? [];
    const files = [...new Set(missionBackups.map((b) => toFilePath(b.path)))];

    const point: RollbackPoint = {
      id: `named-${name}-${Date.now()}`,
      missionId,
      timestamp: new Date(),
      files,
      description: description ?? `Named point: ${name}`,
    };

    this.rollbackPoints.set(point.id, point);
    return point;
  }

  /**
   * Check if file has backups
   */
  hasBackup(path: FilePath, missionId: MissionId): boolean {
    const missionBackups = this.backups.get(missionId as string) ?? [];
    return missionBackups.some((b) => b.path === (path as string));
  }

  /**
   * Get file backup history
   */
  getFileHistory(path: FilePath, missionId: MissionId): FileBackup[] {
    const missionBackups = this.backups.get(missionId as string) ?? [];
    return missionBackups
      .filter((b) => b.path === (path as string))
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }
}

/**
 * Create a rollback service
 */
export function createRollbackService(
  fileSystem: IFileSystem,
  projectRoot: FilePath,
  logger?: ILogger
): IRollbackService {
  return new RollbackService(fileSystem, projectRoot, logger);
}
