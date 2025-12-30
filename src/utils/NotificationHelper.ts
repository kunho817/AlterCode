/**
 * Notification Helper
 *
 * Provides consistent, user-friendly notifications with progress tracking.
 */

import * as vscode from 'vscode';
import { Logger } from './Logger';

export interface ProgressOptions {
  title: string;
  cancellable?: boolean;
  location?: vscode.ProgressLocation;
}

export interface ProgressReport {
  message?: string;
  increment?: number;
}

/**
 * Helper for managing notifications and progress.
 */
export class NotificationHelper {
  private readonly logger: Logger;
  private readonly outputChannel: vscode.OutputChannel;

  constructor() {
    this.logger = new Logger('NotificationHelper');
    this.outputChannel = vscode.window.createOutputChannel('AlterCode');
  }

  /**
   * Show an information message.
   */
  info(message: string, ...actions: string[]): Thenable<string | undefined> {
    this.logger.info(message);
    this.outputChannel.appendLine(`[INFO] ${message}`);
    return vscode.window.showInformationMessage(message, ...actions);
  }

  /**
   * Show a warning message.
   */
  warn(message: string, ...actions: string[]): Thenable<string | undefined> {
    this.logger.warn(message);
    this.outputChannel.appendLine(`[WARN] ${message}`);
    return vscode.window.showWarningMessage(message, ...actions);
  }

  /**
   * Show an error message with optional details.
   */
  error(message: string, error?: unknown, ...actions: string[]): Thenable<string | undefined> {
    const errorDetail = error instanceof Error ? error.message : String(error || '');
    const fullMessage = errorDetail ? `${message}: ${errorDetail}` : message;

    this.logger.error(message, error);
    this.outputChannel.appendLine(`[ERROR] ${fullMessage}`);

    return vscode.window.showErrorMessage(fullMessage, ...actions);
  }

  /**
   * Run a task with progress notification.
   */
  async withProgress<T>(
    options: ProgressOptions,
    task: (
      progress: vscode.Progress<ProgressReport>,
      token: vscode.CancellationToken
    ) => Promise<T>
  ): Promise<T> {
    this.outputChannel.appendLine(`[PROGRESS] Starting: ${options.title}`);

    return vscode.window.withProgress(
      {
        location: options.location || vscode.ProgressLocation.Notification,
        title: options.title,
        cancellable: options.cancellable || false,
      },
      async (progress, token) => {
        try {
          const result = await task(progress, token);
          this.outputChannel.appendLine(`[PROGRESS] Completed: ${options.title}`);
          return result;
        } catch (error) {
          this.outputChannel.appendLine(
            `[PROGRESS] Failed: ${options.title} - ${error}`
          );
          throw error;
        }
      }
    );
  }

  /**
   * Show a quick pick with common styling.
   */
  async quickPick<T extends vscode.QuickPickItem>(
    items: T[],
    options?: vscode.QuickPickOptions
  ): Promise<T | undefined> {
    return vscode.window.showQuickPick(items, {
      placeHolder: 'Select an option...',
      ...options,
    });
  }

  /**
   * Show input box with validation.
   */
  async input(
    prompt: string,
    options?: {
      placeholder?: string;
      value?: string;
      validator?: (value: string) => string | null;
    }
  ): Promise<string | undefined> {
    return vscode.window.showInputBox({
      prompt,
      placeHolder: options?.placeholder,
      value: options?.value,
      validateInput: options?.validator,
      ignoreFocusOut: true,
    });
  }

  /**
   * Log to output channel.
   */
  log(message: string, level: 'info' | 'warn' | 'error' | 'debug' = 'info'): void {
    const timestamp = new Date().toISOString();
    this.outputChannel.appendLine(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
  }

  /**
   * Show the output channel.
   */
  showOutput(): void {
    this.outputChannel.show();
  }

  /**
   * Clear the output channel.
   */
  clearOutput(): void {
    this.outputChannel.clear();
  }

  /**
   * Dispose resources.
   */
  dispose(): void {
    this.outputChannel.dispose();
  }
}

// Singleton instance
let notificationHelperInstance: NotificationHelper | null = null;

export function getNotificationHelper(): NotificationHelper {
  if (!notificationHelperInstance) {
    notificationHelperInstance = new NotificationHelper();
  }
  return notificationHelperInstance;
}
