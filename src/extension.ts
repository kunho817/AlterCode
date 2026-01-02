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
  TaskId,
  toFilePath,
} from './types';

import { bootstrap, SERVICE_TOKENS, AlterCodeCore } from './core';
import { MissionControlPanel, ChatProvider, ApprovalUI, createApprovalUI, ConflictResolutionPanel } from './ui';

// Global state
let core: AlterCodeCore | undefined;
let eventBus: IEventBus | undefined;
let outputChannel: vscode.OutputChannel | undefined;
let approvalUI: ApprovalUI | undefined;
let statusBarMain: vscode.StatusBarItem | undefined;
let statusBarQuota: vscode.StatusBarItem | undefined;
let statusBarApprovals: vscode.StatusBarItem | undefined;
let statusBarConflicts: vscode.StatusBarItem | undefined;

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

    // Update status bars
    updateStatusBar(context);
    updateQuotaStatusBar(context);
    setupApprovalsStatusBar(context);
    setupConflictsStatusBar(context);

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

  // Dispose status bar items
  if (statusBarMain) {
    statusBarMain.dispose();
    statusBarMain = undefined;
  }
  if (statusBarQuota) {
    statusBarQuota.dispose();
    statusBarQuota = undefined;
  }
  if (statusBarApprovals) {
    statusBarApprovals.dispose();
    statusBarApprovals = undefined;
  }
  if (statusBarConflicts) {
    statusBarConflicts.dispose();
    statusBarConflicts = undefined;
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
 *
 * Reads dual-provider architecture settings:
 * - Claude (Sovereign/Overlord/Lord tiers): API key, model, mode (api/cli), CLI path
 * - GLM (Worker tier): API key, model, endpoint
 */
function loadConfiguration(projectRoot: string): AlterCodeConfig {
  const vsConfig = vscode.workspace.getConfiguration('altercode');

  // Read Claude settings (higher tiers)
  const claudeApiKey = vsConfig.get<string>('claude.apiKey', '');
  const claudeModel = vsConfig.get<string>('claude.model', 'claude-opus-4-5-20251101');
  const claudeMode = vsConfig.get<'api' | 'cli'>('claude.mode', 'api');
  const claudeCliPath = vsConfig.get<string>('claude.cliPath', 'claude');
  const claudeTimeout = vsConfig.get<number>('claude.timeout', 300000);

  // Read GLM settings (worker tier)
  const glmApiKey = vsConfig.get<string>('glm.apiKey', '');
  const glmModel = vsConfig.get<string>('glm.model', 'glm-4.7');
  const glmEndpoint = vsConfig.get<string>('glm.endpoint', 'https://api.z.ai/api/coding/paas/v4/chat/completions');

  // Read other settings
  const verificationStrictness = vsConfig.get<'strict' | 'standard' | 'lenient'>('verification.strictness', 'standard');
  const enableFallback = vsConfig.get<boolean>('llm.enableFallback', true);

  return {
    projectRoot,
    // Claude configuration for higher tiers
    claude: {
      cliPath: claudeCliPath,
      model: claudeModel.includes('opus') ? 'opus' : claudeModel.includes('sonnet') ? 'sonnet' : 'opus',
      maxOutputTokens: 16384 as any,
      timeout: claudeTimeout,
    },
    // GLM configuration for worker tier
    glm: {
      endpoint: glmEndpoint,
      apiKey: glmApiKey,
      model: glmModel,
      maxTokens: 4096 as any,
      temperature: 0.7,
    },
    // LLM routing configuration
    llm: {
      provider: 'claude',
      apiKey: claudeApiKey,
      model: claudeModel,
      claudeMode: claudeMode,
    },
    // Verification configuration
    verification: {
      enabled: true,
      strictness: verificationStrictness,
      preGeneration: true,
      postGeneration: true,
      autoFix: false,
    },
    maxContextTokens: vsConfig.get<number>('maxContextTokens', 128000),
    logLevel: vsConfig.get<'debug' | 'info' | 'warn' | 'error'>('logLevel', 'info'),
    // Fallback setting
    enableFallback,
  } as AlterCodeConfig;
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

  // Show pending approvals
  context.subscriptions.push(
    vscode.commands.registerCommand('altercode.showPendingApprovals', async () => {
      if (!core) {
        vscode.window.showErrorMessage('AlterCode is not initialized');
        return;
      }

      try {
        const approvalService = core.getService(SERVICE_TOKENS.ApprovalService);
        const pendingApprovals = approvalService.getPendingApprovals();

        if (pendingApprovals.length === 0) {
          vscode.window.showInformationMessage('No pending approvals');
          return;
        }

        // Show quick pick for pending approvals
        const items = pendingApprovals.map((approval) => ({
          label: `$(file-diff) Task: ${approval.taskId}`,
          description: `${approval.changes.length} change(s)`,
          detail: `Requested: ${approval.requestedAt.toLocaleTimeString()}`,
          approval,
        }));

        const selected = await vscode.window.showQuickPick(items, {
          title: 'Pending Approvals',
          placeHolder: 'Select an approval to review',
        });

        if (selected && approvalUI) {
          await approvalUI.showApprovalPrompt(selected.approval);
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to show approvals: ${(error as Error).message}`);
      }
    })
  );

  // Set approval mode
  context.subscriptions.push(
    vscode.commands.registerCommand('altercode.setApprovalMode', async () => {
      if (!core) {
        vscode.window.showErrorMessage('AlterCode is not initialized');
        return;
      }

      try {
        const approvalService = core.getService(SERVICE_TOKENS.ApprovalService);
        const currentMode = approvalService.getApprovalMode();

        const items = [
          {
            label: '$(check-all) Full Automation',
            description: currentMode === 'full_automation' ? '(current)' : '',
            mode: 'full_automation' as const,
          },
          {
            label: '$(checklist) Step by Step',
            description: currentMode === 'step_by_step' ? '(current)' : '',
            mode: 'step_by_step' as const,
          },
          {
            label: '$(shield) Fully Manual',
            description: currentMode === 'fully_manual' ? '(current)' : '',
            mode: 'fully_manual' as const,
          },
        ];

        const selected = await vscode.window.showQuickPick(items, {
          title: 'Set Approval Mode',
          placeHolder: `Current mode: ${currentMode}`,
        });

        if (selected) {
          approvalService.setApprovalMode(selected.mode);
          vscode.window.showInformationMessage(`Approval mode set to: ${selected.mode}`);
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to set approval mode: ${(error as Error).message}`);
      }
    })
  );

  // Show conflicts - Opens dedicated Conflict Resolution Panel
  context.subscriptions.push(
    vscode.commands.registerCommand('altercode.showConflicts', async () => {
      if (!core || !eventBus) {
        vscode.window.showErrorMessage('AlterCode is not initialized');
        return;
      }

      try {
        const mergeEngine = core.getService(SERVICE_TOKENS.MergeEngine);
        const logger = core.getService(SERVICE_TOKENS.Logger);

        // Open the Conflict Resolution Panel
        ConflictResolutionPanel.createOrShow(
          context.extensionUri,
          mergeEngine,
          eventBus,
          logger
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to show conflicts: ${(error as Error).message}`);
      }
    })
  );

  // Approve all pending
  context.subscriptions.push(
    vscode.commands.registerCommand('altercode.approveAll', async () => {
      if (!core) {
        vscode.window.showErrorMessage('AlterCode is not initialized');
        return;
      }

      try {
        const approvalService = core.getService(SERVICE_TOKENS.ApprovalService);
        const pendingApprovals = approvalService.getPendingApprovals();

        if (pendingApprovals.length === 0) {
          vscode.window.showInformationMessage('No pending approvals');
          return;
        }

        const confirm = await vscode.window.showWarningMessage(
          `Approve all ${pendingApprovals.length} pending approval(s)?`,
          { modal: true },
          'Approve All'
        );

        if (confirm === 'Approve All') {
          let approved = 0;
          for (const approval of pendingApprovals) {
            const result = await approvalService.respond(approval.id, {
              approved: true,
              action: 'approve',
            });
            if (result.ok) {
              approved++;
            }
          }
          vscode.window.showInformationMessage(`Approved ${approved} of ${pendingApprovals.length}`);
          updateApprovalsStatusBar();
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to approve all: ${(error as Error).message}`);
      }
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

  // View details handler
  eventBus.on('ui:viewDetails', async (event) => {
    const { type, id } = event as { type: string; id: string };
    outputChannel?.appendLine(`View details: ${type} ${id}`);
    // Open appropriate view based on type
    if (type === 'mission') {
      vscode.commands.executeCommand('altercode.showMissionControl');
    } else if (type === 'task') {
      vscode.commands.executeCommand('altercode.showMissionControl');
    } else if (type === 'agent') {
      vscode.commands.executeCommand('altercode.showMissionControl');
    }
  });

  // Agent control handlers (not fully implemented - agents run to completion)
  eventBus.on('ui:pauseAgent', async (event) => {
    const { agentId } = event as { agentId: string };
    outputChannel?.appendLine(`Pause agent requested: ${agentId}`);
    vscode.window.showInformationMessage('Agent pause/resume not yet implemented. Agents run to completion.');
  });

  eventBus.on('ui:resumeAgent', async (event) => {
    const { agentId } = event as { agentId: string };
    outputChannel?.appendLine(`Resume agent requested: ${agentId}`);
  });

  eventBus.on('ui:pauseAllAgents', async () => {
    outputChannel?.appendLine('Pause all agents requested');
    vscode.window.showInformationMessage('Agent pause/resume not yet implemented. Use mission pause instead.');
  });

  eventBus.on('ui:resumeAllAgents', async () => {
    outputChannel?.appendLine('Resume all agents requested');
  });

  // Pause mission
  eventBus.on('ui:pauseMission', async (event) => {
    const { missionId } = event as unknown as { missionId: string };
    if (!core) return;
    try {
      const missionManager = core.getService(SERVICE_TOKENS.MissionManager);
      await missionManager.pause(missionId as MissionId);
      vscode.window.showInformationMessage(`Mission paused: ${missionId}`);
      // Refresh UI
      const panel = MissionControlPanel.currentPanel;
      if (panel) {
        panel.updateState(core.getState());
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to pause mission: ${(error as Error).message}`);
    }
  });

  // Resume mission
  eventBus.on('ui:resumeMission', async (event) => {
    const { missionId } = event as unknown as { missionId: string };
    if (!core) return;
    try {
      const missionManager = core.getService(SERVICE_TOKENS.MissionManager);
      await missionManager.resume(missionId as MissionId);
      vscode.window.showInformationMessage(`Mission resumed: ${missionId}`);
      // Refresh UI
      const panel = MissionControlPanel.currentPanel;
      if (panel) {
        panel.updateState(core.getState());
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to resume mission: ${(error as Error).message}`);
    }
  });

  // Clear completed missions
  eventBus.on('ui:clearCompleted', async () => {
    if (!core) return;
    try {
      const missionManager = core.getService(SERVICE_TOKENS.MissionManager);
      const missions = missionManager.listAll();
      let cleared = 0;
      for (const mission of missions) {
        if (mission.status === 'completed' || mission.status === 'failed' || mission.status === 'cancelled') {
          // Remove from manager's internal tracking (archive)
          cleared++;
        }
      }
      vscode.window.showInformationMessage(`Cleared ${cleared} completed mission(s)`);
      // Refresh UI
      const panel = MissionControlPanel.currentPanel;
      if (panel) {
        panel.updateState(core.getState());
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to clear completed: ${(error as Error).message}`);
    }
  });

  // Rollback mission
  eventBus.on('ui:rollbackMission', async (event) => {
    const { missionId } = event as unknown as { missionId: string };
    if (!core) return;
    try {
      const rollbackService = core.getService(SERVICE_TOKENS.RollbackService);
      const history = rollbackService.getHistory(missionId as MissionId);

      if (history.length === 0) {
        vscode.window.showWarningMessage('No rollback points available');
        return;
      }

      // Get the latest rollback point
      const latestPoint = history[history.length - 1];

      const confirm = await vscode.window.showWarningMessage(
        `Rollback mission to point: ${latestPoint.description}?`,
        { modal: true },
        'Rollback'
      );

      if (confirm === 'Rollback') {
        const result = await rollbackService.rollback(missionId as MissionId, latestPoint.id);
        if (result.ok) {
          vscode.window.showInformationMessage(`Rolled back ${result.value.filesRestored} file(s)`);
        } else {
          vscode.window.showErrorMessage(`Rollback failed: ${result.error.message}`);
        }
        // Refresh UI
        const panel = MissionControlPanel.currentPanel;
        if (panel) {
          panel.updateState(core.getState());
        }
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to rollback: ${(error as Error).message}`);
    }
  });

  // Retry task
  eventBus.on('ui:retryTask', async (event) => {
    const { taskId } = event as unknown as { taskId: string };
    if (!core) return;
    try {
      const taskManager = core.getService(SERVICE_TOKENS.TaskManager);
      const task = taskManager.get(taskId as TaskId);

      if (!task) {
        vscode.window.showWarningMessage('Task not found');
        return;
      }

      // Reset task status and retry
      await taskManager.retry(taskId as TaskId);
      vscode.window.showInformationMessage(`Retrying task: ${task.title}`);
      // Refresh UI
      const panel = MissionControlPanel.currentPanel;
      if (panel) {
        panel.updateState(core.getState());
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to retry task: ${(error as Error).message}`);
    }
  });

  // View conflict diff
  eventBus.on('ui:viewConflictDiff', async (event) => {
    const { conflictId } = event as unknown as { conflictId: string };
    if (!core) return;
    try {
      const mergeEngine = core.getService(SERVICE_TOKENS.MergeEngine);
      const conflicts = mergeEngine.getActiveConflicts();
      const conflict = conflicts.find(c => c.id === conflictId);

      if (!conflict) {
        vscode.window.showWarningMessage('Conflict not found');
        return;
      }

      // Open the conflicting file
      const uri = vscode.Uri.file(conflict.filePath as string);
      await vscode.window.showTextDocument(uri);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to view conflict: ${(error as Error).message}`);
    }
  });

  // Resolve conflict
  eventBus.on('ui:resolveConflict', async (event) => {
    const { conflictId, strategy } = event as unknown as { conflictId: string; strategy: 'auto' | 'ai' | 'manual' };
    if (!core) return;
    try {
      const mergeEngine = core.getService(SERVICE_TOKENS.MergeEngine);
      const conflicts = mergeEngine.getActiveConflicts();
      const conflict = conflicts.find(c => c.id === conflictId);

      if (!conflict) {
        vscode.window.showWarningMessage('Conflict not found');
        return;
      }

      if (strategy === 'manual') {
        // Open file for manual editing
        const uri = vscode.Uri.file(conflict.filePath as string);
        await vscode.window.showTextDocument(uri);
        vscode.window.showInformationMessage('Resolve the conflict markers in the file, then save.');
      } else {
        // Try automatic or AI resolution
        const result = await mergeEngine.resolveConflict(conflict);

        if (result.ok) {
          await mergeEngine.applyResolution(result.value);
          vscode.window.showInformationMessage(`Conflict resolved using ${result.value.strategy} strategy`);
          updateConflictsStatusBar();
        } else {
          vscode.window.showErrorMessage(`Failed to resolve: ${result.error.message}`);
        }
      }
      // Refresh UI
      const panel = MissionControlPanel.currentPanel;
      if (panel) {
        panel.updateState(core.getState());
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to resolve conflict: ${(error as Error).message}`);
    }
  });

  // Refresh performance stats (both event names for compatibility)
  eventBus.on('ui:refreshPerformance', async () => {
    if (core) {
      const panel = MissionControlPanel.currentPanel;
      if (panel) {
        panel.updateState(core.getState());
      }
    }
  });

  eventBus.on('ui:getPerformance', async () => {
    if (core) {
      const panel = MissionControlPanel.currentPanel;
      if (panel) {
        panel.updateState(core.getState());
      }
    }
  });

  // View approval diff handler
  const handleViewApprovalDiff = async (event: unknown) => {
    const { approvalId } = event as { approvalId: string };
    if (!core || !approvalUI) return;
    try {
      const approvalService = core.getService(SERVICE_TOKENS.ApprovalService);
      const approvals = approvalService.getPendingApprovals();
      const approval = approvals.find(a => a.id === approvalId);

      if (!approval) {
        vscode.window.showWarningMessage('Approval not found');
        return;
      }

      await approvalUI.showApprovalPrompt(approval);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to view approval: ${(error as Error).message}`);
    }
  };
  // Register both event names for compatibility
  eventBus.on('ui:viewApprovalDiff', handleViewApprovalDiff);
  eventBus.on('ui:viewDiff', handleViewApprovalDiff);

  // Approve approval request handler
  const handleApproveApproval = async (event: unknown) => {
    const { approvalId } = event as { approvalId: string };
    if (!core) return;
    try {
      const approvalService = core.getService(SERVICE_TOKENS.ApprovalService);
      const result = await approvalService.respond(approvalId, {
        approved: true,
        action: 'approve',
      });

      if (result.ok) {
        vscode.window.showInformationMessage('Changes approved');
        updateApprovalsStatusBar();
      } else {
        vscode.window.showErrorMessage(`Failed to approve: ${result.error.message}`);
      }
      // Refresh UI
      const panel = MissionControlPanel.currentPanel;
      if (panel) {
        panel.updateState(core.getState());
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to approve: ${(error as Error).message}`);
    }
  };
  // Register both event names for compatibility
  eventBus.on('ui:approveApproval', handleApproveApproval);
  eventBus.on('ui:approveChange', handleApproveApproval);

  // Reject approval request handler
  const handleRejectApproval = async (event: unknown) => {
    const { approvalId } = event as { approvalId: string };
    if (!core) return;
    try {
      const approvalService = core.getService(SERVICE_TOKENS.ApprovalService);
      const result = await approvalService.respond(approvalId, {
        approved: false,
        action: 'reject',
      });

      if (result.ok) {
        vscode.window.showInformationMessage('Changes rejected');
        updateApprovalsStatusBar();
      } else {
        vscode.window.showErrorMessage(`Failed to reject: ${result.error.message}`);
      }
      // Refresh UI
      const panel = MissionControlPanel.currentPanel;
      if (panel) {
        panel.updateState(core.getState());
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to reject: ${(error as Error).message}`);
    }
  };
  // Register both event names for compatibility
  eventBus.on('ui:rejectApproval', handleRejectApproval);
  eventBus.on('ui:rejectChange', handleRejectApproval);

  // Helper to refresh panel
  const refreshPanel = () => {
    if (core) {
      const panel = MissionControlPanel.currentPanel;
      if (panel) {
        panel.updateState(core.getState());
      }
    }
  };

  // Log core events and update panel
  eventBus.on('mission:created', async (event) => {
    const { mission } = event as unknown as { mission: { title: string } };
    outputChannel?.appendLine(`Mission created: ${mission.title}`);
    refreshPanel();
  });

  eventBus.on('mission:completed', async (event) => {
    const { mission } = event as unknown as { mission: { title: string } };
    outputChannel?.appendLine(`Mission completed: ${mission.title}`);
    vscode.window.showInformationMessage(`Mission completed: ${mission.title}`);
    refreshPanel();
  });

  eventBus.on('mission:failed', async (event) => {
    const { mission, error } = event as unknown as { mission: { title: string }; error: string };
    outputChannel?.appendLine(`Mission failed: ${mission.title} - ${error}`);
    vscode.window.showErrorMessage(`Mission failed: ${error}`);
    refreshPanel();
  });

  eventBus.on('mission:phaseChanged', async () => {
    refreshPanel();
  });

  eventBus.on('mission:progressUpdated', async () => {
    refreshPanel();
  });

  eventBus.on('task:created', async () => {
    refreshPanel();
  });

  eventBus.on('task:completed', async () => {
    refreshPanel();
  });

  eventBus.on('activity:started', async () => {
    refreshPanel();
  });

  eventBus.on('activity:completed', async () => {
    refreshPanel();
  });

  eventBus.on('activity:failed', async () => {
    refreshPanel();
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

    // Check settings before showing notification
    const vsConfig = vscode.workspace.getConfiguration('altercode');
    if (vsConfig.get<boolean>('ui.notifyOnQuotaWarning', true)) {
      vscode.window.showWarningMessage(
        `AlterCode: ${provider} API quota at ${percentage}%. Consider slowing down.`
      );
    }
    updateQuotaStatusBarDisplay();
  });

  eventBus.on('quota:exceeded', async (event) => {
    const { provider, timeUntilResetMs } = event as unknown as { provider: string; timeUntilResetMs: number };
    const minutesUntilReset = Math.ceil(timeUntilResetMs / 60000);
    outputChannel?.appendLine(`Quota exceeded: ${provider}. Resets in ${minutesUntilReset} minutes.`);

    // Always show exceeded notification (critical)
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

    // Check settings before showing notification
    const vsConfig = vscode.workspace.getConfiguration('altercode');
    if (vsConfig.get<boolean>('ui.notifyOnApprovalRequired', true)) {
      vscode.window.showInformationMessage(
        `AlterCode: Approval required for ${approval.changes.length} change(s)`,
        'Review'
      ).then((selection) => {
        if (selection === 'Review') {
          vscode.commands.executeCommand('altercode.showPendingApprovals');
        }
      });
    }
    updateApprovalsStatusBar();
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
 * Update main status bar
 */
function updateStatusBar(context: vscode.ExtensionContext): void {
  statusBarMain = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );

  statusBarMain.text = '$(hubot) AlterCode';
  statusBarMain.tooltip = 'AlterCode AI Assistant - Click to open Mission Control';
  statusBarMain.command = 'altercode.showMissionControl';
  statusBarMain.show();

  context.subscriptions.push(statusBarMain);

  // Update status on events
  if (eventBus) {
    eventBus.on('mission:started', async () => {
      if (statusBarMain) {
        statusBarMain.text = '$(sync~spin) AlterCode';
      }
    });

    eventBus.on('mission:completed', async () => {
      if (statusBarMain) {
        statusBarMain.text = '$(check) AlterCode';
        setTimeout(() => {
          if (statusBarMain) {
            statusBarMain.text = '$(hubot) AlterCode';
          }
        }, 3000);
      }
    });

    eventBus.on('mission:failed', async () => {
      if (statusBarMain) {
        statusBarMain.text = '$(error) AlterCode';
        setTimeout(() => {
          if (statusBarMain) {
            statusBarMain.text = '$(hubot) AlterCode';
          }
        }, 3000);
      }
    });
  }
}

/**
 * Setup approvals status bar
 */
function setupApprovalsStatusBar(context: vscode.ExtensionContext): void {
  statusBarApprovals = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    97 // Left of quota
  );

  statusBarApprovals.command = 'altercode.showPendingApprovals';
  context.subscriptions.push(statusBarApprovals);

  // Initial update
  updateApprovalsStatusBar();

  // Update on approval events
  if (eventBus) {
    eventBus.on('approval:requested', async () => {
      updateApprovalsStatusBar();
    });

    eventBus.on('approval:responded', async () => {
      updateApprovalsStatusBar();
    });

    eventBus.on('approval:timeout', async () => {
      updateApprovalsStatusBar();
    });
  }
}

/**
 * Update approvals status bar display
 */
function updateApprovalsStatusBar(): void {
  if (!statusBarApprovals || !core) {
    return;
  }

  try {
    const approvalService = core.getService(SERVICE_TOKENS.ApprovalService);
    const pendingCount = approvalService.getPendingApprovals().length;

    if (pendingCount > 0) {
      statusBarApprovals.text = `$(bell) ${pendingCount}`;
      statusBarApprovals.tooltip = `${pendingCount} pending approval(s) - Click to review`;
      statusBarApprovals.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      statusBarApprovals.show();
    } else {
      statusBarApprovals.hide();
    }
  } catch {
    // ApprovalService not available
    statusBarApprovals.hide();
  }
}

/**
 * Setup conflicts status bar
 */
function setupConflictsStatusBar(context: vscode.ExtensionContext): void {
  statusBarConflicts = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    96 // Left of approvals
  );

  statusBarConflicts.command = 'altercode.showConflicts';
  context.subscriptions.push(statusBarConflicts);

  // Initial state - hidden
  statusBarConflicts.hide();

  // Update on conflict events
  if (eventBus) {
    eventBus.on('conflict:detected', async () => {
      updateConflictsStatusBar();
    });

    eventBus.on('conflict:resolved', async () => {
      updateConflictsStatusBar();
    });
  }
}

/**
 * Update conflicts status bar display
 */
function updateConflictsStatusBar(): void {
  if (!statusBarConflicts || !core) {
    return;
  }

  try {
    const mergeEngine = core.getService(SERVICE_TOKENS.MergeEngine);
    const conflicts = mergeEngine.getActiveConflicts();
    const conflictCount = conflicts.length;

    if (conflictCount > 0) {
      statusBarConflicts.text = `$(git-merge) ${conflictCount}`;
      statusBarConflicts.tooltip = `${conflictCount} merge conflict(s) - Click to resolve`;
      statusBarConflicts.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      statusBarConflicts.show();
    } else {
      statusBarConflicts.hide();
    }
  } catch {
    // MergeEngine not available
    statusBarConflicts.hide();
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

  // Check if quota should be shown in status bar
  const vsConfig = vscode.workspace.getConfiguration('altercode');
  if (!vsConfig.get<boolean>('ui.showQuotaInStatusBar', true)) {
    statusBarQuota.hide();
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
