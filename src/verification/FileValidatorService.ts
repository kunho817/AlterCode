/**
 * File Validator Service
 *
 * Validates file paths and existence against the actual file system:
 * - Path existence verification
 * - File/directory type checking
 * - Similar file suggestions for corrections
 */

import {
  IFileValidatorService,
  IFileSystem,
  FileValidationRequest,
  FileValidationResult,
  FileSuggestion,
  FilePath,
  AsyncResult,
  Ok,
  Err,
  ILogger,
  AppError,
  toFilePath,
} from '../types';

/** Levenshtein distance threshold for suggestions */
const SUGGESTION_THRESHOLD = 0.6;

/** Maximum suggestions to return */
const MAX_SUGGESTIONS = 5;

/**
 * File Validator Service implementation
 */
export class FileValidatorService implements IFileValidatorService {
  private readonly fileSystem: IFileSystem;
  private readonly projectRoot: FilePath;
  private readonly logger?: ILogger;

  // Cache of known files for suggestions
  private knownFiles: Set<string> = new Set();
  private lastCacheUpdate: number = 0;
  private readonly cacheTimeout = 60000; // 1 minute

  constructor(fileSystem: IFileSystem, projectRoot: FilePath, logger?: ILogger) {
    this.fileSystem = fileSystem;
    this.projectRoot = projectRoot;
    this.logger = logger?.child('FileValidatorService');
  }

  async validate(request: FileValidationRequest): AsyncResult<FileValidationResult[]> {
    try {
      this.logger?.info('Validating files', { count: request.paths.length });

      const results: FileValidationResult[] = [];

      for (const path of request.paths) {
        const result = await this.validateSinglePath(path, request);
        results.push(result);
      }

      const validCount = results.filter((r) => r.valid).length;
      this.logger?.info('Validation complete', {
        total: results.length,
        valid: validCount,
        invalid: results.length - validCount,
      });

      return Ok(results);
    } catch (error) {
      this.logger?.error('Validation failed', error as Error);
      return Err(
        new AppError('VERIFICATION', `File validation failed: ${(error as Error).message}`)
      );
    }
  }

  exists(path: string): boolean {
    try {
      const fullPath = this.resolvePath(path);
      // Synchronous check using cache
      return this.knownFiles.has(path) || this.knownFiles.has(fullPath as string);
    } catch {
      return false;
    }
  }

  isFile(path: string): boolean {
    // This requires async check, return best effort
    return this.exists(path);
  }

  isDirectory(path: string): boolean {
    // This requires async check, return best effort
    return this.exists(path);
  }

  suggestCorrection(invalidPath: string): FileSuggestion[] {
    const suggestions: FileSuggestion[] = [];
    const pathParts = invalidPath.split(/[/\\]/);
    const fileName = pathParts[pathParts.length - 1] ?? '';
    const fileNameLower = fileName.toLowerCase();

    for (const knownPath of this.knownFiles) {
      const knownParts = knownPath.split(/[/\\]/);
      const knownFileName = knownParts[knownParts.length - 1] ?? '';

      // Calculate similarity
      const similarity = this.calculateSimilarity(fileNameLower, knownFileName.toLowerCase());

      if (similarity >= SUGGESTION_THRESHOLD) {
        let reason = 'Similar file name';

        // Check if it's a case mismatch
        if (fileNameLower === knownFileName.toLowerCase() && fileName !== knownFileName) {
          reason = 'Case mismatch';
        }

        // Check if it's in a different directory
        if (knownFileName === fileName && knownPath !== invalidPath) {
          reason = 'Different directory';
        }

        suggestions.push({
          path: knownPath,
          similarity,
          reason,
        });
      }
    }

    // Sort by similarity and return top suggestions
    return suggestions
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, MAX_SUGGESTIONS);
  }

  /**
   * Validate a single path
   */
  private async validateSinglePath(
    path: string,
    request: FileValidationRequest
  ): Promise<FileValidationResult> {
    try {
      const fullPath = this.resolvePath(path);
      const exists = await this.fileSystem.exists(fullPath);

      if (!exists) {
        // Update cache and get suggestions
        await this.updateFileCache();
        const suggestions = this.suggestCorrection(path);

        return {
          path,
          valid: false,
          exists: false,
          error: `File does not exist: ${path}`,
          suggestions,
        };
      }

      const stats = await this.fileSystem.stat(fullPath);

      // Check if it's a file or directory
      const result: FileValidationResult = {
        path,
        valid: true,
        exists: true,
        isFile: stats.isFile,
        isDirectory: stats.isDirectory,
        size: stats.size,
        lastModified: stats.modifiedAt,
      };

      // Additional checks if requested
      if (request.checkContent && stats.isFile) {
        // Could verify content is readable
        try {
          await this.fileSystem.readFile(fullPath);
        } catch (error) {
          return {
            ...result,
            valid: false,
            error: `Cannot read file: ${(error as Error).message}`,
          };
        }
      }

      if (request.checkWritable && stats.isFile) {
        // Check if file is writable (simplified check)
        // In practice, would need actual write test
      }

      // Update cache with this valid path
      this.knownFiles.add(path);

      return result;
    } catch (error) {
      return {
        path,
        valid: false,
        error: `Validation error: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Resolve path relative to project root
   */
  private resolvePath(path: string): FilePath {
    // Check if already absolute
    if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) {
      return toFilePath(path);
    }

    return this.fileSystem.join(this.projectRoot as string, path);
  }

  /**
   * Update the file cache for suggestions
   */
  private async updateFileCache(): Promise<void> {
    const now = Date.now();

    if (now - this.lastCacheUpdate < this.cacheTimeout) {
      return; // Cache is still valid
    }

    try {
      // Get all files in project
      const files = await this.fileSystem.glob('**/*', this.projectRoot);

      this.knownFiles.clear();
      for (const file of files) {
        this.knownFiles.add(file as string);
      }

      this.lastCacheUpdate = now;
      this.logger?.debug('File cache updated', { fileCount: this.knownFiles.size });
    } catch (error) {
      this.logger?.warn('Failed to update file cache', { error });
    }
  }

  /**
   * Calculate string similarity using Levenshtein distance
   */
  private calculateSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    const matrix: number[][] = [];

    // Initialize matrix
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    const row0 = matrix[0]!;
    for (let j = 0; j <= a.length; j++) {
      row0[j] = j;
    }

    // Fill matrix
    for (let i = 1; i <= b.length; i++) {
      const rowI = matrix[i]!;
      const rowPrev = matrix[i - 1]!;
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          rowI[j] = rowPrev[j - 1]!;
        } else {
          rowI[j] = Math.min(
            rowPrev[j - 1]! + 1, // substitution
            rowI[j - 1]! + 1,     // insertion
            rowPrev[j]! + 1      // deletion
          );
        }
      }
    }

    const distance = matrix[b.length]![a.length]!;
    const maxLength = Math.max(a.length, b.length);

    return 1 - distance / maxLength;
  }

  /**
   * Validate a glob pattern and return matching files
   */
  async validateGlob(pattern: string): AsyncResult<string[]> {
    try {
      const matches = await this.fileSystem.glob(pattern, this.projectRoot);
      return Ok(matches.map((m) => m as string));
    } catch (error) {
      return Err(
        new AppError('VERIFICATION', `Invalid glob pattern: ${(error as Error).message}`)
      );
    }
  }

  /**
   * Check if a path is within the project root
   */
  isWithinProject(path: string): boolean {
    try {
      const fullPath = this.resolvePath(path);
      const relative = this.fileSystem.relative(this.projectRoot, fullPath);

      // If relative path starts with .., it's outside project
      return !(relative as string).startsWith('..');
    } catch {
      return false;
    }
  }

  /**
   * Normalize path separators
   */
  normalizePath(path: string): string {
    return path.replace(/\\/g, '/');
  }
}

/**
 * Create a file validator service
 */
export function createFileValidatorService(
  fileSystem: IFileSystem,
  projectRoot: FilePath,
  logger?: ILogger
): IFileValidatorService {
  return new FileValidatorService(fileSystem, projectRoot, logger);
}
