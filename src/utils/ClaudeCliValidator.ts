/**
 * Claude CLI Validator
 *
 * Validates Claude CLI installation and provides helpful diagnostics.
 */

import { spawn } from 'child_process';
import * as vscode from 'vscode';
import { Logger } from './Logger';

export interface ClaudeCliStatus {
  installed: boolean;
  version: string | null;
  path: string | null;
  authenticated: boolean;
  error: string | null;
}

/**
 * Validates Claude CLI installation and authentication.
 */
export class ClaudeCliValidator {
  private readonly logger: Logger;
  private cachedStatus: ClaudeCliStatus | null = null;
  private lastCheck: number = 0;
  private readonly CACHE_TTL_MS = 60000; // 1 minute cache

  constructor() {
    this.logger = new Logger('ClaudeCliValidator');
  }

  /**
   * Check if Claude CLI is available and authenticated.
   */
  async validate(cliPath?: string): Promise<ClaudeCliStatus> {
    // Return cached result if recent
    const now = Date.now();
    if (this.cachedStatus && now - this.lastCheck < this.CACHE_TTL_MS) {
      return this.cachedStatus;
    }

    const resolvedPath = cliPath || 'claude';
    this.logger.debug(`Validating Claude CLI at: ${resolvedPath}`);

    try {
      // Check version first
      const versionResult = await this.runCommand(resolvedPath, ['--version']);

      if (!versionResult.success) {
        this.cachedStatus = {
          installed: false,
          version: null,
          path: null,
          authenticated: false,
          error: this.getInstallationHelp(versionResult.error),
        };
        this.lastCheck = now;
        return this.cachedStatus;
      }

      // Parse version from output
      const version = this.parseVersion(versionResult.stdout);

      // Check authentication by running a simple test
      const authResult = await this.runCommand(resolvedPath, ['--help']);
      const authenticated = authResult.success;

      this.cachedStatus = {
        installed: true,
        version,
        path: resolvedPath,
        authenticated,
        error: authenticated ? null : 'Claude CLI may not be authenticated. Run "claude" in terminal to authenticate.',
      };
      this.lastCheck = now;

      this.logger.info(`Claude CLI validated: v${version}, authenticated: ${authenticated}`);
      return this.cachedStatus;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.cachedStatus = {
        installed: false,
        version: null,
        path: null,
        authenticated: false,
        error: this.getInstallationHelp(errorMessage),
      };
      this.lastCheck = now;
      return this.cachedStatus;
    }
  }

  /**
   * Clear cached status.
   */
  clearCache(): void {
    this.cachedStatus = null;
    this.lastCheck = 0;
  }

  /**
   * Run a CLI command and capture output.
   */
  private runCommand(
    cliPath: string,
    args: string[]
  ): Promise<{ success: boolean; stdout: string; error: string }> {
    return new Promise((resolve) => {
      const child = spawn(cliPath, args, {
        shell: true,
        timeout: 10000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('error', (error: Error) => {
        resolve({ success: false, stdout: '', error: error.message });
      });

      child.on('close', (code: number | null) => {
        resolve({
          success: code === 0,
          stdout: stdout.trim(),
          error: stderr.trim() || (code !== 0 ? `Exit code: ${code}` : ''),
        });
      });

      // Timeout fallback
      setTimeout(() => {
        child.kill('SIGTERM');
        resolve({ success: false, stdout: '', error: 'Command timed out' });
      }, 10000);
    });
  }

  /**
   * Parse version from CLI output.
   */
  private parseVersion(output: string): string | null {
    // Try various version patterns
    const patterns = [
      /(\d+\.\d+\.\d+)/,          // 1.0.0
      /v(\d+\.\d+\.\d+)/,         // v1.0.0
      /version[:\s]+(\d+\.\d+)/i, // version: 1.0 or version 1.0
    ];

    for (const pattern of patterns) {
      const match = output.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return output.split('\n')[0]?.trim() || null;
  }

  /**
   * Get helpful installation instructions.
   */
  private getInstallationHelp(error: string): string {
    const isWindows = process.platform === 'win32';
    const notFound =
      error.includes('ENOENT') ||
      error.includes('not found') ||
      error.includes('not recognized') ||
      error.includes('command not found');

    if (notFound) {
      return `Claude CLI not found. To install:
1. Install Node.js 18+ if not installed
2. Run: npm install -g @anthropic-ai/claude-code
3. Run: claude (to authenticate)
${isWindows ? '4. Restart VS Code after installation' : ''}`;
    }

    return error;
  }

  /**
   * Show installation prompt to user.
   */
  async showInstallationPrompt(): Promise<void> {
    const status = await this.validate();

    if (status.installed && status.authenticated) {
      vscode.window.showInformationMessage(
        `Claude CLI is ready (v${status.version})`
      );
      return;
    }

    const action = await vscode.window.showWarningMessage(
      status.error || 'Claude CLI is not configured properly.',
      'Open Terminal',
      'View Instructions',
      'Configure Path'
    );

    if (action === 'Open Terminal') {
      const terminal = vscode.window.createTerminal('Claude Setup');
      terminal.show();
      if (!status.installed) {
        terminal.sendText('npm install -g @anthropic-ai/claude-code');
      } else {
        terminal.sendText('claude');
      }
    } else if (action === 'View Instructions') {
      vscode.env.openExternal(
        vscode.Uri.parse('https://docs.anthropic.com/en/docs/claude-code/getting-started')
      );
    } else if (action === 'Configure Path') {
      vscode.commands.executeCommand(
        'workbench.action.openSettings',
        'altercode.claude.cliPath'
      );
    }
  }
}

// Singleton instance
let validatorInstance: ClaudeCliValidator | null = null;

export function getClaudeCliValidator(): ClaudeCliValidator {
  if (!validatorInstance) {
    validatorInstance = new ClaudeCliValidator();
  }
  return validatorInstance;
}
