/**
 * AlterCode - VS Code Extension Entry Point
 *
 * This is the main entry point for the AlterCode extension.
 * It handles activation, command registration, and lifecycle management.
 */

import * as vscode from 'vscode';
import { AlterCodeCore } from './core/AlterCodeCore';
import { StatusBarProvider } from './ui/StatusBarProvider';
import { UnifiedChatProvider } from './ui/UnifiedChatProvider';
import { MissionControlPanel } from './ui/MissionControlPanel';
import { AlterCodeActionProvider } from './ui/AlterCodeActionProvider';
import { ConfigurationManager } from './utils/ConfigurationManager';
import { Logger } from './utils/Logger';
import { StartupValidator } from './utils/StartupValidator';
import { getClaudeCliValidator } from './utils/ClaudeCliValidator';
import { getNotificationHelper } from './utils/NotificationHelper';
import { LogLevel } from './types';

let core: AlterCodeCore | undefined;
let logger: Logger;
let statusBarProvider: StatusBarProvider | undefined;

/**
 * Extension activation function.
 * Called when the extension is activated.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Enable debug logging for development
  Logger.setMinLevel(LogLevel.DEBUG);

  logger = new Logger('AlterCode');
  logger.info('Activating AlterCode extension...');

  try {
    // Initialize configuration
    const configManager = new ConfigurationManager();
    const config = configManager.getConfig();

    if (!config.enabled) {
      logger.info('AlterCode is disabled in configuration');
      return;
    }

    // Run startup validation
    const startupValidator = new StartupValidator(configManager);
    const isFirstRun = await startupValidator.isFirstRun(context);
    const validationResult = await startupValidator.validate();

    // Show welcome message for first run
    if (isFirstRun) {
      const action = await vscode.window.showInformationMessage(
        'Welcome to AlterCode! Would you like to configure the extension?',
        'Configure',
        'Later'
      );
      if (action === 'Configure') {
        await startupValidator.showResults(validationResult);
      }
    } else if (!validationResult.valid) {
      // Show validation errors on subsequent runs
      await startupValidator.showResults(validationResult);
    }

    // Initialize core
    core = new AlterCodeCore(context, config);
    await core.initialize();

    // Register UI providers
    statusBarProvider = registerUIProviders(context, core, configManager);

    // Register commands
    registerCommands(context, core, statusBarProvider, configManager);

    // Register code action provider
    registerCodeActionProvider(context);

    logger.info('AlterCode extension activated successfully');

    // Show ready notification if CLI is available
    if (validationResult.claudeStatus.installed) {
      const notification = getNotificationHelper();
      notification.log(`AlterCode ready - Claude CLI v${validationResult.claudeStatus.version}`);
    }
  } catch (error) {
    logger.error('Failed to activate AlterCode extension', error);
    vscode.window.showErrorMessage(`AlterCode activation failed: ${error}`);
  }
}

/**
 * Extension deactivation function.
 * Called when the extension is deactivated.
 */
export async function deactivate(): Promise<void> {
  logger?.info('Deactivating AlterCode extension...');

  if (core) {
    await core.dispose();
    core = undefined;
  }

  logger?.info('AlterCode extension deactivated');
}

/**
 * Register UI providers (status bar, sidebar, etc.)
 */
function registerUIProviders(
  context: vscode.ExtensionContext,
  core: AlterCodeCore,
  configManager: ConfigurationManager
): StatusBarProvider {
  // Status bar
  const statusBar = new StatusBarProvider(core);
  context.subscriptions.push(statusBar);

  // Unified chat view (combines Chat, Tasks, and Settings in one tabbed interface)
  const unifiedProvider = new UnifiedChatProvider(context.extensionUri, core, configManager);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      UnifiedChatProvider.viewType,
      unifiedProvider
    )
  );

  logger.debug('UI providers registered');

  return statusBar;
}

/**
 * Register extension commands.
 */
function registerCommands(
  context: vscode.ExtensionContext,
  core: AlterCodeCore,
  statusBar: StatusBarProvider,
  configManager: ConfigurationManager
): void {
  // Activate command
  context.subscriptions.push(
    vscode.commands.registerCommand('altercode.activate', async () => {
      vscode.window.showInformationMessage('AlterCode is active!');
    })
  );

  // Check CLI Status command
  context.subscriptions.push(
    vscode.commands.registerCommand('altercode.checkCliStatus', async () => {
      const notification = getNotificationHelper();
      const validator = getClaudeCliValidator();

      await notification.withProgress(
        { title: 'Checking Claude CLI status...' },
        async () => {
          validator.clearCache();
          await statusBar.refreshCliStatus();
          const status = statusBar.getCliStatus();

          if (status?.installed && status.authenticated) {
            notification.info(`Claude CLI is ready (v${status.version})`);
          } else if (status?.installed) {
            await validator.showInstallationPrompt();
          } else {
            await validator.showInstallationPrompt();
          }
        }
      );
    })
  );

  // Test Claude CLI directly (for debugging)
  context.subscriptions.push(
    vscode.commands.registerCommand('altercode.testClaude', async () => {
      const { spawn } = require('child_process');

      vscode.window.showInformationMessage('Testing Claude CLI...');

      const childProcess = spawn('claude', ['--print', '--output-format', 'text', '-'], {
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      childProcess.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      childProcess.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      childProcess.on('error', (error: Error) => {
        vscode.window.showErrorMessage(`Claude CLI spawn error: ${error.message}`);
      });

      childProcess.on('close', (code: number | null) => {
        if (code === 0 && stdout) {
          vscode.window.showInformationMessage(`Claude responded: ${stdout.trim().substring(0, 100)}`);
        } else {
          vscode.window.showErrorMessage(`Claude CLI failed (code ${code}): ${stderr || 'No output'}`);
        }
      });

      // Send test prompt
      childProcess.stdin.write('Say just the word "success"');
      childProcess.stdin.end();

      // Timeout
      setTimeout(() => {
        childProcess.kill('SIGTERM');
      }, 30000);
    })
  );

  // Test Mission System (for debugging)
  context.subscriptions.push(
    vscode.commands.registerCommand('altercode.testMission', async () => {
      const outputChannel = vscode.window.createOutputChannel('AlterCode Debug');
      outputChannel.show();

      outputChannel.appendLine('[TEST] Starting mission system test...');
      outputChannel.appendLine(`[TEST] Time: ${new Date().toISOString()}`);

      try {
        outputChannel.appendLine('[TEST] Calling submitPlanningDocument...');
        const mission = await core.submitPlanningDocument('Create a simple hello world function');
        outputChannel.appendLine(`[TEST] Mission created: ${mission.id}`);
        outputChannel.appendLine(`[TEST] Title: ${mission.title}`);
        outputChannel.appendLine(`[TEST] Status: ${mission.status}`);
        outputChannel.appendLine(`[TEST] Root Tasks: ${mission.rootTaskIds.length}`);

        // Subscribe to state changes for real-time updates
        outputChannel.appendLine('[TEST] Subscribing to state changes...');
        const disposable = core.onStateChange((state) => {
          outputChannel.appendLine(`[STATE] Update at ${new Date().toISOString()}`);
          outputChannel.appendLine(`[STATE]   Mission: ${state.activeMission?.status || 'none'}`);
          outputChannel.appendLine(`[STATE]   Queue: ${state.taskQueue.length}, Running: ${state.runningTasks.length}, Completed: ${state.completedTasks.length}`);
        });

        // Initial state
        const state = core.getHiveState();
        outputChannel.appendLine(`[TEST] --- Initial State ---`);
        outputChannel.appendLine(`[TEST] Active Mission: ${state.activeMission?.id || 'none'}`);
        outputChannel.appendLine(`[TEST] Agents: ${state.agents.length}`);
        outputChannel.appendLine(`[TEST] Task Queue: ${state.taskQueue.length}`);
        outputChannel.appendLine(`[TEST] Running Tasks: ${state.runningTasks.length}`);
        outputChannel.appendLine(`[TEST] Completed Tasks: ${state.completedTasks.length}`);

        // List agents
        outputChannel.appendLine(`[TEST] --- Agents ---`);
        for (const agent of state.agents) {
          outputChannel.appendLine(`[TEST]   ${agent.role} (Level ${agent.level}) - ${agent.status}`);
        }

        // List tasks
        outputChannel.appendLine(`[TEST] --- All Tasks ---`);
        const allTasks = [...state.taskQueue, ...state.runningTasks, ...state.completedTasks];
        for (const task of allTasks) {
          outputChannel.appendLine(`[TEST]   ${task.id.substring(0, 8)}: ${task.title.substring(0, 40)} - ${task.status}`);
        }

        outputChannel.appendLine('[TEST] Mission submitted, execution in progress...');
        outputChannel.appendLine('[TEST] Watch the Output channel for state updates and logs.');

        vscode.window.showInformationMessage(`Mission created: ${mission.title}`);

        // Keep checking status for 30 seconds
        let checkCount = 0;
        const intervalId = setInterval(() => {
          checkCount++;
          const currentState = core.getHiveState();
          const missionStatus = currentState.activeMission?.status || 'none';
          outputChannel.appendLine(`[CHECK ${checkCount}] Mission: ${missionStatus}, Queue: ${currentState.taskQueue.length}, Running: ${currentState.runningTasks.length}, Completed: ${currentState.completedTasks.length}`);

          if (missionStatus === 'completed' || missionStatus === 'failed' || missionStatus === 'cancelled' || checkCount >= 30) {
            clearInterval(intervalId);
            disposable.dispose();
            outputChannel.appendLine(`[TEST] Final status: ${missionStatus}`);
          }
        }, 1000);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : '';
        outputChannel.appendLine(`[TEST] ERROR: ${errorMessage}`);
        outputChannel.appendLine(`[TEST] Stack: ${errorStack}`);
        vscode.window.showErrorMessage(`Mission test failed: ${errorMessage}`);
      }
    })
  );

  // Show Mission Control
  context.subscriptions.push(
    vscode.commands.registerCommand('altercode.showMissionControl', async () => {
      MissionControlPanel.createOrShow(context.extensionUri, core, configManager);
    })
  );

  // Show Chat
  context.subscriptions.push(
    vscode.commands.registerCommand('altercode.showChat', async () => {
      await vscode.commands.executeCommand('altercode.chatView.focus');
    })
  );

  // Submit Planning Document
  context.subscriptions.push(
    vscode.commands.registerCommand('altercode.submitPlan', async () => {
      const notification = getNotificationHelper();

      // Check CLI status first
      const cliStatus = statusBar.getCliStatus();
      if (!cliStatus?.installed) {
        const action = await notification.error(
          'Claude CLI is not installed',
          null,
          'Setup',
          'Cancel'
        );
        if (action === 'Setup') {
          const validator = getClaudeCliValidator();
          await validator.showInstallationPrompt();
        }
        return;
      }

      const document = await notification.input(
        'Enter your planning document or describe what you want to accomplish',
        {
          placeholder: 'e.g., Add user authentication with JWT tokens and password reset...',
        }
      );

      if (document) {
        try {
          await notification.withProgress(
            {
              title: 'AlterCode: Analyzing plan...',
              cancellable: true,
              location: vscode.ProgressLocation.Notification,
            },
            async (progress, token) => {
              progress.report({ message: 'Creating mission structure...' });

              const mission = await core.submitPlanningDocument(document);

              if (token.isCancellationRequested) {
                await core.cancelMission(mission.id);
                return;
              }

              progress.report({ message: 'Mission started!' });
              notification.info(`Mission "${mission.title}" started with ${mission.rootTaskIds.length} tasks`);
            }
          );
        } catch (error) {
          notification.error('Failed to submit plan', error, 'Show Output');
        }
      }
    })
  );

  // Configure
  context.subscriptions.push(
    vscode.commands.registerCommand('altercode.configure', async () => {
      await vscode.commands.executeCommand(
        'workbench.action.openSettings',
        '@ext:altercode.altercode'
      );
    })
  );

  // Show Output
  context.subscriptions.push(
    vscode.commands.registerCommand('altercode.showOutput', () => {
      const notification = getNotificationHelper();
      notification.showOutput();
    })
  );

  // Pause Mission
  context.subscriptions.push(
    vscode.commands.registerCommand('altercode.pauseMission', async () => {
      const mission = core.getActiveMission();
      if (mission) {
        await core.pauseMission(mission.id);
        vscode.window.showInformationMessage('Mission paused');
      } else {
        vscode.window.showWarningMessage('No active mission to pause');
      }
    })
  );

  // Resume Mission
  context.subscriptions.push(
    vscode.commands.registerCommand('altercode.resumeMission', async () => {
      const mission = core.getActiveMission();
      if (mission) {
        await core.resumeMission(mission.id);
        vscode.window.showInformationMessage('Mission resumed');
      } else {
        vscode.window.showWarningMessage('No paused mission to resume');
      }
    })
  );

  // Cancel Mission
  context.subscriptions.push(
    vscode.commands.registerCommand('altercode.cancelMission', async () => {
      const mission = core.getActiveMission();
      if (mission) {
        const confirm = await vscode.window.showWarningMessage(
          'Are you sure you want to cancel the current mission?',
          { modal: true },
          'Cancel Mission'
        );

        if (confirm === 'Cancel Mission') {
          await core.cancelMission(mission.id);
          vscode.window.showInformationMessage('Mission cancelled');
        }
      } else {
        vscode.window.showWarningMessage('No active mission to cancel');
      }
    })
  );

  // Review Selection
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'altercode.reviewSelection',
      async (document?: vscode.TextDocument, range?: vscode.Range) => {
        const editor = vscode.window.activeTextEditor;
        const doc = document || editor?.document;
        const selection = range || editor?.selection;

        if (!doc || !selection) {
          vscode.window.showWarningMessage('Please select some code to review');
          return;
        }

        const content = doc.getText(selection);
        await core.quickAction({
          action: 'review',
          filePath: doc.uri.fsPath,
          startLine: selection.start.line,
          endLine: selection.end.line,
          content,
        });
      }
    )
  );

  // Refactor Selection
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'altercode.refactorSelection',
      async (document?: vscode.TextDocument, range?: vscode.Range) => {
        const editor = vscode.window.activeTextEditor;
        const doc = document || editor?.document;
        const selection = range || editor?.selection;

        if (!doc || !selection) {
          vscode.window.showWarningMessage('Please select some code to refactor');
          return;
        }

        const content = doc.getText(selection);
        await core.quickAction({
          action: 'refactor',
          filePath: doc.uri.fsPath,
          startLine: selection.start.line,
          endLine: selection.end.line,
          content,
        });
      }
    )
  );

  // Explain Selection
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'altercode.explainSelection',
      async (document?: vscode.TextDocument, range?: vscode.Range) => {
        const editor = vscode.window.activeTextEditor;
        const doc = document || editor?.document;
        const selection = range || editor?.selection;

        if (!doc || !selection) {
          vscode.window.showWarningMessage('Please select some code to explain');
          return;
        }

        const content = doc.getText(selection);
        await core.quickAction({
          action: 'explain',
          filePath: doc.uri.fsPath,
          startLine: selection.start.line,
          endLine: selection.end.line,
          content,
        });
      }
    )
  );

  // Show Quota Status
  context.subscriptions.push(
    vscode.commands.registerCommand('altercode.showQuotaStatus', async () => {
      const status = core.getQuotaStatus();
      const message = formatQuotaStatus(status);
      vscode.window.showInformationMessage(message);
    })
  );

  logger.debug('Commands registered');
}

/**
 * Register code action provider for inline actions.
 */
function registerCodeActionProvider(context: vscode.ExtensionContext): void {
  const provider = new AlterCodeActionProvider();

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { scheme: 'file' },
      provider,
      {
        providedCodeActionKinds: AlterCodeActionProvider.providedCodeActionKinds,
      }
    )
  );

  logger.debug('Code action provider registered');
}

/**
 * Format quota status for display.
 */
function formatQuotaStatus(
  status: Record<string, { usageRatio: number; status: string; timeUntilResetMs: number }>
): string {
  const lines: string[] = ['AlterCode Quota Status:'];

  for (const [provider, data] of Object.entries(status)) {
    const percentage = Math.round(data.usageRatio * 100);
    const resetMinutes = Math.round(data.timeUntilResetMs / 60000);
    lines.push(`  ${provider}: ${percentage}% used (${data.status}) - resets in ${resetMinutes}m`);
  }

  return lines.join('\n');
}
