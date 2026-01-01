/**
 * Logger Implementation
 *
 * Provides structured logging with levels, component namespacing,
 * and configurable output destinations.
 */

import { ILogger, LogLevel, LogEntry, LoggerConfig } from '../types';

/** Log level priorities (higher = more important) */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** Log level colors for console output */
const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[36m', // Cyan
  info: '\x1b[32m',  // Green
  warn: '\x1b[33m',  // Yellow
  error: '\x1b[31m', // Red
};

const RESET_COLOR = '\x1b[0m';

/**
 * Logger implementation with component namespacing
 */
export class Logger implements ILogger {
  private static globalConfig: LoggerConfig = {
    level: 'info',
    output: 'console',
  };

  private static listeners: Array<(entry: LogEntry) => void> = [];

  readonly component: string;
  private readonly config: LoggerConfig;

  constructor(component: string, config?: Partial<LoggerConfig>) {
    this.component = component;
    this.config = { ...Logger.globalConfig, ...config };
  }

  /**
   * Set global logger configuration
   */
  static configure(config: Partial<LoggerConfig>): void {
    Logger.globalConfig = { ...Logger.globalConfig, ...config };
  }

  /**
   * Get global logger configuration
   */
  static getConfig(): LoggerConfig {
    return { ...Logger.globalConfig };
  }

  /**
   * Add a log listener
   */
  static addListener(listener: (entry: LogEntry) => void): () => void {
    Logger.listeners.push(listener);
    return () => {
      const index = Logger.listeners.indexOf(listener);
      if (index !== -1) {
        Logger.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Create a root logger
   */
  static create(component: string): ILogger {
    return new Logger(component);
  }

  debug(message: string, data?: unknown): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: unknown): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log('warn', message, data);
  }

  error(message: string, error?: Error, data?: unknown): void {
    this.log('error', message, data, error);
  }

  child(name: string): ILogger {
    return new Logger(`${this.component}:${name}`, this.config);
  }

  private log(level: LogLevel, message: string, data?: unknown, error?: Error): void {
    // Check if this level should be logged
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.config.level]) {
      return;
    }

    const entry: LogEntry = {
      level,
      timestamp: new Date(),
      component: this.component,
      message,
      data,
      error: error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : undefined,
    };

    // Output to configured destinations
    if (this.config.output === 'console' || this.config.output === 'both') {
      this.writeToConsole(entry);
    }

    // Notify listeners
    for (const listener of Logger.listeners) {
      try {
        listener(entry);
      } catch {
        // Ignore listener errors
      }
    }
  }

  private writeToConsole(entry: LogEntry): void {
    const timestamp = entry.timestamp.toISOString();
    const color = LOG_LEVEL_COLORS[entry.level];
    const levelStr = entry.level.toUpperCase().padEnd(5);

    let output = `${color}[${timestamp}] [${levelStr}] [${entry.component}]${RESET_COLOR} ${entry.message}`;

    if (entry.data !== undefined) {
      output += `\n  Data: ${this.formatData(entry.data)}`;
    }

    if (entry.error) {
      output += `\n  Error: ${entry.error.name}: ${entry.error.message}`;
      if (entry.error.stack) {
        output += `\n  Stack: ${entry.error.stack}`;
      }
    }

    switch (entry.level) {
      case 'debug':
        console.debug(output);
        break;
      case 'info':
        console.info(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      case 'error':
        console.error(output);
        break;
    }
  }

  private formatData(data: unknown): string {
    if (data === null) return 'null';
    if (data === undefined) return 'undefined';
    if (typeof data === 'string') return data;
    if (typeof data === 'number' || typeof data === 'boolean') return String(data);

    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }
}

/**
 * Create a logger for a component
 */
export function createLogger(component: string): ILogger {
  return Logger.create(component);
}

/**
 * No-op logger for testing or disabled logging
 */
export class NullLogger implements ILogger {
  readonly component: string;

  constructor(component: string = 'null') {
    this.component = component;
  }

  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}

  child(name: string): ILogger {
    return new NullLogger(`${this.component}:${name}`);
  }
}
