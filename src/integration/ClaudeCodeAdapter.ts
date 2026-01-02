/**
 * Claude Code CLI Adapter
 *
 * Adapter that uses Claude Code CLI for AI completions:
 * - Executes the `claude` command-line tool
 * - Supports streaming output
 * - Handles conversation context
 * - Always uses Opus model (Claude Code default)
 *
 * This adapter is used for non-Worker hierarchy levels
 * when the user prefers CLI over direct API access.
 */

import { spawn, ChildProcess } from 'child_process';
import {
  ILLMAdapter,
  LLMRequest,
  LLMResponse,
  LLMStreamChunk,
  LLMConfig,
  ToolDefinition,
  ToolCall,
  AsyncResult,
  Ok,
  Err,
  ILogger,
  AppError,
} from '../types';

/** Claude Code CLI configuration */
export interface ClaudeCodeConfig {
  /** Path to claude CLI executable (default: 'claude') */
  cliPath?: string;
  /** Working directory for CLI execution */
  workingDirectory?: string;
  /** Timeout in milliseconds (default: 300000 = 5 minutes) */
  timeout?: number;
  /** Maximum output tokens */
  maxTokens?: number;
}

/** Default configuration */
const DEFAULT_CONFIG: Required<ClaudeCodeConfig> = {
  cliPath: 'claude',
  workingDirectory: process.cwd(),
  timeout: 300000,
  maxTokens: 16384,
};

/**
 * Claude Code CLI Adapter
 *
 * Invokes Claude Code CLI for AI completions.
 * Always uses Opus model as per Claude Code default.
 */
export class ClaudeCodeAdapter implements ILLMAdapter {
  private readonly config: Required<ClaudeCodeConfig>;
  private readonly logger?: ILogger;
  private requestCount: number = 0;

  constructor(config?: ClaudeCodeConfig, logger?: ILogger) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
    this.logger = logger?.child('ClaudeCodeAdapter');
  }

  async complete(request: LLMRequest): AsyncResult<LLMResponse> {
    const startTime = Date.now();
    this.requestCount++;

    this.logger?.debug('Starting Claude Code completion', {
      promptLength: request.prompt.length,
    });

    try {
      const output = await this.executeCommand(request.prompt, request.systemPrompt);

      const response: LLMResponse = {
        content: output,
        model: 'claude-opus-4', // Claude Code uses Opus
        finishReason: 'stop',
        usage: {
          promptTokens: this.estimateTokens(request.prompt),
          completionTokens: this.estimateTokens(output),
          totalTokens: this.estimateTokens(request.prompt) + this.estimateTokens(output),
        },
        duration: Date.now() - startTime,
      };

      this.logger?.debug('Claude Code completion finished', {
        duration: response.duration,
        outputLength: output.length,
      });

      return Ok(response);
    } catch (error) {
      this.logger?.error('Claude Code completion failed', error as Error);
      return Err(new AppError('LLM', `Claude Code failed: ${(error as Error).message}`));
    }
  }

  async *stream(request: LLMRequest): AsyncGenerator<LLMStreamChunk> {
    const startTime = Date.now();
    this.requestCount++;

    this.logger?.debug('Starting Claude Code stream', {
      promptLength: request.prompt.length,
    });

    try {
      let totalContent = '';

      for await (const chunk of this.streamCommand(request.prompt, request.systemPrompt)) {
        totalContent += chunk;
        yield {
          content: chunk,
          done: false,
        };
      }

      // Final chunk
      yield {
        content: '',
        done: true,
        usage: {
          promptTokens: this.estimateTokens(request.prompt),
          completionTokens: this.estimateTokens(totalContent),
          totalTokens: this.estimateTokens(request.prompt) + this.estimateTokens(totalContent),
        },
      };

      this.logger?.debug('Claude Code stream completed', {
        duration: Date.now() - startTime,
        contentLength: totalContent.length,
      });
    } catch (error) {
      this.logger?.error('Claude Code stream failed', error as Error);
      throw new AppError('LLM', `Claude Code stream failed: ${(error as Error).message}`);
    }
  }

  async completeWithTools(
    request: LLMRequest,
    tools: ToolDefinition[]
  ): AsyncResult<{ response: LLMResponse; toolCalls: ToolCall[] }> {
    // Claude Code CLI doesn't directly support tool use in the same way as API
    // We'll include tool descriptions in the prompt and parse the response
    const startTime = Date.now();
    this.requestCount++;

    this.logger?.debug('Starting Claude Code completion with tools', {
      toolCount: tools.length,
    });

    try {
      // Build enhanced prompt with tool descriptions
      const toolDescriptions = tools
        .map((t) => `- ${t.name}: ${t.description}`)
        .join('\n');

      const enhancedPrompt = `${request.prompt}

Available tools:
${toolDescriptions}

If you need to use a tool, respond with a JSON block like:
\`\`\`json
{"tool": "tool_name", "arguments": {...}}
\`\`\``;

      const output = await this.executeCommand(enhancedPrompt, request.systemPrompt);

      // Parse tool calls from response
      const toolCalls = this.parseToolCalls(output);

      const response: LLMResponse = {
        content: output,
        model: 'claude-opus-4',
        finishReason: toolCalls.length > 0 ? 'tool_use' : 'stop',
        usage: {
          promptTokens: this.estimateTokens(enhancedPrompt),
          completionTokens: this.estimateTokens(output),
          totalTokens: this.estimateTokens(enhancedPrompt) + this.estimateTokens(output),
        },
        duration: Date.now() - startTime,
      };

      this.logger?.debug('Claude Code tool completion finished', {
        duration: response.duration,
        toolCalls: toolCalls.length,
      });

      return Ok({ response, toolCalls });
    } catch (error) {
      this.logger?.error('Claude Code tool completion failed', error as Error);
      return Err(new AppError('LLM', `Claude Code tool completion failed: ${(error as Error).message}`));
    }
  }

  getConfig(): LLMConfig {
    return {
      model: 'claude-opus-4',
      maxTokens: this.config.maxTokens,
      temperature: 1, // Claude Code uses default
      stopSequences: [],
    };
  }

  setConfig(_config: Partial<LLMConfig>): void {
    // Claude Code CLI doesn't support runtime config changes
    this.logger?.warn('Claude Code CLI does not support runtime config changes');
  }

  /**
   * Execute Claude Code CLI command
   */
  private executeCommand(prompt: string, systemPrompt?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = this.buildArgs(prompt, systemPrompt);

      this.logger?.debug('Executing claude command', { args: args.join(' ') });

      const proc = spawn(this.config.cliPath, args, {
        cwd: this.config.workingDirectory,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: this.config.timeout,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code: number | null) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`Claude Code exited with code ${code}: ${stderr}`));
        }
      });

      proc.on('error', (error: Error) => {
        reject(new Error(`Failed to spawn Claude Code: ${error.message}`));
      });

      // Send prompt to stdin if needed
      proc.stdin.end();
    });
  }

  /**
   * Stream Claude Code CLI output
   */
  private async *streamCommand(
    prompt: string,
    systemPrompt?: string
  ): AsyncGenerator<string> {
    const args = this.buildArgs(prompt, systemPrompt);

    const proc: ChildProcess = spawn(this.config.cliPath, args, {
      cwd: this.config.workingDirectory,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Create async iterator from stdout
    const stdout = proc.stdout;
    if (!stdout) {
      throw new Error('No stdout stream');
    }

    for await (const chunk of stdout) {
      yield chunk.toString();
    }

    // Wait for process to complete
    await new Promise<void>((resolve, reject) => {
      proc.on('close', (code: number | null) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Claude Code exited with code ${code}`));
        }
      });

      proc.on('error', (error: Error) => {
        reject(error);
      });
    });
  }

  /**
   * Build CLI arguments
   */
  private buildArgs(prompt: string, systemPrompt?: string): string[] {
    const args: string[] = [
      '-p', // Print mode: output response and exit (non-interactive)
    ];

    // Add system prompt if provided
    if (systemPrompt) {
      args.push('--system-prompt', systemPrompt);
    }

    // The prompt is passed as the last positional argument
    args.push(prompt);

    return args;
  }

  /**
   * Parse tool calls from Claude Code response
   */
  private parseToolCalls(output: string): ToolCall[] {
    const toolCalls: ToolCall[] = [];

    // Look for JSON blocks with tool calls
    const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/g;
    let match;

    while ((match = jsonBlockRegex.exec(output)) !== null) {
      try {
        const jsonContent = match[1];
        if (!jsonContent) continue;
        const parsed = JSON.parse(jsonContent);
        if (parsed.tool && typeof parsed.tool === 'string') {
          toolCalls.push({
            id: `call_${Date.now()}_${toolCalls.length}`,
            name: parsed.tool,
            arguments: parsed.arguments || {},
          });
        }
      } catch {
        // Skip invalid JSON
      }
    }

    return toolCalls;
  }

  /**
   * Estimate tokens (rough approximation)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Check if Claude Code CLI is available
   */
  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn(this.config.cliPath, ['--version'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      proc.on('close', (code: number | null) => {
        resolve(code === 0);
      });

      proc.on('error', () => {
        resolve(false);
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        proc.kill();
        resolve(false);
      }, 5000);
    });
  }

  /**
   * Get Claude Code CLI version
   */
  async getVersion(): Promise<string | null> {
    return new Promise((resolve) => {
      const proc = spawn(this.config.cliPath, ['--version'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let output = '';

      proc.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      proc.on('close', (code: number | null) => {
        if (code === 0) {
          resolve(output.trim());
        } else {
          resolve(null);
        }
      });

      proc.on('error', () => {
        resolve(null);
      });
    });
  }

  /**
   * Get usage stats
   */
  getUsageStats(): { requestCount: number } {
    return { requestCount: this.requestCount };
  }
}

/**
 * Create a Claude Code CLI adapter
 */
export function createClaudeCodeAdapter(
  config?: ClaudeCodeConfig,
  logger?: ILogger
): ClaudeCodeAdapter {
  return new ClaudeCodeAdapter(config, logger);
}
