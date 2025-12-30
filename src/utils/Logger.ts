/**
 * Logger
 *
 * Centralized logging utility for AlterCode.
 */

import * as vscode from 'vscode';
import { LogLevel } from '../types';

/**
 * Logger instance for a specific module.
 */
export class Logger {
  private static outputChannel: vscode.OutputChannel | null = null;
  private readonly module: string;
  private static minLevel: LogLevel = LogLevel.INFO;

  constructor(module: string) {
    this.module = module;

    // Initialize output channel if not already done
    if (!Logger.outputChannel) {
      Logger.outputChannel = vscode.window.createOutputChannel('AlterCode');
    }
  }

  /**
   * Set the minimum log level.
   */
  static setMinLevel(level: LogLevel): void {
    Logger.minLevel = level;
  }

  /**
   * Log a debug message.
   */
  debug(message: string, ...args: unknown[]): void {
    this.log(LogLevel.DEBUG, message, ...args);
  }

  /**
   * Log an info message.
   */
  info(message: string, ...args: unknown[]): void {
    this.log(LogLevel.INFO, message, ...args);
  }

  /**
   * Log a warning message.
   */
  warn(message: string, ...args: unknown[]): void {
    this.log(LogLevel.WARN, message, ...args);
  }

  /**
   * Log an error message.
   */
  error(message: string, error?: unknown, ...args: unknown[]): void {
    let errorMessage = message;

    if (error instanceof Error) {
      errorMessage += `: ${error.message}`;
      if (error.stack) {
        errorMessage += `\n${error.stack}`;
      }
    } else if (error !== undefined) {
      errorMessage += `: ${String(error)}`;
    }

    this.log(LogLevel.ERROR, errorMessage, ...args);
  }

  /**
   * Internal log method.
   */
  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const timestamp = new Date().toISOString();
    const levelStr = level.toUpperCase().padEnd(5);
    const moduleStr = this.module.padEnd(20);

    let formattedMessage = `[${timestamp}] [${levelStr}] [${moduleStr}] ${message}`;

    if (args.length > 0) {
      formattedMessage += ' ' + args.map((arg) => this.stringify(arg)).join(' ');
    }

    // Write to output channel
    Logger.outputChannel?.appendLine(formattedMessage);

    // Also log to console in development
    if (process.env.NODE_ENV === 'development') {
      switch (level) {
        case LogLevel.DEBUG:
          console.debug(formattedMessage);
          break;
        case LogLevel.INFO:
          console.info(formattedMessage);
          break;
        case LogLevel.WARN:
          console.warn(formattedMessage);
          break;
        case LogLevel.ERROR:
          console.error(formattedMessage);
          break;
      }
    }
  }

  /**
   * Check if a log level should be logged.
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const minIndex = levels.indexOf(Logger.minLevel);
    const currentIndex = levels.indexOf(level);
    return currentIndex >= minIndex;
  }

  /**
   * Stringify a value for logging.
   */
  private stringify(value: unknown): string {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);

    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  /**
   * Show the output channel.
   */
  static show(): void {
    Logger.outputChannel?.show();
  }

  /**
   * Clear the output channel.
   */
  static clear(): void {
    Logger.outputChannel?.clear();
  }

  /**
   * Dispose the output channel.
   */
  static dispose(): void {
    Logger.outputChannel?.dispose();
    Logger.outputChannel = null;
  }
}
