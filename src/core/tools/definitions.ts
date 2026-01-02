/**
 * Tool Definitions
 *
 * Defines the structure and types for tools that can be executed
 * during LLM streaming.
 */

// ============================================================================
// Core Types
// ============================================================================

/** Tool parameter definition */
export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required?: boolean;
  default?: unknown;
}

/** Tool definition */
export interface ToolDefinition {
  /** Unique tool name */
  name: string;
  /** Human-readable description */
  description: string;
  /** Parameter definitions */
  parameters: ToolParameter[];
  /** Whether this tool requires user approval */
  requiresApproval?: boolean;
  /** Tool category for grouping */
  category?: 'file' | 'code' | 'system' | 'search' | 'other';
}

/** Tool input (parsed from LLM) */
export interface ToolInput {
  [key: string]: unknown;
}

/** Tool execution result */
export interface ToolResult {
  /** Whether execution succeeded */
  success: boolean;
  /** Result content (displayed to user and sent back to LLM) */
  content: string;
  /** Error message if failed */
  error?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/** Tool execution context */
export interface ToolContext {
  /** Current working directory */
  workspaceRoot: string;
  /** Currently open file */
  currentFile?: string;
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
  /** Request user approval */
  requestApproval?: (description: string, changes: FileChange[]) => Promise<boolean>;
}

/** File change for approval */
export interface FileChange {
  filePath: string;
  changeType: 'create' | 'modify' | 'delete';
  originalContent?: string;
  newContent?: string;
  diff?: string;
}

/** Tool executor function */
export type ToolExecutorFn = (
  input: ToolInput,
  context: ToolContext
) => Promise<ToolResult>;

/** Registered tool with executor */
export interface RegisteredTool {
  definition: ToolDefinition;
  execute: ToolExecutorFn;
}

// ============================================================================
// Built-in Tool Names
// ============================================================================

export const TOOL_NAMES = {
  // File operations
  READ_FILE: 'read_file',
  WRITE_FILE: 'write_file',
  EDIT_FILE: 'edit_file',
  LIST_FILES: 'list_files',
  SEARCH_FILES: 'search_files',

  // Code operations
  RUN_COMMAND: 'run_command',
  SEARCH_CODE: 'search_code',

  // System operations
  GET_DIAGNOSTICS: 'get_diagnostics',
} as const;

// ============================================================================
// Tool Definition Builders
// ============================================================================

/** Create a read_file tool definition */
export function createReadFileToolDef(): ToolDefinition {
  return {
    name: TOOL_NAMES.READ_FILE,
    description: 'Read the contents of a file',
    category: 'file',
    parameters: [
      {
        name: 'path',
        type: 'string',
        description: 'The path to the file to read (relative to workspace root)',
        required: true,
      },
      {
        name: 'startLine',
        type: 'number',
        description: 'Start reading from this line (1-indexed)',
        required: false,
      },
      {
        name: 'endLine',
        type: 'number',
        description: 'Stop reading at this line (inclusive)',
        required: false,
      },
    ],
  };
}

/** Create a write_file tool definition */
export function createWriteFileToolDef(): ToolDefinition {
  return {
    name: TOOL_NAMES.WRITE_FILE,
    description: 'Write content to a file (creates or overwrites)',
    category: 'file',
    requiresApproval: true,
    parameters: [
      {
        name: 'path',
        type: 'string',
        description: 'The path to the file to write',
        required: true,
      },
      {
        name: 'content',
        type: 'string',
        description: 'The content to write to the file',
        required: true,
      },
    ],
  };
}

/** Create an edit_file tool definition */
export function createEditFileToolDef(): ToolDefinition {
  return {
    name: TOOL_NAMES.EDIT_FILE,
    description: 'Edit a file by replacing specific text',
    category: 'file',
    requiresApproval: true,
    parameters: [
      {
        name: 'path',
        type: 'string',
        description: 'The path to the file to edit',
        required: true,
      },
      {
        name: 'oldText',
        type: 'string',
        description: 'The exact text to find and replace',
        required: true,
      },
      {
        name: 'newText',
        type: 'string',
        description: 'The text to replace with',
        required: true,
      },
    ],
  };
}

/** Create a list_files tool definition */
export function createListFilesToolDef(): ToolDefinition {
  return {
    name: TOOL_NAMES.LIST_FILES,
    description: 'List files in a directory',
    category: 'file',
    parameters: [
      {
        name: 'path',
        type: 'string',
        description: 'The directory path to list (relative to workspace root)',
        required: false,
        default: '.',
      },
      {
        name: 'pattern',
        type: 'string',
        description: 'Glob pattern to filter files (e.g., "*.ts")',
        required: false,
      },
      {
        name: 'recursive',
        type: 'boolean',
        description: 'Whether to list files recursively',
        required: false,
        default: false,
      },
    ],
  };
}

/** Create a search_files tool definition */
export function createSearchFilesToolDef(): ToolDefinition {
  return {
    name: TOOL_NAMES.SEARCH_FILES,
    description: 'Search for text in files',
    category: 'search',
    parameters: [
      {
        name: 'query',
        type: 'string',
        description: 'The text or regex pattern to search for',
        required: true,
      },
      {
        name: 'path',
        type: 'string',
        description: 'The directory to search in',
        required: false,
        default: '.',
      },
      {
        name: 'filePattern',
        type: 'string',
        description: 'Glob pattern to filter files (e.g., "*.ts")',
        required: false,
      },
      {
        name: 'maxResults',
        type: 'number',
        description: 'Maximum number of results to return',
        required: false,
        default: 50,
      },
    ],
  };
}
