/**
 * Configuration Manager
 *
 * Manages AlterCode extension configuration.
 */

import * as vscode from 'vscode';
import {
  AlterCodeConfig,
  ApprovalMode,
  ClaudeConfig,
  GLMConfig,
  HierarchyConfig,
  QuotaConfig,
  UIConfig,
  StorageConfig,
} from '../types';
import { Logger } from './Logger';

/**
 * Manages extension configuration.
 */
export class ConfigurationManager {
  private readonly logger: Logger;
  private config: AlterCodeConfig | null = null;

  constructor() {
    this.logger = new Logger('ConfigurationManager');

    // Listen for configuration changes
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('altercode')) {
        this.config = null; // Invalidate cache
        this.logger.info('Configuration changed, cache invalidated');
      }
    });
  }

  /**
   * Get the current configuration.
   */
  getConfig(): AlterCodeConfig {
    if (this.config) {
      return this.config;
    }

    const config = vscode.workspace.getConfiguration('altercode');

    this.config = {
      enabled: config.get<boolean>('enabled', true),
      approvalMode: this.parseApprovalMode(config.get<string>('approvalMode', 'fully_manual')),

      claude: this.getClaudeConfig(config),
      glm: this.getGLMConfig(config),
      hierarchy: this.getHierarchyConfig(config),
      quota: this.getQuotaConfig(config),
      ui: this.getUIConfig(config),
      storage: this.getStorageConfig(config),
    };

    return this.config;
  }

  /**
   * Update a configuration value.
   */
  async updateConfig<K extends keyof AlterCodeConfig>(
    key: K,
    value: AlterCodeConfig[K],
    global: boolean = true
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration('altercode');
    await config.update(key, value, global);
    this.config = null; // Invalidate cache
  }

  /**
   * Get Claude configuration.
   */
  private getClaudeConfig(config: vscode.WorkspaceConfiguration): ClaudeConfig {
    return {
      cliPath: config.get<string>('claude.cliPath', ''),
      maxOutputTokens: config.get<number>('claude.maxOutputTokens', 16384),
      sessionPersistence: true,
    };
  }

  /**
   * Get GLM configuration.
   */
  private getGLMConfig(config: vscode.WorkspaceConfiguration): GLMConfig {
    return {
      endpoint: config.get<string>(
        'glm.endpoint',
        'https://api.z.ai/api/coding/paas/v4/chat/completions'
      ),
      apiKey: config.get<string>('glm.apiKey', ''),
      model: config.get<string>('glm.model', 'glm-4.7'),
      maxTokens: config.get<number>('glm.maxTokens', 4096),
      temperature: config.get<number>('glm.temperature', 0.7),
    };
  }

  /**
   * Check if GLM is configured (has API key).
   */
  isGLMConfigured(): boolean {
    const config = this.getConfig();
    return config.glm.apiKey.length > 0;
  }

  /**
   * Get hierarchy configuration.
   */
  private getHierarchyConfig(config: vscode.WorkspaceConfiguration): HierarchyConfig {
    return {
      maxConcurrentWorkers: config.get<number>('hierarchy.maxConcurrentWorkers', 10),
      enableSpecialists: config.get<boolean>('hierarchy.enableSpecialists', true),
      complexityThreshold: config.get<number>('hierarchy.complexityThreshold', 60),
    };
  }

  /**
   * Get quota configuration.
   */
  private getQuotaConfig(config: vscode.WorkspaceConfiguration): QuotaConfig {
    return {
      warningThreshold: config.get<number>('quota.warningThreshold', 0.8),
      hardStopThreshold: config.get<number>('quota.hardStopThreshold', 0.95),
      enablePrediction: true,
    };
  }

  /**
   * Get UI configuration.
   */
  private getUIConfig(config: vscode.WorkspaceConfiguration): UIConfig {
    return {
      showStatusBar: config.get<boolean>('ui.showStatusBar', true),
      autoOpenMissionControl: config.get<boolean>('ui.autoOpenMissionControl', true),
      inlineActionsEnabled: true,
    };
  }

  /**
   * Get storage configuration.
   */
  private getStorageConfig(config: vscode.WorkspaceConfiguration): StorageConfig {
    return {
      databasePath: '', // Will be set based on extension context
      cachePath: '',
      maxHistoryDays: config.get<number>('storage.maxHistoryDays', 30),
    };
  }

  /**
   * Parse approval mode from string.
   */
  private parseApprovalMode(value: string): ApprovalMode {
    switch (value) {
      case 'full_automation':
        return ApprovalMode.FULL_AUTOMATION;
      case 'step_by_step':
        return ApprovalMode.STEP_BY_STEP;
      case 'fully_manual':
      default:
        return ApprovalMode.FULLY_MANUAL;
    }
  }
}
