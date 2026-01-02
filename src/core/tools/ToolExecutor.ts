/**
 * Tool Executor
 *
 * Executes tools with proper error handling, logging, and approval flow.
 */

import type { ILogger, IEventBus } from '../../types';
import type { ToolRegistry } from './ToolRegistry';
import type {
  ToolInput,
  ToolResult,
  ToolContext,
  FileChange,
} from './definitions';

export interface ToolExecutorOptions {
  registry: ToolRegistry;
  eventBus: IEventBus;
  logger?: ILogger;
  /** Default approval handler */
  defaultApprovalHandler?: (description: string, changes: FileChange[]) => Promise<boolean>;
}

export class ToolExecutor {
  private readonly registry: ToolRegistry;
  private readonly eventBus: IEventBus;
  private readonly logger?: ILogger;
  private readonly defaultApprovalHandler?: (description: string, changes: FileChange[]) => Promise<boolean>;

  constructor(options: ToolExecutorOptions) {
    this.registry = options.registry;
    this.eventBus = options.eventBus;
    this.logger = options.logger?.child('ToolExecutor');
    this.defaultApprovalHandler = options.defaultApprovalHandler;
  }

  /**
   * Execute a tool by name
   */
  async execute(
    toolName: string,
    input: ToolInput,
    context: ToolContext
  ): Promise<ToolResult> {
    const tool = this.registry.get(toolName);

    if (!tool) {
      this.logger?.warn('Tool not found', { toolName });
      return {
        success: false,
        content: '',
        error: `Tool '${toolName}' not found`,
      };
    }

    const startTime = Date.now();

    // Emit tool execution started event
    this.eventBus.emit('tool:started', {
      toolName,
      input,
      requiresApproval: tool.definition.requiresApproval,
    });

    this.logger?.debug('Executing tool', { toolName, input });

    try {
      // Validate required parameters
      const validationError = this.validateInput(tool.definition.parameters, input);
      if (validationError) {
        return {
          success: false,
          content: '',
          error: validationError,
        };
      }

      // Check if approval is required
      if (tool.definition.requiresApproval) {
        const approvalHandler = context.requestApproval || this.defaultApprovalHandler;

        if (approvalHandler) {
          // For file operations, we'd generate a preview of changes
          // For now, just request approval with a description
          const description = this.generateApprovalDescription(toolName, input);
          const approved = await approvalHandler(description, []);

          if (!approved) {
            this.logger?.info('Tool execution cancelled by user', { toolName });
            return {
              success: false,
              content: '',
              error: 'User cancelled the operation',
            };
          }
        }
      }

      // Execute the tool
      const result = await tool.execute(input, context);
      const duration = Date.now() - startTime;

      // Emit tool execution completed event
      this.eventBus.emit('tool:completed', {
        toolName,
        result,
        duration,
      });

      this.logger?.debug('Tool executed', {
        toolName,
        success: result.success,
        duration,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = (error as Error).message;

      // Emit tool execution failed event
      this.eventBus.emit('tool:failed', {
        toolName,
        error: errorMessage,
        duration,
      });

      this.logger?.error('Tool execution failed', error as Error, { toolName });

      return {
        success: false,
        content: '',
        error: errorMessage,
      };
    }
  }

  /**
   * Execute multiple tools in sequence
   */
  async executeSequence(
    toolCalls: Array<{ name: string; input: ToolInput }>,
    context: ToolContext
  ): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    for (const call of toolCalls) {
      if (context.abortSignal?.aborted) {
        results.push({
          success: false,
          content: '',
          error: 'Execution aborted',
        });
        break;
      }

      const result = await this.execute(call.name, call.input, context);
      results.push(result);

      // Stop on critical failure
      if (!result.success && result.error?.includes('critical')) {
        break;
      }
    }

    return results;
  }

  /**
   * Validate input against parameter definitions
   */
  private validateInput(
    parameters: Array<{ name: string; required?: boolean }>,
    input: ToolInput
  ): string | null {
    for (const param of parameters) {
      if (param.required && !(param.name in input)) {
        return `Missing required parameter: ${param.name}`;
      }
    }
    return null;
  }

  /**
   * Generate a human-readable description for approval
   */
  private generateApprovalDescription(toolName: string, input: ToolInput): string {
    switch (toolName) {
      case 'write_file':
        return `Write to file: ${input.path}`;
      case 'edit_file':
        return `Edit file: ${input.path}`;
      case 'run_command':
        return `Run command: ${input.command}`;
      default:
        return `Execute ${toolName}`;
    }
  }
}

/**
 * Create a tool executor
 */
export function createToolExecutor(options: ToolExecutorOptions): ToolExecutor {
  return new ToolExecutor(options);
}
