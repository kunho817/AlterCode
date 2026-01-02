/**
 * File Operation Tools
 *
 * Implements file-related tools for reading, writing, and editing files.
 */

import * as path from 'path';
import type { IFileSystem, FilePath } from '../../types';
import { toFilePath } from '../../types';
import type { ToolRegistry } from './ToolRegistry';
import type { ToolInput, ToolResult, ToolContext } from './definitions';
import {
  createReadFileToolDef,
  createWriteFileToolDef,
  createEditFileToolDef,
  createListFilesToolDef,
  createSearchFilesToolDef,
  TOOL_NAMES,
} from './definitions';

/**
 * Register all file tools with the registry
 */
export function registerFileTools(
  registry: ToolRegistry,
  fileSystem: IFileSystem
): void {
  // Read File
  registry.register(createReadFileToolDef(), async (input, context) => {
    return readFileTool(input, context, fileSystem);
  });

  // Write File
  registry.register(createWriteFileToolDef(), async (input, context) => {
    return writeFileTool(input, context, fileSystem);
  });

  // Edit File
  registry.register(createEditFileToolDef(), async (input, context) => {
    return editFileTool(input, context, fileSystem);
  });

  // List Files
  registry.register(createListFilesToolDef(), async (input, context) => {
    return listFilesTool(input, context, fileSystem);
  });

  // Search Files
  registry.register(createSearchFilesToolDef(), async (input, context) => {
    return searchFilesTool(input, context, fileSystem);
  });
}

/**
 * Read file tool implementation
 */
async function readFileTool(
  input: ToolInput,
  context: ToolContext,
  fileSystem: IFileSystem
): Promise<ToolResult> {
  const filePath = input.path as string;
  const startLine = input.startLine as number | undefined;
  const endLine = input.endLine as number | undefined;

  try {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(context.workspaceRoot, filePath);
    const filePathTyped = toFilePath(absolutePath);

    // Check if file exists
    const exists = await fileSystem.exists(filePathTyped);
    if (!exists) {
      return {
        success: false,
        content: '',
        error: `File not found: ${filePath}`,
      };
    }

    // Read file content
    let content = await fileSystem.readFile(filePathTyped);

    // Apply line range if specified
    if (startLine !== undefined || endLine !== undefined) {
      const lines = content.split('\n');
      const start = (startLine ?? 1) - 1;
      const end = endLine ?? lines.length;
      content = lines.slice(start, end).join('\n');
    }

    return {
      success: true,
      content: content,
      metadata: {
        path: filePath,
        absolutePath,
        lineCount: content.split('\n').length,
      },
    };
  } catch (error) {
    return {
      success: false,
      content: '',
      error: `Failed to read file: ${(error as Error).message}`,
    };
  }
}

/**
 * Write file tool implementation
 */
async function writeFileTool(
  input: ToolInput,
  context: ToolContext,
  fileSystem: IFileSystem
): Promise<ToolResult> {
  const filePath = input.path as string;
  const content = input.content as string;

  try {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(context.workspaceRoot, filePath);
    const filePathTyped = toFilePath(absolutePath);

    // Check if this is a new file or overwrite
    const exists = await fileSystem.exists(filePathTyped);
    const action = exists ? 'overwritten' : 'created';

    // Request approval if handler available
    if (context.requestApproval) {
      const originalContent = exists ? await fileSystem.readFile(filePathTyped) : undefined;
      const approved = await context.requestApproval(
        `${action === 'created' ? 'Create' : 'Overwrite'} file: ${filePath}`,
        [
          {
            filePath,
            changeType: exists ? 'modify' : 'create',
            originalContent,
            newContent: content,
          },
        ]
      );

      if (!approved) {
        return {
          success: false,
          content: '',
          error: 'User cancelled the operation',
        };
      }
    }

    // Ensure parent directory exists
    const parentDir = path.dirname(absolutePath);
    const parentDirTyped = toFilePath(parentDir);
    const parentExists = await fileSystem.exists(parentDirTyped);
    if (!parentExists) {
      await fileSystem.mkdir(parentDirTyped);
    }

    // Write the file
    await fileSystem.writeFile(filePathTyped, content);

    return {
      success: true,
      content: `File ${action}: ${filePath}`,
      metadata: {
        path: filePath,
        absolutePath,
        action,
        bytesWritten: content.length,
      },
    };
  } catch (error) {
    return {
      success: false,
      content: '',
      error: `Failed to write file: ${(error as Error).message}`,
    };
  }
}

/**
 * Edit file tool implementation
 */
async function editFileTool(
  input: ToolInput,
  context: ToolContext,
  fileSystem: IFileSystem
): Promise<ToolResult> {
  const filePath = input.path as string;
  const oldText = input.oldText as string;
  const newText = input.newText as string;

  try {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(context.workspaceRoot, filePath);
    const filePathTyped = toFilePath(absolutePath);

    // Check if file exists
    const exists = await fileSystem.exists(filePathTyped);
    if (!exists) {
      return {
        success: false,
        content: '',
        error: `File not found: ${filePath}`,
      };
    }

    // Read current content
    const originalContent = await fileSystem.readFile(filePathTyped);

    // Check if old text exists
    if (!originalContent.includes(oldText)) {
      return {
        success: false,
        content: '',
        error: `Text not found in file: "${oldText.slice(0, 50)}..."`,
      };
    }

    // Check for multiple occurrences
    const occurrences = originalContent.split(oldText).length - 1;
    if (occurrences > 1) {
      return {
        success: false,
        content: '',
        error: `Text found ${occurrences} times. Please provide more context to make it unique.`,
      };
    }

    // Apply the edit
    const newContent = originalContent.replace(oldText, newText);

    // Request approval if handler available
    if (context.requestApproval) {
      const approved = await context.requestApproval(`Edit file: ${filePath}`, [
        {
          filePath,
          changeType: 'modify',
          originalContent,
          newContent,
          diff: generateSimpleDiff(oldText, newText),
        },
      ]);

      if (!approved) {
        return {
          success: false,
          content: '',
          error: 'User cancelled the operation',
        };
      }
    }

    // Write the edited file
    await fileSystem.writeFile(filePathTyped, newContent);

    return {
      success: true,
      content: `File edited: ${filePath}`,
      metadata: {
        path: filePath,
        absolutePath,
        replacedText: oldText.slice(0, 50),
        newText: newText.slice(0, 50),
      },
    };
  } catch (error) {
    return {
      success: false,
      content: '',
      error: `Failed to edit file: ${(error as Error).message}`,
    };
  }
}

/**
 * List files tool implementation
 */
async function listFilesTool(
  input: ToolInput,
  context: ToolContext,
  fileSystem: IFileSystem
): Promise<ToolResult> {
  const dirPath = (input.path as string) || '.';
  const pattern = input.pattern as string | undefined;
  const recursive = input.recursive as boolean ?? false;

  try {
    const absolutePath = path.isAbsolute(dirPath)
      ? dirPath
      : path.join(context.workspaceRoot, dirPath);
    const dirPathTyped = toFilePath(absolutePath);

    // Check if directory exists
    const exists = await fileSystem.exists(dirPathTyped);
    if (!exists) {
      return {
        success: false,
        content: '',
        error: `Directory not found: ${dirPath}`,
      };
    }

    // List files
    let files: string[];
    if (pattern) {
      const globPattern = path.join(absolutePath, recursive ? '**' : '', pattern);
      files = await fileSystem.glob(globPattern);
    } else {
      files = await fileSystem.readdir(dirPathTyped);
      if (recursive) {
        // For recursive without pattern, list all files
        const globPattern = path.join(absolutePath, '**', '*');
        files = await fileSystem.glob(globPattern);
      }
    }

    // Make paths relative to workspace
    const relativeFiles = files.map((f) => path.relative(context.workspaceRoot, f));

    return {
      success: true,
      content: relativeFiles.join('\n'),
      metadata: {
        path: dirPath,
        fileCount: files.length,
        pattern,
        recursive,
      },
    };
  } catch (error) {
    return {
      success: false,
      content: '',
      error: `Failed to list files: ${(error as Error).message}`,
    };
  }
}

/**
 * Search files tool implementation
 */
async function searchFilesTool(
  input: ToolInput,
  context: ToolContext,
  fileSystem: IFileSystem
): Promise<ToolResult> {
  const query = input.query as string;
  const searchPath = (input.path as string) || '.';
  const filePattern = input.filePattern as string | undefined;
  const maxResults = (input.maxResults as number) || 50;

  try {
    const absolutePath = path.isAbsolute(searchPath)
      ? searchPath
      : path.join(context.workspaceRoot, searchPath);

    // Get files to search
    const pattern = filePattern || '*';
    const globPattern = path.join(absolutePath, '**', pattern);
    const files = await fileSystem.glob(globPattern);

    const results: Array<{ file: string; line: number; content: string }> = [];
    const regex = new RegExp(query, 'gi');

    // Search each file
    for (const file of files) {
      if (results.length >= maxResults) break;

      try {
        const content = await fileSystem.readFile(toFilePath(file));
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line && regex.test(line)) {
            results.push({
              file: path.relative(context.workspaceRoot, file),
              line: i + 1,
              content: line.trim().slice(0, 200),
            });

            if (results.length >= maxResults) break;
          }
          regex.lastIndex = 0; // Reset regex state
        }
      } catch {
        // Skip files that can't be read
      }
    }

    // Format results
    const output = results
      .map((r) => `${r.file}:${r.line}: ${r.content}`)
      .join('\n');

    return {
      success: true,
      content: output || 'No matches found',
      metadata: {
        query,
        path: searchPath,
        matchCount: results.length,
        filesSearched: files.length,
      },
    };
  } catch (error) {
    return {
      success: false,
      content: '',
      error: `Failed to search files: ${(error as Error).message}`,
    };
  }
}

/**
 * Generate a simple diff string
 */
function generateSimpleDiff(oldText: string, newText: string): string {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  const diff: string[] = [];

  for (const line of oldLines) {
    diff.push(`- ${line}`);
  }
  for (const line of newLines) {
    diff.push(`+ ${line}`);
  }

  return diff.join('\n');
}
