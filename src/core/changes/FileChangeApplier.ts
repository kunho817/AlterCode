/**
 * File Change Applier
 *
 * Applies parsed file changes to the filesystem.
 * Handles create, modify, delete operations with backup support.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { createTwoFilesPatch } from 'diff';
import { FileChange } from '../../types';
import { Logger } from '../../utils/Logger';

/**
 * Result of applying a file change.
 */
export interface ApplyResult {
  success: boolean;
  filePath: string;
  changeType: 'create' | 'modify' | 'delete';
  error?: string;
}

/**
 * Applies file changes to the filesystem.
 */
export class FileChangeApplier {
  private readonly logger: Logger;
  private readonly workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.logger = new Logger('FileChangeApplier');
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Prepare file changes by reading original content and generating diffs.
   */
  async prepareChanges(changes: FileChange[]): Promise<FileChange[]> {
    const prepared: FileChange[] = [];

    for (const change of changes) {
      const preparedChange = await this.prepareChange(change);
      prepared.push(preparedChange);
    }

    return prepared;
  }

  /**
   * Prepare a single file change.
   */
  private async prepareChange(change: FileChange): Promise<FileChange> {
    const absolutePath = this.resolvePath(change.filePath);

    // Read original content if file exists
    let originalContent: string | null = null;
    try {
      const fileUri = vscode.Uri.file(absolutePath);
      const fileContent = await vscode.workspace.fs.readFile(fileUri);
      originalContent = Buffer.from(fileContent).toString('utf-8');
    } catch {
      // File doesn't exist - will be created
      originalContent = null;
    }

    // Determine change type based on content
    let changeType: 'create' | 'modify' | 'delete' = change.changeType;
    if (originalContent === null && change.modifiedContent) {
      changeType = 'create';
    } else if (change.modifiedContent === '' && originalContent) {
      changeType = 'delete';
    }

    // Generate diff
    const diff = this.generateDiff(
      change.filePath,
      originalContent || '',
      change.modifiedContent
    );

    return {
      ...change,
      originalContent,
      changeType,
      diff,
    };
  }

  /**
   * Generate a unified diff between two contents.
   */
  private generateDiff(filePath: string, original: string, modified: string): string {
    return createTwoFilesPatch(
      `a/${filePath}`,
      `b/${filePath}`,
      original,
      modified,
      'original',
      'modified'
    );
  }

  /**
   * Apply a single file change.
   */
  async applyChange(change: FileChange): Promise<ApplyResult> {
    const absolutePath = this.resolvePath(change.filePath);
    const fileUri = vscode.Uri.file(absolutePath);

    try {
      switch (change.changeType) {
        case 'create':
        case 'modify':
          // Ensure directory exists
          const dirPath = path.dirname(absolutePath);
          await this.ensureDirectory(dirPath);

          // Write file
          const content = Buffer.from(change.modifiedContent, 'utf-8');
          await vscode.workspace.fs.writeFile(fileUri, content);

          this.logger.info(`${change.changeType === 'create' ? 'Created' : 'Modified'}: ${change.filePath}`);
          return {
            success: true,
            filePath: change.filePath,
            changeType: change.changeType,
          };

        case 'delete':
          await vscode.workspace.fs.delete(fileUri);
          this.logger.info(`Deleted: ${change.filePath}`);
          return {
            success: true,
            filePath: change.filePath,
            changeType: 'delete',
          };

        default:
          throw new Error(`Unknown change type: ${change.changeType}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to apply change to ${change.filePath}: ${errorMessage}`);
      return {
        success: false,
        filePath: change.filePath,
        changeType: change.changeType,
        error: errorMessage,
      };
    }
  }

  /**
   * Apply multiple file changes.
   */
  async applyChanges(changes: FileChange[]): Promise<ApplyResult[]> {
    const results: ApplyResult[] = [];

    for (const change of changes) {
      const result = await this.applyChange(change);
      results.push(result);

      // Stop on first error (can be configured later)
      if (!result.success) {
        this.logger.warn('Stopping due to error, remaining changes not applied');
        break;
      }
    }

    return results;
  }

  /**
   * Preview changes by opening a diff editor.
   */
  async previewChange(change: FileChange): Promise<void> {
    const absolutePath = this.resolvePath(change.filePath);

    // Create temp URIs for diff view
    const originalUri = vscode.Uri.parse(
      `altercode-original:${change.filePath}?${encodeURIComponent(change.originalContent || '')}`
    );
    const modifiedUri = vscode.Uri.parse(
      `altercode-modified:${change.filePath}?${encodeURIComponent(change.modifiedContent)}`
    );

    const title = `${path.basename(change.filePath)} (${change.changeType})`;
    await vscode.commands.executeCommand('vscode.diff', originalUri, modifiedUri, title);
  }

  /**
   * Resolve a relative path to an absolute path.
   */
  private resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.join(this.workspaceRoot, filePath);
  }

  /**
   * Ensure a directory exists.
   */
  private async ensureDirectory(dirPath: string): Promise<void> {
    try {
      const dirUri = vscode.Uri.file(dirPath);
      await vscode.workspace.fs.createDirectory(dirUri);
    } catch {
      // Directory might already exist
    }
  }
}
