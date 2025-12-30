/**
 * Claude Agent
 *
 * Integrates with Claude Code CLI via subprocess spawning.
 * Uses stdin to pass prompts to avoid shell escaping issues.
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import {
  AIModel,
  AIProvider,
  AgentRequest,
  AgentResponse,
  AgentResult,
  AgentError,
  ExecutionMetrics,
  ClaudeConfig,
} from '../../types';
import { AIAgent } from '../AgentPool';
import { Logger } from '../../utils/Logger';

/**
 * Claude Code CLI response chunk.
 */
interface ClaudeResponseChunk {
  type: 'text' | 'thinking' | 'redacted_thinking' | 'tool_use' | 'error';
  content?: string;
  reasoning?: string;
  error?: string;
  sessionId?: string;
}

/**
 * Claude Agent implementation using Claude Code CLI.
 */
export class ClaudeAgent implements AIAgent {
  readonly id: string;
  readonly provider: AIProvider = 'claude';
  readonly model: AIModel = AIModel.CLAUDE_OPUS;

  private readonly config: ClaudeConfig;
  private readonly logger: Logger;
  private sessionId: string | null = null;
  private activeProcess: ChildProcess | null = null;
  private cancelled: boolean = false;

  constructor(config: ClaudeConfig) {
    this.id = uuidv4();
    this.config = config;
    this.logger = new Logger('ClaudeAgent');
  }

  /**
   * Execute a request via Claude Code CLI using stdin.
   */
  async execute(request: AgentRequest): Promise<AgentResponse> {
    this.cancelled = false;
    const startTime = new Date();

    this.logger.debug(`ClaudeAgent execute() called for task: ${request.taskId}`);

    try {
      const cwd = request.context.workspaceRoot || process.cwd();

      // Build the full prompt including system prompt if provided
      let fullPrompt = request.prompt;
      if (request.systemPrompt) {
        fullPrompt = `${request.systemPrompt}\n\n---\n\n${request.prompt}`;
      }

      // Execute via stdin
      const result = await this.executeViaStdin(fullPrompt, cwd);

      // Check for cancellation
      if (this.cancelled) {
        throw new Error('Request cancelled');
      }

      const endTime = new Date();

      return {
        taskId: request.taskId,
        status: 'success',
        result,
        metrics: {
          startTime,
          endTime,
          durationMs: endTime.getTime() - startTime.getTime(),
          tokensSent: this.estimateTokens(fullPrompt),
          tokensReceived: this.estimateTokens(result.content),
          model: this.model,
        },
      };
    } catch (error) {
      const endTime = new Date();
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error('Claude Code execution failed', error);

      return {
        taskId: request.taskId,
        status: 'failure',
        result: {
          content: '',
          metadata: { error: errorMessage },
        },
        metrics: {
          startTime,
          endTime,
          durationMs: endTime.getTime() - startTime.getTime(),
          tokensSent: this.estimateTokens(request.prompt),
          tokensReceived: 0,
          model: this.model,
        },
        error: {
          code: 'CLAUDE_EXECUTION_ERROR',
          message: errorMessage,
          retryable: !this.cancelled,
        },
      };
    } finally {
      this.activeProcess = null;
    }
  }

  /**
   * Cancel the current execution.
   */
  cancel(): void {
    this.cancelled = true;
    if (this.activeProcess) {
      this.activeProcess.kill('SIGTERM');
      this.activeProcess = null;
    }
  }

  /**
   * Execute via stdin using spawn (avoids shell escaping issues).
   */
  private executeViaStdin(prompt: string, cwd: string): Promise<AgentResult> {
    return new Promise((resolve, reject) => {
      const cliPath = this.config.cliPath || 'claude';

      // Use spawn with pipe for stdin
      // shell: true is required on Windows for .cmd scripts (claude is installed via npm)
      const childProcess = spawn(cliPath, ['--print', '--output-format', 'text', '-'], {
        cwd,
        shell: true,
        env: {
          ...process.env,
          CLAUDE_CODE_MAX_OUTPUT_TOKENS: String(this.config.maxOutputTokens),
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.activeProcess = childProcess;

      let stdout = '';
      let stderr = '';

      // Collect stdout
      childProcess.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      // Collect stderr
      childProcess.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      // Handle errors
      childProcess.on('error', (error: Error) => {
        if (this.cancelled) {
          reject(new Error('Request cancelled'));
        } else {
          reject(error);
        }
      });

      // Handle close
      childProcess.on('close', (code: number | null) => {
        if (this.cancelled) {
          reject(new Error('Request cancelled'));
          return;
        }

        if (code !== 0 && stderr) {
          reject(new Error(stderr.trim()));
          return;
        }

        resolve({
          content: stdout.trim(),
          metadata: {
            exitCode: code,
            hadErrors: !!stderr,
          },
        });
      });

      // Write prompt to stdin and close
      childProcess.stdin.write(prompt);
      childProcess.stdin.end();

      // Set timeout
      const timeout = setTimeout(() => {
        if (!this.cancelled) {
          this.logger.warn('Claude CLI timed out after 120s');
          childProcess.kill('SIGTERM');
          reject(new Error('Request timed out after 120 seconds'));
        }
      }, 120000);

      // Clear timeout when process exits
      childProcess.on('close', () => {
        clearTimeout(timeout);
      });
    });
  }

  /**
   * Estimate token count for a string.
   * This is a rough estimate; actual token count may vary.
   */
  private estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token for English
    return Math.ceil(text.length / 4);
  }
}
