/**
 * Configuration Manager Implementation
 *
 * Manages AlterCode configuration with persistence,
 * validation, and change notification.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  IConfigManager,
  AlterCodeConfig,
  DEFAULT_CONFIG,
  Disposable,
  ILogger,
  IFileSystem,
  FilePath,
  toFilePath,
  AsyncResult,
  Ok,
  Err,
  AppError,
} from '../types';

/** Configuration file name */
const CONFIG_FILE_NAME = 'altercode.config.json';

/** Deep merge utility type */
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Configuration Manager implementation
 */
export class ConfigManager implements IConfigManager {
  private config: AlterCodeConfig;
  private readonly configPath: FilePath;
  private readonly logger?: ILogger;
  private readonly fileSystem?: IFileSystem;
  private readonly listeners: Array<(config: AlterCodeConfig) => void> = [];
  private fileWatcher?: Disposable;

  constructor(
    projectRoot: FilePath,
    options?: {
      logger?: ILogger;
      fileSystem?: IFileSystem;
      initialConfig?: DeepPartial<AlterCodeConfig>;
    }
  ) {
    this.logger = options?.logger?.child('ConfigManager');
    this.fileSystem = options?.fileSystem;
    this.configPath = toFilePath(
      path.join(projectRoot as string, '.altercode', CONFIG_FILE_NAME)
    );

    // Initialize with defaults merged with any initial config
    this.config = this.deepMerge(
      { ...DEFAULT_CONFIG, projectRoot },
      options?.initialConfig ?? {}
    );

    // Try to load existing config
    this.loadFromDisk();

    // Watch for config file changes
    this.setupFileWatcher();
  }

  getConfig(): AlterCodeConfig {
    return { ...this.config };
  }

  get<K extends keyof AlterCodeConfig>(key: K): AlterCodeConfig[K] {
    return this.config[key];
  }

  async update<K extends keyof AlterCodeConfig>(
    key: K,
    value: Partial<AlterCodeConfig[K]>
  ): AsyncResult<void> {
    try {
      const currentValue = this.config[key];

      // Merge the update
      const newValue =
        typeof currentValue === 'object' && currentValue !== null
          ? { ...currentValue, ...value }
          : value;

      // Create new config
      const newConfig = {
        ...this.config,
        [key]: newValue,
      };

      // Validate the new config
      const validationError = this.validateConfig(newConfig);
      if (validationError) {
        return Err(new AppError('VALIDATION', validationError));
      }

      // Apply the change
      this.config = newConfig;

      // Persist to disk
      await this.saveToDisk();

      // Notify listeners
      this.notifyListeners();

      this.logger?.info('Configuration updated', { key });
      return Ok(undefined);
    } catch (error) {
      this.logger?.error('Failed to update configuration', error as Error);
      return Err(
        new AppError(
          'INFRASTRUCTURE',
          `Failed to update configuration: ${(error as Error).message}`
        )
      );
    }
  }

  async reset(): AsyncResult<void> {
    try {
      this.config = { ...DEFAULT_CONFIG, projectRoot: this.config.projectRoot };
      await this.saveToDisk();
      this.notifyListeners();
      this.logger?.info('Configuration reset to defaults');
      return Ok(undefined);
    } catch (error) {
      return Err(
        new AppError(
          'INFRASTRUCTURE',
          `Failed to reset configuration: ${(error as Error).message}`
        )
      );
    }
  }

  onConfigChange(callback: (config: AlterCodeConfig) => void): Disposable {
    this.listeners.push(callback);
    return {
      dispose: () => {
        const index = this.listeners.indexOf(callback);
        if (index !== -1) {
          this.listeners.splice(index, 1);
        }
      },
    };
  }

  /**
   * Dispose the config manager
   */
  dispose(): void {
    this.fileWatcher?.dispose();
    this.listeners.length = 0;
  }

  /**
   * Load configuration from disk
   */
  private loadFromDisk(): void {
    try {
      const configPath = this.configPath as string;
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf-8');
        const loadedConfig = JSON.parse(content);

        // Merge with defaults to ensure all fields exist
        this.config = this.deepMerge(this.config, loadedConfig);
        this.logger?.debug('Configuration loaded from disk');
      }
    } catch (error) {
      this.logger?.warn('Failed to load configuration from disk', { error });
    }
  }

  /**
   * Save configuration to disk
   */
  private async saveToDisk(): Promise<void> {
    try {
      const configPath = this.configPath as string;
      const dir = path.dirname(configPath);

      // Ensure directory exists
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write config file
      fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2));
      this.logger?.debug('Configuration saved to disk');
    } catch (error) {
      this.logger?.error('Failed to save configuration to disk', error as Error);
      throw error;
    }
  }

  /**
   * Set up file watcher for config changes
   */
  private setupFileWatcher(): void {
    if (!this.fileSystem) return;

    const configDir = toFilePath(path.dirname(this.configPath as string));

    try {
      // Ensure directory exists before watching
      if (!fs.existsSync(configDir as string)) {
        fs.mkdirSync(configDir as string, { recursive: true });
      }

      this.fileWatcher = this.fileSystem.watch(configDir, (event) => {
        if (event.path === this.configPath && event.type === 'change') {
          this.logger?.debug('Config file changed on disk');
          this.loadFromDisk();
          this.notifyListeners();
        }
      });
    } catch (error) {
      this.logger?.warn('Failed to set up config file watcher', { error });
    }
  }

  /**
   * Notify all listeners of config change
   */
  private notifyListeners(): void {
    const configCopy = this.getConfig();
    for (const listener of this.listeners) {
      try {
        listener(configCopy);
      } catch (error) {
        this.logger?.error('Config listener error', error as Error);
      }
    }
  }

  /**
   * Validate configuration
   */
  private validateConfig(config: AlterCodeConfig): string | null {
    // Validate required fields
    if (!config.projectRoot) {
      return 'projectRoot is required';
    }

    // Validate Claude config
    if (config.claude && config.claude.maxOutputTokens <= 0) {
      return 'claude.maxOutputTokens must be positive';
    }

    if (config.claude && config.claude.timeout <= 0) {
      return 'claude.timeout must be positive';
    }

    // Validate storage config
    if (config.storage && config.storage.maxSnapshots < 0) {
      return 'storage.maxSnapshots must be non-negative';
    }

    if (config.storage && config.storage.cacheMaxSize <= 0) {
      return 'storage.cacheMaxSize must be positive';
    }

    return null;
  }

  /**
   * Deep merge two objects
   */
  private deepMerge<T extends object>(target: T, source: DeepPartial<T>): T {
    const result = { ...target };

    for (const key of Object.keys(source) as Array<keyof T>) {
      const sourceValue = source[key];
      const targetValue = target[key];

      if (
        sourceValue !== undefined &&
        typeof sourceValue === 'object' &&
        sourceValue !== null &&
        !Array.isArray(sourceValue) &&
        typeof targetValue === 'object' &&
        targetValue !== null
      ) {
        (result as Record<string, unknown>)[key as string] = this.deepMerge(
          targetValue as object,
          sourceValue as DeepPartial<typeof targetValue>
        );
      } else if (sourceValue !== undefined) {
        (result as Record<string, unknown>)[key as string] = sourceValue;
      }
    }

    return result;
  }
}

/**
 * Create a config manager
 */
export function createConfigManager(
  projectRoot: FilePath,
  options?: {
    logger?: ILogger;
    fileSystem?: IFileSystem;
    initialConfig?: DeepPartial<AlterCodeConfig>;
  }
): IConfigManager {
  return new ConfigManager(projectRoot, options);
}

/**
 * Create a config manager for VS Code extension context
 */
export function createVSCodeConfigManager(
  extensionContext: { extensionPath: string },
  workspaceRoot: string,
  logger?: ILogger,
  fileSystem?: IFileSystem
): IConfigManager {
  return new ConfigManager(toFilePath(workspaceRoot), {
    logger,
    fileSystem,
  });
}
