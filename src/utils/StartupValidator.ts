/**
 * Startup Validator
 *
 * Validates configuration and dependencies on extension startup.
 * Provides helpful guidance for first-time users.
 */

import * as vscode from 'vscode';
import { getClaudeCliValidator, ClaudeCliStatus } from './ClaudeCliValidator';
import { ConfigurationManager } from './ConfigurationManager';
import { Logger } from './Logger';

export interface ValidationResult {
  valid: boolean;
  claudeStatus: ClaudeCliStatus;
  glmConfigured: boolean;
  warnings: string[];
  errors: string[];
}

/**
 * Validates the extension configuration on startup.
 */
export class StartupValidator {
  private readonly logger: Logger;
  private readonly configManager: ConfigurationManager;

  constructor(configManager: ConfigurationManager) {
    this.logger = new Logger('StartupValidator');
    this.configManager = configManager;
  }

  /**
   * Run all validation checks.
   */
  async validate(): Promise<ValidationResult> {
    this.logger.info('Running startup validation...');

    const config = this.configManager.getConfig();
    const claudeValidator = getClaudeCliValidator();
    const claudeStatus = await claudeValidator.validate(config.claude.cliPath);
    const glmConfigured = this.configManager.isGLMConfigured();

    const warnings: string[] = [];
    const errors: string[] = [];

    // Check Claude CLI
    if (!claudeStatus.installed) {
      errors.push('Claude CLI is not installed');
    } else if (!claudeStatus.authenticated) {
      warnings.push('Claude CLI may need authentication');
    }

    // Check GLM (optional but recommended for cost optimization)
    if (!glmConfigured) {
      warnings.push('GLM API not configured (Claude will be used for all levels)');
    }

    // Check approval mode
    if (config.approvalMode === 'full_automation') {
      warnings.push('Full automation mode is enabled - changes will be applied without review');
    }

    const valid = errors.length === 0;

    this.logger.info(
      `Validation complete: valid=${valid}, warnings=${warnings.length}, errors=${errors.length}`
    );

    return {
      valid,
      claudeStatus,
      glmConfigured,
      warnings,
      errors,
    };
  }

  /**
   * Show validation results to user.
   */
  async showResults(result: ValidationResult): Promise<void> {
    // Show errors first
    if (result.errors.length > 0) {
      const action = await vscode.window.showErrorMessage(
        `AlterCode: ${result.errors.join('; ')}`,
        'Setup',
        'Dismiss'
      );

      if (action === 'Setup') {
        await this.openSetupWizard(result);
      }
      return;
    }

    // Show warnings if any
    if (result.warnings.length > 0) {
      const action = await vscode.window.showWarningMessage(
        `AlterCode ready with warnings: ${result.warnings[0]}`,
        'Configure',
        'Dismiss'
      );

      if (action === 'Configure') {
        vscode.commands.executeCommand('altercode.configure');
      }
    }
  }

  /**
   * Open the setup wizard for first-time configuration.
   */
  private async openSetupWizard(result: ValidationResult): Promise<void> {
    const claudeValidator = getClaudeCliValidator();

    // Check what needs to be done
    if (!result.claudeStatus.installed) {
      await claudeValidator.showInstallationPrompt();
    } else if (!result.claudeStatus.authenticated) {
      const action = await vscode.window.showInformationMessage(
        'Claude CLI needs authentication. Open terminal to run "claude"?',
        'Open Terminal',
        'Later'
      );

      if (action === 'Open Terminal') {
        const terminal = vscode.window.createTerminal('Claude Auth');
        terminal.show();
        terminal.sendText('claude');
      }
    }
  }

  /**
   * Check if this is a first-time run.
   */
  async isFirstRun(context: vscode.ExtensionContext): Promise<boolean> {
    const hasRun = context.globalState.get<boolean>('altercode.hasRunBefore');
    if (!hasRun) {
      await context.globalState.update('altercode.hasRunBefore', true);
      return true;
    }
    return false;
  }
}
