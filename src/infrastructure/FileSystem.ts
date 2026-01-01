/**
 * File System Implementation
 *
 * Provides a unified file system interface with async operations,
 * file watching, and glob support.
 */

import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as nodePath from 'path';
import { glob as globby } from 'glob';
import {
  IFileSystem,
  FileStats,
  FileWatchEvent,
  Disposable,
  FilePath,
  RelativePath,
  toFilePath,
  toRelativePath,
  ILogger,
} from '../types';

/**
 * File System implementation using Node.js fs module
 */
export class FileSystem implements IFileSystem {
  private readonly logger?: ILogger;
  private readonly watchers: Map<string, fs.FSWatcher> = new Map();

  constructor(logger?: ILogger) {
    this.logger = logger?.child('FileSystem');
  }

  async exists(path: FilePath): Promise<boolean> {
    try {
      await fsPromises.access(path as string);
      return true;
    } catch {
      return false;
    }
  }

  async stat(path: FilePath): Promise<FileStats> {
    const stats = await fsPromises.stat(path as string);
    return {
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      size: stats.size,
      createdAt: stats.birthtime,
      modifiedAt: stats.mtime,
      accessedAt: stats.atime,
    };
  }

  async readFile(path: FilePath, encoding: BufferEncoding = 'utf-8'): Promise<string> {
    return fsPromises.readFile(path as string, { encoding });
  }

  async readFileBuffer(path: FilePath): Promise<Buffer> {
    return fsPromises.readFile(path as string);
  }

  async writeFile(path: FilePath, content: string | Buffer): Promise<void> {
    // Ensure directory exists
    const dir = nodePath.dirname(path as string);
    await this.mkdir(toFilePath(dir), true);

    await fsPromises.writeFile(path as string, content);
    this.logger?.debug('File written', { path });
  }

  async deleteFile(path: FilePath): Promise<void> {
    await fsPromises.unlink(path as string);
    this.logger?.debug('File deleted', { path });
  }

  async mkdir(path: FilePath, recursive = false): Promise<void> {
    await fsPromises.mkdir(path as string, { recursive });
  }

  async rmdir(path: FilePath, recursive = false): Promise<void> {
    if (recursive) {
      await fsPromises.rm(path as string, { recursive: true, force: true });
    } else {
      await fsPromises.rmdir(path as string);
    }
  }

  async readdir(path: FilePath): Promise<string[]> {
    return fsPromises.readdir(path as string);
  }

  async copyFile(src: FilePath, dest: FilePath): Promise<void> {
    // Ensure destination directory exists
    const dir = nodePath.dirname(dest as string);
    await this.mkdir(toFilePath(dir), true);

    await fsPromises.copyFile(src as string, dest as string);
    this.logger?.debug('File copied', { src, dest });
  }

  async moveFile(src: FilePath, dest: FilePath): Promise<void> {
    // Ensure destination directory exists
    const dir = nodePath.dirname(dest as string);
    await this.mkdir(toFilePath(dir), true);

    await fsPromises.rename(src as string, dest as string);
    this.logger?.debug('File moved', { src, dest });
  }

  watch(path: FilePath, callback: (event: FileWatchEvent) => void): Disposable {
    const pathStr = path as string;
    const key = pathStr;

    // Close existing watcher if any
    const existingWatcher = this.watchers.get(key);
    if (existingWatcher) {
      existingWatcher.close();
    }

    const watcher = fs.watch(pathStr, { recursive: true }, (eventType, filename) => {
      if (!filename) return;

      const fullPath = nodePath.join(pathStr, filename);
      let eventTypeNormalized: FileWatchEvent['type'];

      if (eventType === 'rename') {
        // Check if file exists to determine create vs delete
        if (fs.existsSync(fullPath)) {
          eventTypeNormalized = 'create';
        } else {
          eventTypeNormalized = 'delete';
        }
      } else {
        eventTypeNormalized = 'change';
      }

      callback({
        type: eventTypeNormalized,
        path: toFilePath(fullPath),
      });
    });

    this.watchers.set(key, watcher);
    this.logger?.debug('Started watching', { path });

    return {
      dispose: () => {
        watcher.close();
        this.watchers.delete(key);
        this.logger?.debug('Stopped watching', { path });
      },
    };
  }

  async glob(pattern: string, cwd?: FilePath): Promise<RelativePath[]> {
    const results = await globby(pattern, {
      cwd: cwd as string | undefined,
      dot: false,
      ignore: ['**/node_modules/**', '**/.git/**'],
    });

    return results.map((r: string) => toRelativePath(r));
  }

  resolve(...paths: string[]): FilePath {
    return toFilePath(nodePath.resolve(...paths));
  }

  relative(from: FilePath, to: FilePath): RelativePath {
    return toRelativePath(nodePath.relative(from as string, to as string));
  }

  join(...paths: string[]): FilePath {
    return toFilePath(nodePath.join(...paths));
  }

  dirname(path: FilePath): FilePath {
    return toFilePath(nodePath.dirname(path as string));
  }

  basename(path: FilePath, ext?: string): string {
    return nodePath.basename(path as string, ext);
  }

  extname(path: FilePath): string {
    return nodePath.extname(path as string);
  }

  /**
   * Dispose all watchers
   */
  dispose(): void {
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
  }

  /**
   * Read file if exists, return null otherwise
   */
  async readFileSafe(path: FilePath, encoding: BufferEncoding = 'utf-8'): Promise<string | null> {
    try {
      return await this.readFile(path, encoding);
    } catch {
      return null;
    }
  }

  /**
   * Get file stats if exists, return null otherwise
   */
  async statSafe(path: FilePath): Promise<FileStats | null> {
    try {
      return await this.stat(path);
    } catch {
      return null;
    }
  }

  /**
   * Recursively get all files in a directory
   */
  async walkDir(
    dir: FilePath,
    options: { extensions?: string[]; ignore?: string[] } = {}
  ): Promise<FilePath[]> {
    const results: FilePath[] = [];
    const ignoreSet = new Set(options.ignore ?? []);

    const walk = async (currentDir: FilePath): Promise<void> => {
      const entries = await fsPromises.readdir(currentDir as string, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = nodePath.join(currentDir as string, entry.name);

        // Check ignore patterns
        if (ignoreSet.has(entry.name)) continue;
        if (entry.name.startsWith('.')) continue;

        if (entry.isDirectory()) {
          await walk(toFilePath(fullPath));
        } else if (entry.isFile()) {
          // Check extension filter
          if (options.extensions) {
            const ext = nodePath.extname(entry.name);
            if (!options.extensions.includes(ext)) continue;
          }

          results.push(toFilePath(fullPath));
        }
      }
    };

    await walk(dir);
    return results;
  }

  /**
   * Calculate hash of file contents
   */
  async hashFile(path: FilePath): Promise<string> {
    const crypto = await import('crypto');
    const content = await this.readFileBuffer(path);
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}

/**
 * Create a file system instance
 */
export function createFileSystem(logger?: ILogger): IFileSystem {
  return new FileSystem(logger);
}
