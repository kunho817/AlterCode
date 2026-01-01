/**
 * AlterCode VS Code Extension
 *
 * Main entry point for the VS Code extension:
 * - Extension activation/deactivation
 * - Command registration
 * - UI providers setup
 * - Core initialization
 */

import * as vscode from 'vscode';
import {
  AlterCodeConfig,
  IEventBus,
  IApprovalService,
  MissionId,
  toFilePath,
} from './types';

import { bootstrap, SERVICE_TOKENS, AlterCodeCore } from './core';
import { MissionControlPanel, ChatProvider, ApprovalUI, createApprovalUI } from './ui';

// Global state
let core: AlterCodeCore | undefined;
let eventBus: IEventBus | undefined;
let outputChannel: vscode.OutputChannel | undefined;
let approvalUI: ApprovalUI | undefined;
let statusBarQuota: vscode.StatusBarItem | undefined;

/**
 * Extension activation
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  outputChannel = vscode.window.createOutputChannel('AlterCode');
  outputChannel.appendLine('AlterCode extension activating...');

  try {
    // Get workspace folder
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showWarningMessage('AlterCode: Please open a workspace folder');
      return;
    }

    // Load configuration
    const config = loadConfiguration(workspaceFolder.uri.fsPath);

    // Bootstrap core
    core = bootstrap(config);
    eventBus = core.getService(SERVICE_TOKENS.EventBus);

    // Initialize core
    const initResult = await core.initialize();
    if (!initResult.ok) {
      outputChannel.appendLine(`Initialization failed: ${initResult.error.message}`);
      vscode.window.showErrorMessage(`AlterCode initialization failed: ${initResult.error.message}`);
      return;
    }

    // Register commands
    registerCommands(context);

    // Register UI providers
    registerUIProviders(context);

    // Register ApprovalUI
    registerApprovalUI(context);

    // Set up event handlers
    setupEventHandlers();

    // Update status bar
    updateStatusBar(context);

    // Update quota status bar
    updateQuotaStatusBar(context);

    outputChannel.appendLine('AlterCode extension activated successfully');
    vscode.window.showInformationMessage('AlterCode is ready!');

  } catch (error) {
    outputChannel.appendLine(`Activation error: ${(error as Error).message}`);
    vscode.window.showErrorMessage(`AlterCode activation failed: ${(error as Error).message}`);
  }
}

/**
 * Extension deactivation
 */
export async function deactivate(): Promise<void> {
  outputChannel?.appendLine('AlterCode extension deactivating...');

  // Dispose ApprovalUI
  if (approvalUI) {
    approvalUI.dispose();
    approvalUI = undefined;
  }

  // Dispose quota status bar
  if (statusBarQuota) {
    statusBarQuota.dispose();
    statusBarQuota = undefined;
  }

  if (core) {
    await core.shutdown();
    core = undefined;
  }

  outputChannel?.appendLine('AlterCode extension deactivated');
  outputChannel?.dispose();
}

/**
 * Load configuration from VS Code settings
 */
function loadConfiguration(projectRoot: string): AlterCodeConfig {
  const vsConfig = vscode.workspace.getConfiguration('altercode');

  return {
    projectRoot,
    llm: {
      provider: vsConfig.get<'claude' | 'openai'>('llm.provider', 'claude'),
      apiKey: vsConfig.get<string>('llm.apiKey', ''),
      model: vsConfig.get<string>('llm.model'),
    },
    maxContextTokens: vsConfig.get<number>('maxContextTokens', 128000),
    logLevel: vsConfig.get<'debug' | 'info' | 'warn' | 'error'>('logLevel', 'info'),
  };
}

/**
 * Register commands
 */
function registerCommands(context: vscode.ExtensionContext): void {
  // Show Mission Control
  context.subscriptions.push(
    vscode.commands.registerCommand('altercode.showMissionControl', () => {
      if (core && eventBus) {
        const panel = MissionControlPanel.createOrShow(
          context.extensionUri,
          eventBus,
          core.getService(SERVICE_TOKENS.Logger)
        );
        panel.updateState(core.getState());
      }
    })
  );

  // Start new mission
  context.subscriptions.push(
    vscode.commands.registerCommand('altercode.newMission', async () => {
      if (!core) {
        vscode.window.showErrorMessage('AlterCode is not initialized');
        return;
      }

      const title = await vscode.window.showInputBox({
        prompt: 'Enter mission title',
        placeHolder: 'e.g., Add authentication feature',
      });

      if (!title) return;

      const description = await vscode.window.showInputBox({
        prompt: 'Enter mission description',
        placeHolder: 'Describe what you want to accomplish',
      });

      if (!description) return;

      const result = await core.createMission({
        title,
        description,
        priority: 'normal',
      });

      if (result.ok) {
        vscode.window.showInformationMessage(`Mission created: ${result.value.id}`);
        vscode.commands.executeCommand('altercode.showMissionControl');
      } else {
        vscode.window.showErrorMessage(`Failed to create mission: ${result.error.message}`);
      }
    })
  );

  // Quick action: Explain file
  context.subscriptions.push(
    vscode.commands.registerCommand('altercode.explainFile', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || !core) return;

      const result = await core.processMessage(
        `Explain what this file does: ${editor.document.fileName}`,
        { currentFile: toFilePath(editor.document.uri.fsPath) }
      );

      if (result.ok) {
        // Show in output channel or panel
        outputChannel?.appendLine('\n--- File Explanation ---');
        outputChannel?.appendLine(result.value.response);
        outputChannel?.show();
      }
    })
  );

  // Quick action: Find issues
  context.subscriptions.push(
    vscode.commands.registerCommand('altercode.findIssues', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || !core) return;

      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'AlterCode: Analyzing for issues...',
          cancellable: true,
        },
        async (progress, token) => {
          const result = await core!.processMessage(
            `Find potential issues and improvements in this file`,
            { currentFile: toFilePath(editor.document.uri.fsPath) }
          );

          if (result.ok) {
            outputChannel?.appendLine('\n--- Issue Analysis ---');
            outputChannel?.appendLine(result.value.response);
            outputChannel?.show();
          }
        }
      );
    })
  );

  // Quick action: Refactor selection
  context.subscriptions.push(
    vscode.commands.registerCommand('altercode.refactorSelection', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || !core) return;

      const selection = editor.selection;
      const selectedText = editor.document.getText(selection);

      if (!selectedText) {
        vscode.window.showWarningMessage('Please select code to refactor');
        return;
      }

      const result = await core.processMessage(
        `Refactor this code to be cleaner and more maintainable:\n\`\`\`\n${selectedText}\n\`\`\``,
        { currentFile: toFilePath(editor.document.uri.fsPath) }
      );

      if (result.ok && result.value.mission) {
        vscode.window.showInformationMessage(
          'Refactoring mission created. Check Mission Control for details.'
        );
        vscode.commands.executeCommand('altercode.showMissionControl');
      }
    })
  );

  // Cancel current execution
  context.subscriptions.push(
    vscode.commands.registerCommand('altercode.cancelExecution', async () => {
      if (!core) return;

      const result = await core.cancelExecution();
      if (result.ok) {
        vscode.window.showInformationMessage('Execution cancelled');
      } else {
        vscode.window.showWarningMessage(result.error.message);
      }
    })
  );

  // Open settings
  context.subscriptions.push(
    vscode.commands.registerCommand('altercode.openSettings', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'altercode');
    })
  );

  // Show output
  context.subscriptions.push(
    vscode.commands.registerCommand('altercode.showOutput', () => {
      outputChannel?.show();
    })
  );
}

/**
 * Register UI providers
 */
function registerUIProviders(context: vscode.ExtensionContext): void {
  if (!core || !eventBus) return;

  // Chat provider
  const chatProvider = new ChatProvider(
    context.extensionUri,
    core,
    eventBus,
    core.getService(SERVICE_TOKENS.Logger)
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatProvider.viewType,
      chatProvider
    )
  );
}

/**
 * Register ApprovalUI for handling approval workflows
 */
function registerApprovalUI(context: vscode.ExtensionContext): void {
  if (!core || !eventBus) return;

  try {
    const approvalService = core.getService(SERVICE_TOKENS.ApprovalService);
    const logger = core.getService(SERVICE_TOKENS.Logger);

    approvalUI = createApprovalUI(approvalService, eventBus, logger);
    context.subscriptions.push(approvalUI);

    outputChannel?.appendLine('ApprovalUI registered successfully');
  } catch (error) {
    outputChannel?.appendLine(`ApprovalUI registration skipped: ${(error as Error).message}`);
  }
}

/**
 * Set up event handlers
 */
function setupEventHandlers(): void {
  if (!eventBus) return;

  // Handle UI events
  eventBus.on('ui:cancelMission', async (event) => {
    const { missionId } = event as unknown as { missionId: string };
    if (!core) return;
    const missionManager = core.getService(SERVICE_TOKENS.MissionManager);
    await missionManager.cancel(missionId as MissionId, 'Cancelled by user');
  });

  eventBus.on('ui:executeMission', async (event) => {
    const { missionId } = event as unknown as { missionId: string };
    if (!core) return;
    const missionManager = core.getService(SERVICE_TOKENS.MissionManager);
    const mission = missionManager.get(missionId as MissionId);

    if (mission) {
      vscode.window.showInformationMessage(`Executing mission: ${mission.title}`);
      // TODO: Build and execute plan
    }
  });

  eventBus.on('ui:refresh', async () => {
    if (core) {
      const panel = MissionControlPanel.currentPanel;
      if (panel) {
        panel.updateState(core.getState());
      }
    }
  });

  // Log core events
  eventBus.on('mission:created', async (event) => {
    const { mission } = event as unknown as { mission: { title: string } };
    outputChannel?.appendLine(`Mission created: ${mission.title}`);
  });

  eventBus.on('mission:completed', async (event) => {
    const { mission } = event as unknown as { mission: { title: string } };
    outputChannel?.appendLine(`Mission completed: ${mission.title}`);
    vscode.window.showInformationMessage(`Mission completed: ${mission.title}`);
  });

  eventBus.on('mission:failed', async (event) => {
    const { mission, error } = event as unknown as { mission: { title: string }; error: string };
    outputChannel?.appendLine(`Mission failed: ${mission.title} - ${error}`);
    vscode.window.showErrorMessage(`Mission failed: ${error}`);
  });

  eventBus.on('execution:warnings', async (event) => {
    const { warnings } = event as unknown as { warnings: string[] };
    if (warnings.length > 0) {
      outputChannel?.appendLine(`Warnings: ${warnings.join(', ')}`);
    }
  });

  // Quota events
  eventBus.on('quota:warning', async (event) => {
    const { provider, usageRatio } = event as unknown as { provider: string; usageRatio: number };
    const percentage = (usageRatio * 100).toFixed(0);
    outputChannel?.appendLine(`Quota warning: ${provider} at ${percentage}%`);
    vscode.window.showWarningMessage(
      `AlterCode: ${provider} API quota at ${percentage}%. Consider slowing down.`
    );
    updateQuotaStatusBarDisplay();
  });

  eventBus.on('quota:exceeded', async (event) => {
    const { provider, timeUntilResetMs } = event as unknown as { provider: string; timeUntilResetMs: number };
    const minutesUntilReset = Math.ceil(timeUntilResetMs / 60000);
    outputChannel?.appendLine(`Quota exceeded: ${provider}. Resets in ${minutesUntilReset} minutes.`);
    vscode.window.showErrorMessage(
      `AlterCode: ${provider} API quota exceeded. Resets in ~${minutesUntilReset} minutes.`
    );
    updateQuotaStatusBarDisplay();
  });

  eventBus.on('quota:reset', async (event) => {
    const { provider } = event as unknown as { provider: string };
    outputChannel?.appendLine(`Quota reset: ${provider}`);
    vscode.window.showInformationMessage(`AlterCode: ${provider} API quota has reset.`);
    updateQuotaStatusBarDisplay();
  });

  // Approval events
  eventBus.on('approval:requested', async (event) => {
    const { approval } = event as unknown as { approval: { id: string; changes: unknown[] } };
    outputChannel?.appendLine(`Approval requested: ${approval.id} (${approval.changes.length} changes)`);
  });

  eventBus.on('approval:responded', async (event) => {
    const { approvalId, result } = event as unknown as {
      approvalId: string;
      result: { approved: boolean; action?: string };
    };
    const action = result.approved ? 'approved' : (result.action ?? 'rejected');
    outputChannel?.appendLine(`Approval ${approvalId}: ${action}`);
  });

  eventBus.on('approval:timeout', async (event) => {
    const { approvalId } = event as unknown as { approvalId: string };
    outputChannel?.appendLine(`Approval ${approvalId} timed out`);
    vscode.window.showWarningMessage('AlterCode: Approval request timed out. Changes were not applied.');
  });

  // Conflict events
  eventBus.on('conflict:detected', async (event) => {
    const { conflictId, filePath } = event as unknown as { conflictId: string; filePath: string };
    outputChannel?.appendLine(`Conflict detected in ${filePath}`);
  });

  eventBus.on('conflict:resolved', async (event) => {
    const { conflictId, strategy } = event as unknown as { conflictId: string; strategy: string };
    outputChannel?.appendLine(`Conflict ${conflictId} resolved using ${strategy} strategy`);
  });
}

/**
 * Update status bar
 */
function updateStatusBar(context: vscode.ExtensionContext): void {
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );

  statusBarItem.text = '$(hubot) AlterCode';
  statusBarItem.tooltip = 'AlterCode AI Assistant';
  statusBarItem.command = 'altercode.showMissionControl';
  statusBarItem.show();

  context.subscriptions.push(statusBarItem);

  // Update status on events
  if (eventBus) {
    eventBus.on('mission:started', async () => {
      statusBarItem.text = '$(sync~spin) AlterCode';
    });

    eventBus.on('mission:completed', async () => {
      statusBarItem.text = '$(check) AlterCode';
      setTimeout(() => {
        statusBarItem.text = '$(hubot) AlterCode';
      }, 3000);
    });

    eventBus.on('mission:failed', async () => {
      statusBarItem.text = '$(error) AlterCode';
      setTimeout(() => {
        statusBarItem.text = '$(hubot) AlterCode';
      }, 3000);
    });
  }
}

/**
 * Update quota status bar
 */
function updateQuotaStatusBar(context: vscode.ExtensionContext): void {
  statusBarQuota = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    99 // Just left of main status bar
  );

  statusBarQuota.command = 'altercode.showOutput';
  context.subscriptions.push(statusBarQuota);

  // Initial update
  updateQuotaStatusBarDisplay();

  // Update periodically
  const interval = setInterval(() => {
    updateQuotaStatusBarDisplay();
  }, 30000); // Every 30 seconds

  context.subscriptions.push({
    dispose: () => clearInterval(interval),
  });
}

/**
 * Update quota status bar display
 */
function updateQuotaStatusBarDisplay(): void {
  if (!statusBarQuota || !core) {
    return;
  }

  const state = core.getState();

  if (!state.quota) {
    statusBarQuota.hide();
    return;
  }

  const claudeStatus = state.quota.claude;
  const percentage = (claudeStatus.usageRatio * 100).toFixed(0);

  // Choose icon and color based on status
  let icon: string;
  let color: string | undefined;

  switch (claudeStatus.status) {
    case 'exceeded':
      icon = '$(error)';
      color = new vscode.ThemeColor('statusBarItem.errorBackground').toString();
      statusBarQuota.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      break;
    case 'critical':
      icon = '$(warning)';
      statusBarQuota.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      break;
    case 'warning':
      icon = '$(pulse)';
      statusBarQuota.backgroundColor = undefined;
      break;
    default:
      icon = '$(dashboard)';
      statusBarQuota.backgroundColor = undefined;
  }

  statusBarQuota.text = `${icon} ${percentage}%`;

  // Build tooltip
  const timeUntilReset = Math.ceil(claudeStatus.timeUntilResetMs / 60000);
  statusBarQuota.tooltip = `Claude API Quota: ${percentage}%\nStatus: ${claudeStatus.status}\nResets in: ~${timeUntilReset} minutes`;

  statusBarQuota.show();
}
